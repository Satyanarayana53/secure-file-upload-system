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

/* ================= BREVO SMTP CONFIG ================= */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_KEY,
  },
});

/* ================= TEST EMAIL ROUTE ================= */
router.get("/test-email", async (req, res) => {
  try {
    await transporter.sendMail({
      from: `"SecureUpload" <${process.env.SMTP_USER}>`,
      to: req.query.to || process.env.SMTP_USER,
      subject: "SecureUpload Test Email",
      text: "This is a test email from Brevo SMTP.",
    });

    console.log("✅ Test email sent");
    res.json({ message: "Test email sent successfully" });
  } catch (err) {
    console.error("❌ TEST EMAIL ERROR:", err.message);
    res.status(500).json({ error: err.message });
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
        now,
      ]
    );

    console.log(`OTP for ${email}: ${otp}`);

    // Send Email
    try {
      await transporter.sendMail({
        from: `"SecureUpload" <${process.env.SMTP_USER}>`,
        to: email,
        subject: "SecureUpload - Email Verification Code",
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
        `,
      });

      console.log("✅ OTP Email Sent");
    } catch (mailError) {
      console.error("❌ EMAIL SEND ERROR:", mailError.message);
    }

    res.json({ message: "OTP generated and email sent" });

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

    const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

    await db.query(
      `UPDATE users SET
        otp=$1,
        otp_expiry=$2,
        otp_last_sent=$3
       WHERE email=$4`,
      [newOtp, now + OTP_EXPIRY_TIME, now, email]
    );

    await transporter.sendMail({
      from: `"SecureUpload" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "SecureUpload - New OTP",
      html: `<h1>${newOtp}</h1><p>Valid for 5 minutes.</p>`,
    });

    res.json({ message: "OTP resent successfully" });

  } catch (err) {
    console.error("RESEND OTP ERROR:", err.message);
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
