import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the Clerk client boundary so createClerkUser hits a REAL (non
// email_exists) failure path. This exercises FIX D: the register flow must
// still create the local customer (graceful degrade) while making the
// Clerk<->customer drift observable.
vi.mock("../src/lib/clerk-auth", () => ({
  getClerkClient: () => ({
    users: {
      createUser: async () => {
        throw new Error("Clerk unavailable: 503 service_unavailable");
      },
    },
  }),
  verifyClerkJwt: async () => null,
}));

import worker from "../src/index";
import { log } from "../src/lib/log";

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

interface Captured {
  customerInsert?: { sql: string; args: unknown[] };
}

function db(captured: Captured) {
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
          // No pre-existing customer for this email.
          if (sql.includes("FROM customers WHERE lower(email)")) return null;
          // Row re-read after insert (SELECT * FROM customers WHERE id = ?1).
          if (sql.includes("FROM customers WHERE id = ")) {
            return {
              id: 42,
              email: "drift@fixmyiron.test",
              first_name: "Drift",
              last_name: "Case",
              role: "user",
              status: "pending_verification",
              clerk_user_id: null,
            };
          }
          return null;
        },
        async run() {
          if (sql.startsWith('INSERT INTO "customers"')) {
            captured.customerInsert = { sql, args: bound };
            return { success: true, meta: { last_row_id: 42, changes: 1 } };
          }
          return { success: true, meta: { last_row_id: 1, changes: 1 } };
        },
      };
      return stmt;
    },
  };
}

function env(captured: Captured) {
  return {
    DB: db(captured),
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
    // Non-empty so createClerkUser attempts the (failing) Clerk call.
    CLERK_SECRET_KEY: "sk_test_dummy",
    CLERK_WEBHOOK_SECRET: "",
    ANTHROPIC_API_KEY: "",
  } as any;
}

const ctx = {
  waitUntil() {},
  passThroughOnException() {},
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registration under a non-email_exists Clerk failure (FIX D)", () => {
  it("still creates the local customer with clerk_user_id=null and flags the drift", async () => {
    const errorSpy = vi.spyOn(log, "error");
    const captured: Captured = {};

    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "drift@fixmyiron.test",
          password: "Password123",
          firstName: "Drift",
          lastName: "Case",
        }),
      }),
      env(captured),
      ctx as any,
    );

    // Public success contract the SPA depends on must be unchanged.
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      requiresVerification?: boolean;
      user?: { email?: string };
      email?: string;
    };
    expect(body.requiresVerification).toBe(true);
    expect(body.email).toBe("drift@fixmyiron.test");
    expect(body.user?.email).toBe("drift@fixmyiron.test");

    // Graceful degrade: local customer created, but with no Clerk linkage.
    expect(captured.customerInsert).toBeTruthy();
    const insert = captured.customerInsert!;
    expect(insert.sql).toContain('"clerk_user_id"');
    // clerk_user_id is the last column in the insert -> its bound value is null.
    expect(insert.args[insert.args.length - 1]).toBeNull();

    // Drift is observable: an error-level log names it explicitly.
    const messages = errorSpy.mock.calls.map((call) => call[0]);
    expect(messages).toContain("clerk_link_drift_on_register");
  });
});
