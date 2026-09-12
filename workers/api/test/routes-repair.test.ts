import { describe, expect, it } from "vitest";
import worker from "../src/index";

/**
 * Integration tests for the two repaired endpoints:
 *   - GET  /api/diagnosis/:id/pdf   (D2 — PDF export)
 *   - POST /api/sessions/:id/upload (D1 — R2 file upload)
 *
 * Uses small SQL-routing fakes for D1 + R2 so the real route/middleware
 * code (auth, ownership, pdf-lib rendering, R2 put, session_files insert)
 * runs end-to-end in-process.
 */

const FUTURE = new Date(Date.now() + 60 * 60 * 1000).toISOString();

interface Fixture {
  // token -> customer row (as returned by the auth_sessions JOIN customers)
  customersByToken: Map<string, Record<string, unknown>>;
  diagnosticSessions: Array<Record<string, unknown>>;
  diagnosticResults: Map<number, Record<string, unknown>>;
  liveSessions: Array<Record<string, unknown>>;
  sessionFilesInserted: Array<Record<string, unknown>>;
  nextId: number;
}

function makeDb(fx: Fixture) {
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...a: unknown[]) {
          args = a;
          return stmt;
        },
        async first<T = Record<string, unknown>>(): Promise<T | null> {
          // getCustomerByAuthToken — JOIN customers by token
          if (/FROM auth_sessions s\s+JOIN customers c/i.test(sql)) {
            return (fx.customersByToken.get(String(args[0])) ?? null) as T | null;
          }
          if (/SELECT expires_at FROM auth_sessions/i.test(sql)) {
            return fx.customersByToken.has(String(args[0]))
              ? ({ expires_at: FUTURE } as unknown as T)
              : null;
          }
          // diagnosis ownership check
          if (/FROM diagnostic_sessions WHERE id = \?1 AND customer_id = \?2/i.test(sql)) {
            const [id, cid] = args;
            const row = fx.diagnosticSessions.find(
              (s) => String(s.id) === String(id) && Number(s.customer_id) === Number(cid),
            );
            return (row ?? null) as T | null;
          }
          if (/FROM diagnostic_results WHERE session_id = \?1/i.test(sql)) {
            return (fx.diagnosticResults.get(Number(args[0])) ?? null) as T | null;
          }
          // live session load (loadOwnedSession)
          if (/FROM sessions WHERE id = \?1/i.test(sql)) {
            const row = fx.liveSessions.find((s) => String(s.id) === String(args[0]));
            return (row ?? null) as T | null;
          }
          return null;
        },
        async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
          // PRAGMA table_info → empty so ensure-schema skips ALTERs.
          return { results: [] };
        },
        async run() {
          if (/INSERT INTO "session_files"/i.test(sql)) {
            const id = ++fx.nextId;
            fx.sessionFilesInserted.push({ id, args });
            return { success: true, meta: { last_row_id: id, changes: 1 } };
          }
          return { success: true, meta: { last_row_id: ++fx.nextId, changes: 0 } };
        },
      };
      return stmt;
    },
  };
}

function makeR2() {
  const store = new Map<string, { body: Uint8Array; opts: unknown }>();
  return {
    _store: store,
    async put(key: string, value: ArrayBuffer | Uint8Array, opts: unknown) {
      const body = value instanceof Uint8Array ? value : new Uint8Array(value);
      store.set(key, { body, opts });
      return { key, size: body.byteLength };
    },
    async get(key: string) {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        key,
        async arrayBuffer() {
          return entry.body.buffer;
        },
      };
    },
  };
}

function kv() {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
    delete: async (k: string) => {
      store.delete(k);
    },
  };
}

function makeEnv(fx: Fixture, r2?: ReturnType<typeof makeR2>) {
  return {
    DB: makeDb(fx),
    PADDLE_EVENTS_SEEN: kv(),
    RATE_LIMITS: kv(),
    SESSIONS: kv(),
    AUTH_KV: kv(),
    JOBS: { send: async () => undefined },
    DIAGNOSTIC_SESSION: {},
    ASSETS: r2,
    APP_ENV: "test",
    PADDLE_ENVIRONMENT: "sandbox",
    CLERK_ACCOUNT_PORTAL_URL: "https://www.fixmyiron.com/login",
    WEB_ORIGIN: "https://www.fixmyiron.com,https://fixmyiron.com",
    CLERK_SECRET_KEY: "",
    CLERK_WEBHOOK_SECRET: "",
    ANTHROPIC_API_KEY: "",
  } as unknown as Parameters<typeof worker.fetch>[1];
}

const ctx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

