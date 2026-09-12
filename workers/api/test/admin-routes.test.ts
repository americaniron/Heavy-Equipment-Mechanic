import { describe, expect, it } from "vitest";
import worker from "../src/index";

/**
 * Integration tests for the admin console backend (src/routes/admin.ts).
 *
 * A small SQL-routing fake D1 + in-memory KV let the real route + middleware
 * code (constant-time password compare, KV-backed token issue/validate,
 * dashboard/visits/customers queries) run end-to-end in-process.
 */

const ADMIN_PASSWORD = "unit-test-admin-pw";

interface VisitFixtureRow {
  id: number;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  company: string | null;
  equipment_type: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  serial_number: string | null;
  problem_summary: string | null;
  fault_codes: string | null;
  visit_type: string | null;
  mechanic_type: string | null;
  status: string | null;
  language: string | null;
  created_at: string | null;
  email_verified: number;
  phone_verified: number;
  has_report: number;
}

function visitRow(overrides: Partial<VisitFixtureRow> & { id: number }): VisitFixtureRow {
  return {
    customer_name: "Dale Gribble",
    customer_email: "dale@example.com",
    customer_phone: "+15125550111",
    company: "Rusty Iron LLC",
    equipment_type: "Excavator",
    make: "Caterpillar",
    model: "336F",
    year: "2019",
    serial_number: "CAT336F0001",
    problem_summary: "Loss of power under load",
    fault_codes: "SPN 651 FMI 5",
    visit_type: "pro",
    mechanic_type: "heavy_equipment",
    status: "completed",
    language: "en",
    created_at: "2026-09-10 10:00:00",
    email_verified: 1,
    phone_verified: 0,
    has_report: 1,
    ...overrides,
  };
}

const VISITS: VisitFixtureRow[] = [
  visitRow({ id: 2, mechanic_type: "power_gen", status: "intake", has_report: 0, email_verified: 0 }),
  visitRow({ id: 1 }),
];

const CUSTOMERS = [
  {
    id: 1,
    email: "demo@fixmyiron.test",
    password_hash: "$2a$10$supersecrethash",
    first_name: "Demo",
    last_name: "User",
    company: "FixMyIron Test",
    phone: "+15125550000",
    role: "user",
    status: "active",
    clerk_user_id: null,
    email_verified_at: "2026-09-12 07:41:12",
    created_at: "2026-09-12 07:40:59",
    updated_at: "2026-09-12 07:40:59",
  },
];

const SESSION_DETAIL = {
  id: 1,
  customer_id: null,
  customer_name: "Dale Gribble",
  customer_email: "dale@example.com",
  make: "Caterpillar",
  model: "336F",
  status: "completed",
  created_at: "2026-09-10 10:00:00",
};

const MESSAGES = [
  { id: 1, sessionId: 1, role: "user", content: "loses power", agentType: "mechanic", createdAt: "2026-09-10 10:05:00" },
];

const REPORT = {
  reportType: "diagnostic",
  content: '{"summary":"Clogged fuel filter"}',
  svgDiagram: null,
  shareToken: "share-tok-abc",
  createdAt: "2026-09-10 10:30:00",
};

function makeDb() {
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async first<T = Record<string, unknown>>(): Promise<T | null> {
          if (/COUNT\(DISTINCT customer_email\)/i.test(sql)) {
            return { total: 4, completed: 2, active: 2, unique_customers: 3 } as unknown as T;
          }
          if (/COUNT\(\*\) AS n FROM customers/i.test(sql)) {
            return { n: CUSTOMERS.length } as unknown as T;
          }
          if (/SELECT \* FROM sessions WHERE id = \?1/i.test(sql)) {
            return (Number(args[0]) === SESSION_DETAIL.id ? SESSION_DETAIL : null) as unknown as T | null;
          }
          if (/FROM session_reports/i.test(sql)) {
            return (Number(args[0]) === 1 ? REPORT : null) as unknown as T | null;
          }
          return null;
        },
        async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
          // PRAGMA table_info → empty so ensure-schema skips ALTERs.
          if (/PRAGMA table_info/i.test(sql)) return { results: [] };
          if (/AS email_verified/i.test(sql)) {
            // VISIT_SELECT — honor the LIMIT bind for the recent-visits case.
            const limit = Number(args[0] ?? VISITS.length);
            return { results: VISITS.slice(0, limit) as unknown as T[] };
          }
          if (/GROUP BY COALESCE\(mechanic_type/i.test(sql)) {
            return {
              results: [
                { mechanic_type: "heavy_equipment", n: 1 },
                { mechanic_type: "power_gen", n: 1 },
              ] as unknown as T[],
            };
          }
          if (/SELECT \* FROM customers ORDER BY/i.test(sql)) {
            return { results: CUSTOMERS as unknown as T[] };
          }
          if (/FROM session_messages/i.test(sql)) {
            return { results: MESSAGES as unknown as T[] };
          }
          return { results: [] };
        },
        async run() {
          return { success: true, meta: { last_row_id: 1, changes: 0 } };
        },
      };
      return stmt;
    },
  };
}

function kv() {
  const store = new Map<string, string>();
  return {
    _store: store,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string, _opts?: unknown) => {
      store.set(k, v);
    },
    delete: async (k: string) => {
      store.delete(k);
    },
  };
}

function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: makeDb(),
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
    ADMIN_PASSWORD,
    ...overrides,
  } as unknown as Parameters<typeof worker.fetch>[1];
}

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

function req(path: string, init?: RequestInit) {
  return new Request(`https://api.fixmyiron.com${path}`, init);
}

