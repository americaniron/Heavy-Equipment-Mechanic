-- 0004_operational_schema.sql
-- Additive, non-destructive. Production already has a customers-centric
-- schema imported from the Express/Drizzle app. CREATE TABLE IF NOT EXISTS
-- is a no-op when those tables exist. Column additions that may already
-- exist are applied at runtime by workers/api/src/lib/ensure-schema.ts
-- (PRAGMA table_info + ALTER TABLE) so this file never DROPs or rebuilds.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  company TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  clerk_user_id TEXT,
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_clerk ON customers(clerk_user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_customer ON auth_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_verify_customer ON email_verification_codes(customer_id, email);

CREATE TABLE IF NOT EXISTS processed_webhooks (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  customer_id INTEGER NOT NULL,
  scope TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (customer_id, scope, window_start)
);

CREATE TABLE IF NOT EXISTS service_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  equipment_id INTEGER,
  session_id INTEGER,
  type TEXT NOT NULL DEFAULT 'diagnostic',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  description TEXT,
  fault_codes TEXT,
  assigned_mechanic TEXT,
  estimated_cost TEXT,
  diagnosis_result TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_request_id INTEGER,
  customer_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  technician_notes TEXT,
  labor_hours TEXT,
  parts_used TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER,
  customer_id INTEGER NOT NULL,
  service_type TEXT NOT NULL,
  interval_hours TEXT,
  last_service_date TEXT,
  next_service_date TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  category TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  equipment_id INTEGER,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  file_path TEXT,
  file_size TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  service_request_id INTEGER,
  stripe_invoice_id TEXT,
  amount TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  due_date TEXT,
  paid_at TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  access_token TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  company TEXT,
  equipment_type TEXT,
  make TEXT,
  model TEXT,
  year TEXT,
  serial_number TEXT,
  serial_prefix TEXT,
  smu_hours TEXT,
  problem_summary TEXT,
  fault_codes TEXT,
  issue_started TEXT,
  location TEXT,
  can_safely_shutdown INTEGER,
  visit_type TEXT DEFAULT 'quick_advice',
  mechanic_type TEXT,
  status TEXT NOT NULL DEFAULT 'intake',
  agent_provider TEXT DEFAULT 'liveavatar',
  tier TEXT NOT NULL DEFAULT 'free',
  payment_status TEXT DEFAULT 'none',
  stripe_session_id TEXT,
  share_token TEXT,
  intake_json TEXT,
  language TEXT DEFAULT 'en',
  consent_given INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agent_type TEXT DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  report_type TEXT NOT NULL,
  content TEXT,
  svg_diagram TEXT,
  share_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS escalations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  subject TEXT,
  description TEXT,
  equipment_info TEXT,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  equipment_id INTEGER,
  reference_number TEXT,
  status TEXT,
  notes TEXT,
  equipment_info TEXT,
  total_items INTEGER,
  validated_items INTEGER,
  invalid_items INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_request_id INTEGER NOT NULL,
  part_number TEXT,
  description TEXT,
  quantity INTEGER,
  make TEXT,
  model TEXT,
  serial_number TEXT,
  urgency TEXT,
  validation_status TEXT,
  validation_notes TEXT
);

CREATE TABLE IF NOT EXISTS diagnostic_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  playbook_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS avatar_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER,
  live_session_id TEXT,
  provider TEXT NOT NULL DEFAULT 'liveavatar',
  mode TEXT NOT NULL DEFAULT 'LITE',
  status TEXT NOT NULL DEFAULT 'started',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_avatar_sessions_live ON avatar_sessions(live_session_id);
