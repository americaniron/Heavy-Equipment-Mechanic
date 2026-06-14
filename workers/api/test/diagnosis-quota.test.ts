import { describe, expect, it } from "vitest";
import {
  checkQuota,
  incrementQuota,
  DIAGNOSIS_FREE_MONTHLY_LIMIT,
} from "../src/lib/diagnosis-quota";

/**
 * In-memory D1 stub. Records UPDATE/INSERT statements so we can assert
 * the increment SQL ran with the right binding without spinning up a
 * real D1.
 */
function makeDb(initialRow: { count: number; window_start: string } | null) {
  let row = initialRow;
  const updates: Array<{ customerId: number; monthKey: string }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              const windowStart = args[1] as string;
              return row?.window_start === windowStart ? (row as T) : null;
            },
            async run() {
              if (sql.includes("INSERT INTO ai_rate_limits")) {
                const customerId = args[0] as number;
                const windowStart = args[1] as string;
                const monthKey = windowStart.slice(0, 7);
                updates.push({ customerId, monthKey });
                if (row && row.window_start === windowStart) {
                  row = { ...row, count: row.count + 1 };
                } else {
                  row = { count: 1, window_start: windowStart };
                }
                return { meta: {} };
              }
              return { meta: {} };
            },
          };
        },
      };
    },
    _row: () => row,
    _updates: updates,
  };
  return db as unknown as D1Database & {
    _row: () => typeof row;
    _updates: typeof updates;
  };
}

const may2026 = (): number => Date.UTC(2026, 4, 15, 12, 0, 0); // 2026-05-15
const jun2026 = (): number => Date.UTC(2026, 5, 1, 0, 30, 0); // 2026-06-01

describe("diagnosis quota — free tier", () => {
  it("allows the first FREE_MONTHLY_LIMIT diagnoses", async () => {
    const db = makeDb({ count: 0, window_start: "2026-05-01 00:00:00" });
    for (let i = 0; i < DIAGNOSIS_FREE_MONTHLY_LIMIT; i++) {
      const r = await checkQuota({ db, userId: "u_a", tier: "free", now: may2026 });
      expect(r.ok).toBe(true);
      if (r.ok) {
        await incrementQuota({ db, userId: "u_a", monthKey: r.monthKey });
      }
    }
    const denied = await checkQuota({ db, userId: "u_a", tier: "free", now: may2026 });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("monthly_limit");
  });

  it("rolls over the counter on a new month (lazy reset)", async () => {
    const db = makeDb({
      count: DIAGNOSIS_FREE_MONTHLY_LIMIT,
      window_start: "2026-05-01 00:00:00",
    });
    // First request in June → counter is effectively 0 again.
    const r = await checkQuota({ db, userId: "u_b", tier: "free", now: jun2026 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.monthKey).toBe("2026-06");
      expect(r.remaining).toBe(DIAGNOSIS_FREE_MONTHLY_LIMIT - 1);
    }
  });

  it("treats missing user row as fresh", async () => {
    const db = makeDb(null);
    const r = await checkQuota({ db, userId: "u_unknown", tier: "free", now: may2026 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBe(DIAGNOSIS_FREE_MONTHLY_LIMIT - 1);
  });

  it("ignores stale month_key when counting", async () => {
    const db = makeDb({
      count: 999,
      window_start: "2025-12-01 00:00:00", // way old
    });
    const r = await checkQuota({ db, userId: "u_c", tier: "free", now: may2026 });
    expect(r.ok).toBe(true);
  });
});

describe("diagnosis quota — paid tiers", () => {
  it("returns unlimited for pro (no DB read necessary)", async () => {
    const db = makeDb({
      count: 999_999,
      window_start: "2026-05-01 00:00:00",
    });
    const r = await checkQuota({ db, userId: "u_pro", tier: "pro", now: may2026 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBeNull();
  });

  it("returns unlimited for shop", async () => {
    const db = makeDb(null);
    const r = await checkQuota({ db, userId: "u_shop", tier: "shop", now: may2026 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.remaining).toBeNull();
  });
});

describe("incrementQuota", () => {
  it("uses the supplied month key (idempotent across rollover)", async () => {
    const db = makeDb({ count: 0, window_start: "2026-05-01 00:00:00" });
    await incrementQuota({ db, userId: "u_d", monthKey: "2026-05" });
    expect((db as unknown as { _updates: Array<{ monthKey: string }> })._updates[0]?.monthKey).toBe("2026-05");
  });
});