async function login(env: ReturnType<typeof makeEnv>): Promise<string> {
  const res = await worker.fetch(
    req("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    }),
    env,
    ctx,
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { token: string };
  return body.token;
}

describe("POST /api/admin/login", () => {
  it("returns a token for the correct password", async () => {
    const env = makeEnv();
    const res = await worker.fetch(
      req("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: ADMIN_PASSWORD }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string; expiresIn?: number };
    expect(typeof body.token).toBe("string");
    expect(body.token!.length).toBeGreaterThanOrEqual(32);
    expect(body.expiresIn).toBeGreaterThan(0);
  });

  it("rejects a wrong password with 401", async () => {
    const res = await worker.fetch(
      req("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "wrong-password" }),
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("rejects an empty password with 401 (no length early-return)", async () => {
    const res = await worker.fetch(
      req("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "" }),
      }),
      makeEnv(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("fails closed with 503 when ADMIN_PASSWORD is unset", async () => {
    const res = await worker.fetch(
      req("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "anything" }),
      }),
      makeEnv({ ADMIN_PASSWORD: undefined }),
      ctx,
    );
    expect(res.status).toBe(503);
  });
});

describe("admin token gating", () => {
  for (const path of ["/api/admin/dashboard", "/api/admin/visits", "/api/admin/customers", "/api/admin/visits/1"]) {
    it(`rejects ${path} without a token (401)`, async () => {
      const res = await worker.fetch(req(path), makeEnv(), ctx);
      expect(res.status).toBe(401);
    });

    it(`rejects ${path} with an invalid token (401)`, async () => {
      const res = await worker.fetch(req(path, { headers: { "x-admin-token": "bogus" } }), makeEnv(), ctx);
      expect(res.status).toBe(401);
    });
  }

  it("rejects an expired token (401) and deletes it", async () => {
    const env = makeEnv();
    const token = "expired-token";
    await (env as unknown as { SESSIONS: ReturnType<typeof kv> }).SESSIONS.put(
      `admin_session:${token}`,
      JSON.stringify({ createdAt: Date.now() - 10_000, exp: Date.now() - 1_000 }),
    );
    const res = await worker.fetch(req("/api/admin/dashboard", { headers: { "x-admin-token": token } }), env, ctx);
    expect(res.status).toBe(401);
    const remaining = await (env as unknown as { SESSIONS: ReturnType<typeof kv> }).SESSIONS.get(`admin_session:${token}`);
    expect(remaining).toBeNull();
  });
});

describe("GET /api/admin/dashboard", () => {
  it("returns the aggregate shape the console renders", async () => {
    const env = makeEnv();
    const token = await login(env);
    const res = await worker.fetch(req("/api/admin/dashboard", { headers: { "x-admin-token": token } }), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      totalVisits: 4,
      completedVisits: 2,
      activeVisits: 2,
      uniqueCustomers: 3,
      registeredCustomers: 1,
    });
    expect(body.visitsByType).toEqual({ heavy_equipment: 1, power_gen: 1 });
    expect(Array.isArray(body.recentVisits)).toBe(true);
    const recent = body.recentVisits as Array<Record<string, unknown>>;
    expect(recent[0]).toHaveProperty("customerName");
    expect(recent[0]).toHaveProperty("emailVerified");
    expect(recent[0]).toHaveProperty("hasReport");
  });
});

describe("GET /api/admin/visits", () => {
  it("returns a Visit[] with the exact client field names", async () => {
    const env = makeEnv();
    const token = await login(env);
    const res = await worker.fetch(req("/api/admin/visits", { headers: { "x-admin-token": token } }), env, ctx);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<Record<string, unknown>>;
    expect(list.length).toBe(2);
    const v = list[0]!;
    for (const key of [
      "id", "customerName", "customerEmail", "customerPhone", "company",
      "equipmentType", "make", "model", "year", "serialNumber",
      "problemSummary", "faultCodes", "visitType", "mechanicType",
      "status", "language", "createdAt", "emailVerified", "phoneVerified", "hasReport",
    ]) {
      expect(v).toHaveProperty(key);
    }
    expect(typeof v.emailVerified).toBe("boolean");
    expect(typeof v.hasReport).toBe("boolean");
  });
});

describe("GET /api/admin/visits/:id", () => {
  it("returns session + messages + parsed report", async () => {
    const env = makeEnv();
    const token = await login(env);
    const res = await worker.fetch(req("/api/admin/visits/1", { headers: { "x-admin-token": token } }), env, ctx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: Record<string, unknown>; messages: unknown[]; report: Record<string, unknown> };
    expect(body.session.customerName).toBe("Dale Gribble");
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.report.reportType).toBe("diagnostic");
    // content string is parsed to an object
    expect((body.report.content as Record<string, unknown>).summary).toBe("Clogged fuel filter");
  });

  it("returns 404 for an unknown visit id", async () => {
    const env = makeEnv();
    const token = await login(env);
    const res = await worker.fetch(req("/api/admin/visits/999", { headers: { "x-admin-token": token } }), env, ctx);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/admin/customers", () => {
  it("returns registered customers with password hashes stripped", async () => {
    const env = makeEnv();
    const token = await login(env);
    const res = await worker.fetch(req("/api/admin/customers", { headers: { "x-admin-token": token } }), env, ctx);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<Record<string, unknown>>;
    expect(list.length).toBe(1);
    const c = list[0]!;
    expect(c.passwordHash).toBeUndefined();
    expect(c.password_hash).toBeUndefined();
    expect(c.firstName).toBe("Demo");
    expect(c.lastName).toBe("User");
    expect(c.email).toBe("demo@fixmyiron.test");
    expect(c.status).toBe("active");
  });
});
