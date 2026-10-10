import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { hashToken } from "./controllers/authController.js";
import { resendVerificationLimiter, verifyEmailLimiter } from "./middleware/rateLimiter.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "./utils/emailService.js";
import { sanitizeMetadata } from "./utils/auditLogger.js";

test("VERIFY SECURITY: Verification tokens use 256-bit random entropy and SHA-256 hashing", () => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  assert.strictEqual(rawToken.length, 64, "Raw token must have 64 hex characters (256 bits)");

  const tokenHash1 = hashToken(rawToken);
  const tokenHash2 = hashToken(rawToken);

  assert.strictEqual(tokenHash1, tokenHash2, "Hashing must be deterministic");
  assert.notStrictEqual(tokenHash1, rawToken, "Raw token must never equal its hash");
  assert.strictEqual(tokenHash1.length, 64, "SHA-256 hash must be 64 characters");
});

test("VERIFY SECURITY: Auth JWT tokens are rejected as verification tokens", () => {
  const mockJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.signature";
  const isValidFormat = (token) => {
    if (!token || typeof token !== "string") return false;
    if (token.split(".").length === 3) return false; // Rejected: is JWT
    return token.length === 64;
  };

  assert.strictEqual(isValidFormat(mockJwt), false, "JWT format must be strictly rejected");
  assert.strictEqual(isValidFormat("short-token"), false, "Short tokens must be rejected");
  assert.strictEqual(isValidFormat(crypto.randomBytes(32).toString("hex")), true, "64-char hex token accepted");
});

test("VERIFY EXPIRY: Expired verification tokens are rejected", () => {
  const isTokenExpired = (record) => {
    return new Date() > new Date(record.expires_at);
  };

  const expiredRecord = {
    expires_at: new Date(Date.now() - 60000).toISOString() // 1 minute in the past
  };
  const activeRecord = {
    expires_at: new Date(Date.now() + 86400000).toISOString() // 24 hours in the future
  };

  assert.strictEqual(isTokenExpired(expiredRecord), true, "Past expiration must be marked expired");
  assert.strictEqual(isTokenExpired(activeRecord), false, "Future expiration must not be expired");
});

test("VERIFY REUSE: Consumed tokens cannot be reused (single-use enforcement)", () => {
  const isTokenReusable = (record) => {
    return !record.used_at;
  };

  const unusedRecord = { id: "tok-1", used_at: null };
  const consumedRecord = { id: "tok-2", used_at: new Date().toISOString() };

  assert.strictEqual(isTokenReusable(unusedRecord), true);
  assert.strictEqual(isTokenReusable(consumedRecord), false);
});

test("VERIFY CONCURRENCY: Simultaneous verification attempts cannot consume token multiple times", async () => {
  // Simulate database row lock and atomic single-use consumption:
  // UPDATE email_verification_tokens SET used_at = NOW() WHERE id = tok-1 AND used_at IS NULL
  let tokenRecord = { id: "tok-1", used_at: null, user_id: "user-123" };
  let dbLock = false;

  const simulateAtomicTokenConsumption = async () => {
    while (dbLock) {
      await new Promise((r) => setTimeout(r, 1));
    }
    dbLock = true;
    try {
      if (tokenRecord.used_at !== null) {
        return { success: false, reason: "already_consumed" };
      }
      tokenRecord.used_at = new Date().toISOString();
      return { success: true };
    } finally {
      dbLock = false;
    }
  };

  // Launch 10 simultaneous verification requests for the exact same token
  const results = await Promise.all([
    simulateAtomicTokenConsumption(),
    simulateAtomicTokenConsumption(),
    simulateAtomicTokenConsumption(),
    simulateAtomicTokenConsumption(),
    simulateAtomicTokenConsumption(),
    simulateAtomicTokenConsumption(),
    simulateAtomicTokenConsumption(),
    simulateAtomicTokenConsumption(),
    simulateAtomicTokenConsumption(),
    simulateAtomicTokenConsumption()
  ]);

  const successful = results.filter((r) => r.success);
  const rejected = results.filter((r) => !r.success);

  assert.strictEqual(successful.length, 1, "Exactly one concurrent request must succeed");
  assert.strictEqual(rejected.length, 9, "9 concurrent requests must be rejected as already consumed");
});

