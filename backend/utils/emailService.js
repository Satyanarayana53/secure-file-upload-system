import nodemailer from "nodemailer";

/**
 * Creates a Nodemailer transporter instance if credentials exist
 */
const getEmailConfig = () => {
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.EMAIL_PORT || process.env.SMTP_PORT) || 587;
  const from = process.env.EMAIL_FROM || process.env.SMTP_FROM || user;
  return { user, pass, host, port, from };
};

const getTransporter = () => {
  const { user, pass, host, port } = getEmailConfig();
  if (!user || !pass) {
    return null;
  }

  // Support custom SMTP host/port if configured, otherwise default to Gmail
  if (host) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass }
  });
};

/**
 * Dispatches an email verification link to a user.
 * Tokens and complete URLs are NEVER printed to server logs.
 */
export const sendVerificationEmail = async ({ toEmail, username, rawToken }) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const verificationLink = `${frontendUrl}/verify-email/${rawToken}`;
  const transporter = getTransporter();

  if (!transporter) {
    // Non-sensitive logging: token and full URL omitted
    console.info(`[EmailService] Verification email prepared for ${toEmail} (SMTP credentials not configured, outbound delivery skipped).`);
    return { sent: false, reason: "smtp_not_configured" };
  }

  const { from } = getEmailConfig();
  const mailOptions = {
    from: from || process.env.EMAIL_USER,
    to: toEmail,
    subject: "Secure Upload - Verify Your Email Address",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e293b; margin-top: 0;">Verify Your Email Address</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">
          Hello ${username ? `<strong>${username}</strong>` : "there"},
        </p>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">
          Thank you for creating an account on Secure Upload. Please verify your email address to unlock public link sharing and complete your security profile.
        </p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${verificationLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.4;">
          This single-use verification link will expire in 24 hours. If you did not create an account on Secure Upload, you can safely ignore this email.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { sent: true };
  } catch (err) {
    console.error(`[EmailService] Outbound verification email delivery failed for recipient.`);
    return { sent: false, error: err.message };
  }
};

/**
 * Dispatches a password reset link to a user.
 * Tokens and complete URLs are NEVER printed to server logs.
 */
export const sendPasswordResetEmail = async ({ toEmail, rawToken }) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  const resetLink = `${frontendUrl}/reset-password/${rawToken}`;
  const transporter = getTransporter();

  if (!transporter) {
    console.info(`[EmailService] Password reset prepared for ${toEmail} (SMTP credentials not configured, outbound delivery skipped).`);
    return { sent: false, reason: "smtp_not_configured" };
  }

  const { from } = getEmailConfig();
  const mailOptions = {
    from: from || process.env.EMAIL_USER,
    to: toEmail,
    subject: "Secure Upload - Password Reset Request",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #1e293b; margin-top: 0;">Password Reset Request</h2>
        <p style="color: #475569; font-size: 15px; line-height: 1.5;">
          You requested a password reset for your Secure Upload account.
        </p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${resetLink}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.4;">
          This single-use link expires in 15 minutes. If you did not request this, please disregard this email.
        </p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    return { sent: true };
  } catch (err) {
    console.error(`[EmailService] Outbound password reset delivery failed for recipient.`);
    return { sent: false, error: err.message };
  }
};
