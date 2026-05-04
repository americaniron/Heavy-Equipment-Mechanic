import { Hono } from "hono";
import type {
  Env,
  Variables,
  Tier,
  SubscriptionStatus,
} from "../../env";
import { verifyPaddleWebhook } from "../../lib/paddle-verify";
import { jsonError, ErrorCode } from "../../lib/errors";
import { log } from "../../lib/log";

export const paddleWebhook = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

interface PaddleEventEnvelope {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

interface PaddleSubscriptionData {
  id: string;
  customer_id: string;
  status: string;
  custom_data?: { user_id?: string } | null;
  current_billing_period?: { ends_at?: string } | null;
  items?: Array<{ price?: { id?: string } | null }>;
}

interface PaddleTransactionData {
  id: string;
  customer_id: string;
  subscription_id?: string | null;
  status: string;
  custom_data?: { user_id?: string } | null;
}

function tierForPriceId(env: Env, priceId: string | undefined): Tier {
  if (!priceId) return "free";
  if (priceId === env.PADDLE_PRICE_PRO) return "pro";
  if (priceId === env.PADDLE_PRICE_SHOP) return "shop";
  return "free";
}

const SUB_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  paused: "paused",
  canceled: "canceled",
};

function normalizeStatus(s: string): SubscriptionStatus {
  return SUB_STATUS_MAP[s] ?? "canceled";
}

