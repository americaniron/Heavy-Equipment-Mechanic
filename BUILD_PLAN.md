# BUILD_PLAN.md — fixmyiron.com (Heavy-Equipment-Mechanic)

Foundation slice. Staging-only. No production deploy without explicit approval.
This document covers the foundation; the 9 product surfaces ship in subsequent slices.

## Scope of THIS slice

1. Monorepo scaffold (npm workspaces) — `web/` (Next.js 15 App Router on Cloudflare Pages) + `workers/api/` (Hono on Cloudflare Workers).
2. `wrangler.toml` per workspace declaring all bindings: D1, KV (3 namespaces), R2, Queue, Durable Object.
3. D1 schema + migrations for `users`, `subscriptions`, `equipment`, `diagnostic_sessions`, `fault_codes`, `parts` (+ FTS5 virtual table + sync triggers).
4. Clerk wiring: web `middleware.ts` protects `/portal/*` and redirects unauthenticated users to `https://accounts.fixmyiron.com/sign-in`. After auth, redirect to `/portal`. `/api/webhooks/clerk` (Worker) verifies Svix signature and upserts `users`.
5. Paddle Billing webhook handler at `/api/webhooks/paddle` (Worker): HMAC-SHA256 verification on the **raw** request body **before** `JSON.parse`, returns 401 on bad signature, KV idempotency via `PADDLE_EVENTS_SEEN` (7d TTL), upserts `subscriptions` and updates `users.tier` on `subscription.*` and `transaction.*` events. Sandbox-only for this slice (`PADDLE_ENVIRONMENT=sandbox`).
6. `requireTier()` middleware reading from D1 `subscriptions` (NOT JWT) so downgrades take effect immediately. `past_due` treated as active for 3 days, then downgraded.
7. `workers/api/src/lib/anthropic.ts` — single Claude Opus 4.7 client. Default `claude-opus-4-7`, fallback to `claude-opus-4-6` only if model returns 404 (logged, never silent). 3-attempt exponential backoff with jitter. Per-user KV rate limit (default 30 req/hr/user, configurable per route).
8. Per-item commits to `main` with `[staging-only]` tag. Push after each commit.
9. Attempt staging deploy of API Worker + Pages preview. If CF credentials absent, halt with named blockers — no fabrication.

## Out of scope (deferred to next slice)

- The 9 product surfaces (`/portal/diagnosis`, `/portal/troubleshooting`, `/portal/fault-codes`, `/portal/parts`, `/portal/recommended-parts`, `/portal/repair-plan`, `/portal/predictive`, `/portal/billing`, `/pricing` checkout flow).
- Ingest of `data/cat_parts_inventory.xls` (~26K rows) and `data/costex_2026.pdf` (~17K rows) — schema + FTS land now; ingest script lands with the parts surface.
- Cloudflare Cron Trigger + Queue consumer for fault-code refresh.
- Playwright E2E suite.
- Production deploy.

## Repository layout (after this slice)

```
/
├── BUILD_PLAN.md
├── package.json                       # npm workspaces root
├── tsconfig.base.json
├── .gitignore
├── .env.example                       # real var names, no values
├── data/                              # existing — gitignored where appropriate
│   ├── cat_parts_inventory.xls
│   └── costex_2026.pdf
├── migrations/                        # D1 SQL migrations (root, shared)
│   ├── 0001_init.sql
│   └── 0002_parts.sql
├── workers/
│   └── api/
│       ├── package.json
│       ├── tsconfig.json
│       ├── wrangler.toml
│       ├── src/
│       │   ├── index.ts               # Hono app entry
│       │   ├── env.ts                 # Bindings + Variables types
│       │   ├── lib/
│       │   │   ├── anthropic.ts       # Claude client (retries + KV rate limit)
│       │   │   ├── ratelimit.ts
│       │   │   ├── tier.ts            # requireTier() reads D1 subscriptions
│       │   │   ├── paddle-verify.ts   # HMAC-SHA256, raw body
│       │   │   ├── clerk-verify.ts    # Svix HMAC
│       │   │   ├── errors.ts          # JSON error shape { error: { code, message, hint? } }
│       │   │   └── log.ts             # structured logging
│       │   ├── routes/
│       │   │   ├── health.ts
│       │   │   └── webhooks/
│       │   │       ├── clerk.ts
│       │   │       └── paddle.ts
│       │   ├── do/
│       │   │   └── diagnostic-session.ts   # Durable Object class (declared, used by next slice)
│       │   └── prompts/
│       │       └── .gitkeep           # diagnosis.ts, recommended-parts.ts land with surfaces
│       └── test/
│           ├── paddle-verify.test.ts
│           └── tier.test.ts
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── next.config.mjs
    ├── tailwind.config.ts
    ├── postcss.config.js
    ├── middleware.ts                   # Clerk middleware
    ├── .env.example
    ├── app/
    │   ├── layout.tsx                  # ClerkProvider + brand shell
    │   ├── page.tsx                    # landing + monetization banner
    │   ├── globals.css                 # tailwind base + brand tokens
    │   ├── pricing/page.tsx            # placeholder (full checkout in next slice)
    │   ├── portal/
    │   │   ├── layout.tsx              # auth-gated shell
    │   │   └── page.tsx                # portal home (placeholder; surfaces next slice)
    │   └── sign-in/[[...sign-in]]/page.tsx   # bounces to accounts.fixmyiron.com
    ├── components/
    │   └── monetization-banner.tsx
    └── lib/
        └── env.ts
```

