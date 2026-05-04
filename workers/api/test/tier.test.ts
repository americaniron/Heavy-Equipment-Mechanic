import { describe, expect, it } from "vitest";
import { effectiveTier } from "../src/lib/tier";

/**
 * Stub D1Database that returns canned rows. We only hit `.first()`.
 * This is a pure unit test for the tier-resolution logic — no real D1.
 */
function makeDb(row: Record<string, unknown> | null) {
  return {
    prepare(_sql: string) {
      return {
        bind(..._args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              return (row as T) ?? null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

describe("effectiveTier", () => {
  it("returns 'free' when no subscription row exists", async () => {
    expect(await effectiveTier(makeDb(null), "u_1")).toBe("free");
  });

  it("returns sub.tier when status is active", async () => {
    const db = makeDb({
      tier: "pro",
      status: "active",
      past_due_since: null,
      current_period_end: 9_999_999_999,
    });
    expect(await effectiveTier(db, "u_1")).toBe("pro");
  });

  it("returns sub.tier when status is trialing", async () => {
    const db = makeDb({
      tier: "shop",
      status: "trialing",
      past_due_since: null,
      current_period_end: 9_999_999_999,
    });
    expect(await effectiveTier(db, "u_1")).toBe("shop");
  });

  it("honors past_due grace within 3 days", async () => {
    const db = makeDb({
      tier: "pro",
      status: "past_due",
      past_due_since: Math.floor(Date.now() / 1000) - 60 * 60, // 1h ago
      current_period_end: null,
    });
    expect(await effectiveTier(db, "u_1")).toBe("pro");
  });

  it("downgrades to free after 3-day past_due grace", async () => {
    const db = makeDb({
      tier: "pro",
      status: "past_due",
      past_due_since: Math.floor(Date.now() / 1000) - 4 * 24 * 60 * 60,
      current_period_end: null,
    });
    expect(await effectiveTier(db, "u_1")).toBe("free");
  });

  it("treats canceled as free", async () => {
    const db = makeDb({
      tier: "pro",
      status: "canceled",
      past_due_since: null,
      current_period_end: null,
    });
    expect(await effectiveTier(db, "u_1")).toBe("free");
  });

  it("treats paused as free", async () => {
    const db = makeDb({
      tier: "shop",
      status: "paused",
      past_due_since: null,
      current_period_end: null,
    });
    expect(await effectiveTier(db, "u_1")).toBe("free");
  });
});
