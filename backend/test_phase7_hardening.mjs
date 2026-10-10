import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import authMiddleware from "./middleware/authMiddleware.js";
import supabase from "./config/supabase.js";

const JWT_SECRET = process.env.JWT_SECRET || "phase7-test-secret-key-1234567890";
process.env.JWT_SECRET = JWT_SECRET;

// Helper to create mock response
const createMockRes = () => {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    cookies: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    cookie(name, val, opts) {
      this.cookies[name] = { val, opts };
      return this;
    },
    clearCookie(name) {
      delete this.cookies[name];
      return this;
    }
  };
  return res;
};

test("PHASE 7 - CREDENTIAL PROHIBITION: Rejects auth tokens passed in URL query string", async () => {
  const req = {
    query: { token: "secret-token-in-query-string" },
    headers: {},
    cookies: {}
  };
  const res = createMockRes();
  let nextCalled = false;

  await authMiddleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false, "Should not call next() when token is in query string");
  assert.equal(res.statusCode, 401, "Status code should be 401");
  assert.match(res.data.message, /URL query parameter is forbidden/i);
});

test("PHASE 7 - HEADER EXTRACTION: Accepts Authorization: Bearer token and rejects malformed format", async () => {
  const validToken = jwt.sign({ id: "user-uuid-1" }, JWT_SECRET);

  // 1. Valid Bearer
  const reqValid = {
    headers: { authorization: `Bearer ${validToken}` },
    query: {}
  };
  const resValid = createMockRes();
  let nextValidCalled = false;
  await authMiddleware(reqValid, resValid, () => { nextValidCalled = true; });
  assert.equal(nextValidCalled, true);
  assert.equal(reqValid.user.id, "user-uuid-1");

  // 2. Malformed Header (no Bearer prefix)
  const reqMalformed = {
    headers: { authorization: validToken },
    query: {}
  };
  const resMalformed = createMockRes();
  let nextMalformedCalled = false;
  await authMiddleware(reqMalformed, resMalformed, () => { nextMalformedCalled = true; });
  assert.equal(nextMalformedCalled, false);
  assert.equal(resMalformed.statusCode, 401);
  assert.match(resMalformed.data.message, /Expected 'Bearer <token>'/i);
});

test("PHASE 7 - COOKIE EXTRACTION: Supports HttpOnly auth_token cookie", async () => {
  const validToken = jwt.sign({ id: "user-cookie-1" }, JWT_SECRET);

  // Via req.cookies object
  const reqCookie = {
    headers: {},
    query: {},
    cookies: { auth_token: validToken }
  };
  const resCookie = createMockRes();
  let nextCookieCalled = false;
  await authMiddleware(reqCookie, resCookie, () => { nextCookieCalled = true; });
  assert.equal(nextCookieCalled, true);
  assert.equal(reqCookie.user.id, "user-cookie-1");

  // Via raw req.headers.cookie string
  const reqRawHeader = {
    headers: { cookie: `theme=dark; auth_token=${validToken}; pref=1` },
    query: {}
  };
  const resRaw = createMockRes();
  let nextRawCalled = false;
  await authMiddleware(reqRawHeader, resRaw, () => { nextRawCalled = true; });
  assert.equal(nextRawCalled, true);
  assert.equal(reqRawHeader.user.id, "user-cookie-1");
});

test("PHASE 7 - TOKEN VERSIONING: Outdated token version is rejected following password change/reset", async () => {
  // Mock Supabase to return user with token_version = 2
  const originalFrom = supabase.from;
  supabase.from = (table) => {
    if (table === "users") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: "user-v2", is_active: true, token_version: 2 },
              error: null
            })
          })
        })
      };
    }
    return originalFrom.call(supabase, table);
  };

  try {
    // 1. Token minted with old tokenVersion = 1
    const oldToken = jwt.sign({ id: "user-v2", sessionId: "sess-1", tokenVersion: 1 }, JWT_SECRET);
    const reqOld = {
      headers: { authorization: `Bearer ${oldToken}` },
      query: {}
    };
    const resOld = createMockRes();
    let nextOldCalled = false;
    await authMiddleware(reqOld, resOld, () => { nextOldCalled = true; });

    assert.equal(nextOldCalled, false, "Old token version must be rejected");
    assert.equal(resOld.statusCode, 401);
    assert.match(resOld.data.message, /Session revoked due to password change/i);

    // 2. Token minted with current tokenVersion = 2
    const currentToken = jwt.sign({ id: "user-v2", sessionId: "sess-2", tokenVersion: 2 }, JWT_SECRET);
    const reqCurrent = {
      headers: { authorization: `Bearer ${currentToken}` },
      query: {}
    };
    const resCurrent = createMockRes();
    let nextCurrentCalled = false;
    await authMiddleware(reqCurrent, resCurrent, () => { nextCurrentCalled = true; });

    assert.equal(nextCurrentCalled, true, "Current token version must be accepted");
  } finally {
    supabase.from = originalFrom;
  }
});

