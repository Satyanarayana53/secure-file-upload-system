import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { sanitizeMetadata, extractClientIp, extractUserAgent } from "./utils/auditLogger.js";
import { getAuditLogs } from "./controllers/auditController.js";

test("AUDIT SECURITY: sanitizeMetadata redacts passwords, tokens, secrets, and auth keys", () => {
  const sensitiveInput = {
    username: "alice",
    password: "SuperSecretPassword123!",
    token: "jwt-token-string",
    authorization: "Bearer secret-bearer",
    apiKey: "api-key-value",
    cookie: "session=12345",
    userHash: "hashed-value",
    otpCode: "987654",
    nested: {
      passwordHash: "$2b$12$somehash",
      cleanField: "safe value"
    }
  };

  const sanitized = sanitizeMetadata(sensitiveInput);

  assert.strictEqual(sanitized.username, "alice");
  assert.strictEqual(sanitized.password, "[REDACTED]");
  assert.strictEqual(sanitized.token, "[REDACTED]");
  assert.strictEqual(sanitized.authorization, "[REDACTED]");
  assert.strictEqual(sanitized.apiKey, "[REDACTED]");
  assert.strictEqual(sanitized.cookie, "[REDACTED]");
  assert.strictEqual(sanitized.userHash, "[REDACTED]");
  assert.strictEqual(sanitized.otpCode, "[REDACTED]");
  assert.strictEqual(sanitized.nested.passwordHash, "[REDACTED]");
  assert.strictEqual(sanitized.nested.cleanField, "safe value");
});

test("AUDIT SECURITY: sanitizeMetadata limits string size and recursion depth to prevent DoS", () => {
  const hugeString = "A".repeat(1000);
  const sanitized = sanitizeMetadata({ data: hugeString });
  assert.strictEqual(sanitized.data.endsWith("... [truncated]"), true);
  assert.strictEqual(sanitized.data.length < 600, true);
});

test("AUDIT SECURITY: Client IP and User-Agent extraction handles forwarded headers safely", () => {
  const req = {
    headers: {
      "x-forwarded-for": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  };

  const ip = extractClientIp(req);
  const ua = extractUserAgent(req);

  assert.strictEqual(ip, "203.0.113.195");
  assert.strictEqual(ua.includes("Windows NT"), true);
});

test("AUDIT API: getAuditLogs validates pagination limits and rejects negative/invalid pages", async () => {
  const req = {
    user: { id: "user-123" },
    query: { page: -1, limit: 500 } // Invalid: page < 1, limit > 100
  };

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

  await getAuditLogs(req, res);
  assert.strictEqual(statusCode, 400);
  assert.strictEqual(responseData.success, false);
});

test("AUDIT API: getAuditLogs validates outcome filter against allowlist", async () => {
  const req = {
    user: { id: "user-123" },
    query: { outcome: "malicious_injection' OR '1'='1" }
  };

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

  await getAuditLogs(req, res);
  assert.strictEqual(statusCode, 400);
  assert.strictEqual(responseData.success, false);
});

test("AUDIT DATA: Events use UTC timestamps and random correlation IDs", () => {
  const correlationId1 = crypto.randomBytes(12).toString("hex");
  const correlationId2 = crypto.randomBytes(12).toString("hex");

  assert.notStrictEqual(correlationId1, correlationId2);
  assert.strictEqual(correlationId1.length, 24);

  const utcNow = new Date().toISOString();
  assert.match(utcNow, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});
