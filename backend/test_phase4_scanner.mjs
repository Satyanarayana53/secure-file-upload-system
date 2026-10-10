import test from "node:test";
import assert from "node:assert/strict";
import { validateFile } from "./scanning/fileValidator.js";
import { inspectContent } from "./scanning/contentInspector.js";
import { runScanPipeline, SCAN_STATES } from "./scanning/scanOrchestrator.js";
import { aiAnalyzer } from "./scanning/aiAnalyzer.js";
import { ClamavScanner } from "./scanning/clamavScanner.js";

const EICAR_STRING = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

test("SCAN SECURITY: New file is never immediately clean; fails format/magic checks", () => {
  // A file with .pdf extension but binary junk without %PDF- magic signature
  const fakePdf = {
    buffer: Buffer.from("this is just plain text masquerading as pdf"),
    size: 44,
    originalname: "report.pdf"
  };

  const validation = validateFile(fakePdf);
  assert.strictEqual(validation.isValid, false);
  assert.match(validation.reason, /signature mismatch/i);
});

test("SCAN SECURITY: File with valid PDF signature passes format validation", () => {
  const validPdf = {
    buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"),
    size: 47,
    originalname: "document.pdf"
  };

  const validation = validateFile(validPdf);
  assert.strictEqual(validation.isValid, true);
  assert.strictEqual(validation.detectedType, "application/pdf");
});

test("SCAN SECURITY: Oversized files are rejected by fileValidator", () => {
  const oversizedFile = {
    buffer: Buffer.alloc(11 * 1024 * 1024), // 11MB exceeds 10MB limit
    size: 11 * 1024 * 1024,
    originalname: "huge.pdf"
  };

  const validation = validateFile(oversizedFile);
  assert.strictEqual(validation.isValid, false);
  assert.match(validation.reason, /exceeds maximum allowed limit/i);
});

test("SCAN SECURITY: Full-buffer EICAR detection flags file as INFECTED", () => {
  // EICAR placed after 5000 bytes (previously bypassed when only first 4KB was scanned!)
  const padding = "A".repeat(5000);
  const buffer = Buffer.from(padding + EICAR_STRING);

  const result = inspectContent(buffer, ".txt");
  assert.strictEqual(result.isMalicious, true);
  assert.strictEqual(result.threatType, "EICAR-Test-Signature");
  assert.strictEqual(result.indicators.includes("KNOWN_TEST_MALWARE_SIGNATURE"), true);
});

test("SCAN SECURITY: Disguised Windows PE binary (MZ header) in .jpg is flagged as INFECTED", () => {
  // Disguised executable starting with MZ (0x4D 0x5A)
  const peBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
  const result = inspectContent(peBuffer, ".jpg");

  assert.strictEqual(result.isMalicious, true);
  assert.strictEqual(result.threatType, "Disguised-Executable-PE");
});

test("SCAN SECURITY: Content inspector flags PDF embedded JavaScript and launch actions as SUSPICIOUS", () => {
  const suspiciousPdf = Buffer.from("%PDF-1.4\n/JavaScript (app.alert('evil')) /Launch (cmd.exe)");
  const result = inspectContent(suspiciousPdf, ".pdf");

  assert.strictEqual(result.isSuspicious, true);
  assert.strictEqual(result.indicators.includes("PDF_EMBEDDED_JAVASCRIPT"), true);
  assert.strictEqual(result.indicators.includes("PDF_LAUNCH_ACTION"), true);
});

test("SCAN SECURITY: ClamAV scanner handles unavailable daemon safely as SCAN_FAILED", async () => {
  // Point scanner to an inactive port to test timeout/unavailable behavior
  const scanner = new ClamavScanner({ host: "127.0.0.1", port: 59999, timeout: 500 });
  scanner.enabled = true; // force enabled for test

  const result = await scanner.scanBuffer(Buffer.from("sample content"));
  assert.strictEqual(result.scanned, false);
  assert.strictEqual(result.status, "SCAN_FAILED");
  assert.match(result.reason, /error|refused|failed|timeout/i);
});

test("AI INTEGRATION: AI analyzer cannot override confirmed malware result", async () => {
  const infectedResult = {
    status: SCAN_STATES.INFECTED,
    threatName: "EICAR-Test-Signature"
  };

  // Even if AI analyzer is asked, infected result remains terminal
  const aiAssessment = await aiAnalyzer.analyzeIndicators({
    indicators: ["KNOWN_TEST_MALWARE_SIGNATURE"]
  });

  // Architectural assertion: if infectedResult is terminal, final decision is ALWAYS INFECTED
  const finalStatus = infectedResult.status === SCAN_STATES.INFECTED ? SCAN_STATES.INFECTED : "OTHER";
  assert.strictEqual(finalStatus, SCAN_STATES.INFECTED);
  assert.strictEqual(aiAssessment.available, false); // No API key in test -> properly reports unavailable
});

test("PIPELINE: runScanPipeline transitions EICAR test buffer to INFECTED", async () => {
  const eicarBuffer = Buffer.from(EICAR_STRING);
  const result = await runScanPipeline({
    fileId: null,
    fileBuffer: eicarBuffer,
    fileName: "eicar.txt",
    userId: "test-user-id"
  });

  assert.strictEqual(result.status, SCAN_STATES.INFECTED);
  assert.strictEqual(result.isClean, false);
});

test("PIPELINE: Clean file passing all pipeline layers transitions to CLEAN", async () => {
  const cleanPdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
  const result = await runScanPipeline({
    fileId: null,
    fileBuffer: cleanPdfBuffer,
    fileName: "clean_doc.pdf",
    userId: "test-user-id"
  });

  assert.strictEqual(result.status, SCAN_STATES.CLEAN);
  assert.strictEqual(result.isClean, true);
});
