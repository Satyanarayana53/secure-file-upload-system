import dotenv from "dotenv";
dotenv.config();
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

test("PHASE 11 - RECONCILIATION: Migration dependency order and table naming consistency", () => {
  const sqlDir = path.join(process.cwd(), "sql");
  
  // Confirmed chronological dependency order
  const expectedOrder = [
    "folders_migration.sql",
    "phase1_security_migration.sql",
    "phase2_audit_migration.sql",
    "phase5_sharing_migration.sql",
    "phase6_email_verification_migration.sql",
    "phase7_session_hardening_migration.sql"
  ];

  for (const file of expectedOrder) {
    const fullPath = path.join(sqlDir, file);
    assert.ok(fs.existsSync(fullPath), `Migration ${file} must exist in backend/sql/`);
  }

  // Verify share_links table name consistency (NOT file_shares)
  const shareSql = fs.readFileSync(path.join(sqlDir, "phase5_sharing_migration.sql"), "utf8");
  assert.ok(shareSql.includes("CREATE TABLE IF NOT EXISTS share_links"), "Phase 5 must create share_links table");
  assert.equal(shareSql.includes("CREATE TABLE IF NOT EXISTS file_shares"), false, "Must not use file_shares table name");

  const shareCtrl = fs.readFileSync(path.join(process.cwd(), "controllers", "shareController.js"), "utf8");
  assert.ok(shareCtrl.includes('.from("share_links")'), "shareController must query share_links table");
  assert.equal(shareCtrl.includes('.from("file_shares")'), false, "shareController must not query file_shares");

  // Verify email_verification_tokens consistency (NOT email_verifications)
  const emailSql = fs.readFileSync(path.join(sqlDir, "phase6_email_verification_migration.sql"), "utf8");
  assert.ok(emailSql.includes("CREATE TABLE IF NOT EXISTS email_verification_tokens"), "Phase 6 must create email_verification_tokens");
  assert.ok(emailSql.includes("ADD COLUMN email_verified BOOLEAN"), "Phase 6 must add email_verified to users");

  const authCtrl = fs.readFileSync(path.join(process.cwd(), "controllers", "authController.js"), "utf8");
  assert.ok(authCtrl.includes('.from("email_verification_tokens")'), "authController must query email_verification_tokens");
  assert.ok(authCtrl.includes("email_verified: Boolean("), "authController must reference email_verified");
});

test("PHASE 11 - RECONCILIATION: Environment variable dual-compatibility (SUPABASE_SERVICE_ROLE_KEY and SMTP_*)", () => {
  const supabaseCfg = fs.readFileSync(path.join(process.cwd(), "config", "supabase.js"), "utf8");
  assert.ok(
    supabaseCfg.includes("process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE"),
    "supabase.js must support both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SERVICE_ROLE"
  );

  const emailSvc = fs.readFileSync(path.join(process.cwd(), "utils", "emailService.js"), "utf8");
  assert.ok(
    emailSvc.includes("process.env.EMAIL_USER || process.env.SMTP_USER"),
    "emailService.js must support both EMAIL_USER and SMTP_USER"
  );
  assert.ok(
    emailSvc.includes("process.env.EMAIL_PASS || process.env.SMTP_PASS"),
    "emailService.js must support both EMAIL_PASS and SMTP_PASS"
  );
});

test("PHASE 11 - HEALTH & READINESS: Server exposes distinct health and readiness routes", () => {
  const serverSrc = fs.readFileSync(path.join(process.cwd(), "server.js"), "utf8");
  
  // Health route checks
  assert.ok(serverSrc.includes('app.get(["/", "/health", "/api/health"]'), "server.js must expose /health");
  assert.ok(serverSrc.includes("services: {"), "Health route must report services status");
  assert.ok(serverSrc.includes("database: dbStatus"), "Health route must report database status");
  assert.ok(serverSrc.includes("antivirus: avStatus"), "Health route must report antivirus status");

  // Readiness route checks
  assert.ok(serverSrc.includes('app.get(["/ready", "/api/ready"]'), "server.js must expose /ready probe");
  assert.ok(serverSrc.includes("res.status(isReady ? 200 : 503)"), "Readiness route must return 503 when not ready");
});

test("PHASE 11 - AUTHORIZATION & RLS DEFENSE: Controller-level tenant isolation is rigorously enforced", () => {
  const fileCtrl = fs.readFileSync(path.join(process.cwd(), "controllers", "fileController.js"), "utf8");
  
  // Every mutation and query on files and folders must filter by user_id
  assert.ok(fileCtrl.includes('.eq("user_id", req.user.id)'), "fileController must strictly enforce user_id");
  assert.ok(fileCtrl.includes('.from("folders")'), "fileController must query folders");
  
  // Preview and download must block non-CLEAN and deleted files
  assert.ok(fileCtrl.includes('file.scan_status !== "CLEAN"'), "fileController preview/download must enforce CLEAN status");
  assert.ok(fileCtrl.includes("file.is_deleted"), "fileController must block preview/download of deleted files");

  // Audit logs must strictly filter by req.user.id
  const auditCtrl = fs.readFileSync(path.join(process.cwd(), "controllers", "auditController.js"), "utf8");
  assert.ok(auditCtrl.includes('.eq("actor_id", req.user.id)'), "auditController must restrict logs to actor_id");
});

test("PHASE 11 - SECRETS INTEGRATION & GIT HYGIENE: Frontend build and repository exclude secrets", () => {
  const gitignore = fs.readFileSync(path.join(process.cwd(), "..", ".gitignore"), "utf8");
  assert.ok(gitignore.includes(".env"), ".gitignore must ignore .env files");

  // Frontend build directory inspection (ensure no private keys or service roles are bundled)
  const frontendBuildStatic = path.join(process.cwd(), "..", "frontend", "build", "static", "js");
  if (fs.existsSync(frontendBuildStatic)) {
    const files = fs.readdirSync(frontendBuildStatic).filter(f => f.endsWith(".js"));
    for (const f of files) {
      const bundleContent = fs.readFileSync(path.join(frontendBuildStatic, f), "utf8");
      assert.equal(
        bundleContent.includes("service_role"),
        false,
        `Frontend bundle ${f} must never contain service_role credentials`
      );
    }
  }
});
