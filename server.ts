import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { z } from 'zod';
import sharp from 'sharp';
import { env, getAllowedEmailDomains } from './server/config/env';
import { db, runMigrations, sqlite } from './server/db';
import {
  requireUser,
  requireAdmin,
  requireEmailVerified,
  requireProfileComplete,
  verifyCsrfOrigin,
  STUDENT_SESSION_COOKIE,
  STUDENT_SESSION_COOKIE_OPTIONS,
  STUDENT_SESSION_COOKIE_CLEAR_OPTIONS,
  ADMIN_SESSION_COOKIE,
  CSRF_COOKIE,
  ADMIN_CSRF_COOKIE,
  getAllowedStudentOrigins,
  getAllowedAdminOrigins,
  isOriginAllowed,
} from './server/middleware/auth';
import {
  globalLimiter,
  authLimiter,
  bookingLimiter,
  ownerLimiter,
  geminiLimiter,
} from './server/middleware/rateLimit';
import { documentUpload, detectDocumentMime, detectImageMime } from './server/middleware/upload';
import { createShortLivedDocumentUrl, deletePrivateDocument, readPrivateDocument, storePrivateDocument } from './server/services/privateDocumentStorage';
import { purgeExpiredDocuments } from './server/services/documentRetention';
import { verifyDocumentWithGemini } from './server/gemini';
import { getMailer } from './server/services/mailer';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  createProfileCompletionSchema,
  createManualVerificationRequestSchema,
  BookingCreateSchema,
  BookingResponseSchema,
  OwnerOnboardingSchema,
  PublicBikeDtoSchema,
  PricingBreakdownSchema,
} from './packages/shared/src/contract';
import { PLATFORM_CONFIG } from './packages/shared/src/platform.config';

// Initialize Database Schema & Seed Data
runMigrations();

export const app = express();

// Trust proxy for secure cookies & accurate IP extraction behind Netlify / reverse proxies
app.set('trust proxy', 1);

// ----------------------------------------------------
// CORE SECURITY MIDDLEWARE
// ----------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https://images.unsplash.com', 'blob:'],
        connectSrc: ["'self'", ...getAllowedStudentOrigins(), ...getAllowedAdminOrigins()],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use((req, res, next) => {
  const adminEndpoint = req.path.startsWith('/api/admin/');
  const allowedOrigins = adminEndpoint ? getAllowedAdminOrigins() : getAllowedStudentOrigins();
  cors({
    origin: (origin, callback) => {
      if (!origin || isOriginAllowed(origin, allowedOrigins)) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
  })(req, res, next);
});

app.use(cookieParser(env.SESSION_SECRET));

// Standard 100kb body limit to prevent memory exhaustion DoS attacks
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Apply CSRF origin verification on state-changing requests
app.use(verifyCsrfOrigin);

// Global baseline rate limiting
app.use('/api', globalLimiter);

// ----------------------------------------------------
// BACKGROUND CLEANUP: AUTO-EXPIRE UNCONFIRMED PENDING BOOKINGS
// ----------------------------------------------------
setInterval(() => {
  try {
    const expiredCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    sqlite
      .prepare(`
        UPDATE bookings
        SET booking_status = 'CANCELLED', cancellation_reason = 'Auto-expired: 30-minute verification window lapsed', updated_at = ?
        WHERE booking_status = 'PENDING_VERIFICATION' AND created_at < ?
      `)
      .run(new Date().toISOString(), expiredCutoff);
  } catch (err) {
    console.error('Scheduled booking expiration error:', err);
  }
}, 5 * 60 * 1000);

const documentCleanupTimer = setInterval(() => { void purgeExpiredDocuments(); }, 60 * 60 * 1000);
documentCleanupTimer.unref?.();
void purgeExpiredDocuments();

// ----------------------------------------------------
// PUBLIC CONFIG & HEALTH ROUTES
// ----------------------------------------------------
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Riders Path Secure API', time: new Date().toISOString() });
});

