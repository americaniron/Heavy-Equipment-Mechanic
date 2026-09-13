import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import {
  applyStripeSubscriptionObject,
  createCheckoutSession,
} from "../src/lib/stripe-billing";

const SUBSCRIPTION_COLUMNS = [
  "user_id",
  "customer_id",
  "clerk_user_id",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_price_id",
  "tier",
  "status",
  "stripe_status",
  "current_period_end",
  "past_due_since",
  "stripe_subscription_created",
  "stripe_event_created",
  "updated_at",
];

function billingDb(existingStripeCustomer?: string) {
  let inserted: Record<string, unknown> | null = null;
  const customer = {
    id: 17,
    email: "owner@fixmyiron.test",
    first_name: "Fleet",
    last_name: "Owner",
    clerk_user_id: "user_clerk_17",
  };
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          args = values;
          return statement;
        },
        async all<T>() {
          if (/PRAGMA table_info\("subscriptions"\)/.test(sql)) {
            return {
              results: SUBSCRIPTION_COLUMNS.map((name) => ({ name })) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async first<T>() {
          if (
            /SELECT stripe_customer_id FROM subscriptions WHERE customer_id/.test(
              sql,
            )
          ) {
            return (
              existingStripeCustomer
                ? { stripe_customer_id: existingStripeCustomer }
                : null
            ) as T | null;
          }
          if (/FROM customers WHERE id = \?1/.test(sql)) {
            return (Number(args[0]) === customer.id ? customer : null) as T | null;
          }
          if (/FROM users WHERE lower\(email\)/.test(sql)) {
            return { clerk_user_id: customer.clerk_user_id } as T;
          }
          if (/SELECT stripe_subscription_id, stripe_subscription_created/.test(sql)) {
            return null;
          }
          if (/FROM subscriptions/.test(sql)) return null;
          return null;
        },
        async run() {
          if (/INSERT INTO subscriptions/.test(sql)) {
            const columnBlock = /\(([^)]+)\)\s+VALUES/.exec(sql)?.[1] ?? "";
            const names = columnBlock
              .split(",")
              .map((name) => name.trim().replaceAll('"', ""));
            inserted = Object.fromEntries(
              names.map((name, index) => [name, args[index]]),
            );
          }
          return {
            success: true,
            meta: { changes: 1, last_row_id: 1 },
          };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
  return {
    db,
    customer,
    inserted: () => inserted,
  };
}

function envFor(db: D1Database): Env {
  return {
    DB: db,
    STRIPE_SECRET_KEY: "sk_test_not_real",
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_SHOP: "price_shop",
  } as Env;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Stripe Checkout integration", () => {
  it("links Checkout and Subscription metadata to the server-side customer", async () => {
    const memory = billingDb();
    const requests: Array<{ url: URL; body: URLSearchParams; headers: Headers }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" || input instanceof URL
            ? input
            : input.url,
        );
        const body = new URLSearchParams(String(init?.body ?? ""));
        const headers = new Headers(init?.headers);
        requests.push({ url, body, headers });
        if (url.pathname === "/v1/customers") {
          return Response.json({ id: "cus_owner_17" });
        }
        if (url.pathname === "/v1/subscriptions") {
          return Response.json({ data: [] });
        }
        if (url.pathname === "/v1/checkout/sessions") {
          return Response.json({
            id: "cs_test_17",
            url: "https://checkout.stripe.com/c/pay/test",
          });
        }
        return Response.json({}, { status: 404 });
      }),
    );

    const result = await createCheckoutSession(envFor(memory.db), {
      customer: memory.customer,
      targetTier: "pro",
      successUrl: "https://www.fixmyiron.com/portal?checkout=success",
      cancelUrl: "https://www.fixmyiron.com/portal?checkout=cancel",
    });

    expect(result).toEqual({
      id: "cs_test_17",
      url: "https://checkout.stripe.com/c/pay/test",
    });
    const checkout = requests.find(
      (request) => request.url.pathname === "/v1/checkout/sessions",
    );
    expect(checkout?.body.get("customer")).toBe("cus_owner_17");
    expect(checkout?.body.get("client_reference_id")).toBe("17");
    expect(checkout?.body.get("metadata[app_customer_id]")).toBe("17");
    expect(
      checkout?.body.get("subscription_data[metadata][app_customer_id]"),
    ).toBe("17");
    expect(checkout?.body.get("line_items[0][price]")).toBe("price_pro");
    expect(checkout?.body.get("payment_method_types[0]")).toBeNull();
    expect(checkout?.body.get("integration_identifier")).toMatch(
      /^fixmyiron_checkout_[a-z]{8}$/,
    );
    expect(checkout?.headers.get("stripe-version")).toBe(
      "2026-08-26.dahlia",
    );
  });

  it("blocks a second Checkout for any non-terminal existing subscription", async () => {
    const memory = billingDb("cus_owner_17");
    const fetchMock = vi.fn(
      async (input: string | URL | Request) => {
        const url = new URL(
          typeof input === "string" || input instanceof URL
            ? input
            : input.url,
        );
        if (url.pathname === "/v1/subscriptions") {
          return Response.json({
            data: [
              {
                id: "sub_legacy_price",
                status: "active",
                items: { data: [{ price: { id: "price_retired" } }] },
              },
            ],
          });
        }
        return Response.json({}, { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createCheckoutSession(envFor(memory.db), {
      customer: memory.customer,
      targetTier: "shop",
      successUrl: "https://www.fixmyiron.com/success",
      cancelUrl: "https://www.fixmyiron.com/cancel",
    });

    expect(result).toMatchObject({
      status: 409,
      code: "existing_subscription",
    });
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/v1/checkout/sessions"),
      ),
    ).toBe(false);
  });
});

describe("Stripe entitlement mapping", () => {
  it.each([
    ["active", "pro", "active"],
    ["trialing", "pro", "trialing"],
    ["past_due", "pro", "past_due"],
    ["paused", "free", "paused"],
    ["canceled", "free", "canceled"],
    ["unpaid", "free", "unpaid"],
    ["incomplete", "free", "incomplete"],
    ["incomplete_expired", "free", "incomplete_expired"],
  ] as const)(
    "maps %s to tier %s without trusting client metadata",
    async (status, expectedTier, expectedStripeStatus) => {
      const memory = billingDb();
      await applyStripeSubscriptionObject(
        envFor(memory.db),
        {
          id: `sub_${status}`,
          customer: "cus_owner_17",
          created: 100,
          status,
          metadata: {
            app_customer_id: "17",
            target_tier: "shop",
          },
          items: {
            data: [{ price: { id: "price_pro" }, current_period_end: 200 }],
          },
        },
        150,
      );

      expect(memory.inserted()).toMatchObject({
        customer_id: 17,
        tier: expectedTier,
        stripe_status: expectedStripeStatus,
      });
    },
  );

  it("cannot grant a paid tier from forged metadata and an unknown Price", async () => {
    const memory = billingDb();
    await applyStripeSubscriptionObject(
      envFor(memory.db),
      {
        id: "sub_forged",
        customer: "cus_owner_17",
        status: "active",
        metadata: {
          app_customer_id: "17",
          target_tier: "shop",
          tier: "shop",
        },
        items: { data: [{ price: { id: "price_attacker_controlled" } }] },
      },
      200,
    );

    expect(memory.inserted()).toMatchObject({
      tier: "free",
      stripe_status: "active",
    });
  });
});
