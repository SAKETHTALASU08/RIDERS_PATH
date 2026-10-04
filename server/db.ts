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
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      icfai_enrollment TEXT UNIQUE NOT NULL,
      academic_year TEXT NOT NULL,
      course TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
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
      created_at TEXT NOT NULL
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
  `);

  // Seed default admin config if missing
  const existingConfig = sqlite.prepare('SELECT key FROM config WHERE key = ?').get('platform_config');
  if (!existingConfig) {
    const publicConfig = {
      appName: 'Riders Path',
      campusName: 'ICFAI Foundation for Higher Education, Hyderabad',
      allowedEmailDomain: 'icfaiuniversity.in',
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
    INSERT OR IGNORE INTO users (id, full_name, email, phone, icfai_enrollment, academic_year, course, role, verification_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    'usr_system_admin',
    'Campus Fleet Administrator',
    'fleet.admin@icfaiuniversity.in',
    '+91 99999 00000',
    'ADMIN-ICFAI',
    'Faculty/Staff',
    'Campus Transport Desk',
    'admin',
    'verified',
    now,
    now
  );

  insertUser.run(
    'usr_owner_student_01',
    'Suhash Reddy',
    'suhash.reddy@icfaiuniversity.in',
    '+91 98480 11223',
    '21BSPH0101',
    '3rd Year',
    'B.Tech CSE',
    'owner',
    'verified',
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
    fullName: string;
    email: string;
    phone: string;
    icfaiEnrollment: string;
    academicYear: string;
    course: string;
    role?: string;
    verificationStatus?: string;
  }) {
    const id = data.id || 'usr_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    sqlite
      .prepare(`
        INSERT INTO users (id, full_name, email, phone, icfai_enrollment, academic_year, course, role, verification_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        data.fullName,
        data.email.toLowerCase(),
        data.phone,
        data.icfaiEnrollment.toUpperCase(),
        data.academicYear,
        data.course,
        data.role || 'student',
        data.verificationStatus || 'unverified',
        now,
        now
      );
    return this.getUserById(id);
  },

  updateUser(id: string, updates: Partial<{ fullName: string; phone: string; course: string; academicYear: string; icfaiEnrollment: string; verificationStatus: string }>) {
    const user = this.getUserById(id);
    if (!user) return null;

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.fullName !== undefined) {
      fields.push('full_name = ?');
      values.push(updates.fullName);
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
      values.push(updates.icfaiEnrollment);
    }
    if (updates.verificationStatus !== undefined) {
      fields.push('verification_status = ?');
      values.push(updates.verificationStatus);
    }

    if (fields.length === 0) return user;

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    sqlite.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
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

  // OTP Codes
  storeOtp(email: string, code: string, validityMinutes = 5) {
    const id = 'otp_' + crypto.randomBytes(8).toString('hex');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + validityMinutes * 60 * 1000).toISOString();

    sqlite
      .prepare(`
        INSERT INTO otp_codes (id, email, code_hash, expires_at, consumed, attempts, created_at)
        VALUES (?, ?, ?, ?, 0, 0, ?)
      `)
      .run(id, email.toLowerCase(), codeHash, expiresAt, now.toISOString());

    return { id, expiresAt };
  },

  verifyOtp(email: string, code: string): boolean {
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const now = new Date().toISOString();

    // Check unconsumed valid OTP
    const row = sqlite
      .prepare(`
        SELECT * FROM otp_codes
        WHERE LOWER(email) = LOWER(?) AND consumed = 0 AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1
      `)
      .get(email, now) as any;

    if (!row) return false;

    // Increment attempts
    sqlite.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);

    if (row.attempts >= 5) {
      // Lockout code
      sqlite.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').run(row.id);
      return false;
    }

    if (row.code_hash === codeHash) {
      sqlite.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').run(row.id);
      return true;
    }

    return false;
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
