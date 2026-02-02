const cron = require("node-cron");
const db = require("../config/db");
const fs = require("fs");
const path = require("path");

cron.schedule("0 0 * * *", () => {
  const limit = Date.now() - 2 * 24 * 60 * 60 * 1000;

  db.query(
    `SELECT id, stored_name FROM files WHERE is_deleted = true AND deleted_at < $1`,
    [limit],
    (err, result) => {
      if (err || !result.rows.length) return;

      result.rows.forEach(file => {
        const filePath = path.join(
          "uploads",
          "files",
          file.stored_name
        );

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        db.query("DELETE FROM files WHERE id = $1", [file.id]);
      });
    }
  );
});
