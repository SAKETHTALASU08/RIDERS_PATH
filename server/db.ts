import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { env } from './config/env';

// Ensure data directory exists
const dbPath = path.resolve(process.cwd(), env.DATABASE_PATH);
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const sqlite = new Database(dbPath);

function otpEmailKey(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

// Enable WAL mode and foreign keys for high performance and integrity
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// ----------------------------------------------------
// SCHEMA MIGRATION
// ----------------------------------------------------
export function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      full_name TEXT,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      icfai_enrollment TEXT UNIQUE,
      academic_year TEXT DEFAULT '1st Year',
      course TEXT,
      role TEXT NOT NULL DEFAULT 'student',
      email_verified INTEGER NOT NULL DEFAULT 0,
      profile_complete INTEGER NOT NULL DEFAULT 0,
      driving_licence_verified INTEGER NOT NULL DEFAULT 0,
      verification_status TEXT NOT NULL DEFAULT 'unverified',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS owners (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payout_upi_id TEXT NOT NULL,
      total_earnings INTEGER NOT NULL DEFAULT 0,
      ownership_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bikes (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      registration_number TEXT NOT NULL,
      registration_masked TEXT NOT NULL,
      display_registration_to_public INTEGER NOT NULL DEFAULT 0,
      bike_type TEXT NOT NULL,
      fuel_type TEXT NOT NULL,
      transmission TEXT NOT NULL,
      description TEXT NOT NULL,
      images TEXT NOT NULL,
      hourly_rate_inr INTEGER NOT NULL,
      daily_rate_inr INTEGER NOT NULL,
      security_deposit_inr INTEGER NOT NULL DEFAULT 1500,
      hub_id TEXT NOT NULL,
      hub_name TEXT NOT NULL,
      availability_status TEXT NOT NULL DEFAULT 'AVAILABLE',
      approval_status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
      admin_notes TEXT,
      rating REAL NOT NULL DEFAULT 5.0,
      total_trips INTEGER NOT NULL DEFAULT 0,
      condition_notes TEXT NOT NULL DEFAULT 'Coordinator Inspected',
      features TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      bike_id TEXT NOT NULL REFERENCES bikes(id),
      renter_id TEXT NOT NULL REFERENCES users(id),
      renter_name TEXT NOT NULL,
      renter_phone TEXT NOT NULL,
      renter_email TEXT NOT NULL,
      renter_enrollment TEXT NOT NULL,
      pickup_hub_id TEXT NOT NULL,
      pickup_hub_name TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_hours INTEGER NOT NULL,
      rental_charge_inr INTEGER NOT NULL,
      platform_fee_inr INTEGER NOT NULL,
      deposit_inr INTEGER NOT NULL,
      deposit_type TEXT NOT NULL,
      total_payable_inr INTEGER NOT NULL,
      booking_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
      verification_status TEXT NOT NULL DEFAULT 'pending',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      handover_code TEXT NOT NULL,
      qr_pass_code TEXT NOT NULL,
      driving_license_doc_path TEXT,
      student_id_doc_path TEXT,
      agreed_terms_version TEXT NOT NULL,
      cancellation_reason TEXT,
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      delivery_state TEXT NOT NULL DEFAULT 'READY',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_send_logs (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS manual_verification_requests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enrollment_number TEXT NOT NULL,
      alternate_email TEXT NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      booking_id TEXT REFERENCES bookings(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      document_type TEXT NOT NULL,
      verdict TEXT NOT NULL,
      confidence REAL,
      reasons TEXT,
      manual_review_required INTEGER NOT NULL DEFAULT 1,
      verified_by TEXT NOT NULL DEFAULT 'AI_ADVISORY',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      diff TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      is_secret INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    -- Performance and Integrity Indexes
    CREATE INDEX IF NOT EXISTS idx_bookings_bike_dates ON bookings (bike_id, start_time, end_time);
    CREATE INDEX IF NOT EXISTS idx_bookings_renter ON bookings (renter_id, booking_status);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_otp_email_expires ON otp_codes (email, expires_at);
    CREATE INDEX IF NOT EXISTS idx_otp_send_logs_email ON otp_send_logs (email, created_at);
    CREATE INDEX IF NOT EXISTS idx_otp_send_logs_ip ON otp_send_logs (ip_address, created_at);
  `);

  // Earlier versions stored raw addresses in send-limit records. Keep only SHA-256 keys.
  const legacyOtpSendLogs = sqlite
    .prepare('SELECT id, email FROM otp_send_logs')
    .all() as Array<{ id: string; email: string }>;
  const migrateOtpSendLog = sqlite.prepare('UPDATE otp_send_logs SET email = ? WHERE id = ?');
  const migrateOtpSendLogs = sqlite.transaction((rows: Array<{ id: string; email: string }>) => {
    for (const row of rows) {
      if (!/^[a-f0-9]{64}$/i.test(row.email)) {
        migrateOtpSendLog.run(otpEmailKey(row.email), row.id);
      }
    }
  });
  migrateOtpSendLogs(legacyOtpSendLogs);

  const otpColumns = sqlite.prepare('PRAGMA table_info(otp_codes)').all() as Array<{ name: string }>;
  if (!otpColumns.some((column) => column.name === 'delivery_state')) {
    // Existing active challenges were already delivered by the old synchronous flow.
    sqlite.exec("ALTER TABLE otp_codes ADD COLUMN delivery_state TEXT NOT NULL DEFAULT 'READY'");
  }

  // Migrate existing users table columns and constraints if table pre-existed
  const userColumns = sqlite.prepare("PRAGMA table_info(users)").all() as any[];
  const columnNames = userColumns.map((c) => c.name);

  if (!columnNames.includes('email_verified')) {
    sqlite.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
  }
  if (!columnNames.includes('profile_complete')) {
    sqlite.exec("ALTER TABLE users ADD COLUMN profile_complete INTEGER NOT NULL DEFAULT 0");
  }
  if (!columnNames.includes('driving_licence_verified')) {
    sqlite.exec("ALTER TABLE users ADD COLUMN driving_licence_verified INTEGER NOT NULL DEFAULT 0");
  }

  // Ensure icfai_enrollment is nullable to allow pre-profile signup
  const enrollmentCol = userColumns.find((c) => c.name === 'icfai_enrollment');
  if (enrollmentCol && enrollmentCol.notnull === 1) {
    sqlite.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE users_migrated (
        id TEXT PRIMARY KEY,
        full_name TEXT,
        email TEXT UNIQUE NOT NULL,
        phone TEXT,
        icfai_enrollment TEXT UNIQUE,
        academic_year TEXT DEFAULT '1st Year',
        course TEXT,
        role TEXT NOT NULL DEFAULT 'student',
        email_verified INTEGER NOT NULL DEFAULT 0,
        profile_complete INTEGER NOT NULL DEFAULT 0,
        driving_licence_verified INTEGER NOT NULL DEFAULT 0,
        verification_status TEXT NOT NULL DEFAULT 'unverified',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO users_migrated (
        id, full_name, email, phone, icfai_enrollment, academic_year, course, role,
        email_verified, profile_complete, driving_licence_verified, verification_status,
        created_at, updated_at
      )
      SELECT
        id, full_name, email, phone, icfai_enrollment, academic_year, course, role,
        COALESCE(email_verified, 0),
        COALESCE(profile_complete, CASE WHEN full_name IS NOT NULL AND full_name != '' THEN 1 ELSE 0 END),
        COALESCE(driving_licence_verified, 0),
        verification_status, created_at, updated_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_migrated RENAME TO users;
      PRAGMA foreign_keys = ON;
    `);
  }

  // Seed default admin config if missing
  const existingConfig = sqlite.prepare('SELECT key FROM config WHERE key = ?').get('platform_config');
  if (!existingConfig) {
    const publicConfig = {
      appName: 'Riders Path',
      campusName: 'ICFAI Foundation for Higher Education, Hyderabad',
      termsVersion: 'v2.1-campus-2026',
      privacyVersion: 'v1.4-privacy-2026',
      platformFeePercent: 8,
      standardDepositInr: 1500,
    };

    sqlite.prepare('INSERT INTO config (key, value, is_secret, updated_at) VALUES (?, ?, ?, ?)').run(
      'platform_config',
      JSON.stringify(publicConfig),
      0,
      new Date().toISOString()
    );
  }

  // One-time correction for the bundled demo owner from older schemas. Do not reset review
  // state on every process start; subsequent admin approval must persist.
  const seedReviewMigration = sqlite
    .prepare("SELECT key FROM config WHERE key = 'seed_owner_review_state_v1'")
    .get();
  if (!seedReviewMigration) {
    sqlite.transaction(() => {
      sqlite.prepare(`
        UPDATE users
        SET driving_licence_verified = 0, verification_status = 'unverified'
        WHERE id = 'usr_owner_student_01'
      `).run();
      sqlite.prepare('INSERT INTO config (key, value, is_secret, updated_at) VALUES (?, ?, ?, ?)').run(
        'seed_owner_review_state_v1',
        'applied',
        1,
        new Date().toISOString()
      );
    })();
  }

  // Revoke sessions created by the removed student enrollment/dev login flow.
  // Keep admin sessions intact because admin authentication is unchanged here.
  const studentSessionCutover = sqlite
    .prepare("SELECT key FROM config WHERE key = 'student_session_security_cutover_v1'")
    .get();
  if (!studentSessionCutover) {
    sqlite.transaction(() => {
      sqlite.prepare("DELETE FROM sessions WHERE role != 'admin'").run();
      sqlite.prepare('INSERT INTO config (key, value, is_secret, updated_at) VALUES (?, ?, ?, ?)').run(
        'student_session_security_cutover_v1',
        'applied',
        1,
        new Date().toISOString()
      );
    })();
  }

  // Seed initial fleet if bikes table is empty
  const bikeCount = (sqlite.prepare('SELECT COUNT(*) as count FROM bikes').get() as { count: number }).count;
  if (bikeCount === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const now = new Date().toISOString();

  // Create system admin and initial student owner
  const insertUser = sqlite.prepare(`
    INSERT OR IGNORE INTO users (
      id, full_name, email, phone, icfai_enrollment, academic_year, course, role,
      email_verified, profile_complete, driving_licence_verified, verification_status,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    'usr_system_admin',
    'Campus Fleet Administrator',
    'fleet.admin@campus.example.edu',
    '+91 99999 00000',
    'ADMIN-ICFAI',
    'Faculty/Staff',
    'Campus Transport Desk',
    'admin',
    0,
    0,
    0,
    'unverified',
    now,
    now
  );

  insertUser.run(
    'usr_owner_student_01',
    'Suhash Reddy',
    'suhash.reddy@student.example.edu',
    '+91 98480 11223',
    'ABCD-123',
    '3rd Year',
    'B.Tech CSE',
    'owner',
    0,
    1,
    0,
    'unverified',
    now,
    now
  );

  const insertBike = sqlite.prepare(`
    INSERT INTO bikes (
      id, owner_id, brand, model, year, registration_number, registration_masked,
      display_registration_to_public, bike_type, fuel_type, transmission, description,
      images, hourly_rate_inr, daily_rate_inr, security_deposit_inr, hub_id, hub_name,
      availability_status, approval_status, rating, total_trips, condition_notes, features,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  insertBike.run(
    'bike-ather-450x',
    'usr_owner_student_01',
    'Ather',
    '450X Gen 3 Space Grey',
    2023,
    'TS08EP4921',
    'TS08-****',
    0,
    'electric',
    'electric',
    'automatic',
    'Fast-charging student electric scooter with digital dash.',
    JSON.stringify([
      'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=800&q=80',
    ]),
    65,
    450,
    1500,
    'hub_block_c',
    'Academic Block C Hub',
    'AVAILABLE',
    'APPROVED',
    4.9,
    64,
    'Inspected by Block C Campus Coordinator; battery health 98%',
    JSON.stringify(['ISI Helmet Included', '100 km Range', 'Touchscreen Navigation']),
    now,
    now
  );

  insertBike.run(
    'bike-tvs-jupiter',
    'usr_owner_student_01',
    'TVS',
    'Jupiter 125 Disc',
    2023,
    'TS07AB1234',
    'TS07-****',
    0,
    'scooter',
    'petrol',
    'automatic',
    'Reliable daily commuter with 33L underseat storage.',
    JSON.stringify([
      'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=800&q=80',
    ]),
    45,
    320,
    1500,
    'hub_main_gate',
    'Main Campus Gate (Gate 1)',
    'AVAILABLE',
    'APPROVED',
    4.8,
    92,
    'Freshly serviced; smooth pickup for day errands',
    JSON.stringify(['ISI Helmet Included', '33L Storage', 'All-in-One Key Slot']),
    now,
    now
  );

  insertBike.run(
    'bike-yamaha-mt15',
    'usr_owner_student_01',
    'Yamaha',
    'MT-15 V2 Metallic Black',
    2024,
    'TS09CD5678',
    'TS09-****',
    0,
    'sports',
    'petrol',
    'manual',
    'Dual channel ABS sport motorcycle for licensed experienced riders.',
    JSON.stringify([
      'https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?auto=format&fit=crop&w=800&q=80',
    ]),
    95,
    680,
    1500,
    'hub_boys_hostel',
    'Boys Hostel Cluster (Hostel 3)',
    'AVAILABLE',
    'APPROVED',
    4.95,
    41,
    'Verified by Hostel Coordinator; pristine brakes and tires',
    JSON.stringify(['Dual ISI Helmets', 'Traction Control', 'Dual Channel ABS']),
    now,
    now
  );
}

// ----------------------------------------------------
// DATABASE SERVICE METHODS (Parameterized Queries Only)
// ----------------------------------------------------
export const db = {
  // Config
  getConfig() {
    const row = sqlite.prepare('SELECT value FROM config WHERE key = ?').get('platform_config') as
      | { value: string }
      | undefined;
    if (!row) return {};
    return JSON.parse(row.value);
  },

  updateConfig(updates: Record<string, any>) {
    const current = this.getConfig();
    const updated = { ...current, ...updates };
    sqlite
      .prepare('UPDATE config SET value = ?, updated_at = ? WHERE key = ?')
      .run(JSON.stringify(updated), new Date().toISOString(), 'platform_config');
    return updated;
  },

  // Admin Auth
  verifyAdminPassword(password: string): boolean {
    if (!password) return false;
    return bcrypt.compareSync(password, env.ADMIN_PASSWORD_HASH);
  },

  // Users
  getUserById(id: string) {
    return sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  },

  getUserByEmail(email: string) {
    return sqlite.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email) as any;
  },

  getUserByEnrollment(enrollment: string) {
    return sqlite
      .prepare('SELECT * FROM users WHERE UPPER(icfai_enrollment) = UPPER(?)')
      .get(enrollment) as any;
  },

  createUser(data: {
    id?: string;
    fullName?: string;
    email: string;
    phone?: string;
    icfaiEnrollment?: string | null;
    academicYear?: string;
    course?: string;
    role?: string;
    emailVerified?: boolean | number;
    profileComplete?: boolean | number;
    drivingLicenceVerified?: boolean | number;
    verificationStatus?: string;
  }) {
    const id = data.id || 'usr_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    sqlite
      .prepare(`
        INSERT INTO users (
          id, full_name, email, phone, icfai_enrollment, academic_year, course, role,
          email_verified, profile_complete, driving_licence_verified, verification_status,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        data.fullName || null,
        data.email.toLowerCase().trim(),
        data.phone || null,
        data.icfaiEnrollment ? data.icfaiEnrollment.toUpperCase().trim() : null,
        data.academicYear || '1st Year',
        data.course || null,
        data.role || 'student',
        data.emailVerified ? 1 : 0,
        data.profileComplete ? 1 : 0,
        data.drivingLicenceVerified ? 1 : 0,
        data.verificationStatus || 'unverified',
        now,
        now
      );
    return this.getUserById(id);
  },

  updateUser(
    id: string,
    updates: Partial<{
      fullName: string;
      email: string;
      phone: string;
      course: string;
      academicYear: string;
      icfaiEnrollment: string | null;
      emailVerified: boolean | number;
      profileComplete: boolean | number;
      drivingLicenceVerified: boolean | number;
      verificationStatus: string;
      role: string;
    }>
  ) {
    const user = this.getUserById(id);
    if (!user) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.fullName !== undefined) {
      fields.push('full_name = ?');
      values.push(updates.fullName);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email.toLowerCase().trim());
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?');
      values.push(updates.phone);
    }
    if (updates.course !== undefined) {
      fields.push('course = ?');
      values.push(updates.course);
    }
    if (updates.academicYear !== undefined) {
      fields.push('academic_year = ?');
      values.push(updates.academicYear);
    }
    if (updates.icfaiEnrollment !== undefined) {
      fields.push('icfai_enrollment = ?');
      values.push(updates.icfaiEnrollment ? updates.icfaiEnrollment.toUpperCase().trim() : null);
    }
    if (updates.emailVerified !== undefined) {
      fields.push('email_verified = ?');
      values.push(updates.emailVerified ? 1 : 0);
    }
    if (updates.profileComplete !== undefined) {
      fields.push('profile_complete = ?');
      values.push(updates.profileComplete ? 1 : 0);
    }
    if (updates.drivingLicenceVerified !== undefined) {
      fields.push('driving_licence_verified = ?');
      values.push(updates.drivingLicenceVerified ? 1 : 0);
    }
    if (updates.verificationStatus !== undefined) {
      fields.push('verification_status = ?');
      values.push(updates.verificationStatus);
    }
    if (updates.role !== undefined) {
      fields.push('role = ?');
      values.push(updates.role);
    }

    if (fields.length === 0) return user;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    const invalidateSessions = (
      (updates.email !== undefined && updates.email.trim().toLowerCase() !== user.email.toLowerCase()) ||
      (updates.role !== undefined && updates.role !== user.role)
    );
    sqlite.transaction(() => {
      sqlite.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
      if (invalidateSessions) {
        // Email and role changes invalidate all outstanding authentication state.
        sqlite.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      }
    })();
    return this.getUserById(id);
  },

  // Sessions (Hashed Session Token Storage)
  createSession(token: string, userId: string, role: string, maxAgeHours = 24 * 7, ipAddress?: string, userAgent?: string) {
    const hashedId = crypto.createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + maxAgeHours * 60 * 60 * 1000).toISOString();

    sqlite
      .prepare(`
        INSERT INTO sessions (id, user_id, role, expires_at, created_at, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(hashedId, userId, role, expiresAt, now.toISOString(), ipAddress || null, userAgent || null);

    return { hashedId, expiresAt };
  },

  getSession(token: string) {
    if (!token) return null;
    const hashedId = crypto.createHash('sha256').update(token).digest('hex');
    const session = sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(hashedId) as any;
    if (!session) return null;

    // Check expiry
    if (new Date(session.expires_at).getTime() < Date.now()) {
      this.deleteSession(token);
      return null;
    }

    return session;
  },

  deleteSession(token: string) {
    const hashedId = crypto.createHash('sha256').update(token).digest('hex');
    sqlite.prepare('DELETE FROM sessions WHERE id = ?').run(hashedId);
  },

  deleteAllUserSessions(userId: string) {
    sqlite.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  },

  // OTP Codes & Rate Limits (HMAC-SHA256 & Persistent Send Logs)
  invalidateEarlierOtpCodes(email: string) {
    sqlite
      .prepare('UPDATE otp_codes SET consumed = 1 WHERE LOWER(email) = LOWER(?) AND consumed = 0')
      .run(email.trim());
  },

  storeOtp(email: string, codeHash: string, validityMinutes = 10, deliveryState: 'PENDING' | 'READY' = 'READY') {
    const id = 'otp_' + crypto.randomBytes(8).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + validityMinutes * 60 * 1000).toISOString();

    sqlite
      .prepare(`
        INSERT INTO otp_codes (id, email, code_hash, expires_at, consumed, attempts, delivery_state, created_at)
        VALUES (?, ?, ?, ?, 0, 0, ?, ?)
      `)
      .run(id, email.toLowerCase().trim(), codeHash, expiresAt, deliveryState, now.toISOString());

    return { id, expiresAt };
  },

  getActiveOtp(email: string) {
    const now = new Date().toISOString();
    return sqlite
      .prepare(`
        SELECT * FROM otp_codes
        WHERE LOWER(email) = LOWER(?) AND consumed = 0 AND delivery_state = 'READY' AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1
      `)
      .get(email.trim(), now) as any;
  },

  getLatestOtp(email: string) {
    return sqlite
      .prepare(`
        SELECT * FROM otp_codes
        WHERE LOWER(email) = LOWER(?)
        ORDER BY created_at DESC LIMIT 1
      `)
      .get(email.trim()) as any;
  },

  /** Atomically consumes a valid code or records one failed attempt. */
  applyOtpVerification(
    id: string,
    codeMatches: boolean,
    maxAttempts: number
  ): { status: 'verified' } | { status: 'failed'; attempts: number } | { status: 'locked'; attempts: number } | { status: 'inactive' } {
    const transaction = sqlite.transaction(() => {
      const otp = sqlite.prepare('SELECT * FROM otp_codes WHERE id = ?').get(id) as any;
      const now = new Date().toISOString();
      if (!otp || otp.consumed || otp.delivery_state !== 'READY' || otp.expires_at <= now) {
        return { status: 'inactive' as const };
      }

      if (otp.attempts >= maxAttempts) {
        sqlite.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').run(id);
        return { status: 'locked' as const, attempts: otp.attempts as number };
      }

      if (codeMatches) {
        sqlite.prepare('DELETE FROM otp_codes WHERE id = ?').run(id);
        return { status: 'verified' as const };
      }

      const attempts = otp.attempts + 1;
      sqlite.prepare('UPDATE otp_codes SET attempts = ?, consumed = ? WHERE id = ?').run(
        attempts,
        attempts >= maxAttempts ? 1 : 0,
        id
      );
      return attempts >= maxAttempts
        ? { status: 'locked' as const, attempts }
        : { status: 'failed' as const, attempts };
    });

    return transaction.immediate();
  },

  incrementOtpAttempts(id: string) {
    sqlite.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(id);
    const updated = sqlite.prepare('SELECT attempts FROM otp_codes WHERE id = ?').get(id) as { attempts: number } | undefined;
    return updated ? updated.attempts : 1;
  },

  consumeOtp(id: string) {
    sqlite.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').run(id);
  },

  deleteOtp(id: string) {
    sqlite.prepare('DELETE FROM otp_codes WHERE id = ?').run(id);
  },

  markOtpReady(id: string) {
    sqlite
      .prepare("UPDATE otp_codes SET delivery_state = 'READY' WHERE id = ? AND consumed = 0 AND expires_at > ?")
      .run(id, new Date().toISOString());
  },

  logOtpSend(email: string, ipAddress: string) {
    const id = 'send_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    sqlite
      .prepare('INSERT INTO otp_send_logs (id, email, ip_address, created_at) VALUES (?, ?, ?, ?)')
      .run(id, otpEmailKey(email), ipAddress || '127.0.0.1', now);
  },

  /** Atomically applies durable email/IP send limits and reserves one send slot. */
  reserveOtpSend(
    email: string,
    ipAddress: string,
    limits: { cooldownSeconds: number; maxPerEmailPerHour: number; maxPerIpPerHour: number }
  ): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const normalizedEmail = email.toLowerCase().trim();
    const emailKey = otpEmailKey(normalizedEmail);
    const clientIp = ipAddress || '127.0.0.1';
    const transaction = sqlite.transaction(() => {
      const nowMs = Date.now();
      const oneHourAgo = new Date(nowMs - 60 * 60 * 1000).toISOString();
      const emailCount = sqlite
        .prepare('SELECT COUNT(*) as count FROM otp_send_logs WHERE email = ? AND created_at >= ?')
        .get(emailKey, oneHourAgo) as { count: number };

      if (emailCount.count >= limits.maxPerEmailPerHour) {
        const oldest = sqlite
          .prepare('SELECT MIN(created_at) as created_at FROM otp_send_logs WHERE email = ? AND created_at >= ?')
          .get(emailKey, oneHourAgo) as { created_at: string | null };
        const elapsed = oldest.created_at ? Math.floor((nowMs - new Date(oldest.created_at).getTime()) / 1000) : 0;
        return { allowed: false as const, retryAfterSeconds: Math.max(1, 3600 - elapsed) };
      }

      const lastEmailSend = sqlite
        .prepare('SELECT created_at FROM otp_send_logs WHERE email = ? ORDER BY created_at DESC LIMIT 1')
        .get(emailKey) as { created_at: string } | undefined;
      if (lastEmailSend) {
        const elapsed = Math.floor((nowMs - new Date(lastEmailSend.created_at).getTime()) / 1000);
        if (elapsed < limits.cooldownSeconds) {
          return { allowed: false as const, retryAfterSeconds: limits.cooldownSeconds - elapsed };
        }
      }

      const ipCount = sqlite
        .prepare('SELECT COUNT(*) as count FROM otp_send_logs WHERE ip_address = ? AND created_at >= ?')
        .get(clientIp, oneHourAgo) as { count: number };
      if (ipCount.count >= limits.maxPerIpPerHour) {
        const oldest = sqlite
          .prepare('SELECT MIN(created_at) as created_at FROM otp_send_logs WHERE ip_address = ? AND created_at >= ?')
          .get(clientIp, oneHourAgo) as { created_at: string | null };
        const elapsed = oldest.created_at ? Math.floor((nowMs - new Date(oldest.created_at).getTime()) / 1000) : 0;
        return { allowed: false as const, retryAfterSeconds: Math.max(1, 3600 - elapsed) };
      }

      const id = 'send_' + crypto.randomBytes(8).toString('hex');
      sqlite
        .prepare('INSERT INTO otp_send_logs (id, email, ip_address, created_at) VALUES (?, ?, ?, ?)')
        .run(id, emailKey, clientIp, new Date(nowMs).toISOString());
      return { allowed: true as const };
    });

    return transaction.immediate();
  },

  getOtpSendsInLastHour(email: string): number {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = sqlite
      .prepare('SELECT COUNT(*) as count FROM otp_send_logs WHERE email = ? AND created_at >= ?')
      .get(otpEmailKey(email), oneHourAgo) as { count: number };
    return res ? res.count : 0;
  },

  getIpOtpSendsInLastHour(ipAddress: string): number {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = sqlite
      .prepare('SELECT COUNT(*) as count FROM otp_send_logs WHERE ip_address = ? AND created_at >= ?')
      .get(ipAddress || '127.0.0.1', oneHourAgo) as { count: number };
    return res ? res.count : 0;
  },

  getLastOtpSendTime(email: string): Date | null {
    const row = sqlite
      .prepare('SELECT created_at FROM otp_send_logs WHERE email = ? ORDER BY created_at DESC LIMIT 1')
      .get(otpEmailKey(email)) as { created_at: string } | undefined;
    return row ? new Date(row.created_at) : null;
  },

  // Manual Verification Fallback Requests
  createManualVerificationRequest(data: {
    name: string;
    enrollmentNumber: string;
    alternateEmail: string;
    note?: string;
  }) {
    const id = 'mvr_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    sqlite
      .prepare(`
        INSERT INTO manual_verification_requests (id, name, enrollment_number, alternate_email, note, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `)
      .run(
        id,
        data.name.trim(),
        data.enrollmentNumber.trim().toUpperCase(),
        data.alternateEmail.trim().toLowerCase(),
        data.note ? data.note.trim() : null,
        now,
        now
      );

    return {
      id,
      name: data.name.trim(),
      enrollmentNumber: data.enrollmentNumber.trim().toUpperCase(),
      alternateEmail: data.alternateEmail.trim().toLowerCase(),
      note: data.note || null,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
  },

  // Bikes
  getBikes(filters: {
    status?: string;
    brand?: string;
    bikeType?: string;
    fuelType?: string;
    transmission?: string;
    hubId?: string;
    search?: string;
    onlyActive?: boolean;
    onlyApproved?: boolean;
    maxPrice?: number;
  } = {}) {
    let sql = 'SELECT * FROM bikes WHERE 1=1';
    const params: any[] = [];

    if (filters.onlyActive) {
      sql += " AND availability_status = 'AVAILABLE'";
    }
    if (filters.onlyApproved) {
      sql += " AND approval_status = 'APPROVED'";
    }
    if (filters.bikeType && filters.bikeType !== 'all') {
      sql += ' AND bike_type = ?';
      params.push(filters.bikeType);
    }
    if (filters.fuelType && filters.fuelType !== 'all') {
      sql += ' AND fuel_type = ?';
      params.push(filters.fuelType);
    }
    if (filters.transmission && filters.transmission !== 'all') {
      sql += ' AND transmission = ?';
      params.push(filters.transmission);
    }
    if (filters.hubId && filters.hubId !== 'all') {
      sql += ' AND hub_id = ?';
      params.push(filters.hubId);
    }
    if (filters.maxPrice && filters.maxPrice > 0) {
      sql += ' AND hourly_rate_inr <= ?';
      params.push(filters.maxPrice);
    }
    if (filters.search) {
      sql += ' AND (LOWER(brand) LIKE ? OR LOWER(model) LIKE ?)';
      params.push(`%${filters.search.toLowerCase()}%`, `%${filters.search.toLowerCase()}%`);
    }

    const rows = sqlite.prepare(sql).all(...params) as any[];
    return rows.map(this.mapBikeRow);
  },

  getBikeById(id: string) {
    const row = sqlite.prepare('SELECT * FROM bikes WHERE id = ?').get(id) as any;
    return row ? this.mapBikeRow(row) : null;
  },

  createBike(data: any) {
    const id = data.id || 'bike_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    sqlite
      .prepare(`
        INSERT INTO bikes (
          id, owner_id, brand, model, year, registration_number, registration_masked,
          display_registration_to_public, bike_type, fuel_type, transmission, description,
          images, hourly_rate_inr, daily_rate_inr, security_deposit_inr, hub_id, hub_name,
          availability_status, approval_status, admin_notes, rating, total_trips, condition_notes,
          features, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `)
      .run(
        id,
        data.ownerId,
        data.brand,
        data.model,
        data.year,
        data.registrationNumber,
        data.registrationMasked || `${data.registrationNumber.slice(0, 4)}-****`,
        data.displayRegistrationToPublic ? 1 : 0,
        data.bikeType,
        data.fuelType,
        data.transmission,
        data.description || '',
        JSON.stringify(data.images || []),
        data.hourlyRateInr,
        data.dailyRateInr,
        data.securityDepositInr || 1500,
        data.hubId,
        data.hubName,
        data.availabilityStatus || 'AVAILABLE',
        data.approvalStatus || 'PENDING_APPROVAL',
        data.adminNotes || null,
        data.rating || 5.0,
        data.totalTrips || 0,
        data.conditionNotes || 'Coordinator Inspected',
        JSON.stringify(data.features || []),
        now,
        now
      );

    return this.getBikeById(id);
  },

  mapBikeRow(row: any) {
    return {
      id: row.id,
      ownerId: row.owner_id,
      brand: row.brand,
      model: row.model,
      year: row.year,
      registrationNumber: row.registration_number,
      registrationMasked: row.registration_masked,
      displayRegistrationToPublic: Boolean(row.display_registration_to_public),
      bikeType: row.bike_type,
      fuelType: row.fuel_type,
      transmission: row.transmission,
      description: row.description,
      images: JSON.parse(row.images || '[]'),
      hourlyRateInr: row.hourly_rate_inr,
      dailyRateInr: row.daily_rate_inr,
      securityDepositInr: row.security_deposit_inr,
      hubId: row.hub_id,
      hubName: row.hub_name,
      availabilityStatus: row.availability_status,
      approvalStatus: row.approval_status,
      adminNotes: row.admin_notes,
      rating: row.rating,
      totalTrips: row.total_trips,
      conditionNotes: row.condition_notes,
      features: JSON.parse(row.features || '[]'),
      isInstantBooking: Boolean(row.features && row.features.includes('Instant Booking')),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  // Bookings with Atomic Transaction & Concurrency Overlap Lock
  getBookings(renterId?: string) {
    let sql = 'SELECT * FROM bookings';
    const params: any[] = [];
    if (renterId) {
      sql += ' WHERE renter_id = ?';
      params.push(renterId);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = sqlite.prepare(sql).all(...params) as any[];
    return rows.map(this.mapBookingRow);
  },

  getBookingById(id: string) {
    const row = sqlite.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as any;
    return row ? this.mapBookingRow(row) : null;
  },

  checkBikeAvailability(bikeId: string, startTimeIso: string, endTimeIso: string) {
    const conflicts = sqlite
      .prepare(`
        SELECT start_time, end_time, booking_status FROM bookings
        WHERE bike_id = ?
          AND booking_status NOT IN ('CANCELLED', 'REJECTED', 'COMPLETED')
          AND NOT (end_time <= ? OR start_time >= ?)
      `)
      .all(bikeId, startTimeIso, endTimeIso) as any[];

    if (conflicts.length > 0) {
      return {
        available: false,
        reason: 'Selected vehicle is already reserved for this duration at campus hub',
        blockedRanges: conflicts.map((c) => ({
          start: c.start_time,
          end: c.end_time,
          reason: 'Reserved by another student',
        })),
      };
    }

    return { available: true };
  },

  // Atomic transaction for booking insertion to guarantee zero race conditions
  createBookingAtomic(data: {
    bikeId: string;
    renterId: string;
    renterName: string;
    renterPhone: string;
    renterEmail: string;
    renterEnrollment: string;
    pickupHubId: string;
    pickupHubName: string;
    startTime: string;
    endTime: string;
    durationHours: number;
    rentalChargeInr: number;
    platformFeeInr: number;
    depositInr: number;
    depositType: string;
    totalPayableInr: number;
    drivingLicenseDocPath?: string;
    studentIdDocPath?: string;
    agreedTermsVersion: string;
    idempotencyKey?: string;
  }) {
    const insertBookingTx = sqlite.transaction(() => {
      // 1. Double submit check via idempotency key
      if (data.idempotencyKey) {
        const existing = sqlite
          .prepare('SELECT * FROM bookings WHERE idempotency_key = ?')
          .get(data.idempotencyKey) as any;
        if (existing) {
          return this.mapBookingRow(existing);
        }
      }

      // 2. Overlap check with table lock inside transaction
      const conflicts = sqlite
        .prepare(`
          SELECT id FROM bookings
          WHERE bike_id = ?
            AND booking_status NOT IN ('CANCELLED', 'REJECTED', 'COMPLETED')
            AND NOT (end_time <= ? OR start_time >= ?)
        `)
        .all(data.bikeId, data.startTime, data.endTime);

      if (conflicts.length > 0) {
        throw new Error('CONCURRENT_CONFLICT: Vehicle was just reserved by another student');
      }

      // 3. Create booking
      const id = `BK-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const now = new Date().toISOString();
      const handoverCode = `RP-${Math.floor(1000 + Math.random() * 9000)}`;
      const qrPassCode = `PASS-RP-2026-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      sqlite
        .prepare(`
          INSERT INTO bookings (
            id, bike_id, renter_id, renter_name, renter_phone, renter_email, renter_enrollment,
            pickup_hub_id, pickup_hub_name, start_time, end_time, duration_hours,
            rental_charge_inr, platform_fee_inr, deposit_inr, deposit_type, total_payable_inr,
            booking_status, verification_status, payment_status, handover_code, qr_pass_code,
            driving_license_doc_path, student_id_doc_path, agreed_terms_version,
            idempotency_key, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            'CONFIRMED', 'verified', 'pending', ?, ?, ?, ?, ?, ?, ?, ?
          )
        `)
        .run(
          id,
          data.bikeId,
          data.renterId,
          data.renterName,
          data.renterPhone,
          data.renterEmail,
          data.renterEnrollment,
          data.pickupHubId,
          data.pickupHubName,
          data.startTime,
          data.endTime,
          data.durationHours,
          data.rentalChargeInr,
          data.platformFeeInr,
          data.depositInr,
          data.depositType,
          data.totalPayableInr,
          handoverCode,
          qrPassCode,
          data.drivingLicenseDocPath || null,
          data.studentIdDocPath || null,
          data.agreedTermsVersion,
          data.idempotencyKey || null,
          now,
          now
        );

      return this.getBookingById(id);
    });

    return insertBookingTx();
  },

  updateBookingStatus(id: string, newStatus: string, reason?: string) {
    const now = new Date().toISOString();
    sqlite
      .prepare(`
        UPDATE bookings
        SET booking_status = ?, cancellation_reason = ?, updated_at = ?
        WHERE id = ?
      `)
      .run(newStatus, reason || null, now, id);
    return this.getBookingById(id);
  },

  mapBookingRow(row: any) {
    const bike = db.getBikeById(row.bike_id);
    return {
      id: row.id,
      bikeId: row.bike_id,
      bike,
      userId: row.renter_id,
      renterName: row.renter_name,
      renterPhone: row.renter_phone,
      renterEmail: row.renter_email,
      renterEnrollment: row.renter_enrollment,
      pickupHubId: row.pickup_hub_id,
      pickupHubName: row.pickup_hub_name,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.booking_status,
      pricing: {
        durationHours: row.duration_hours,
        rentalChargeInr: row.rental_charge_inr,
        platformFeeInr: row.platform_fee_inr,
        depositInr: row.deposit_inr,
        depositType: row.deposit_type,
        totalPayableAtHandoverInr: row.total_payable_inr,
        isServerCalculated: true,
      },
      handoverCode: row.handover_code,
      qrPassCode: row.qr_pass_code,
      depositType: row.deposit_type,
      drivingLicenseDocPath: row.driving_license_doc_path,
      studentIdDocPath: row.student_id_doc_path,
      createdAt: row.created_at,
      cancellationReason: row.cancellation_reason,
    };
  },

  // Audit Logs (Zero passwords, OTPs, or document contents logged)
  logAudit(data: {
    actorId: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string;
    diff?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const id = 'aud_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    // Sanitize diff to ensure no secrets can ever be logged
    let sanitizedDiff = null;
    if (data.diff) {
      const copy = { ...data.diff };
      delete copy.password;
      delete copy.passwordHash;
      delete copy.code;
      delete copy.codeHash;
      delete copy.token;
      delete copy.sessionToken;
      delete copy.documentBase64;
      sanitizedDiff = JSON.stringify(copy);
    }

    sqlite
      .prepare(`
        INSERT INTO audit_logs (id, actor_id, actor_role, action, target_type, target_id, diff, ip_address, user_agent, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        data.actorId,
        data.actorRole,
        data.action,
        data.targetType,
        data.targetId,
        sanitizedDiff,
        data.ipAddress || null,
        data.userAgent || null,
        now
      );
  },
};

// Initialize schema immediately
runMigrations();
