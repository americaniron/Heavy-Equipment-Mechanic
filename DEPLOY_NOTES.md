# DEPLOY_NOTES.md — staging vs. production var/secret matrix

Tracks values that **differ between staging and production** so the cutover
playbook (`PRODUCTION_CUTOVER.md`) can swap them with no surprises.

## Browser-safe (`web/wrangler.jsonc` `vars` — committed, not secret)

| Var | Staging value | Production value (TODO at cutover) |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://fixmyiron-api-staging.americanironadmin.workers.dev` | `https://api.fixmyiron.com` |
| `NEXT_PUBLIC_PADDLE_ENVIRONMENT` | `sandbox` | `production` (after Paddle business verification) |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `https://accounts.fixmyiron.com/sign-in` | same (Clerk uses the same prod instance for both staging + prod) |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `https://accounts.fixmyiron.com/sign-up` | same |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `/portal` | same |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `/portal` | same |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_…` (real production Clerk key — Clerk has only one live instance) | same |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | `test_DEFERRED_PLACEHOLDER` until Paddle ships, then real `test_…` sandbox token | real `live_…` token after Paddle prod cutover |

## Worker secrets (`wrangler secret put`, never in git)

### API Worker (`workers/api/wrangler.toml`)

| Secret | Staging | Production |
|---|---|---|
| `ANTHROPIC_API_KEY` | dev/staging key from console.anthropic.com | prod key (separate billing project recommended) |
| `CLERK_SECRET_KEY` | `sk_live_…` (same Clerk instance) | same |
| `CLERK_WEBHOOK_SECRET` | `whsec_…` from staging webhook destination | new `whsec_…` for prod webhook destination |
| `PADDLE_API_KEY` | DEFERRED placeholder until Paddle ships, then `pdl_sdbx_apikey_…` | `pdl_live_apikey_…` |
| `PADDLE_WEBHOOK_SECRET` | DEFERRED placeholder, then sandbox notification destination secret | prod notification destination secret |
| `PADDLE_PRICE_PRO` | DEFERRED placeholder, then sandbox `pri_…` | prod `pri_…` |
| `PADDLE_PRICE_SHOP` | DEFERRED placeholder, then sandbox `pri_…` | prod `pri_…` |

### Web Worker (`web/wrangler.jsonc`)

| Secret | Staging | Production |
|---|---|---|
| `CLERK_SECRET_KEY` | `sk_live_…` (same Clerk instance) | same |

## Plain vars (`workers/api/wrangler.toml` `[vars]` — committed)

| Var | Staging value | Production value |
|---|---|---|
| `PADDLE_ENVIRONMENT` | `sandbox` (becomes `production` after Paddle cutover) | `production` |
| `CLERK_ACCOUNT_PORTAL_URL` | `https://accounts.fixmyiron.com` | same |
| `WEB_ORIGIN` | `https://fixmyiron-web-staging.americanironadmin.workers.dev` | `https://fixmyiron.com` |

## Paddle DEFERRED status

Paddle integration is intentionally deferred per build instructions
(2026-05-04). The webhook handler at `/api/webhooks/paddle` is wired but
unreachable until a real webhook destination is configured in Paddle.
Placeholder secrets are present so the Worker can `env.PADDLE_*` reads
without throwing on undefined access. Activation playbook lives in
`PRODUCTION_CUTOVER.md` under "DEFERRED — PADDLE INTEGRATION".

## Verification snippets

After any deploy that changes vars/secrets, verify with:

```bash
# What does this Worker see?
npx wrangler secret list --config workers/api/wrangler.toml
npx wrangler secret list --config web/wrangler.jsonc

# Health probes (cheap, hit no secrets):
curl -s https://fixmyiron-api-staging.americanironadmin.workers.dev/healthz
curl -s https://fixmyiron-api-staging.americanironadmin.workers.dev/healthz/db

# Portal smoke (200 or 30x; 500 means a secret/var is wrong):
curl -sI https://fixmyiron-web-staging.americanironadmin.workers.dev/portal/parts
```
