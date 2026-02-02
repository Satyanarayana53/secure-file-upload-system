const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const path = require("path");

const router = express.Router();

const auth = (req, res, next) => {
  try {
    const decoded = jwt.verify(req.headers.authorization, "secret");
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
};

const storage = multer.diskStorage({
  destination: "uploads/profile",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

router.post("/upload", auth, upload.single("photo"), (req, res) => {
  const imgPath = `/uploads/profile/${req.file.filename}`;

  db.query(
    "UPDATE users SET profile_pic=$1 WHERE id=$2",
    [imgPath, req.userId],
    () => {
      res.json({
        message: "Profile picture updated",
        path: imgPath
      });
    }
  );
});

module.exports = router;