function baseFixture(): Fixture {
  return {
    customersByToken: new Map([
      ["owner-token", { id: 1, email: "owner@fixmyiron.test" }],
      ["other-token", { id: 2, email: "other@fixmyiron.test" }],
    ]),
    diagnosticSessions: [
      {
        id: "9001",
        customer_id: 1,
        machine_make: "Caterpillar",
        machine_model: "336F",
        machine_year: "2019",
        machine_hours: "8450",
        symptoms: "Loss of power under load.",
        fault_codes_input: JSON.stringify(["SPN 651 FMI 5"]),
        recent_service: JSON.stringify(["Replaced primary fuel filter"]),
        operator_notes: "Worse when hydraulics engaged.",
        model_used: "claude-test",
        started_at: "2026-09-12 08:00:00",
      },
    ],
    diagnosticResults: new Map([
      [
        9001,
        {
          session_id: 9001,
          playbook_json: JSON.stringify({
            possible_causes: [
              { cause: "Clogged fuel filter", likelihood: "high", reasoning: "Power loss under load." },
            ],
            tests_in_order: [
              {
                test: "Measure fuel pressure",
                tools: ["gauge"],
                expected_reading_pass: "55-65 psi",
                expected_reading_fail: "< 40 psi",
              },
            ],
            expected_readings: { fuel_pressure: "55-65 psi" },
            parts_likely_needed: [
              { part_number: "1R-0750", description: "Fuel filter", why: "Primary suspect" },
            ],
            safety_warnings: ["Relieve fuel pressure before opening lines"],
          }),
        },
      ],
    ]),
    liveSessions: [
      { id: 1, customer_id: 1, access_token: "sess-access-1" },
    ],
    sessionFilesInserted: [],
    nextId: 100,
  };
}

describe("GET /api/diagnosis/:id/pdf (D2)", () => {
  it("requires authentication", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/diagnosis/9001/pdf"),
      makeEnv(baseFixture()),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("returns a PDF for the owning user", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/diagnosis/9001/pdf", {
        headers: { "x-auth-token": "owner-token" },
      }),
      makeEnv(baseFixture()),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("fixmyiron-diagnosis-9001.pdf");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(500);
    // %PDF- magic bytes
    expect(String.fromCharCode(...buf.slice(0, 5))).toBe("%PDF-");
  });

  it("returns 404 for a different (non-owning) user", async () => {
    const res = await worker.fetch(
      new Request("https://api.fixmyiron.com/api/diagnosis/9001/pdf", {
        headers: { "x-auth-token": "other-token" },
      }),
      makeEnv(baseFixture()),
      ctx,
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/sessions/:id/upload (D1)", () => {
  function uploadRequest(id: number | string, token: string | null) {
    const fd = new FormData();
    fd.append(
      "files",
      new File([new TextEncoder().encode("hello iron")], "note.txt", { type: "text/plain" }),
    );
    const headers: Record<string, string> = {};
    if (token) headers["x-auth-token"] = token;
    return new Request(`https://api.fixmyiron.com/api/sessions/${id}/upload`, {
      method: "POST",
      headers,
      body: fd,
    });
  }

  it("writes the object to R2 and records a session_files row for the owner", async () => {
    const fx = baseFixture();
    const r2 = makeR2();
    const res = await worker.fetch(uploadRequest(1, "owner-token"), makeEnv(fx, r2), ctx);
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      count: number;
      files: Array<{ fileName: string; fileType: string; filePath: string; size: number }>;
    };
    expect(body.count).toBe(1);
    const file = body.files[0]!;
    expect(file.fileName).toBe("note.txt");
    expect(file.fileType).toBe("text/plain");
    expect(file.filePath).toMatch(/^sessions\/1\/.+-note\.txt$/);
    expect(file.size).toBe(10);

    // R2 object was written under the returned key.
    expect(r2._store.has(file.filePath)).toBe(true);

    // A session_files row was inserted.
    expect(fx.sessionFilesInserted.length).toBe(1);
  });

  it("rejects an upload from a different (non-owning) user", async () => {
    const fx = baseFixture();
    const r2 = makeR2();
    const res = await worker.fetch(uploadRequest(1, "other-token"), makeEnv(fx, r2), ctx);
    expect(res.status).toBe(404);
    // Nothing was written on rejection.
    expect(r2._store.size).toBe(0);
    expect(fx.sessionFilesInserted.length).toBe(0);
  });

  it("rejects an unauthenticated upload", async () => {
    const fx = baseFixture();
    const r2 = makeR2();
    const res = await worker.fetch(uploadRequest(1, null), makeEnv(fx, r2), ctx);
    expect(res.status).toBe(404);
    expect(r2._store.size).toBe(0);
  });

  it("returns 503 when no R2 bucket is bound", async () => {
    const fx = baseFixture();
    const res = await worker.fetch(uploadRequest(1, "owner-token"), makeEnv(fx, undefined), ctx);
    expect(res.status).toBe(503);
  });
});
