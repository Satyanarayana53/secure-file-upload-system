const cron = require("node-cron");
const db = require("../config/db");
const fs = require("fs");
const path = require("path");

/*
  Runs every day at 12:00 AM
  Deletes files that are:
  - marked as deleted
  - older than 2 days
*/
cron.schedule("0 0 * * *", async () => {
  console.log("🧹 Cleanup cron started");

  const FILE_LIMIT = Date.now() - 2 * 24 * 60 * 60 * 1000; // 2 days
  const OTP_LIMIT = Date.now(); // expired OTPs

  try {
    /* ================= FILE CLEANUP ================= */
    const filesResult = await db.query(
      `SELECT id, stored_name 
       FROM files 
       WHERE is_deleted = true 
       AND deleted_at < $1`,
      [FILE_LIMIT]
    );

    for (const file of filesResult.rows) {
      const filePath = path.join(
        __dirname,
        "..",
        "uploads",
        "files",
        file.stored_name
      );

      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        console.log("🗑️ Deleted file:", file.stored_name);
      }

      await db.query(
        "DELETE FROM files WHERE id = $1",
        [file.id]
      );
    }

    /* ================= OTP CLEANUP ================= */
    await db.query(
      `UPDATE users 
       SET otp = NULL,
           otp_expiry = NULL
       WHERE otp_expiry IS NOT NULL
       AND otp_expiry < $1`,
      [OTP_LIMIT]
    );

    console.log("✅ Cleanup cron completed");

  } catch (err) {
    console.error("❌ Cleanup cron error:", err);
  }
});
