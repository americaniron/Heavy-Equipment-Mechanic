-- 0005_backend_repair.sql
-- Additive tables required by persisted diagnosis, troubleshooting, predictive,
-- and webhook-replay behavior. Existing tables are never rebuilt or dropped.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS diagnostic_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_messages_session
  ON diagnostic_messages(session_id, turn_number, id);

CREATE TABLE IF NOT EXISTS troubleshooting_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL,
  question TEXT,
  suggested_answers TEXT,
  answer TEXT,
  reasoning TEXT,
  terminate INTEGER NOT NULL DEFAULT 0,
  conclusion TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, turn_number)
);

CREATE TABLE IF NOT EXISTS predictive_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  equipment_id TEXT NOT NULL,
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  predicted_failure_window TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  generated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_predictive_alerts_customer
  ON predictive_alerts(customer_id, generated_at);

CREATE TABLE IF NOT EXISTS processed_webhooks (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed',
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  claimed_at TEXT,
  claim_token TEXT,
  processed_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1
);
