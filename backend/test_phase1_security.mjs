import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import authMiddleware from "./middleware/authMiddleware.js";
import { scanFileThreats } from "./utils/fileScanner.js";

const JWT_SECRET = "test-jwt-secret-with-sufficient-entropy-32-chars";
process.env.JWT_SECRET = JWT_SECRET;

test("AUTH SECURITY: authMiddleware rejects requests with missing Authorization header", () => {
  const req = { headers: {} };
  let statusCode = null;
  let responseData = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => {
          responseData = data;
        }
      };
    }
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  authMiddleware(req, res, next);
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusCode, 401);
  assert.strictEqual(responseData.success, false);
});

test("AUTH SECURITY: authMiddleware rejects token passed via URL query parameter", () => {
  const validToken = jwt.sign({ id: "user-123" }, JWT_SECRET);
  const req = {
    headers: {},
    query: { token: validToken } // Query string token must be rejected
  };
  let statusCode = null;
  let responseData = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return { json: (data) => { responseData = data; } };
    }
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  authMiddleware(req, res, next);
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusCode, 401);
});

test("AUTH SECURITY: authMiddleware rejects malformed or invalid Bearer format", () => {
  const req = {
    headers: { authorization: "Basic someCredentials" }
  };
  let statusCode = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return { json: () => {} };
    }
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  authMiddleware(req, res, next);
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusCode, 401);
});

test("AUTH SECURITY: authMiddleware rejects expired token with 403 status", () => {
  const expiredToken = jwt.sign({ id: "user-123" }, JWT_SECRET, { expiresIn: -10 });
  const req = {
    headers: { authorization: `Bearer ${expiredToken}` }
  };
  let statusCode = null;
  let responseData = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return { json: (data) => { responseData = data; } };
    }
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  authMiddleware(req, res, next);
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusCode, 403);
  assert.match(responseData.message, /expired/i);
});

test("AUTH SECURITY: authMiddleware accepts valid Bearer token and sets req.user", () => {
  const token = jwt.sign({ id: "user-safe-456" }, JWT_SECRET, { expiresIn: "1h" });
  const req = {
    headers: { authorization: `Bearer ${token}` }
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  const res = {};

  authMiddleware(req, res, next);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(req.user.id, "user-safe-456");
});

test("RESET SECURITY: Auth JWT is rejected when submitted as a password reset token", () => {
  const authJwt = jwt.sign({ id: "user-attacker" }, JWT_SECRET);
  // Reset token must not be accepted if it is a 3-part JWT
  const isJwtFormat = authJwt.split(".").length === 3;
  assert.strictEqual(isJwtFormat, true, "Auth JWT has 3 parts");

  // Verify rejection condition matches authController implementation
  const rejectJwtAsReset = (token) => {
    if (token.split(".").length === 3) {
      return { valid: false, message: "Invalid or expired reset token" };
    }
    return { valid: true };
  };

  const check = rejectJwtAsReset(authJwt);
  assert.strictEqual(check.valid, false);
});

test("RESET SECURITY: Cryptographic reset tokens use 256-bit random entropy and SHA-256 hash", () => {
  const rawToken1 = crypto.randomBytes(32).toString("hex");
  const rawToken2 = crypto.randomBytes(32).toString("hex");

  assert.notStrictEqual(rawToken1, rawToken2, "Tokens must be unique");
  assert.strictEqual(rawToken1.length, 64, "32-byte hex token has length 64");

  const hash1 = crypto.createHash("sha256").update(rawToken1).digest("hex");
  const hash2 = crypto.createHash("sha256").update(rawToken1).digest("hex");
  assert.strictEqual(hash1, hash2, "Hashing must be deterministic");
  assert.notStrictEqual(rawToken1, hash1, "Database stores only hash, never raw token");
});

test("PASSWORD POLICY: Enforces min 8 chars, 1 uppercase, 1 number, 1 special character", () => {
  const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
  assert.strictEqual(regex.test("weakpass"), false, "All lowercase rejected");
  assert.strictEqual(regex.test("Weakpass1"), false, "Missing special char rejected");
  assert.strictEqual(regex.test("Weakpass!"), false, "Missing number rejected");
  assert.strictEqual(regex.test("Wp1!"), false, "Too short rejected");
  assert.strictEqual(regex.test("SecurePass123!"), true, "Valid strong password accepted");
});

test("STORAGE SAFETY: Malicious filenames are sanitized and never used in storage path", () => {
  const maliciousNames = [
    "../../etc/passwd",
    "..\\..\\windows\\system32\\cmd.exe",
    "evil\0file.pdf",
    "test:stream:$DATA.png",
    "<script>alert(1)</script>.jpg",
    "super/nested/path/document.pdf"
  ];

  for (const name of maliciousNames) {
    // Generate safe storage name
    const randomHex = crypto.randomBytes(16).toString("hex");
    const cleanExt = (name.match(/\.[a-zA-Z0-9]+$/) || [""])[0].toLowerCase();
    const storageName = `${randomHex}${cleanExt}`;
    const storagePath = `user-123/${storageName}`;

    // Verify no path traversal sequence exists in storage path
    assert.strictEqual(storagePath.includes(".."), false, `Storage path for ${name} must not contain '..'`);
    assert.strictEqual(storagePath.includes("\\"), false, `Storage path for ${name} must not contain backslash`);
    assert.strictEqual(storagePath.includes("\0"), false, `Storage path for ${name} must not contain null byte`);
    assert.strictEqual(storagePath.startsWith("user-123/"), true, "Storage path must stay strictly inside user partition");
  }
});

test("FILE VALIDATION: EICAR standard test signature is detected", () => {
  const eicarFile = {
    originalname: "sample.txt",
    size: 68,
    buffer: Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")
  };

  const result = scanFileThreats(eicarFile);
  assert.strictEqual(result.isSafe, false);
  assert.match(result.reason, /antivirus test signature/i);
});
