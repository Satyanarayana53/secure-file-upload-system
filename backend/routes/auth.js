const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const db = require("../config/db");

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

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const hashed = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const now = Date.now();

    db.query(
      `INSERT INTO users 
       (username,email,password,otp,otp_expiry,otp_resend_count,otp_last_sent) 
       VALUES (?,?,?,?,?,?,?)`,
      [
        username,
        email,
        hashed,
        otp,
        now + OTP_EXPIRY_TIME,
        0,
        now
      ],
      async (err) => {
        if (err) {
          return res.status(400).json({ message: "Email already exists" });
        }

        await transporter.sendMail({
          to: email,
          subject: "SecureUpload OTP Verification",
          text: `Your OTP is ${otp}. It is valid for 5 minutes.`
        });

        res.json({ message: "OTP sent to email" });
      }
    );
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/verify", (req, res) => {
  const { email, otp } = req.body;
  const now = Date.now();

  db.query(
    "SELECT * FROM users WHERE email=?",
    [email],
    (err, result) => {
      if (!result.length)
        return res.status(400).json({ message: "Invalid request" });

      const user = result[0];

      if (user.is_verified)
        return res.status(400).json({ message: "Already verified" });

      if (now > user.otp_expiry)
        return res.status(400).json({ message: "OTP expired" });

      if (user.otp !== otp)
        return res.status(400).json({ message: "Invalid OTP" });

      db.query(
        `UPDATE users 
         SET is_verified=1, otp=NULL, otp_expiry=NULL,
             otp_resend_count=0, otp_locked_until=NULL
         WHERE email=?`,
        [email]
      );

      res.json({ message: "Email verified successfully" });
    }
  );
});

router.post("/resend-otp", (req, res) => {
  const { email } = req.body;
  const now = Date.now();

  db.query(
    "SELECT * FROM users WHERE email=?",
    [email],
    async (err, result) => {
      if (!result.length)
        return res.status(400).json({ message: "User not found" });

      const user = result[0];

      if (user.is_verified)
        return res.status(400).json({ message: "Email already verified" });

      if (user.otp_locked_until && now < user.otp_locked_until) {
        const wait = Math.ceil((user.otp_locked_until - now) / 1000);
        return res.status(429).json({
          message: `Too many requests. Try again in ${wait}s`
        });
      }

      if (now - user.otp_last_sent < OTP_RESEND_COOLDOWN) {
        const wait = Math.ceil(
          (OTP_RESEND_COOLDOWN - (now - user.otp_last_sent)) / 1000
        );
        return res.status(429).json({
          message: `Please wait ${wait}s before resending OTP`
        });
      }

      if (user.otp_resend_count >= OTP_RESEND_LIMIT) {
        const lockUntil = now + OTP_LOCK_TIME;

        db.query(
          "UPDATE users SET otp_locked_until=? WHERE email=?",
          [lockUntil, email]
        );

        return res.status(429).json({
          message: "OTP resend limit exceeded. Try again later."
        });
      }

      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();

      db.query(
        `UPDATE users 
         SET otp=?, 
             otp_expiry=?, 
             otp_resend_count=otp_resend_count+1,
             otp_last_sent=? 
         WHERE email=?`,
        [newOtp, now + OTP_EXPIRY_TIME, now, email]
      );

      await transporter.sendMail({
        to: email,
        subject: "SecureUpload OTP Resend",
        text: `Your new OTP is ${newOtp}. Valid for 5 minutes.`
      });

      res.json({ message: "OTP resent successfully" });
    }
  );
});

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.query("SELECT * FROM users WHERE email=?", [email], async (err, result) => {
    if (!result.length)
      return res.status(400).json({ message: "Invalid email or password" });

    const user = result[0];

    if (!user.is_verified)
      return res.status(400).json({ message: "Email not verified" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid email or password" });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1h"
    });

    res.json({ token });
  });
});

module.exports = router;