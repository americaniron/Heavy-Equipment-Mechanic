import { describe, expect, it } from "vitest";
import worker from "../src/index";

const FUTURE = new Date(Date.now() + 60_000).toISOString();

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

function database() {
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
            return (
              args[0] === "other-token"
                ? {
                    id: 2,
                    email: "other@fixmyiron.test",
                    status: "active",
                    clerk_user_id: "user_other",
                  }
                : null
            ) as T | null;
          }
          if (/SELECT expires_at FROM auth_sessions/.test(sql)) {
            return (
              args[0] === "other-token" ? { expires_at: FUTURE } : null
            ) as T | null;
          }
          if (/FROM customers WHERE id = \?1/.test(sql)) {
            return {
              id: 2,
              email: "other@fixmyiron.test",
              status: "active",
              clerk_user_id: "user_other",
            } as T;
          }
          if (/FROM users WHERE lower\(email\)/.test(sql)) {
            return { clerk_user_id: "user_other" } as T;
          }
          if (/FROM subscriptions WHERE customer_id = \?1/i.test(sql)) {
            return {
              tier: "pro",
              status: "active",
              stripe_status: "active",
              past_due_since: null,
              current_period_end: null,
            } as T;
          }
          if (/SELECT \* FROM sessions WHERE id = \?1/.test(sql)) {
            return {
              id: 1,
              customer_id: 1,
              access_token: "owner-session-token",
            } as T;
          }
          // Every customer-owned lookup below binds customer #2 and must not
          // resolve the fixture rows, which all belong to customer #1.
          if (
            /customer_id = \?\d/.test(sql) ||
            /WHERE id = \?1 AND customer_id/.test(sql)
          ) {
            return null;
          }
          return null;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
        async run() {
          if (
            /UPDATE (?:equipment|service_requests)/.test(sql) ||
            /DELETE FROM equipment/.test(sql)
          ) {
            return {
              success: true,
              meta: { changes: 0, last_row_id: 0 },
            };
          }
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

function env() {
  return {
    DB: database(),
    PADDLE_EVENTS_SEEN: kv(),
    RATE_LIMITS: kv(),
    SESSIONS: kv(),
    AUTH_KV: kv(),
    DIAGNOSTIC_SESSION: {
      idFromName: (name: string) => name,
      get: () => ({
        fetch: async () =>
          Response.json({
            meta: null,
            turns: [],
            playbook: null,
            input: null,
          }),
      }),
    },
    APP_ENV: "test",
    WEB_ORIGIN: "https://www.fixmyiron.com",
    CLERK_SECRET_KEY: "",
    CLERK_WEBHOOK_SECRET: "",
    ANTHROPIC_API_KEY: "unused-owner-check-happens-first",
  } as any;
}

const ctx = { waitUntil() {}, passThroughOnException() {} };

interface Case {
  method: string;
  path: string;
  body?: unknown;
}

const cases: Case[] = [
  { method: "PATCH", path: "/api/equipment/1", body: { status: "retired" } },
  { method: "DELETE", path: "/api/equipment/1" },
  { method: "PATCH", path: "/api/portal/equipment/1", body: { status: "retired" } },
  { method: "DELETE", path: "/api/portal/equipment/1" },
  {
    method: "PATCH",
    path: "/api/portal/service-requests/1",
    body: { status: "closed" },
  },
  { method: "GET", path: "/api/portal/quote-requests/1" },
  { method: "GET", path: "/api/portal/ai/escalations/1" },
  { method: "GET", path: "/api/diagnosis/1" },
  {
    method: "POST",
    path: "/api/diagnosis/1/messages",
    body: { message: "Cross-account attempt" },
  },
  { method: "GET", path: "/api/diagnosis/1/pdf" },
  { method: "GET", path: "/api/troubleshooting/1" },
  {
    method: "POST",
    path: "/api/troubleshooting/1/answer",
    body: { answer: "Cross-account answer" },
  },
  {
    method: "POST",
    path: "/api/repair-plan",
    body: { session_id: "1" },
  },
  {
    method: "POST",
    path: "/api/recommended-parts",
    body: { session_id: "1" },
  },
  { method: "GET", path: "/api/sessions/1" },
  {
    method: "POST",
    path: "/api/sessions/1/message",
    body: { message: "Cross-account attempt" },
  },
  { method: "POST", path: "/api/sessions/1/handoff" },
  { method: "GET", path: "/api/sessions/1/report" },
  { method: "POST", path: "/api/sessions/1/report" },
  { method: "POST", path: "/api/sessions/1/email-transcript" },
];

describe("customer resource authorization", () => {
  for (const testCase of cases) {
    it(`${testCase.method} ${testCase.path} hides another customer's resource`, async () => {
      const headers: Record<string, string> = {
        "x-auth-token": "other-token",
      };
      let body: string | undefined;
      if (testCase.body !== undefined) {
        headers["content-type"] = "application/json";
        body = JSON.stringify(testCase.body);
      }
      const response = await worker.fetch(
        new Request(`https://api.fixmyiron.com${testCase.path}`, {
          method: testCase.method,
          headers,
          body,
        }),
        env(),
        ctx as any,
      );

      expect(response.status).toBe(404);
    });
  }
});
