/**
 * Per-user fixed-window rate limit backed by a KV namespace.
 *
 * Key: `rl:${scope}:${userId}:${windowIndex}`. Value: count as decimal
 * string. windowIndex is `floor(now / windowMs)`, so two callers in the
 * same window with the same scope share a counter and different scopes
 * are isolated buckets (Anthropic vs parts-search are independent).
 *
 * KV is eventually consistent across regions, so a short cross-region
 * burst may exceed `max` by a small amount. That's acceptable for soft
 * limits like AI throttling and search throttling. Hard limits (e.g.,
 * tier gates) must be enforced before this runs.
 */
import type { Env } from "../env";

export interface RateLimitOk {
  ok: true;
  remaining: number;
  resetMs: number;
}
export interface RateLimitDenied {
  ok: false;
  resetMs: number;
}
export type RateLimitResult = RateLimitOk | RateLimitDenied;

export const WINDOW_HOUR_MS = 60 * 60 * 1000;
export const WINDOW_MINUTE_MS = 60 * 1000;

export async function checkAndIncrement(args: {
  env: Env;
  userId: string;
  scope?: string;
  max: number;
  /**
   * Window length. Default 1 hour. KV TTL min is 60s, so any window
   * shorter than 60s is upper-bounded by KV's 60s floor — use 60s+
   * for accurate counting near window boundaries.
   */
  windowMs?: number;
  now?: () => number;
}): Promise<RateLimitResult> {
  const { env, userId, max } = args;
  const scope = args.scope ?? "anthropic";
  const windowMs = args.windowMs ?? WINDOW_HOUR_MS;
  const now = args.now ?? Date.now;
  const t = now();
  const windowIndex = Math.floor(t / windowMs);
  const key = `rl:${scope}:${userId}:${windowIndex}`;

  const raw = await env.RATE_LIMITS.get(key);
  const cur = raw ? Number(raw) : 0;
  const resetMs = (windowIndex + 1) * windowMs - t;

  if (Number.isNaN(cur) || cur >= max) {
    return { ok: false, resetMs };
  }

  // TTL must be >= 60s (KV minimum); clamp upward near window boundaries.
  const ttl = Math.max(60, Math.ceil(resetMs / 1000));
  await env.RATE_LIMITS.put(key, String(cur + 1), { expirationTtl: ttl });

  return { ok: true, remaining: Math.max(0, max - cur - 1), resetMs };
}
