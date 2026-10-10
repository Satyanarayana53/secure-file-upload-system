import express from "express";
import {
  changePassword,
  forgotPassword,
  getCurrentUser,
  login,
  logout,
  removeProfileImage,
  resetPassword,
  signup,
  updateProfileImage
} from "../controllers/authController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  changePasswordLimiter,
  forgotPasswordLimiter,
  loginLimiter,
  resetPasswordLimiter,
  signupLimiter
} from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/signup", signupLimiter, signup);
router.post("/login", loginLimiter, login);
router.post("/logout", authMiddleware, logout);
router.get("/me", authMiddleware, getCurrentUser);
router.put("/profile-image", authMiddleware, updateProfileImage);
router.delete("/profile-image", authMiddleware, removeProfileImage);
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPassword);
router.post("/change-password", authMiddleware, changePasswordLimiter, changePassword);

export default router;
