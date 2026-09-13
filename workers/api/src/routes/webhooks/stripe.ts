import { Hono } from "hono";
import type { Env, Variables } from "../../env";
import { jsonError, ErrorCode } from "../../lib/errors";
import { log } from "../../lib/log";
import { parseStripeEvent, verifyStripeWebhook } from "../../lib/stripe-verify";
import {
  applyStripeSubscriptionObject,
  upsertStripeIds,
} from "../../lib/stripe-billing";
import { selectOne } from "../../lib/d1-helpers";
import { ensureOperationalSchema } from "../../lib/ensure-schema";
import {
  claimWebhook,
  completeWebhook,
  releaseWebhook,
} from "../../lib/webhook-idempotency";

export const stripeWebhook = new Hono<{ Bindings: Env; Variables: Variables }>();

const IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 60 * 60;

function stripeCustomerId(object: Record<string, unknown>): string | null {
  if (typeof object.customer === "string") return object.customer;
  if (
    typeof (object.customer as { id?: string } | undefined)?.id === "string"
  ) {
    return (object.customer as { id: string }).id;
  }
  return null;
}

async function cacheProcessed(
  env: Env,
  cacheKey: string,
): Promise<void> {
  await env.PADDLE_EVENTS_SEEN.put(cacheKey, "1", {
    expirationTtl: IDEMPOTENCY_TTL_SECONDS,
  });
}

stripeWebhook.post("/", async (c) => {
  await ensureOperationalSchema(c.env.DB);
  const rawBody = await c.req.raw.clone().text();
  const verified = await verifyStripeWebhook(
    c.req.header("stripe-signature") ?? null,
    rawBody,
    c.env.STRIPE_WEBHOOK_SECRET,
  );
  if (!verified.ok) {
    return jsonError(
      c,
      401,
      ErrorCode.InvalidSignature,
      "Invalid Stripe webhook signature",
    );
  }

  const event = parseStripeEvent(verified.rawBody);
  if (!event) {
    return jsonError(c, 400, ErrorCode.BadRequest, "Invalid Stripe event payload");
  }

  const cacheKey = `stripe:${event.id}`;
  const seen = await c.env.PADDLE_EVENTS_SEEN.get(cacheKey);
  if (seen) {
    return c.json({ ok: true, duplicate: true });
  }

  const claim = await claimWebhook(c.env.DB, "stripe", event.id);
  if (claim.state === "duplicate") {
    await cacheProcessed(c.env, cacheKey);
    return c.json({ ok: true, duplicate: true });
  }

  const object = event.data.object;
  const requestId = c.get("requestId");

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const metadata = (object.metadata ?? {}) as Record<string, unknown>;
        const referenceId = Number(object.client_reference_id);
        const metadataId = Number(metadata.app_customer_id);
        const customerId =
          object.mode === "subscription" &&
          Number.isInteger(referenceId) &&
          referenceId > 0 &&
          metadataId === referenceId
            ? referenceId
            : null;
        const customer =
          customerId !== null
            ? await selectOne<{ id: number }>(
                c.env.DB,
                "SELECT id FROM customers WHERE id = ?1",
                customerId,
              )
            : null;
        const stripeId = stripeCustomerId(object);
        if (customer && stripeId) {
          const alreadyMapped = await selectOne<{ customer_id: number }>(
            c.env.DB,
            "SELECT customer_id FROM subscriptions WHERE stripe_customer_id = ?1 LIMIT 1",
            stripeId,
          );
          if (
            alreadyMapped?.customer_id &&
            Number(alreadyMapped.customer_id) !== customer.id
          ) {
            log.error("stripe_checkout_customer_mapping_conflict", {
              requestId,
              eventId: event.id,
              customerId: customer.id,
              mappedCustomerId: Number(alreadyMapped.customer_id),
            });
            break;
          }
          await upsertStripeIds(c.env, customer.id, {
            stripeCustomerId: stripeId,
          });
          await applyStripeSubscriptionObject(c.env, object, event.created);
        } else {
          log.warn("stripe_checkout_session_unmapped", {
            requestId,
            eventId: event.id,
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const applied = await applyStripeSubscriptionObject(
          c.env,
          object,
          event.created,
        );
        if (!applied.customerId) {
          log.warn("stripe_subscription_unmapped", {
            requestId,
            eventType: event.type,
          });
        }
        break;
      }
      case "invoice.paid": {
        const paidCustomerId = stripeCustomerId(object);
        const amountPaid = object.amount_paid;
        if (paidCustomerId) {
          const sub = await selectOne<{ customer_id: number }>(
            c.env.DB,
            "SELECT customer_id FROM subscriptions WHERE stripe_customer_id = ?1 LIMIT 1",
            paidCustomerId,
          );
          if (sub?.customer_id) {
            await c.env.DB
              .prepare(
                `INSERT INTO invoices (customer_id, stripe_invoice_id, amount, status, paid_at, description)
                 VALUES (?1, ?2, ?3, 'paid', datetime('now'), 'Stripe subscription invoice')`,
              )
              .bind(
                sub.customer_id,
                typeof object.id === "string" ? object.id : null,
                typeof amountPaid === "number"
                  ? (amountPaid / 100).toFixed(2)
                  : String(object.amount_due ?? ""),
              )
              .run()
              .catch(() => undefined);
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const failedCustomerId = stripeCustomerId(object);
        if (failedCustomerId) {
          await c.env.DB
            .prepare(
              `UPDATE subscriptions
                  SET status = 'past_due', past_due_since = unixepoch(), updated_at = unixepoch()
                WHERE stripe_customer_id = ?1`,
            )
            .bind(failedCustomerId)
            .run();
        }
        break;
      }
      default:
        log.info("stripe_webhook_ignored", { requestId, eventType: event.type });
    }

    if (claim.state === "claimed") {
      await completeWebhook(c.env.DB, "stripe", event.id, claim.token);
    }
    await cacheProcessed(c.env, cacheKey);
    return c.json({ ok: true });
  } catch (err) {
    if (claim.state === "claimed") {
      await releaseWebhook(c.env.DB, "stripe", event.id, claim.token);
    }
    log.error("stripe_webhook_failed", {
      requestId,
      eventId: event.id,
      err: err instanceof Error ? err.message : String(err),
    });
    return jsonError(c, 500, ErrorCode.Internal, "Stripe webhook processing failed");
  }
});
