const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const auth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "No token" });

  try {
    const token = header.split(" ")[1]; // Bearer token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

router.get("/profile", auth, (req, res) => {
  db.query(
    "SELECT username, email, profile_pic FROM users WHERE id=$1",
    [req.userId],
    (err, result) => {
      if (err || result.rows.length === 0)
        return res.status(400).json({ message: "User not found" });

      res.json(result.rows[0]);
    }
  );
});

const storage = multer.diskStorage({
  destination: "uploads/profile/",
  filename: (req, file, cb) => {
    cb(null, `${req.userId}_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage });

router.post("/profile-pic", auth, upload.single("photo"), (req, res) => {
  const fileName = req.file.filename;

  db.query(
    "UPDATE users SET profile_pic=$1 WHERE id=$2",
    [fileName, req.userId],
    () => {
      res.json({ profile_pic: fileName });
    }
  );
});

router.delete("/profile-pic", auth, (req, res) => {
  db.query(
    "SELECT profile_pic FROM users WHERE id=$1",
    [req.userId],
    (err, result) => {
      if (result.rows.length === 0) {
        return res.status(400).json({ message: "User not found" });
      }

      const oldPic = result.rows[0].profile_pic;

      if (oldPic && oldPic !== "default.png") {
        const filePath = path.join("uploads/profile", oldPic);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      db.query(
        "UPDATE users SET profile_pic='default.png' WHERE id=$1",
        [req.userId],
        () => {
          res.json({ profile_pic: "default.png" });
        }
      );
    }
  );
});

module.exports = router;
