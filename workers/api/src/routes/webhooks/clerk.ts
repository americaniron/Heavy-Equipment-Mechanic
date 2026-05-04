import { Hono } from "hono";
import type { Env, Variables } from "../../env";
import { verifyClerkWebhook } from "../../lib/clerk-verify";
import { jsonError, ErrorCode } from "../../lib/errors";
import { log } from "../../lib/log";

export const clerkWebhook = new Hono<{ Bindings: Env; Variables: Variables }>();

interface ClerkUserData {
  id: string;
  email_addresses?: Array<{
    id: string;
    email_address: string;
  }>;
  primary_email_address_id?: string | null;
}

function primaryEmail(data: ClerkUserData): string | null {
  const list = data.email_addresses ?? [];
  if (list.length === 0) return null;
  const primary = list.find((e) => e.id === data.primary_email_address_id);
  return (primary ?? list[0])?.email_address ?? null;
}

clerkWebhook.post("/", async (c) => {
  // verifyClerkWebhook reads request.text() — must use a fresh Request clone
  // because Hono may have already touched the body. Cast away the
  // CfProperties extension; the verifier only reads headers and body.
  const event = await verifyClerkWebhook(
    c.req.raw.clone() as unknown as Request,
    c.env,
  );
  if (!event) {
    return jsonError(
      c,
      401,
      ErrorCode.InvalidSignature,
      "Invalid or missing Svix signature",
    );
  }

  const data = event.data as unknown as ClerkUserData;
  const requestId = c.get("requestId");

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const email = primaryEmail(data);
      if (!email) {
        log.warn("clerk_webhook_no_email", { requestId, eventType: event.type });
        return c.json({ ok: true, skipped: "no_primary_email" });
      }
      // Insert with default tier='free' on first sight; keep tier on update
      // (tier is owned by the Paddle webhook, not Clerk).
      await c.env.DB.prepare(
        `INSERT INTO users (clerk_user_id, email, tier, created_at, updated_at)
         VALUES (?1, ?2, 'free', unixepoch(), unixepoch())
         ON CONFLICT(clerk_user_id) DO UPDATE SET
           email = excluded.email,
           updated_at = unixepoch()`,
      )
        .bind(data.id, email)
        .run();
      log.info("clerk_user_synced", {
        requestId,
        eventType: event.type,
        userId: data.id,
      });
      return c.json({ ok: true });
    }
    case "user.deleted": {
      // Hard delete cascades to subscriptions, equipment, sessions.
      await c.env.DB.prepare("DELETE FROM users WHERE clerk_user_id = ?1")
        .bind(data.id)
        .run();
      log.info("clerk_user_deleted", { requestId, userId: data.id });
      return c.json({ ok: true });
    }
    default:
      // Ignore other event types (session.*, organization.*, etc.) for now.
      log.info("clerk_webhook_ignored", { requestId, eventType: event.type });
      return c.json({ ok: true, ignored: event.type });
  }
});
