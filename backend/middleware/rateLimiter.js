import rateLimit from "express-rate-limit";

export default rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: "Too many login attempts. Try later."
});