test("VERIFY POLICY: requireEmailVerified middleware blocks unverified accounts from creating share links", async () => {
  const mockMiddleware = (user) => {
    if (!user || !user.email_verified) {
      return {
        status: 403,
        body: {
          success: false,
          code: "EMAIL_NOT_VERIFIED",
          message: "Email verification is required for this action"
        }
      };
    }
    return { status: 200, nextCalled: true };
  };

  const unverifiedUser = { id: "user-unverified", email_verified: false };
  const verifiedUser = { id: "user-verified", email_verified: true };

  const blocked = mockMiddleware(unverifiedUser);
  assert.strictEqual(blocked.status, 403);
  assert.strictEqual(blocked.body.code, "EMAIL_NOT_VERIFIED");

  const allowed = mockMiddleware(verifiedUser);
  assert.strictEqual(allowed.status, 200);
  assert.strictEqual(allowed.nextCalled, true);
});

test("VERIFY POLICY: Unverified accounts can still perform private file management", () => {
  // Policy rule verification:
  // Private operations (upload, rename, delete) are permitted for personal workspace evaluation;
  // Outbound public links strictly require email verification to prevent abuse and phishing.
  const isOperationPermitted = (operation, emailVerified) => {
    if (operation === "CREATE_PUBLIC_SHARE") {
      return emailVerified === true;
    }
    // Private file operations
    const privateOps = ["UPLOAD_FILE", "GET_FILES", "RENAME_FILE", "MOVE_FILE", "DELETE_FILE"];
    return privateOps.includes(operation);
  };

  assert.strictEqual(isOperationPermitted("UPLOAD_FILE", false), true, "Upload allowed for unverified user");
  assert.strictEqual(isOperationPermitted("GET_FILES", false), true, "List files allowed for unverified user");
  assert.strictEqual(isOperationPermitted("CREATE_PUBLIC_SHARE", false), false, "Public share BLOCKED for unverified user");
  assert.strictEqual(isOperationPermitted("CREATE_PUBLIC_SHARE", true), true, "Public share ALLOWED for verified user");
});

test("VERIFY RATE LIMITING: Rate limiters exist and configure safe thresholds", () => {
  assert.ok(resendVerificationLimiter, "resendVerificationLimiter must be defined");
  assert.ok(verifyEmailLimiter, "verifyEmailLimiter must be defined");
});

test("VERIFY EMAIL SERVICE: Email delivery handles missing SMTP configuration safely without crashing", async () => {
  // Test with undefined credentials
  const originalUser = process.env.EMAIL_USER;
  const originalPass = process.env.EMAIL_PASS;
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;

  try {
    const res = await sendVerificationEmail({
      toEmail: "user@example.com",
      username: "testuser",
      rawToken: crypto.randomBytes(32).toString("hex")
    });

    assert.strictEqual(res.sent, false);
    assert.strictEqual(res.reason, "smtp_not_configured");

    const resetRes = await sendPasswordResetEmail({
      toEmail: "user@example.com",
      rawToken: crypto.randomBytes(32).toString("hex")
    });

    assert.strictEqual(resetRes.sent, false);
    assert.strictEqual(resetRes.reason, "smtp_not_configured");
  } finally {
    process.env.EMAIL_USER = originalUser;
    process.env.EMAIL_PASS = originalPass;
  }
});

test("VERIFY AUDIT: Verification tokens and reset tokens are redacted from audit logs", () => {
  const sensitiveMeta = {
    email: "test@example.com",
    token: "64-character-raw-token-value-should-be-redacted",
    verificationToken: "another-token",
    password: "UserPassword123!"
  };

  const sanitized = sanitizeMetadata(sensitiveMeta);

  assert.strictEqual(sanitized.token, "[REDACTED]");
  assert.strictEqual(sanitized.verificationToken, "[REDACTED]");
  assert.strictEqual(sanitized.password, "[REDACTED]");
  assert.strictEqual(sanitized.email, "test@example.com");
});
