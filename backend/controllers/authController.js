import bcrypt from "bcrypt";
import Joi from "joi";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import supabase from "../config/supabase.js";

export const signup = async (req, res) => {
  const schema = Joi.object({
    username: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required()
  });

  const { error } = schema.validate(req.body);
  if (error) return res.status(400).json({ message: error.details[0].message });

  const { username, email, password } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);

  const { data, error: dbError } = await supabase
    .from("users")
    .insert([{ username, email, password_hash: hashedPassword }]);

  if (dbError) {
    if (dbError.code === '23505') { 
      return res.status(400).json({ message: "Username or email already exists" });
    }
    return res.status(400).json({ message: dbError.message });
  }

  res.json({ message: "User created successfully" });
};

export const login = async (req, res) => {
  const { identifier, password, rememberMe } = req.body;

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .or(`email.eq.${identifier},username.eq.${identifier}`)
    .single();

  if (!user) return res.status(400).json({ message: "User not found" });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(400).json({ message: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? "7d" : "1h" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      created_at: user.created_at,
      profile_image: user.profile_image
    }
  });
};

export const getCurrentUser = async (req, res) => {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, username, email, profile_image, created_at")
    .eq("id", req.user.id)
    .single();

  if (error || !user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({ user });
};

export const updateProfileImage = async (req, res) => {
  const { profileImage } = req.body;

  if (!profileImage) {
    return res.status(400).json({ message: "Profile image is required" });
  }

  const { data: user, error } = await supabase
    .from("users")
    .update({ profile_image: profileImage })
    .eq("id", req.user.id)
    .select("id, username, email, profile_image, created_at")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.json({ user });
};

export const removeProfileImage = async (req, res) => {
  const { data: user, error } = await supabase
    .from("users")
    .update({ profile_image: null })
    .eq("id", req.user.id)
    .select("id, username, email, profile_image, created_at")
    .single();

  if (error) return res.status(400).json({ message: error.message });
  res.json({ user });
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  // Check if email config exists
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ message: "Server email configuration missing" });
  }

  if (!email) return res.status(400).json({ message: "Email is required" });

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (!user) return res.status(404).json({ message: "User not found" });

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "15m" });

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const resetLink = `${frontendUrl}/reset-password/${token}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Password Reset Request",
    html: `<p>You requested a password reset.</p>
           <p>Click this link to reset your password: <a href="${resetLink}">${resetLink}</a></p>
           <p>This link expires in 15 minutes.</p>`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: "Password reset link sent to your email" });
  } catch (error) {
    console.error("Email send error:", error);
    res.status(500).json({ message: "Failed to send email" });
  }
};

export const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const { error } = await supabase
      .from("users")
      .update({ password_hash: hashedPassword })
      .eq("id", decoded.id);

    if (error) throw error;

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    res.status(400).json({ message: "Invalid or expired token" });
  }
};
