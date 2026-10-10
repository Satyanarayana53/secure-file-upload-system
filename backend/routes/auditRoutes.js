import express from "express";
import { getAuditLogs } from "../controllers/auditController.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { apiLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// All audit log endpoints require authentication and standard rate limiting
router.use(authMiddleware);
router.use(apiLimiter);

router.get("/", getAuditLogs);

export default router;
