import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revokeSession: vi.fn(),
}));

vi.mock("../src/lib/clerk-auth", () => ({
  verifyClerkJwt: async () => ({
    userId: "user_clerk_1",
    sessionId: "sess_clerk_1",
  }),
  getClerkClient: () => ({
    sessions: { revokeSession: mocks.revokeSession },
    users: {},
  }),
}));

import worker from "../src/index";

function db() {
  return {
    prepare(sql: string) {
      const statement = {
        bind() {
          return statement;
        },
        async first() {
          if (sql.includes("SELECT 1")) return { ok: 1 };
          return null;
        },
        async all() {
          return { results: [] };
        },
        async run() {
          return { success: true, meta: { changes: 0 } };
        },
      };
      return statement;
    },
  };
}

function kv() {
  return {
    get: async () => null,
    put: async () => undefined,
    delete: async () => undefined,
  };
}

const env = {
  DB: db(),
  PADDLE_EVENTS_SEEN: kv(),
  RATE_LIMITS: kv(),
  SESSIONS: kv(),
  AUTH_KV: kv(),
  DIAGNOSTIC_SESSION: {},
  APP_ENV: "test",
  WEB_ORIGIN: "https://www.fixmyiron.com",
  CLERK_SECRET_KEY: "sk_test_clerk",
  CLERK_WEBHOOK_SECRET: "",
  ANTHROPIC_API_KEY: "",
} as any;

const ctx = { waitUntil() {}, passThroughOnException() {} };

describe("POST /api/auth/logout", () => {
  it("revokes the Clerk session identified by the verified JWT", async () => {
    const response = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/auth/logout", {
        method: "POST",
        headers: { authorization: "Bearer clerk-jwt" },
      }),
      env,
      ctx as any,
    );

    expect(response.status).toBe(200);
    expect(mocks.revokeSession).toHaveBeenCalledWith("sess_clerk_1");
  });
});
