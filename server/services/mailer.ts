import nodemailer from 'nodemailer';
import { env } from '../config/env';

export interface SendOtpOptions {
  toEmail: string;
  code: string;
  validityMinutes: number;
  expiresAt?: string;
}

export interface Mailer {
  sendOtpEmail(options: SendOtpOptions): Promise<void>;
}

/**
 * Standard plain-text and minimal HTML template.
 * Strictly avoids clickable links (anti-phishing) and tracking pixels.
 */
function buildOtpEmailContent(code: string, validityMinutes: number, configuredExpiry?: string) {
  const expiresAt = configuredExpiry
    ? new Date(configuredExpiry)
    : new Date(Date.now() + validityMinutes * 60 * 1000);
  const expiryLabel = `${expiresAt.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')} (${validityMinutes} minutes)`;
  const text = [
    `Your Riders Path verification code is: ${code}`,
    '',
    `This single-use code expires at ${expiryLabel}.`,
    '',
    "If you did not request this verification code, please ignore this email. No changes will be made to your account.",
    '',
    '— Riders Path Campus Fleet',
  ].join('\n');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Riders Path Verification Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; padding: 24px; margin: 0;">
  <div style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0;">
    <h2 style="margin-top: 0; color: #0f172a; font-size: 20px; font-weight: 700;">Riders Path Verification</h2>
    <p style="font-size: 14px; line-height: 1.5; color: #475569;">
      Use the verification code below to sign in to your campus student account.
    </p>
    <div style="margin: 28px 0; text-align: center;">
      <span style="display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #4338ca; background-color: #eef2ff; padding: 14px 28px; border-radius: 8px; font-family: monospace;">
        ${code}
      </span>
    </div>
    <p style="font-size: 13px; color: #64748b; line-height: 1.4;">
      This single-use code expires at <strong>${expiryLabel}</strong>.
    </p>
    <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
    <p style="font-size: 12px; color: #94a3b8; line-height: 1.4; margin-bottom: 0;">
      If you did not request this verification code, please ignore this email. No action is required and your account remains secure.
    </p>
  </div>
</body>
</html>
  `.trim();

  return { text, html };
}

/**
 * Production SMTP Mailer backed by Nodemailer
 */
export class NodemailerMailer implements Mailer {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST || 'localhost',
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
      // Timeout after 8 seconds to prevent hanging requests
      connectionTimeout: 8000,
    });
  }

  async sendOtpEmail(options: SendOtpOptions): Promise<void> {
    const { toEmail, code, validityMinutes, expiresAt } = options;
    const { text, html } = buildOtpEmailContent(code, validityMinutes, expiresAt);

    await this.transporter.sendMail({
      from: env.MAIL_FROM,
      to: toEmail,
      subject: 'Your Riders Path verification code',
      text,
      html,
    });
  }
}

/** Development-only local sender. Never selected in production. */
export class DevelopmentConsoleMailer implements Mailer {
  async sendOtpEmail({ toEmail, code, validityMinutes }: SendOtpOptions): Promise<void> {
    if (env.NODE_ENV === 'production') {
      throw new Error('Development OTP mailer is disabled in production');
    }
    console.log(`[DEV OTP] to=${toEmail} code=${code} expires_in_minutes=${validityMinutes}`);
  }
}

/**
 * Mock / Test Mailer for hermetic unit and integration testing
 */
export class MemoryTestMailer implements Mailer {
  public sentEmails: Array<SendOtpOptions & { sentAt: Date }> = [];

  async sendOtpEmail(options: SendOtpOptions): Promise<void> {
    this.sentEmails.push({
      ...options,
      sentAt: new Date(),
    });
  }

  clear() {
    this.sentEmails = [];
  }

  getLastEmailFor(email: string) {
    return [...this.sentEmails]
      .reverse()
      .find((e) => e.toEmail.toLowerCase() === email.toLowerCase());
  }
}

// A configured SMTP account is useful during local development too. Without
// it, development keeps OTPs local by writing them to the API terminal.
const hasSmtpConfiguration = Boolean(
  env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.MAIL_FROM
);

// Default system mailer instance (swappable at test runtime)
let activeMailer: Mailer =
  env.NODE_ENV === 'test'
    ? new MemoryTestMailer()
    : env.NODE_ENV === 'production' || hasSmtpConfiguration
      ? new NodemailerMailer()
      : new DevelopmentConsoleMailer();

export function getMailer(): Mailer {
  return activeMailer;
}

export function setMailer(mailer: Mailer): void {
  activeMailer = mailer;
}
