import crypto from "crypto";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import supabase from "../config/supabase.js";
import { scanFileThreats } from "../utils/fileScanner.js";
import { logAuditEvent } from "../utils/auditLogger.js";
import { runScanPipeline, SCAN_STATES } from "../scanning/scanOrchestrator.js";

// Helper: Sanitize folder name
const sanitizeFolderName = (name = "") => {
  return name.trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").slice(0, 60);
};

// Helper: Normalize folder ID
const normalizeFolderId = (folderId) => {
  if (folderId === undefined) return undefined;
  if (folderId === null || folderId === "" || folderId === "root") return null;
  return folderId;
};

// Helper: Sanitize user display filename
const sanitizeDisplayFilename = (originalName = "") => {
  const basename = path.basename(originalName).replace(/\0/g, "").trim();
  const sanitized = basename.replace(/[\\/:*?"<>|]/g, "_").slice(0, 255);
  return sanitized || "unnamed_file";
};

// Helper: Generate safe server-side storage filename
const generateSafeStorageName = (file) => {
  const safeRandomId = crypto.randomBytes(16).toString("hex");
  const rawExt = path.extname(file.originalname || "").toLowerCase();
  const cleanExt = rawExt.replace(/[^a-z0-9.]/g, "").slice(0, 10);
  return `${safeRandomId}${cleanExt}`;
};

export const uploadFile = async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  // Pre-upload security scan
  const scanResult = scanFileThreats(file);
  if (!scanResult.isSafe) {
    await logAuditEvent({
      eventType: "FILE_UPLOAD_BLOCKED",
      actorId: req.user.id,
      resourceType: "file",
      resourceName: sanitizeDisplayFilename(file.originalname),
      outcome: "blocked",
      severity: "warning",
      metadata: { reason: scanResult.reason },
      req
    });
    return res.status(400).json({ success: false, message: `Unsafe file detected: ${scanResult.reason}` });
  }

  const targetFolderId = normalizeFolderId(req.body?.folderId);
  if (targetFolderId) {
    const { data: folder, error: folderError } = await supabase
      .from("folders")
      .select("id")
      .eq("id", targetFolderId)
      .eq("user_id", req.user.id)
      .single();

    if (folderError || !folder) {
      return res.status(400).json({ success: false, message: "Invalid folder selected" });
    }
  }

  const safeStorageName = generateSafeStorageName(file);
  const storagePath = `${req.user.id}/${safeStorageName}`;
  const displayFileName = sanitizeDisplayFilename(file.originalname);
  const sha256Hash = crypto.createHash("sha256").update(file.buffer).digest("hex");

  // Upload to storage
  const { error: storageError } = await supabase.storage
    .from("user-files")
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype || "application/octet-stream",
      upsert: false
    });

  if (storageError) {
    await logAuditEvent({
      eventType: "FILE_UPLOAD_FAILED",
      actorId: req.user.id,
      resourceType: "file",
      resourceName: displayFileName,
      outcome: "failure",
      severity: "error",
      metadata: { stage: "storage_upload" },
      req
    });
    return res.status(400).json({ success: false, message: "Failed to store file" });
  }

  // File is initially stored in quarantine pending scan:
  // Strictly NEVER marked CLEAN without running the complete scanning engine!
  const fileRecord = {
    user_id: req.user.id,
    file_name: displayFileName,
    storage_path: storagePath,
    storage_name: safeStorageName,
    file_size: file.size,
    file_type: file.mimetype || "application/octet-stream",
    folder_id: targetFolderId,
    sha256_hash: sha256Hash,
    scan_status: SCAN_STATES.QUARANTINED_PENDING_SCAN,
    is_favorite: false,
    is_deleted: false
  };

  const { data, error: dbError } = await supabase.from("files").insert([fileRecord]).select("*").single();

  if (dbError) {
    // Compensating action: remove orphaned storage object
    await supabase.storage.from("user-files").remove([storagePath]);

    await logAuditEvent({
      eventType: "FILE_UPLOAD_FAILED",
      actorId: req.user.id,
      resourceType: "file",
      resourceName: displayFileName,
      outcome: "failure",
      severity: "error",
      metadata: { stage: "database_registration" },
      req
    });

    return res.status(400).json({ success: false, message: "Failed to register file in database" });
  }

  await logAuditEvent({
    eventType: "FILE_UPLOAD_SUCCESS",
    actorId: req.user.id,
    resourceType: "file",
    resourceId: data?.id,
    resourceName: displayFileName,
    outcome: "success",
    severity: "info",
    metadata: {
      fileSize: file.size,
      mimeType: file.mimetype,
      sha256: sha256Hash,
      status: SCAN_STATES.QUARANTINED_PENDING_SCAN
    },
    req
  });

  // Execute full scanning pipeline on the uploaded buffer
  const scanResultDetail = await runScanPipeline({
    fileId: data?.id,
    fileBuffer: file.buffer,
    fileName: displayFileName,
    userId: req.user.id,
    req
  });

  const responseFile = {
    ...data,
    scan_status: scanResultDetail.status
  };

  if (!scanResultDetail.isClean) {
    return res.status(201).json({
      success: true,
      message: `File uploaded to quarantine (${scanResultDetail.status}): ${scanResultDetail.reason || "Under security review"}`,
      file: responseFile,
      quarantined: true
    });
  }

  res.status(201).json({ success: true, message: "File uploaded and verified clean", file: responseFile });
};

