const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Resend } = require("resend");
const db = require("../config/db");

const router = express.Router();

/* ================= OTP CONFIG ================= */
const OTP_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes
const OTP_RESEND_LIMIT = 3;
const OTP_RESEND_DELAY_MS = 60 * 1000;
const OTP_LOCK_TIME = 10 * 60 * 1000;

/* ================= RESEND CONFIG ================= */
const resend = new Resend(process.env.RESEND_API_KEY);

/* ================= TEST EMAIL ROUTE ================= */
router.get("/test-email", async (req, res) => {
  try {
    const data = await resend.emails.send({
      from: "onboarding@resend.dev",
      to: "pillabalu1@gmail.com",
      subject: "SecureUpload Test",
      html: "<strong>Resend is working 🚀</strong>",
    });

    console.log(data);
    res.json({ message: "Email sent successfully" });
  } catch (err) {
    console.error("RESEND ERROR:", err);
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
      await resend.emails.send({
        from: "onboarding@resend.dev",
        to: email,
        subject: "SecureUpload - Email Verification Code",
        html: `
    <div style="font-family: Arial; line-height:1.6;">
      <h2>SecureUpload Verification</h2>
      <p>Your OTP is:</p>
      <h1 style="letter-spacing:4px;">${otp}</h1>
      <p>Valid for 5 minutes.</p>
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

    await resend.emails.send({
      from: "onboarding@resend.dev",
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
