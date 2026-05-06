# PROD_LAUNCH_REPORT.md

FixMyIron AI Mechanic — production launch verification report.
Generated 2026-05-06 on commit `48f97a1` (legacy-link migration commits below).

## What is live

| Hostname | Backend | Purpose |
|---|---|---|
| `www.fixmyiron.com` | Cloud Run `heavy-equipment-mechanic` (us-east4, project `iron-direct-reach-vmax`), revision `heavy-equipment-mechanic-00008-xql` | Customer-facing marketing + AI live-desk; entry point for all new portal traffic |
| `portal.fixmyiron.com` | Cloudflare Worker `fixmyiron-web-prod` | Auth-gated `/portal` slice; host-scoped `/` → `/portal` redirect |
| `api.fixmyiron.com` | Cloudflare Worker `fixmyiron-api-prod` | API (Hono), `WEB_ORIGIN=https://portal.fixmyiron.com` |
| `media.fixmyiron.com` | Cloudflare R2 bucket `fixmyiron-media-prod` (custom domain) | Marketing video, future media |
| `accounts.fixmyiron.com` | Clerk hosted Account Portal | Sign-in / sign-up |
| `fixmyiron.com` (apex) | Unrouted (DNS empty) | Intentional — apex stays unrouted |

## PART A — Legacy site link migration

Source pulled from `gs://run-sources-iron-direct-reach-vmax-us-east4/services/heavy-equipment-mechanic/1777656487.646048-…zip`. Five edits applied to a single file (`client/src/pages/live-desk.tsx`); nothing else touched.

| Line | Change |
|---|---|
| 1607 | `<a href="/portal">Customer Portal</a>` → `<a href="https://portal.fixmyiron.com/portal">…</a>` |
| 1810 | `<a href="/portal">Portal</a>` → `<a href="https://portal.fixmyiron.com/portal">…</a>` |
| 2247 | `<a href="/portal">Customer Portal</a>` → `<a href="https://portal.fixmyiron.com/portal">…</a>` |
| 2148 | `onClick={() => setLocation("/auth?redirect=/live-desk")}` → `onClick={() => window.location.href = "https://portal.fixmyiron.com/portal/diagnosis"}` |
| 2210 | `setLocation("/auth?redirect=/live-desk");` → `window.location.href = "https://portal.fixmyiron.com/portal/diagnosis";` |

Deployed via `gcloud run deploy heavy-equipment-mechanic --source . --region=us-east4 --project=iron-direct-reach-vmax --quiet`. Revision flipped to `heavy-equipment-mechanic-00008-xql` serving 100% of traffic.

Live verification: bundled JS at `https://www.fixmyiron.com/assets/index-BzPHH0f_.js` contains exactly **5** new portal URLs (3× `/portal` + 2× `/portal/diagnosis`), matching the edits 1:1. Old `setLocation("/auth?redirect=/live-desk")` and `href="/portal"` patterns are gone from the bundle.

Working dir `/tmp/legacy-fixmyiron` cleaned up.

## PART B — Autonomous prod verification

All checks PASS or SKIP-with-justification. No FAIL.

### Surface ladder (curl, DNS-bypass with `--resolve` to dodge local DNS lag)

| Check | Result |
|---|---|
| `portal.fixmyiron.com/` | PASS — 307 → `/portal` (host-scoped redirect from `next.config.mjs`) |
| `portal.fixmyiron.com/portal` (anon) | PASS — 307 → `accounts.fixmyiron.com/sign-in?redirect_url=…` |
| `portal.fixmyiron.com/portal/parts` | PASS — 307 (Clerk gate) |
| `portal.fixmyiron.com/portal/diagnosis` | PASS — 307 (Clerk gate) |
| `portal.fixmyiron.com/portal/troubleshooting` | PASS — 307 (Clerk gate) |
| `portal.fixmyiron.com/portal/fault-codes` | PASS — 307 (Clerk gate) |
| `portal.fixmyiron.com/portal/billing` | PASS — 307 (Clerk gate) |
| `portal.fixmyiron.com/portal/equipment` | PASS — 307 (Clerk gate) |
| `portal.fixmyiron.com/portal/predictive` | PASS — 307 (Clerk gate) |
| `portal.fixmyiron.com/portal/recommended-parts` | PASS — 307 (Clerk gate) |
| `portal.fixmyiron.com/portal/repair-plan` | PASS — 307 (Clerk gate) |
| `api.fixmyiron.com/healthz` | PASS — 200 `{"ok":true,"env":"sandbox"}` |
| `api.fixmyiron.com/healthz/db` | PASS — 200 `{"ok":true}` |
| `media.fixmyiron.com/learn-more.mp4` | PASS — 200 `video/mp4`, 78,783,518 bytes, `cache-control: public, max-age=2592000, immutable` |
| `www.fixmyiron.com/` | PASS — 200, `Server: Google Frontend` (legacy intact) |
| Legacy bundle has 5 new portal URLs | PASS — 3× `/portal` + 2× `/portal/diagnosis` in `/assets/index-BzPHH0f_.js` |
| `dig fixmyiron.com +short @1.1.1.1` | PASS — empty (apex unrouted) |

