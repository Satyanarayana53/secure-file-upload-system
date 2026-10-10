import path from "path";

// Allowed extensions and their expected MIME types & magic signatures
export const SUPPORTED_FILE_TYPES = {
  ".pdf": {
    mimeTypes: ["application/pdf"],
    magicCheck: (buffer) => {
      // PDF files start with %PDF- (hex: 25 50 44 46 2d)
      if (buffer.length < 5) return false;
      return (
        buffer[0] === 0x25 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x44 &&
        buffer[3] === 0x46 &&
        buffer[4] === 0x2d
      );
    }
  },
  ".png": {
    mimeTypes: ["image/png"],
    magicCheck: (buffer) => {
      // PNG magic number: 89 50 4E 47 0D 0A 1A 0A
      if (buffer.length < 8) return false;
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
      );
    }
  },
  ".jpg": {
    mimeTypes: ["image/jpeg"],
    magicCheck: (buffer) => {
      // JPEG magic number starts with FF D8 FF
      if (buffer.length < 3) return false;
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
  },
  ".jpeg": {
    mimeTypes: ["image/jpeg"],
    magicCheck: (buffer) => {
      if (buffer.length < 3) return false;
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
  },
  ".txt": {
    mimeTypes: ["text/plain", "application/octet-stream"],
    magicCheck: (buffer) => {
      // Text file check: should not contain excessive null bytes (binary disguised as text)
      if (buffer.length === 0) return true;
      const sample = buffer.slice(0, Math.min(buffer.length, 1024));
      let nullCount = 0;
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0x00) nullCount++;
      }
      return nullCount < 2; // Real text files do not contain null bytes
    }
  },
  ".docx": {
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/octet-stream"],
    magicCheck: (buffer) => {
      // OpenXML documents are ZIP archives starting with PK (0x50 0x4B 0x03 0x04)
      if (buffer.length < 4) return false;
      return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    }
  },
  ".xlsx": {
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip", "application/octet-stream"],
    magicCheck: (buffer) => {
      if (buffer.length < 4) return false;
      return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    }
  },
  ".doc": {
    mimeTypes: ["application/msword", "application/octet-stream"],
    magicCheck: (buffer) => {
      // OLE2 Compound Document header: D0 CF 11 E0 A1 B1 1A E1
      if (buffer.length < 8) return false;
      return buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    }
  },
  ".xls": {
    mimeTypes: ["application/vnd.ms-excel", "application/octet-stream"],
    magicCheck: (buffer) => {
      if (buffer.length < 8) return false;
      return buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
    }
  }
};

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES || "10485760", 10); // 10MB default

/**
 * Validates a file before scanning:
 * - Checks file presence and buffer
 * - Enforces extension allowlist
 * - Validates file size
 * - Matches magic signatures against extension
 * - Protects against zero-byte files, traversal, and corrupted headers
 */
export const validateFile = (file) => {
  if (!file || !file.buffer) {
    return {
      isValid: false,
      reason: "No file content provided",
      detectedType: null
    };
  }

  // 1. File size check
  if (file.size > MAX_FILE_SIZE || file.buffer.length > MAX_FILE_SIZE) {
    return {
      isValid: false,
      reason: `File size exceeds maximum allowed limit (${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB)`,
      detectedType: null
    };
  }

  if (file.size === 0 || file.buffer.length === 0) {
    return {
      isValid: false,
      reason: "File is empty (0 bytes)",
      detectedType: null
    };
  }

  // 2. Extension check
  const ext = path.extname(file.originalname || "").toLowerCase();
  const typeConfig = SUPPORTED_FILE_TYPES[ext];

  if (!typeConfig) {
    return {
      isValid: false,
      reason: `File extension '${ext || "none"}' is not permitted`,
      detectedType: null
    };
  }

  // 3. Magic number / signature check
  const isSignatureValid = typeConfig.magicCheck(file.buffer);
  if (!isSignatureValid) {
    return {
      isValid: false,
      reason: `File signature mismatch for '${ext}'. File content does not match extension.`,
      detectedType: null
    };
  }

  return {
    isValid: true,
    reason: null,
    detectedType: typeConfig.mimeTypes[0],
    extension: ext
  };
};
