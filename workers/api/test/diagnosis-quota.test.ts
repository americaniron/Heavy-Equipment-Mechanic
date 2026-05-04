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
function makeDb(initialRow: { diagnoses_this_month: number; diagnoses_month_key: string | null } | null) {
  let row = initialRow;
  const updates: Array<{ userId: string; monthKey: string }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              return (row as T) ?? null;
            },
            async run() {
              if (sql.includes("UPDATE users")) {
                const userId = args[0] as string;
                const monthKey = args[1] as string;
                updates.push({ userId, monthKey });
                if (row && row.diagnoses_month_key === monthKey) {
                  row = {
                    ...row,
                    diagnoses_this_month: row.diagnoses_this_month + 1,
                  };
                } else {
                  row = { diagnoses_this_month: 1, diagnoses_month_key: monthKey };
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
    const db = makeDb({ diagnoses_this_month: 0, diagnoses_month_key: "2026-05" });
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
      diagnoses_this_month: DIAGNOSIS_FREE_MONTHLY_LIMIT,
      diagnoses_month_key: "2026-05",
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
      diagnoses_this_month: 999,
      diagnoses_month_key: "2025-12", // way old
    });
    const r = await checkQuota({ db, userId: "u_c", tier: "free", now: may2026 });
    expect(r.ok).toBe(true);
  });
});

describe("diagnosis quota — paid tiers", () => {
  it("returns unlimited for pro (no DB read necessary)", async () => {
    const db = makeDb({
      diagnoses_this_month: 999_999,
      diagnoses_month_key: "2026-05",
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
    const db = makeDb({ diagnoses_this_month: 0, diagnoses_month_key: "2026-05" });
    await incrementQuota({ db, userId: "u_d", monthKey: "2026-05" });
    expect((db as unknown as { _updates: Array<{ monthKey: string }> })._updates[0]?.monthKey).toBe("2026-05");
  });
});
