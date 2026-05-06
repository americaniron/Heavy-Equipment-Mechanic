# PRODUCTION_CUTOVER.md

Ordered playbook to flip fixmyiron.com from staging to production.
**Do NOT execute any step in this document without an explicit "deploy to prod" instruction.** This file is a planning artifact; the cutover is a single, deliberate session that follows it end-to-end.

## Pre-cutover DNS state — for rollback (captured 2026-05-06)

Resolved against 1.1.1.1 immediately before the apex was changed:

```
fixmyiron.com           A     (none)
fixmyiron.com           AAAA  (none)
fixmyiron.com           CNAME (none)
www.fixmyiron.com       CNAME ghs.googlehosted.com.    (Google Frontend; legacy React app)
www.fixmyiron.com       A     192.178.50.51            (resolved via ghs.googlehosted.com)
api.fixmyiron.com       (none)
media.fixmyiron.com     (none)
```

The apex itself was not routed pre-cutover (no A/AAAA/CNAME). www serves
Google's `Server: Google Frontend` — the legacy fixmyiron.com React app at
`ghs.googlehosted.com`. **DO NOT decommission the Google Frontend target after
cutover** — the rollback path (Step 10) requires it for "flip back to legacy".

## Cutover decisions — locked for this session

- **Cron triggers in prod:** SKIP. Cloudflare account quota stays at 5; no bump.
  Document `fault_code_refresh` as a manual job for now (re-enabled later by
  uncommenting `[triggers] crons = ["0 6 * * SUN"]` in `workers/api/wrangler.prod.toml`).
- **D1 data:** re-ingest into prod, do NOT copy from staging (avoids dragging
  test users / sessions into a fresh prod database).
- **API URL:** `api.fixmyiron.com` subdomain (DNS-only / proxy off).
- **Clerk after-sign-in URL:** relative `/portal` for both staging and prod.
- **Skip auth'd staging E2E:** auth'd Playwright suite runs against PROD only,
  post-cutover, in a real browser session. Reason: `auth.protect()` rewrite-to-404
  was misleading the CLI test path; replaced with `redirectToSignIn()` (see
  `web/middleware.ts`). Browser-driven testing on prod is faster and more
  representative than wrestling a Clerk session token through Playwright headless.

Staging today (verified): `fixmyiron-{api,web}-staging.americanironadmin.workers.dev` on Cloudflare account `1c07214c662a877a6d09d597d5f4a461`. All 9 product surfaces operational. 108 unit tests + 30 E2E tests passing (10 more E2E gated on a Clerk session token).

## 0 — PREREQUISITE CHECKLIST

Tick each before scheduling the cutover.

| # | Item | Owner | Notes |
|---|---|---|---|
| 0.1 | Clerk production instance verified, all 5 DNS records `Issued` SSL | done | accounts.fixmyiron.com live |
| 0.2 | Anthropic production API key issued (separate from staging) | you | console.anthropic.com → API Keys → "fixmyiron-prod" |
| 0.3 | Cloudflare account: cron-trigger quota bumped above 5 (currently capped — needed for fault-code refresh) | you | dashboard.cloudflare.com → Workers & Pages → Settings → request quota |
| 0.4 | OAuth token (or replacement API token) has `r2 (write)` scope | you | needed for PDF export R2 bucket (currently DEFERRED) |
| 0.5 | Decision: `api.fixmyiron.com` vs path-based routing for prod API | you | recommend subdomain — cleaner CORS, easier to swap |
| 0.6 | Backup of staging D1 (`fixmyiron-staging`) on disk | you | ❌ `wrangler d1 export` does NOT support databases with FTS5 virtual tables (parts catalog uses fts5). Workaround: rely on the ingest scripts as the source of truth (parts come from `data/*.csv`; fault codes from a deterministic SQL seed). User-data tables (users/equipment/diagnoses) carry no irreplaceable data on staging. Filed as wrangler limitation — revisit if Cloudflare adds FTS5 export support. |
| 0.7 | DNS provider: Cloudflare DNS active for fixmyiron.com (not external) | confirm | required for path-based Workers routes |
| 0.8 | All staging E2E tests run green with a real session token | you | `TEST_CLERK_SESSION_TOKEN=… cd web && npx playwright test` |
| 0.9 | This document reviewed end-to-end | you | sanity check before pulling the trigger |

**Paddle is intentionally OUT of this checklist.** Paddle activation is a separate, post-cutover task — see "DEFERRED — PADDLE INTEGRATION" at the bottom.

