import test from "node:test";
import assert from "node:assert/strict";
import net from "net";
import dns from "dns";
import nodemailer from "nodemailer";
import { ClamavScanner } from "./scanning/clamavScanner.js";
import { SCAN_STATES } from "./scanning/scanOrchestrator.js";
import { inspectContent } from "./scanning/contentInspector.js";
import { validateFile } from "./scanning/fileValidator.js";

const EICAR_TEST_BUFFER = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");

// Helper to spawn a local ClamAV protocol mock daemon for local service integration testing
function createMockClamavServer() {
  const server = net.createServer((socket) => {
    let received = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      const str = received.toString("latin1");

      if (str.includes("zPING") || str.includes("PING")) {
        socket.write("PONG\0");
        return;
      }
      if (str.includes("zVERSION") || str.includes("VERSION")) {
        socket.write("ClamAV 1.4.0/27500/Sun Oct 11 00:00:00 2026\0");
        return;
      }
      if (str.includes("zINSTREAM") || str.includes("INSTREAM")) {
        // If EICAR pattern is present in the streamed content
        if (str.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) {
          socket.write("stream: Win.Test.EICAR_HDB-1 FOUND\n");
          socket.end();
          return;
        }
        // If end chunk (0x00 0x00 0x00 0x00) is present at the end
        if (received.length >= 4 && received.readUInt32BE(received.length - 4) === 0) {
          socket.write("stream: OK\n");
          socket.end();
          return;
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

// ==========================================
// CATEGORY 1: LIVE SMTP TESTS
// ==========================================
test("LIVE SMTP: Gmail SMTP credentials successfully verify TLS handshake and authentication", async () => {
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

  const verified = await transporter.verify();
  assert.equal(verified, true, "Live SMTP handshake must return true");
});

// ==========================================
// CATEGORY 2: LOCAL CLAMAV PROTOCOL INTEGRATION TESTS
// ==========================================
test("LOCAL CLAMAV INTEGRATION: Protocol scanner client pings mock daemon and receives PONG", async () => {
  const { server, port } = await createMockClamavServer();
  try {
    const scanner = new ClamavScanner({ host: "127.0.0.1", port, timeout: 3000 });
    scanner.enabled = true;

    const res = await scanner.ping();
    assert.equal(res.available, true, "Scanner must receive PONG from daemon");
  } finally {
    server.close();
  }
});

test("LOCAL CLAMAV INTEGRATION: Protocol scanner client queries daemon engine and signature version", async () => {
  const { server, port } = await createMockClamavServer();
  try {
    const scanner = new ClamavScanner({ host: "127.0.0.1", port, timeout: 3000 });
    scanner.enabled = true;

    const version = await scanner.getVersion();
    assert.ok(version.includes("ClamAV 1.4.0"), "Scanner must parse version response");
  } finally {
    server.close();
  }
});

test("LOCAL CLAMAV INTEGRATION: Clean file scanned over INSTREAM TCP protocol returns CLEAN", async () => {
  const { server, port } = await createMockClamavServer();
  try {
    const scanner = new ClamavScanner({ host: "127.0.0.1", port, timeout: 3000 });
    scanner.enabled = true;

    const cleanBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
    const result = await scanner.scanBuffer(cleanBuffer);

    assert.equal(result.scanned, true);
    assert.equal(result.status, SCAN_STATES.CLEAN);
    assert.equal(result.threatName, null);
  } finally {
    server.close();
  }
});

test("LOCAL CLAMAV INTEGRATION: EICAR test buffer scanned over INSTREAM TCP protocol returns INFECTED", async () => {
  const { server, port } = await createMockClamavServer();
  try {
    const scanner = new ClamavScanner({ host: "127.0.0.1", port, timeout: 3000 });
    scanner.enabled = true;

    const result = await scanner.scanBuffer(EICAR_TEST_BUFFER);

    assert.equal(result.scanned, true);
    assert.equal(result.status, SCAN_STATES.INFECTED);
    assert.equal(result.threatName, "Win.Test.EICAR_HDB-1");
  } finally {
    server.close();
  }
});

test("LOCAL CLAMAV INTEGRATION: Socket closure mid-stream produces SCAN_FAILED and never marks clean", async () => {
  // Create server that abruptly terminates connection
  const abortServer = net.createServer((socket) => {
    socket.destroy(); // Abrupt disconnect
  });

  const { server, port } = await new Promise((resolve) => {
    abortServer.listen(0, "127.0.0.1", () => {
      resolve({ server: abortServer, port: abortServer.address().port });
    });
  });

  try {
    const scanner = new ClamavScanner({ host: "127.0.0.1", port, timeout: 1000 });
    scanner.enabled = true;

    const result = await scanner.scanBuffer(Buffer.from("Harmless clean test file"));

    assert.equal(result.scanned, false);
    assert.equal(result.status, SCAN_STATES.SCAN_FAILED);
    assert.notEqual(result.status, SCAN_STATES.CLEAN);
  } finally {
    server.close();
  }
});

// ==========================================
// CATEGORY 3: LIVE CLAMAV REAL DAEMON PROBE
// ==========================================
test("LIVE CLAMAV DAEMON: Connection to 127.0.0.1:3310 reports offline status and fails closed", async () => {
  const scanner = new ClamavScanner({ host: "127.0.0.1", port: 3310, timeout: 1000 });
  scanner.enabled = true;

  const result = await scanner.scanBuffer(Buffer.from("Probe file"));

  assert.equal(result.scanned, false);
  assert.equal(result.status, SCAN_STATES.SCAN_FAILED);
  assert.match(result.reason, /ECONNREFUSED|socket connection error/i);
});

// ==========================================
// CATEGORY 4: LIVE SUPABASE DNS & CONNECTIVITY PROBE
// ==========================
test("LIVE SUPABASE PROBE: Hostname resolution detects DNS status accurately", async () => {
  const hostname = (process.env.SUPABASE_URL || "https://fignsmnnkkcejacmaegn.supabase.co")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");

  const lookupPromise = new Promise((resolve) => {
    dns.lookup(hostname, (err, address) => {
      if (err) {
        resolve({ resolved: false, code: err.code, message: err.message });
      } else {
        resolve({ resolved: true, address });
      }
    });
  });

  const result = await lookupPromise;
  // Recorded empirically: ENOTFOUND
  if (!result.resolved) {
    assert.equal(result.code, "ENOTFOUND", "Unresolvable project returns ENOTFOUND");
  } else {
    assert.ok(result.address, "Resolvable project returns IP address");
  }
});

// ==========================================
// CATEGORY 5: IN-PROCESS STATIC MALWARE & EICAR DETECTION
// ==========================================
test("STATIC MALWARE DETECTION: Direct buffer inspection traps EICAR signature as INFECTED", () => {
  const inspectRes = inspectContent(EICAR_TEST_BUFFER, "txt");
  assert.equal(inspectRes.isMalicious, true);
  assert.equal(inspectRes.threatType, "EICAR-Test-Signature");
});

test("STATIC MALWARE DETECTION: Executable masquerade (MZ header in .png) detected as INFECTED", () => {
  const fakePng = Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00This is a Windows executable");
  const validation = validateFile({
    buffer: fakePng,
    size: fakePng.length,
    originalname: "innocent_picture.png"
  });

  assert.equal(validation.isValid, false);
  assert.match(validation.reason, /Disguised executable|signature mismatch/i);
});
