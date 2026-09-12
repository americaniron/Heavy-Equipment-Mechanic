/**
 * Cloudflare Worker bindings + secrets.
 *
 * Bindings come from wrangler.toml; secrets from `wrangler secret put` (or
 * .dev.vars locally). Every binding declared here MUST exist in wrangler.toml.
 */
export interface Env {
  DB: D1Database;
  PADDLE_EVENTS_SEEN: KVNamespace;
  RATE_LIMITS: KVNamespace;
  SESSIONS: KVNamespace;
  AUTH_KV: KVNamespace;
  EMAIL?: {
    send: (message: {
      to: string | string[];
      from: string;
      subject: string;
      html: string;
      text: string;
    }) => Promise<unknown>;
  };
  JOBS: Queue<JobMessage>;
  DIAGNOSTIC_SESSION: DurableObjectNamespace;

  /**
   * R2 buckets for uploaded artifacts (session photos/PDFs, portal assets).
   * Bound in wrangler.prod.toml (bucket `fixmyiron-assets-prod`) and in
   * staging/local `wrangler dev` for the upload path. Optional so the Worker
   * still boots in environments where the binding is not yet wired.
   */
  ASSETS?: R2Bucket;
  PORTAL_ASSETS?: R2Bucket;

  APP_ENV: string;
  PADDLE_ENVIRONMENT: "sandbox" | "production";
  CLERK_ACCOUNT_PORTAL_URL: string;
  WEB_ORIGIN: string;
  PUBLIC_BASE_URL?: string;

  /**
   * Shared admin console password. Set via `wrangler secret put ADMIN_PASSWORD`
   * in prod; never hard-coded. When unset the admin login fails closed (503) —
   * there is no fallback/backdoor password.
   */
  ADMIN_PASSWORD?: string;

  ANTHROPIC_API_KEY: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  CLERK_SECRET_KEY: string;
  CLERK_WEBHOOK_SECRET: string;
  CLERK_PUBLISHABLE_KEY?: string;

  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_SHOP?: string;
  STRIPE_PUBLISHABLE_KEY?: string;

  OPENAI_API_KEY?: string;
  HEYGEN_API_KEY?: string;
  LIVEAVATAR_API_KEY?: string;
  LIVEAVATAR_OPENAI_SECRET_ID?: string;
  LIVEAVATAR_SANDBOX?: string;

  /** Deprecated. Stripe replaced Paddle. Kept so existing secrets do not break boot. */
  PADDLE_API_KEY?: string;
  PADDLE_WEBHOOK_SECRET?: string;
  PADDLE_PRICE_PRO?: string;
  PADDLE_PRICE_SHOP?: string;
}

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

export interface Variables {
  userId?: string;
  customerId?: number;
  userEmail?: string;
  tier?: Tier;
  requestId: string;
}
