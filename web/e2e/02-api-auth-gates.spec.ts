import { test, expect, request } from "@playwright/test";

const API =
  process.env.STAGING_API_URL ??
  "https://fixmyiron-api-staging.americanironadmin.workers.dev";

const PROTECTED_ENDPOINTS: Array<{ method: "GET" | "POST"; path: string; body?: unknown }> = [
  { method: "GET", path: "/api/parts/search?q=hydraulic" },
  { method: "GET", path: "/api/parts/facets" },
  { method: "POST", path: "/api/diagnosis/scenario", body: { machine_make: "x", machine_model: "y", symptoms: "abc" } },
  { method: "POST", path: "/api/diagnosis/chat", body: { message: "hi" } },
  { method: "POST", path: "/api/troubleshooting/start", body: { machine_make: "x", machine_model: "y", initial_complaint: "abc" } },
  { method: "POST", path: "/api/recommended-parts", body: { cart_part_numbers: ["1R-0750"] } },
  { method: "POST", path: "/api/repair-plan", body: { session_id: "00000000-0000-4000-8000-000000000000" } },
  { method: "GET", path: "/api/equipment" },
  { method: "POST", path: "/api/predictive", body: {} },
  { method: "GET", path: "/api/fault-codes/SPN-110-FMI-3" },
  { method: "GET", path: "/api/fault-codes/search?q=hydraulic" },
];

test.describe("API auth gates", () => {
  for (const e of PROTECTED_ENDPOINTS) {
    test(`${e.method} ${e.path} requires auth`, async () => {
      const ctx = await request.newContext({ baseURL: API });
      const res =
        e.method === "GET"
          ? await ctx.get(e.path)
          : await ctx.post(e.path, { data: e.body ?? {} });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(body.error).toHaveProperty("code", "UNAUTHENTICATED");
      await ctx.dispose();
    });
  }

  test("invalid Bearer token also returns 401 with structured error", async () => {
    const ctx = await request.newContext({ baseURL: API });
    const res = await ctx.get("/api/parts/search?q=hydraulic", {
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    await ctx.dispose();
  });
});

test.describe("API health endpoints (unauthenticated, intentional)", () => {
  test("/healthz returns ok with sandbox env", async () => {
    const ctx = await request.newContext({ baseURL: API });
    const res = await ctx.get("/healthz");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.env).toBe("sandbox");
    await ctx.dispose();
  });

  test("/healthz/db returns ok (D1 binding live)", async () => {
    const ctx = await request.newContext({ baseURL: API });
    const res = await ctx.get("/healthz/db");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    await ctx.dispose();
  });

  test("404 returns structured error envelope, not stack trace", async () => {
    const ctx = await request.newContext({ baseURL: API });
    const res = await ctx.get("/api/does-not-exist");
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBeTruthy();
    await ctx.dispose();
  });
});

test.describe("Paddle webhook signature verification", () => {
  test("rejects POST without signature header (401)", async () => {
    const ctx = await request.newContext({ baseURL: API });
    const res = await ctx.post("/api/webhooks/paddle", {
      data: { event_type: "subscription.created", event_id: "evt_test_1", data: {} },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_SIGNATURE");
    await ctx.dispose();
  });

  test("rejects POST with malformed signature (401)", async () => {
    const ctx = await request.newContext({ baseURL: API });
    const res = await ctx.post("/api/webhooks/paddle", {
      headers: { "paddle-signature": "garbage" },
      data: { event_type: "subscription.created", event_id: "evt_test_2", data: {} },
    });
    expect(res.status()).toBe(401);
    await ctx.dispose();
  });
});
