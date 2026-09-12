import { describe, expect, it } from "vitest";
import worker from "../src/index";

function kv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  };
}

/** Minimal db used for the anonymous case (no session resolves). */
function bareDb() {
  return {
    prepare(sql: string) {
      const stmt = {
        bind() {
          return stmt;
        },
        async all() {
          return { results: [] };
        },
        async first() {
          if (sql.includes("SELECT 1")) return { ok: 1 };
          return null;
        },
        async run() {
          return { success: true, meta: { last_row_id: 1, changes: 0 } };
        },
      };
      return stmt;
    },
  };
}

/**
 * db that resolves the demo auth token to customer #1 and reports a `pro`
 * subscription, so requireAuth + requireTier("pro") both pass.
 */
function authedDb(token: string) {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        async all() {
          return { results: [] };
        },
        async first() {
          if (sql.includes("SELECT 1")) return { ok: 1 };
          // getCustomerByAuthToken: JOIN customers on the session token
          if (sql.includes("FROM auth_sessions s") && bound[0] === token) {
            return { id: 1, email: "demo@fixmyiron.test", role: "user", status: "active" };
          }
          // getCustomerByAuthToken: session expiry lookup
          if (sql.includes("SELECT expires_at FROM auth_sessions") && bound[0] === token) {
            return { expires_at: future };
          }
          // effectiveTier: subscription lookup -> pro/active
          if (sql.includes("FROM subscriptions")) {
            return {
              tier: "pro",
              status: "active",
              past_due_since: null,
              current_period_end: future,
            };
          }
          return null;
        },
        async run() {
          return { success: true, meta: { last_row_id: 1, changes: 0 } };
        },
      };
      return stmt;
    },
  };
}

function baseEnv(db: unknown) {
  return {
    DB: db,
    PADDLE_EVENTS_SEEN: kv(),
    RATE_LIMITS: kv(),
    SESSIONS: kv(),
    AUTH_KV: kv(),
    JOBS: { send: async () => undefined },
    DIAGNOSTIC_SESSION: {},
    APP_ENV: "test",
    PADDLE_ENVIRONMENT: "sandbox",
    CLERK_ACCOUNT_PORTAL_URL: "https://www.fixmyiron.com/login",
    WEB_ORIGIN: "https://www.fixmyiron.com,https://fixmyiron.com",
    CLERK_SECRET_KEY: "",
    CLERK_WEBHOOK_SECRET: "",
    ANTHROPIC_API_KEY: "",
  } as any;
}

const ctx = {
  waitUntil() {},
  passThroughOnException() {},
};

describe("POST /api/avatar/session/stop is authenticated (FIX C)", () => {
  it("rejects an anonymous stop with 401", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/avatar/session/stop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionToken: "whatever" }),
      }),
      baseEnv(bareDb()),
      ctx as any,
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("UNAUTHENTICATED");
  });

  it("passes the auth + pro-tier gate for an authenticated pro user", async () => {
    const token = "demo-auth-token";
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/avatar/session/stop", {
        method: "POST",
        headers: { "content-type": "application/json", "x-auth-token": token },
        // No sessionToken -> no upstream LiveAvatar call; proves the gate passed.
        body: JSON.stringify({}),
      }),
      baseEnv(authedDb(token)),
      ctx as any,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });

  it("blocks an authenticated free-tier user with 403", async () => {
    const token = "free-auth-token";
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const freeDb = {
      prepare(sql: string) {
        let bound: unknown[] = [];
        const stmt = {
          bind(...args: unknown[]) {
            bound = args;
            return stmt;
          },
          async all() {
            return { results: [] };
          },
          async first() {
            if (sql.includes("SELECT 1")) return { ok: 1 };
            if (sql.includes("FROM auth_sessions s") && bound[0] === token) {
              return { id: 2, email: "free@fixmyiron.test", role: "user", status: "active" };
            }
            if (sql.includes("SELECT expires_at FROM auth_sessions") && bound[0] === token) {
              return { expires_at: future };
            }
            // No subscription row -> effectiveTier() returns "free".
            return null;
          },
          async run() {
            return { success: true, meta: { last_row_id: 1, changes: 0 } };
          },
        };
        return stmt;
      },
    };
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/avatar/session/stop", {
        method: "POST",
        headers: { "content-type": "application/json", "x-auth-token": token },
        body: JSON.stringify({}),
      }),
      baseEnv(freeDb),
      ctx as any,
    );
    expect(res.status).toBe(403);
  });
});