## D1 schema (migrations/0001_init.sql)

- **users** — `clerk_user_id` PK, `email`, `tier ENUM('free','pro','shop') DEFAULT 'free'`, `created_at`, `updated_at`.
- **subscriptions** — `user_id` PK FK→users, `paddle_customer_id`, `paddle_subscription_id`, `paddle_price_id`, `tier`, `status ENUM('active','trialing','past_due','paused','canceled')`, `current_period_end INTEGER`, `updated_at`. Index on `paddle_customer_id`, `paddle_subscription_id`.
- **equipment** — `id` PK, `user_id` FK, `make`, `model`, `year`, `serial`, `hours`, `created_at`.
- **diagnostic_sessions** — `id` PK, `user_id` FK, `equipment_id` FK NULLABLE, `tier_at_creation`, `status`, `summary_json TEXT`, `created_at`, `updated_at`.
- **fault_codes** — `code` PK, `description`, `severity`, `likely_causes_json`, `repair_actions_json`, `source_url`, `last_refreshed`.

## D1 schema (migrations/0002_parts.sql)

- **parts** — `id` INTEGER PK AUTOINCREMENT, `part_number`, `description`, `category`, `make`, `model_compat_json`, `price_usd REAL`, `stock_status`, `source_file`, `created_at`, `updated_at`. UNIQUE on `(part_number, source_file)`.
- **parts_fts** — FTS5 virtual table over `part_number`, `description`, `model_compat_json`. `content='parts'`, `content_rowid='id'`.
- Triggers: `parts_ai`, `parts_ad`, `parts_au` to keep FTS in sync (insert/delete/update).

## Worker bindings (workers/api/wrangler.toml)

- `DB` → D1 database `fixmyiron-staging`
- `PADDLE_EVENTS_SEEN` → KV (idempotency)
- `RATE_LIMITS` → KV (per-user Anthropic rate limit)
- `SESSIONS` → KV (lightweight session/cache)
- `ASSETS` → R2 bucket `fixmyiron-assets-staging`
- `JOBS` → Queue producer `fixmyiron-jobs-staging`
- `DIAGNOSTIC_SESSION` → Durable Object class `DiagnosticSession`

## Secrets required (Worker side, set via `wrangler secret put`)

`ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_PRO`, `PADDLE_PRICE_SHOP`. Plain vars (in `wrangler.toml [vars]`): `PADDLE_ENVIRONMENT=sandbox`, `CLERK_ACCOUNT_PORTAL_URL=https://accounts.fixmyiron.com`, `WEB_ORIGIN=https://<staging-pages-url>`.

## Public env (Pages, web/.env.example)

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENVIRONMENT`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=https://accounts.fixmyiron.com/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=https://accounts.fixmyiron.com/sign-up`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/portal`. Server-only on Pages: `CLERK_SECRET_KEY`.

## Commit plan (each tagged `[staging-only]`)

1. `chore: add BUILD_PLAN.md [staging-only]`
2. `chore(infra): scaffold monorepo + wrangler bindings [staging-only]`
3. `feat(db): D1 schema (users, subs, equipment, sessions, fault_codes) + parts FTS5 [staging-only]`
4. `feat(auth): Clerk middleware + /api/webhooks/clerk + requireTier() [staging-only]`
5. `feat(billing): Paddle webhook handler with HMAC-SHA256 + KV idempotency [staging-only]`
6. `feat(ai): Anthropic Opus 4.7 client with retries + per-user KV rate limit [staging-only]`

## Verification gates per item

- `tsc --noEmit` (workspace-wide) — must pass
- `wrangler d1 migrations apply fixmyiron-staging --local` — must apply cleanly + row counts logged
- Unit tests (Vitest, where written): paddle signature verify, requireTier(), anthropic backoff
- After commit 6: `wrangler deploy --dry-run` for the Worker; `next build` for web

## Deploy plan (staging)

- Worker: `wrangler deploy` to `fixmyiron-api-staging`. Default `*.workers.dev` route; no DNS change to fixmyiron.com.
- Pages: `wrangler pages deploy` to project `fixmyiron-web-staging`. Default `*.pages.dev` preview URL.
- D1: `wrangler d1 migrations apply fixmyiron-staging --remote`.
- KV/R2/Queue/DO created via wrangler before deploy; IDs pasted into `wrangler.toml`.

## Halt conditions (do not fabricate)

- Missing `.dev.vars` keys → halt at deploy step, list names.
- Missing `CF_API_TOKEN` / `CF_ACCOUNT_ID` → halt at deploy step.
- D1 migration failure → halt with full SQL error.
- `next build` failure → halt with first error.

## Brand tokens

Industrial dark theme + safety-orange accent (`--accent: 24 100% 50%`). Tailwind config defines `bg-equipment` (slate-900-ish), `text-foreground` (zinc-100), `accent` (orange-500). Real palette to be tightened against live fixmyiron.com when product surfaces land.
