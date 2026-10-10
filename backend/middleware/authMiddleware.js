import jwt from "jsonwebtoken";

export default (req, res, next) => {
  // Extract strictly from Authorization: Bearer <token>
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: "Authorization header required" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ success: false, message: "Invalid authorization format. Expected 'Bearer <token>'" });
  }

  const token = parts[1];
  if (!token) {
    return res.status(401).json({ success: false, message: "Token missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Validate required claims
    if (!decoded || !decoded.id) {
      return res.status(401).json({ success: false, message: "Invalid token claims" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(403).json({ success: false, message: "Token expired. Please login again." });
    }
    return res.status(403).json({ success: false, message: "Invalid or expired token" });
  }
};