function isoToUnix(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/**
 * Resolve the user_id we keyed on at checkout. The Paddle.js overlay must
 * pass `customData: { user_id: <clerk_user_id> }` so we can map Paddle's
 * customer back to a Clerk user. If absent, fall back to looking up by
 * paddle_customer_id (for renewals after customer_id is already known).
 */
async function resolveUserId(
  db: D1Database,
  customData: { user_id?: string } | null | undefined,
  paddleCustomerId: string,
): Promise<string | null> {
  if (customData?.user_id) return customData.user_id;
  const row = await db
    .prepare(
      "SELECT user_id FROM subscriptions WHERE paddle_customer_id = ?1 LIMIT 1",
    )
    .bind(paddleCustomerId)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

async function applySubscription(
  env: Env,
  data: PaddleSubscriptionData,
  fallbackTier: Tier | null,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const userId = await resolveUserId(
    env.DB,
    data.custom_data,
    data.customer_id,
  );
  if (!userId) {
    return { ok: false, reason: "user_id_unresolvable" };
  }
  const status = normalizeStatus(data.status);
  const priceId = data.items?.[0]?.price?.id;
  const tier = priceId ? tierForPriceId(env, priceId) : fallbackTier ?? "free";
  const periodEnd = isoToUnix(data.current_billing_period?.ends_at ?? null);
  const pastDueSince =
    status === "past_due" ? Math.floor(Date.now() / 1000) : null;

  // Upsert subscriptions row.
  await env.DB.prepare(
    `INSERT INTO subscriptions (
       user_id, paddle_customer_id, paddle_subscription_id, paddle_price_id,
       tier, status, current_period_end, past_due_since, updated_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, unixepoch())
     ON CONFLICT(user_id) DO UPDATE SET
       paddle_customer_id = excluded.paddle_customer_id,
       paddle_subscription_id = excluded.paddle_subscription_id,
       paddle_price_id = excluded.paddle_price_id,
       tier = excluded.tier,
       status = excluded.status,
       current_period_end = excluded.current_period_end,
       past_due_since = CASE
         WHEN excluded.status = 'past_due' AND subscriptions.status != 'past_due'
           THEN excluded.past_due_since
         WHEN excluded.status != 'past_due' THEN NULL
         ELSE subscriptions.past_due_since
       END,
       updated_at = unixepoch()`,
  )
    .bind(
      userId,
      data.customer_id,
      data.id,
      priceId ?? null,
      tier,
      status,
      periodEnd,
      pastDueSince,
    )
    .run();

  // Mirror tier onto users for reads that don't need full sub state.
  // Tier is 'free' on terminal/inactive statuses (canceled/paused) so the
  // duplicate stays consistent with effectiveTier()'s rules.
  const effectiveUserTier: Tier =
    status === "active" || status === "trialing" || status === "past_due"
      ? tier
      : "free";
  await env.DB.prepare(
    "UPDATE users SET tier = ?1, updated_at = unixepoch() WHERE clerk_user_id = ?2",
  )
    .bind(effectiveUserTier, userId)
    .run();

  return { ok: true };
}

async function applyTransaction(
  env: Env,
  data: PaddleTransactionData,
  failed: boolean,
): Promise<void> {
  const userId = await resolveUserId(
    env.DB,
    data.custom_data,
    data.customer_id,
  );
  if (!userId) return;
  if (failed) {
    // Mark past_due so the 3-day grace clock starts. Subscription.updated will
    // typically follow; this is a defensive update in case it doesn't.
    await env.DB.prepare(
      `UPDATE subscriptions
         SET status = 'past_due',
             past_due_since = COALESCE(past_due_since, unixepoch()),
             updated_at = unixepoch()
         WHERE user_id = ?1`,
    )
      .bind(userId)
      .run();
  }
  // No-op for completed transactions beyond what subscription.updated handles.
}

paddleWebhook.post("/", async (c) => {
  // Read raw body BEFORE any parsing — HMAC operates on the byte-exact body.
  const rawBody = await c.req.raw.clone().text();
  const sigHeader = c.req.header("paddle-signature") ?? null;

  const verified = await verifyPaddleWebhook({
    signatureHeader: sigHeader,
    rawBody,
    secret: c.env.PADDLE_WEBHOOK_SECRET,
  });
  if (!verified.ok) {
    log.warn("paddle_webhook_rejected", {
      requestId: c.get("requestId"),
      reason: verified.reason,
    });
    return jsonError(
      c,
      401,
      ErrorCode.InvalidSignature,
      `Paddle signature verification failed: ${verified.reason}`,
    );
  }

  let event: PaddleEventEnvelope;
  try {
    event = JSON.parse(rawBody) as PaddleEventEnvelope;
  } catch {
    return jsonError(c, 400, ErrorCode.BadRequest, "Body is not valid JSON");
  }
  if (!event.event_id || !event.event_type) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Missing event_id or event_type");
  }

  // Idempotency. If we've already processed this event, ack immediately.
  const seen = await c.env.PADDLE_EVENTS_SEEN.get(event.event_id);
  if (seen) {
    log.info("paddle_webhook_duplicate", {
      requestId: c.get("requestId"),
      eventId: event.event_id,
      eventType: event.event_type,
    });
    return c.json({ ok: true, duplicate: true });
  }

  // Dispatch.
  let result: { ok: true } | { ok: false; reason: string } = { ok: true };
  switch (event.event_type) {
    case "subscription.created":
    case "subscription.updated":
    case "subscription.resumed": {
      result = await applySubscription(
        c.env,
        event.data as unknown as PaddleSubscriptionData,
        null,
      );
      break;
    }
    case "subscription.paused": {
      const data = event.data as unknown as PaddleSubscriptionData;
      // Force status to paused regardless of the data.status echo.
      result = await applySubscription(
        c.env,
        { ...data, status: "paused" },
        null,
      );
      break;
    }
    case "subscription.canceled": {
      const data = event.data as unknown as PaddleSubscriptionData;
      result = await applySubscription(
        c.env,
        { ...data, status: "canceled" },
        null,
      );
      break;
    }
    case "transaction.completed": {
      await applyTransaction(
        c.env,
        event.data as unknown as PaddleTransactionData,
        false,
      );
      break;
    }
    case "transaction.payment_failed": {
      await applyTransaction(
        c.env,
        event.data as unknown as PaddleTransactionData,
        true,
      );
      break;
    }
    default:
      log.info("paddle_webhook_ignored", {
        requestId: c.get("requestId"),
        eventType: event.event_type,
      });
  }

  if (!result.ok) {
    // Don't write to KV — let Paddle retry so we get another shot at
    // resolving the user.
    log.error("paddle_webhook_apply_failed", {
      requestId: c.get("requestId"),
      eventId: event.event_id,
      eventType: event.event_type,
      err: result.reason,
    });
    return jsonError(
      c,
      500,
      ErrorCode.Internal,
      `Failed to apply event: ${result.reason}`,
    );
  }

  // Mark processed AFTER successful apply.
  await c.env.PADDLE_EVENTS_SEEN.put(event.event_id, "1", {
    expirationTtl: IDEMPOTENCY_TTL_SECONDS,
  });

  log.info("paddle_webhook_applied", {
    requestId: c.get("requestId"),
    eventId: event.event_id,
    eventType: event.event_type,
  });
  return c.json({ ok: true });
});
