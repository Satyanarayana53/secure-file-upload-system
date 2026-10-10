import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";

import supabase from "./config/supabase.js";
import authRoutes from "./routes/authRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";

dotenv.config();

const app = express();

// 1. Strict Helmet Configuration with CSP
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", process.env.SUPABASE_URL || "*"],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// 2. Strict CORS allowlist
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server or curl/Postman requests without origin header in non-strict modes
      if (!origin) return callback(null, true);

      const normalizedOrigin = origin.trim().replace(/\/$/, "");
      if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes("*")) {
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
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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

checkConnection();

// 5. Health route
app.get("/", (req, res) => {
  res.json({ success: true, message: "Secure File Upload Backend Running" });
});

// 6. API routes
app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
