import express from 'express';
import {
  forgotPassword,
  getCurrentUser,
  login,
  removeProfileImage,
  resetPassword,
  signup,
  updateProfileImage
} from '../controllers/authController.js';
import authMiddleware from '../middleware/authMiddleware.js';
import rateLimiter from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', rateLimiter, login);
router.get('/me', authMiddleware, getCurrentUser);
router.put('/profile-image', authMiddleware, updateProfileImage);
router.delete('/profile-image', authMiddleware, removeProfileImage);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
