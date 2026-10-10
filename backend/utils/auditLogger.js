import crypto from "crypto";
import supabase from "../config/supabase.js";

// SENSITIVE KEYS THAT MUST NEVER APPEAR IN AUDIT LOGS OR METADATA
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /key/i,
  /credential/i,
  /hash/i,
  /otp/i,
  /buffer/i,
  /content/i,
  /raw/i
];

/**
 * Recursively sanitize metadata object to prevent any credentials,
 * tokens, or huge content blobs from leaking into audit storage.
 */
export const sanitizeMetadata = (obj, depth = 0) => {
  if (depth > 4 || obj === null || obj === undefined) return null;
  if (typeof obj !== "object") {
    if (typeof obj === "string" && obj.length > 500) {
      return obj.slice(0, 500) + "... [truncated]";
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  }

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    // Check if key is sensitive
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive) {
      clean[key] = "[REDACTED]";
    } else {
      clean[key] = sanitizeMetadata(value, depth + 1);
    }
  }
  return clean;
};

/**
 * Extracts sanitized client IP address
 */
export const extractClientIp = (req) => {
  if (!req) return null;
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) {
    const firstIp = forwarded.split(",")[0].trim();
    return firstIp.slice(0, 45); // IPv6 max length
  }
  return (req.socket?.remoteAddress || req.ip || "").slice(0, 45);
};

/**
 * Extracts client user agent safely
 */
export const extractUserAgent = (req) => {
  if (!req) return null;
  const ua = req.headers?.["user-agent"] || "";
  return ua.slice(0, 255);
};

/**
 * Generate a correlation / request ID
 */
export const generateCorrelationId = () => {
  return crypto.randomBytes(12).toString("hex");
};

/**
 * Core server-side audit logging function.
 * 
 * Records security-relevant events to the Supabase `audit_logs` table.
 * Fails safely without throwing unhandled errors into regular requests,
 * but logs errors and returns the recorded record or null.
 *
 * @param {Object} params
 * @param {string} params.eventType - Standard event identifier (e.g. 'AUTH_LOGIN_SUCCESS')
 * @param {string|null} [params.actorId] - Authenticated user UUID or null
 * @param {string|null} [params.actorLabel] - User email, username, or 'anonymous'
 * @param {string|null} [params.resourceType] - 'file', 'folder', 'account', 'session'
 * @param {string|null} [params.resourceId] - Resource UUID
 * @param {string|null} [params.resourceName] - Safe display name of resource
 * @param {'success'|'failure'|'blocked'} [params.outcome='success']
 * @param {'debug'|'info'|'warning'|'error'|'critical'} [params.severity='info']
 * @param {string|null} [params.correlationId]
 * @param {Object} [params.metadata={}]
 * @param {Object} [params.req] - Express request object for IP & user-agent extraction
 */
export const logAuditEvent = async ({
  eventType,
  actorId = null,
  actorLabel = null,
  resourceType = null,
  resourceId = null,
  resourceName = null,
  outcome = "success",
  severity = "info",
  correlationId = null,
  metadata = {},
  req = null
}) => {
  if (!eventType) {
    console.error("auditLogger: eventType is required");
    return null;
  }

  const validOutcomes = ["success", "failure", "blocked"];
  const safeOutcome = validOutcomes.includes(outcome) ? outcome : "success";

  const validSeverities = ["debug", "info", "warning", "error", "critical"];
  const safeSeverity = validSeverities.includes(severity) ? severity : "info";

  // Sanitize metadata
  const cleanMetadata = sanitizeMetadata(metadata);

  // Extract connection details safely
  const ipAddress = extractClientIp(req);
  const userAgent = extractUserAgent(req);
  const safeCorrelationId = correlationId || (req?.headers?.["x-correlation-id"]) || generateCorrelationId();

  // Safe resource display name (limit length)
  const safeResourceName = resourceName ? String(resourceName).slice(0, 200) : null;
  const safeActorLabel = actorLabel ? String(actorLabel).slice(0, 100) : (actorId ? `user:${actorId}` : "anonymous");

  const auditRecord = {
    event_type: eventType,
    actor_id: actorId,
    actor_label: safeActorLabel,
    resource_type: resourceType,
    resource_id: resourceId,
    resource_name: safeResourceName,
    outcome: safeOutcome,
    severity: safeSeverity,
    correlation_id: safeCorrelationId,
    metadata: cleanMetadata || {},
    ip_address: ipAddress,
    user_agent: userAgent,
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase
      .from("audit_logs")
      .insert([auditRecord])
      .select("id, event_type, created_at")
      .single();

    if (error) {
      // In development or if table doesn't exist yet, warn without crashing
      console.warn("auditLogger: Supabase log notice:", error.message);
      return null;
    }

    return data;
  } catch (err) {
    console.warn("auditLogger: audit log dispatch failed:", err.message);
    return null;
  }
};
