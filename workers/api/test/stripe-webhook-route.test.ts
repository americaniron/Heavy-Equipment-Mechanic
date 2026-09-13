import { describe, expect, it } from "vitest";
import worker from "../src/index";

async function signature(secret: string, body: string, timestamp: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const hex = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `t=${timestamp},v1=${hex}`;
}

function replayDb() {
  const rows = new Map<
    string,
    { source: string; status: string; token: string }
  >();
  return {
    rows,
    database: {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            args = values;
            return statement;
          },
          async first<T>() {
            if (/SELECT id FROM processed_webhooks/.test(sql)) {
              const row = rows.get(String(args[0]));
              return (
                row && row.source === args[1]
                  ? { id: String(args[0]) }
                  : null
              ) as T | null;
            }
            if (/SELECT status, claimed_at FROM processed_webhooks/.test(sql)) {
              const row = rows.get(String(args[0]));
              return (
                row
                  ? {
                      status: row.status,
                      claimed_at: new Date().toISOString(),
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
            const id = String(args[0]);
            if (/INSERT OR IGNORE INTO processed_webhooks/.test(sql)) {
              if (rows.has(id)) {
                return { success: true, meta: { changes: 0 } };
              }
              rows.set(id, {
                source: String(args[1]),
                status: "processing",
                token: String(args[2]),
              });
              return { success: true, meta: { changes: 1 } };
            }
            const row = rows.get(id);
            if (
              /SET status = 'processed'/.test(sql) &&
              row &&
              row.token === args[2]
            ) {
              row.status = "processed";
              return { success: true, meta: { changes: 1 } };
            }
            return {
              success: true,
              meta: { changes: 0, last_row_id: 1 },
            };
          },
        };
        return statement;
      },
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

const ctx = { waitUntil() {}, passThroughOnException() {} };

describe("POST /api/webhooks/stripe", () => {
  it("verifies a signed event and suppresses its replay", async () => {
    const secret = "whsec_route_test";
    const event = JSON.stringify({
      id: "evt_replay_1",
      type: "ping",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: { object: { id: "obj_1" } },
    });
    const header = await signature(
      secret,
      event,
      Math.floor(Date.now() / 1000),
    );
    const memory = replayDb();
    const seen = kv();
    const env = {
      DB: memory.database,
      PADDLE_EVENTS_SEEN: seen,
      RATE_LIMITS: kv(),
      SESSIONS: kv(),
      AUTH_KV: kv(),
      DIAGNOSTIC_SESSION: {},
      APP_ENV: "test",
      WEB_ORIGIN: "https://www.fixmyiron.com",
      CLERK_SECRET_KEY: "",
      CLERK_WEBHOOK_SECRET: "",
      ANTHROPIC_API_KEY: "",
      STRIPE_SECRET_KEY: "sk_test_not_real",
      STRIPE_WEBHOOK_SECRET: secret,
    } as any;

    const send = () =>
      worker.fetch(
        new Request("https://api.fixmyiron.com/api/webhooks/stripe", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "stripe-signature": header,
          },
          body: event,
        }),
        env,
        ctx as any,
      );

    const first = await send();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    expect(memory.rows.get("stripe:evt_replay_1")?.status).toBe(
      "processed",
    );

    const replay = await send();
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true, duplicate: true });
    expect(memory.rows.size).toBe(1);
  });
});
