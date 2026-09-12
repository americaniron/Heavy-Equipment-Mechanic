import type { MiddlewareHandler } from "hono";
import type { Env, Variables } from "../env";
import { getClerkClient, verifyClerkJwt } from "./clerk-auth";
import { jsonError, ErrorCode } from "./errors";
import { getCustomerByAuthToken } from "./d1-helpers";
import { syncClerkUserToCustomer } from "./clerk-identity";

/**
 * Attaches `userId` to the Hono context if the request carries a valid
 * Clerk session JWT. Use as a global middleware before requireTier().
 *
 * This middleware is *non-fatal*: if no token or token is invalid, it
 * simply doesn't set userId. requireTier() returns 401 if userId is
 * missing — this lets us mount the same auth middleware on routes that
 * are public OR gated and decide per-route.
 */
export const clerkAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> = async (c, next) => {
  const legacyToken = c.req.header("x-auth-token");
  if (legacyToken) {
    const customer = await getCustomerByAuthToken(c.env.DB, legacyToken);
    if (customer) {
      const customerId = Number(customer.id);
      c.set("customerId", customerId);
      c.set("userId", String(customerId));
      if (typeof customer.email === "string") c.set("userEmail", customer.email);
    }
    await next();
    return;
  }

  const auth = c.req.header("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const customer = await getCustomerByAuthToken(c.env.DB, token);
    if (customer) {
      const customerId = Number(customer.id);
      c.set("customerId", customerId);
      c.set("userId", String(customerId));
      if (typeof customer.email === "string") c.set("userEmail", customer.email);
      await next();
      return;
    }

    const result = await verifyClerkJwt(auth, c.env);
    if (result) {
      try {
        const clerk = getClerkClient(c.env);
        const user = await clerk.users.getUser(result.userId);
        const email =
          user.primaryEmailAddress?.emailAddress ??
          user.emailAddresses[0]?.emailAddress;
        if (email) {
          const customer = await syncClerkUserToCustomer(c.env, {
            clerkUserId: result.userId,
            email,
            firstName: user.firstName ?? undefined,
            lastName: user.lastName ?? undefined,
          });
          const customerId = Number(customer.id);
          c.set("customerId", customerId);
          c.set("userId", String(customerId));
          c.set("userEmail", email);
        }
      } catch {
        c.set("userId", result.userId);
      }
    }
  }
  await next();
};

/** Hard auth gate. Use on routes that *require* a signed-in user. */
export const requireAuth: MiddlewareHandler<{
  Bindings: Env;
  Variables: Variables;
}> = async (c, next) => {
  if (!c.get("userId")) {
    return jsonError(c, 401, ErrorCode.Unauthenticated, "Sign in required");
  }
  await next();
};
