import express from "express";
import {
  createShareLink,
  getMyShareLinks,
  revokeShareLink,
  resolvePublicShare,
  downloadPublicShare
} from "../controllers/shareController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import requireEmailVerified from "../middleware/verifiedMiddleware.js";
import { shareCreateLimiter, shareAccessLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// 1. Authenticated Owner Endpoints (Link creation strictly requires verified email)
router.post("/create", authMiddleware, requireEmailVerified, shareCreateLimiter, createShareLink);
router.get("/my-links", authMiddleware, getMyShareLinks);
router.put("/:id/revoke", authMiddleware, revokeShareLink);

// 2. Public Recipient Endpoints (Strictly rate-limited)
router.get("/public/:token", shareAccessLimiter, resolvePublicShare);
router.post("/public/:token/download", shareAccessLimiter, downloadPublicShare);

export default router;
