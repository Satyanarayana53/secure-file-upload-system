const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", auth, (req, res) => {
  const { type } = req.query;
  const userId = req.userId;
  let sql = "";

  if (type === "recent") {
    sql = `
      SELECT * FROM files
      WHERE user_id = ? AND is_deleted = 0
      ORDER BY uploaded_at DESC
      LIMIT 10
    `;
  } else if (type === "starred") {
    sql = `
      SELECT * FROM files
      WHERE user_id = ? AND is_starred = 1 AND is_deleted = 0
      ORDER BY uploaded_at DESC
    `;
  } else if (type === "trash") {
    sql = `
      SELECT * FROM files
      WHERE user_id = ? AND is_deleted = 1
      ORDER BY deleted_at DESC
    `;
  } else {
    sql = `
      SELECT * FROM files
      WHERE user_id = ? AND is_deleted = 0
      ORDER BY uploaded_at DESC
    `;
  }

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results);
  });
});

router.put("/star/:id", auth, (req, res) => {
  db.query(
    `UPDATE files SET is_starred = NOT is_starred WHERE id=? AND user_id=?`,
    [req.params.id, req.userId],
    (err) => {
      if (err) return res.status(500).json({ message: "Star failed" });
      res.json({ success: true });
    }
  );
});

router.delete("/:id", auth, (req, res) => {
  db.query(
    `
    UPDATE files
    SET is_deleted = 1, deleted_at = ?
    WHERE id = ? AND user_id = ?
    `,
    [Date.now(), req.params.id, req.userId],
    (err) => {
      if (err) return res.status(500).json({ message: "Delete failed" });
      res.json({ success: true });
    }
  );
});

router.put("/restore/:id", auth, (req, res) => {
  db.query(
    `
    UPDATE files
    SET is_deleted = 0, deleted_at = NULL
    WHERE id = ? AND user_id = ?
    `,
    [req.params.id, req.userId],
    (err) => {
      if (err) return res.status(500).json({ message: "Restore failed" });
      res.json({ success: true });
    }
  );
});

router.delete("/permanent/:id", auth, (req, res) => {
  db.query(
    `SELECT stored_name FROM files WHERE id=? AND user_id=?`,
    [req.params.id, req.userId],
    (err, rows) => {
      if (err || rows.length === 0) {
        return res.status(404).json({ message: "File not found" });
      }

      const filePath = path.join(
        "uploads",
        "files",
        rows[0].stored_name
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      db.query(
        `DELETE FROM files WHERE id=? AND user_id=?`,
        [req.params.id, req.userId],
        () => res.json({ success: true })
      );
    }
  );
});

router.get("/download/:id", auth, (req, res) => {
  db.query(
    `
    SELECT original_name, stored_name 
    FROM files 
    WHERE id = ? AND user_id = ? AND is_deleted = 0
    `,
    [req.params.id, req.userId],
    (err, result) => {
      if (err || result.length === 0) {
        return res.status(404).json({ message: "File not found" });
      }
    
      const filePath = path.join(
        __dirname,
        "..",
        "uploads",
        "files",
        result[0].stored_name
      );

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File missing" });
      }

      res.download(filePath, result[0].original_name);
    }
  );
});

/* ================= STORAGE INFO ================= */
router.get("/storage", auth, (req, res) => {
  const TOTAL_STORAGE = 5 * 1024 * 1024 * 1024; // 5GB

  db.query(
    "SELECT IFNULL(SUM(file_size), 0) AS used FROM files WHERE user_id=? AND is_deleted=0",
    [req.userId],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Storage error" });
      }

      res.json({
        used: result[0].used,
        total: TOTAL_STORAGE
      });
    }
  );
});

module.exports = router;
