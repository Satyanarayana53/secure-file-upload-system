const express = require("express");
const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadProfile");

const router = express.Router();

/* ================= GET PROFILE ================= */
router.get("/profile", authenticateToken, (req, res) => {
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

/* ================= UPLOAD PROFILE PIC ================= */
router.post(
  "/profile-pic",
  authenticateToken,
  upload.single("photo"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "No file uploaded" });

      const filename = req.file.filename;

      await db.query("UPDATE users SET profile_pic=$1 WHERE id=$2", [
        filename,
        req.userId,
      ]);

      res.json({ profile_pic: filename });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Upload failed" });
    }
  }
);

/* ================= REMOVE PROFILE PIC ================= */
router.delete("/profile-pic", authenticateToken, async (req, res) => {
  try {
    await db.query("UPDATE users SET profile_pic='default.png' WHERE id=$1", [
      req.userId,
    ]);

    res.json({ profile_pic: "default.png" });
  } catch (err) {
    res.status(500).json({ message: "Remove failed" });
  }
});

module.exports = router;
