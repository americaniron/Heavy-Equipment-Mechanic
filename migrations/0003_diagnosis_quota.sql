-- 0003_diagnosis_quota.sql
-- Tracks the running monthly diagnosis count per free-tier user, plus the
-- year-month bucket the count belongs to. We don't run a cron to reset —
-- the quota check itself notices a stale month_key and resets the counter
-- to 0 lazily on the next request. That avoids both a Cron Trigger
-- dependency and a thundering-herd reset at 00:00 UTC on the 1st.

ALTER TABLE users ADD COLUMN diagnoses_this_month INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN diagnoses_month_key  TEXT;

-- Index isn't strictly needed (lookups are by clerk_user_id PK) but keeps
-- range scans fast if we later want admin queries like "who's near limit".
CREATE INDEX idx_users_diag_month_key ON users(diagnoses_month_key);
