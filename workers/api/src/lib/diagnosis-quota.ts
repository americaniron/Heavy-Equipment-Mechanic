import type { D1Database } from "@cloudflare/workers-types";
import type { Tier } from "../env";

/**
 * Diagnosis quota: 3/month for free, unlimited for pro/shop.
 *
 * Lazy month rollover: every check compares the user's stored
 * `diagnoses_month_key` (YYYY-MM) against the current month derived
 * from `now`. Mismatch → reset counter to 0, set new key, then count
 * the in-progress request. No cron job required.
 *
 * Two-step contract:
 *   1. checkQuota() — returns ok/denied without mutating; route
 *      handler decides whether to proceed.
 *   2. incrementQuota() — called only AFTER a successful Anthropic
 *      call, so a model failure doesn't burn the user's quota.
 */

const FREE_MONTHLY_LIMIT = 3;

export interface QuotaOk {
  ok: true;
  remaining: number | null; // null = unlimited
  monthKey: string;
}
export interface QuotaDenied {
  ok: false;
  reason: "monthly_limit";
  limit: number;
  monthKey: string;
}
export type QuotaResult = QuotaOk | QuotaDenied;

function monthKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

interface UserQuotaRow {
  count: number;
}

export async function checkQuota(args: {
  db: D1Database;
  userId: string;
  tier: Tier;
  now?: () => number;
}): Promise<QuotaResult> {
  const now = (args.now ?? Date.now)();
  const currentMonth = monthKeyFromMs(now);

  if (args.tier === "pro" || args.tier === "shop") {
    return { ok: true, remaining: null, monthKey: currentMonth };
  }

  const row = await args.db
    .prepare(
      `SELECT count FROM ai_rate_limits
        WHERE customer_id = ?1 AND scope = 'diagnosis-monthly' AND window_start = ?2`,
    )
    .bind(Number(args.userId), `${currentMonth}-01 00:00:00`)
    .first<UserQuotaRow>();
  if (!row) {
    // Brand-new user (Clerk webhook hasn't run yet); treat as fresh.
    return { ok: true, remaining: FREE_MONTHLY_LIMIT - 1, monthKey: currentMonth };
  }

  const effectiveCount = row.count ?? 0;

  if (effectiveCount >= FREE_MONTHLY_LIMIT) {
    return {
      ok: false,
      reason: "monthly_limit",
      limit: FREE_MONTHLY_LIMIT,
      monthKey: currentMonth,
    };
  }
  return {
    ok: true,
    remaining: FREE_MONTHLY_LIMIT - effectiveCount - 1,
    monthKey: currentMonth,
  };
}

/**
 * Atomically increment using the current month key. If the stored
 * key differs (rollover), reset the counter to 1 in the same UPDATE.
 */
export async function incrementQuota(args: {
  db: D1Database;
  userId: string;
  monthKey: string;
}): Promise<void> {
  await args.db
    .prepare(
      `INSERT INTO ai_rate_limits (customer_id, scope, window_start, count)
       VALUES (?1, 'diagnosis-monthly', ?2, 1)
       ON CONFLICT(customer_id, scope, window_start)
       DO UPDATE SET count = count + 1`,
    )
    .bind(Number(args.userId), `${args.monthKey}-01 00:00:00`)
    .run();
}

export const DIAGNOSIS_FREE_MONTHLY_LIMIT = FREE_MONTHLY_LIMIT;
