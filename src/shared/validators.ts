import { z } from 'zod';

/**
 * Shared Validator Module for Riders Path
 * Used consistently across frontend UI forms and backend route schemas.
 */

// Permissive placeholder regex until the institution provides its official format.
// Accepts 4-20 letters, digits, and hyphens; this is not an official format.
export const DEFAULT_ENROLLMENT_REGEX = '^[A-Za-z0-9-]{4,20}$';
export const DEFAULT_ENROLLMENT_EXAMPLE = 'ABCD-123 (placeholder)';

// Strict Indian 10-digit mobile number starting with 6, 7, 8, or 9
export const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

/**
 * Compiles an enrollment regex pattern safely with fallback to default placeholder
 */
export function getEnrollmentRegex(patternStr?: string): RegExp {
  try {
    if (patternStr) {
      return new RegExp(patternStr, 'i');
    }
  } catch (err) {
    console.warn('Invalid ENROLLMENT_FORMAT_REGEX provided, falling back to default:', err);
  }
  return new RegExp(DEFAULT_ENROLLMENT_REGEX, 'i');
}

/**
 * Validates an enrollment string against the configured pattern
 */
export function isValidEnrollment(enrollment: string, patternStr?: string): boolean {
  if (!enrollment || typeof enrollment !== 'string') return false;
  const regex = getEnrollmentRegex(patternStr);
  regex.lastIndex = 0;
  return regex.test(enrollment.trim());
}

/**
 * Validates a 10-digit Indian mobile number
 */
export function isValidIndianPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  // Clean spaces, hyphens, and +91 prefix
  const cleaned = phone.replace(/^(\+91|91|0)/, '').replace(/[\s-]/g, '');
  return INDIAN_PHONE_REGEX.test(cleaned);
}

/**
 * Normalizes an Indian phone number to 10 digits
 */
export function normalizeIndianPhone(phone: string): string {
  return phone.replace(/^(\+91|91|0)/, '').replace(/[\s-]/g, '');
}

/**
 * Factory for creating Zod enrollment schema with dynamic pattern
 */
export function createEnrollmentZodSchema(patternStr?: string, example = DEFAULT_ENROLLMENT_EXAMPLE) {
  const regex = getEnrollmentRegex(patternStr);
  return z
    .string()
    .trim()
    .min(1, 'Enrollment number is required')
    .transform((val) => val.toUpperCase())
    .refine((val) => {
      regex.lastIndex = 0;
      return regex.test(val);
    }, {
      message: `Invalid campus enrollment number format (Example: ${example})`,
    });
}

/**
 * Zod schema for Indian mobile phone numbers
 */
export const IndianPhoneSchema = z
  .string()
  .trim()
  .min(1, 'Mobile phone number is required')
  .transform(normalizeIndianPhone)
  .refine((val) => INDIAN_PHONE_REGEX.test(val), {
    message: 'Enter a valid 10-digit Indian mobile number (e.g. 9848012345)',
  });
