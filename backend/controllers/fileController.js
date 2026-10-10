import { v4 as uuidv4 } from "uuid";
import supabase from "../config/supabase.js";
import { scanFileThreats } from "../utils/fileScanner.js";

const sanitizeFolderName = (name = "") => name.trim().replace(/\s+/g, " ").slice(0, 60);
const normalizeFolderId = (folderId) => {
  if (folderId === undefined) return undefined;
  if (folderId === null || folderId === "" || folderId === "root") return null;
  return folderId;
};

export const uploadFile = async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: "No file uploaded" });

  const scanResult = scanFileThreats(file);
  if (!scanResult.isSafe) {
    return res.status(400).json({ message: `Unsafe file detected: ${scanResult.reason}` });
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
      return res.status(400).json({ message: "Invalid folder selected" });
    }
  }

  const filePath = `${req.user.id}/${uuidv4()}-${file.originalname}`;

  const { error } = await supabase.storage
    .from("user-files")
    .upload(filePath, file.buffer, {
      contentType: file.mimetype
    });

  if (error) return res.status(400).json({ message: error.message });

  const { data, error: dbError } = await supabase.from("files").insert([{
    user_id: req.user.id,
    file_name: file.originalname,
    storage_path: filePath,
    file_size: file.size, 
    file_type: file.mimetype,
    folder_id: targetFolderId,
    is_favorite: false,
    is_deleted: false
  }]);

  if (dbError) return res.status(400).json({ message: dbError.message });

  res.json({ message: "File uploaded securely" });
};


export const getFiles = async (req, res) => {
  const { trash, favorite, folderId } = req.query;
  const normalizedFolderId = normalizeFolderId(folderId);
  
  let query = supabase
    .from("files")
    .select("*")
    .eq("user_id", req.user.id);

  if (trash === 'true') {
    query = query.eq("is_deleted", true);
  } else {
    query = query.eq("is_deleted", false);
    if (favorite === 'true') {
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

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
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
  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
};

export const getAllFolders = async (req, res) => {
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ message: error.message });
  res.json(data);
};

export const createFolder = async (req, res) => {
  const folderName = sanitizeFolderName(req.body?.name || "");
  const parentId = normalizeFolderId(req.body?.parentId);

  if (!folderName) {
    return res.status(400).json({ message: "Folder name is required" });
  }

  if (parentId) {
    const { data: parentFolder, error: parentError } = await supabase
      .from("folders")
      .select("id")
      .eq("id", parentId)
      .eq("user_id", req.user.id)
      .single();

    if (parentError || !parentFolder) {
      return res.status(400).json({ message: "Invalid parent folder" });
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

  if (error) return res.status(400).json({ message: error.message });
  res.status(201).json(data);
};

export const renameFolder = async (req, res) => {
  const { id } = req.params;
  const folderName = sanitizeFolderName(req.body?.name || "");

  if (!folderName) {
    return res.status(400).json({ message: "Folder name is required" });
  }

  const { error } = await supabase
    .from("folders")
    .update({ name: folderName })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "Folder renamed" });
};

export const toggleFolderFavorite = async (req, res) => {
  const { id } = req.params;
  const { isFavorite } = req.body;

  const { error } = await supabase
    .from("folders")
    .update({ is_favorite: Boolean(isFavorite) })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "Folder favorite status updated" });
};

export const deleteFolder = async (req, res) => {
  const { id } = req.params;

  const { data: childFolders, error: childError } = await supabase
    .from("folders")
    .select("id")
    .eq("parent_id", id)
    .eq("user_id", req.user.id)
    .limit(1);

  if (childError) return res.status(400).json({ message: childError.message });
  if (childFolders?.length) {
    return res.status(400).json({ message: "Folder has subfolders. Remove them first." });
  }

  const { data: childFiles, error: filesError } = await supabase
    .from("files")
    .select("id")
    .eq("folder_id", id)
    .eq("user_id", req.user.id)
    .eq("is_deleted", false)
    .limit(1);

  if (filesError) return res.status(400).json({ message: filesError.message });
  if (childFiles?.length) {
    return res.status(400).json({ message: "Folder has files. Move files out first." });
  }

  const { error } = await supabase
    .from("folders")
    .delete()
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "Folder deleted" });
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
      return res.status(400).json({ message: "Target folder does not exist" });
    }
  }

  const { error } = await supabase
    .from("files")
    .update({ folder_id: folderId })
    .eq("id", id)
    .eq("user_id", req.user.id)
    .eq("is_deleted", false);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "File moved successfully" });
};

export const renameFile = async (req, res) => {
  const { id } = req.params;
  const { newName } = req.body;

  if (!newName) return res.status(400).json({ message: "New name is required" });


  const sanitized = newName.replace(/[^a-zA-Z0-9._-]/g, "");

  const { error } = await supabase
    .from("files")
    .update({ file_name: sanitized })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "File renamed" });
};

export const toggleFavorite = async (req, res) => {
  const { id } = req.params;
  const { isFavorite } = req.body; 

  const { error } = await supabase
    .from("files")
    .update({ is_favorite: isFavorite })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "Favorite status updated" });
};

export const softDeleteFile = async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from("files")
    .update({ is_deleted: true })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "File moved to trash" });
};

export const restoreFile = async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from("files")
    .update({ is_deleted: false })
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (error) return res.status(400).json({ message: error.message });
  res.json({ message: "File restored" });
};

export const permanentDeleteFile = async (req, res) => {
  const { id } = req.params;

  
  const { data: file, error: fetchError } = await supabase
    .from("files")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", req.user.id)
    .single();

  if (fetchError || !file) return res.status(404).json({ message: "File not found" });

  
  const { error: storageError } = await supabase.storage
    .from("user-files")
    .remove([file.storage_path]);

  if (storageError) return res.status(400).json({ message: "Storage deletion failed" });

  
  const { error: dbError } = await supabase
    .from("files")
    .delete()
    .eq("id", id)
    .eq("user_id", req.user.id);

  if (dbError) return res.status(400).json({ message: dbError.message });

  res.json({ message: "File permanently deleted" });
};

export const getFilePreviewUrl = async (req, res) => {
  const { id } = req.params;

  const { data: file, error } = await supabase
    .from("files")
    .select("id, file_name, file_type, storage_path")
    .eq("id", id)
    .eq("user_id", req.user.id)
    .single();

  if (error || !file) {
    return res.status(404).json({ message: "File not found" });
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from("user-files")
    .createSignedUrl(file.storage_path, 60 * 10);

  res.json({
    url: signedData?.signedUrl || "",
    contentPath: `/files/${id}/content`,
    signedUrlError: signedError?.message || "",
    fileName: file.file_name,
    fileType: file.file_type || "",
  });
};

export const getFileContent = async (req, res) => {
  const { id } = req.params;

  const { data: file, error } = await supabase
    .from("files")
    .select("file_name, file_type, storage_path")
    .eq("id", id)
    .eq("user_id", req.user.id)
    .single();

  if (error || !file) {
    return res.status(404).json({ message: "File not found" });
  }

  const { data: blobData, error: blobError } = await supabase.storage
    .from("user-files")
    .download(file.storage_path);

  if (blobError || !blobData) {
    return res.status(400).json({ message: blobError?.message || "Unable to load file content" });
  }

  const arrayBuffer = await blobData.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const safeName = encodeURIComponent(file.file_name || "file");

  res.setHeader("Content-Type", file.file_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${safeName}`);
  res.send(buffer);
};
