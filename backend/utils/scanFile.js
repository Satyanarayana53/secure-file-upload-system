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
  const buffer = fs.readFileSync(filePath);
  const hex = buffer.toString("hex", 0, 8);
  const ext = path.extname(filePath).replace(".", "").toLowerCase();

  // Quick signature check for known binary formats
  if (signatures[ext] && signatures[ext].length > 0) {
    const valid = signatures[ext].some(sig => hex.startsWith(sig));
    if (!valid) {
      return {
        isInfected: true,
        viruses: ["File signature mismatch"]
      };
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

  // Special-case detection for formats where signature is not at offset 0
  if (ext === "heic" || ext === "heif") {
    try {
      // 'ftyp' box typically starts at offset 4
      const ftyp = buffer.toString("hex", 4, 8);
      if (ftyp === "66747970") {
        // likely a HEIF/HEIC container
      } else {
        return {
          isInfected: true,
          viruses: ["File signature mismatch"]
        };
      }
    } catch (err) {
      return {
        isInfected: true,
        viruses: ["File signature mismatch"]
      };
    }
  }

  // Heuristic: treat file as binary if there are null bytes in the first chunk
  const head = buffer.slice(0, 4096);
  const isBinary = head.includes(0);

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

  if (!isBinary && (textExtensions.has(ext) || ext === "")) {
    const text = head.toString("utf8").toLowerCase();

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

  return {
    isInfected: false,
    viruses: []
  };
}

module.exports = scanFile;
