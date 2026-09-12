import type { Env, Tier } from "../env";
import { log } from "./log";
import { selectOne, type DbRow } from "./d1-helpers";

const STRIPE_API = "https://api.stripe.com/v1";

/**
 * Pin every REST call to a fixed, supported Stripe API version so response
 * shapes stay deterministic regardless of the account's Workbench default
 * (which an owner could bump at any time). Without this header Stripe uses
 * the account default, which risks silent breakage of our parsing.
 * https://docs.stripe.com/api/versioning
 */
const STRIPE_API_VERSION = "2025-06-30.basil";

export function stripeMode(env: Env): "test" | "live" | "unset" {
  const key = env.STRIPE_SECRET_KEY ?? "";
  if (key.startsWith("sk_live") || key.startsWith("rk_live")) return "live";
  if (key.startsWith("sk_test") || key.startsWith("rk_test")) return "test";
  return "unset";
}

export function priceIdForTier(env: Env, tier: "pro" | "shop"): string | undefined {
  return tier === "shop" ? env.STRIPE_PRICE_SHOP : env.STRIPE_PRICE_PRO;
}

export function tierForStripePrice(env: Env, priceId: string | undefined): Tier {
  if (!priceId) return "free";
  if (priceId === env.STRIPE_PRICE_SHOP) return "shop";
  if (priceId === env.STRIPE_PRICE_PRO) return "pro";
  return "free";
}

export function mapStripeStatus(
  status: string | undefined,
): "active" | "trialing" | "past_due" | "paused" | "canceled" {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "paused":
      return status;
    case "incomplete":
    case "incomplete_expired":
    case "unpaid":
      return "past_due";
    default:
      return "canceled";
  }
}

async function stripeForm(
  env: Env,
  method: "POST" | "GET",
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  if (!env.STRIPE_SECRET_KEY) {
    return { ok: false, status: 503, json: { error: { message: "STRIPE_SECRET_KEY is not configured" } } };
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    "stripe-version": STRIPE_API_VERSION,
  };
  let url = `${STRIPE_API}${path}`;
  let body: string | undefined;
  if (method === "GET") {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined) qs.set(k, String(v));
    }
    const encoded = qs.toString();
    if (encoded) url += `?${encoded}`;
  } else {
    headers["content-type"] = "application/x-www-form-urlencoded";
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined) qs.set(k, String(v));
    }
    body = qs.toString();
  }
  const res = await fetch(url, { method, headers, body });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

