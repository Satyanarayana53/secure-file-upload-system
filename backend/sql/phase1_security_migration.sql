-- Migration: Phase 1 Critical Security Fixes
-- Safe, forward-only, idempotent migration

-- 1. Create password_reset_tokens table with cryptographically hashed tokens and expiry
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by token_hash
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);

-- 2. Enhance files table with safety fields: storage_name, scan_status, sha256_hash, deleted_at
DO $$ 
BEGIN
  -- Add scan_status with check constraint if not exists
  -- Default to QUARANTINED_PENDING_SCAN so existing and new unscanned rows fail closed
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'files' AND column_name = 'scan_status'
  ) THEN
    ALTER TABLE files ADD COLUMN scan_status TEXT DEFAULT 'QUARANTINED_PENDING_SCAN'
      CHECK (scan_status IN ('PENDING_UPLOAD', 'QUARANTINED_PENDING_SCAN', 'SCANNING', 'CLEAN', 'SUSPICIOUS', 'INFECTED', 'SCAN_FAILED'));
  ELSE
    -- If column already exists, ensure default is safe
    ALTER TABLE files ALTER COLUMN scan_status SET DEFAULT 'QUARANTINED_PENDING_SCAN';
  END IF;

  -- Add storage_name (UUID-based server identifier, distinct from user's original file_name)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'files' AND column_name = 'storage_name'
  ) THEN
    ALTER TABLE files ADD COLUMN storage_name TEXT;
  END IF;

  -- Add sha256_hash
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'files' AND column_name = 'sha256_hash'
  ) THEN
    ALTER TABLE files ADD COLUMN sha256_hash TEXT;
  END IF;

  -- Add deleted_at timestamp for soft delete tracking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'files' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE files ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;

  -- Ensure any existing rows where scan_status is NULL are held in quarantine
  UPDATE files
  SET scan_status = 'QUARANTINED_PENDING_SCAN'
  WHERE scan_status IS NULL;
END $$;