## 0a — MARKETING MEDIA (R2)

The landing page Learn-More video is served from a public R2 bucket via the
managed `r2.dev` subdomain in staging. For prod, use a custom subdomain so
the URL doesn't change if the bucket is renamed and so cache headers can be
controlled at the zone level.

```bash
# Create the prod media bucket
npx wrangler r2 bucket create fixmyiron-media-prod

# Re-upload the marketing video (kept out of git; lives at ./media/)
npx wrangler r2 object put fixmyiron-media-prod/learn-more.mp4 --remote \
  --file ./media/learn-more.mp4 \
  --content-type "video/mp4" \
  --cache-control "public, max-age=2592000, immutable"

# Verify
npx wrangler r2 object get fixmyiron-media-prod/learn-more.mp4 --remote --pipe | wc -c
# Expect: 78783518

# Set up custom subdomain media.fixmyiron.com
# 1. Cloudflare DNS for fixmyiron.com → add CNAME:
#      media.fixmyiron.com → public.r2.dev (proxied OFF)
# 2. R2 dashboard → fixmyiron-media-prod → Settings → Custom Domains →
#    Connect Domain → media.fixmyiron.com
# 3. Wait ~2 min for the cert.
# 4. Verify:
curl -sI https://media.fixmyiron.com/learn-more.mp4
# Expect: 200, content-type: video/mp4, content-length 78783518.

# Update the prod web wrangler config
# In web/wrangler.prod.jsonc vars block:
#   "NEXT_PUBLIC_LEARN_MORE_VIDEO_URL": "https://media.fixmyiron.com/learn-more.mp4"
```

