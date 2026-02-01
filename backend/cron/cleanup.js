const cron = require("node-cron");
const db = require("../config/db");
const fs = require("fs");
const path = require("path");

cron.schedule("0 0 * * *", () => {
  const limit = Date.now() - 2 * 24 * 60 * 60 * 1000;

  db.query(
    `SELECT id, stored_name FROM files WHERE is_deleted = 1 AND deleted_at < ?`,
    [limit],
    (err, files) => {
      if (err || !files.length) return;

      files.forEach(file => {
        const filePath = path.join(
          "uploads",
          "files",
          file.stored_name
        );

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        db.query("DELETE FROM files WHERE id = ?", [file.id]);
      });
    }
  );
});
