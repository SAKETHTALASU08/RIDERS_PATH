import rateLimit from 'express-rate-limit';

const isTest = () => process.env.NODE_ENV === 'test';

// Global baseline rate limiter for API
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTest,
  message: { error: 'Too many requests from this IP, please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
});

// Tight limiter for Authentication & OTP routes (prevents brute-force)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTest,
  message: { error: 'Too many authentication attempts. Please wait 15 minutes.', code: 'AUTH_RATE_LIMIT' },
});

// Abuse protection for booking creation
export const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTest,
  message: { error: 'Booking rate limit reached. Please wait before reserving again.', code: 'BOOKING_RATE_LIMIT' },
});

// Abuse protection for owner onboarding
export const ownerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTest,
  message: { error: 'Vehicle onboarding limit reached for this hour.', code: 'OWNER_RATE_LIMIT' },
});

// Gemini Vision OCR cost protection limiter
export const geminiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTest,
  message: { error: 'Document OCR quota exceeded for this hour.', code: 'OCR_RATE_LIMIT' },
});
