import { Hono } from "hono";
import type { Env, Variables } from "../../env";
import { hashPassword, verifyPassword } from "../../lib/password";
import { createjwt, verifyjwt } from "../../lib/jwt";
import { jsonError, ErrorCode } from "../../lib/errors";
import { log } from "../../lib/log";

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/auth/register - create new user account
authRoutes.post("/register", async (c) => {
  const { email, password, firstName, lastName, company } = await c.req.json().catch(() => ({}));

  if (!email || !password || !firstName || !lastName) {
    return jsonError(c, 400, ErrorCode.ValidationError, "Missing required fields");
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM local_users WHERE email = ?1"
  ).bind(email.toLowerCase()).first();

  if (existing) {
    return jsonError(c, 400, ErrorCode.ValidationError, "Email already registered");
  }

  const hashedPassword = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  const userId = crypto.randomUUID();

  const result = await c.env.DB.prepare(
    `INSERT INTO local_users (id, email, password_hash, first_name, last_name, company, tier, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'free', ?7, ?7)`
  ).bind(
    userId,
    email.toLowerCase(),
    hashedPassword,
    firstName,
    lastName,
    company || null,
    now,
    now
  ).run();

  if (!result.success) {
    log.error("auth_register_failed", { email, error: result.error });
    return jsonError(c, 500, ErrorCode.InternalError, "Failed to create account");
  }

  const user = await c.env.DB.prepare(
    "SELECT id, email, first_name, last_name, company, tier FROM local_users WHERE email = ?1"
  ).bind(email.toLowerCase()).first();

  const token = await createjwt({ userId: user?.id, email }, c.env);

  log.info("user_registered", { userId: user?.id, email });

  return c.json({
    token,
    user: {
      id: user?.id,
      email: user?.email,
      firstName: user?.first_name,
      lastName: user?.last_name,
      company: user?.company,
      tier: user?.tier
    }
  });
});

// POST /api/auth/login - authenticate user
authRoutes.post("/login", async (c) => {
  const { email, password } = await c.req.json().catch(() => ({}));

  if (!email || !password) {
    return jsonError(c, 400, ErrorCode.ValidationError, "Missing email or password");
  }

  const user = await c.env.DB.prepare(
    "SELECT id, email, password_hash, first_name, last_name, company, tier FROM local_users WHERE email = ?1"
  ).bind(email.toLowerCase()).first();

  if (!user) {
    return jsonError(c, 401, ErrorCode.Unauthenticated, "Invalid credentials");
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return jsonError(c, 401, ErrorCode.Unauthenticated, "Invalid credentials");
  }

  const token = await createjwt({ userId: user.id, email: user.email }, c.env);

  log.info("user_logged_in", { userId: user.id });

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      company: user.company,
      tier: user.tier
    }
  });
});

// GET /api/auth/me - get current user (requires auth header)
authRoutes.get("/me", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError(c, 401, ErrorCode.Unauthenticated, "Missing token");
  }

  const token = authHeader.slice(7);
  const payload = await verifyjwt(token, c.env);
  if (!payload) {
    return jsonError(c, 401, ErrorCode.Unauthenticated, "Invalid token");
  }

  const user = await c.env.DB.prepare(
    "SELECT id, email, first_name, last_name, company, tier FROM local_users WHERE id = ?1"
  ).bind(payload.userId).first();

  if (!user) {
    return jsonError(c, 401, ErrorCode.Unauthenticated, "User not found");
  }

  return c.json({
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    company: user.company,
    tier: user.tier
  });
});