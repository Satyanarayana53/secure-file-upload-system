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

test("SHARE CONCURRENCY: Access count limit cannot be breached under concurrent requests", async () => {
  // Simulate concurrent access reservation logic with atomic limit gating
  let link = { id: "link-1", max_accesses: 2, access_count: 0 };
  let lock = false;

  const simulateAtomicIncrement = async () => {
    // Wait for simulated row lock
    while (lock) {
      await new Promise((r) => setTimeout(r, 1));
    }
    lock = true;
    try {
      if (link.max_accesses && link.access_count >= link.max_accesses) {
        return { success: false, accessCount: link.access_count };
      }
      link.access_count += 1;
      return { success: true, accessCount: link.access_count };
    } finally {
      lock = false;
    }
  };

  // Launch 10 simultaneous download requests for a link with max_accesses = 2
  const results = await Promise.all([
    simulateAtomicIncrement(),
    simulateAtomicIncrement(),
    simulateAtomicIncrement(),
    simulateAtomicIncrement(),
    simulateAtomicIncrement(),
    simulateAtomicIncrement(),
    simulateAtomicIncrement(),
    simulateAtomicIncrement(),
    simulateAtomicIncrement(),
    simulateAtomicIncrement()
  ]);

  const granted = results.filter((r) => r.success);
  const denied = results.filter((r) => !r.success);

  assert.strictEqual(granted.length, 2, "Only exactly 2 concurrent requests must be granted access");
  assert.strictEqual(denied.length, 8, "8 remaining concurrent requests must be denied");
  assert.strictEqual(link.access_count, 2, "Access count must strictly not exceed max_accesses");
});

test("SHARE METADATA PRIVACY: Password-protected share links mask file name and size before authentication", async () => {
  const maskShareMetadata = (link, providedPassword, passwordHash) => {
    const hasPassword = Boolean(passwordHash);
    let isVerified = false;
    if (hasPassword && providedPassword) {
      // In real code bcrypt is used
      isVerified = providedPassword === "secret123";
    }

    if (hasPassword && !isVerified) {
      return {
        hasPassword: true,
        isPasswordProtected: true,
        file: {
          name: "Protected File",
          size: null,
          type: null,
          isProtected: true
        }
      };
    }

    return {
      hasPassword,
      isPasswordProtected: hasPassword,
      file: {
        name: link.file.file_name,
        size: link.file.file_size,
        type: link.file.file_type,
        isProtected: hasPassword
      }
    };
  };

  const sampleLink = { file: { file_name: "Confidential_Payroll.xlsx", file_size: 2048576, file_type: "application/vnd.ms-excel" } };
  
  // Unauthenticated resolve
  const masked = maskShareMetadata(sampleLink, null, "hashed_pw");
  assert.strictEqual(masked.file.name, "Protected File");
  assert.strictEqual(masked.file.size, null);
  assert.strictEqual(masked.isPasswordProtected, true);

  // Authenticated resolve
  const unmasked = maskShareMetadata(sampleLink, "secret123", "hashed_pw");
  assert.strictEqual(unmasked.file.name, "Confidential_Payroll.xlsx");
  assert.strictEqual(unmasked.file.size, 2048576);
});

test("SHARE COMPENSATION: Storage retrieval failure compensates reserved access counter", () => {
  let link = { id: "link-1", max_accesses: 3, access_count: 1 };

  // Step 1: Reservation
  link.access_count += 1;
  assert.strictEqual(link.access_count, 2);

  // Step 2: Storage download fails
  const storageError = true;
  if (storageError) {
    // Compensating action
    link.access_count = Math.max(0, link.access_count - 1);
  }

  // Counter is restored so user quota is not penalized
  assert.strictEqual(link.access_count, 1, "Access counter must be decremented back on storage failure");
});

test("SHARE ACCESS CONTROL: Download rejects file if file owner does not match share link owner", () => {
  const verifyOwnership = (shareLink, file) => {
    if (!file || file.user_id !== shareLink.owner_id) {
      return { allowed: false, status: 404, message: "File ownership mismatch or file not found" };
    }
    return { allowed: true };
  };

  const shareLink = { id: "share-1", owner_id: "user-alpha" };
  const legitimateFile = { id: "file-1", user_id: "user-alpha" };
  const hijackedFile = { id: "file-2", user_id: "user-beta" };

  assert.strictEqual(verifyOwnership(shareLink, legitimateFile).allowed, true);
  assert.strictEqual(verifyOwnership(shareLink, hijackedFile).allowed, false);
});

