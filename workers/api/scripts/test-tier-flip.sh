#!/usr/bin/env bash
# test-tier-flip.sh — verifies the requireTier() gate flips when a
# subscriptions row is manually inserted, without needing Paddle.
#
# Per scope adjustment (Paddle deferred), this is the substitute for
# the Paddle subscribe → tier upgrade end-to-end test. It proves the
# gating logic + D1 reads work; the only thing it skips is the Paddle
# webhook itself (which has its own unit tests for HMAC + idempotency).
#
# Usage:
#   ./workers/api/scripts/test-tier-flip.sh <CLERK_USER_ID> <TIER>
# where TIER is one of: free, pro, shop
#
# Example:
#   ./workers/api/scripts/test-tier-flip.sh user_2abc... pro
#
# After running, hit POST /api/diagnosis/scenario with that user's
# session token — should now return 200 instead of 403 TIER_REQUIRED.

set -euo pipefail

USER_ID="${1:-}"
TIER="${2:-pro}"

if [ -z "$USER_ID" ]; then
  echo "Usage: $0 <CLERK_USER_ID> <TIER>" >&2
  echo "  TIER must be one of: free, pro, shop" >&2
  exit 64
fi

case "$TIER" in
  free|pro|shop) ;;
  *) echo "TIER must be one of: free, pro, shop (got: $TIER)" >&2; exit 64 ;;
esac

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CFG="$ROOT/workers/api/wrangler.toml"

echo "Inserting/updating subscription for $USER_ID → tier=$TIER"

npx wrangler d1 execute fixmyiron-staging --remote --config="$CFG" \
  --command="INSERT INTO subscriptions (user_id, tier, status, updated_at)
             VALUES ('$USER_ID', '$TIER', 'active', unixepoch())
             ON CONFLICT(user_id) DO UPDATE SET
               tier = excluded.tier,
               status = 'active',
               past_due_since = NULL,
               updated_at = unixepoch();
             UPDATE users SET tier = '$TIER', updated_at = unixepoch()
             WHERE clerk_user_id = '$USER_ID';"

echo
echo "Verifying:"
npx wrangler d1 execute fixmyiron-staging --remote --config="$CFG" \
  --command="SELECT u.clerk_user_id, u.tier AS user_tier, s.tier AS sub_tier, s.status
             FROM users u
             LEFT JOIN subscriptions s ON s.user_id = u.clerk_user_id
             WHERE u.clerk_user_id = '$USER_ID';"

echo
echo "Done. Test the gate by hitting POST /api/diagnosis/scenario as this user:"
echo "  free → expect 403 TIER_REQUIRED"
echo "  pro/shop → expect 200 with playbook"
