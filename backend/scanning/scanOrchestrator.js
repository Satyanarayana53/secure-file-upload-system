import supabase from "../config/supabase.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { validateFile } from "./fileValidator.js";
import { inspectContent } from "./contentInspector.js";
import { clamavScanner } from "./clamavScanner.js";
import { aiAnalyzer } from "./aiAnalyzer.js";

/**
 * Scan state machine:
 * PENDING_UPLOAD -> QUARANTINED_PENDING_SCAN -> SCANNING -> CLEAN | SUSPICIOUS | INFECTED | SCAN_FAILED
 */
export const SCAN_STATES = {
  PENDING_UPLOAD: "PENDING_UPLOAD",
  QUARANTINED_PENDING_SCAN: "QUARANTINED_PENDING_SCAN",
  SCANNING: "SCANNING",
  CLEAN: "CLEAN",
  SUSPICIOUS: "SUSPICIOUS",
  INFECTED: "INFECTED",
  SCAN_FAILED: "SCAN_FAILED"
};

/**
 * Executes the complete layered scanning pipeline on a file:
 * 
 * Layer 1: Format Validation & Magic Numbers (fileValidator)
 * Layer 2: Deep Content Inspection & Static Analysis (contentInspector)
 * Layer 3: ClamAV Antivirus Daemon (clamavScanner)
 * Layer 4: AI Threat Analysis (aiAnalyzer)
 * 
 * Rules:
 * - If ClamAV finds malware -> INFECTED (terminal, AI cannot override)
 * - If ClamAV is enabled and fails/times out -> SCAN_FAILED (never marked clean)
 * - If static inspector detects known malware/EICAR -> INFECTED
 * - If suspicious patterns are detected -> SUSPICIOUS
 * - Only files that pass ALL checks are marked CLEAN.
 */
export const runScanPipeline = async ({ fileId, fileBuffer, fileName, userId, req = null }) => {
  const startTime = Date.now();

  // 1. Transition file to SCANNING
  if (fileId) {
    await supabase
      .from("files")
      .update({ scan_status: SCAN_STATES.SCANNING })
      .eq("id", fileId);
  }

  // 2. Layer 1: Format Validation
  const validation = validateFile({
    buffer: fileBuffer,
    size: fileBuffer.length,
    originalname: fileName
  });

  if (!validation.isValid) {
    const finalStatus = SCAN_STATES.INFECTED;
    if (fileId) {
      await supabase
        .from("files")
        .update({ scan_status: finalStatus })
        .eq("id", fileId);
    }

    await logAuditEvent({
      eventType: "FILE_SCAN_INFECTED",
      actorId: userId,
      resourceType: "file",
      resourceId: fileId,
      resourceName: fileName,
      outcome: "blocked",
      severity: "error",
      metadata: { reason: validation.reason, stage: "validation" },
      req
    });

    return {
      status: finalStatus,
      isClean: false,
      reason: validation.reason,
      durationMs: Date.now() - startTime
    };
  }

  // 3. Layer 2: Content Inspection
  const contentResult = inspectContent(fileBuffer, validation.extension);

  if (contentResult.isMalicious) {
    const finalStatus = SCAN_STATES.INFECTED;
    if (fileId) {
      await supabase
        .from("files")
        .update({ scan_status: finalStatus })
        .eq("id", fileId);
    }

    await logAuditEvent({
      eventType: "FILE_SCAN_INFECTED",
      actorId: userId,
      resourceType: "file",
      resourceId: fileId,
      resourceName: fileName,
      outcome: "blocked",
      severity: "critical",
      metadata: {
        threatType: contentResult.threatType,
        indicators: contentResult.indicators,
        reason: contentResult.reason
      },
      req
    });

    return {
      status: finalStatus,
      isClean: false,
      reason: contentResult.reason,
      indicators: contentResult.indicators,
      durationMs: Date.now() - startTime
    };
  }

  // 4. Layer 3: ClamAV Daemon Scanning
  let avStatus = "CLEAN";
  let avReason = null;

  if (process.env.CLAMAV_ENABLED === "true") {
    const avResult = await clamavScanner.scanBuffer(fileBuffer);

    if (avResult.status === "INFECTED") {
      const finalStatus = SCAN_STATES.INFECTED;
      if (fileId) {
        await supabase
          .from("files")
          .update({ scan_status: finalStatus })
          .eq("id", fileId);
      }

      await logAuditEvent({
        eventType: "FILE_SCAN_INFECTED",
        actorId: userId,
        resourceType: "file",
        resourceId: fileId,
        resourceName: fileName,
        outcome: "blocked",
        severity: "critical",
        metadata: {
          engine: "ClamAV",
          threatName: avResult.threatName
        },
        req
      });

      return {
        status: finalStatus,
        isClean: false,
        reason: `ClamAV detected malware: ${avResult.threatName}`,
        durationMs: Date.now() - startTime
      };
    } else if (avResult.status === "SCAN_FAILED") {
      // Security rule: Scanner failure or timeout MUST NEVER produce a clean file
      const finalStatus = SCAN_STATES.SCAN_FAILED;
      if (fileId) {
        await supabase
          .from("files")
          .update({ scan_status: finalStatus })
          .eq("id", fileId);
      }

      await logAuditEvent({
        eventType: "FILE_SCAN_FAILED",
        actorId: userId,
        resourceType: "file",
        resourceId: fileId,
        resourceName: fileName,
        outcome: "failure",
        severity: "error",
        metadata: {
          engine: "ClamAV",
          reason: avResult.reason
        },
        req
      });

      return {
        status: finalStatus,
        isClean: false,
        reason: `Antivirus scan failed: ${avResult.reason}`,
        durationMs: Date.now() - startTime
      };
    }
  }

  // 5. Layer 4: AI Threat Analysis (evaluates indicators if suspicious)
  if (contentResult.isSuspicious) {
    const aiResult = await aiAnalyzer.analyzeIndicators({
      indicators: contentResult.indicators,
      fileType: validation.detectedType,
      fileSize: fileBuffer.length,
      extension: validation.extension
    });

    const finalStatus = SCAN_STATES.SUSPICIOUS;
    if (fileId) {
      await supabase
        .from("files")
        .update({ scan_status: finalStatus })
        .eq("id", fileId);
    }

    await logAuditEvent({
      eventType: "FILE_SCAN_SUSPICIOUS",
      actorId: userId,
      resourceType: "file",
      resourceId: fileId,
      resourceName: fileName,
      outcome: "blocked",
      severity: "warning",
      metadata: {
        indicators: contentResult.indicators,
        aiAssessment: aiResult
      },
      req
    });

    return {
      status: finalStatus,
      isClean: false,
      reason: contentResult.reason,
      indicators: contentResult.indicators,
      aiAssessment: aiResult,
      durationMs: Date.now() - startTime
    };
  }

  // 6. All checks passed -> Mark as CLEAN
  const finalStatus = SCAN_STATES.CLEAN;
  if (fileId) {
    await supabase
      .from("files")
      .update({ scan_status: finalStatus })
      .eq("id", fileId);
  }

  await logAuditEvent({
    eventType: "FILE_SCAN_CLEAN",
    actorId: userId,
    resourceType: "file",
    resourceId: fileId,
    resourceName: fileName,
    outcome: "success",
    severity: "info",
    metadata: {
      durationMs: Date.now() - startTime,
      detectedType: validation.detectedType
    },
    req
  });

  return {
    status: finalStatus,
    isClean: true,
    reason: null,
    durationMs: Date.now() - startTime
  };
};
