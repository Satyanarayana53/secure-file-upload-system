-- Migration: Phase 2 - Persistent Server-Side Audit Logs & Scan Foundation
-- Forward-only, non-destructive, repeatable migration for Supabase PostgreSQL

-- 1. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT,
  resource_type TEXT,
  resource_id UUID,
  resource_name TEXT,
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failure', 'blocked')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
  correlation_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Essential query indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_created ON audit_logs(resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_created ON audit_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- 2. Create scan_jobs table (prepares schema for scanning engine)
CREATE TABLE IF NOT EXISTS scan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'timed_out')),
  av_engine TEXT,
  av_engine_version TEXT,
  av_signature_version TEXT,
  av_result TEXT,
  av_threat_name TEXT,
  ai_provider TEXT,
  ai_risk_score NUMERIC(5,2),
  ai_severity TEXT,
  ai_indicators JSONB DEFAULT '{}'::jsonb,
  ai_reasoning TEXT,
  ai_recommended_action TEXT,
  ai_available BOOLEAN DEFAULT false,
  scan_duration_ms INT,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scan_jobs_file ON scan_jobs(file_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_jobs_status ON scan_jobs(status);

-- 3. Add scan_job_id foreign key reference to audit_logs if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit_logs' AND column_name = 'scan_job_id'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN scan_job_id UUID REFERENCES scan_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;
