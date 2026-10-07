import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_PATH: z.string().default('./data/riders_path.db'),
  SESSION_SECRET: z.string().min(16).default('development_insecure_secret_at_least_16_chars_long'),
  ADMIN_USERNAME: z.string().min(3).default('admin'),
  // Salted bcrypt hash of default admin password (admin123!Safe) for development
  ADMIN_PASSWORD_HASH: z
    .string()
    .default('$2a$10$wE6O6Rkm3y1rV7YVp5QeEeZcK/25K4V5f0E4y39mO54kG8Fw6p3jS'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  ADMIN_CORS_ORIGIN: z.string().default('http://localhost:5174'),
  DOCUMENT_STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  DOCUMENT_ENCRYPTION_KEY: z.string().optional(),
  DOCUMENT_S3_BUCKET: z.string().optional(),
  DOCUMENT_S3_REGION: z.string().default('ap-south-1'),
  DOCUMENT_S3_ENDPOINT: z.string().optional(),
  DOCUMENT_S3_KMS_KEY_ID: z.string().optional(),
  DOCUMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  UNUSED_DOCUMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  REQUIRE_AADHAAR_UPLOAD: z.string().default('true').transform((value) => value.toLowerCase() === 'true'),
  DOCUMENT_CONSENT_VERSION: z.string().default('documents-2026-10-v1'),
  GEMINI_API_KEY: z.string().optional(),

  // Configure only with the actual campus domains. Empty means OTP is unavailable.
  ALLOWED_EMAIL_DOMAINS: z.string().optional(),

  // Enrollment Format Configuration
  ENROLLMENT_FORMAT_REGEX: z.string().default('^[A-Za-z0-9-]{4,20}$'),
  ENROLLMENT_FORMAT_EXAMPLE: z.string().default('ABCD-123 (placeholder)'),

  // OTP Security Controls
  OTP_HMAC_SECRET: z
    .string()
    .min(32, 'OTP_HMAC_SECRET must be at least 32 bytes (256 bits) for HMAC-SHA256')
    .refine((value) => Buffer.byteLength(value, 'utf8') >= 32, 'OTP_HMAC_SECRET must be at least 32 bytes'),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().positive().default(5),
  OTP_MAX_SENDS_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),

  // SMTP Dispatch Configuration
  SMTP_HOST: z.string().trim().default('').refine(
    (value) => !value || /^(?=.{1,253}$)[a-z0-9.-]+$/i.test(value),
    'SMTP_HOST must be a hostname or IPv4 address'
  ),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().trim().default(''),
  SMTP_PASS: z.string().default(''),
  MAIL_FROM: z.string().trim().default('').refine((value) => {
    if (!value) return true;
    const address = value.match(/<([^<>]+)>$/)?.[1] || value;
    return z.string().email().safeParse(address).success;
  }, 'MAIL_FROM must contain a valid email address'),
}).superRefine((config, ctx) => {
  if (config.NODE_ENV === 'production') {
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'] as const) {
      if (!config[key].trim()) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
      }
    }
    if (config.DOCUMENT_STORAGE_DRIVER !== 's3' || !config.DOCUMENT_S3_BUCKET) {
      ctx.addIssue({ code: 'custom', path: ['DOCUMENT_STORAGE_DRIVER'], message: 'Production document storage requires DOCUMENT_STORAGE_DRIVER=s3 and DOCUMENT_S3_BUCKET' });
    }
    if (config.DOCUMENT_STORAGE_DRIVER === 's3' && !config.DOCUMENT_S3_KMS_KEY_ID) {
      ctx.addIssue({ code: 'custom', path: ['DOCUMENT_S3_KMS_KEY_ID'], message: 'Production S3 document storage requires a KMS key id' });
    }
  }
  if (config.DOCUMENT_STORAGE_DRIVER === 'local' && config.NODE_ENV !== 'test') {
    if (!config.DOCUMENT_ENCRYPTION_KEY || Buffer.from(config.DOCUMENT_ENCRYPTION_KEY, 'base64').length !== 32) {
      ctx.addIssue({ code: 'custom', path: ['DOCUMENT_ENCRYPTION_KEY'], message: 'Local document storage requires a base64-encoded 32-byte DOCUMENT_ENCRYPTION_KEY' });
    }
  }

  try {
    // Check configuration at startup instead of silently accepting a broken pattern.
    new RegExp(config.ENROLLMENT_FORMAT_REGEX, 'i');
  } catch {
    ctx.addIssue({
      code: 'custom',
      path: ['ENROLLMENT_FORMAT_REGEX'],
      message: 'ENROLLMENT_FORMAT_REGEX must be a valid regular expression',
    });
  }

  const domains = (config.ALLOWED_EMAIL_DOMAINS || '').split(',').map((domain) => domain.trim()).filter(Boolean);
  for (const domain of domains) {
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ALLOWED_EMAIL_DOMAINS'],
        message: 'ALLOWED_EMAIL_DOMAINS must be a comma-separated list of domain names',
      });
      break;
    }
  }
});

export type EnvConfig = z.infer<typeof EnvSchema>;

let envConfig: EnvConfig;

try {
  envConfig = EnvSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('❌ Environment validation failed:', error.format());
  } else {
    console.error('❌ Environment validation failed:', error);
  }
  process.exit(1);
}

// Fail-closed startup warning if email domains are not configured
if (!envConfig.ALLOWED_EMAIL_DOMAINS || envConfig.ALLOWED_EMAIL_DOMAINS.trim() === '') {
  console.warn(
    '\n[SECURITY WARNING] ALLOWED_EMAIL_DOMAINS is unset or empty. Student OTP requests will fail closed until the real campus domain is configured.\n'
  );
}

export const env = envConfig;

/**
 * Returns list of allowed email domain suffixes in lowercase
 */
export function getAllowedEmailDomains(): string[] {
  if (!env.ALLOWED_EMAIL_DOMAINS) {
    return [];
  }
  return env.ALLOWED_EMAIL_DOMAINS.split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}