export const getFiles = async (req, res) => {
  const { trash, favorite, folderId } = req.query;
  const normalizedFolderId = normalizeFolderId(folderId);

  let query = supabase
    .from("files")
    .select("id, file_name, file_size, file_type, folder_id, is_favorite, is_deleted, created_at, scan_status, sha256_hash")
    .eq("user_id", req.user.id);

  if (trash === "true") {
    query = query.eq("is_deleted", true);
  } else {
    query = query.eq("is_deleted", false);
    if (favorite === "true") {
      query = query.eq("is_favorite", true);
    }
  }

  if (normalizedFolderId !== undefined) {
    if (normalizedFolderId === null) {
      query = query.is("folder_id", null);
    } else {
      query = query.eq("folder_id", normalizedFolderId);
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json(data);
};

export const getFolders = async (req, res) => {
  const { parentId, favorite } = req.query;
  const normalizedParentId = normalizeFolderId(parentId);

  let query = supabase
    .from("folders")
    .select("*")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (favorite === "true") {
    query = query.eq("is_favorite", true);
  } else {
    if (normalizedParentId === undefined || normalizedParentId === null) {
      query = query.is("parent_id", null);
    } else {
      query = query.eq("parent_id", normalizedParentId);
    }
  }

  const { data, error } = await query;
  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json(data);
};

export const getAllFolders = async (req, res) => {
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json(data);
};

export const createFolder = async (req, res) => {
  const folderName = sanitizeFolderName(req.body?.name || "");
  const parentId = normalizeFolderId(req.body?.parentId);

  if (!folderName) {
    return res.status(400).json({ success: false, message: "Valid folder name is required" });
  }

  if (parentId) {
    const { data: parentFolder, error: parentError } = await supabase
      .from("folders")
      .select("id")
      .eq("id", parentId)
      .eq("user_id", req.user.id)
      .single();

    if (parentError || !parentFolder) {
      return res.status(400).json({ success: false, message: "Invalid parent folder" });
    }
  }

  const { data, error } = await supabase
    .from("folders")
    .insert([
      {
        user_id: req.user.id,
        name: folderName,
        parent_id: parentId,
      },
    ])
    .select("*")
    .single();

  if (error) return res.status(400).json({ success: false, message: error.message });

  await logAuditEvent({
    eventType: "FOLDER_CREATED",
    actorId: req.user.id,
    resourceType: "folder",
    resourceId: data.id,
    resourceName: folderName,
    outcome: "success",
    severity: "info",
    req
  });

  res.status(201).json(data);
};

export const renameFolder = async (req, res) => {
  const { id } = req.params;
  const folderName = sanitizeFolderName(req.body?.name || "");

  if (!folderName) {
    return res.status(400).json({ success: false, message: "Valid folder name is required" });
  }

  const { error } = await supabase
    .from("folders")
    .update({ name: folderName })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ success: false, message: error.message });

  await logAuditEvent({
    eventType: "FOLDER_RENAMED",
    actorId: req.user.id,
    resourceType: "folder",
    resourceId: id,
    resourceName: folderName,
    outcome: "success",
    severity: "info",
    req
  });

  res.json({ success: true, message: "Folder renamed" });
};

export const toggleFolderFavorite = async (req, res) => {
  const { id } = req.params;
  const { isFavorite } = req.body;

  const { error } = await supabase
    .from("folders")
    .update({ is_favorite: Boolean(isFavorite) })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, message: "Folder favorite status updated" });
};