If captions become available (the current build host has no ffmpeg, so the
mov_text subtitle track inside the source MP4 wasn't extracted), add the
.vtt to R2 and pass it as the `vttSrc` prop to `<LearnMoreVideoModal>`:

```bash
ffmpeg -i ./media/learn-more.mp4 -map 0:s:0 ./media/learn-more.vtt
npx wrangler r2 object put fixmyiron-media-prod/learn-more.vtt --remote \
  --file ./media/learn-more.vtt \
  --content-type "text/vtt; charset=utf-8" \
  --cache-control "public, max-age=2592000, immutable"
# Then in the page: <LearnMoreButton videoSrc={...} vttSrc={...} />
```

## 1 — CREATE PRODUCTION CLOUDFLARE RESOURCES

```bash
cd /path/to/Heavy-Equipment-Mechanic

# 1.1 D1
npx wrangler d1 create fixmyiron-prod
# → record the database_id; goes into workers/api/wrangler.prod.toml

# 1.2 KV namespaces (3)
npx wrangler kv namespace create fixmyiron-paddle-events-seen-prod
npx wrangler kv namespace create fixmyiron-rate-limits-prod
npx wrangler kv namespace create fixmyiron-sessions-prod
# → record each id

# 1.3 Queue (producer; consumer Worker can land later when fault-code
#     refresh becomes a real crawler)
npx wrangler queues create fixmyiron-jobs-prod

# 1.4 R2 bucket (PDF export; only if step 0.4 is satisfied)
npx wrangler r2 bucket create fixmyiron-assets-prod
```

## 2 — CREATE `wrangler.prod.toml` FILES

Mirror the staging files with prod resource IDs and a prod Worker name.

```bash
cp workers/api/wrangler.toml workers/api/wrangler.prod.toml
# Edit:
#   - name = "fixmyiron-api-prod"
#   - [vars] PADDLE_ENVIRONMENT = "production"  (after Paddle activation; "sandbox" until)
#   - [vars] CLERK_ACCOUNT_PORTAL_URL stays "https://accounts.fixmyiron.com"
#   - [vars] WEB_ORIGIN = "https://fixmyiron.com"
#   - All resource IDs swapped to prod.
#   - R2 [[r2_buckets]] re-enabled if step 0.4 is satisfied.
#   - [triggers] crons = ["0 6 * * SUN"]  (after step 0.3)

cp web/wrangler.jsonc web/wrangler.prod.jsonc
# Edit:
#   - name → "fixmyiron-web-prod"
#   - vars.NEXT_PUBLIC_API_URL → "https://api.fixmyiron.com"
#   - vars.NEXT_PUBLIC_PADDLE_ENVIRONMENT stays "sandbox" until Paddle activation
#   - vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY stays the same
#     (Clerk has one production instance for both staging and prod)
#   - vars.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN stays placeholder until Paddle activation
```

## 3 — PUSH PRODUCTION SECRETS

For each, `wrangler secret put` prompts; paste the prod value, hit enter (it never echoes).

```bash
# 3.1 API Worker — production secrets
npx wrangler secret put ANTHROPIC_API_KEY    --config workers/api/wrangler.prod.toml
npx wrangler secret put CLERK_SECRET_KEY     --config workers/api/wrangler.prod.toml
npx wrangler secret put CLERK_WEBHOOK_SECRET --config workers/api/wrangler.prod.toml
# Paddle secrets — use the placeholder strings below until Paddle activation:
echo -n "pdl_sdbx_apikey_DEFERRED_PLACEHOLDER" | npx wrangler secret put PADDLE_API_KEY        --config workers/api/wrangler.prod.toml
echo -n "pdl_ntfset_DEFERRED_PLACEHOLDER"      | npx wrangler secret put PADDLE_WEBHOOK_SECRET --config workers/api/wrangler.prod.toml
echo -n "pri_DEFERRED_PRO_PLACEHOLDER"         | npx wrangler secret put PADDLE_PRICE_PRO      --config workers/api/wrangler.prod.toml
echo -n "pri_DEFERRED_SHOP_PLACEHOLDER"        | npx wrangler secret put PADDLE_PRICE_SHOP     --config workers/api/wrangler.prod.toml

# 3.2 Web Worker — production secrets
npx wrangler secret put CLERK_SECRET_KEY     --config web/wrangler.prod.jsonc

# Verify nothing is missing:
npx wrangler secret list --config workers/api/wrangler.prod.toml
npx wrangler secret list --config web/wrangler.prod.jsonc
```

## 4 — APPLY D1 MIGRATIONS TO PRODUCTION

```bash
npx wrangler d1 migrations apply fixmyiron-prod --remote --config workers/api/wrangler.prod.toml
# Expect: 0001_init, 0002_parts, 0003_diagnosis_quota all ✅

# Seed parts catalog (~13 min):
python3 workers/api/scripts/ingest-parts.py --source both --apply
# Override DB_NAME by editing the script's DB_NAME constant, or pass via env.

# Seed fault codes (~30s):
python3 workers/api/scripts/seed-fault-codes.py --apply

# Verify:
npx wrangler d1 execute fixmyiron-prod --remote --config workers/api/wrangler.prod.toml \
  --command "SELECT
               (SELECT COUNT(*) FROM parts) AS parts,
               (SELECT COUNT(*) FROM fault_codes) AS fault_codes;"
# Expect: parts ≈ 43,784, fault_codes ≈ 957.
```

## 5 — DEPLOY THE PRODUCTION WORKERS

```bash
# 5.1 API Worker (no DNS yet — uses *.workers.dev for now)
npx wrangler deploy --config workers/api/wrangler.prod.toml
# Smoke:
curl -s https://fixmyiron-api-prod.americanironadmin.workers.dev/healthz      # → {"ok":true,"env":"sandbox",...}
curl -s https://fixmyiron-api-prod.americanironadmin.workers.dev/healthz/db   # → {"ok":true}

# 5.2 Web Worker
cd web
NEXT_PUBLIC_API_URL=https://fixmyiron-api-prod.americanironadmin.workers.dev \
NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<your pk_live_…> \
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_DEFERRED_PLACEHOLDER \
  npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy --config wrangler.prod.jsonc
# Smoke:
curl -sI https://fixmyiron-web-prod.americanironadmin.workers.dev/portal/parts
# → 30x or 404 with x-clerk-auth-status header. NOT 500.
```

## 6 — DNS CUTOVER FOR fixmyiron.com

DNS-only (proxied OFF) for the API subdomain so Cloudflare doesn't double-proxy your Worker. Web can be proxied or DNS-only — proxied gives you the Cloudflare CDN edge (good). Use the Cloudflare dashboard:

```
Type     Name              Content                                                    Proxy
CNAME    api.fixmyiron.com fixmyiron-api-prod.americanironadmin.workers.dev          DNS only
CNAME    fixmyiron.com     fixmyiron-web-prod.americanironadmin.workers.dev          Proxied (orange cloud)
CNAME    www               fixmyiron.com                                              Proxied (orange cloud)
```

Then add Worker custom domains:

```bash
# Tell each Worker which custom domain it should answer on.
# Wrangler will issue an SSL cert and bind the route automatically.
npx wrangler deployments view --config workers/api/wrangler.prod.toml
# In the dashboard: Workers & Pages → fixmyiron-api-prod → Settings →
# Triggers → Custom Domains → add api.fixmyiron.com.

# Same for web:
# Workers & Pages → fixmyiron-web-prod → Settings → Triggers →
# Custom Domains → add fixmyiron.com and www.fixmyiron.com.
```

After DNS propagates (typically <5 min for Cloudflare-hosted zones):

```bash
curl -s https://api.fixmyiron.com/healthz       # → 200 {"ok":true,...}
curl -s https://fixmyiron.com                   # → 200 landing page HTML
curl -sI https://fixmyiron.com/portal/parts     # → 30x or 404 with x-clerk-auth-status
```

## 7 — UPDATE WEB ENV TO POINT AT api.fixmyiron.com

The web Worker currently points at `fixmyiron-api-prod.americanironadmin.workers.dev`. Once DNS works, rebuild and redeploy with the canonical URL:

```bash
cd web
sed -i.bak 's|fixmyiron-api-prod.americanironadmin.workers.dev|api.fixmyiron.com|g' wrangler.prod.jsonc
NEXT_PUBLIC_API_URL=https://api.fixmyiron.com \
NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox \
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<your pk_live_…> \
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_DEFERRED_PLACEHOLDER \
  npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy --config wrangler.prod.jsonc
```

Update API CORS in the same edit:

```bash
# In workers/api/wrangler.prod.toml:
#   [vars] WEB_ORIGIN = "https://fixmyiron.com"
npx wrangler deploy --config workers/api/wrangler.prod.toml
```

## 8 — PRODUCTION SMOKE TEST (ordered)

Run these in order. Stop on first non-green.

```bash
# 8.1 Health
curl -s https://api.fixmyiron.com/healthz                                         # 200 {"ok":true,...}
curl -s https://api.fixmyiron.com/healthz/db                                      # 200 {"ok":true}

# 8.2 Public pages
curl -s -o /dev/null -w "%{http_code}\n" https://fixmyiron.com/                   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://fixmyiron.com/pricing            # 200
curl -s https://fixmyiron.com/ | grep -q "Sign up FREE" && echo banner_ok         # banner_ok

# 8.3 Auth gates
curl -s -o /dev/null -w "%{http_code}\n" https://api.fixmyiron.com/api/parts/search?q=hydraulic
                                                                                  # 401
curl -sI https://fixmyiron.com/portal/parts | grep -i x-clerk-auth-status          # signed-out

# 8.4 Sign up flow (browser)
# - open https://fixmyiron.com/sign-in → bounces to accounts.fixmyiron.com
# - sign up with a fresh email
# - confirm landing on https://fixmyiron.com/portal
# - confirm /api/webhooks/clerk fired (Clerk dashboard → Webhooks → Logs)
# - verify D1 users row exists:
npx wrangler d1 execute fixmyiron-prod --remote --config workers/api/wrangler.prod.toml \
  --command "SELECT clerk_user_id, email, tier FROM users ORDER BY created_at DESC LIMIT 5;"

# 8.5 E2E suite against prod
cd web
STAGING_WEB_URL=https://fixmyiron.com \
STAGING_API_URL=https://api.fixmyiron.com \
TEST_CLERK_SESSION_TOKEN=<grab from devtools after sign-in> \
  npx playwright test --project=chromium-desktop
# All ~40 should pass.
```

## 9 — ACCEPTANCE CRITERIA

Don't declare prod live until ALL are true:
- [ ] `https://api.fixmyiron.com/healthz` → 200, body `{"ok":true,"env":"sandbox"|"production"}`
- [ ] `https://fixmyiron.com/` → 200 landing with banner
- [ ] `/portal/*` returns Clerk-gated 30x or 404, NEVER 500, for signed-out users
- [ ] Fresh sign-up via Clerk → land on `/portal` → row visible in D1 `users`
- [ ] `/portal/parts` search "hydraulic pump" returns ≥1 hit from each source_file as a signed-in user
- [ ] `/portal/diagnosis` chat returns a real Claude reply (>20 chars) as a signed-in user
- [ ] `/portal/fault-codes/SPN-110-FMI-3` returns the rich (paid) view (per current feature flag)
- [ ] Equipment CRUD round-trip works
- [ ] Predictive returns either predictions or an empty_state contract
- [ ] All 30 anonymous E2E tests pass against the prod URLs
- [ ] All 10 auth'd E2E tests pass with a real session token
- [ ] Cloudflare Logpush or `wrangler tail` shows no unexpected 5xx in the first hour

## 10 — ROLLBACK PLAN

If anything breaks badly, revert in the dashboard — don't try to git-revert your way out. The DNS swap is the cheapest reversible action:

```
A. ROLLBACK DNS (fastest — 1 minute)
   Cloudflare DNS → fixmyiron.com CNAME content
   FROM: fixmyiron-web-prod.americanironadmin.workers.dev
   TO:   fixmyiron-web-staging.americanironadmin.workers.dev
   Same for api.fixmyiron.com if it was pointed.

B. ROLLBACK WORKER VERSION (if a deploy was bad)
   npx wrangler deployments list --name fixmyiron-api-prod
   npx wrangler rollback --message "rollback bad cutover" --name fixmyiron-api-prod
   # Same for fixmyiron-web-prod

C. ROLLBACK D1 (only if the migration itself broke data)
   # We have a backup from step 0.6:
   sqlite3 staging-backup-YYYY-MM-DD.sqlite < restore.sql
   # Manually craft restore SQL or use wrangler d1 import.

D. EMERGENCY: drop the prod Worker entirely
   npx wrangler delete --name fixmyiron-api-prod
   npx wrangler delete --name fixmyiron-web-prod
   # Then restore DNS to staging (option A).
```

Acceptable downtime targets:
- Step A (DNS rollback): RTO ~5 min (depends on DNS propagation; Cloudflare is fast)
- Step B (Worker rollback): RTO ~1 min
- Step D (full delete): RTO ~10 min including DNS

## 11 — DEFERRED — PADDLE INTEGRATION

Paddle billing was intentionally deferred to keep the launch surface tight. Activate as a separate session post-launch using this ordered playbook.

### 11.1 Paddle Sandbox setup (one-time, in sandbox-vendors.paddle.com)

1. Create a product: "FixMyIron AI Mechanic Subscription".
2. Create two recurring monthly prices:
   - **Pro Monthly** — $49 USD/mo
   - **Shop Monthly** — $199 USD/mo
   - Copy each `pri_…` ID.
3. **Approved domains**: add `fixmyiron-web-staging.americanironadmin.workers.dev` and `fixmyiron.com`. Without this Paddle.js refuses to mount the checkout overlay.
4. **Notification destination**:
   - URL: `https://fixmyiron-api-staging.americanironadmin.workers.dev/api/webhooks/paddle`
   - Subscribed events:
     - `subscription.created`
     - `subscription.updated`
     - `subscription.canceled`
     - `subscription.paused`
     - `subscription.resumed`
     - `transaction.completed`
     - `transaction.payment_failed`
   - Copy the signing secret.

### 11.2 Push real Paddle secrets (replaces placeholders from §3)

```bash
# STAGING first (catch issues before prod):
npx wrangler secret put PADDLE_API_KEY        --config workers/api/wrangler.toml
npx wrangler secret put PADDLE_WEBHOOK_SECRET --config workers/api/wrangler.toml
npx wrangler secret put PADDLE_PRICE_PRO      --config workers/api/wrangler.toml
npx wrangler secret put PADDLE_PRICE_SHOP     --config workers/api/wrangler.toml

# Then PROD (when satisfied):
# (same commands with --config workers/api/wrangler.prod.toml)
```

### 11.3 Replace `/pricing` CTAs with Paddle.js v2 overlay

Currently `/pricing` Pro/Shop CTAs are mailto links. Replace with:

```tsx
// web/app/pricing/page.tsx
"use client";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
// On mount:
const paddle = await initializePaddle({
  environment: publicEnv.paddleEnvironment,  // "sandbox" or "production"
  token: publicEnv.paddleClientToken,
});
// Pro/Shop CTA onClick:
paddle.Checkout.open({
  items: [{ priceId: PRO_PRICE_ID, quantity: 1 }],
  customer: { email: user.primaryEmailAddress?.emailAddress },
  customData: { user_id: user.id },
});
```

Pull localized prices from Paddle's `/prices` preview API (do NOT hardcode `$49`/`$199`):

```ts
const prices = await fetch(`https://${paddleApiHost}/prices/preview`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${env.PADDLE_API_KEY}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    items: [{ price_id: env.PADDLE_PRICE_PRO, quantity: 1 }],
    customer_ip_address: c.req.header("cf-connecting-ip"),
  }),
}).then((r) => r.json());
```

### 11.4 Replace `/portal/billing` placeholder with the real surface

Add an API route to mint a Paddle customer-portal session:

```ts
// workers/api/src/routes/billing.ts
billingRoutes.post("/portal", async (c) => {
  const userId = c.get("userId");
  const sub = await c.env.DB.prepare(
    "SELECT paddle_customer_id FROM subscriptions WHERE user_id = ?1",
  ).bind(userId).first<{ paddle_customer_id: string }>();
  if (!sub?.paddle_customer_id) return jsonError(c, 404, ErrorCode.NotFound, "No subscription");
  const r = await fetch(`https://${apiHost}/customer-portal-sessions`, {
    method: "POST",
    headers: { authorization: `Bearer ${c.env.PADDLE_API_KEY}` },
    body: JSON.stringify({ customer_id: sub.paddle_customer_id }),
  });
  const { data } = await r.json();
  return c.json({ url: data.urls.general.overview });
});
```

Then the web `/portal/billing` reads from D1 + redirects on "Manage subscription" click.

### 11.5 Run the full Paddle E2E suite (sandbox)

```bash
cd web
TEST_CLERK_SESSION_TOKEN=<token> \
PADDLE_TEST_CARD=4242424242424242 \
  npx playwright test e2e/05-paddle-flow.spec.ts
