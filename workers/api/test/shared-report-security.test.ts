import { describe, expect, it } from "vitest";
import worker from "../src/index";

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

function env() {
  const database = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          args = values;
          return statement;
        },
        async first<T>() {
          if (/FROM session_reports WHERE share_token/.test(sql)) {
            return (
              args[0] === "A".repeat(24)
                ? {
                    id: 8,
                    report_type: "diagnostic",
                    content: "Owner-approved public report",
                    svg_diagram: null,
                    created_at: "2026-09-12T00:00:00.000Z",
                  }
                : null
            ) as T | null;
          }
          return null;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
        async run() {
          return {
            success: true,
            meta: { changes: 0, last_row_id: 0 },
          };
        },
      };
      return statement;
    },
  };
  return {
    DB: database,
    PADDLE_EVENTS_SEEN: kv(),
    RATE_LIMITS: kv(),
    SESSIONS: kv(),
    AUTH_KV: kv(),
    DIAGNOSTIC_SESSION: {},
    APP_ENV: "test",
    WEB_ORIGIN: "https://www.fixmyiron.com",
    CLERK_SECRET_KEY: "",
    CLERK_WEBHOOK_SECRET: "",
    ANTHROPIC_API_KEY: "",
  } as any;
}

const ctx = { waitUntil() {}, passThroughOnException() {} };

describe("shared diagnostic reports", () => {
  it("rejects malformed capability tokens without querying by a broad prefix", async () => {
    const response = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/shared/short"),
      env(),
      ctx as any,
    );
    expect(response.status).toBe(404);
  });

  it("returns only the public report projection for an exact token", async () => {
    const response = await worker.fetch(
      new Request(
        `https://api.fixmyiron.com/api/shared/${"A".repeat(24)}`,
      ),
      env(),
      ctx as any,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.content).toBe("Owner-approved public report");
    expect(body).not.toHaveProperty("share_token");
    expect(body).not.toHaveProperty("session_id");
    expect(body).not.toHaveProperty("customer_id");
  });
});
