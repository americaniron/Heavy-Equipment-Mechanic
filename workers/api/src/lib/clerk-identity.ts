import type { Env } from "../env";
import { log } from "./log";
import {
  createAuthSession,
  insertRow,
  publicCustomer,
  selectOne,
  type DbRow,
} from "./d1-helpers";
import { getClerkClient } from "./clerk-auth";
import { hashPassword, verifyPassword } from "./password";

export async function findCustomerByEmail(db: D1Database, email: string) {
  return selectOne<DbRow>(
    db,
    "SELECT * FROM customers WHERE lower(email) = lower(?1) LIMIT 1",
    email,
  );
}

export async function findCustomerByClerkId(db: D1Database, clerkUserId: string) {
  return selectOne<DbRow>(
    db,
    "SELECT * FROM customers WHERE clerk_user_id = ?1 LIMIT 1",
    clerkUserId,
  );
}

export async function syncClerkUserToCustomer(
  env: Env,
  args: {
    clerkUserId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    passwordHash?: string;
  },
): Promise<DbRow> {
  const byClerk = await findCustomerByClerkId(env.DB, args.clerkUserId);
  if (byClerk) {
    await env.DB.prepare(
      `UPDATE customers
          SET email = ?2,
              first_name = COALESCE(NULLIF(?3, ''), first_name),
              last_name = COALESCE(NULLIF(?4, ''), last_name),
              updated_at = datetime('now')
        WHERE clerk_user_id = ?1`,
    )
      .bind(args.clerkUserId, args.email, args.firstName ?? "", args.lastName ?? "")
      .run();
    return (await findCustomerByClerkId(env.DB, args.clerkUserId)) ?? byClerk;
  }

  const byEmail = await findCustomerByEmail(env.DB, args.email);
  if (byEmail) {
    await env.DB.prepare(
      `UPDATE customers
          SET clerk_user_id = ?2, updated_at = datetime('now')
        WHERE id = ?1`,
    )
      .bind(Number(byEmail.id), args.clerkUserId)
      .run();
    return { ...byEmail, clerk_user_id: args.clerkUserId };
  }

  const id = await insertRow(env.DB, "customers", {
    email: args.email,
    password_hash: args.passwordHash ?? (await hashPassword(crypto.randomUUID() + "Aa1!")),
    first_name: args.firstName || "FixMyIron",
    last_name: args.lastName || "Customer",
    role: "user",
    status: "active",
    clerk_user_id: args.clerkUserId,
  });
  const created = await selectOne<DbRow>(env.DB, "SELECT * FROM customers WHERE id = ?1", id);
  if (!created) throw new Error("customer_create_failed");
  return created;
}

export async function createClerkUser(env: Env, args: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<{ clerkUserId: string } | { skipped: true } | { error: string; code?: string }> {
  if (!env.CLERK_SECRET_KEY) return { skipped: true };
  try {
    const clerk = getClerkClient(env);
    const user = await clerk.users.createUser({
      emailAddress: [args.email],
      password: args.password,
      firstName: args.firstName,
      lastName: args.lastName,
    });
    return { clerkUserId: user.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("clerk_create_user_failed", { err: message });
    if (/already exists|taken|duplicate/i.test(message)) {
      return { error: "An account with this email already exists", code: "email_exists" };
    }
    return { error: message };
  }
}

export async function verifyClerkPassword(
  env: Env,
  clerkUserId: string,
  password: string,
): Promise<boolean> {
  if (!env.CLERK_SECRET_KEY) return false;
  try {
    const clerk = getClerkClient(env);
    const result = await clerk.users.verifyPassword({
      userId: clerkUserId,
      password,
    });
    return Boolean(result?.verified ?? result);
  } catch (err) {
    log.warn("clerk_verify_password_failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function authenticateCustomer(
  env: Env,
  email: string,
  password: string,
): Promise<{ customer: DbRow; token: string } | { error: string; status: number; needsVerification?: boolean }> {
  const customer = await findCustomerByEmail(env.DB, email);
  if (!customer) return { error: "Invalid email or password", status: 401 };

  const status = String(customer.status ?? "active");
  if (status === "pending_verification") {
    return {
      error: "Email verification required. Check your inbox for a 6-digit code.",
      status: 403,
      needsVerification: true,
    };
  }
  if (status === "disabled" || status === "deleted") {
    return { error: "This account is no longer active.", status: 403 };
  }

  const localOk =
    typeof customer.password_hash === "string" &&
    (await verifyPassword(password, customer.password_hash));
  const clerkOk =
    typeof customer.clerk_user_id === "string" &&
    customer.clerk_user_id.length > 0 &&
    (await verifyClerkPassword(env, customer.clerk_user_id, password));

  if (!localOk && !clerkOk) return { error: "Invalid email or password", status: 401 };

  const token = await createAuthSession(env.DB, Number(customer.id));
  return { customer, token };
}

export function customerResponse(customer: DbRow, token?: string) {
  const safe = publicCustomer(customer);
  return token ? { ...safe, authToken: token, token, user: safe } : safe;
}