export const deleteFolder = async (req, res) => {
  const { id } = req.params;

  const { data: childFolders, error: childError } = await supabase
    .from("folders")
    .select("id")
    .eq("parent_id", id)
    .eq("user_id", req.user.id)
    .limit(1);

  if (childError) return res.status(400).json({ success: false, message: childError.message });
  if (childFolders?.length) {
    return res.status(400).json({ success: false, message: "Folder has subfolders. Remove them first." });
  }

  const { data: childFiles, error: filesError } = await supabase
    .from("files")
    .select("id")
    .eq("folder_id", id)
    .eq("user_id", req.user.id)
    .eq("is_deleted", false)
    .limit(1);

  if (filesError) return res.status(400).json({ success: false, message: filesError.message });
  if (childFiles?.length) {
    return res.status(400).json({ success: false, message: "Folder has files. Move files out first." });
  }

  const { error } = await supabase
    .from("folders")
    .delete()
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ success: false, message: error.message });

  await logAuditEvent({
    eventType: "FOLDER_DELETED",
    actorId: req.user.id,
    resourceType: "folder",
    resourceId: id,
    outcome: "success",
    severity: "warning",
    req
  });

  res.json({ success: true, message: "Folder deleted" });
};

export const moveFileToFolder = async (req, res) => {
  const { id } = req.params;
  const folderId = normalizeFolderId(req.body?.folderId);

  if (folderId) {
    const { data: folder, error: folderError } = await supabase
      .from("folders")
      .select("id")
      .eq("id", folderId)
      .eq("user_id", req.user.id)
      .single();

    if (folderError || !folder) {
      return res.status(400).json({ success: false, message: "Target folder does not exist" });
    }
  }

  const { error } = await supabase
    .from("files")
    .update({ folder_id: folderId })
    .eq("id", id)
    .eq("user_id", req.user.id)
    .eq("is_deleted", false);

  if (error) return res.status(400).json({ success: false, message: error.message });

  await logAuditEvent({
    eventType: "FILE_MOVED",
    actorId: req.user.id,
    resourceType: "file",
    resourceId: id,
    outcome: "success",
    severity: "info",
    metadata: { targetFolderId: folderId },
    req
  });

  res.json({ success: true, message: "File moved successfully" });
};

export const renameFile = async (req, res) => {
  const { id } = req.params;
  const { newName } = req.body;

  if (!newName || typeof newName !== "string") {
    return res.status(400).json({ success: false, message: "New name is required" });
  }

  const sanitized = sanitizeDisplayFilename(newName);

  const { error } = await supabase
    .from("files")
    .update({ file_name: sanitized })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ success: false, message: error.message });

  await logAuditEvent({
    eventType: "FILE_RENAMED",
    actorId: req.user.id,
    resourceType: "file",
    resourceId: id,
    resourceName: sanitized,
    outcome: "success",
    severity: "info",
    req
  });

  res.json({ success: true, message: "File renamed" });
};

export const toggleFavorite = async (req, res) => {
  const { id } = req.params;
  const { isFavorite } = req.body;

  const { error } = await supabase
    .from("files")
    .update({ is_favorite: Boolean(isFavorite) })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, message: "Favorite status updated" });
};

export const softDeleteFile = async (req, res) => {
  const { id } = req.params;

  const { data: file } = await supabase
    .from("files")
    .select("file_name")
    .eq("id", id)
    .eq("user_id", req.user.id)
    .single();

  const { error } = await supabase
    .from("files")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ success: false, message: error.message });

  await logAuditEvent({
    eventType: "FILE_MOVED_TO_TRASH",
    actorId: req.user.id,
    resourceType: "file",
    resourceId: id,
    resourceName: file?.file_name || "file",
    outcome: "success",
    severity: "warning",
    req
  });

  res.json({ success: true, message: "File moved to trash" });
};

export const restoreFile = async (req, res) => {
  const { id } = req.params;

  const { data: file } = await supabase
    .from("files")
    .select("file_name")
    .eq("id", id)
    .eq("user_id", req.user.id)
    .single();

  const { error } = await supabase
    .from("files")
    .update({ is_deleted: false, deleted_at: null })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ success: false, message: error.message });

  await logAuditEvent({
    eventType: "FILE_RESTORED",
    actorId: req.user.id,
    resourceType: "file",
    resourceId: id,
    resourceName: file?.file_name || "file",
    outcome: "success",
    severity: "info",
    req
  });

  res.json({ success: true, message: "File restored" });
};

