-- Migration: Phase 6 - Email Verification and Account Lifecycle Hardening
-- Safe, forward-only, idempotent migration for Supabase PostgreSQL

-- 1. Add email verification fields to users table
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

-- 2. Create email_verification_tokens table
-- Stores cryptographically hashed tokens with single-use atomic consumption and expiry
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,                -- SHA-256 hash of random 256-bit token
  expires_at TIMESTAMPTZ NOT NULL,                -- Token expiration (e.g., 24 hours)
  used_at TIMESTAMPTZ DEFAULT NULL,               -- Consumption timestamp (atomic single-use)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Query indexes for email_verification_tokens
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_hash ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_active ON email_verification_tokens(user_id, used_at, expires_at);

-- 4. DELIBERATE MIGRATION POLICY FOR EXISTING USERS:
-- Existing accounts default to email_verified = false to ensure all active users
-- verify their identity before gaining access to public link distribution.
-- If an organization wishes to grandfather all accounts created prior to this migration,
-- the following statement may be explicitly executed:
-- UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE created_at < NOW();
