/**
 * Per-user fixed-window rate limit backed by a KV namespace.
 * Window: 1 hour. Key: `rl:${userId}:${hour}`. Value: count as decimal string.
 *
 * KV is eventually consistent across regions, so a short cross-region burst
 * may exceed `max` by a small amount. That's acceptable for AI request
 * throttling — we want a soft ceiling, not a hard one. Hard limits must be
 * enforced on the user's effective tier before this runs.
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

const HOUR_MS = 60 * 60 * 1000;

export async function checkAndIncrement(args: {
  env: Env;
  userId: string;
  scope?: string;
  max: number;
  now?: () => number;
}): Promise<RateLimitResult> {
  const { env, userId, max } = args;
  const scope = args.scope ?? "anthropic";
  const now = args.now ?? Date.now;
  const t = now();
  const hour = Math.floor(t / HOUR_MS);
  const key = `rl:${scope}:${userId}:${hour}`;

  const raw = await env.RATE_LIMITS.get(key);
  const cur = raw ? Number(raw) : 0;
  const resetMs = (hour + 1) * HOUR_MS - t;

  if (Number.isNaN(cur) || cur >= max) {
    return { ok: false, resetMs };
  }

  // TTL must be at least 60s (KV minimum). Hour-end is always > 60s ahead
  // unless we're in the last minute — clamp upward.
  const ttl = Math.max(60, Math.ceil(resetMs / 1000));
  await env.RATE_LIMITS.put(key, String(cur + 1), { expirationTtl: ttl });

  return { ok: true, remaining: Math.max(0, max - cur - 1), resetMs };
}
