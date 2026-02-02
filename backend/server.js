const express = require("express");
const cors = require("cors");
require("dotenv").config();

require("./cron/cleanup");

const authRoutes = require("./routes/auth");
const uploadRoutes = require("./routes/upload");
const userRoutes = require("./routes/user");
const fileRoutes = require("./routes/files");
const storageRoutes = require("./routes/storage");

const app = express();

/* ✅ CORS FIX (MOST IMPORTANT) */
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

/* Body parser */
app.use(express.json());

/* Static files */
app.use("/uploads/profile", express.static("uploads/profile"));

/* Routes */
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/user", userRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/storage", storageRoutes);

/* Health check */
app.get("/", (req, res) => {
  res.send("SecureUpload API running successfully");
});

/* Global error handler */
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({ message: "Internal Server Error" });
});

/* Start server */
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
