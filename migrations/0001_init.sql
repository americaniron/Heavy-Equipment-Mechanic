-- 0001_init.sql
-- Foundation tables. Tier and subscription state are duplicated on `users`
-- (read path) and authoritative in `subscriptions` (write path from Paddle
-- webhook). requireTier() reads the joined view so a downgrade is honored
-- immediately.

PRAGMA foreign_keys = ON;

-- USERS — keyed on Clerk user_id.
CREATE TABLE users (
  clerk_user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'shop')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- SUBSCRIPTIONS — one row per user, mirrors Paddle state.
-- past_due is treated as active for 3 days (enforced in requireTier()).
CREATE TABLE subscriptions (
  user_id TEXT PRIMARY KEY REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  paddle_customer_id TEXT,
  paddle_subscription_id TEXT,
  paddle_price_id TEXT,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'shop')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trialing', 'past_due', 'paused', 'canceled')),
  current_period_end INTEGER,
  past_due_since INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_subscriptions_paddle_customer ON subscriptions(paddle_customer_id);
CREATE INDEX idx_subscriptions_paddle_subscription ON subscriptions(paddle_subscription_id);

-- EQUIPMENT — fleet membership for predictive maintenance.
CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER,
  serial TEXT,
  hours INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_equipment_user ON equipment(user_id);

-- DIAGNOSTIC_SESSIONS — pointer rows; the rich turn-by-turn state lives in
-- the DiagnosticSession Durable Object. This table exists for billing,
-- analytics, and joining to predictive maintenance.
CREATE TABLE diagnostic_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(clerk_user_id) ON DELETE CASCADE,
  equipment_id TEXT REFERENCES equipment(id) ON DELETE SET NULL,
  tier_at_creation TEXT NOT NULL CHECK (tier_at_creation IN ('free', 'pro', 'shop')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'archived')),
  summary_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_sessions_user ON diagnostic_sessions(user_id);
CREATE INDEX idx_sessions_equipment ON diagnostic_sessions(equipment_id);
CREATE INDEX idx_sessions_created ON diagnostic_sessions(created_at);

-- FAULT_CODES — refreshed weekly by the cron consumer (next slice).
CREATE TABLE fault_codes (
  code TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  severity TEXT,
  likely_causes_json TEXT,
  repair_actions_json TEXT,
  source_url TEXT,
  last_refreshed INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_fault_codes_refreshed ON fault_codes(last_refreshed);
