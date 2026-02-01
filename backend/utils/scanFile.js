const fs = require("fs");
const path = require("path");

const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

const signatures = {
  jpg: ["ffd8ff"],
  jpeg: ["ffd8ff"],
  png: ["89504e47"],
  pdf: ["25504446"],
  docx: ["504b0304"],
  pptx: ["504b0304"],
  txt: []
};

async function scanFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const hex = buffer.toString("hex", 0, 8);
  const text = buffer.toString().toLowerCase();
  const ext = path.extname(filePath).replace(".", "").toLowerCase();

  if (signatures[ext] && signatures[ext].length > 0) {
    const valid = signatures[ext].some(sig =>
      hex.startsWith(sig)
    );
    if (!valid) {
      return {
        isInfected: true,
        viruses: ["File signature mismatch"]
      };
    }
  }

  if (text.includes(EICAR.toLowerCase())) {
    return {
      isInfected: true,
      viruses: ["EICAR-Test-Virus"]
    };
  }

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

  return {
    isInfected: false,
    viruses: []
  };
}

module.exports = scanFile;
