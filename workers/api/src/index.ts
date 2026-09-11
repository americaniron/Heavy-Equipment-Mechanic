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
import { portalRoutes } from "./routes/portal";
import { avatarRoutes } from "./routes/avatar";
import { liveSessionRoutes } from "./routes/sessions";
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
app.get("/api/shared/:token", async (c) => {
  const token = c.req.param("token");
  const row = await selectOne(
    c.env.DB,
    "SELECT * FROM session_reports WHERE share_token = ?1 LIMIT 1",
    token,
  );
  if (!row) return jsonError(c, 404, ErrorCode.NotFound, "Shared report not found");
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

/**
 * Cron handler. Configured in wrangler.toml [triggers].crons.
 *
 * For now this is a heartbeat that enqueues a fault_code_refresh job
 * onto the JOBS queue. A future Worker (or this Worker via a queue
 * consumer binding) can pick up the job and re-seed fault_codes from
 * an updated J1939 source. The seed-fault-codes.py script is the
 * authoritative source today; the cron just makes the schedule explicit.
 */
async function scheduled(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const cron = controller.cron;
  log.info("cron_fired", { cron, scheduledTime: controller.scheduledTime });
  ctx.waitUntil(
    env.JOBS.send({ kind: "fault_code_refresh", code: "*" }).catch((e) =>
      log.error("cron_enqueue_failed", {
        cron,
        err: e instanceof Error ? e.message : String(e),
      }),
    ),
  );
}

export default {
  fetch: app.fetch.bind(app),
  scheduled,
};
