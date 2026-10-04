import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { z } from 'zod';
import { env } from './server/config/env';
import { db, runMigrations, sqlite } from './server/db';
import {
  requireUser,
  requireAdmin,
  verifyCsrfOrigin,
  STUDENT_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
} from './server/middleware/auth';
import {
  globalLimiter,
  authLimiter,
  otpLimiter,
  bookingLimiter,
  ownerLimiter,
  geminiLimiter,
} from './server/middleware/rateLimit';
import { documentUpload, verifyMagicBytes } from './server/middleware/upload';
import { verifyDocumentWithGemini } from './server/gemini';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  ProfileCompletionSchema,
  BookingCreateSchema,
  OwnerOnboardingSchema,
  PublicBikeDtoSchema,
  PricingBreakdownSchema,
} from './src/shared/contract';
import { PLATFORM_CONFIG } from './src/config/platform.config';

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
        connectSrc: ["'self'", env.CORS_ORIGIN],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, supertest)
      if (!origin) return callback(null, true);
      const allowedOrigins = [
        env.CORS_ORIGIN,
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
      ];
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('CORS origin unauthorized'));
    },
    credentials: true,
  })
);

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

// ----------------------------------------------------
// PUBLIC CONFIG & HEALTH ROUTES
// ----------------------------------------------------
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Riders Path Secure API', time: new Date().toISOString() });
});

// Explicit allowlist public config (never leaks secrets or internal hashes)
app.get('/api/config', (_req: Request, res: Response) => {
  res.json({
    appName: PLATFORM_CONFIG.appName,
    campusName: PLATFORM_CONFIG.campusName,
    allowedEmailDomain: PLATFORM_CONFIG.allowedEmailDomain,
    termsVersion: PLATFORM_CONFIG.termsVersion,
    privacyVersion: PLATFORM_CONFIG.privacyVersion,
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

  res.json(updated);
});

// ----------------------------------------------------
// AUTHENTICATION ROUTES (STUDENT OTP + DEV HELPER)
// ----------------------------------------------------
app.post('/api/auth/otp/request', otpLimiter, (req: Request, res: Response) => {
  const parseResult = OtpRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: parseResult.error.errors[0]?.message || 'Invalid campus email address',
    });
  }

  const { email } = parseResult.data;
  // Deterministic 6-digit numeric OTP code
  const code = env.NODE_ENV === 'test' || env.NODE_ENV === 'development' ? '123456' : `${Math.floor(100000 + Math.random() * 900000)}`;

  db.storeOtp(email, code);

  // Uniform response message whether or not account exists to prevent account enumeration
  res.json({
    success: true,
    message: `A 6-digit verification code has been dispatched to ${email}.`,
  });
});

app.post('/api/auth/otp/verify', authLimiter, (req: Request, res: Response) => {
  const parseResult = OtpVerifySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.errors[0]?.message || 'Invalid OTP payload' });
  }

  const { email, code } = parseResult.data;
  const isValid = db.verifyOtp(email, code);

  if (!isValid) {
    return res.status(400).json({
      error: 'Invalid or expired verification code. Please request a new OTP.',
      code: 'INVALID_OTP',
    });
  }

  let user = db.getUserByEmail(email);
  const requiresProfileCompletion = !user || !user.full_name;

  if (!user) {
    user = db.createUser({
      fullName: '',
      email,
      phone: '',
      icfaiEnrollment: '',
      academicYear: '1st Year',
      course: '',
      role: 'student',
      verificationStatus: 'unverified',
    });
  }

  // Issue random 256-bit crypto session token stored hashed in SQLite
  const rawToken = crypto.randomBytes(32).toString('hex');
  db.createSession(rawToken, user.id, user.role, 24 * 7, req.ip, req.headers['user-agent']);

  // Set httpOnly session cookie
  res.cookie(STUDENT_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    requiresProfileCompletion,
    user: user.full_name
      ? {
          id: user.id,
          name: user.full_name,
          email: user.email,
          phone: user.phone,
          enrollmentNumber: user.icfai_enrollment,
          course: user.course,
          year: user.academic_year,
          isVerified: user.verification_status === 'verified',
          createdAt: user.created_at,
        }
      : null,
  });
});

