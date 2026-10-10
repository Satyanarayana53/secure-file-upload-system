import supabase from "../config/supabase.js";
import { logAuditEvent } from "../utils/auditLogger.js";

/**
 * Middleware: Enforces that the authenticated user has verified their email address.
 * Rejects unverified accounts with HTTP 403 and machine-readable code EMAIL_NOT_VERIFIED.
 */
export const requireEmailVerified = async (req, res, next) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, email_verified")
      .eq("id", req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, message: "User account not found" });
    }

    if (!user.email_verified) {
      await logAuditEvent({
        eventType: "ACCESS_DENIED_UNVERIFIED_EMAIL",
        actorId: req.user.id,
        actorLabel: user.email,
        outcome: "blocked",
        severity: "warning",
        metadata: {
          path: req.originalUrl,
          method: req.method,
          reason: "email_verification_required"
        },
        req
      });

      return res.status(403).json({
        success: false,
        code: "EMAIL_NOT_VERIFIED",
        message: "Email verification is required for this action. Please verify your email address to unlock public link sharing."
      });
    }

    // Attach verified flag to req.user for downstream handlers
    req.user.email_verified = true;
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error verifying account status" });
  }
};

export default requireEmailVerified;
