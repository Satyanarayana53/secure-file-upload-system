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
      WHERE user_id = $1 AND is_deleted = false
      ORDER BY uploaded_at DESC
      LIMIT 10
    `;
  } else if (type === "starred") {
    sql = `
      SELECT * FROM files
      WHERE user_id = $1 AND is_starred = true AND is_deleted = false
      ORDER BY uploaded_at DESC
    `;
  } else if (type === "trash") {
    sql = `
      SELECT * FROM files
      WHERE user_id = $1 AND is_deleted = true
      ORDER BY deleted_at DESC
    `;
  } else {
    sql = `
      SELECT * FROM files
      WHERE user_id = $1 AND is_deleted = false
      ORDER BY uploaded_at DESC
    `;
  }

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("DB ERROR:", err);
      return res.status(500).json({ message: "Database error" });
    }
    res.json(results.rows);
  });
});

router.put("/star/:id", auth, (req, res) => {
  db.query(
    `UPDATE files SET is_starred = NOT is_starred WHERE id=$1 AND user_id=$2`,
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
    SET is_deleted = true, deleted_at = $1
    WHERE id = $2 AND user_id = $3
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
    SET is_deleted = false, deleted_at = NULL
    WHERE id = $1 AND user_id = $2
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
    `SELECT stored_name FROM files WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.userId],
    (err, result) => {
      if (err || result.rows.length === 0) {
        return res.status(404).json({ message: "File not found" });
      }

      const filePath = path.join(
        "uploads",
        "files",
        result.rows[0].stored_name
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      db.query(
        `DELETE FROM files WHERE id=$1 AND user_id=$2`,
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
    WHERE id = $1 AND user_id = $2 AND is_deleted = false
    `,
    [req.params.id, req.userId],
    (err, result) => {
      if (err || result.rows.length === 0) {
        return res.status(404).json({ message: "File not found" });
      }
    
      const filePath = path.join(
        __dirname,
        "..",
        "uploads",
        "files",
        result.rows[0].stored_name
      );

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File missing" });
      }

      res.download(filePath, result.rows[0].original_name);
    }
  );
});

/* ================= STORAGE INFO ================= */
router.get("/storage", auth, (req, res) => {
  const TOTAL_STORAGE = 5 * 1024 * 1024 * 1024; // 5GB

  db.query(
    "SELECT COALESCE(SUM(file_size), 0) AS used FROM files WHERE user_id=$1 AND is_deleted=false",
    [req.userId],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Storage error" });
      }

      res.json({
        used: result.rows[0].used,
        total: TOTAL_STORAGE
      });
    }
  );
});

module.exports = router;
