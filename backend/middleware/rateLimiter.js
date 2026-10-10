import rateLimit from "express-rate-limit";

// Rate limiter for login endpoint: 5 attempts per 15 minutes per IP
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again after 15 minutes."
  }
});

// Rate limiter for signup endpoint: 3 registrations per hour per IP
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many account registrations from this IP. Please try again later."
  }
});

// Rate limiter for password reset requests: 3 per hour per IP
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password reset requests. Please try again later."
  }
});

// Rate limiter for reset password execution: 5 attempts per 15 minutes per IP
export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password reset attempts. Please try again later."
  }
});

// Rate limiter for authenticated password changes: 5 attempts per 15 minutes
export const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password change attempts. Please try again later."
  }
});

// General API rate limiter: 100 requests per 15 minutes
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please slow down."
  }
});

// Rate limiter for share link creation: 20 per 15 minutes per IP
export const shareCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many share links created. Please try again later."
  }
});

// Rate limiter for public shared link access/resolving: 30 requests per minute per IP
export const shareAccessLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests to shared file. Please slow down."
  }
});

// Rate limiter for resend verification email: 3 requests per 15 minutes per IP
export const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification email requests. Please wait a few minutes before trying again."
  }
});

// Rate limiter for email verification attempts: 10 attempts per 15 minutes per IP
export const verifyEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification attempts. Please try again later."
  }
});

// Default export maintains backward compatibility
export default loginLimiter;

