import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { env } from '../config/env';

export const STUDENT_SESSION_COOKIE = 'rp_student_session';
export const ADMIN_SESSION_COOKIE = 'rp_admin_session';
export const CSRF_COOKIE = 'rp_csrf_token';
export const ADMIN_CSRF_COOKIE = 'rp_admin_csrf_token';
export const STUDENT_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
export const STUDENT_SESSION_COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  icfaiEnrollment: string;
  academicYear: string;
  course: string;
  role: string;
  verificationStatus: string;
  emailVerified: boolean;
  profileComplete: boolean;
  drivingLicenceVerified: boolean;
  createdAt: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      admin?: { id: string; role: string };
      rawSessionToken?: string;
    }
  }
}

// ----------------------------------------------------
// CORS & CSRF ORIGIN HELPERS & PROTECTION MIDDLEWARE
// ----------------------------------------------------
export function parseAllowedOrigins(originConfig?: string): string[] {
  if (!originConfig) return [];
  return originConfig
    .split(',')
    .map((o) => o.trim().toLowerCase().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function getAllowedStudentOrigins(): string[] {
  const custom = parseAllowedOrigins(env.CORS_ORIGIN);
  const defaults = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://riders-path.vercel.app',
    'https://riders-path-student.vercel.app',
  ];
  return Array.from(new Set([...custom, ...defaults]));
}

export function getAllowedAdminOrigins(): string[] {
  const custom = parseAllowedOrigins(env.ADMIN_CORS_ORIGIN);
  const defaults = [
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'https://riders-path-admin.vercel.app',
    'https://riders-path.vercel.app',
    'https://riders-path-student.vercel.app',
  ];
  return Array.from(new Set([...custom, ...defaults]));
}

export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return true;
  const normalized = origin.trim().toLowerCase().replace(/\/+$/, '');
  if (allowedOrigins.includes(normalized)) return true;

  try {
    const url = new URL(normalized);
    // Allow any vercel deployment preview for this app
    if (url.hostname.endsWith('.vercel.app') && url.hostname.includes('riders-path')) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function verifyCsrfOrigin(req: Request, res: Response, next: NextFunction) {
  // Safe HTTP read methods skip CSRF origin check
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // Browser requests carry Origin or Referer. Keep the API usable for direct
    // server-to-server callers and tests that do not send browser credentials.
    return next();
  }

  try {
    const originHost = new URL(origin).origin.toLowerCase().replace(/\/+$/, '');
    const adminPath = req.path.startsWith('/api/admin');
    const allowed = adminPath ? getAllowedAdminOrigins() : getAllowedStudentOrigins();
    if (!isOriginAllowed(originHost, allowed)) {
      return res.status(403).json({ error: 'CSRF Protection: Cross-origin request blocked', code: 'CSRF_ORIGIN_BLOCKED' });
    }
  } catch {
    return res.status(403).json({ error: 'CSRF Protection: Invalid request origin', code: 'CSRF_ORIGIN_INVALID' });
  }

  const cookieName = req.path.startsWith('/api/admin') ? ADMIN_CSRF_COOKIE : CSRF_COOKIE;
  const cookieToken = req.cookies?.[cookieName];
  const headerToken = req.get('x-csrf-token');
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
    return res.status(403).json({ error: 'CSRF Protection: Token required', code: 'CSRF_TOKEN_REQUIRED' });
  }
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  if (cookieBuffer.length !== headerBuffer.length || !crypto.timingSafeEqual(cookieBuffer, headerBuffer)) {
    return res.status(403).json({ error: 'CSRF Protection: Invalid token', code: 'CSRF_TOKEN_INVALID' });
  }

  next();
}

// ----------------------------------------------------
// REQUIRE STUDENT USER MIDDLEWARE
// ----------------------------------------------------
export function requireUser(req: Request, res: Response, next: NextFunction) {
  // Support both httpOnly cookie (browser) and Bearer header (programmatic / API tests)
  let token = req.cookies?.[STUDENT_SESSION_COOKIE];
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      error: 'Authentication Required: Active student session cookie or token required',
      code: 'UNAUTHORIZED',
    });
  }

  const session = db.getSession(token);
  if (!session) {
    return res.status(401).json({
      error: 'Session Expired or Invalid: Please sign in again',
      code: 'SESSION_EXPIRED',
    });
  }

  // Cross-role guard: Admin sessions cannot masquerade as students
  if (session.role === 'admin') {
    return res.status(403).json({
      error: 'Access Denied: Administrative sessions cannot perform student actions',
      code: 'FORBIDDEN_ROLE',
    });
  }

  const user = db.getUserById(session.user_id);
  if (!user) {
    return res.status(401).json({ error: 'User record no longer exists', code: 'USER_NOT_FOUND' });
  }

  req.user = {
    id: user.id,
    fullName: user.full_name || '',
    email: user.email,
    phone: user.phone || '',
    icfaiEnrollment: user.icfai_enrollment || '',
    academicYear: user.academic_year || '1st Year',
    course: user.course || '',
    role: user.role,
    verificationStatus: user.verification_status,
    emailVerified: Boolean(user.email_verified),
    profileComplete: Boolean(user.profile_complete),
    drivingLicenceVerified: Boolean(user.driving_licence_verified),
    createdAt: user.created_at,
  };
  req.rawSessionToken = token;

  next();
}

/**
 * Ensures user has completed email OTP verification
 */
export function requireEmailVerified(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.emailVerified) {
    return res.status(403).json({
      error: 'Campus email verification required to proceed',
      code: 'EMAIL_VERIFICATION_REQUIRED',
    });
  }
  next();
}

/**
 * Ensures user has completed profile information
 */
export function requireProfileComplete(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !req.user.profileComplete) {
    return res.status(403).json({
      error: 'Please complete your student profile before performing this action',
      code: 'PROFILE_INCOMPLETE',
    });
  }
  next();
}

// ----------------------------------------------------
// REQUIRE ADMIN MIDDLEWARE
// ----------------------------------------------------
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  let token = req.cookies?.[ADMIN_SESSION_COOKIE];
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      error: 'Admin Authorization Required: Administrative session token required',
      code: 'ADMIN_UNAUTHORIZED',
    });
  }

  const session = db.getSession(token);
  if (!session) {
    return res.status(401).json({
      error: 'Admin Session Expired: Please log in again',
      code: 'SESSION_EXPIRED',
    });
  }

  // Cross-role guard: Student sessions can NEVER access admin routes
  if (session.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: Insufficient privileges for coordinator administration',
      code: 'FORBIDDEN',
    });
  }

  req.admin = { id: session.user_id, role: session.role };
  req.rawSessionToken = token;

  next();
}
