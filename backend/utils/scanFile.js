const fs = require("fs");
const path = require("path");

const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

const signatures = {
  jpg: ["ffd8ff", "ffd8ffe0", "ffd8ffe1", "ffd8ffe8"],
  jpeg: ["ffd8ff", "ffd8ffe0", "ffd8ffe1", "ffd8ffe8"],
  png: ["89504e47"],
  pdf: ["25504446"],
  docx: ["504b0304"],
  pptx: ["504b0304"],
  txt: []
};

async function scanFile(filePath) {
  const { fileTypeFromBuffer } = await import("file-type");
  const buffer = await fs.promises.readFile(filePath);
  const hex = buffer.toString("hex", 0, 8);
  const filenameExt = path.extname(filePath).replace('.', '').toLowerCase();

  // Try to detect the real file type from the buffer
  let detected = null;
  try {
    detected = await fileTypeFromBuffer(buffer);
  } catch (err) {
    // ignore
  }

  const detectedExt = detected?.ext || null;
  const detectedMime = detected?.mime || null;

  // If we have a known signature for this extension, check quickly
  const checkExt = detectedExt || filenameExt;
  if (checkExt && signatures[checkExt] && signatures[checkExt].length > 0) {
    const valid = signatures[checkExt].some(sig => hex.startsWith(sig));
    if (!valid) {
      // don't be overly strict for images — allow if detection matched image mime
      if (!detectedMime || !detectedMime.startsWith("image")) {
        return {
          isInfected: true,
          viruses: ["File signature mismatch"]
        };
      }
    }
  }

  // Detect EICAR directly in the buffer (safe for binary and text)
  try {
    const eicarBuf = Buffer.from(EICAR);
    if (buffer.indexOf(eicarBuf) !== -1) {
      return {
        isInfected: true,
        viruses: ["EICAR-Test-Virus"]
      };
    }
  } catch (err) {
    // ignore errors converting/ searching buffer
  }

  // Heuristic: treat file as binary if file-type detected as non-text or there are null bytes
  const head = buffer.slice(0, 4096);
  const hasNulls = head.includes(0);
  const likelyText = (detectedMime && detectedMime.startsWith("text")) || !hasNulls;

  // Only perform textual "suspicious token" scans for likely text files
  const textExtensions = new Set([
    "txt",
    "md",
    "csv",
    "json",
    "xml",
    "html",
    "htm",
    "js",
    "py",
    "php",
    "css"
  ]);

  if (likelyText && (textExtensions.has(detectedExt) || textExtensions.has(filenameExt) || detectedMime?.includes("json") )) {
    const text = buffer.toString("utf8").toLowerCase();

    const suspicious = [
      "<script",
      "eval(",
      "powershell",
      "base64",
      "cmd.exe",
      "wget",
      "curl"
    ];

    for (let s of suspicious) {
      if (text.includes(s)) {
        return {
          isInfected: true,
          viruses: ["Suspicious embedded script"]
        };
      }
    }
  }

  // If we reach here, no textual suspicious tokens and signatures ok
  return {
    isInfected: false,
    viruses: [],
    detected: {
      ext: detectedExt,
      mime: detectedMime
    }
  };
}

module.exports = scanFile;
