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

function db() {
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

function env() {
  return {
    DB: db(),
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

describe("worker public routes", () => {
  it("reports stripe billing on health", async () => {
    const res = await worker.fetch(new Request("https://api.fixmyiron.com/health"), env(), ctx as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; env?: string; billing?: string };
    expect(body.ok).toBe(true);
    expect(body.env).toBe("test");
    expect(body.billing).toBe("stripe");
  });

  it("returns 410 for Paddle webhooks", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/webhooks/paddle", { method: "POST", body: "{}" }),
      env(),
      ctx as any,
    );
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("GONE");
  });

  it("does not echo a wildcard CORS origin", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/health", {
        headers: { origin: "https://evil.example" },
      }),
      env(),
      ctx as any,
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("allows the production www origin", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/health", {
        headers: { origin: "https://www.fixmyiron.com" },
      }),
      env(),
      ctx as any,
    );
    expect(res.headers.get("access-control-allow-origin")).toBe("https://www.fixmyiron.com");
  });

  it("rejects Stripe webhooks without a signature", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/webhooks/stripe", {
        method: "POST",
        body: JSON.stringify({ id: "evt_1", type: "ping", data: { object: {} } }),
      }),
      env(),
      ctx as any,
    );
    expect(res.status).toBe(401);
  });

  it("reports LiveAvatar availability without leaking keys", async () => {
    const res = await worker.fetch(new Request("https://api.fixmyiron.com/api/avatar/available"), env(), ctx as any);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider?: string; configured?: boolean };
    expect(body.provider).toBe("liveavatar-openai");
    expect(body.configured).toBe(false);
  });

  it("returns 410 for deprecated D-ID speak", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/avatar/speak", { method: "POST", body: "{}" }),
      env(),
      ctx as any,
    );
    expect(res.status).toBe(410);
  });

  it("rejects native registration without required fields", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-enough" }),
      }),
      env(),
      ctx as any,
    );
    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated session listing", async () => {
    const res = await worker.fetch(new Request("https://api.fixmyiron.com/api/sessions"), env(), ctx as any);
    expect(res.status).toBe(401);
  });

  it("rejects transcribe without a session or auth token", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/transcribe", { method: "POST", body: new FormData() }),
      env(),
      ctx as any,
    );
    expect(res.status).toBe(401);
  });

  it("rejects Clerk webhooks without a Svix signature", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/webhooks/clerk", {
        method: "POST",
        body: JSON.stringify({ type: "user.created", data: {} }),
      }),
      env(),
      ctx as any,
    );
    expect(res.status).toBe(401);
  });
});