### API gating + CORS + Clerk webhook

| Check | Result |
|---|---|
| `GET /api/parts/search?q=hydraulic+pump` (anon) | PASS — 401 `{"error":{"code":"UNAUTHENTICATED","message":"Sign in required"}}` |
| `GET /api/fault-codes/SPN-3251-FMI-0` (anon) | SKIP — returns 401 by design (`faultCodesRoutes.use("*", requireAuth)` at `workers/api/src/routes/fault-codes.ts:14`). Free-tier truncation happens *after* auth via `viewerSeesPaidFields()`; the original spec assumed unauthenticated access, which the route handler does not provide. |
| OPTIONS preflight from `Origin: https://portal.fixmyiron.com` | PASS — 204 `Access-Control-Allow-Origin: https://portal.fixmyiron.com`, methods `GET,POST,PATCH,DELETE,OPTIONS`, headers `authorization,content-type` |
| `POST /api/webhooks/clerk` with bogus `svix-signature` | PASS — 401 (signature verification fires correctly; replay-window + HMAC reject the request) |

### D1 prod data

| Check | Result |
|---|---|
| `parts` total | PASS — 43,784 (matches staging exactly; earlier snapshot of 43,729 was D1 read-replica lag during/after the costex resume) |
| `parts WHERE source_file LIKE '%cat_parts%'` | PASS — 26,053 |
| `parts WHERE source_file LIKE '%costex%'` | PASS — 17,731 |
| `fault_codes` | PASS — 957 |
| `users` | PASS — 0 (clean prod, no test data) |
| `equipment` | PASS — 0 (clean prod) |
| Tables present | PASS — `d1_migrations, diagnostic_sessions, equipment, fault_codes, parts, parts_fts (+ fts internals), subscriptions, users` |
| `parts_fts MATCH 'hydraulic'` | PASS — 1,318 hits |

### Wrangler secret verification

| Worker | Expected | Actual | Result |
|---|---|---|---|
| `fixmyiron-api-prod` | 7 (`ANTHROPIC_API_KEY, CLERK_SECRET_KEY, CLERK_WEBHOOK_SECRET, PADDLE_API_KEY, PADDLE_PRICE_PRO, PADDLE_PRICE_SHOP, PADDLE_WEBHOOK_SECRET`) | 7 | PASS |
| `fixmyiron-web-prod` | 1 (`CLERK_SECRET_KEY`) | 1 | PASS |

## Resource inventory

### Production (this cutover)

| Type | Name | ID / locator |
|---|---|---|
| Worker | fixmyiron-api-prod | `api.fixmyiron.com` (custom domain) + workers.dev fallback |
| Worker | fixmyiron-web-prod | `portal.fixmyiron.com` (custom domain) + workers.dev fallback |
| D1 | fixmyiron-prod | `16bb71a1-f57f-4e37-bf12-d2f74a693aca` |
| KV | fixmyiron-paddle-events-seen-prod | `4227f5619ed64ceba2490b400143a476` |
| KV | fixmyiron-rate-limits-prod | `8c60c2ca218d4c4c97700a41541a8bfa` |
| KV | fixmyiron-sessions-prod | `1174c6d5f01e439789f3a28d42453f26` |
| Queue | fixmyiron-jobs-prod | producer-only binding |
| R2 | fixmyiron-media-prod | `media.fixmyiron.com` (custom domain) — public learn-more.mp4 |
| R2 | fixmyiron-assets-prod | private — wired for future PDF export (DEFERRED) |
| DO | DiagnosticSession (per Worker) | auto-created namespace on `fixmyiron-api-prod` |

### Staging (untouched — fully operational for ongoing dev/QA)

| Type | Name | ID / locator |
|---|---|---|
| Worker | fixmyiron-api-staging | `fixmyiron-api-staging.americanironadmin.workers.dev` |
| Worker | fixmyiron-web-staging | `fixmyiron-web-staging.americanironadmin.workers.dev` |
| D1 | fixmyiron-staging | `74ce90d6-d3f7-4431-8743-804dd3b6d371` |
| KV | fixmyiron-paddle-events-seen-staging | `1cf3e33f79e74cb0a0b2bb082be2ba21` |
| KV | fixmyiron-rate-limits-staging | `4129b00bc060470aa21ad460e5058aa2` |
| KV | fixmyiron-sessions-staging | `388a24b3ecc14909b7e63d73bc4fbbf7` |
| Queue | fixmyiron-jobs-staging | producer-only |
| R2 | fixmyiron-media-staging | managed `pub-ebb6e7a11e2c4eafb3821ce2e65e06ee.r2.dev` |

### Legacy (Cloud Run, untouched aside from link edits)

