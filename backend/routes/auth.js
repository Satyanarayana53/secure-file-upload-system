const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db = require("../config/db");

const router = express.Router();

/* ================= OTP CONFIG ================= */
const OTP_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes
const OTP_RESEND_LIMIT = 3;
const OTP_RESEND_DELAY_MS = 60 * 1000;
const OTP_LOCK_TIME = 10 * 60 * 1000;

/* ================= EMAIL (GMAIL SMTP with App Password) ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // your Gmail address
    pass: process.env.EMAIL_PASS  // Gmail app password
  }
});

/* ================= REGISTER ================= */
router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const hashed = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const now = Date.now();

    await db.query(
      `INSERT INTO users
       (username, email, password, otp, otp_expiry, otp_resend_count, otp_last_sent)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        username,
        email,
        hashed,
        otp,
        now + OTP_EXPIRY_TIME,
        0,
        now
      ]
    );

    // Log OTP to server logs so you can see it in Render.
    console.log(`OTP for ${email}: ${otp}`);

    // Respond to client immediately so signup is fast.
    res.json({ message: "OTP generated and user created" });

    // Send email in background; log success or error.
    transporter
      .sendMail({
        from: `"SecureUpload" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "SecureUpload - Email Verification Code",
        text: `Hi ${username},\n\nYour SecureUpload verification code is ${otp}. It is valid for 5 minutes.\n\nIf you did not request this, you can safely ignore this email.\n\nBest regards,\nSecureUpload Team`,
        html: `
          <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #0f172a;">
            <h2 style="color:#0f172a;margin-bottom:8px;">SecureUpload Verification</h2>
            <p>Hi <strong>${username}</strong>,</p>
            <p>Your verification code is:</p>
            <p style="font-size:24px;font-weight:700;letter-spacing:4px;color:#2563eb;margin:16px 0;">${otp}</p>
            <p>This code is valid for <strong>5 minutes</strong>.</p>
            <p style="font-size:13px;color:#6b7280;">If you did not request this code, you can safely ignore this email.</p>
            <p style="margin-top:24px;">Best regards,<br/><strong>SecureUpload Team</strong></p>
          </div>
        `
      })
      .then(() => {
        console.log(`OTP email sent to ${email}`);
      })
      .catch((emailErr) => {
        console.error("EMAIL SEND ERROR (register):", emailErr);
      });

  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ message: "Email already exists" });
    }
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= VERIFY OTP ================= */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const now = Date.now();

    const result = await db.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ message: "Invalid request" });

    const user = result.rows[0];

    if (user.is_verified)
      return res.status(400).json({ message: "Already verified" });

    if (!user.otp || now > user.otp_expiry)
      return res.status(400).json({ message: "OTP expired" });

    if (user.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP" });

    await db.query(
      `UPDATE users SET
        is_verified = true,
        otp = NULL,
        otp_expiry = NULL,
        otp_resend_count = 0,
        otp_locked_until = NULL
       WHERE email = $1`,
      [email]
    );

    res.json({ message: "Email verified successfully" });

  } catch (err) {
    console.error("VERIFY OTP ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= RESEND OTP ================= */
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const now = Date.now();

    const result = await db.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ message: "User not found" });

    const user = result.rows[0];

    if (user.is_verified)
      return res.status(400).json({ message: "Email already verified" });

    if (user.otp_locked_until && now < user.otp_locked_until) {
      const wait = Math.ceil((user.otp_locked_until - now) / 1000);
      return res.status(429).json({ message: `Try again in ${wait}s` });
    }

    if (now - user.otp_last_sent < OTP_RESEND_DELAY_MS) {
      return res.status(429).json({ message: "Please wait before resending OTP" });
    }

    if (user.otp_resend_count >= OTP_RESEND_LIMIT) {
      await db.query(
        "UPDATE users SET otp_locked_until=$1 WHERE email=$2",
        [now + OTP_LOCK_TIME, email]
      );
      return res.status(429).json({ message: "OTP resend limit exceeded" });
    }

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

    await db.query(
      `UPDATE users SET
        otp=$1,
        otp_expiry=$2,
        otp_resend_count=otp_resend_count+1,
        otp_last_sent=$3
       WHERE email=$4`,
      [newOtp, now + OTP_EXPIRY_TIME, now, email]
    );

    await transporter.sendMail({
      from: `"SecureUpload" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "SecureUpload - New Verification Code",
      text: `Hi,\n\nYour new SecureUpload verification code is ${newOtp}. It is valid for 5 minutes.\n\nIf you did not request this, you can safely ignore this email.\n\nBest regards,\nSecureUpload Team`,
      html: `
        <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #0f172a;">
          <h2 style="color:#0f172a;margin-bottom:8px;">SecureUpload New Verification Code</h2>
          <p>Your new verification code is:</p>
          <p style="font-size:24px;font-weight:700;letter-spacing:4px;color:#2563eb;margin:16px 0;">${newOtp}</p>
          <p>This code is valid for <strong>5 minutes</strong>.</p>
          <p style="font-size:13px;color:#6b7280;">If you did not request this code, you can safely ignore this email.</p>
          <p style="margin-top:24px;">Best regards,<br/><strong>SecureUpload Team</strong></p>
        </div>
      `
    });

    res.json({ message: "OTP resent successfully" });

  } catch (err) {
    console.error("RESEND OTP ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= LOGIN ================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await db.query(
      "SELECT * FROM users WHERE email=$1",
      [email]
    );

    if (result.rows.length === 0)
      return res.status(400).json({ message: "Invalid email or password" });

    const user = result.rows[0];

    if (!user.is_verified)
      return res.status(400).json({ message: "Email not verified" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ token });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
