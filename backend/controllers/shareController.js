import crypto from "crypto";
import bcrypt from "bcrypt";
import Joi from "joi";
import supabase from "../config/supabase.js";
import { logAuditEvent } from "../utils/auditLogger.js";

// Helper to hash raw share token (256-bit SHA-256)
export const hashShareToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * POST /api/share/create
 * Authenticated owner creates a revocable share link for a CLEAN file
 */
export const createShareLink = async (req, res) => {
  const schema = Joi.object({
    fileId: Joi.string().uuid().required(),
    expiresInHours: Joi.number().integer().min(1).max(720).optional(), // 1 hour to 30 days
    password: Joi.string().min(4).max(64).optional(),
    maxAccesses: Joi.number().integer().min(1).max(1000).optional()
  });

  const { error: valError, value } = schema.validate(req.body);
  if (valError) {
    return res.status(400).json({ success: false, message: valError.details[0].message });
  }

  const { fileId, expiresInHours, password, maxAccesses } = value;

  try {
    // 1. Fetch file record and verify ownership
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, file_name, user_id, is_deleted, scan_status")
      .eq("id", fileId)
      .eq("user_id", req.user.id)
      .single();

    if (fileError || !file) {
      await logAuditEvent({
        eventType: "SHARE_LINK_CREATE_FAILED",
        actorId: req.user.id,
        resourceType: "file",
        resourceId: fileId,
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "file_not_found_or_unauthorized" },
        req
      });
      return res.status(404).json({ success: false, message: "File not found or unauthorized" });
    }

    // 2. Strict policy check: File MUST NOT be deleted
    if (file.is_deleted) {
      return res.status(400).json({ success: false, message: "Cannot share a deleted file. Restore it first." });
    }

    // 3. Strict policy check: File MUST be explicitly approved as CLEAN
    if (!file.scan_status || file.scan_status !== "CLEAN") {
      await logAuditEvent({
        eventType: "SHARE_LINK_CREATE_BLOCKED",
        actorId: req.user.id,
        resourceType: "file",
        resourceId: fileId,
        resourceName: file.file_name,
        outcome: "blocked",
        severity: "warning",
        metadata: { scanStatus: file.scan_status || "UNVERIFIED" },
        req
      });
      return res.status(403).json({
        success: false,
        message: `Cannot share file under security review or quarantine (status: ${file.scan_status || "UNVERIFIED"}).`
      });
    }

    // 4. Generate cryptographically secure random token (256 bits entropy)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashShareToken(rawToken);

    // 5. Calculate expiration if provided
    let expiresAt = null;
    if (expiresInHours) {
      expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
    }

    // 6. Hash optional password securely with bcrypt
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 12);
    }

    // 7. Store share record in database
    const shareRecord = {
      file_id: file.id,
      owner_id: req.user.id,
      token_hash: tokenHash,
      password_hash: passwordHash,
      expires_at: expiresAt,
      max_accesses: maxAccesses || null,
      access_count: 0,
      is_revoked: false
    };

    const { data: newShare, error: insertError } = await supabase
      .from("share_links")
      .insert([shareRecord])
      .select("id, file_id, expires_at, max_accesses, is_revoked, created_at")
      .single();

    if (insertError) {
      return res.status(400).json({ success: false, message: "Failed to create share link: " + insertError.message });
    }

    await logAuditEvent({
      eventType: "SHARE_LINK_CREATED",
      actorId: req.user.id,
      resourceType: "file",
      resourceId: file.id,
      resourceName: file.file_name,
      outcome: "success",
      severity: "info",
      metadata: {
        shareId: newShare.id,
        hasPassword: Boolean(password),
        expiresAt,
        maxAccesses
      },
      req
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const shareUrl = `${frontendUrl}/share/${rawToken}`;

    res.status(201).json({
      success: true,
      message: "Share link created successfully",
      shareUrl,
      rawToken, // Raw token returned ONLY once at creation
      share: {
        id: newShare.id,
        expiresAt: newShare.expires_at,
        maxAccesses: newShare.max_accesses,
        hasPassword: Boolean(password)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * GET /api/share/my-links
 * Lists all share links created by the authenticated owner
 */
export const getMyShareLinks = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("share_links")
      .select(`
        id,
        file_id,
        expires_at,
        max_accesses,
        access_count,
        is_revoked,
        revoked_at,
        created_at,
        last_accessed_at,
        password_hash,
        files (
          file_name,
          file_size,
          file_type,
          scan_status,
          is_deleted
        )
      `)
      .eq("owner_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(400).json({ success: false, message: error.message });
    }

    const sanitizedLinks = (data || []).map((link) => ({
      id: link.id,
      fileId: link.file_id,
      fileName: link.files?.file_name || "Unknown",
      fileSize: link.files?.file_size || 0,
      fileType: link.files?.file_type || "",
      scanStatus: link.files?.scan_status || "UNVERIFIED",
      isFileDeleted: link.files?.is_deleted || false,
      expiresAt: link.expires_at,
      maxAccesses: link.max_accesses,
      accessCount: link.access_count,
      isRevoked: link.is_revoked,
      hasPassword: Boolean(link.password_hash),
      createdAt: link.created_at,
      lastAccessedAt: link.last_accessed_at
    }));

    res.json({ success: true, links: sanitizedLinks });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * PUT /api/share/:id/revoke
 * Owner revokes an active share link immediately
 */
export const revokeShareLink = async (req, res) => {
  const { id } = req.params;

  try {
    const { data: link, error: fetchError } = await supabase
      .from("share_links")
      .select("id, file_id, owner_id, is_revoked")
      .eq("id", id)
      .eq("owner_id", req.user.id)
      .single();

    if (fetchError || !link) {
      return res.status(404).json({ success: false, message: "Share link not found or unauthorized" });
    }

    if (link.is_revoked) {
      return res.json({ success: true, message: "Share link is already revoked" });
    }

    const { error: updateError } = await supabase
      .from("share_links")
      .update({
        is_revoked: true,
        revoked_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("owner_id", req.user.id);

    if (updateError) {
      return res.status(400).json({ success: false, message: updateError.message });
    }

    await logAuditEvent({
      eventType: "SHARE_LINK_REVOKED",
      actorId: req.user.id,
      resourceType: "share_link",
      resourceId: id,
      outcome: "success",
      severity: "warning",
      req
    });

    res.json({ success: true, message: "Share link revoked successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * GET /api/share/public/:token
 * Public endpoint to inspect metadata of a shared file before download
 */
export const resolvePublicShare = async (req, res) => {
  const { token } = req.params;

  if (!token || typeof token !== "string" || token.length !== 64) {
    return res.status(400).json({ success: false, message: "Invalid share token format" });
  }

  const tokenHash = hashShareToken(token);

  try {
    const { data: link, error: linkError } = await supabase
      .from("share_links")
      .select(`
        id,
        file_id,
        owner_id,
        password_hash,
        expires_at,
        max_accesses,
        access_count,
        is_revoked,
        files (
          id,
          file_name,
          file_size,
          file_type,
          is_deleted,
          scan_status
        )
      `)
      .eq("token_hash", tokenHash)
      .single();

    if (linkError || !link) {
      await logAuditEvent({
        eventType: "SHARE_RESOLVE_FAILED",
        actorId: null,
        actorLabel: "anonymous",
        outcome: "failure",
        severity: "warning",
        metadata: { reason: "token_not_found" },
        req
      });
      return res.status(404).json({ success: false, message: "Share link not found or invalid" });
    }

    // Check revocation
    if (link.is_revoked) {
      return res.status(410).json({ success: false, message: "This share link has been revoked by the owner" });
    }

    // Check expiry
    if (link.expires_at && new Date() > new Date(link.expires_at)) {
      return res.status(410).json({ success: false, message: "This share link has expired" });
    }

    // Check access count limit
    if (link.max_accesses && link.access_count >= link.max_accesses) {
      return res.status(410).json({ success: false, message: "This share link has reached its maximum access limit" });
    }

    const file = link.files;
    if (!file || file.is_deleted) {
      return res.status(404).json({ success: false, message: "The shared file has been deleted or is unavailable" });
    }

    // Strict security check: file must be CLEAN
    if (!file.scan_status || file.scan_status !== "CLEAN") {
      await logAuditEvent({
        eventType: "SHARE_ACCESS_BLOCKED",
        actorId: null,
        actorLabel: "anonymous",
        resourceType: "file",
        resourceId: file.id,
        resourceName: file.file_name,
        outcome: "blocked",
        severity: "warning",
        metadata: { scanStatus: file.scan_status || "UNVERIFIED" },
        req
      });
      return res.status(403).json({
        success: false,
        message: "The shared file is undergoing security scanning or quarantine and is not approved for access."
      });
    }

    res.json({
      success: true,
      file: {
        id: file.id,
        name: file.file_name,
        size: file.file_size,
        type: file.file_type,
        scanStatus: file.scan_status
      },
      hasPassword: Boolean(link.password_hash),
      expiresAt: link.expires_at
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * POST /api/share/public/:token/download
 * Public endpoint to stream the shared file content
 */
export const downloadPublicShare = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body || {};

  if (!token || typeof token !== "string" || token.length !== 64) {
    return res.status(400).json({ success: false, message: "Invalid share token" });
  }

  const tokenHash = hashShareToken(token);

  try {
    const { data: link, error: linkError } = await supabase
      .from("share_links")
      .select(`
        id,
        file_id,
        owner_id,
        password_hash,
        expires_at,
        max_accesses,
        access_count,
        is_revoked,
        files (
          id,
          file_name,
          file_type,
          storage_path,
          is_deleted,
          scan_status
        )
      `)
      .eq("token_hash", tokenHash)
      .single();

    if (linkError || !link) {
      return res.status(404).json({ success: false, message: "Share link not found" });
    }

    if (link.is_revoked) {
      return res.status(410).json({ success: false, message: "This share link has been revoked" });
    }

    if (link.expires_at && new Date() > new Date(link.expires_at)) {
      return res.status(410).json({ success: false, message: "This share link has expired" });
    }

    if (link.max_accesses && link.access_count >= link.max_accesses) {
      return res.status(410).json({ success: false, message: "Maximum access limit reached" });
    }

    // Password verification
    if (link.password_hash) {
      if (!password) {
        return res.status(401).json({ success: false, message: "Password is required to access this file" });
      }
      const isMatch = await bcrypt.compare(password, link.password_hash);
      if (!isMatch) {
        await logAuditEvent({
          eventType: "SHARE_PASSWORD_FAILED",
          actorId: null,
          actorLabel: "anonymous",
          resourceType: "share_link",
          resourceId: link.id,
          outcome: "failure",
          severity: "warning",
          req
        });
        return res.status(401).json({ success: false, message: "Incorrect password" });
      }
    }

    const file = link.files;
    if (!file || file.is_deleted) {
      return res.status(404).json({ success: false, message: "File has been removed" });
    }

    // Strict scan status verification
    if (!file.scan_status || file.scan_status !== "CLEAN") {
      return res.status(403).json({
        success: false,
        message: "File is not approved for download (not clean)"
      });
    }

    // Atomic increment of access count in database
    await supabase.rpc("increment_share_access", { share_id: link.id }).catch(() => {
      // Fallback update if RPC not present in offline/mock mode
      return supabase
        .from("share_links")
        .update({
          access_count: link.access_count + 1,
          last_accessed_at: new Date().toISOString()
        })
        .eq("id", link.id);
    });

    // Download content from Supabase private storage
    const { data: blobData, error: blobError } = await supabase.storage
      .from("user-files")
      .download(file.storage_path);

    if (blobError || !blobData) {
      return res.status(500).json({ success: false, message: "Unable to retrieve shared file content" });
    }

    await logAuditEvent({
      eventType: "SHARE_FILE_DOWNLOADED",
      actorId: null, // Anonymous recipient must NEVER be given file owner's ID
      actorLabel: "anonymous",
      resourceType: "file",
      resourceId: file.id,
      resourceName: file.file_name,
      outcome: "success",
      severity: "info",
      metadata: { shareLinkId: link.id },
      req
    });

    const arrayBuffer = await blobData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const safeName = encodeURIComponent(file.file_name || "shared_file");

    // Safe download headers preventing in-origin execution
    res.setHeader("Content-Type", file.file_type || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeName}`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
