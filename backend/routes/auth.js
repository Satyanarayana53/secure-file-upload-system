const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db = require("../config/db"); // pg Pool

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const OTP_EXPIRY_TIME = 5 * 60 * 1000;
const OTP_RESEND_LIMIT = 3;
const OTP_RESEND_COOLDOWN = 60 * 1000;
const OTP_LOCK_TIME = 10 * 60 * 1000;

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

    await transporter.sendMail({
      to: email,
      subject: "SecureUpload OTP Verification",
      text: `Your OTP is ${otp}. It is valid for 5 minutes.`
    });

    res.json({ message: "OTP sent to email" });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ message: "Email already exists" });
    }
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================= VERIFY OTP ================= */
router.post("/verify", async (req, res) => {
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

  if (now > user.otp_expiry)
    return res.status(400).json({ message: "OTP expired" });

  if (user.otp !== otp)
    return res.status(400).json({ message: "Invalid OTP" });

  await db.query(
    `UPDATE users SET 
      is_verified=true,
      otp=NULL,
      otp_expiry=NULL,
      otp_resend_count=0,
      otp_locked_until=NULL
     WHERE email=$1`,
    [email]
  );

  res.json({ message: "Email verified successfully" });
});

/* ================= RESEND OTP ================= */
router.post("/resend-otp", async (req, res) => {
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
    to: email,
    subject: "SecureUpload OTP Resend",
    text: `Your new OTP is ${newOtp}.`
  });

  res.json({ message: "OTP resent successfully" });
});

/* ================= LOGIN ================= */
router.post("/login", async (req, res) => {
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
});

module.exports = router;
