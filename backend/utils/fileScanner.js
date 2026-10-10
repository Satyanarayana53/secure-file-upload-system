import path from "path";

const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

export const scanFileThreats = (file) => {
  const allowedTypes = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".txt", ".xlsx", ".xls"];
  const blockedNames = ["virus", "hack", "shell", "trojan", "malware", "payload"];

  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedTypes.includes(ext)) {
    return {
      isSafe: false,
      reason: "File type is not allowed",
    };
  }

  const lowercaseName = file.originalname.toLowerCase();
  for (const word of blockedNames) {
    if (lowercaseName.includes(word)) {
      return {
        isSafe: false,
        reason: "Suspicious file name detected",
      };
    }
  }

  if (file.size > 10 * 1024 * 1024) {
    return {
      isSafe: false,
      reason: "File is larger than 10MB",
    };
  }

  const textPreview = file.buffer?.toString("latin1", 0, 4096).toLowerCase() || "";
  if (textPreview.includes(EICAR_SIGNATURE.toLowerCase())) {
    return {
      isSafe: false,
      reason: "Known antivirus test signature detected",
    };
  }

  const suspiciousPatterns = ["powershell -enc", "cmd.exe /c", "<script>", "eval("];
  for (const pattern of suspiciousPatterns) {
    if (textPreview.includes(pattern)) {
      return {
        isSafe: false,
        reason: "Suspicious content detected in file",
      };
    }
  }

  return { isSafe: true, reason: "" };
};

export const isSafeFile = (file) => scanFileThreats(file).isSafe;
