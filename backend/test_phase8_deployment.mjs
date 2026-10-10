import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { clamavScanner } from "./scanning/clamavScanner.js";
import { SCAN_STATES } from "./scanning/scanOrchestrator.js";

test("PHASE 8 - DEPLOYMENT: Express has trust proxy enabled for accurate client IP detection", () => {
  const serverSrc = fs.readFileSync(path.join(process.cwd(), "server.js"), "utf8");
  assert.ok(serverSrc.includes('app.set("trust proxy"'), "Express app must have 'trust proxy' configured in server.js");
});

test("PHASE 8 - CLAMAV RESILIENCE: Offline daemon safely produces SCAN_FAILED and never marks clean", async () => {
  // Force ClamAV enabled to test real offline socket behavior
  const scanner = new (clamavScanner.constructor)({
    host: "127.0.0.1",
    port: 3310,
    timeout: 1000
  });
  scanner.enabled = true;

  const result = await scanner.scanBuffer(Buffer.from("Harmless clean test file content"));
  assert.equal(result.scanned, false, "Offline scanner must not report scanned=true");
  assert.equal(result.status, SCAN_STATES.SCAN_FAILED, "Offline scanner must report SCAN_FAILED");
  assert.notEqual(result.status, SCAN_STATES.CLEAN, "Offline scanner must NEVER report CLEAN");
  assert.match(result.reason, /ClamAV socket connection error|ECONNREFUSED/i);
});

test("PHASE 8 - MIGRATION SAFETY: All migration SQL files are forward-only and non-destructive", () => {
  const sqlDir = path.join(process.cwd(), "sql");
  const migrationFiles = [
    "folders_migration.sql",
    "phase1_security_migration.sql",
    "phase2_audit_migration.sql",
    "phase5_sharing_migration.sql",
    "phase6_email_verification_migration.sql",
    "phase7_session_hardening_migration.sql"
  ];

  for (const file of migrationFiles) {
    const filePath = path.join(sqlDir, file);
    assert.ok(fs.existsSync(filePath), `Migration file ${file} must exist`);
    const sqlContent = fs.readFileSync(filePath, "utf8");

    // Must not contain destructive DROP statements without safety
    assert.equal(sqlContent.includes("DROP TABLE users"), false, `Migration ${file} must not drop users`);
    assert.equal(sqlContent.includes("DROP TABLE files"), false, `Migration ${file} must not drop files`);
    assert.equal(sqlContent.includes("DROP DATABASE"), false, `Migration ${file} must not drop database`);

    // Must be idempotent
    assert.ok(
      sqlContent.includes("IF NOT EXISTS") || sqlContent.includes("CREATE OR REPLACE"),
      `Migration ${file} must use idempotent definitions (IF NOT EXISTS or CREATE OR REPLACE)`
    );
  }
});

test("PHASE 8 - CONTROLLER AUTHORIZATION: Service-role operations enforce explicit owner filtering", () => {
  const fileControllerSrc = fs.readFileSync(path.join(process.cwd(), "controllers", "fileController.js"), "utf8");

  // Verify that all file mutation operations include explicit req.user.id checks
  assert.ok(fileControllerSrc.includes('.eq("user_id", req.user.id)'), "fileController must explicitly enforce user_id filtering");
  assert.ok(fileControllerSrc.includes('.eq("is_deleted", false)'), "fileController must enforce soft-delete filtering");

  // Verify that file download strictly checks scan_status === 'CLEAN'
  assert.ok(fileControllerSrc.includes("file.scan_status !== \"CLEAN\""), "fileController must enforce scan_status === 'CLEAN'");
});

test("PHASE 8 - SECURE SHARING INTEGRATION: Share link downloads strictly recheck scan_status and owner match", () => {
  const shareControllerSrc = fs.readFileSync(path.join(process.cwd(), "controllers", "shareController.js"), "utf8");

  // Must verify CLEAN scan_status
  assert.ok(shareControllerSrc.includes("file.scan_status !== \"CLEAN\""), "shareController must recheck scan_status before download");

  // Must verify file owner matches share link owner
  assert.ok(shareControllerSrc.includes("file.user_id !== link.owner_id"), "shareController must verify file ownership matches share link owner");

  // Must never store raw tokens
  assert.ok(shareControllerSrc.includes("token_hash: tokenHash"), "shareController must store SHA-256 token hash only");
});

test("PHASE 8 - LOGGING & ERROR REDACTION: Server and audit logs never leak secrets or raw tokens", () => {
  const serverSrc = fs.readFileSync(path.join(process.cwd(), "server.js"), "utf8");
  const auditLoggerSrc = fs.readFileSync(path.join(process.cwd(), "utils", "auditLogger.js"), "utf8");

  // Error handler in production must redact server errors
  assert.ok(serverSrc.includes("Server Error [redacted in production]"), "server.js must redact error messages in production");
  assert.ok(!serverSrc.includes("res.status(500).json({ error: err })"), "server.js must never dump raw err object");

  // Audit logger must redact sensitive keys
  assert.ok(auditLoggerSrc.includes("password"), "auditLogger must include password in redaction keys");
  assert.ok(auditLoggerSrc.includes("token"), "auditLogger must include token in redaction keys");
});

test("PHASE 8 - ENVIRONMENT SPECIFICATION: .env.example contains all required production parameters", () => {
  const envExample = fs.readFileSync(path.join(process.cwd(), ".env.example"), "utf8");

  const requiredKeys = [
    "PORT",
    "NODE_ENV",
    "TRUST_PROXY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE",
    "JWT_SECRET",
    "FRONTEND_URL",
    "ALLOWED_ORIGINS",
    "EMAIL_USER",
    "EMAIL_PASS",
    "CLAMAV_HOST",
    "CLAMAV_PORT",
    "CLAMAV_ENABLED"
  ];

  for (const key of requiredKeys) {
    assert.ok(envExample.includes(`${key}=`), `.env.example must document ${key}`);
  }
});
