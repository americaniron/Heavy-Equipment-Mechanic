import { Hono } from "hono";
import type { Env, Variables } from "./env";
import { healthRoutes } from "./routes/health";
import { clerkWebhook } from "./routes/webhooks/clerk";
import { paddleWebhook } from "./routes/webhooks/paddle";
import { partsRoutes } from "./routes/parts";
import { diagnosisRoutes } from "./routes/diagnosis";
import { troubleshootingRoutes } from "./routes/troubleshooting";
import { recommendedPartsRoutes } from "./routes/recommended-parts";
import { repairPlanRoutes } from "./routes/repair-plan";
import { equipmentRoutes } from "./routes/equipment";
import { predictiveRoutes } from "./routes/predictive";
import { faultCodesRoutes } from "./routes/fault-codes";
import { authRoutes } from "./routes/auth";
import { clerkAuth } from "./lib/auth-middleware";
import { jsonError, ErrorCode } from "./lib/errors";
import { log, newRequestId } from "./lib/log";

export { DiagnosticSession } from "./do/diagnostic-session";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", async (c, next) => {
  const requestId = newRequestId();
  c.set("requestId", requestId);
  const started = Date.now();
  await next();
  log.info("request", {
    requestId,
    route: new URL(c.req.url).pathname,
    method: c.req.method,
    status: c.res.status,
    ms: Date.now() - started,
  });
});

// CORS — tighten when WEB_ORIGIN is set; permissive in early staging only.
app.use("*", async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  const allowed = c.env.WEB_ORIGIN;
  // Respond with the explicit allowed origin if it matches, else echo "*"
  // for staging. Production deploy MUST set WEB_ORIGIN to a single value.
  const allowOrigin = allowed && origin === allowed ? allowed : allowed || "*";
  c.header("access-control-allow-origin", allowOrigin);
  c.header("access-control-allow-headers", "authorization,content-type");
  c.header("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  c.header("vary", "origin");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});

app.route("/", healthRoutes);
// Auth routes are public - no clerkAuth
app.route("/api/auth", authRoutes);

app.route("/api/webhooks/clerk", clerkWebhook);
app.route("/api/webhooks/paddle", paddleWebhook);

// Attach Clerk session userId to context for any subsequent /api/* routes.
// Webhook routes above this line do their own signature-based auth and
// must not run through the Bearer-JWT middleware.
app.use("/api/*", clerkAuth);

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
