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

-- 3. Atomic increment access count helper function (race-safe conditional increment)
CREATE OR REPLACE FUNCTION increment_share_access(share_id UUID)
RETURNS TABLE (success BOOLEAN, new_count INT) AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE share_links
  SET 
    access_count = access_count + 1,
    last_accessed_at = NOW()
  WHERE id = share_id
    AND is_revoked = false
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (max_accesses IS NULL OR access_count < max_accesses);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    RETURN QUERY
    SELECT true, access_count FROM share_links WHERE id = share_id;
  ELSE
    RETURN QUERY
    SELECT false, access_count FROM share_links WHERE id = share_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. Compensation helper: decrement access count if storage retrieval fails after reservation
CREATE OR REPLACE FUNCTION decrement_share_access(share_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE share_links
  SET 
    access_count = GREATEST(0, access_count - 1)
  WHERE id = share_id;
END;
$$ LANGUAGE plpgsql;

