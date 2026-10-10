import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";

import supabase from "./config/supabase.js";
import authRoutes from "./routes/authRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import shareRoutes from "./routes/shareRoutes.js";

dotenv.config();

const app = express();

// Trust reverse proxy for accurate client IP in rate limiters and audit logs
app.set("trust proxy", process.env.TRUST_PROXY ? (process.env.TRUST_PROXY === "true" ? true : Number(process.env.TRUST_PROXY) || 1) : 1);

// 1. Strict Helmet Configuration with CSP and HSTS
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", ...(process.env.SUPABASE_URL ? [process.env.SUPABASE_URL] : [])],
        connectSrc: ["'self'", ...(process.env.SUPABASE_URL ? [process.env.SUPABASE_URL] : [])],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    hsts: process.env.NODE_ENV === "production" ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" }
  })
);

// 2. Strict CORS allowlist (disallows wildcard '*' when credentials: true)
const rawOrigins = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "http://localhost:3000";
const allowedOrigins = rawOrigins
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter((origin) => origin && origin !== "*");

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like local CLI, curl, or server-to-server)
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.trim().replace(/\/$/, "");
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400, // 24 hours preflight cache
  })
);

// 3. Request parsing with strict size limits
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// 4. Supabase DB connection health check
const checkConnection = async () => {
  try {
    const { error } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (error) {
      console.log("Supabase connection notice:", error.message);
    } else {
      console.log("Supabase connected successfully");
    }
  } catch (err) {
    console.log("Supabase check completed (offline or unreachable)");
  }
};

if (process.env.NODE_ENV !== "test") {
  checkConnection();
}

// 5. Operational health and monitoring routes
app.get(["/", "/health", "/api/health"], async (req, res) => {
  let dbStatus = "unreachable";
  try {
    const { error } = await supabase.from("users").select("id").limit(1);
    if (!error) dbStatus = "operational";
  } catch (e) {
    dbStatus = "unreachable";
  }

  const clamavConfigured = process.env.CLAMAV_ENABLED === "true";
  const isHealthy = dbStatus === "operational";

  res.status(isHealthy ? 200 : (dbStatus === "unreachable" ? 503 : 200)).json({
    status: isHealthy ? "healthy" : "degraded",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      antivirus: clamavConfigured ? "enabled" : "disabled"
    }
  });
});

// 6. API routes
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/share", shareRoutes);

// 7. Safe 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found"
  });
});

// 8. Safe production error handling without stack trace leakage
app.use((err, req, res, next) => {
  if (err.message && err.message.includes("CORS policy")) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: Origin not permitted"
    });
  }

  // Never leak error stack traces or internals to client
  const isDevelopment = process.env.NODE_ENV === "development";
  if (isDevelopment) {
    console.error("Development Error:", err);
  } else {
    console.error("Server Error [redacted in production]:", err.message);
  }

  res.status(500).json({
    success: false,
    message: "Internal Server Error"
  });
});

const PORT = process.env.PORT || 5000;

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
