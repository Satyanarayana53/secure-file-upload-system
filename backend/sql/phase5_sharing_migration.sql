-- Migration: Phase 5 - Secure File Sharing
-- Forward-only, non-destructive, repeatable migration for Supabase PostgreSQL

-- 1. Create share_links table
CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,                -- SHA-256 hash of the random share token
  password_hash TEXT DEFAULT NULL,                -- Optional bcrypt password hash
  expires_at TIMESTAMPTZ DEFAULT NULL,            -- Optional expiry timestamp
  max_accesses INT DEFAULT NULL,                  -- Optional maximum access limit
  access_count INT NOT NULL DEFAULT 0,            -- Number of successful content accesses
  is_revoked BOOLEAN NOT NULL DEFAULT false,      -- Revocation flag
  revoked_at TIMESTAMPTZ DEFAULT NULL,            -- Revocation timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NULL
);

-- 2. Query indexes for share_links
CREATE INDEX IF NOT EXISTS idx_share_links_token_hash ON share_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_share_links_owner ON share_links(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_links_file ON share_links(file_id);
CREATE INDEX IF NOT EXISTS idx_share_links_status ON share_links(is_revoked, expires_at);

-- 3. Atomic increment access count helper function (prevents race conditions)
CREATE OR REPLACE FUNCTION increment_share_access(share_id UUID)
RETURNS TABLE (new_count INT) AS $$
BEGIN
  RETURN QUERY
  UPDATE share_links
  SET 
    access_count = access_count + 1,
    last_accessed_at = NOW()
  WHERE id = share_id
  RETURNING access_count;
END;
$$ LANGUAGE plpgsql;
