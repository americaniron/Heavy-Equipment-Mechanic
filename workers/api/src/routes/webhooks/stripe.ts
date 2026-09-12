import { Hono } from "hono";
import type { Env, Variables } from "../../env";
import { jsonError, ErrorCode } from "../../lib/errors";
import { log } from "../../lib/log";
import { parseStripeEvent, verifyStripeWebhook } from "../../lib/stripe-verify";
import { applyStripeSubscriptionObject, upsertStripeIds } from "../../lib/stripe-billing";
import { selectOne } from "../../lib/d1-helpers";
import { ensureOperationalSchema } from "../../lib/ensure-schema";

export const stripeWebhook = new Hono<{ Bindings: Env; Variables: Variables }>();

const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

stripeWebhook.post("/", async (c) => {
  await ensureOperationalSchema(c.env.DB);
  const rawBody = await c.req.raw.clone().text();
  const verified = await verifyStripeWebhook(
    c.req.header("stripe-signature") ?? null,
    rawBody,
    c.env.STRIPE_WEBHOOK_SECRET,
  );
  if (!verified.ok) {
    return jsonError(c, 401, ErrorCode.InvalidSignature, "Invalid Stripe webhook signature");
  }

  const event = parseStripeEvent(verified.rawBody);
  if (!event) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid Stripe event payload");
  }

  const seen = await c.env.PADDLE_EVENTS_SEEN.get(`stripe:${event.id}`);
  if (seen) {
    return c.json({ ok: true, duplicate: true });
  }

  try {
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO processed_webhooks (id, source) VALUES (?1, 'stripe')",
    )
      .bind(event.id)
      .run();
  } catch {
    /* table may not exist yet; KV idempotency still applies */
  }

  const object = event.data.object;
  const requestId = c.get("requestId");

  switch (event.type) {
    case "checkout.session.completed": {
      const customerId = Number(object.client_reference_id ?? (object.metadata as { app_customer_id?: string } | undefined)?.app_customer_id);
      const stripeCustomerId = typeof object.customer === "string" ? object.customer : null;
      const stripeSubscriptionId = typeof object.subscription === "string" ? object.subscription : null;
      if (Number.isInteger(customerId) && customerId > 0) {
        await upsertStripeIds(c.env, customerId, {
          stripeCustomerId: stripeCustomerId ?? undefined,
          stripeSubscriptionId: stripeSubscriptionId ?? undefined,
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      const applied = await applyStripeSubscriptionObject(c.env, object);
      if (!applied.customerId) {
        log.warn("stripe_subscription_unmapped", { requestId, eventType: event.type });
      }
      break;
    }
    case "invoice.paid": {
      const stripeCustomerId = typeof object.customer === "string" ? object.customer : null;
      const amountPaid = object.amount_paid;
      if (stripeCustomerId) {
        const sub = await selectOne<{ customer_id: number }>(
          c.env.DB,
          "SELECT customer_id FROM subscriptions WHERE stripe_customer_id = ?1 LIMIT 1",
          stripeCustomerId,
        );
        if (sub?.customer_id) {
          await c.env.DB.prepare(
            `INSERT INTO invoices (customer_id, stripe_invoice_id, amount, status, paid_at, description)
             VALUES (?1, ?2, ?3, 'paid', datetime('now'), 'Stripe subscription invoice')`,
          )
            .bind(
              sub.customer_id,
              typeof object.id === "string" ? object.id : null,
              typeof amountPaid === "number" ? (amountPaid / 100).toFixed(2) : String(object.amount_due ?? ""),
            )
            .run()
            .catch(() => undefined);
        }
      }
      break;
    }
    case "invoice.payment_failed": {
      const stripeCustomerId = typeof object.customer === "string" ? object.customer : null;
      if (stripeCustomerId) {
        await c.env.DB.prepare(
          `UPDATE subscriptions
              SET status = 'past_due', past_due_since = unixepoch(), updated_at = unixepoch()
            WHERE stripe_customer_id = ?1`,
        )
          .bind(stripeCustomerId)
          .run();
      }
      break;
    }
    default:
      log.info("stripe_webhook_ignored", { requestId, eventType: event.type });
  }

  await c.env.PADDLE_EVENTS_SEEN.put(`stripe:${event.id}`, "1", {
    expirationTtl: IDEMPOTENCY_TTL_SECONDS,
  });
  return c.json({ ok: true });
});
