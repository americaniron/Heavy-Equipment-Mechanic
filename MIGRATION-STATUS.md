# Heavy-Equipment-Mechanic — Cloud Run Migration Status

## What's done (Phase 2: Code Surgery — COMPLETE)

The code is fully prepared for Cloud Run. All in-memory state that would have
broken on a multi-instance deploy has been moved to Postgres. Two zip files
are produced:

- **Heavy-Equipment-Mechanic-cloudrun-ready.zip** (~103 MB) — full project,
  ready to push to GitHub and deploy. Use this if you want to start fresh.
- **Heavy-Equipment-Mechanic-changes-only.zip** (~57 KB) — just the files I
  changed/added. Use this if you want to merge into your existing repo.

### Files changed

| File | Why |
|---|---|
| `package.json` | Removed @replit/* plugins, passport*, express-session, connect-pg-simple, memorystore, pg. Added @neondatabase/serverless, @types/ws. Updated `dev` script to use Node's `--env-file=.env`. |
| `tsconfig.json` | Added `target: "ES2022"` and `downlevelIteration: true` to fix Set iteration. |
| `vite.config.ts` | Removed all three `@replit/vite-plugin-*` imports + the conditional dynamic imports. |
| `server/db.ts` | Swapped `pg` driver for `@neondatabase/serverless` Pool + `ws` (WebSocket-based, designed for serverless). |
| `server/index.ts` | Removed `reusePort: true` (Linux-only, Replit-specific). Added `/healthz` endpoint for Cloud Run probes. |
| `server/routes.ts` | Replaced two in-memory `Map` instances (`customerSessions`, `sessionTokens`) with DB-backed lookups via storage methods. Made `requireAuth`, `generateSessionToken`, `validateSessionAccess` async. Updated all 6 call sites. Stubbed broken voice STT path (referenced functions that didn't exist). |
| `server/storage.ts` | Added 5 methods: `createAuthSession`, `getCustomerIdByAuthToken`, `deleteAuthSession`, `setSessionAccessToken`, `getSessionAccessToken`. |
| `server/services/ai-engine.ts` | Made OpenAI/Anthropic SDK init tolerant of missing API keys at module-load time, so the container starts even if a secret is missing. |
| `shared/schema.ts` | Added two tables: `auth_sessions` (customer login tokens, 30-day TTL) and `session_access_tokens` (chat session access tokens). |
| `script/build.ts` | Updated bundling allowlist to include the new Neon driver and remove deps that were uninstalled. |
| `Dockerfile` | New. Multi-stage Node 20 build, uses `npm install` (not `npm ci`) to avoid lockfile-skew failures. |
| `.dockerignore` | New. Excludes node_modules, .env, .git, dist, attached_assets… |
| `.gitignore` | Updated. Added `.env`, `.env.local`, `.env.*.local`, `uploads/`, `.config/`, `.local/`, `.cache/`, `*.log`. |
| `.env.example` | New. Documents all 19 environment variables your app reads. |

### Files deleted

- `server/replit_integrations/{audio,batch,chat,image}/` — dead code
- `client/replit_integrations/audio/` — dead code (no React component imported these hooks)
- `.replit`, `replit.md` — Replit-specific config
- `avatar_with_subtitle.png`, `hero-section.png`, `hero_region.png`, `live_desk_state.png`, `sedL1nFan` — unreferenced root files
- `package-lock.json` was deleted then regenerated cleanly during build verification

### Verified locally

- ✅ `npm install` succeeds (642 packages)
- ✅ `npm run build` produces `dist/index.cjs` (5.4 MB) + `dist/public/` (22 MB)
- ✅ Server boots cleanly on a fake DATABASE_URL
- ✅ `GET /healthz` returns 200 with `{"ok":true}`
- ✅ `GET /api/auth/me` returns 401 when no token (auth middleware works)
- ✅ `POST /api/auth/login` reaches DB code path

## What's left (Phases 3–6)

You're ready to start Phase 3. Order of next steps:

### Step A — Push to GitHub

In Cloud Shell or locally:
```bash
unzip Heavy-Equipment-Mechanic-cloudrun-ready.zip
cd hem-modified
git init
git remote add origin https://github.com/americaniron/Heavy-Equipment-Mechanic.git
git checkout -b main
git add -A
git commit -m "Phase 2: Code surgery for Cloud Run migration"
git push origin main --force
```

### Step B — Dump Replit Postgres + restore to Neon

You still need to do the `pg_dump`. Open Cloud Shell, get DATABASE_URL from Replit Secrets:
```bash
read -rs REPLIT_DB
pg_dump "$REPLIT_DB" --no-owner --no-privileges --format=custom --file=hem-backup.dump
ls -lh hem-backup.dump
```

Then create a Neon project (your own account, not Replit's), get its DATABASE_URL, and restore:
```bash
read -rs NEON_DB
pg_restore --no-owner --no-privileges -d "$NEON_DB" hem-backup.dump
```

After restore, push the new auth tables:
```bash
DATABASE_URL="$NEON_DB" npm run db:push
```

### Step C — Push secrets to Secret Manager

For all 19 env vars listed in `.env.example`, push to GCP Secret Manager. See
`secret-push-script.sh` in the migration skill — bash a list, one per line.

### Step D — Cloud Run + GitHub continuous deploy

GCP console → Cloud Run → Create service → Connect repo → main branch, Dockerfile, port 8080, 1 GiB RAM, allow unauthenticated, mount all 19 secrets as env vars.

### Step E — DNS cutover via Cloudflare

Map your domain to the Cloud Run service URL, orange-cloud the records.

### Step F — Smoke test against production URL

```bash
DOMAIN=https://www.americanironus.com    # or whatever your domain is
curl -I $DOMAIN/healthz                  # 200
curl $DOMAIN/api/auth/me                 # {"error":"Authentication required"}
```

Then test login/portal in the browser end-to-end.

## Notes

- **Pre-existing TypeScript errors:** `npm run check` reports ~12 type errors
  (Lucide icon `title` props, `string | string[]` header narrowing, Button
  variant typo). These existed in the original code and don't block the build
  (esbuild/Vite don't type-check by default). Fix at leisure.

- **The `attached_assets/` folder is ~108 MB** of service-line images and
  videos that the React build imports. They have to ship with the repo.
  Consider moving them to a CDN / GCS bucket later for faster cold starts.

- **Auth tokens have a 30-day TTL** baked into the schema. Old sessions
  auto-expire. Add a daily cron later (`gcloud scheduler`) to delete
  expired rows if the table grows.
