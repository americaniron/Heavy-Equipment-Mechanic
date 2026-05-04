import type { MiddlewareHandler } from "hono";
import type { Env, Tier, Variables, SubscriptionStatus } from "../env";
import { jsonError, ErrorCode } from "./errors";

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, shop: 2 };

/** 3 days in seconds — past_due grace window before downgrade. */
const PAST_DUE_GRACE_SECONDS = 3 * 24 * 60 * 60;

interface SubRow {
  tier: Tier;
  status: SubscriptionStatus;
  past_due_since: number | null;
  current_period_end: number | null;
}

/**
 * Reads the user's *effective* tier from D1 subscriptions (NOT JWT).
 * Single source of truth so a Paddle webhook downgrade is honored on the
 * very next request — the JWT cache cannot lie to us.
 *
 * Rules:
 *   - active / trialing  → sub.tier
 *   - past_due           → sub.tier if within 3 days of past_due_since,
 *                          else 'free'
 *   - paused / canceled  → 'free'
 *   - no row             → 'free'
 */
export async function effectiveTier(
  db: D1Database,
  userId: string,
): Promise<Tier> {
  const row = await db
    .prepare(
      "SELECT tier, status, past_due_since, current_period_end FROM subscriptions WHERE user_id = ?1",
    )
    .bind(userId)
    .first<SubRow>();

  if (!row) return "free";

  if (row.status === "active" || row.status === "trialing") return row.tier;

  if (row.status === "past_due") {
    const since = row.past_due_since ?? 0;
    const now = Math.floor(Date.now() / 1000);
    if (since > 0 && now - since <= PAST_DUE_GRACE_SECONDS) return row.tier;
    return "free";
  }

  // paused | canceled
  return "free";
}

/**
 * Hono middleware factory. Use:
 *   app.post('/portal/diagnosis', requireTier('pro'), handler);
 *
 * The user's tier MUST be read from D1 each request (no JWT cache) so
 * downgrades are immediate. requires() prior auth middleware to have set
 * c.var.userId.
 */
export function requireTier(
  minimum: Tier,
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  const minRank = TIER_RANK[minimum];
  return async (c, next) => {
    const userId = c.get("userId");
    if (!userId) {
      return jsonError(c, 401, ErrorCode.Unauthenticated, "Sign in required");
    }
    const tier = await effectiveTier(c.env.DB, userId);
    c.set("tier", tier);
    if (TIER_RANK[tier] < minRank) {
      return jsonError(
        c,
        403,
        ErrorCode.TierRequired,
        `This feature requires the ${minimum} plan or higher.`,
        "Upgrade at /portal/billing or /pricing.",
      );
    }
    await next();
  };
}
