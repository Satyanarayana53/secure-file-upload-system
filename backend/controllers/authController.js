import crypto from "crypto";
import bcrypt from "bcrypt";
import Joi from "joi";
import jwt from "jsonwebtoken";
import supabase from "../config/supabase.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../utils/emailService.js";

// Password strength pattern: min 8 chars, 1 uppercase, 1 number, 1 special char
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
const PASSWORD_ERROR_MSG = "Password must be at least 8 characters long, contain at least one uppercase letter, one number, and one special character.";

// Helper to hash tokens (reset tokens and email verification tokens) before storing in database
export const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export const signup = async (req, res) => {
  const schema = Joi.object({
    username: Joi.string().trim().alphanum().min(3).max(30).required(),
    email: Joi.string().email().trim().lowercase().required(),
    password: Joi.string().pattern(PASSWORD_REGEX).required().messages({
      "string.pattern.base": PASSWORD_ERROR_MSG
    })
  });

  const { error } = schema.validate(req.body);
  if (error) {
    await logAuditEvent({
      eventType: "AUTH_SIGNUP_FAILURE",
      actorLabel: req.body?.email || "anonymous",
      outcome: "failure",
      severity: "warning",
      metadata: { reason: "validation_error" },
      req
    });
    return res.status(400).json({ success: false, message: error.details[0].message });
  }

  const { username, email, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedUsername = username.trim();

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user in UNVERIFIED state
    const { data: newUser, error: dbError } = await supabase
      .from("users")
      .insert([{
        username: normalizedUsername,
        email: normalizedEmail,
        password_hash: hashedPassword,
        email_verified: false
      }])
      .select("id, username, email, email_verified")
      .single();

    if (dbError) {
      await logAuditEvent({
        eventType: "AUTH_SIGNUP_FAILURE",
        actorLabel: normalizedEmail,
        outcome: "failure",
        severity: "warning",
        metadata: { reason: dbError.code === "23505" ? "duplicate_credential" : "db_error" },
        req
      });

      if (dbError.code === "23505") {
        return res.status(400).json({ success: false, message: "Username or email already exists" });
      }
      return res.status(400).json({ success: false, message: "Registration failed. Please try again." });
    }

    // Generate cryptographically secure verification token (256-bit entropy)
    const rawVerificationToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawVerificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24-hour expiration

    await supabase
      .from("email_verification_tokens")
      .insert([{
        user_id: newUser.id,
        token_hash: tokenHash,
        expires_at: expiresAt
      }]);

    await logAuditEvent({
      eventType: "AUTH_SIGNUP_SUCCESS",
      actorId: newUser?.id,
      actorLabel: normalizedEmail,
      resourceType: "account",
      resourceId: newUser?.id,
      outcome: "success",
      severity: "info",
      metadata: {
        username: normalizedUsername,
        emailVerified: false
      },
      req
    });

    // Send verification email via configured transport
    const emailResult = await sendVerificationEmail({
      toEmail: normalizedEmail,
      username: normalizedUsername,
      rawToken: rawVerificationToken
    });

    res.status(201).json({
      success: true,
      message: "User created successfully. A verification link has been sent to your email.",
      emailSent: Boolean(emailResult.sent),
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        email_verified: false
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const login = async (req, res) => {
  const schema = Joi.object({
    identifier: Joi.string().trim().required(),
    password: Joi.string().required(),
    rememberMe: Joi.boolean().optional()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    await logAuditEvent({
      eventType: "AUTH_LOGIN_FAILURE",
      actorLabel: req.body?.identifier || "anonymous",
      outcome: "failure",
      severity: "warning",
      metadata: { reason: "invalid_input" },
      req
    });
    return res.status(400).json({ success: false, message: "Invalid input" });
  }

  const { identifier, password, rememberMe } = req.body;
  const cleanIdentifier = identifier.trim().toLowerCase();

  try {
    const { data: user, error: dbError } = await supabase
      .from("users")
      .select("id, username, email, password_hash, created_at, profile_image, email_verified")
      .or(`email.eq.${cleanIdentifier},username.eq.${identifier.trim()}`)
      .single();

    if (dbError || !user) {
      await logAuditEvent({
        eventType: "AUTH_LOGIN_FAILURE",
        actorLabel: cleanIdentifier,
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "invalid_credentials" },
        req
      });
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await logAuditEvent({
        eventType: "AUTH_LOGIN_FAILURE",
        actorId: user.id,
        actorLabel: user.email,
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "invalid_credentials" },
        req
      });
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: rememberMe ? "7d" : "1h" }
    );

    await logAuditEvent({
      eventType: "AUTH_LOGIN_SUCCESS",
      actorId: user.id,
      actorLabel: user.email,
      resourceType: "session",
      outcome: "success",
      severity: "info",
      metadata: { rememberMe: Boolean(rememberMe) },
      req
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
        profile_image: user.profile_image,
        email_verified: Boolean(user.email_verified)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const logout = async (req, res) => {
  if (req.user?.id) {
    await logAuditEvent({
      eventType: "AUTH_LOGOUT",
      actorId: req.user.id,
      actorLabel: req.user.email || `user:${req.user.id}`,
      outcome: "success",
      severity: "info",
      req
    });
  }
  res.json({ success: true, message: "Logged out successfully" });
};

export const getCurrentUser = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, email, profile_image, created_at, email_verified")
      .eq("id", req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({
      success: true,
      user: {
        ...user,
        email_verified: Boolean(user.email_verified)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateProfileImage = async (req, res) => {
  const { profileImage } = req.body;

  if (!profileImage || typeof profileImage !== "string") {
    return res.status(400).json({ success: false, message: "Profile image is required" });
  }

  // Validate size to prevent database bloating (max 2MB for base64)
  if (profileImage.length > 2 * 1024 * 1024 * 1.37) {
    return res.status(400).json({ success: false, message: "Profile image exceeds maximum size limit" });
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .update({ profile_image: profileImage })
      .eq("id", req.user.id)
      .select("id, username, email, profile_image, created_at")
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    await logAuditEvent({
      eventType: "USER_PROFILE_UPDATE",
      actorId: req.user.id,
      resourceType: "account",
      resourceId: req.user.id,
      outcome: "success",
      severity: "info",
      metadata: { action: "avatar_update" },
      req
    });

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const removeProfileImage = async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from("users")
      .update({ profile_image: null })
      .eq("id", req.user.id)
      .select("id, username, email, profile_image, created_at")
      .single();

    if (error) return res.status(400).json({ success: false, message: error.message });

    await logAuditEvent({
      eventType: "USER_PROFILE_UPDATE",
      actorId: req.user.id,
      resourceType: "account",
      resourceId: req.user.id,
      outcome: "success",
      severity: "info",
      metadata: { action: "avatar_remove" },
      req
    });

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const forgotPassword = async (req, res) => {
  const schema = Joi.object({
    email: Joi.string().email().trim().required()
  });

  const { error: valError } = schema.validate(req.body);
  if (valError) {
    return res.status(400).json({ success: false, message: "Valid email address is required" });
  }

  const normalizedEmail = req.body.email.trim().toLowerCase();
  const genericMessage = "If an account exists with that email address, a password reset link has been sent.";

  try {
    const { data: user } = await supabase
      .from("users")
      .select("id, email")
      .eq("email", normalizedEmail)
      .single();

    if (!user) {
      await logAuditEvent({
        eventType: "AUTH_PASSWORD_RESET_REQUESTED",
        actorLabel: normalizedEmail,
        outcome: "success", // Reported as success externally to prevent enumeration
        severity: "info",
        metadata: { accountFound: false },
        req
      });
      return res.json({ success: true, message: genericMessage });
    }

    const rawResetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawResetToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("used_at", null);

    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert([{
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt
      }]);

    if (insertError) {
      return res.json({ success: true, message: genericMessage });
    }

    await logAuditEvent({
      eventType: "AUTH_PASSWORD_RESET_REQUESTED",
      actorId: user.id,
      actorLabel: user.email,
      resourceType: "account",
      resourceId: user.id,
      outcome: "success",
      severity: "info",
      metadata: { accountFound: true },
      req
    });

    // Dispatch password reset email safely without leaking secrets
    await sendPasswordResetEmail({
      toEmail: user.email,
      rawToken: rawResetToken
    });

    return res.json({ success: true, message: genericMessage });
  } catch (err) {
    return res.json({ success: true, message: genericMessage });
  }
};

export const resetPassword = async (req, res) => {
  const schema = Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().pattern(PASSWORD_REGEX).required().messages({
      "string.pattern.base": PASSWORD_ERROR_MSG
    })
  });

  const { error: valError } = schema.validate(req.body);
  if (valError) {
    return res.status(400).json({ success: false, message: valError.details[0].message });
  }

  const { token, newPassword } = req.body;

  // Never accept JWT tokens as reset tokens
  if (token.split(".").length === 3) {
    await logAuditEvent({
      eventType: "AUTH_PASSWORD_RESET_FAILED",
      outcome: "failure",
      severity: "warning",
      metadata: { reason: "jwt_token_rejected" },
      req
    });
    return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
  }

  const tokenHash = hashToken(token);

  try {
    const { data: record, error: fetchError } = await supabase
      .from("password_reset_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .single();

    if (fetchError || !record) {
      await logAuditEvent({
        eventType: "AUTH_PASSWORD_RESET_FAILED",
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "token_not_found" },
        req
      });
      return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
    }

    if (record.used_at) {
      await logAuditEvent({
        eventType: "AUTH_PASSWORD_RESET_FAILED",
        actorId: record.user_id,
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "token_already_used" },
        req
      });
      return res.status(400).json({ success: false, message: "This reset token has already been used" });
    }

    if (new Date() > new Date(record.expires_at)) {
      await logAuditEvent({
        eventType: "AUTH_PASSWORD_RESET_FAILED",
        actorId: record.user_id,
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "token_expired" },
        req
      });
      return res.status(400).json({ success: false, message: "Reset token has expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const { error: markError } = await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", record.id)
      .is("used_at", null);

    if (markError) {
      return res.status(400).json({ success: false, message: "Reset token already consumed" });
    }

    const { error: userUpdateError } = await supabase
      .from("users")
      .update({ password_hash: hashedPassword })
      .eq("id", record.user_id);

    if (userUpdateError) {
      return res.status(500).json({ success: false, message: "Failed to update password" });
    }

    await logAuditEvent({
      eventType: "AUTH_PASSWORD_RESET_SUCCESS",
      actorId: record.user_id,
      resourceType: "account",
      resourceId: record.user_id,
      outcome: "success",
      severity: "info",
      req
    });

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const changePassword = async (req, res) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().pattern(PASSWORD_REGEX).required().messages({
      "string.pattern.base": PASSWORD_ERROR_MSG
    })
  });

  const { error: valError } = schema.validate(req.body);
  if (valError) {
    return res.status(400).json({ success: false, message: valError.details[0].message });
  }

  const { currentPassword, newPassword } = req.body;

  if (currentPassword === newPassword) {
    return res.status(400).json({ success: false, message: "New password must be different from current password" });
  }

  try {
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select("id, password_hash")
      .eq("id", req.user.id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const validCurrent = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validCurrent) {
      await logAuditEvent({
        eventType: "AUTH_PASSWORD_CHANGE_FAILED",
        actorId: req.user.id,
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "invalid_current_password" },
        req
      });
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    const hashedNew = await bcrypt.hash(newPassword, 12);

    const { error: updateError } = await supabase
      .from("users")
      .update({ password_hash: hashedNew })
      .eq("id", req.user.id);

    if (updateError) {
      return res.status(500).json({ success: false, message: "Failed to update password" });
    }

    await logAuditEvent({
      eventType: "AUTH_PASSWORD_CHANGE_SUCCESS",
      actorId: req.user.id,
      resourceType: "account",
      resourceId: req.user.id,
      outcome: "success",
      severity: "info",
      req
    });

    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * POST /api/auth/verify-email
 * Single-use, race-safe email verification endpoint
 */
export const verifyEmail = async (req, res) => {
  const schema = Joi.object({
    token: Joi.string().required()
  });

  const { error: valError } = schema.validate(req.body);
  if (valError) {
    return res.status(400).json({ success: false, message: "Valid verification token is required" });
  }

  const { token } = req.body;

  // Never accept JWT tokens as email verification tokens
  if (token.split(".").length === 3 || token.length !== 64) {
    await logAuditEvent({
      eventType: "AUTH_EMAIL_VERIFICATION_FAILED",
      outcome: "failure",
      severity: "warning",
      metadata: { reason: "invalid_token_format" },
      req
    });
    return res.status(400).json({ success: false, message: "Invalid or expired verification token" });
  }

  const tokenHash = hashToken(token);

  try {
    const { data: record, error: fetchError } = await supabase
      .from("email_verification_tokens")
      .select("id, user_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .single();

    if (fetchError || !record) {
      await logAuditEvent({
        eventType: "AUTH_EMAIL_VERIFICATION_FAILED",
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "token_not_found" },
        req
      });
      return res.status(400).json({ success: false, message: "Invalid or expired verification token" });
    }

    if (record.used_at) {
      await logAuditEvent({
        eventType: "AUTH_EMAIL_VERIFICATION_FAILED",
        actorId: record.user_id,
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "token_already_used" },
        req
      });
      return res.status(400).json({ success: false, message: "This verification token has already been used" });
    }

    if (new Date() > new Date(record.expires_at)) {
      await logAuditEvent({
        eventType: "AUTH_EMAIL_VERIFICATION_FAILED",
        actorId: record.user_id,
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "token_expired" },
        req
      });
      return res.status(400).json({ success: false, message: "Verification token has expired. Please request a new one." });
    }

    // Atomic single-use consumption to prevent replay and concurrency races
    const { data: updatedRecord, error: markError } = await supabase
      .from("email_verification_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", record.id)
      .is("used_at", null)
      .select("id");

    if (markError || !updatedRecord || updatedRecord.length === 0) {
      return res.status(400).json({ success: false, message: "Verification token was already consumed" });
    }

    // Update user status
    const { error: userUpdateError } = await supabase
      .from("users")
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString()
      })
      .eq("id", record.user_id);

    if (userUpdateError) {
      return res.status(500).json({ success: false, message: "Failed to update account verification status" });
    }

    await logAuditEvent({
      eventType: "AUTH_EMAIL_VERIFIED_SUCCESS",
      actorId: record.user_id,
      resourceType: "account",
      resourceId: record.user_id,
      outcome: "success",
      severity: "info",
      req
    });

    res.json({
      success: true,
      message: "Email successfully verified! You now have full access to all features."
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * POST /api/auth/resend-verification
 * Rate-limited resend verification endpoint with generic enumeration-resistant response
 */
export const resendVerification = async (req, res) => {
  const schema = Joi.object({
    email: Joi.string().email().trim().lowercase().optional()
  });

  const { error: valError, value } = schema.validate(req.body);
  if (valError) {
    return res.status(400).json({ success: false, message: "Valid email address is required" });
  }

  // Determine target email from request body or authenticated session
  let targetEmail = value?.email;
  if (!targetEmail && req.user?.id) {
    const { data: u } = await supabase.from("users").select("email").eq("id", req.user.id).single();
    targetEmail = u?.email;
  }

  if (!targetEmail) {
    return res.status(400).json({ success: false, message: "Email address is required" });
  }

  const normalizedEmail = targetEmail.trim().toLowerCase();
  const genericMessage = "If an unverified account exists with that email address, a new verification link has been sent.";

  try {
    const { data: user } = await supabase
      .from("users")
      .select("id, email, username, email_verified")
      .eq("email", normalizedEmail)
      .single();

    if (!user) {
      await logAuditEvent({
        eventType: "AUTH_VERIFICATION_RESEND_ATTEMPT",
        actorLabel: normalizedEmail,
        outcome: "success", // Reported generically to prevent enumeration
        severity: "info",
        metadata: { accountFound: false },
        req
      });
      return res.json({ success: true, message: genericMessage });
    }

    if (user.email_verified) {
      await logAuditEvent({
        eventType: "AUTH_VERIFICATION_RESEND_ATTEMPT",
        actorId: user.id,
        actorLabel: user.email,
        outcome: "success",
        severity: "info",
        metadata: { alreadyVerified: true },
        req
      });
      return res.json({ success: true, message: "Email address is already verified.", alreadyVerified: true });
    }

    // Invalidate any existing unused verification tokens for this user
    await supabase
      .from("email_verification_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("used_at", null);

    const rawVerificationToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawVerificationToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from("email_verification_tokens")
      .insert([{
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt
      }]);

    await logAuditEvent({
      eventType: "AUTH_VERIFICATION_RESENT",
      actorId: user.id,
      actorLabel: user.email,
      resourceType: "account",
      resourceId: user.id,
      outcome: "success",
      severity: "info",
      req
    });

    const emailResult = await sendVerificationEmail({
      toEmail: user.email,
      username: user.username,
      rawToken: rawVerificationToken
    });

    res.json({
      success: true,
      message: genericMessage,
      emailSent: Boolean(emailResult.sent)
    });
  } catch (err) {
    res.json({ success: true, message: genericMessage });
  }
};

