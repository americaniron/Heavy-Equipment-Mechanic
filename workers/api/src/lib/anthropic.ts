/**
 * Single Claude Opus 4.7 client. Every Worker call to Anthropic flows
 * through here so the retry, fallback, rate-limit, and logging policy
 * are consistent.
 *
 * Defaults to model `claude-opus-4-7`. If the model returns 404
 * (not enabled on the account), retries the same call once on
 * `claude-opus-4-6`, logs the downgrade explicitly. Never downgrade
 * silently — operators must see it.
 *
 * Retries: up to 3 attempts on 5xx and 429 (honoring retry-after when
 * present), with exponential backoff (250ms, 750ms, ~2s) and ±20% jitter.
 * Does NOT retry 4xx other than 429. The SDK's built-in retries are
 * disabled (maxRetries: 0) to avoid duplicate retry chains.
 *
 * Rate limit: per-user, KV-backed, default 30 req/hr/user. Bypassed when
 * `userId` is omitted (e.g., system-internal calls). Returning rate-limited
 * responses is the caller's responsibility — we throw a typed error so
 * the route handler can map to a 429 with hint.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../env";
import { checkAndIncrement } from "./ratelimit";
import { log } from "./log";

export const PRIMARY_MODEL = "claude-opus-4-7";
export const FALLBACK_MODEL = "claude-opus-4-6";

export class RateLimitError extends Error {
  readonly resetMs: number;
  constructor(resetMs: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
    this.resetMs = resetMs;
  }
}

export interface CompleteArgs {
  /** System prompt — should be loaded from src/prompts/<name>.ts. */
  system: string;
  /** Conversation turns. */
  messages: Anthropic.MessageParam[];
  /** Required to enforce per-user rate limit. */
  userId?: string;
  /** Default 4096; raise for long playbooks. */
  maxTokens?: number;
  /** Default 1.0. */
  temperature?: number;
  /** Override request id for log correlation. */
  requestId?: string;
  /** Per-user max requests/hr. Default 30. */
  rateLimitPerHour?: number;
  /** Bypass model fallback (for tests). */
  skipFallback?: boolean;
}

export interface CompleteResult {
  text: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

const RETRY_BASE_MS = 250;

function withJitter(ms: number): number {
  const delta = ms * 0.2;
  return ms + (Math.random() * 2 - 1) * delta;
}

function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true; // network error — retry
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

function getRetryAfterMs(err: unknown): number | null {
  if (!(err instanceof Anthropic.APIError)) return null;
  const headers = err.headers as Record<string, string> | undefined;
  if (!headers) return null;
  const ra = headers["retry-after"] ?? headers["Retry-After"];
  if (!ra) return null;
  const n = Number(ra);
  if (Number.isFinite(n) && n >= 0) return n * 1000;
  const date = Date.parse(ra);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

let _client: Anthropic | null = null;
function getClient(env: Env): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      maxRetries: 0,
    });
  }
  return _client;
}

async function callOnce(
  client: Anthropic,
  model: string,
  args: CompleteArgs,
): Promise<Anthropic.Message> {
  return client.messages.create({
    model,
    max_tokens: args.maxTokens ?? 4096,
    temperature: args.temperature ?? 1.0,
    system: args.system,
    messages: args.messages,
  });
}

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter(
      (b): b is Anthropic.TextBlock => "type" in b && b.type === "text",
    )
    .map((b) => b.text)
    .join("\n");
}

/**
 * Run a Claude completion with retries, rate limiting, and model fallback.
 * Throws RateLimitError if the per-user budget is exhausted; otherwise
 * surfaces the underlying Anthropic.APIError on terminal failure.
 */
export async function complete(
  env: Env,
  args: CompleteArgs,
): Promise<CompleteResult> {
  // Per-user rate limit (when userId provided).
  if (args.userId) {
    const rl = await checkAndIncrement({
      env,
      userId: args.userId,
      max: args.rateLimitPerHour ?? 30,
    });
    if (!rl.ok) {
      log.warn("anthropic_rate_limited", {
        userId: args.userId,
        requestId: args.requestId ?? "",
        resetMs: rl.resetMs,
      });
      throw new RateLimitError(rl.resetMs);
    }
  }

  const client = getClient(env);
  let model = PRIMARY_MODEL;
  let attempt = 0;
  const maxAttempts = 3;
  let lastErr: unknown = null;

  while (attempt < maxAttempts) {
    attempt++;
    const started = Date.now();
    try {
      const msg = await callOnce(client, model, args);
      log.info("anthropic_ok", {
        requestId: args.requestId ?? "",
        userId: args.userId ?? "",
        model,
        attempt,
        ms: Date.now() - started,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      });
      return {
        text: extractText(msg),
        modelUsed: model,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
        stopReason: msg.stop_reason,
      };
    } catch (e) {
      lastErr = e;
      const status =
        e instanceof Anthropic.APIError ? e.status : undefined;

      // Model fallback — 404 means the primary model isn't enabled on this
      // account. Try the fallback once. This is loud, never silent.
      if (
        status === 404 &&
        model === PRIMARY_MODEL &&
        !args.skipFallback
      ) {
        log.warn("anthropic_model_fallback", {
          requestId: args.requestId ?? "",
          userId: args.userId ?? "",
          from: PRIMARY_MODEL,
          to: FALLBACK_MODEL,
          reason: "primary_model_404",
        });
        model = FALLBACK_MODEL;
        // This isn't a "retry" in the backoff sense — reset attempt counter
        // for the fallback model so it gets its own 3 attempts.
        attempt = 0;
        continue;
      }

      if (!isRetryableStatus(status) || attempt >= maxAttempts) {
        log.error("anthropic_failed", {
          requestId: args.requestId ?? "",
          userId: args.userId ?? "",
          model,
          attempt,
          status,
          err: e instanceof Error ? e.message : String(e),
        });
        throw e;
      }

      const retryAfter = getRetryAfterMs(e);
      const backoff =
        retryAfter ?? withJitter(RETRY_BASE_MS * Math.pow(3, attempt - 1));
      log.warn("anthropic_retry", {
        requestId: args.requestId ?? "",
        userId: args.userId ?? "",
        model,
        attempt,
        status,
        backoffMs: Math.round(backoff),
      });
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  // Exhausted retries. lastErr is set because the loop only exits via throw
  // or successful return otherwise.
  throw lastErr ?? new Error("anthropic_exhausted_retries");
}

/**
 * Convenience: a single user-message completion with no prior conversation.
 * Use complete() directly when you need multi-turn context.
 */
export async function completeOne(
  env: Env,
  args: Omit<CompleteArgs, "messages"> & { user: string },
): Promise<CompleteResult> {
  return complete(env, {
    ...args,
    messages: [{ role: "user", content: args.user }],
  });
}