// Double-submit CSRF token: the browser keeps the cookie and echoes its value
// in a request header. The token is not an authentication credential.
app.get('/api/csrf-token', (_req: Request, res: Response) => {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  res.json({ csrfToken });
});
app.get('/api/admin/csrf-token', (_req: Request, res: Response) => {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  res.cookie(ADMIN_CSRF_COOKIE, csrfToken, { httpOnly: false, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
  res.json({ csrfToken });
});

// Explicit allowlist public config (never leaks secrets or internal hashes)
app.get('/api/config', (_req: Request, res: Response) => {
  const allowedEmailDomains = getAllowedEmailDomains();
  res.json({
    appName: PLATFORM_CONFIG.appName,
    campusName: PLATFORM_CONFIG.campusName,
    allowedEmailDomain: allowedEmailDomains[0] || null,
    allowedEmailDomains,
    enrollmentFormatRegex: env.ENROLLMENT_FORMAT_REGEX,
    enrollmentFormatExample: env.ENROLLMENT_FORMAT_EXAMPLE,
    termsVersion: PLATFORM_CONFIG.termsVersion,
    privacyVersion: PLATFORM_CONFIG.privacyVersion,
    requireAadhaarUpload: env.REQUIRE_AADHAAR_UPLOAD,
    documentConsentVersion: env.DOCUMENT_CONSENT_VERSION,
    depositPolicy: PLATFORM_CONFIG.depositPolicy,
    hubs: PLATFORM_CONFIG.hubs,
    safetyRules: PLATFORM_CONFIG.safetyRules,
  });
});

app.put('/api/config', requireAdmin, (req: Request, res: Response) => {
  const allowedKeys = ['termsVersion', 'privacyVersion', 'depositPolicy', 'safetyRules'];
  const sanitizedUpdates: Record<string, any> = {};
  for (const k of allowedKeys) {
    if (req.body[k] !== undefined) {
      sanitizedUpdates[k] = req.body[k];
    }
  }

  const updated = db.updateConfig(sanitizedUpdates);
  db.logAudit({
    actorId: req.admin!.id,
    actorRole: 'admin',
    action: 'UPDATE_CONFIG',
    targetType: 'config',
    targetId: 'platform_config',
    diff: sanitizedUpdates,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json(updated ? BookingResponseSchema.parse(updated) : null);
});

// ----------------------------------------------------
// AUTHENTICATION ROUTES (STUDENT PASSWORDLESS OTP)
// ----------------------------------------------------

/**
 * Computes deterministic HMAC-SHA256 of normalized email + code
 */
function computeOtpHmac(email: string, code: string): string {
  return crypto
    .createHmac('sha256', env.OTP_HMAC_SECRET)
    .update(`${email.trim().toLowerCase()}:${code.trim()}`)
    .digest('hex');
}

const GENERIC_OTP_REQUEST_MESSAGE = 'If this is a valid email address, a verification code has been dispatched.';
const OTP_REQUEST_MIN_RESPONSE_MS = 500;

async function keepOtpRequestTimingSimilar(startedAt: number) {
  const remaining = OTP_REQUEST_MIN_RESPONSE_MS - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

function toUserProfile(user: any) {
  return {
    id: user.id,
    name: user.full_name || '',
    email: user.email,
    phone: user.phone || '',
    enrollmentNumber: user.icfai_enrollment || '',
    course: user.course || '',
    year: user.academic_year || '1st Year',
    isVerified: user.verification_status === 'verified',
    emailVerified: Boolean(user.email_verified),
    profileComplete: Boolean(user.profile_complete),
    drivingLicenceVerified: Boolean(user.driving_licence_verified),
    studentIdVerified: false,
    createdAt: user.created_at,
  };
}

app.post('/api/auth/otp/request', async (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();
  try {
    const parseResult = OtpRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Please enter a valid email address',
        code: 'INVALID_EMAIL',
      });
    }

    const { email } = parseResult.data;
    const normalizedEmail = email.trim().toLowerCase();
    const emailHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex').substring(0, 16);
    db.logAudit({
      actorId: emailHash,
      actorRole: 'student',
      action: 'OTP_REQUESTED',
      targetType: 'auth',
      targetId: emailHash,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    const clientIp = req.ip || '127.0.0.1';
    const reservation = db.reserveOtpSend(normalizedEmail, clientIp, {
      cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      maxPerEmailPerHour: env.OTP_MAX_SENDS_PER_HOUR,
      maxPerIpPerHour: env.OTP_MAX_SENDS_PER_IP_PER_HOUR,
    });
    if (!reservation.allowed) {
      await keepOtpRequestTimingSimilar(startedAt);
      return res.status(429).json({
        error: 'Too many verification requests. Please try again later.',
        code: 'OTP_RATE_LIMITED',
        cooldownSeconds: reservation.retryAfterSeconds,
        retryAfterSeconds: reservation.retryAfterSeconds,
      });
    }

    // 4. Generate random 6-digit numeric OTP and compute HMAC
    const code = `${crypto.randomInt(100000, 1000000)}`;
    const codeHash = computeOtpHmac(normalizedEmail, code);

    // 5. Invalidate any earlier unused code for this email
    db.invalidateEarlierOtpCodes(normalizedEmail);

    // The send log was reserved atomically before dispatch for durable rate limiting.
    const otpRecord = db.storeOtp(normalizedEmail, codeHash, env.OTP_TTL_MINUTES, 'PENDING');

    // Keep SMTP latency out of the response path. The code cannot be verified until
    // delivery succeeds, and a failed delivery removes the pending record.
    void Promise.resolve()
      .then(() => getMailer().sendOtpEmail({
        toEmail: normalizedEmail,
        code,
        validityMinutes: env.OTP_TTL_MINUTES,
        expiresAt: otpRecord.expiresAt,
      }))
      .then(() => db.markOtpReady(otpRecord.id))
      .catch((err) => {
        console.error('[OTP MAILER ERROR]', err);
        db.deleteOtp(otpRecord.id);
      });

    await keepOtpRequestTimingSimilar(startedAt);
    res.json({
      success: true,
      message: GENERIC_OTP_REQUEST_MESSAGE,
      cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    });
  } catch (err) {
    console.error('[OTP REQUEST EXCEPTION]', err);
    next(err);
  }
});

app.post('/api/auth/otp/verify', authLimiter, (req: Request, res: Response) => {
  const parseResult = OtpVerifySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid verification payload. A 6-digit code is required.',
      code: 'INVALID_PAYLOAD',
    });
  }

  const { email, code } = parseResult.data;
  const normalizedEmail = email.trim().toLowerCase();
  const emailHash = crypto.createHash('sha256').update(normalizedEmail).digest('hex').substring(0, 16);

  // 1. Look up active code
  const activeOtp = db.getActiveOtp(normalizedEmail);
  if (!activeOtp) {
    const latestOtp = db.getLatestOtp(normalizedEmail);
    if (latestOtp && latestOtp.attempts >= env.OTP_MAX_ATTEMPTS && new Date(latestOtp.expires_at) > new Date()) {
      db.logAudit({
        actorId: emailHash,
        actorRole: 'student',
        action: 'OTP_LOCKOUT',
        targetType: 'auth',
        targetId: emailHash,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
      return res.status(400).json({
        error: 'Verification code has been invalidated due to too many failed attempts. Please request a new code.',
        code: 'OTP_LOCKED_OUT',
      });
    }

    const wasExpired = latestOtp && new Date(latestOtp.expires_at).getTime() <= Date.now();

    db.logAudit({
      actorId: emailHash,
      actorRole: 'student',
      action: 'OTP_VERIFY_FAILURE',
      targetType: 'auth',
      targetId: wasExpired ? 'expired' : 'inactive_or_expired',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.status(400).json({
      error: wasExpired
        ? 'This verification code has expired. Please request a new code.'
        : 'Invalid verification code. Please check it and try again.',
      code: wasExpired ? 'OTP_EXPIRED' : 'INVALID_OTP',
    });
  }

  // 2. Constant-time comparison
  const expectedHash = computeOtpHmac(normalizedEmail, code);
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  const actualBuf = Buffer.from(activeOtp.code_hash, 'hex');
  const isMatch = expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
  // 3. Serialize attempts and single-use consumption so concurrent requests
  // cannot both succeed or bypass the attempt limit.
  const verification = db.applyOtpVerification(activeOtp.id, isMatch, env.OTP_MAX_ATTEMPTS);
  if (verification.status === 'locked') {
    db.logAudit({
      actorId: emailHash,
      actorRole: 'student',
      action: 'OTP_LOCKOUT',
      targetType: 'auth',
      targetId: emailHash,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.status(400).json({
      error: 'Verification code has been invalidated due to too many failed attempts. Please request a new code.',
      code: 'OTP_LOCKED_OUT',
    });
  }

  if (verification.status === 'failed') {
    db.logAudit({
      actorId: emailHash,
      actorRole: 'student',
      action: 'OTP_VERIFY_FAILURE',
      targetType: 'auth',
      targetId: emailHash,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(400).json({
      error: 'Incorrect verification code. Please try again.',
      attemptsRemaining: env.OTP_MAX_ATTEMPTS - verification.attempts,
      code: 'INVALID_OTP',
    });
  }

  if (verification.status === 'inactive') {
    db.logAudit({
      actorId: emailHash,
      actorRole: 'student',
      action: 'OTP_VERIFY_FAILURE',
      targetType: 'auth',
      targetId: 'inactive_or_expired',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.status(400).json({
      error: 'Invalid or expired verification code. Please request a new code.',
      code: 'INVALID_OTP',
    });
  }

  // 4. Find or create user with emailVerified = true, profileComplete = false
  let user = db.getUserByEmail(normalizedEmail);
  if (user && user.role !== 'student' && user.role !== 'owner') {
    db.logAudit({
      actorId: emailHash,
      actorRole: 'student',
      action: 'OTP_VERIFY_FAILURE',
      targetType: 'auth',
      targetId: emailHash,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return res.status(400).json({
      error: 'Invalid or expired verification code. Please request a new code.',
      code: 'INVALID_OTP',
    });
  }
  if (!user) {
    user = db.createUser({
      email: normalizedEmail,
      emailVerified: 1,
      profileComplete: 0,
      role: 'student',
      verificationStatus: 'unverified',
    });
  } else {
    db.updateUser(user.id, { emailVerified: 1 });
    user = db.getUserById(user.id)!;
  }

  // 5. Session rotation: invalidate pre-login session if present, issue fresh 256-bit token
  const previousToken = req.cookies?.[STUDENT_SESSION_COOKIE];
  if (previousToken) {
    db.deleteSession(previousToken);
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  db.createSession(rawToken, user.id, user.role, 24 * 7, req.ip, req.headers['user-agent']);

  res.cookie(STUDENT_SESSION_COOKIE, rawToken, STUDENT_SESSION_COOKIE_OPTIONS);

  db.logAudit({
    actorId: user.id,
    actorRole: 'student',
    action: 'OTP_VERIFY_SUCCESS',
    targetType: 'auth',
    targetId: user.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // 6. Return only contract user shape (NO tokens in body)
  res.json({
    requiresProfileCompletion: !user.profile_complete,
    user: toUserProfile(user),
  });
});

app.get('/api/auth/me', requireUser, (req: Request, res: Response) => {
  res.json(toUserProfile(db.getUserById(req.user!.id)));
});

// Profile completion controller.
const handleProfileUpdate = (req: Request, res: Response) => {
  const parseResult = createProfileCompletionSchema(
    env.ENROLLMENT_FORMAT_REGEX,
    env.ENROLLMENT_FORMAT_EXAMPLE
  ).safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten().fieldErrors,
      code: 'VALIDATION_FAILED',
    });
  }

  const data = parseResult.data;

  // Ensure enrollment number is unique across users (non-leaking error message)
  const normalizedEnrollment = data.enrollmentNumber.trim().toUpperCase();
  const existing = db.getUserByEnrollment(normalizedEnrollment);
  if (existing && existing.id !== req.user!.id) {
    return res.status(409).json({
      error: 'This enrollment number is already registered in the system. If this is an error, please submit a manual verification request.',
      code: 'ENROLLMENT_CONFLICT',
    });
  }

  let updated;
  try {
    updated = db.updateUser(req.user!.id, {
      fullName: data.name.trim(),
      phone: data.phone,
      course: data.course.trim(),
      academicYear: data.year,
      icfaiEnrollment: normalizedEnrollment,
      profileComplete: 1,
    });
  } catch (error: any) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({
        error: 'This enrollment number is already registered. If this is an error, submit a manual verification request.',
        code: 'ENROLLMENT_CONFLICT',
      });
    }
    throw error;
  }

  db.logAudit({
    actorId: req.user!.id,
    actorRole: 'student',
    action: 'COMPLETE_PROFILE',
    targetType: 'user',
    targetId: req.user!.id,
    diff: { name: data.name, course: data.course, year: data.year },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json(toUserProfile(updated));
};

app.put('/api/users/me/profile', requireUser, requireEmailVerified, handleProfileUpdate);

app.post('/api/auth/manual-verification-request', authLimiter, (req: Request, res: Response) => {
  const parseResult = createManualVerificationRequestSchema(
    env.ENROLLMENT_FORMAT_REGEX,
    env.ENROLLMENT_FORMAT_EXAMPLE
  ).safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation failed for manual verification request',
      details: parseResult.error.flatten().fieldErrors,
      code: 'VALIDATION_FAILED',
    });
  }

  const data = parseResult.data;

  const created = db.createManualVerificationRequest(data);

  db.logAudit({
    actorId: crypto.createHash('sha256').update(data.alternateEmail.toLowerCase()).digest('hex').substring(0, 16),
    actorRole: 'student',
    action: 'MANUAL_VERIFICATION_REQUESTED',
    targetType: 'verification',
    targetId: created.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Never auto-approve and do not issue a session
  res.status(201).json({
    success: true,
    message: 'Your verification request has been received. A campus coordinator will review your documents manually.',
    requestId: created.id,
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  let token = req.cookies?.[STUDENT_SESSION_COOKIE];
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  const session = token ? db.getSession(token) : null;
  if (token) {
    db.deleteSession(token);
  }
  res.clearCookie(STUDENT_SESSION_COOKIE, STUDENT_SESSION_COOKIE_CLEAR_OPTIONS);

  db.logAudit({
    actorId: session?.user_id || 'student',
    actorRole: 'student',
    action: 'LOGOUT',
    targetType: 'auth',
    targetId: 'session',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'Logged out successfully' });
});

// ----------------------------------------------------
// AUTHENTICATION ROUTES (ADMINISTRATION)
// ----------------------------------------------------
app.post('/api/admin/login', authLimiter, (req: Request, res: Response) => {
  const { password, username } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const isValid = db.verifyAdminPassword(password);
  if (!isValid || (username && username !== env.ADMIN_USERNAME)) {
    return res.status(401).json({ error: 'Invalid administrative credentials' });
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  db.createSession(rawToken, 'usr_system_admin', 'admin', 24, req.ip, req.headers['user-agent']);

  res.cookie(ADMIN_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });

  db.logAudit({
    actorId: 'admin',
    actorRole: 'admin',
    action: 'ADMIN_LOGIN_SUCCESS',
    targetType: 'auth',
    targetId: 'admin',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({ success: true, message: 'Admin authenticated successfully' });
});

app.post('/api/admin/logout', requireAdmin, (req: Request, res: Response) => {
  if (req.rawSessionToken) {
    db.deleteSession(req.rawSessionToken);
  }
  res.clearCookie(ADMIN_SESSION_COOKIE, { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
  res.json({ success: true, message: 'Admin session closed' });
});

// ----------------------------------------------------
// BIKES CATALOG & AVAILABILITY ROUTES
// ----------------------------------------------------
app.get('/api/favorites', requireUser, (req: Request, res: Response) => {
  const rows = sqlite.prepare('SELECT bike_id FROM bike_favorites WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user!.id) as Array<{ bike_id: string }>;
  res.json(rows.map((row) => row.bike_id));
});

app.put('/api/favorites/:bikeId', requireUser, (req: Request, res: Response) => {
  const bike = db.getBikeById(req.params.bikeId);
  if (!bike || bike.approvalStatus !== 'APPROVED' || bike.availabilityStatus !== 'AVAILABLE') {
    return res.status(404).json({ error: 'Bike not found in the public catalog.' });
  }
  sqlite.prepare('INSERT OR IGNORE INTO bike_favorites (user_id, bike_id, created_at) VALUES (?, ?, ?)')
    .run(req.user!.id, bike.id, new Date().toISOString());
  res.json({ success: true });
});

app.delete('/api/favorites/:bikeId', requireUser, (req: Request, res: Response) => {
  sqlite.prepare('DELETE FROM bike_favorites WHERE user_id = ? AND bike_id = ?').run(req.user!.id, req.params.bikeId);
  res.json({ success: true });
});

// Public endpoint maps strictly through PublicBikeDtoSchema (strips all owner PII)
app.get('/api/bikes', (req: Request, res: Response) => {
  const { q, bikeType, fuelType, hubId, maxHourlyRate, sortBy } = req.query;

  const bikes = db.getBikes({
    search: typeof q === 'string' ? q : undefined,
    bikeType: typeof bikeType === 'string' ? bikeType : undefined,
    fuelType: typeof fuelType === 'string' ? fuelType : undefined,
    hubId: typeof hubId === 'string' ? hubId : undefined,
    maxPrice: maxHourlyRate ? Number(maxHourlyRate) : undefined,
    onlyActive: true,
    onlyApproved: true,
  });

  // Map to Public Bike DTO explicitly stripping owner phone, owner enrollment, and owner course
  const publicList = bikes.map((b) => ({
    id: b.id,
    brand: b.brand,
    model: b.model,
    year: b.year,
    bikeType: b.bikeType,
    fuelType: b.fuelType,
    transmission: b.transmission,
    hourlyRateInr: b.hourlyRateInr,
    dailyRateInr: b.dailyRateInr,
    hubId: b.hubId,
    hubName: b.hubName,
    images: b.images,
    features: b.features,
    isInstantBooking: b.isInstantBooking,
    listedAt: b.createdAt,
    conditionNotes: b.conditionNotes,
    registrationMasked: b.displayRegistrationToPublic ? b.registrationNumber : b.registrationMasked,
  }));

  // Sorting
  if (sortBy === 'price_asc') {
    publicList.sort((a, b) => a.hourlyRateInr - b.hourlyRateInr);
  } else if (sortBy === 'price_desc') {
    publicList.sort((a, b) => b.hourlyRateInr - a.hourlyRateInr);
  } else {
    publicList.sort((a, b) => b.listedAt.localeCompare(a.listedAt));
  }

  res.json(publicList);
});

app.get('/api/bikes/all', requireAdmin, (_req: Request, res: Response) => {
  const allBikes = db.getBikes({});
  res.json(allBikes);
});

app.get('/api/bikes/:id', (req: Request, res: Response) => {
  const bike = db.getBikeById(req.params.id);
  if (!bike) {
    return res.status(404).json({ error: 'Vehicle listing not found' });
  }

  // Public sanitization
  const publicDto = {
    id: bike.id,
    brand: bike.brand,
    model: bike.model,
    year: bike.year,
    bikeType: bike.bikeType,
    fuelType: bike.fuelType,
    transmission: bike.transmission,
    hourlyRateInr: bike.hourlyRateInr,
    dailyRateInr: bike.dailyRateInr,
    hubId: bike.hubId,
    hubName: bike.hubName,
    images: bike.images,
    features: bike.features,
    isInstantBooking: bike.isInstantBooking,
    listedAt: bike.createdAt,
    conditionNotes: bike.conditionNotes,
    registrationMasked: bike.displayRegistrationToPublic ? bike.registrationNumber : bike.registrationMasked,
  };

  res.json(publicDto);
});

// Live Availability Check (returns start/end ranges only; NEVER personal or booking models)
app.get('/api/bikes/:id/availability', (req: Request, res: Response) => {
  const { id } = req.params;
  const { startTime, endTime } = req.query;

  const bike = db.getBikeById(id);
  if (!bike) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  if (bike.availabilityStatus !== 'AVAILABLE' || bike.approvalStatus !== 'APPROVED') {
    return res.json({
      available: false,
      reason: `Vehicle is currently marked as ${bike.availabilityStatus}`,
      blockedRanges: [],
    });
  }

  if (!startTime || !endTime) {
    return res.json({ available: true, blockedRanges: [] });
  }

  const result = db.checkBikeAvailability(id, startTime as string, endTime as string);
  res.json(result);
});

// ----------------------------------------------------
// SERVER-COMPUTED PRICING ENDPOINT
// ----------------------------------------------------
app.post('/api/pricing/calculate', (req: Request, res: Response) => {
  const PricingInputSchema = z.object({
    bikeId: z.string(),
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    depositType: z.enum(['laptop', 'cash_hub']),
  });

  const parseResult = PricingInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid pricing parameters', details: parseResult.error.flatten() });
  }

  const { bikeId, startTime, endTime, depositType } = parseResult.data;
  const bike = db.getBikeById(bikeId);
  if (!bike) {
    return res.status(404).json({ error: 'Bike not found for pricing calculation' });
  }

  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  if (endMs <= startMs) {
    return res.status(400).json({ error: 'End time must be after pickup time' });
  }

  const durationHours = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60)));

  // Pure deterministic pricing rules
  let rentalChargeInr = 0;
  if (durationHours >= 24) {
    const fullDays = Math.floor(durationHours / 24);
    const remHours = durationHours % 24;
    rentalChargeInr = fullDays * bike.dailyRateInr + Math.min(remHours * bike.hourlyRateInr, bike.dailyRateInr);
  } else {
    rentalChargeInr = Math.min(durationHours * bike.hourlyRateInr, bike.dailyRateInr);
  }

  const platformFeeInr = Math.round(
    (rentalChargeInr * PLATFORM_CONFIG.depositPolicy.platformFeePercent) / 100
  );
  const depositInr = depositType === 'cash_hub' ? PLATFORM_CONFIG.depositPolicy.standardAmountInr : 0;
  const totalPayableAtHandoverInr = rentalChargeInr + platformFeeInr + depositInr;

  const breakdown = {
    durationHours,
    rentalChargeInr,
    platformFeeInr,
    depositInr,
    depositType,
    totalPayableAtHandoverInr,
    isServerCalculated: true,
  };

  res.json(breakdown);
});

// ----------------------------------------------------
// BOOKINGS (STUDENT & GUEST SUBMISSION ALLOWED)
// ----------------------------------------------------
app.post(
  '/api/bookings',
  bookingLimiter,
  (req: Request, res: Response) => {
    const parseResult = BookingCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation failed for booking submission',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const data = parseResult.data;

    let renterName = (data.renterName || req.user?.fullName || '').trim();
    let renterEmail = (data.renterEmail || req.user?.email || '').trim().toLowerCase();
    let renterPhone = (data.renterPhone || req.user?.phone || '').trim();
    let renterEnrollment = (data.renterEnrollment || req.user?.icfaiEnrollment || '').trim();

    let user = req.user;
    if (!user) {
      if (!renterEmail) {
        return res.status(400).json({ error: 'Renter email address is required for booking.' });
      }
      if (!renterName) {
        return res.status(400).json({ error: 'Renter full name is required for booking.' });
      }
      if (!renterPhone) {
        return res.status(400).json({ error: 'Renter phone number is required.' });
      }

      let existing = db.getUserByEmail(renterEmail);
      if (!existing) {
        existing = db.createUser({
          email: renterEmail,
          fullName: renterName,
          phone: renterPhone,
          icfaiEnrollment: renterEnrollment || null,
          emailVerified: 1,
          profileComplete: 1,
        });
      } else {
        db.updateUser(existing.id, {
          fullName: renterName || existing.full_name,
          phone: renterPhone || existing.phone,
          icfaiEnrollment: renterEnrollment || existing.icfai_enrollment,
          profileComplete: 1,
        });
        existing = db.getUserById(existing.id);
      }
      user = toUserProfile(existing);

      // Re-assign consent & documents to this student user
      sqlite.prepare('UPDATE document_consents SET user_id = ? WHERE id = ?').run(user.id, data.documentConsentId);
      for (const docId of data.documentIds) {
        sqlite.prepare('UPDATE user_documents SET user_id = ? WHERE id = ?').run(user.id, docId);
      }

      // Establish authenticated session so student can check My Bookings
      const rawToken = crypto.randomBytes(32).toString('hex');
      db.createSession(rawToken, user.id, 'student', 24 * 7, req.ip, req.headers['user-agent']);
      res.cookie(STUDENT_SESSION_COOKIE, rawToken, STUDENT_SESSION_COOKIE_OPTIONS);
    }

    renterName = user.name || renterName;
    renterEmail = user.email || renterEmail;
    renterPhone = user.phone || renterPhone;
    renterEnrollment = user.enrollmentNumber || renterEnrollment;

    // 1. Cap concurrent pending bookings per user (max 3)
    const userBookings = db.getBookings(user.id);
    const activeCount = userBookings.filter(
      (b) => b.status === 'PENDING_VERIFICATION' || b.status === 'CONFIRMED' || b.status === 'ACTIVE'
    ).length;

    if (activeCount >= 3) {
      return res.status(400).json({
        error: 'Booking Limit: You have 3 active reservations. Please complete or cancel one before booking again.',
      });
    }

  // 2. Validate Schedule against current time
  const startMs = new Date(data.startTime).getTime();
  const endMs = new Date(data.endTime).getTime();
  const nowWithGrace = Date.now() - 5 * 60 * 1000;

  if (startMs < nowWithGrace) {
    return res.status(400).json({ error: 'Pickup date cannot be in the past' });
  }
  if (endMs <= startMs) {
    return res.status(400).json({ error: 'Return date must be after pickup date' });
  }

  // 3. Server computes duration and pricing (client-supplied numbers are completely ignored)
  const bike = db.getBikeById(data.bikeId);
  if (!bike || bike.availabilityStatus !== 'AVAILABLE' || bike.approvalStatus !== 'APPROVED') {
    return res.status(400).json({ error: 'Vehicle unavailable for reservation' });
  }

  const durationHours = Math.max(1, Math.ceil((endMs - startMs) / (1000 * 60 * 60)));
  let rentalChargeInr = 0;
  if (durationHours >= 24) {
    const fullDays = Math.floor(durationHours / 24);
    const remHours = durationHours % 24;
    rentalChargeInr = fullDays * bike.dailyRateInr + Math.min(remHours * bike.hourlyRateInr, bike.dailyRateInr);
  } else {
    rentalChargeInr = Math.min(durationHours * bike.hourlyRateInr, bike.dailyRateInr);
  }

  const platformFeeInr = Math.round((rentalChargeInr * PLATFORM_CONFIG.depositPolicy.platformFeePercent) / 100);
  const depositInr = data.depositType === 'cash_hub' ? PLATFORM_CONFIG.depositPolicy.standardAmountInr : 0;
  const totalPayableInr = rentalChargeInr + platformFeeInr + depositInr;

  const hub = PLATFORM_CONFIG.hubs.find((h) => h.id === data.pickupHubId) || {
    id: data.pickupHubId,
    name: bike.hubName,
  };

  try {
    const createdBooking = db.createBookingAtomic({
      bikeId: bike.id,
      renterId: user.id,
      renterName: user.fullName,
      renterPhone: user.phone,
      renterEmail: user.email,
      renterEnrollment: user.icfaiEnrollment,
      pickupHubId: data.pickupHubId,
      pickupHubName: hub.name,
      startTime: data.startTime,
      endTime: data.endTime,
      durationHours,
      rentalChargeInr,
      platformFeeInr,
      depositInr,
      depositType: data.depositType,
      totalPayableInr,
      documentConsentId: data.documentConsentId,
      documentIds: data.documentIds,
      requireAadhaar: env.REQUIRE_AADHAAR_UPLOAD,
      agreedTermsVersion: data.agreedToTermsVersion,
      idempotencyKey: data.idempotencyKey,
    });

    db.logAudit({
      actorId: user.id,
      actorRole: 'student',
      action: 'CREATE_BOOKING',
      targetType: 'booking',
      targetId: createdBooking.id,
      diff: { bikeId: bike.id, startTime: data.startTime, totalPayableInr },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json(BookingResponseSchema.parse(createdBooking));
  } catch (err: any) {
    console.error('Booking create failed:', err instanceof Error ? err.message : 'unknown error');
    if (err.message && err.message.includes('CONCURRENT_CONFLICT')) {
      return res.status(409).json({ error: 'This bike was just booked by another student for these dates.' });
    }
    if (['DOCUMENT_CONSENT_OR_DOCUMENTS_INVALID', 'DOCUMENTS_REQUIRED'].includes(err.message)) {
      return res.status(400).json({ error: 'Please provide current consent and all required documents before booking.', code: 'DOCUMENTS_REQUIRED' });
    }
    if (err.message === 'IDEMPOTENCY_KEY_CONFLICT') {
      return res.status(409).json({ error: 'This booking request key has already been used.', code: 'IDEMPOTENCY_CONFLICT' });
    }
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.get('/api/bookings/my', requireUser, (req: Request, res: Response) => {
  const bookings = db.getBookings(req.user!.id);
  res.json(bookings.map((booking) => BookingResponseSchema.parse(booking)));
});

// Single booking with ownership or admin enforcement
app.get('/api/bookings/:id', (req: Request, res: Response) => {
  const booking = db.getBookingById(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // Check student ownership or admin credentials
  let isAllowed = false;
  let token = req.cookies?.[STUDENT_SESSION_COOKIE] || req.cookies?.[ADMIN_SESSION_COOKIE];
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    const session = db.getSession(token);
    if (session) {
      if (session.role === 'admin' || session.user_id === booking.userId) {
        isAllowed = true;
      }
    }
  }

  if (!isAllowed) {
    return res.status(403).json({ error: 'Access Denied: You do not own this reservation' });
  }

  res.json(BookingResponseSchema.parse(booking));
});

app.post('/api/bookings/:id/cancel', requireUser, (req: Request, res: Response) => {
  const booking = db.getBookingById(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  if (booking.userId !== req.user!.id && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'You cannot cancel another student’s reservation' });
  }

  if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(booking.status)) {
    return res.status(400).json({ error: `Cannot cancel a reservation marked as ${booking.status}` });
  }

  const reason = req.body.reason || 'Cancelled by renter';
  const updated = db.updateBookingStatus(booking.id, 'CANCELLED', reason);

  db.logAudit({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'CANCEL_BOOKING',
    targetType: 'booking',
    targetId: booking.id,
    diff: { previousStatus: booking.status, newStatus: 'CANCELLED', reason },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json(updated);
});

// ----------------------------------------------------
// OWNER ONBOARDING (AUTHENTICATED STUDENT REQUIRED)
// ----------------------------------------------------
app.post(
  '/api/owner/onboard',
  requireUser,
  requireEmailVerified,
  requireProfileComplete,
  ownerLimiter,
  (req: Request, res: Response) => {
  const parseResult = OwnerOnboardingSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation failed for owner onboarding',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const data = parseResult.data;
  const user = req.user!;

  const hub = PLATFORM_CONFIG.hubs.find((h) => h.id === data.preferredHubId);

  const createdBike = db.createBike({
    ownerId: user.id,
    brand: data.brand,
    model: data.model,
    year: data.year,
    registrationNumber: data.registrationNumber,
    registrationMasked: `${data.registrationNumber.slice(0, 4)}-****`,
    displayRegistrationToPublic: false,
    bikeType: data.bikeType,
    fuelType: data.fuelType,
    transmission: data.transmission,
    hourlyRateInr: data.hourlyRateInr,
    dailyRateInr: data.dailyRateInr,
    securityDepositInr: 1500,
    hubId: data.preferredHubId,
    hubName: hub ? hub.name : 'Main Campus Gate (Gate 1)',
    images: data.images,
    features: ['ISI Helmet Included', 'Student Owner Inspected'],
    availabilityStatus: 'AVAILABLE',
    approvalStatus: 'PENDING_APPROVAL', // Strict: always requires admin review
  });

  db.logAudit({
    actorId: user.id,
    actorRole: 'student',
    action: 'SUBMIT_OWNER_ONBOARDING',
    targetType: 'bike',
    targetId: createdBike.id,
    diff: { brand: data.brand, model: data.model, registration: data.registrationNumber },
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.status(201).json({
    id: `own-listing-${createdBike.id}`,
    bike: {
      id: createdBike.id,
      brand: createdBike.brand,
      model: createdBike.model,
      year: createdBike.year,
      bikeType: createdBike.bikeType,
      fuelType: createdBike.fuelType,
      transmission: createdBike.transmission,
      hourlyRateInr: createdBike.hourlyRateInr,
      dailyRateInr: createdBike.dailyRateInr,
      hubId: createdBike.hubId,
      hubName: createdBike.hubName,
      images: createdBike.images,
      features: createdBike.features,
      isInstantBooking: false,
      rating: createdBike.rating,
      totalTrips: 0,
      conditionNotes: 'Pending coordinator physical check',
      registrationMasked: createdBike.registrationMasked,
    },
    status: 'PENDING_APPROVAL',
    adminNotes: 'Coordinator will inspect vehicle at designated hub.',
    submittedAt: createdBike.createdAt,
    earnings: {
      totalRentedHours: 0,
      totalGrossInr: 0,
      netEarningsInr: 0,
      payoutsPendingInr: 0,
    },
  });
});

app.get('/api/owner/listings', requireUser, (req: Request, res: Response) => {
  const allBikes = db.getBikes({});
  const userListings = allBikes.filter((b) => b.ownerId === req.user!.id);

  const mapped = userListings.map((b) => ({
    id: `own-listing-${b.id}`,
    bike: {
      id: b.id,
      brand: b.brand,
      model: b.model,
      year: b.year,
      bikeType: b.bikeType,
      fuelType: b.fuelType,
      transmission: b.transmission,
      hourlyRateInr: b.hourlyRateInr,
      dailyRateInr: b.dailyRateInr,
      hubId: b.hubId,
      hubName: b.hubName,
      images: b.images,
      features: b.features,
      isInstantBooking: b.isInstantBooking,
      listedAt: b.createdAt,
      conditionNotes: b.conditionNotes,
      registrationMasked: b.registrationMasked,
    },
    status: b.approvalStatus,
    adminNotes: b.adminNotes,
    submittedAt: b.createdAt,
    earnings: {
      totalRentedHours: b.totalTrips * 4,
      totalGrossInr: b.totalTrips * b.hourlyRateInr * 4,
      netEarningsInr: Math.round(b.totalTrips * b.hourlyRateInr * 4 * 0.92),
      payoutsPendingInr: 0,
    },
  }));

  res.json(mapped);
});

// ----------------------------------------------------
// PRIVATE DOCUMENT UPLOADS, CONSENT, AND HUMAN REVIEW
// ----------------------------------------------------
app.post('/api/documents/consent', (req: Request, res: Response) => {
  if (req.body?.accepted !== true || req.body?.version !== env.DOCUMENT_CONSENT_VERSION) {
    return res.status(400).json({ error: 'Review the current document notice and confirm consent.', code: 'CONSENT_REQUIRED' });
  }

  let userId = req.user?.id;
  if (!userId) {
    const email = req.body?.email?.trim().toLowerCase();
    if (email) {
      let existingUser = db.getUserByEmail(email);
      if (!existingUser) {
        existingUser = db.createUser({
          email,
          fullName: req.body?.name || '',
          phone: req.body?.phone || '',
          icfaiEnrollment: req.body?.enrollment || null,
        });
      }
      userId = existingUser.id;
    } else {
      const guestId = 'usr_guest_' + crypto.randomBytes(6).toString('hex');
      const guest = db.createUser({
        id: guestId,
        email: `${guestId}@riderspath.local`,
        fullName: req.body?.name || 'Guest Student',
      });
      userId = guest.id;
    }
  }

  const id = crypto.randomUUID();
  sqlite.prepare(`INSERT INTO document_consents (id, user_id, version, accepted_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, userId, env.DOCUMENT_CONSENT_VERSION, new Date().toISOString(), req.ip, req.headers['user-agent'] || null);
  res.status(201).json({ id, version: env.DOCUMENT_CONSENT_VERSION });
});

app.post(
  '/api/upload/documents',
  documentUpload.single('file'),
  (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      const file = req.file;
      const type = req.body?.documentType;
      const consentId = req.body?.consentId;
      if (!file || !['driving_license', 'student_id', 'aadhaar'].includes(type)) {
        return res.status(400).json({ error: 'Choose a required document file.', code: 'DOCUMENT_REQUIRED' });
      }
      if (type === 'aadhaar' && !env.REQUIRE_AADHAAR_UPLOAD) {
        return res.status(400).json({ error: 'Aadhaar upload is not enabled.', code: 'DOCUMENT_NOT_ENABLED' });
      }
      const consent = sqlite.prepare(`SELECT id, user_id FROM document_consents WHERE id = ? AND version = ?`)
        .get(consentId, env.DOCUMENT_CONSENT_VERSION) as { id: string; user_id: string } | undefined;
      if (!consent) return res.status(403).json({ error: 'Current document consent is required before upload.', code: 'CONSENT_REQUIRED' });

      // If authenticated, ensure the consent belongs to the logged-in user
      if (req.user && consent.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Current document consent is required before upload.', code: 'CONSENT_REQUIRED' });
      }

      const userId = req.user?.id || consent.user_id;
      const inputMime = detectDocumentMime(file.buffer);
      if (!inputMime) return res.status(400).json({ error: 'Choose a valid JPEG, PNG, WebP, or PDF document.', code: 'INVALID_FILE_TYPE' });

      const imageId = crypto.randomUUID();
      let storedBytes: Buffer;
      let storedMime: 'image/jpeg' | 'application/pdf';
      if (inputMime === 'application/pdf') {
        storedBytes = file.buffer;
        storedMime = 'application/pdf';
      } else {
        try {
          storedBytes = await sharp(file.buffer, { limitInputPixels: 40_000_000, failOn: 'error' })
            .rotate()
            .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 84, mozjpeg: true })
            .toBuffer();
          storedMime = 'image/jpeg';
        } catch {
          return res.status(400).json({ error: 'This image could not be safely processed. Choose another image.', code: 'INVALID_IMAGE' });
        }
      }
      if (storedBytes.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Document exceeds the 5 MB limit.', code: 'FILE_TOO_LARGE' });
      try {
        const objectKey = await storePrivateDocument(imageId, storedBytes, storedMime);
        sqlite.prepare(`
          INSERT INTO user_documents (id, user_id, consent_id, document_type, object_key, storage_driver, mime_type, byte_size, uploaded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(imageId, userId, consentId, type, objectKey, env.DOCUMENT_STORAGE_DRIVER, storedMime, storedBytes.length, new Date().toISOString());
        return res.status(201).json({ id: imageId, documentType: type, reviewStatus: 'pending', byteSize: storedBytes.length });
      } catch (error) {
        next(error);
      }
    })().catch(next);
  }
);

app.delete('/api/upload/documents/:id', (req: Request, res: Response, next: NextFunction) => {
  void (async () => {
    const document = req.user
      ? sqlite.prepare(`SELECT id, object_key FROM user_documents WHERE id = ? AND user_id = ? AND booking_id IS NULL AND deleted_at IS NULL`)
          .get(req.params.id, req.user.id) as { id: string; object_key: string } | undefined
      : sqlite.prepare(`SELECT id, object_key FROM user_documents WHERE id = ? AND booking_id IS NULL AND deleted_at IS NULL`)
          .get(req.params.id) as { id: string; object_key: string } | undefined;
    if (!document) return res.status(404).json({ error: 'Unattached document not found.', code: 'DOCUMENT_NOT_FOUND' });
    await deletePrivateDocument(document.object_key);
    sqlite.prepare('DELETE FROM user_documents WHERE id = ? AND booking_id IS NULL').run(document.id);
    res.json({ success: true });
  })().catch(next);
});

app.get('/api/admin/documents', requireAdmin, (req: Request, res: Response) => {
  const status = req.query.status === 'approved' || req.query.status === 'rejected' ? req.query.status : 'pending';
  const rows = sqlite.prepare(`
    SELECT d.id, d.document_type, d.byte_size, d.review_status, d.review_reason, d.uploaded_at, d.booking_id,
      substr(d.user_id, 1, 8) AS student_ref, u.email, u.icfai_enrollment
    FROM user_documents d JOIN users u ON u.id = d.user_id
    WHERE d.review_status = ? AND d.deleted_at IS NULL ORDER BY d.uploaded_at ASC LIMIT 200
  `).all(status) as Array<any>;
  res.json(rows.map((row) => ({
    id: row.id,
    documentType: row.document_type,
    byteSize: row.byte_size,
    reviewStatus: row.review_status,
    reviewReason: row.review_reason,
    uploadedAt: row.uploaded_at,
    bookingId: row.booking_id,
    studentRef: `Student ${row.student_ref}`,
    emailMasked: maskEmail(row.email),
    enrollmentMasked: maskTail(row.icfai_enrollment, 3),
  })));
});

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  return `${local?.slice(0, 1) || '*'}***@${domain || 'hidden'}`;
}
function maskTail(value: string | null, visible: number) {
  if (!value) return 'Not provided';
  return `${'•'.repeat(Math.max(4, value.length - visible))}${value.slice(-visible)}`;
}

app.get('/api/admin/documents/:id/view-url', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const document = sqlite.prepare(`SELECT id, object_key, mime_type FROM user_documents WHERE id = ? AND deleted_at IS NULL`)
      .get(req.params.id) as { id: string; object_key: string; mime_type: string } | undefined;
    if (!document) return res.status(404).json({ error: 'Document not found.' });
    const url = createShortLivedDocumentUrl(document.id, req.admin!.id);
    db.logAudit({ actorId: req.admin!.id, actorRole: 'admin', action: 'DOCUMENT_VIEW_URL_ISSUED', targetType: 'user_document', targetId: document.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.json({ url, contentType: document.mime_type, expiresInSeconds: 60 });
  } catch (error) { next(error); }
});

app.get('/api/admin/documents/:id/content', async (req: Request, res: Response) => {
  const expires = Number(req.query.expires);
  const actorId = typeof req.query.actor === 'string' ? req.query.actor : '';
  const signature = typeof req.query.signature === 'string' ? req.query.signature : '';
  if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + 90) {
    return res.status(403).json({ error: 'This document link has expired.' });
  }
  if (!actorId) return res.status(403).json({ error: 'Invalid document link.' });
  const expected = crypto.createHmac('sha256', env.SESSION_SECRET).update(`${req.params.id}:${expires}:${actorId}`).digest();
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return res.status(403).json({ error: 'Invalid document link.' });
  const document = sqlite.prepare(`SELECT object_key, mime_type FROM user_documents WHERE id = ? AND deleted_at IS NULL`)
    .get(req.params.id) as { object_key: string; mime_type: string } | undefined;
  if (!document) return res.status(404).end();
  db.logAudit({ actorId, actorRole: 'admin', action: 'DOCUMENT_VIEW_REQUESTED', targetType: 'user_document', targetId: req.params.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  try {
    const result = await readPrivateDocument(document.object_key);
    db.logAudit({ actorId, actorRole: 'admin', action: 'DOCUMENT_VIEWED', targetType: 'user_document', targetId: req.params.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.set({ 'Content-Type': document.mime_type || result.contentType, 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' });
    res.send(result.bytes);
  } catch { res.status(404).end(); }
});

app.post('/api/admin/documents/:id/review', requireAdmin, (req: Request, res: Response) => {
  const status = req.body?.status;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!['approved', 'rejected'].includes(status) || (status === 'rejected' && reason.length < 3)) {
    return res.status(400).json({ error: 'Choose approve or reject and provide a reason when rejecting.' });
  }
  const document = sqlite.prepare(`SELECT id, user_id, document_type, booking_id FROM user_documents WHERE id = ? AND deleted_at IS NULL`)
    .get(req.params.id) as { id: string; user_id: string; document_type: string; booking_id: string | null } | undefined;
  if (!document) return res.status(404).json({ error: 'Document not found.' });
  const tx = sqlite.transaction(() => {
    sqlite.prepare(`UPDATE user_documents SET review_status = ?, review_reason = ?, reviewed_by = ? WHERE id = ?`)
      .run(status, status === 'rejected' ? reason : null, req.admin!.id, document.id);
    if (status === 'approved' && document.document_type === 'driving_license') {
      sqlite.prepare('UPDATE users SET driving_licence_verified = 1 WHERE id = ?').run(document.user_id);
    }
    if (document.booking_id) {
      const rejected = sqlite.prepare(`SELECT 1 FROM user_documents WHERE booking_id = ? AND review_status = 'rejected' LIMIT 1`).get(document.booking_id);
      const pending = sqlite.prepare(`SELECT 1 FROM user_documents WHERE booking_id = ? AND review_status = 'pending' LIMIT 1`).get(document.booking_id);
      if (rejected) sqlite.prepare(`UPDATE bookings SET booking_status = 'REJECTED', verification_status = 'rejected', cancellation_reason = ?, updated_at = ? WHERE id = ?`).run(reason || 'A required document was rejected.', new Date().toISOString(), document.booking_id);
      else if (!pending) sqlite.prepare(`UPDATE bookings SET booking_status = 'CONFIRMED', verification_status = 'verified', updated_at = ? WHERE id = ? AND booking_status = 'PENDING_VERIFICATION'`).run(new Date().toISOString(), document.booking_id);
    }
  });
  tx();
  db.logAudit({ actorId: req.admin!.id, actorRole: 'admin', action: `DOCUMENT_${status.toUpperCase()}`, targetType: 'user_document', targetId: document.id, diff: { reason: status === 'rejected' ? reason : undefined }, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  res.json({ success: true, reviewStatus: status });
});

app.get('/api/admin/listings', requireAdmin, (req: Request, res: Response) => {
  const statuses = ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED'].includes(String(req.query.status))
    ? [String(req.query.status)] : ['PENDING_APPROVAL', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED'];
  const rows = sqlite.prepare(`
    SELECT b.id, b.owner_id, b.brand, b.model, b.year, b.bike_type, b.fuel_type, b.transmission,
      b.images, b.hourly_rate_inr, b.daily_rate_inr, b.hub_name, b.registration_masked, b.approval_status,
      b.admin_notes, b.created_at, b.availability_status, u.email
    FROM bikes b JOIN users u ON u.id = b.owner_id
    WHERE b.approval_status IN (${statuses.map(() => '?').join(',')})
    ORDER BY b.created_at ASC LIMIT 200
  `).all(...statuses) as Array<any>;
  res.json(rows.map((row) => ({
    id: row.id,
    ownerRef: `Owner ${String(row.owner_id).slice(0, 8)}`,
    ownerEmailMasked: maskEmail(row.email),
    brand: row.brand,
    model: row.model,
    year: row.year,
    bikeType: row.bike_type,
    fuelType: row.fuel_type,
    transmission: row.transmission,
    images: JSON.parse(row.images || '[]'),
    hourlyRateInr: row.hourly_rate_inr,
    dailyRateInr: row.daily_rate_inr,
    hubName: row.hub_name,
    registrationMasked: row.registration_masked,
    status: row.approval_status,
    availabilityStatus: row.availability_status,
    adminNotes: row.admin_notes,
    submittedAt: row.created_at,
  })));
});

app.post('/api/admin/listings', requireAdmin, (req: Request, res: Response) => {
  const schema = z.object({
    brand: z.string().trim().min(1).max(60), model: z.string().trim().min(1).max(80),
    year: z.coerce.number().int().min(2010).max(new Date().getFullYear() + 1),
    registrationNumber: z.string().trim().min(6).max(20),
    bikeType: z.enum(['scooter', 'commuter', 'sports', 'cruiser', 'electric']),
    fuelType: z.enum(['petrol', 'electric']), transmission: z.enum(['automatic', 'manual']),
    hourlyRateInr: z.coerce.number().int().min(20).max(2000), dailyRateInr: z.coerce.number().int().min(100).max(20000),
    hubId: z.string(), imageUrl: z.string().url().optional(), description: z.string().trim().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Check the listing details.' });
  const hub = PLATFORM_CONFIG.hubs.find((item) => item.id === parsed.data.hubId);
  if (!hub) return res.status(400).json({ error: 'Choose a valid pickup hub.' });
  const created = db.createBike({
    ownerId: 'usr_owner_student_01', brand: parsed.data.brand, model: parsed.data.model, year: parsed.data.year,
    registrationNumber: parsed.data.registrationNumber.toUpperCase().replace(/\s+/g, ''), bikeType: parsed.data.bikeType,
    fuelType: parsed.data.fuelType, transmission: parsed.data.transmission, hourlyRateInr: parsed.data.hourlyRateInr,
    dailyRateInr: parsed.data.dailyRateInr, hubId: hub.id, hubName: hub.name, description: parsed.data.description || '',
    images: parsed.data.imageUrl ? [parsed.data.imageUrl] : [], availabilityStatus: 'UNAVAILABLE', approvalStatus: 'PENDING_APPROVAL',
    features: [],
  });
  db.logAudit({ actorId: req.admin!.id, actorRole: 'admin', action: 'LISTING_CREATED', targetType: 'bike', targetId: created.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  res.status(201).json(created);
});

app.patch('/api/admin/listings/:id/availability', requireAdmin, (req: Request, res: Response) => {
  const availabilityStatus = req.body?.availabilityStatus;
  if (!['AVAILABLE', 'UNAVAILABLE'].includes(availabilityStatus)) return res.status(400).json({ error: 'Choose AVAILABLE or UNAVAILABLE.' });
  const bike = sqlite.prepare('SELECT id, approval_status FROM bikes WHERE id = ?').get(req.params.id) as { id: string; approval_status: string } | undefined;
  if (!bike) return res.status(404).json({ error: 'Listing not found.' });
  if (availabilityStatus === 'AVAILABLE' && bike.approval_status !== 'APPROVED') return res.status(400).json({ error: 'Approve the listing before making it available.' });
  sqlite.prepare('UPDATE bikes SET availability_status = ?, updated_at = ? WHERE id = ?').run(availabilityStatus, new Date().toISOString(), bike.id);
  db.logAudit({ actorId: req.admin!.id, actorRole: 'admin', action: `LISTING_${availabilityStatus}`, targetType: 'bike', targetId: bike.id, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  res.json({ success: true, availabilityStatus });
});

app.post('/api/admin/listings/:id/review', requireAdmin, (req: Request, res: Response) => {
  const decision = req.body?.decision;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim().slice(0, 500) : '';
  if (!['approved', 'changes_requested', 'rejected'].includes(decision) || (decision !== 'approved' && notes.length < 3)) {
    return res.status(400).json({ error: 'Choose a listing decision and include review notes for changes or rejection.' });
  }
  const bike = sqlite.prepare('SELECT id, owner_id, approval_status FROM bikes WHERE id = ?').get(req.params.id) as { id: string; owner_id: string; approval_status: string } | undefined;
  if (!bike) return res.status(404).json({ error: 'Listing not found.' });
  const status = decision === 'approved' ? 'APPROVED' : decision === 'changes_requested' ? 'CHANGES_REQUESTED' : 'REJECTED';
  sqlite.prepare('UPDATE bikes SET approval_status = ?, availability_status = ?, admin_notes = ?, updated_at = ? WHERE id = ?')
    .run(status, status === 'APPROVED' ? 'AVAILABLE' : 'UNAVAILABLE', notes || null, new Date().toISOString(), bike.id);
  db.logAudit({ actorId: req.admin!.id, actorRole: 'admin', action: `LISTING_${status}`, targetType: 'bike', targetId: bike.id, diff: { notes: notes || undefined }, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
  res.json({ success: true, status, adminNotes: notes || undefined });
});

// ----------------------------------------------------
// GEMINI ADVISORY OCR ENDPOINT
// ----------------------------------------------------
app.post('/api/verify-document', requireUser, geminiLimiter, async (req: Request, res: Response) => {
  const { documentBase64, mimeType, expectedName, expectedEnrollment, documentCategory } = req.body;
  if (!documentBase64 || !['driving_license', 'student_id'].includes(documentCategory)) {
    return res.status(400).json({ error: 'Only driving licence and student ID can be sent for optional advisory analysis.', code: 'UNSUPPORTED_DOCUMENT_CATEGORY' });
  }

  try {
    const analysis = await verifyDocumentWithGemini({
      documentBase64,
      mimeType: mimeType || 'image/jpeg',
      expectedName: expectedName || req.user!.fullName,
      expectedEnrollment: expectedEnrollment || req.user!.icfaiEnrollment,
      documentCategory,
    });
    res.json({ ...analysis, advisoryOnly: true, manualReviewRequired: true });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Verification processing failed' });
  }
});

// ----------------------------------------------------
// ADMIN OPERATIONS & AUDIT LOGS
// ----------------------------------------------------
app.get('/api/admin/actions', requireAdmin, (_req: Request, res: Response) => {
  const actions = sqlite.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all();
  res.json(actions);
});

// ----------------------------------------------------
// GLOBAL ERROR HANDLER (NEVER LEAKS STACK TRACES)
// ----------------------------------------------------
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API ERROR]', err);
  const isCorsError = typeof err.message === 'string' && (err.message.includes('CORS') || err.message.includes('Cross-origin'));
  const status = isCorsError ? 403 : (err.status || err.statusCode || 500);
  const message = isCorsError ? 'Cross-origin request blocked.' : (err.message || 'An error occurred');

  res.status(status).json({
    error: message,
    code: err.code || (status === 403 ? 'FORBIDDEN' : (status === 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR')),
  });
});

// ----------------------------------------------------
// SERVER BOOTSTRAP
// ----------------------------------------------------
if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(env.PORT, () => {
    console.log(`🚀 Riders Path API running securely on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}
