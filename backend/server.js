import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";

import supabase from "./config/supabase.js";
import authRoutes from "./routes/authRoutes.js";
import fileRoutes from "./routes/fileRoutes.js";

dotenv.config();

const app = express();

app.use(helmet()); 
app.use(cors());   
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const checkConnection = async () => {
  try {
    const { error } = await supabase
      .from("users")
      .select("id")
      .limit(1);

    if (error) {
      console.log("Supabase connection failed:", error.message);
    } else {
      console.log("Supabase connected successfully");
    }
  } catch (err) {
    console.log("Unexpected DB error:", err.message);
  }
};

checkConnection();


app.get("/", (req, res) => {
  res.json({ message: "Secure File Upload Backend Running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/files", fileRoutes);


app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  res.status(500).json({
    success: false,
    message: "Internal Server Error"
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
