-- Migration: Phase 7 - Session Hardening, User Lifecycle, and Row Level Security
-- Safe, forward-only, idempotent migration for Supabase PostgreSQL

-- 1. Add user lifecycle and session versioning columns to users table
DO $$ 
BEGIN
  -- Account active/disabled flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;

  -- Token version counter for instant global session revocation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'token_version'
  ) THEN
    ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 1;
  END IF;
END $$;

-- 2. Create user_sessions table for stateful session tracking and single-session revocation
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,                -- SHA-256 hash of the issued JWT
  ip_address TEXT,                                -- Client IP at session creation
  user_agent TEXT,                                -- Client device / browser user-agent
  is_revoked BOOLEAN NOT NULL DEFAULT false,      -- Explicit logout or revocation flag
  revoked_at TIMESTAMPTZ DEFAULT NULL,            -- Revocation timestamp
  expires_at TIMESTAMPTZ NOT NULL,                -- Expiration timestamp aligned with JWT exp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Query indexes for user_sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_hash ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(user_id, is_revoked, expires_at);

-- 4. Enable Row Level Security (RLS) on core application tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- 5. Non-destructive RLS Policies (Idempotent policy definitions)
DO $$ 
BEGIN
  -- Users table: Users can only read and update their own account
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'users_self_isolation'
  ) THEN
    CREATE POLICY users_self_isolation ON users
      FOR ALL
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;

  -- Files table: Users can only access their own non-deleted files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'files' AND policyname = 'files_owner_isolation'
  ) THEN
    CREATE POLICY files_owner_isolation ON files
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Folders table: Users can only access their own folders
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'folders_owner_isolation'
  ) THEN
    CREATE POLICY folders_owner_isolation ON folders
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Share links table: Owners can view and manage their own share links
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'share_links' AND policyname = 'share_links_owner_isolation'
  ) THEN
    CREATE POLICY share_links_owner_isolation ON share_links
      FOR ALL
      USING (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;

  -- Audit logs: Users can view only their own audit events
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'audit_logs_actor_isolation'
  ) THEN
    CREATE POLICY audit_logs_actor_isolation ON audit_logs
      FOR SELECT
      USING (auth.uid() = actor_id);
  END IF;

  -- User sessions: Users can view and manage only their own sessions
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_sessions' AND policyname = 'user_sessions_owner_isolation'
  ) THEN
    CREATE POLICY user_sessions_owner_isolation ON user_sessions
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
