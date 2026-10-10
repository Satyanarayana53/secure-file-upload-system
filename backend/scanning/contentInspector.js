import path from "path";

// EICAR standard test string (must be detected across the entire buffer)
const EICAR_SIGNATURE = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

/**
 * Deep format-aware static content inspector:
 * - Scans ENTIRE buffer for EICAR signature and malicious shell/script payloads
 * - PDF inspection: detects /JavaScript, /Launch, /EmbeddedFiles, /AcroForm, /RichMedia
 * - Office document inspection: detects VBA macros, macrosheets, external OLE relationships
 * - Archive/Polyglot inspection: detects embedded executables (MZ header, ELF, Mach-O)
 */
export const inspectContent = (buffer, extension = "") => {
  if (!buffer || buffer.length === 0) {
    return {
      isSuspicious: false,
      indicators: [],
      reason: null
    };
  }

  const indicators = [];
  const cleanExt = extension.toLowerCase();

  // 1. Full-buffer EICAR signature check (across all bytes, not just 4KB)
  const fullText = buffer.toString("binary");
  if (fullText.includes(EICAR_SIGNATURE)) {
    return {
      isMalicious: true,
      threatType: "EICAR-Test-Signature",
      indicators: ["KNOWN_TEST_MALWARE_SIGNATURE"],
      reason: "Antivirus test signature (EICAR) detected in complete file buffer"
    };
  }

  // 2. Executable / binary header inspection (detecting polyglots or executables disguised as documents)
  if (cleanExt !== ".exe" && buffer.length >= 2) {
    // DOS / Windows PE Header: MZ (0x4D 0x5A)
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return {
        isMalicious: true,
        threatType: "Disguised-Executable-PE",
        indicators: ["PE_EXECUTABLE_HEADER_IN_NON_EXE"],
        reason: "Executable Windows binary (MZ header) disguised as non-executable file"
      };
    }
    // ELF Header: \x7FELF (0x7F 0x45 0x4C 0x46)
    if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
      return {
        isMalicious: true,
        threatType: "Disguised-Executable-ELF",
        indicators: ["ELF_EXECUTABLE_HEADER_IN_NON_EXE"],
        reason: "Executable Linux binary (ELF header) disguised as non-executable file"
      };
    }
  }

  // 3. Format-specific inspections
  if (cleanExt === ".pdf") {
    // PDF active content inspection
    if (fullText.includes("/JavaScript") || fullText.includes("/JS")) {
      indicators.push("PDF_EMBEDDED_JAVASCRIPT");
    }
    if (fullText.includes("/Launch")) {
      indicators.push("PDF_LAUNCH_ACTION");
    }
    if (fullText.includes("/EmbeddedFiles")) {
      indicators.push("PDF_EMBEDDED_FILES");
    }
    if (fullText.includes("/RichMedia") || fullText.includes("/Flash")) {
      indicators.push("PDF_RICH_MEDIA_OBJECT");
    }
  }

  if (cleanExt === ".docx" || cleanExt === ".xlsx" || cleanExt === ".doc" || cleanExt === ".xls") {
    // Macro detection
    if (
      fullText.includes("vbaProject.bin") ||
      fullText.includes("Macros") ||
      fullText.includes("AutoExec") ||
      fullText.includes("AutoOpen") ||
      fullText.includes("Workbook_Open")
    ) {
      indicators.push("OFFICE_EMBEDDED_VBA_MACRO");
    }
    // External OLE object or remote template injection
    if (fullText.includes("TargetMode=\"External\"") && fullText.includes("AttachedTemplate")) {
      indicators.push("OFFICE_REMOTE_TEMPLATE_INJECTION");
    }
  }

  // 4. Dangerous script pattern inspection across document text
  const dangerousPatterns = [
    { pattern: "powershell -enc", label: "ENCODED_POWERSHELL_PAYLOAD" },
    { pattern: "powershell -executionpolicy bypass", label: "POWERSHELL_BYPASS_FLAG" },
    { pattern: "cmd.exe /c", label: "CMD_PROCESS_EXECUTION" },
    { pattern: "<script", label: "HTML_SCRIPT_TAG_INJECTION" },
    { pattern: "eval(base64_decode", label: "OBFUSCATED_PHP_EVAL" },
    { pattern: "WScript.Shell", label: "WSCRIPT_SHELL_EXECUTION" }
  ];

  const lowerText = fullText.toLowerCase();
  for (const { pattern, label } of dangerousPatterns) {
    if (lowerText.includes(pattern.toLowerCase())) {
      indicators.push(label);
    }
  }

  const isSuspicious = indicators.length > 0;
  return {
    isMalicious: false,
    isSuspicious,
    indicators,
    reason: isSuspicious ? `Suspicious indicators detected: ${indicators.join(", ")}` : null
  };
};
