const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db = require("../config/db");

const router = express.Router();

/* ================= OTP CONFIG ================= */
const OTP_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes
const OTP_RESEND_LIMIT = 3;
const OTP_RESEND_COOLDOWN = 60 * 1000;
const OTP_LOCK_TIME = 10 * 60 * 1000;

/* ================= EMAIL (BREVO SMTP) ================= */
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,          // smtp-relay.brevo.com
  port: process.env.EMAIL_PORT,          // 587
  secure: false,                         // true only for 465
  auth: {
    user: process.env.EMAIL_USER,        // Brevo email
    pass: process.env.EMAIL_PASS         // Brevo SMTP KEY
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

    // Optional: send email in background (do not block response).
    transporter
      .sendMail({
        from: `"SecureUpload" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: "SecureUpload OTP Verification",
        text: `Your OTP is ${otp}. It is valid for 5 minutes.`
      })
      .then(() => {
        console.log(`OTP email queued for ${email}`);
      })
      .catch((emailErr) => {
        console.error("EMAIL SEND ERROR (register):", emailErr.message);
      });

    res.json({ message: "OTP generated and user created" });

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

    if (now - user.otp_last_sent < OTP_RESEND_COOLDOWN) {
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
      subject: "SecureUpload OTP Resend",
      text: `Your new OTP is ${newOtp}.`
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
