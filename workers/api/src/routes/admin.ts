import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { Env, Variables } from "../env";
import { jsonError, ErrorCode } from "../lib/errors";
import { log } from "../lib/log";
import { ensureOperationalSchema } from "../lib/ensure-schema";
import { checkAndIncrement, WINDOW_MINUTE_MS } from "../lib/ratelimit";
import {
  randomHex,
  selectAll,
  selectOne,
  publicCustomer,
  type DbRow,
} from "../lib/d1-helpers";

/**
 * Admin console backend for the SPA at /admin (client/src/pages/admin-portal.tsx).
 *
 * Auth scheme: a single shared admin password compared (constant-time) against
 * env.ADMIN_PASSWORD. The client login form only submits a password (no email),
 * so this is a password-gated console, not a per-user role login. A successful
 * login mints a short-lived opaque bearer token stored server-side in the
 * SESSIONS KV namespace with a TTL. Every other /api/admin/* route requires that
 * token in the `x-admin-token` header and is rejected 401 when missing/expired.
 *
 * Fail-closed: when ADMIN_PASSWORD is unset the login returns 503 and never
 * authenticates — there is no hard-coded/backdoor password.
 */

const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60; // 8h short-lived admin session
const ADMIN_KV_PREFIX = "admin_session:";
const RECENT_VISITS_LIMIT = 10;
const VISITS_LIMIT = 500;
const CUSTOMERS_LIMIT = 500;

type AppContext = Context<{ Bindings: Env; Variables: Variables }>;

/**
 * Length-independent constant-time string comparison. Both inputs are hashed to
 * a fixed 32-byte SHA-256 digest first, so no branch (and no timing) depends on
 * the candidate's length, and the byte compare never early-returns.
 */
async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i]! ^ vb[i]!;
  return diff === 0;
}

interface AdminSessionValue {
  createdAt: number;
  exp: number;
}

async function issueAdminToken(env: Env): Promise<string> {
  const token = randomHex(32);
  const now = Date.now();
  const value: AdminSessionValue = {
    createdAt: now,
    exp: now + ADMIN_SESSION_TTL_SECONDS * 1000,
  };
  await env.SESSIONS.put(`${ADMIN_KV_PREFIX}${token}`, JSON.stringify(value), {
    expirationTtl: ADMIN_SESSION_TTL_SECONDS,
  });
  return token;
}