// Development-only login helper (explicitly disabled in production)
app.post('/api/auth/dev-login', authLimiter, (req: Request, res: Response) => {
  if (env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Endpoint unavailable in production environment' });
  }

  const { enrollment, email, fullName } = req.body;
  const lookup = enrollment ? db.getUserByEnrollment(enrollment) : email ? db.getUserByEmail(email) : null;

  let user = lookup;
  if (!user) {
    user = db.createUser({
      fullName: fullName || 'Test ICFAI Student',
      email: email || `${(enrollment || '21bsph0101').toLowerCase()}@icfaiuniversity.in`,
      phone: '9848022338',
      icfaiEnrollment: enrollment || '21BSPH0101',
      academicYear: '3rd Year',
      course: 'B.Tech CSE',
      role: 'student',
      verificationStatus: 'verified',
    });
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  db.createSession(rawToken, user.id, user.role, 24 * 7, req.ip, req.headers['user-agent']);

  res.cookie(STUDENT_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({
    success: true,
    token: rawToken, // Provided for direct programmatic testing
    user: {
      id: user.id,
      name: user.full_name,
      email: user.email,
      phone: user.phone,
      enrollmentNumber: user.icfai_enrollment,
      course: user.course,
      year: user.academic_year,
      isVerified: user.verification_status === 'verified',
      createdAt: user.created_at,
    },
  });
});

app.get('/api/auth/me', requireUser, (req: Request, res: Response) => {
  const user = req.user!;
  res.json({
    id: user.id,
    name: user.fullName,
    email: user.email,
    phone: user.phone,
    enrollmentNumber: user.icfaiEnrollment,
    course: user.course,
    year: user.academicYear,
    isVerified: user.verificationStatus === 'verified',
  });
});

app.put('/api/auth/profile', requireUser, (req: Request, res: Response) => {
  const parseResult = ProfileCompletionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const data = parseResult.data;
  const updated = db.updateUser(req.user!.id, {
    fullName: data.name,
    phone: data.phone,
    course: data.course,
    academicYear: data.year,
    icfaiEnrollment: data.enrollmentNumber,
    verificationStatus: 'verified',
  });

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

  res.json({
    id: updated.id,
    name: updated.full_name,
    email: updated.email,
    phone: updated.phone,
    enrollmentNumber: updated.icfai_enrollment,
    course: updated.course,
    year: updated.academic_year,
    isVerified: updated.verification_status === 'verified',
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  let token = req.cookies?.[STUDENT_SESSION_COOKIE];
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (token) {
    db.deleteSession(token);
  }
  res.clearCookie(STUDENT_SESSION_COOKIE);
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

  res.json({ success: true, token: rawToken, message: 'Admin authenticated successfully' });
});

app.post('/api/admin/logout', requireAdmin, (req: Request, res: Response) => {
  if (req.rawSessionToken) {
    db.deleteSession(req.rawSessionToken);
  }
  res.clearCookie(ADMIN_SESSION_COOKIE);
  res.json({ success: true, message: 'Admin session closed' });
});

// ----------------------------------------------------
// BIKES CATALOG & AVAILABILITY ROUTES
// ----------------------------------------------------
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
    rating: b.rating,
    totalTrips: b.totalTrips,
    conditionNotes: b.conditionNotes,
    registrationMasked: b.displayRegistrationToPublic ? b.registrationNumber : b.registrationMasked,
  }));

  // Sorting
  if (sortBy === 'price_asc') {
    publicList.sort((a, b) => a.hourlyRateInr - b.hourlyRateInr);
  } else if (sortBy === 'price_desc') {
    publicList.sort((a, b) => b.hourlyRateInr - a.hourlyRateInr);
  } else if (sortBy === 'rating') {
    publicList.sort((a, b) => b.rating - a.rating);
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
    rating: bike.rating,
    totalTrips: bike.totalTrips,
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
// BOOKINGS (STUDENT & ADMIN PROTECTED)
// ----------------------------------------------------
app.post('/api/bookings', requireUser, bookingLimiter, (req: Request, res: Response) => {
  const parseResult = BookingCreateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation failed for booking submission',
      details: parseResult.error.flatten().fieldErrors,
    });
  }

  const data = parseResult.data;
  const user = req.user!;

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
      drivingLicenseDocPath: data.drivingLicenceImage,
      studentIdDocPath: data.studentIdCardImage,
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

    res.status(201).json(createdBooking);
  } catch (err: any) {
    if (err.message && err.message.includes('CONCURRENT_CONFLICT')) {
      return res.status(409).json({ error: 'This bike was just booked by another student for these dates.' });
    }
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.get('/api/bookings/my', requireUser, (req: Request, res: Response) => {
  const bookings = db.getBookings(req.user!.id);
  res.json(bookings);
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

  res.json(booking);
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
app.post('/api/owner/onboard', requireUser, ownerLimiter, (req: Request, res: Response) => {
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
      rating: b.rating,
      totalTrips: b.totalTrips,
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
// DEDICATED FILE UPLOAD ROUTE (5MB Cap + Magic-Byte Sniffing)
// ----------------------------------------------------
app.post(
  '/api/upload/documents',
  requireUser,
  documentUpload.fields([
    { name: 'drivingLicence', maxCount: 1 },
    { name: 'studentId', maxCount: 1 },
  ]),
  verifyMagicBytes,
  (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (!files) {
      return res.status(400).json({ error: 'No documents provided for upload' });
    }

    const dlFile = files['drivingLicence']?.[0];
    const studentIdFile = files['studentId']?.[0];

    res.json({
      success: true,
      drivingLicencePath: dlFile ? `/uploads/${dlFile.filename}` : null,
      studentIdPath: studentIdFile ? `/uploads/${studentIdFile.filename}` : null,
    });
  }
);

// ----------------------------------------------------
// GEMINI ADVISORY OCR ENDPOINT
// ----------------------------------------------------
app.post('/api/verify-document', requireUser, geminiLimiter, async (req: Request, res: Response) => {
  const { documentBase64, mimeType, expectedName, expectedEnrollment, documentCategory } = req.body;
  if (!documentBase64 || !documentCategory) {
    return res.status(400).json({ error: 'documentBase64 and documentCategory are required' });
  }

  try {
    const analysis = await verifyDocumentWithGemini({
      documentBase64,
      mimeType: mimeType || 'image/jpeg',
      expectedName: expectedName || req.user!.fullName,
      expectedEnrollment: expectedEnrollment || req.user!.icfaiEnrollment,
      documentCategory: documentCategory === 'student_id' ? 'student_id' : 'driving_license',
    });
    res.json(analysis);
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
  const status = err.status || err.statusCode || 500;
  const message = status === 500 && env.NODE_ENV === 'production'
    ? 'An internal server error occurred. Please contact campus desk.'
    : err.message || 'An error occurred';

  res.status(status).json({
    error: message,
    code: err.code || 'SERVER_ERROR',
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
