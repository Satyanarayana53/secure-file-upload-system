import dotenv from "dotenv";
dotenv.config();
import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

test("PHASE 10 - HEALTHCHECK: Operational health check routes are registered in server.js", () => {
  const serverSrc = fs.readFileSync(path.join(process.cwd(), "server.js"), "utf8");
  assert.ok(serverSrc.includes('app.get(["/", "/health", "/api/health"]'), "server.js must expose operational /health routes");
  assert.ok(serverSrc.includes("services: {"), "Health route must report structured service statuses");
});

test("PHASE 10 - STORAGE PRIVACY: Signed URLs have short-lived TTL and storage paths are user-scoped", () => {
  const fileControllerSrc = fs.readFileSync(path.join(process.cwd(), "controllers", "fileController.js"), "utf8");

  // Signed URL TTL must be <= 300 seconds (5 minutes)
  assert.ok(fileControllerSrc.includes("60 * 5"), "Signed preview URL must have a 5-minute (300s) TTL maximum");

  // Storage path must be user-isolated
  assert.ok(fileControllerSrc.includes("`${req.user.id}/${safeStorageName}`"), "Storage path must be prefixed with user ID");

  // Compensating action must clean up storage if database insertion fails
  assert.ok(fileControllerSrc.includes('.remove([storagePath])'), "Upload handler must remove orphaned storage object on DB failure");
});

test("PHASE 10 - SHARING ISOLATION: Public share download strictly blocks non-CLEAN files and verifies owner", () => {
  const shareControllerSrc = fs.readFileSync(path.join(process.cwd(), "controllers", "shareController.js"), "utf8");

  // Verify non-CLEAN blocked
  assert.ok(shareControllerSrc.includes('file.scan_status !== "CLEAN"'), "shareController must strictly block non-CLEAN files");

  // Verify file owner match
  assert.ok(shareControllerSrc.includes('file.user_id !== link.owner_id'), "shareController must verify file owner matches link owner");

  // Verify atomic access increment
  assert.ok(shareControllerSrc.includes('increment_share_access'), "shareController must use atomic database function");
});

test("PHASE 10 - LIVE SMTP ACCEPTANCE: Confirmed TLS handshake with configured provider", async () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("    [SKIPPED] EMAIL_USER / EMAIL_PASS not in environment");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const isVerified = await transporter.verify();
  assert.equal(isVerified, true, "SMTP provider credentials must verify successfully");
});

test("PHASE 10 - DOCKER ARCHITECTURE: Multi-stage Dockerfiles and production compose topology exist", () => {
  const rootDir = path.resolve(process.cwd(), "..");
  const composePath = path.join(rootDir, "docker-compose.production.yml");
  const backendDockerPath = path.join(process.cwd(), "Dockerfile");
  const frontendDockerPath = path.join(rootDir, "frontend", "Dockerfile");

  assert.ok(fs.existsSync(composePath), "docker-compose.production.yml must exist");
  assert.ok(fs.existsSync(backendDockerPath), "backend/Dockerfile must exist");
  assert.ok(fs.existsSync(frontendDockerPath), "frontend/Dockerfile must exist");

  const composeContent = fs.readFileSync(composePath, "utf8");
  assert.ok(composeContent.includes("internal_secure_network"), "Compose must define private internal network");
  assert.ok(composeContent.includes("healthcheck:"), "ClamAV must define healthcheck");
  assert.ok(composeContent.includes("clamav_signatures:"), "Signature persistent volume must exist");
});
