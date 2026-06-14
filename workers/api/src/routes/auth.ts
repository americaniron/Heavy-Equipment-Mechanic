import { Hono, type Context } from "hono";
import type { Env, Variables } from "../env";
import { hashPassword, verifyPassword } from "../lib/password";
import { jsonError, ErrorCode } from "../lib/errors";
import { log } from "../lib/log";
import {
  createAuthSession,
  getCustomerByAuthToken,
  insertRow,
  nullIfBlank,
  publicCustomer,
  selectOne,
} from "../lib/d1-helpers";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

function tokenFromRequest(c: Context<{ Bindings: Env; Variables: Variables }>): string | null {
  const legacy = c.req.header("x-auth-token");
  if (legacy) return legacy;
  const auth = c.req.header("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

async function customerByEmail(db: D1Database, email: string) {
  return selectOne<Record<string, unknown>>(
    db,
    "SELECT * FROM customers WHERE lower(email) = lower(?1) LIMIT 1",
    email,
  );
}

function passwordResetBaseUrl(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const configured = c.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "https://fixmyiron.com";
}

async function sendPasswordResetEmail(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  email: string,
  token: string,
) {
  const resetUrl = `${passwordResetBaseUrl(c)}/reset-password?token=${encodeURIComponent(token)}`;
  const html = `<p>Use this link to reset your FixMyIron password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`;
  const text = `Use this link to reset your FixMyIron password:\n\n${resetUrl}\n\nThis link expires in 1 hour.`;

  if (c.env.EMAIL) {
    await c.env.EMAIL.send({
      from: "FixMyIron <noreply@fixmyiron.com>",
      to: email,
      subject: "Reset your FixMyIron password",
      html,
      text,
    });
    return true;
  }

  if (c.env.RESEND_API_KEY) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${c.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: c.env.RESEND_FROM_EMAIL || "FixMyIron <onboarding@resend.dev>",
        to: email,
        subject: "Reset your FixMyIron password",
        html,
        text,
      }),
    });
    return response.ok;
  }

  return false;
}

// POST /api/auth/register - create a customer account using the production schema.
authRoutes.post("/register", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();

    if (!email || !password || !firstName || !lastName) {
      return c.json(
        { error: "Email, password, first name, and last name are required" },
        400,
      );
    }
    if (password.length < 8) {
      return c.json({ error: "Password must be at least 8 characters" }, 400);
    }

    const existing = await customerByEmail(c.env.DB, email);
    if (existing) {
      return c.json({ error: "An account with this email already exists" }, 409);
    }

    const customerId = await insertRow(c.env.DB, "customers", {
      email,
      password_hash: await hashPassword(password),
      first_name: firstName,
      last_name: lastName,
      company: nullIfBlank(body.company),
      phone: nullIfBlank(body.phone),
      role: "user",
      status: "active",
    });

    if (body.equipmentType) {
      try {
        const equipName =
          [body.equipmentMake, body.equipmentModel, body.equipmentYear]
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean)
            .join(" ") || String(body.equipmentType);
        const equipmentId = await insertRow(c.env.DB, "equipment", {
          customer_id: customerId,
          name: equipName,
          type: nullIfBlank(body.equipmentType),
          make: nullIfBlank(body.equipmentMake),
          model: nullIfBlank(body.equipmentModel),
          year: nullIfBlank(body.equipmentYear),
          serial_number: nullIfBlank(body.equipmentSerial),
          smu_hours: nullIfBlank(body.equipmentSmuHours),
          notes: body.equipmentLocation ? `Location: ${String(body.equipmentLocation)}` : null,
          status: "active",
        });

        if (body.problemSummary) {
          await insertRow(c.env.DB, "service_requests", {
            customer_id: customerId,
            equipment_id: equipmentId,
            type: "diagnostic",
            status: "open",
            priority: "normal",
            description: nullIfBlank(body.problemSummary),
            fault_codes: nullIfBlank(body.faultCodes),
          });
        }
      } catch (err) {
        log.error("registration_equipment_create_failed", {
          err: err instanceof Error ? err.message : String(err),
          customerId,
        });
      }
    }

    const customer = await selectOne<Record<string, unknown>>(
      c.env.DB,
      "SELECT * FROM customers WHERE id = ?1",
      customerId,
    );
    const authToken = await createAuthSession(c.env.DB, customerId);
    const safe = publicCustomer(customer ?? {});
    return c.json({ ...safe, authToken, token: authToken, user: safe });
  } catch (e) {
    log.error("auth_register_error", { error: String(e) });
    return c.json({ error: "Registration failed", detail: String(e) }, 500);
  }
});