```

That spec doesn't exist yet — write it as part of activation. Cover:
- /pricing → click Pro → Paddle.js overlay → complete with sandbox card 4242…
- Verify `subscription.created` reaches `/api/webhooks/paddle` (use Paddle's "Resend" if necessary)
- Assert D1 `subscriptions` row: `tier='pro'`, `status='active'`
- POST /api/diagnosis/scenario as that user → 200 (was 403 before)
- Replay the same `event_id` → 200 + idempotency check (no duplicate D1 writes)
- Tamper with the webhook body → 401 (HMAC verify check)
- Cancel via /portal/billing → wait for `subscription.canceled` webhook → assert D1 tier='free'

### 11.6 Switch `PADDLE_ENVIRONMENT=production`

Only after Paddle business verification clears (Paddle will email when complete). Then:
- Repeat §11.1 in **production** Paddle (vendors.paddle.com, NOT sandbox).
- Push the real prod `pdl_live_apikey_…`, prod webhook secret, prod `pri_…` IDs.
- Update `wrangler.prod.toml` `[vars] PADDLE_ENVIRONMENT = "production"`.
- Update `web/wrangler.prod.jsonc` `vars.NEXT_PUBLIC_PADDLE_ENVIRONMENT = "production"` and `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` to the live token.
- Rebuild and deploy both Workers.
- Re-run the Paddle E2E suite against prod with a real card you'll refund.

### 11.7 Flip the fault-codes feature flag

In `workers/api/src/routes/fault-codes.ts`:

```ts
// Change:
const VIEWER_SEES_PAID_FIELDS_FOR_ALL = true;
// To:
const VIEWER_SEES_PAID_FIELDS_FOR_ALL = false;
```

Now free users see code + description + severity only; pro/shop see the rich view. Commit, deploy, smoke-test the gate behavior with two test users (one free, one upgraded via the manual D1 tier-flip script).

### 11.8 Smoke test prod subscribe + cancel

Same checklist as §11.5 but against `https://api.fixmyiron.com` and a real card. Refund the test charge after — Paddle dashboard → Transactions → refund.

---

## File map (what's already wired vs what to flip)

| File | Today | After Paddle activation |
|---|---|---|
| `workers/api/src/routes/webhooks/paddle.ts` | wired, fully tested, secret is placeholder | unchanged — just point Paddle at the URL |
| `workers/api/src/lib/paddle-verify.ts` | HMAC verify + replay window, 7 unit tests pass | unchanged |
| `workers/api/src/lib/tier.ts` | reads D1 subscriptions; `past_due` 3-day grace | unchanged |
| `workers/api/src/routes/fault-codes.ts` | `VIEWER_SEES_PAID_FIELDS_FOR_ALL = true` | flip to `false` (§11.7) |
| `web/app/pricing/page.tsx` | mailto CTAs | Paddle.js overlay (§11.3) |
| `web/app/portal/billing/page.tsx` | placeholder + email CTA | real plan / renewal / portal link (§11.4) |
| `web/wrangler.jsonc` `vars.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | `test_DEFERRED_PLACEHOLDER` | real `test_…` then `live_…` |
| `workers/api/wrangler.toml` `[vars] PADDLE_ENVIRONMENT` | `sandbox` | `production` (§11.6) |
