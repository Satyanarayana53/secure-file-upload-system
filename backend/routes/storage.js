const express = require("express");
const router = express.Router();
const db = require("../config/db"); // mee db connection file
const authMiddleware = require("../middleware/authMiddleware");

// 5 GB limit (bytes lo)
const TOTAL_STORAGE = 5 * 1024 * 1024 * 1024;

router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(
      "SELECT SUM(file_size) AS used FROM files WHERE user_id = ? AND is_deleted = 0",
      [userId]
    );

    const used = rows[0].used || 0;

    res.json({
      used,
      total: TOTAL_STORAGE
    });

  } catch (err) {
    res.status(500).json({ message: "Storage fetch failed" });
  }
});

module.exports = router;
