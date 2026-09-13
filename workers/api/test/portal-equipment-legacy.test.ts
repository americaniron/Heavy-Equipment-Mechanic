import { describe, expect, it } from "vitest";
import worker from "../src/index";

const FUTURE = new Date(Date.now() + 60_000).toISOString();
const LEGACY_EQUIPMENT_ID = "16945678901234";

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

function legacyEquipmentDb() {
  const equipment = new Map<string, Record<string, unknown>>([
    [
      LEGACY_EQUIPMENT_ID,
      {
        id: LEGACY_EQUIPMENT_ID,
        customer_id: null,
        user_id: "user_owner",
        name: "Legacy Excavator",
        status: "active",
      },
    ],
  ]);
  const customer = {
    id: 1,
    email: "owner@fixmyiron.test",
    status: "active",
    clerk_user_id: "user_owner",
  };
  return {
    equipment,
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
          if (/FROM users WHERE lower\(email\)/.test(sql)) {
            return { clerk_user_id: "user_owner" } as T;
          }
          if (/FROM equipment WHERE id = \?1/.test(sql)) {
            const row = equipment.get(String(args[0]));
            return (row ?? null) as T | null;
          }
          if (/PRAGMA table_info\("equipment"\)/.test(sql)) {
            return {
              results: [
                { name: "id", type: "TEXT", notnull: 0, pk: 1 },
                { name: "customer_id", type: "INTEGER", notnull: 0, pk: 0 },
                { name: "user_id", type: "TEXT", notnull: 0, pk: 0 },
                { name: "name", type: "TEXT", notnull: 0, pk: 0 },
                { name: "status", type: "TEXT", notnull: 0, pk: 0 },
              ],
            } as T;
          }
          return null;
        },
        async all<T>() {
          if (/PRAGMA table_info\("equipment"\)/.test(sql)) {
            return {
              results: [
                { name: "id", type: "TEXT", notnull: 0, pk: 1 },
                { name: "customer_id", type: "INTEGER", notnull: 0, pk: 0 },
                { name: "user_id", type: "TEXT", notnull: 0, pk: 0 },
                { name: "name", type: "TEXT", notnull: 0, pk: 0 },
                { name: "status", type: "TEXT", notnull: 0, pk: 0 },
              ],
            } as T;
          }
          return { results: [] as T[] };
        },
        async run() {
          if (/UPDATE "equipment"/.test(sql) && /SET customer_id/.test(sql)) {
            const row = equipment.get(String(args[1]));
            if (row) row.customer_id = args[0];
            return { success: true, meta: { changes: 1 } };
          }
          if (/UPDATE equipment SET/.test(sql)) {
            const row = equipment.get(String(args[args.length - 1]));
            if (row) {
              const field = /"status" = \?1/.test(sql) ? "status" : "name";
              row[field] = args[0];
            }
            return { success: true, meta: { changes: row ? 1 : 0 } };
          }
          if (/DELETE FROM equipment WHERE id = \?1/.test(sql)) {
            const existed = equipment.delete(String(args[0]));
            return {
              success: true,
              meta: { changes: existed ? 1 : 0 },
            };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
      return statement;
    },
  };
}

describe("portal equipment legacy identifiers", () => {
  it("updates equipment created under the legacy TEXT primary key", async () => {
    const db = legacyEquipmentDb();
    const env = {
      DB: db,
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

    const response = await worker.fetch(
      new Request(
        `https://api.fixmyiron.com/api/portal/equipment/${LEGACY_EQUIPMENT_ID}`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "x-auth-token": "owner-token",
          },
          body: JSON.stringify({ status: "retired" }),
        },
      ),
      env,
      { waitUntil() {}, passThroughOnException() {} } as any,
    );

    expect(response.status).toBe(200);
    expect(db.equipment.get(LEGACY_EQUIPMENT_ID)?.status).toBe("retired");
  });

  it("deletes equipment created under the legacy TEXT primary key", async () => {
    const db = legacyEquipmentDb();
    const env = {
      DB: db,
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

    const response = await worker.fetch(
      new Request(
        `https://api.fixmyiron.com/api/portal/equipment/${LEGACY_EQUIPMENT_ID}`,
        {
          method: "DELETE",
          headers: { "x-auth-token": "owner-token" },
        },
      ),
      env,
      { waitUntil() {}, passThroughOnException() {} } as any,
    );

    expect(response.status).toBe(200);
    expect(db.equipment.has(LEGACY_EQUIPMENT_ID)).toBe(false);
  });
});
