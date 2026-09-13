import { Hono } from "hono";
import type { Env, Variables } from "./env";
import { healthRoutes } from "./routes/health";
import { clerkWebhook } from "./routes/webhooks/clerk";
import { stripeWebhook } from "./routes/webhooks/stripe";
import { partsRoutes } from "./routes/parts";
import { diagnosisRoutes } from "./routes/diagnosis";
import { troubleshootingRoutes } from "./routes/troubleshooting";
import { recommendedPartsRoutes } from "./routes/recommended-parts";
import { repairPlanRoutes } from "./routes/repair-plan";
import { equipmentRoutes } from "./routes/equipment";
import { predictiveRoutes } from "./routes/predictive";
import { faultCodesRoutes } from "./routes/fault-codes";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";
import { portalRoutes } from "./routes/portal";
import { avatarRoutes } from "./routes/avatar";
import { liveSessionRoutes } from "./routes/sessions";
import { transcribeRoutes } from "./routes/transcribe";
import { clerkAuth } from "./lib/auth-middleware";
import { jsonError, ErrorCode } from "./lib/errors";
import { log, newRequestId } from "./lib/log";
import { ensureOperationalSchema } from "./lib/ensure-schema";
import { selectOne } from "./lib/d1-helpers";

export { DiagnosticSession } from "./do/diagnostic-session";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
  const requestId = newRequestId();
  c.set("requestId", requestId);
  const started = Date.now();
  await ensureOperationalSchema(c.env.DB).catch(() => undefined);
  await next();
  log.info("request", {
    requestId,
    route: new URL(c.req.url).pathname,
    method: c.req.method,
    status: c.res.status,
    ms: Date.now() - started,
  });
});

// CORS — explicit allowlist only. Credentials-bearing browser calls must
// never receive `*` in production.
app.use("*", async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  const allowed = (c.env.WEB_ORIGIN || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : "";
  if (allowOrigin) c.header("access-control-allow-origin", allowOrigin);
  c.header("access-control-allow-headers", "authorization,content-type,x-auth-token,x-crm-api-key");
  c.header("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  c.header("access-control-allow-credentials", "true");
  c.header("vary", "origin");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});

app.route("/", healthRoutes);
app.route("/api", healthRoutes);
app.route("/api/auth", authRoutes);

// Admin console backend. Mounted BEFORE the customer clerkAuth middleware so
// admin routes use their own `x-admin-token` scheme and are never gated by (or
// dependent on) the Clerk/native customer auth on `/api/*`.
app.route("/api/admin", adminRoutes);

app.route("/api/webhooks/clerk", clerkWebhook);
app.route("/api/webhooks/stripe", stripeWebhook);
app.post("/api/webhooks/paddle", (c) =>
  jsonError(
    c,
    410,
    ErrorCode.Gone,
    "Paddle billing has been replaced by Stripe.",
    "Send events to /api/webhooks/stripe",
  ),
);

app.use("/api/*", clerkAuth);

app.route("/api/avatar", avatarRoutes);
app.route("/api/sessions", liveSessionRoutes);
app.route("/api/transcribe", transcribeRoutes);
app.get("/api/shared/:token", async (c) => {
  const token = c.req.param("token");
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) {
    return jsonError(c, 404, ErrorCode.NotFound, "Shared report not found");
  }
  const row = await selectOne<{
    id: number;
    report_type: string;
    content: string;
    svg_diagram: string | null;
    created_at: string;
  }>(
    c.env.DB,
    "SELECT id, report_type, content, svg_diagram, created_at FROM session_reports WHERE share_token = ?1 LIMIT 1",
    token,
  );
  if (!row) return jsonError(c, 404, ErrorCode.NotFound, "Shared report not found");
  c.header("cache-control", "private, no-store");
  return c.json(row);
});

app.route("/api/portal/ai/fault-codes", faultCodesRoutes);
app.route("/api/portal/ai/parts", partsRoutes);
app.route("/api/portal/ai/diagnosis", diagnosisRoutes);
app.route("/api/portal/ai/troubleshooting", troubleshootingRoutes);
app.route("/api/portal/ai/recommended-parts", recommendedPartsRoutes);
app.route("/api/portal/ai/repair-plan", repairPlanRoutes);
app.route("/api/portal/ai/predictive", predictiveRoutes);
app.route("/api/portal", portalRoutes);

app.route("/api/parts", partsRoutes);
app.route("/api/diagnosis", diagnosisRoutes);
app.route("/api/troubleshooting", troubleshootingRoutes);
app.route("/api/recommended-parts", recommendedPartsRoutes);
app.route("/api/repair-plan", repairPlanRoutes);
app.route("/api/equipment", equipmentRoutes);
app.route("/api/predictive", predictiveRoutes);
app.route("/api/fault-codes", faultCodesRoutes);

app.notFound((c) =>
  jsonError(c, 404, ErrorCode.NotFound, "Route not found"),
);

app.onError((err, c) => {
  log.error("unhandled", {
    requestId: c.get("requestId"),
    err: err instanceof Error ? err.message : String(err),
  });
  return jsonError(c, 500, ErrorCode.Internal, "Internal error");
});

export default app;