async function isValidAdminToken(env: Env, token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const raw = await env.SESSIONS.get(`${ADMIN_KV_PREFIX}${token}`);
  if (!raw) return false;
  try {
    const value = JSON.parse(raw) as AdminSessionValue;
    if (typeof value.exp !== "number" || value.exp <= Date.now()) {
      await env.SESSIONS.delete(`${ADMIN_KV_PREFIX}${token}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Guards every admin route except /login. Validates `x-admin-token`. */
const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const token = c.req.header("x-admin-token");
  if (!(await isValidAdminToken(c.env, token))) {
    return jsonError(c, 401, ErrorCode.Unauthenticated, "Admin authentication required");
  }
  await next();
};

/** Row shape returned by the shared visits SELECT. */
interface VisitRow {
  id: number;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  company: string | null;
  equipment_type: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  serial_number: string | null;
  problem_summary: string | null;
  fault_codes: string | null;
  visit_type: string | null;
  mechanic_type: string | null;
  status: string | null;
  language: string | null;
  created_at: string | null;
  email_verified: number;
  phone_verified: number;
  has_report: number;
}

const VISIT_SELECT = `
  SELECT
    s.id AS id,
    s.customer_name AS customer_name,
    s.customer_email AS customer_email,
    s.customer_phone AS customer_phone,
    s.company AS company,
    s.equipment_type AS equipment_type,
    s.make AS make,
    s.model AS model,
    s.year AS year,
    s.serial_number AS serial_number,
    s.problem_summary AS problem_summary,
    s.fault_codes AS fault_codes,
    s.visit_type AS visit_type,
    s.mechanic_type AS mechanic_type,
    s.status AS status,
    s.language AS language,
    s.created_at AS created_at,
    CASE WHEN EXISTS(
      SELECT 1 FROM customers cu
       WHERE cu.email_verified_at IS NOT NULL
         AND (cu.id = s.customer_id
              OR (s.customer_email IS NOT NULL AND lower(cu.email) = lower(s.customer_email)))
    ) THEN 1 ELSE 0 END AS email_verified,
    0 AS phone_verified,
    CASE WHEN EXISTS(
      SELECT 1 FROM session_reports r WHERE r.session_id = s.id
    ) THEN 1 ELSE 0 END AS has_report
  FROM sessions s
  ORDER BY datetime(s.created_at) DESC, s.id DESC
  LIMIT ?1
`;

/** Maps a DB row (snake_case) to the exact Visit shape the client renders. */
function toVisit(row: VisitRow) {
  return {
    id: Number(row.id),
    customerName: row.customer_name ?? null,
    customerEmail: row.customer_email ?? null,
    customerPhone: row.customer_phone ?? null,
    company: row.company ?? null,
    equipmentType: row.equipment_type ?? null,
    make: row.make ?? null,
    model: row.model ?? null,
    year: row.year ?? null,
    serialNumber: row.serial_number ?? null,
    problemSummary: row.problem_summary ?? null,
    faultCodes: row.fault_codes ?? null,
    visitType: row.visit_type ?? null,
    mechanicType: row.mechanic_type ?? null,
    status: row.status ?? "intake",
    language: row.language ?? null,
    createdAt: row.created_at ?? "",
    emailVerified: Number(row.email_verified) === 1,
    phoneVerified: Number(row.phone_verified) === 1,
    hasReport: Number(row.has_report) === 1,
  };
}

export const adminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/admin/login — shared-password gate; mints a short-lived KV token.
adminRoutes.post("/login", async (c) => {
  const ip = c.req.header("cf-connecting-ip") || "anon";
  const rl = await checkAndIncrement({
    env: c.env,
    userId: ip,
    scope: "admin-login",
    max: 10,
    windowMs: WINDOW_MINUTE_MS * 10,
  });
  if (!rl.ok) {
    return jsonError(c, 429, ErrorCode.RateLimited, "Too many login attempts. Try again shortly.");
  }

  const secret = c.env.ADMIN_PASSWORD;
  if (!secret) {
    log.error("admin_login_misconfigured", { reason: "ADMIN_PASSWORD unset" });
    return jsonError(
      c,
      503,
      ErrorCode.Internal,
      "Admin login is not configured",
      "Set the ADMIN_PASSWORD secret for this Worker.",
    );
  }

  const body = (await c.req.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";

  const ok = await constantTimeEquals(password, secret);
  if (!ok) {
    return jsonError(c, 401, ErrorCode.Unauthenticated, "Invalid password");
  }

  const token = await issueAdminToken(c.env);
  log.info("admin_logged_in", {});
  return c.json({ token, expiresIn: ADMIN_SESSION_TTL_SECONDS });
});

// All routes below require a valid admin token.
adminRoutes.use("*", requireAdmin);

// POST /api/admin/logout — best-effort token revocation.
adminRoutes.post("/logout", async (c) => {
  const token = c.req.header("x-admin-token");
  if (token) await c.env.SESSIONS.delete(`${ADMIN_KV_PREFIX}${token}`);
  return c.json({ ok: true });
});

// GET /api/admin/dashboard — aggregate counts + recent visits.
adminRoutes.get("/dashboard", async (c) => {
  await ensureOperationalSchema(c.env.DB);

  const stats = await selectOne<{
    total: number;
    completed: number;
    active: number;
    unique_customers: number;
  }>(
    c.env.DB,
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status <> 'completed' THEN 1 ELSE 0 END) AS active,
       COUNT(DISTINCT customer_email) AS unique_customers
     FROM sessions`,
  );

  const registered = await selectOne<{ n: number }>(
    c.env.DB,
    "SELECT COUNT(*) AS n FROM customers",
  );

  const byTypeRows = await selectAll<{ mechanic_type: string | null; n: number }>(
    c.env.DB,
    `SELECT COALESCE(mechanic_type, 'other') AS mechanic_type, COUNT(*) AS n
       FROM sessions
      GROUP BY COALESCE(mechanic_type, 'other')`,
  );
  const visitsByType: Record<string, number> = {};
  for (const row of byTypeRows) {
    visitsByType[String(row.mechanic_type)] = Number(row.n);
  }

  const recentRows = await selectAll<VisitRow>(c.env.DB, VISIT_SELECT, RECENT_VISITS_LIMIT);

  return c.json({
    totalVisits: Number(stats?.total ?? 0),
    completedVisits: Number(stats?.completed ?? 0),
    activeVisits: Number(stats?.active ?? 0),
    uniqueCustomers: Number(stats?.unique_customers ?? 0),
    registeredCustomers: Number(registered?.n ?? 0),
    visitsByType,
    recentVisits: recentRows.map(toVisit),
  });
});

// GET /api/admin/visits — full visit list (Visit[]).
adminRoutes.get("/visits", async (c) => {
  await ensureOperationalSchema(c.env.DB);
  const rows = await selectAll<VisitRow>(c.env.DB, VISIT_SELECT, VISITS_LIMIT);
  return c.json(rows.map(toVisit));
});

// GET /api/admin/visits/:id — detail view (session + messages + report).
adminRoutes.get("/visits/:id", async (c) => {
  await ensureOperationalSchema(c.env.DB);
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid visit id");
  }

  const sessionRow = await selectOne<DbRow>(
    c.env.DB,
    "SELECT * FROM sessions WHERE id = ?1 LIMIT 1",
    id,
  );
  if (!sessionRow) {
    return jsonError(c, 404, ErrorCode.NotFound, "Visit not found");
  }

  const messages = await selectAll<DbRow>(
    c.env.DB,
    `SELECT id, session_id AS sessionId, role, content,
            agent_type AS agentType, created_at AS createdAt
       FROM session_messages
      WHERE session_id = ?1
      ORDER BY datetime(created_at) ASC, id ASC`,
    id,
  );

  const reportRow = await selectOne<DbRow>(
    c.env.DB,
    `SELECT report_type AS reportType, content, svg_diagram AS svgDiagram,
            share_token AS shareToken, created_at AS createdAt
       FROM session_reports
      WHERE session_id = ?1
      ORDER BY id DESC
      LIMIT 1`,
    id,
  );

  let report: DbRow | null = reportRow;
  if (report && typeof report.content === "string") {
    try {
      report = { ...report, content: JSON.parse(report.content as string) };
    } catch {
      // leave content as the raw string when it is not JSON
    }
  }

  return c.json({
    session: sessionCamel(sessionRow),
    messages,
    report,
    visitLog: null,
  });
});

// GET /api/admin/customers — registered customer list (password hashes stripped).
adminRoutes.get("/customers", async (c) => {
  await ensureOperationalSchema(c.env.DB);
  const rows = await selectAll<DbRow>(
    c.env.DB,
    `SELECT * FROM customers ORDER BY datetime(created_at) DESC, id DESC LIMIT ?1`,
    CUSTOMERS_LIMIT,
  );
  return c.json(rows.map((row) => publicCustomer(row)));
});

/** Camel-cases the session detail row while stripping nothing sensitive. */
function sessionCamel(row: DbRow): DbRow {
  const out: DbRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase())] = value;
  }
  return out;
}
