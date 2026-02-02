const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../config/db");
const auth = require("../middleware/authMiddleware");
const scanFile = require("../utils/scanFile");

const router = express.Router();

const allowedExtensions = [
  "jpg", "jpeg", "png",
  "pdf", "doc", "docx",
  "txt", "ppt", "pptx"
];

const uploadDir = "uploads/files";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique =
      Date.now() + "_" + Math.random().toString(36).substring(2);
    cb(null, unique + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname)
      .replace(".", "")
      .toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      return cb(new Error("File type not allowed"));
    }
    cb(null, true);
  }
});

router.post("/", auth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const filePath = req.file.path;

    const scanResult = await scanFile(filePath);

    if (scanResult.isInfected) {
      fs.unlinkSync(filePath);

      return res.status(400).json({
        message: "Malicious file detected",
        threats: scanResult.viruses
      });
    }

    db.query(
      `
      INSERT INTO files
      (user_id, original_name, stored_name, file_type, file_size)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [
        req.userId,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size
      ],
      (err) => {
        if (err) {
          fs.unlinkSync(filePath);
          return res.status(500).json({ message: "Database error" });
        }

        res.json({
          success: true,
          message: "File uploaded securely"
        });
      }
    );

  } catch (err) {
    console.error("UPLOAD ERROR:", err.message);
    res.status(400).json({
      message: "Malicious or invalid file detected"
    });
  }
});

module.exports = router;