test("PHASE 7 - SESSION REVOCATION: Revoked session in user_sessions is rejected on logout", async () => {
  const originalFrom = supabase.from;
  supabase.from = (table) => {
    if (table === "users") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: "user-sess-test", is_active: true, token_version: 1 },
              error: null
            })
          })
        })
      };
    }
    if (table === "user_sessions") {
      return {
        select: () => ({
          eq: (col, val) => ({
            single: async () => {
              if (val === "logged-out-session") {
                return {
                  data: { id: "logged-out-session", is_revoked: true, expires_at: new Date(Date.now() + 3600000).toISOString() },
                  error: null
                };
              }
              return {
                data: { id: "active-session", is_revoked: false, expires_at: new Date(Date.now() + 3600000).toISOString() },
                error: null
              };
            }
          })
        })
      };
    }
    return originalFrom.call(supabase, table);
  };

  try {
    // 1. Revoked session token
    const revokedToken = jwt.sign({ id: "user-sess-test", sessionId: "logged-out-session", tokenVersion: 1 }, JWT_SECRET);
    const reqRevoked = {
      headers: { authorization: `Bearer ${revokedToken}` },
      query: {}
    };
    const resRevoked = createMockRes();
    let nextRevokedCalled = false;
    await authMiddleware(reqRevoked, resRevoked, () => { nextRevokedCalled = true; });

    assert.equal(nextRevokedCalled, false, "Revoked session must be blocked");
    assert.equal(resRevoked.statusCode, 401);
    assert.match(resRevoked.data.message, /Session has been logged out or revoked/i);

    // 2. Active session token
    const activeToken = jwt.sign({ id: "user-sess-test", sessionId: "active-session", tokenVersion: 1 }, JWT_SECRET);
    const reqActive = {
      headers: { authorization: `Bearer ${activeToken}` },
      query: {}
    };
    const resActive = createMockRes();
    let nextActiveCalled = false;
    await authMiddleware(reqActive, resActive, () => { nextActiveCalled = true; });

    assert.equal(nextActiveCalled, true, "Active unrevoked session must be allowed");
  } finally {
    supabase.from = originalFrom;
  }
});

test("PHASE 7 - ACCOUNT DISABLED: Deactivated user (is_active = false) is denied access", async () => {
  const originalFrom = supabase.from;
  supabase.from = (table) => {
    if (table === "users") {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: "disabled-user", is_active: false, token_version: 1 },
              error: null
            })
          })
        })
      };
    }
    return originalFrom.call(supabase, table);
  };

  try {
    const token = jwt.sign({ id: "disabled-user", sessionId: "sess-any", tokenVersion: 1 }, JWT_SECRET);
    const req = {
      headers: { authorization: `Bearer ${token}` },
      query: {}
    };
    const res = createMockRes();
    let nextCalled = false;
    await authMiddleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false, "Disabled user must be denied");
    assert.equal(res.statusCode, 401);
    assert.match(res.data.message, /Account is disabled/i);
  } finally {
    supabase.from = originalFrom;
  }
});

test("PHASE 7 - SAFE FILE DELIVERY HEADERS: Download endpoints enforce nosniff and default-src 'none'", async () => {
  // Verify that fileController sets safe delivery headers
  const fileControllerSrc = fs.readFileSync(path.join(process.cwd(), "controllers", "fileController.js"), "utf8");
  const shareControllerSrc = fs.readFileSync(path.join(process.cwd(), "controllers", "shareController.js"), "utf8");

  assert.ok(fileControllerSrc.includes('res.setHeader("X-Content-Type-Options", "nosniff");'), "fileController must enforce nosniff");
  assert.ok(fileControllerSrc.includes('res.setHeader("Content-Security-Policy", "default-src \'none\'");'), "fileController must enforce strict CSP");
  assert.ok(fileControllerSrc.includes("Content-Disposition"), "fileController must specify Content-Disposition");

  assert.ok(shareControllerSrc.includes('res.setHeader("X-Content-Type-Options", "nosniff");'), "shareController must enforce nosniff");
  assert.ok(shareControllerSrc.includes('res.setHeader("Content-Security-Policy", "default-src \'none\'");'), "shareController must enforce strict CSP");
});

test("PHASE 7 - CORS & CSP HARDENING: Wildcard CORS rejected with credentials, strict CSP defined", async () => {
  const serverSrc = fs.readFileSync(path.join(process.cwd(), "server.js"), "utf8");

  // Verify CORS excludes '*' when credentials are true
  assert.ok(serverSrc.includes('.filter((origin) => origin && origin !== "*")'), "server.js must explicitly disallow wildcard origin");
  assert.ok(serverSrc.includes("credentials: true"), "CORS credentials must be enabled");

  // Verify CSP frameAncestors: none
  assert.ok(serverSrc.includes("frameAncestors: [\"'none'\"]"), "CSP must set frameAncestors to none");
  assert.ok(serverSrc.includes("objectSrc: [\"'none'\"]"), "CSP must set objectSrc to none");
});

test("PHASE 7 - DATABASE HARDENING: Migration script enables RLS and creates user_sessions table", async () => {
  const migrationPath = path.join(process.cwd(), "sql", "phase7_session_hardening_migration.sql");
  assert.ok(fs.existsSync(migrationPath), "phase7_session_hardening_migration.sql must exist");

  const migrationSql = fs.readFileSync(migrationPath, "utf8");
  assert.ok(migrationSql.includes("CREATE TABLE IF NOT EXISTS user_sessions"), "Must create user_sessions table");
  assert.ok(migrationSql.includes("ALTER TABLE users ADD COLUMN is_active"), "Must add is_active column");
  assert.ok(migrationSql.includes("ALTER TABLE users ADD COLUMN token_version"), "Must add token_version column");
  assert.ok(migrationSql.includes("ENABLE ROW LEVEL SECURITY"), "Must enable RLS");
  assert.ok(migrationSql.includes("CREATE POLICY users_self_isolation"), "Must define users RLS policy");
  assert.ok(migrationSql.includes("CREATE POLICY files_owner_isolation"), "Must define files RLS policy");
});
