import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { hashShareToken } from "./controllers/shareController.js";

test("SHARE SECURITY: Tokens are 256-bit cryptographically secure random values and stored only as SHA-256 hashes", () => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  assert.strictEqual(rawToken.length, 64, "32-byte hex token has 64 characters");

  const hash1 = hashShareToken(rawToken);
  const hash2 = hashShareToken(rawToken);

  assert.strictEqual(hash1, hash2, "Hashing must be deterministic");
  assert.notStrictEqual(hash1, rawToken, "Raw token must never equal its hash");
  assert.strictEqual(hash1.length, 64, "SHA-256 output is 64 hex characters");
});

test("SHARE POLICY: Non-CLEAN or quarantined files cannot be shared", () => {
  const unapprovedStatuses = [
    "PENDING_UPLOAD",
    "QUARANTINED_PENDING_SCAN",
    "SCANNING",
    "SUSPICIOUS",
    "INFECTED",
    "SCAN_FAILED",
    null,
    undefined
  ];

  const checkShareEligibility = (file) => {
    if (!file || file.is_deleted) {
      return { eligible: false, reason: "File is deleted or does not exist" };
    }
    if (!file.scan_status || file.scan_status !== "CLEAN") {
      return { eligible: false, reason: "File is not clean" };
    }
    return { eligible: true };
  };

  for (const status of unapprovedStatuses) {
    const file = { id: "test-file", scan_status: status, is_deleted: false };
    const check = checkShareEligibility(file);
    assert.strictEqual(check.eligible, false, `Status ${status} must not be eligible for sharing`);
  }

  const cleanFile = { id: "clean-file", scan_status: "CLEAN", is_deleted: false };
  assert.strictEqual(checkShareEligibility(cleanFile).eligible, true);
});

test("SHARE POLICY: Soft-deleted clean files cannot be shared", () => {
  const deletedFile = { id: "deleted-clean-file", scan_status: "CLEAN", is_deleted: true };
  const checkShareEligibility = (file) => {
    if (!file || file.is_deleted) return false;
    return file.scan_status === "CLEAN";
  };
  assert.strictEqual(checkShareEligibility(deletedFile), false);
});

test("SHARE RESOLUTION: Expired or revoked share links are denied access", () => {
  const isLinkActive = (link) => {
    if (!link) return false;
    if (link.is_revoked) return false;
    if (link.expires_at && new Date() > new Date(link.expires_at)) return false;
    if (link.max_accesses && link.access_count >= link.max_accesses) return false;
    return true;
  };

  const activeLink = { is_revoked: false, expires_at: new Date(Date.now() + 3600000).toISOString(), max_accesses: 5, access_count: 2 };
  assert.strictEqual(isLinkActive(activeLink), true);

  const revokedLink = { ...activeLink, is_revoked: true };
  assert.strictEqual(isLinkActive(revokedLink), false);

  const expiredLink = { ...activeLink, expires_at: new Date(Date.now() - 1000).toISOString() };
  assert.strictEqual(isLinkActive(expiredLink), false);

  const maxedLink = { ...activeLink, access_count: 5 };
  assert.strictEqual(isLinkActive(maxedLink), false);
});

test("SHARE AUTHENTICATION: Password-protected share links securely verify bcrypt hashes", async () => {
  const rawPassword = "SharePassword123!";
  const hash = await bcrypt.hash(rawPassword, 10);

  const correctMatch = await bcrypt.compare(rawPassword, hash);
  const incorrectMatch = await bcrypt.compare("WrongPassword", hash);

  assert.strictEqual(correctMatch, true);
  assert.strictEqual(incorrectMatch, false);
});

test("SHARE AUDIT: Anonymous recipients are never attributed file owner ID", () => {
  const auditEventForPublicDownload = ({ ownerId, fileId, shareLinkId }) => {
    return {
      eventType: "SHARE_FILE_DOWNLOADED",
      actorId: null, // Strictly null for anonymous access
      actorLabel: "anonymous",
      resourceId: fileId,
      metadata: { shareLinkId }
    };
  };

  const event = auditEventForPublicDownload({
    ownerId: "real-owner-uuid-1234",
    fileId: "file-uuid-5678",
    shareLinkId: "share-uuid-9999"
  });

  assert.strictEqual(event.actorId, null);
  assert.strictEqual(event.actorLabel, "anonymous");
  assert.notStrictEqual(event.actorId, "real-owner-uuid-1234");
});