export const permanentDeleteFile = async (req, res) => {
  const { id } = req.params;

  const { data: file, error: fetchError } = await supabase
    .from("files")
    .select("file_name, storage_path")
    .eq("id", id)
    .eq("user_id", req.user.id)
    .single();

  if (fetchError || !file) {
    return res.status(404).json({ success: false, message: "File not found" });
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from("user-files")
    .remove([file.storage_path]);

  if (storageError) {
    return res.status(400).json({ success: false, message: "Storage deletion failed" });
  }

  // Delete from database
  const { error: dbError } = await supabase
    .from("files")
    .delete()
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (dbError) return res.status(400).json({ success: false, message: dbError.message });

  await logAuditEvent({
    eventType: "FILE_PERMANENTLY_DELETED",
    actorId: req.user.id,
    resourceType: "file",
    resourceId: id,
    resourceName: file.file_name,
    outcome: "success",
    severity: "critical",
    req
  });

  res.json({ success: true, message: "File permanently deleted" });
};

export const getFilePreviewUrl = async (req, res) => {
  const { id } = req.params;

  const { data: file, error } = await supabase
    .from("files")
    .select("id, file_name, file_type, storage_path, is_deleted, scan_status")
    .eq("id", id)
    .eq("user_id", req.user.id)
    .single();

  if (error || !file) {
    await logAuditEvent({
      eventType: "FILE_PREVIEW_ATTEMPT",
      actorId: req.user.id,
      resourceType: "file",
      resourceId: id,
      outcome: "blocked",
      severity: "warning",
      metadata: { reason: "file_not_found_or_unauthorized" },
      req
    });
    return res.status(404).json({ success: false, message: "File not found" });
  }

  if (file.is_deleted) {
    return res.status(403).json({ success: false, message: "Cannot preview deleted file. Restore it first." });
  }

  // Security policy: Missing scan status or non-CLEAN status strictly blocks preview
  if (!file.scan_status || file.scan_status !== "CLEAN") {
    return res.status(403).json({
      success: false,
      message: `File is not approved for access (status: ${file.scan_status || "UNVERIFIED"}). Preview blocked.`
    });
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from("user-files")
    .createSignedUrl(file.storage_path, 60 * 5);

  if (signedError || !signedData?.signedUrl) {
    return res.status(500).json({ success: false, message: "Unable to generate secure preview URL" });
  }

  await logAuditEvent({
    eventType: "FILE_PREVIEW_SUCCESS",
    actorId: req.user.id,
    resourceType: "file",
    resourceId: id,
    resourceName: file.file_name,
    outcome: "success",
    severity: "info",
    req
  });

  res.json({
    success: true,
    url: signedData.signedUrl,
    fileName: file.file_name,
    fileType: file.file_type || "",
  });
};

export const getFileContent = async (req, res) => {
  const { id } = req.params;

  const { data: file, error } = await supabase
    .from("files")
    .select("file_name, file_type, storage_path, is_deleted, scan_status")
    .eq("id", id)
    .eq("user_id", req.user.id)
    .single();

  if (error || !file) {
    await logAuditEvent({
      eventType: "FILE_DOWNLOAD_ATTEMPT",
      actorId: req.user.id,
      resourceType: "file",
      resourceId: id,
      outcome: "blocked",
      severity: "warning",
      metadata: { reason: "file_not_found_or_unauthorized" },
      req
    });
    return res.status(404).json({ success: false, message: "File not found" });
  }

  if (file.is_deleted) {
    return res.status(403).json({ success: false, message: "Cannot download a deleted file. Restore it first." });
  }

  // Security policy: Missing scan status or non-CLEAN status strictly blocks download
  if (!file.scan_status || file.scan_status !== "CLEAN") {
    return res.status(403).json({
      success: false,
      message: `File is not approved for access (status: ${file.scan_status || "UNVERIFIED"}). Download blocked.`
    });
  }

  const { data: blobData, error: blobError } = await supabase.storage
    .from("user-files")
    .download(file.storage_path);

  if (blobError || !blobData) {
    return res.status(400).json({ success: false, message: "Unable to retrieve file content" });
  }

  await logAuditEvent({
    eventType: "FILE_DOWNLOAD_SUCCESS",
    actorId: req.user.id,
    resourceType: "file",
    resourceId: id,
    resourceName: file.file_name,
    outcome: "success",
    severity: "info",
    req
  });

  const arrayBuffer = await blobData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const safeName = encodeURIComponent(file.file_name || "downloaded_file");

  res.setHeader("Content-Type", file.file_type || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${safeName}`);
  res.send(buffer);
};
