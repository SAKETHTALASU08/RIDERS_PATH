import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

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
  GEMINI_API_KEY: z.string().optional(),
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

export const env = envConfig;
