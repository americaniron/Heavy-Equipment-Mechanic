import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { sha256Hex } from "../src/lib/email";

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

describe("password reset request storage", () => {
  it("stores only a hash of the emailed bearer token", async () => {
    let storedToken = "";
    let emailText = "";
    const database = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            args = values;
            return statement;
          },
          async first<T>() {
            if (/FROM customers WHERE lower\(email\)/.test(sql)) {
              return {
                id: 12,
                email: "reset@fixmyiron.test",
                status: "active",
              } as T;
            }
            return null;
          },
          async all<T>() {
            return { results: [] as T[] };
          },
          async run() {
            if (/INSERT INTO password_reset_tokens/.test(sql)) {
              storedToken = String(args[0]);
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
    const env = {
      DB: database,
      PADDLE_EVENTS_SEEN: kv(),
      RATE_LIMITS: kv(),
      SESSIONS: kv(),
      AUTH_KV: kv(),
      DIAGNOSTIC_SESSION: {},
      EMAIL: {
        async send(message: { text: string }) {
          emailText = message.text;
        },
      },
      APP_ENV: "test",
      WEB_ORIGIN: "https://www.fixmyiron.com",
      PUBLIC_BASE_URL: "https://www.fixmyiron.com",
      CLERK_SECRET_KEY: "",
      CLERK_WEBHOOK_SECRET: "",
      ANTHROPIC_API_KEY: "",
    } as any;
    const response = await worker.fetch(
      new Request(
        "https://api.fixmyiron.com/api/auth/password-reset/request",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "reset@fixmyiron.test" }),
        },
      ),
      env,
      { waitUntil() {}, passThroughOnException() {} } as any,
    );

    expect(response.status).toBe(200);
    const rawToken = /[?&]token=([^\s]+)/.exec(emailText)?.[1];
    expect(rawToken).toBeTruthy();
    const decoded = decodeURIComponent(rawToken!);
    expect(storedToken).not.toBe(decoded);
    expect(storedToken).toBe(
      await sha256Hex(`password-reset:${decoded}`),
    );
  });
});