export async function findOrCreateStripeCustomer(
  env: Env,
  customer: DbRow,
): Promise<string | null> {
  const existing = await selectOne<{ stripe_customer_id: string | null }>(
    env.DB,
    "SELECT stripe_customer_id FROM subscriptions WHERE customer_id = ?1 LIMIT 1",
    Number(customer.id),
  );
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const email = String(customer.email ?? "");
  if (email) {
    const search = await stripeForm(env, "GET", "/customers", { email, limit: 1 });
    const data = Array.isArray(search.json.data) ? (search.json.data as Array<{ id: string }>) : [];
    if (search.ok && data[0]?.id) {
      await upsertStripeIds(env, Number(customer.id), { stripeCustomerId: data[0].id });
      return data[0].id;
    }
  }

  const created = await stripeForm(env, "POST", "/customers", {
    email,
    name: `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() || undefined,
    "metadata[app_customer_id]": String(customer.id),
    "metadata[clerk_user_id]": customer.clerk_user_id ? String(customer.clerk_user_id) : undefined,
  });
  const id = typeof created.json.id === "string" ? created.json.id : null;
  if (!created.ok || !id) {
    log.error("stripe_customer_create_failed", { status: created.status });
    return null;
  }
  await upsertStripeIds(env, Number(customer.id), { stripeCustomerId: id });
  return id;
}

export async function createCheckoutSession(
  env: Env,
  args: {
    customer: DbRow;
    targetTier: "pro" | "shop";
    successUrl: string;
    cancelUrl: string;
  },
): Promise<{ url: string; id: string } | { error: string; status: number }> {
  const price = priceIdForTier(env, args.targetTier);
  if (!price) {
    return {
      error:
        "Stripe price IDs are not configured. Set STRIPE_PRICE_PRO and STRIPE_PRICE_SHOP via wrangler secret put.",
      status: 503,
    };
  }
  if (stripeMode(env) === "unset") {
    return { error: "STRIPE_SECRET_KEY is not configured.", status: 503 };
  }
  const stripeCustomerId = await findOrCreateStripeCustomer(env, args.customer);
  if (!stripeCustomerId) {
    return { error: "Unable to create a Stripe customer for this account.", status: 502 };
  }

  const created = await stripeForm(env, "POST", "/checkout/sessions", {
    mode: "subscription",
    customer: stripeCustomerId,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    client_reference_id: String(args.customer.id),
    "line_items[0][price]": price,
    "line_items[0][quantity]": 1,
    "subscription_data[metadata][app_customer_id]": String(args.customer.id),
    "metadata[app_customer_id]": String(args.customer.id),
    "metadata[target_tier]": args.targetTier,
  });
  const url = typeof created.json.url === "string" ? created.json.url : null;
  const id = typeof created.json.id === "string" ? created.json.id : null;
  if (!created.ok || !url || !id) {
    const message =
      typeof (created.json.error as { message?: string } | undefined)?.message === "string"
        ? (created.json.error as { message: string }).message
        : "Stripe Checkout could not be created.";
    log.error("stripe_checkout_failed", { status: created.status, err: message });
    return { error: message, status: 502 };
  }
  return { url, id };
}

export async function createCustomerPortalSession(
  env: Env,
  stripeCustomerId: string,
  returnUrl: string,
): Promise<{ url: string } | { error: string; status: number }> {
  const created = await stripeForm(env, "POST", "/billing_portal/sessions", {
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  const url = typeof created.json.url === "string" ? created.json.url : null;
  if (!created.ok || !url) {
    return { error: "Unable to open the Stripe customer portal.", status: 502 };
  }
  return { url };
}

async function firstSubscriptionRow(
  db: D1Database,
  sql: string,
  value: string | number,
): Promise<DbRow | null> {
  try {
    return await selectOne<DbRow>(db, sql, value);
  } catch {
    return null;
  }
}

export async function upsertStripeIds(
  env: Env,
  customerId: number,
  patch: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
    tier?: Tier;
    status?: string;
    currentPeriodEnd?: number | null;
    pastDueSince?: number | null;
  },
): Promise<void> {
  const customer = await selectOne<{ clerk_user_id: string | null }>(
    env.DB,
    "SELECT clerk_user_id FROM customers WHERE id = ?1",
    customerId,
  );
  const clerkId = customer?.clerk_user_id ?? null;
  const userKey = clerkId || `customer:${customerId}`;
  const now = Math.floor(Date.now() / 1000);

  const existing =
    (await firstSubscriptionRow(
      env.DB,
      "SELECT * FROM subscriptions WHERE customer_id = ?1 LIMIT 1",
      customerId,
    )) ||
    (await firstSubscriptionRow(
      env.DB,
      "SELECT * FROM subscriptions WHERE user_id = ?1 LIMIT 1",
      userKey,
    )) ||
    (clerkId
      ? await firstSubscriptionRow(
          env.DB,
          "SELECT * FROM subscriptions WHERE user_id = ?1 LIMIT 1",
          clerkId,
        )
      : null) ||
    (patch.stripeCustomerId
      ? await firstSubscriptionRow(
          env.DB,
          "SELECT * FROM subscriptions WHERE stripe_customer_id = ?1 LIMIT 1",
          patch.stripeCustomerId,
        )
      : null);

  const binds = [
    customerId,
    patch.stripeCustomerId ?? null,
    patch.stripeSubscriptionId ?? null,
    patch.stripePriceId ?? null,
    patch.tier ?? "free",
    patch.status ?? "canceled",
    patch.currentPeriodEnd ?? null,
    patch.pastDueSince ?? null,
    now,
    clerkId,
    userKey,
  ];

  if (!existing) {
    const inserts = [
      `INSERT INTO subscriptions (
         customer_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
         tier, status, current_period_end, past_due_since, updated_at, clerk_user_id
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
      `INSERT INTO subscriptions (
         user_id, customer_id, clerk_user_id, stripe_customer_id, stripe_subscription_id,
         stripe_price_id, tier, status, current_period_end, past_due_since, updated_at
       ) VALUES (?11, ?1, ?10, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    ];
    let lastError: unknown;
    for (const sql of inserts) {
      try {
        await env.DB.prepare(sql).bind(...binds).run();
        return;
      } catch (err) {
        lastError = err;
      }
    }
    log.error("stripe_subscription_insert_failed", {
      err: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return;
  }

  const updates = [
    `UPDATE subscriptions SET
       stripe_customer_id = COALESCE(?2, stripe_customer_id),
       stripe_subscription_id = COALESCE(?3, stripe_subscription_id),
       stripe_price_id = COALESCE(?4, stripe_price_id),
       tier = COALESCE(?5, tier),
       status = COALESCE(?6, status),
       current_period_end = COALESCE(?7, current_period_end),
       past_due_since = ?8,
       updated_at = ?9
     WHERE customer_id = ?1`,
    `UPDATE subscriptions SET
       stripe_customer_id = COALESCE(?2, stripe_customer_id),
       stripe_subscription_id = COALESCE(?3, stripe_subscription_id),
       stripe_price_id = COALESCE(?4, stripe_price_id),
       tier = COALESCE(?5, tier),
       status = COALESCE(?6, status),
       current_period_end = COALESCE(?7, current_period_end),
       past_due_since = ?8,
       updated_at = ?9
     WHERE user_id = ?11`,
  ];
  for (const sql of updates) {
    try {
      const result = await env.DB.prepare(sql).bind(...binds).run();
      if (result.meta.changes) return;
    } catch {
      /* try the next schema shape */
    }
  }
}

export async function applyStripeSubscriptionObject(
  env: Env,
  object: Record<string, unknown>,
): Promise<{ customerId: number | null }> {
  const stripeCustomerId =
    typeof object.customer === "string"
      ? object.customer
      : typeof (object.customer as { id?: string } | undefined)?.id === "string"
        ? (object.customer as { id: string }).id
        : null;
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const appCustomerId = Number(metadata.app_customer_id ?? metadata.customer_id);
  let customerId = Number.isInteger(appCustomerId) && appCustomerId > 0 ? appCustomerId : null;

  if (!customerId && stripeCustomerId) {
    const row = await selectOne<{ customer_id: number }>(
      env.DB,
      "SELECT customer_id FROM subscriptions WHERE stripe_customer_id = ?1 LIMIT 1",
      stripeCustomerId,
    );
    customerId = row?.customer_id ?? null;
  }

  if (!customerId) return { customerId: null };

  const items = object.items as
    | { data?: Array<{ price?: { id?: string }; current_period_end?: number }> }
    | undefined;
  const priceId = items?.data?.[0]?.price?.id;
  const status = mapStripeStatus(typeof object.status === "string" ? object.status : undefined);
  // `current_period_end` was removed from the Subscription object in API
  // version 2025-03-31.basil and moved onto each subscription item. Webhook
  // payloads use whatever version the endpoint was created with, so accept
  // both shapes: prefer the top-level field (older versions), then fall back
  // to the first item's period end (basil and later).
  // https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
  const itemPeriodEnd = items?.data?.[0]?.current_period_end;
  const periodEnd =
    typeof object.current_period_end === "number"
      ? object.current_period_end
      : typeof itemPeriodEnd === "number"
        ? itemPeriodEnd
        : null;
  const pastDueSince = status === "past_due" ? Math.floor(Date.now() / 1000) : null;
  const tier = status === "canceled" || status === "paused" ? "free" : tierForStripePrice(env, priceId);

  await upsertStripeIds(env, customerId, {
    stripeCustomerId: stripeCustomerId ?? undefined,
    stripeSubscriptionId: typeof object.id === "string" ? object.id : undefined,
    stripePriceId: priceId,
    tier: tier as Tier,
    status,
    currentPeriodEnd: periodEnd,
    pastDueSince,
  });
  return { customerId };
}
