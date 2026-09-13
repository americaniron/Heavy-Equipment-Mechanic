import { afterEach, describe, expect, it, vi } from "vitest";
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

/** db that resolves the demo auth token to a `pro` customer. */
function proDb(token: string) {
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
          if (sql.includes("FROM auth_sessions s") && bound[0] === token) {
            return { id: 1, email: "pro@fixmyiron.test", role: "user", status: "active" };
          }
          if (sql.includes("SELECT expires_at FROM auth_sessions") && bound[0] === token) {
            return { expires_at: future };
          }
          if (sql.includes("FROM subscriptions")) {
            return { tier: "pro", status: "active", past_due_since: null, current_period_end: future };
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
    WEB_ORIGIN: "https://www.fixmyiron.com,https://fixmyiron.com",
    CLERK_SECRET_KEY: "",
    CLERK_WEBHOOK_SECRET: "",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "sk-openai-test",
    LIVEAVATAR_API_KEY: "expired-or-invalid-key",
  } as any;
}

const ctx = { waitUntil() {}, passThroughOnException() {} };

describe("POST /api/avatar/session surfaces credential failures (repair)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps an upstream LiveAvatar 401 to a 502 with a HUMAN ACTION REQUIRED credential hint", async () => {
    const token = "demo-auth-token";
    // Secret registration succeeds, but the session-token mint returns 401 —
    // the signature of an invalid/expired LiveAvatar API key.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/v1/secrets")) {
          return new Response(JSON.stringify({ data: { id: "secret-123" } }), { status: 200 });
        }
        if (url.includes("/v1/sessions/token")) {
          return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
        }
        return new Response("{}", { status: 200 });
      }),
    );

    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/avatar/session", {
        method: "POST",
        headers: { "content-type": "application/json", "x-auth-token": token },
        body: JSON.stringify({ agentType: "admin", language: "en" }),
      }),
      baseEnv(proDb(token)),
      ctx as any,
    );

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error?: { message?: string; hint?: string } };
    expect(body.error?.hint).toContain("HUMAN ACTION REQUIRED");
    expect(body.error?.hint).toContain("LIVEAVATAR_API_KEY");
  });
});
