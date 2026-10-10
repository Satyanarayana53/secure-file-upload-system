import jwt from "jsonwebtoken";

export default (req, res, next) => {
  const tokenFromHeader = req.headers.authorization?.split(" ")[1];
  const tokenFromQuery = req.query?.token;
  const token = tokenFromHeader || tokenFromQuery;

  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or Expired Token" });
  }
};