// POST /api/auth/login - authenticate against migrated bcrypt customer hashes.
authRoutes.post("/login", async (c) => {
  try {
    const { email, password } = await c.req.json().catch(() => ({}));
    const emailLc = String(email ?? "").trim().toLowerCase();
    const passwordText = String(password ?? "");
    if (!emailLc || !passwordText) {
      return c.json({ error: "Email and password are required" }, 400);
    }

    const customer = await customerByEmail(c.env.DB, emailLc);
    const valid =
      customer &&
      typeof customer.password_hash === "string" &&
      (await verifyPassword(passwordText, customer.password_hash));
    if (!customer || !valid) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const customerId = Number(customer.id);
    const authToken = await createAuthSession(c.env.DB, customerId);
    const safe = publicCustomer(customer);
    log.info("customer_logged_in", { customerId });
    return c.json({ ...safe, authToken, token: authToken, user: safe });
  } catch (e) {
    log.error("auth_login_error", { error: String(e) });
    return c.json({ error: "Login failed", detail: String(e) }, 500);
  }
});

// GET /api/auth/me - legacy x-auth-token and Bearer token compatible.
authRoutes.get("/me", async (c) => {
  const token = tokenFromRequest(c);
  const customer = await getCustomerByAuthToken(c.env.DB, token);
  if (!customer) {
    return jsonError(c, 401, ErrorCode.Unauthenticated, "Invalid session");
  }
  return c.json(publicCustomer(customer));
});

authRoutes.post("/logout", async (c) => {
  const token = tokenFromRequest(c);
  if (token) {
    await c.env.DB.prepare("DELETE FROM auth_sessions WHERE token = ?1").bind(token).run();
  }
  return c.json({ success: true });
});

authRoutes.post("/password-reset/request", async (c) => {
  const { email } = await c.req.json().catch(() => ({}));
  const emailLc = String(email ?? "").trim().toLowerCase();
  const neutral = {
    ok: true,
    message: "If an account exists for that email, a reset link has been sent.",
  };
  if (!emailLc) return c.json(neutral);

  const customer = await customerByEmail(c.env.DB, emailLc);
  if (customer) {
    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await c.env.DB
      .prepare(
        "INSERT INTO password_reset_tokens (token, customer_id, expires_at) VALUES (?1, ?2, ?3)",
      )
      .bind(token, Number(customer.id), expiresAt)
      .run();
    try {
      await sendPasswordResetEmail(c, emailLc, token);
    } catch (err) {
      log.error("password_reset_email_failed", {
        customerId: Number(customer.id),
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return c.json(neutral);
});

authRoutes.post("/password-reset/confirm", async (c) => {
  const { token, password } = await c.req.json().catch(() => ({}));
  const resetToken = String(token ?? "");
  const passwordText = String(password ?? "");
  if (!resetToken || passwordText.length < 8) {
    return c.json({ error: "Token and a valid new password are required" }, 400);
  }

  const row = await selectOne<{ customer_id: number; expires_at: string; used_at: string | null }>(
    c.env.DB,
    "SELECT customer_id, expires_at, used_at FROM password_reset_tokens WHERE token = ?1",
    resetToken,
  );
  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return c.json({ error: "This reset link is invalid or has expired. Request a new one." }, 400);
  }

  await c.env.DB
    .prepare("UPDATE customers SET password_hash = ?1 WHERE id = ?2")
    .bind(await hashPassword(passwordText), row.customer_id)
    .run();
  await c.env.DB
    .prepare("UPDATE password_reset_tokens SET used_at = ?1 WHERE token = ?2")
    .bind(new Date().toISOString(), resetToken)
    .run();
  await c.env.DB
    .prepare("DELETE FROM auth_sessions WHERE customer_id = ?1")
    .bind(row.customer_id)
    .run();
  return c.json({ ok: true, message: "Password updated. Please sign in with your new password." });
});
