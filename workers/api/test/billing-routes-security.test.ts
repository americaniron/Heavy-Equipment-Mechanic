import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";

const FUTURE = new Date(Date.now() + 60_000).toISOString();
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

function db(options: { portalCustomer?: string } = {}) {
  const customer = {
    id: 1,
    email: "owner@fixmyiron.test",
    first_name: "Owner",
    last_name: "One",
    status: "active",
    clerk_user_id: "user_owner",
  };
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          args = values;
          return statement;
        },
        async first<T>() {
          if (/FROM auth_sessions s\s+JOIN customers c/i.test(sql)) {
            return (args[0] === "owner-token" ? customer : null) as T | null;
          }
          if (/SELECT expires_at FROM auth_sessions/.test(sql)) {
            return (
              args[0] === "owner-token" ? { expires_at: FUTURE } : null
            ) as T | null;
          }
          if (/FROM customers WHERE id = \?1/.test(sql)) {
            return (Number(args[0]) === 1 ? customer : null) as T | null;
          }
          if (/FROM "customers" WHERE id = \?1/.test(sql)) {
            return (Number(args[0]) === 1 ? customer : null) as T | null;
          }
          if (/FROM users WHERE lower\(email\)/.test(sql)) {
            return { clerk_user_id: "user_owner" } as T;
          }
          if (
            /SELECT stripe_customer_id FROM subscriptions WHERE customer_id/.test(
              sql,
            )
          ) {
            return (
              options.portalCustomer
                ? { stripe_customer_id: options.portalCustomer }
                : null
            ) as T | null;
          }
          if (/FROM subscriptions/.test(sql)) return null;
          return null;
        },
        async all<T>() {
          if (/PRAGMA table_info\("subscriptions"\)/.test(sql)) {
            return {
              results: SUBSCRIPTION_COLUMNS.map((name) => ({ name })) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          return {
            success: true,
            meta: { changes: 1, last_row_id: 1 },
          };
        },
      };
      return statement;
    },
  };
}

function kv() {
  const values = new Map<string, string>();
  return {
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string) => {
      values.set(key, value);
    },
    delete: async (key: string) => {
      values.delete(key);
    },
  };
}

function env(database: ReturnType<typeof db>) {
  return {
    DB: database,
    PADDLE_EVENTS_SEEN: kv(),
    RATE_LIMITS: kv(),
    SESSIONS: kv(),
    AUTH_KV: kv(),
    DIAGNOSTIC_SESSION: {},
    APP_ENV: "test",
    WEB_ORIGIN: "https://www.fixmyiron.com,https://portal.fixmyiron.com",
    PUBLIC_BASE_URL: "https://www.fixmyiron.com",
    CLERK_SECRET_KEY: "",
    CLERK_WEBHOOK_SECRET: "",
    ANTHROPIC_API_KEY: "",
    STRIPE_SECRET_KEY: "sk_test_not_real",
    STRIPE_PRICE_PRO: "price_pro",
    STRIPE_PRICE_SHOP: "price_shop",
  } as any;
}

const ctx = { waitUntil() {}, passThroughOnException() {} };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("billing route authorization", () => {
  it("ignores an untrusted Origin when building Checkout return URLs", async () => {
    let checkoutBody: URLSearchParams | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" || input instanceof URL
            ? input
            : input.url,
        );
        if (url.pathname === "/v1/customers") {
          return Response.json({ id: "cus_owner" });
        }
        if (url.pathname === "/v1/subscriptions") {
          return Response.json({ data: [] });
        }
        if (url.pathname === "/v1/checkout/sessions") {
          checkoutBody = new URLSearchParams(String(init?.body ?? ""));
          return Response.json({
            id: "cs_owner",
            url: "https://checkout.stripe.com/c/pay/owner",
          });
        }
        return Response.json({}, { status: 404 });
      }),
    );

    const response = await worker.fetch(
      new Request(
        "https://api.fixmyiron.com/api/portal/billing/stripe/checkout-session",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-auth-token": "owner-token",
            origin: "https://evil.example",
          },
          body: JSON.stringify({ target_tier: "pro", tier: "shop" }),
        },
      ),
      env(db()),
      ctx as any,
    );

    expect(response.status).toBe(201);
    expect(checkoutBody?.get("success_url")).toMatch(
      /^https:\/\/www\.fixmyiron\.com\//,
    );
    expect(checkoutBody?.get("cancel_url")).toMatch(
      /^https:\/\/www\.fixmyiron\.com\//,
    );
    expect(checkoutBody?.get("success_url")).not.toContain("evil.example");
  });

  it("opens only the signed-in customer's portal despite forged body fields", async () => {
    let portalBody: URLSearchParams | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          typeof input === "string" || input instanceof URL
            ? input
            : input.url,
        );
        if (url.pathname === "/v1/billing_portal/sessions") {
          portalBody = new URLSearchParams(String(init?.body ?? ""));
          return Response.json({
            url: "https://billing.stripe.com/p/session/owner",
          });
        }
        return Response.json({}, { status: 404 });
      }),
    );

    const response = await worker.fetch(
      new Request(
        "https://api.fixmyiron.com/api/portal/billing/portal-session",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-auth-token": "owner-token",
          },
          body: JSON.stringify({
            customer: "cus_other",
            stripe_customer_id: "cus_other",
          }),
        },
      ),
      env(db({ portalCustomer: "cus_owner" })),
      ctx as any,
    );

    expect(response.status).toBe(201);
    expect(portalBody?.get("customer")).toBe("cus_owner");
    expect(portalBody?.get("return_url")).toBe(
      "https://www.fixmyiron.com/portal?section=billing",
    );
  });
});
