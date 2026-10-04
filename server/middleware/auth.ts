import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { env } from '../config/env';

export const STUDENT_SESSION_COOKIE = 'rp_student_session';
export const ADMIN_SESSION_COOKIE = 'rp_admin_session';

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
// CSRF & ORIGIN PROTECTION MIDDLEWARE
// ----------------------------------------------------
export function verifyCsrfOrigin(req: Request, res: Response, next: NextFunction) {
  // Safe HTTP read methods skip CSRF origin check
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  if (!origin) {
    // Direct server-to-server or test requests without browser origin
    return next();
  }

  try {
    const originHost = new URL(origin).origin;
    const allowed = [env.CORS_ORIGIN, 'http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
    if (!allowed.includes(originHost)) {
      return res.status(403).json({ error: 'CSRF Protection: Cross-origin request blocked' });
    }
  } catch {
    return res.status(403).json({ error: 'CSRF Protection: Invalid request origin' });
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
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    icfaiEnrollment: user.icfai_enrollment,
    academicYear: user.academic_year,
    course: user.course,
    role: user.role,
    verificationStatus: user.verification_status,
  };
  req.rawSessionToken = token;

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
