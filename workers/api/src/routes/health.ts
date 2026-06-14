import { Hono, type Context } from "hono";
import type { Env, Variables } from "../env";

export const healthRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

function healthResponse(c: Context<{ Bindings: Env; Variables: Variables }>) {
  return c.json({
    ok: true,
    env: c.env.PADDLE_ENVIRONMENT,
    requestId: c.get("requestId"),
  });
}

healthRoutes.get("/health", healthResponse);
healthRoutes.get("/healthz", healthResponse);

/** Probes that the D1 binding is alive. Cheap (PRAGMA), zero rows. */
healthRoutes.get("/healthz/db", async (c) => {
  try {
    const r = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return c.json({ ok: r?.ok === 1 });
  } catch (e) {
    return c.json({ ok: false, err: String(e) }, 502);
  }
});
