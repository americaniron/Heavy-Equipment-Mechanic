-- Migration: Add local authentication support
-- Creates a local users table for app-based authentication (replacing Clerk)

PRAGMA foreign_keys = ON;

-- LOCAL_USERS — keyed on local UUID for app login/register
CREATE TABLE IF NOT EXISTS local_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  company TEXT,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'shop')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX idx_local_users_email ON local_users(email);

-- Add reference from local_users to subscriptions if needed
-- (subscriptions are connected via paddle_customer_id)