| Type | Name | Locator |
|---|---|---|
| Cloud Run service | heavy-equipment-mechanic | `iron-direct-reach-vmax` / `us-east4` |
| Latest revision | heavy-equipment-mechanic-00008-xql | this commit's deploy |
| Source bucket | run-sources-iron-direct-reach-vmax-us-east4 | service path `/services/heavy-equipment-mechanic/` |

## Outstanding items (intentionally deferred)

### Paddle billing (DEFERRED — playbook already in repo)

`PRODUCTION_CUTOVER.md` §11 has the full activation playbook. Today, Paddle secrets are placeholders (`PADDLE_API_KEY=pdl_sdbx_apikey_DEFERRED_PLACEHOLDER`, etc.) and `/pricing` CTAs are mailto links. To activate:
1. Create Paddle product + Pro/Shop monthly prices in sandbox.
2. Replace placeholder secrets with real `pdl_sdbx_apikey_…`, real webhook signing secret, real `pri_…` IDs.
3. Replace `/pricing` mailto CTAs with `paddle.Checkout.open(...)` calls.
4. Replace `/portal/billing` placeholder with real `subscription` D1 read + Paddle customer-portal-session route.
5. Run §11.5 E2E suite (sandbox card 4242…).
6. Switch `PADDLE_ENVIRONMENT=production` after Paddle business verification clears.
7. Flip `VIEWER_SEES_PAID_FIELDS_FOR_ALL = false` in `workers/api/src/routes/fault-codes.ts`.

### Production cron disabled

Cloudflare account is at the 5-cron-trigger cap. `[triggers] crons = ["0 6 * * SUN"]` stays commented in `workers/api/wrangler.prod.toml`. Re-enable when:
1. Quota bump granted, OR another cron is freed up.
2. Uncomment the two lines in `wrangler.prod.toml`.
3. `wrangler deploy --config workers/api/wrangler.prod.toml`.

Until then, `fault_code_refresh` is a manual job (the `scheduled()` handler still runs if invoked, the queue producer binding stays wired).

### R2 PDF export DEFERRED

`fixmyiron-assets-prod` bucket is created and bound on the API Worker as `env.ASSETS`, but no product surface writes to it yet. Re-enabling when PDF export ships is code-only (no infra change).

### `wrangler d1 export` FTS5 limitation

`wrangler d1 export fixmyiron-prod --remote` fails with `cannot export databases with Virtual Tables (fts5)`. The parts catalog uses an FTS5 mirror, so D1 backups via wrangler aren't currently possible. The ingest scripts (`ingest-parts.py` + `seed-fault-codes.py`) and the data files (`data/cat_parts_inventory.xls`, `data/costex_2026.pdf`) are the source of truth — re-runnable from scratch. User-data tables (`users`, `equipment`, `subscriptions`, `diagnostic_sessions`) are reproducible from Clerk webhooks and customer activity. Revisit if Cloudflare adds FTS5 export support.

## Final manual end-to-end customer test (user-driven, ~10 minutes)

In an incognito browser:

- [ ] Visit `https://www.fixmyiron.com/` — confirm legacy site loads.
- [ ] Click any "Portal" / "Customer Portal" link — confirm it lands on `https://accounts.fixmyiron.com/sign-in?redirect_url=https://portal.fixmyiron.com/portal`.
- [ ] Click "REGISTER / SIGN IN TO START" — confirm it lands on `https://accounts.fixmyiron.com/sign-in?redirect_url=https://portal.fixmyiron.com/portal/diagnosis`.
- [ ] Sign up with a real email you can access.
- [ ] Verify the Clerk verification email arrives, click the link.
- [ ] After verification, you should land on `https://portal.fixmyiron.com/portal`.
- [ ] On the dashboard, navigate to:
  - [ ] `/portal/parts` — search "hydraulic pump", confirm results from both `cat_parts_inventory.xls` and `costex_2026.pdf`.
  - [ ] `/portal/diagnosis` — enter "Cat 320 hydraulic pressure dropping under load", click Run, confirm a real Anthropic Opus 4.7 response streams in.
  - [ ] `/portal/troubleshooting` — start the wizard, answer one question.
  - [ ] `/portal/fault-codes` — search "SPN 3251", confirm the rich (paid-fields) view renders (current scope: `VIEWER_SEES_PAID_FIELDS_FOR_ALL = true`).
  - [ ] `/portal/billing` — confirm "Free plan" placeholder.
  - [ ] `/portal/equipment` — try adding a piece of equipment, confirm it persists.
- [ ] Open DevTools console — confirm no red errors anywhere.
- [ ] Run from a terminal:
  ```
  npx wrangler d1 execute fixmyiron-prod --remote --config workers/api/wrangler.prod.toml \
    --command "SELECT clerk_user_id, email, tier, created_at FROM users ORDER BY created_at DESC LIMIT 1"
  ```
  Confirm your test user appears with `tier='free'` and a `created_at` within the last few minutes.
- [ ] Decide whether to keep your test user account or delete it via the Clerk dashboard.
