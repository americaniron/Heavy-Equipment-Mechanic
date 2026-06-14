/**
 * Cloudflare Worker bindings + secrets.
 *
 * Bindings come from wrangler.toml; secrets from `wrangler secret put` (or
 * .dev.vars locally). Every binding declared here MUST exist in wrangler.toml.
 */
export interface Env {
  // Bindings
  DB: D1Database;
  PADDLE_EVENTS_SEEN: KVNamespace;
  RATE_LIMITS: KVNamespace;
  SESSIONS: KVNamespace;
  AUTH_KV: KVNamespace;  // For session tokens
  EMAIL?: {
    send: (message: {
      to: string | string[];
      from: string;
      subject: string;
      html: string;
      text?: string;
    }) => Promise<unknown>;
  };
  // ASSETS (R2) — re-add when token has r2 scope. See wrangler.toml comment.
  JOBS: Queue<JobMessage>;
  DIAGNOSTIC_SESSION: DurableObjectNamespace;

  // Plain vars (wrangler.toml [vars])
  PADDLE_ENVIRONMENT: "sandbox" | "production";
  CLERK_ACCOUNT_PORTAL_URL: string;
  WEB_ORIGIN: string;

  // Secrets (wrangler secret put / .dev.vars)
  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  PUBLIC_BASE_URL?: string;
  CLERK_SECRET_KEY: string;
  CLERK_WEBHOOK_SECRET: string;
  PADDLE_API_KEY: string;
  PADDLE_WEBHOOK_SECRET: string;
  PADDLE_PRICE_PRO: string;
  PADDLE_PRICE_SHOP: string;
}

/**
 * Discriminated union for queue messages so consumers can switch on `kind`.
 * Add a new variant when a new async job type lands.
 */
export type JobMessage =
  | { kind: "fault_code_refresh"; code: string }
  | { kind: "enrichment"; user_id: string }
  | { kind: "email"; to: string; template: string; data: Record<string, unknown> };

export type Tier = "free" | "pro" | "shop";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled";

/** Variables attached to Hono context after auth middleware runs. */
export interface Variables {
  userId?: string;
  customerId?: number;
  userEmail?: string;
  tier?: Tier;
  requestId: string;
}
