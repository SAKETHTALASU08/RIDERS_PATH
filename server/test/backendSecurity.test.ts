import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../server';
import { db, sqlite } from '../db';
import { STUDENT_SESSION_COOKIE, ADMIN_SESSION_COOKIE } from '../middleware/auth';
import { env } from '../config/env';

describe('Backend Security & Authorization Integration Tests', () => {
  let student1Token: string;
  let student2Token: string;
  let student1Id: string;
  let student2Id: string;
  let bikeId: string = 'bike-ather-450x';
  let createdBookingId: string;

  function addDocumentsForUser(userId: string) {
    const consentId = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO document_consents (id,user_id,version,accepted_at) VALUES (?,?,?,?)`)
      .run(consentId, userId, env.DOCUMENT_CONSENT_VERSION, new Date().toISOString());
    const types = env.REQUIRE_AADHAAR_UPLOAD ? ['driving_license', 'student_id', 'aadhaar'] : ['driving_license', 'student_id'];
    const documentIds = types.map((documentType) => {
      const id = crypto.randomUUID();
      sqlite.prepare(`INSERT INTO user_documents (id,user_id,consent_id,document_type,object_key,storage_driver,mime_type,byte_size,uploaded_at) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(id, userId, consentId, documentType, `${id}.enc`, 'local', 'image/jpeg', 100, new Date().toISOString());
      return id;
    });
    return { documentConsentId: consentId, documentIds };
  }

  beforeAll(async () => {
    // Reset test artifacts in SQLite to ensure repeatable hermetic test execution
    sqlite.prepare('DELETE FROM user_documents').run();
    sqlite.prepare('DELETE FROM document_consents').run();
    sqlite.prepare('DELETE FROM bike_favorites').run();
    sqlite.prepare('DELETE FROM bookings').run();
    sqlite.prepare("DELETE FROM users WHERE id NOT IN ('usr_system_admin', 'usr_owner_student_01')").run();
    sqlite.prepare('DELETE FROM sessions').run();

    // Test-only fixtures issue sessions directly; the passwordless bypass route is removed.
    const student1 = db.createUser({
      fullName: 'Student One', email: 'student1@student.example.edu', icfaiEnrollment: 'ABCD-0555',
      phone: '9848099887', emailVerified: 1, profileComplete: 1, drivingLicenceVerified: 1,
    });
    student1Id = student1.id;
    student1Token = crypto.randomBytes(32).toString('hex');
    db.createSession(student1Token, student1Id, 'student');

    const student2 = db.createUser({
      fullName: 'Student Two', email: 'student2@student.example.edu', icfaiEnrollment: 'ABCD-0102',
      phone: '9848099888', emailVerified: 1, profileComplete: 1, drivingLicenceVerified: 1,
    });
    student2Id = student2.id;
    student2Token = crypto.randomBytes(32).toString('hex');
    db.createSession(student2Token, student2Id, 'student');

    // 3. Authenticate Admin
  });

  // 1. Unauthenticated requests to bookings and admin routes return 401/403
  it('rejects unauthenticated requests to protected booking and admin routes with 401/403', async () => {
    const unauthBooking = await request(app).get('/api/bookings/my');
    expect(unauthBooking.status).toBe(401);

    const unauthAdmin = await request(app).get('/api/bikes/all');
    expect(unauthAdmin.status).toBe(401);

    const unauthAudit = await request(app).get('/api/admin/actions');
    expect(unauthAudit.status).toBe(401);
  });

  // 2. Cross-role enforcement: Student cannot access admin routes
  it('prevents students from accessing admin endpoints (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/bikes/all')
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${student1Token}`]);
    expect(res.status).toBe(403);
  });

  it('keeps saved bike lists private to each student session', async () => {
    const first = await request(app)
      .put(`/api/favorites/${bikeId}`)
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student1Token}`]);
    expect(first.status).toBe(200);

    const ownFavorites = await request(app)
      .get('/api/favorites')
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student1Token}`]);
    const otherFavorites = await request(app)
      .get('/api/favorites')
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student2Token}`]);
    expect(ownFavorites.body).toEqual([bikeId]);
    expect(otherFavorites.body).toEqual([]);

    const remove = await request(app)
      .delete(`/api/favorites/${bikeId}`)
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student1Token}`]);
    expect(remove.status).toBe(200);
  });

  // 3. Availability and public bike responses contain no personal data or private fields
  it('ensures public bike catalog and availability leak zero owner PII or private data', async () => {
    const catalogRes = await request(app).get('/api/bikes');
    expect(catalogRes.status).toBe(200);
    expect(Array.isArray(catalogRes.body)).toBe(true);

    const firstBike = catalogRes.body[0];
    expect(firstBike).toBeDefined();

    // Verify Public DTO: No owner phone, no owner enrollment, registration masked
    expect(firstBike.ownerPhone).toBeUndefined();
    expect(firstBike.ownerEnrollment).toBeUndefined();
    expect(firstBike.ownerCourse).toBeUndefined();
    expect(firstBike.registrationNumber).toBeUndefined();
    expect(firstBike.registrationMasked).toMatch(/^[A-Z0-9]{4}-\*\*\*\*$/);

    // Verify availability endpoint leaks NO booking models or renter personal data
    const availRes = await request(app).get(
      `/api/bikes/${firstBike.id}/availability?startTime=2026-10-10T10:00:00.000Z&endTime=2026-10-10T14:00:00.000Z`
    );
    expect(availRes.status).toBe(200);
    expect(availRes.body.available).toBeDefined();
    expect(availRes.body.conflicts).toBeUndefined(); // Legacy leak removed
    expect(availRes.body.renterName).toBeUndefined();
    expect(availRes.body.renterPhone).toBeUndefined();
  });

  // 4. Server computes duration and price, ignoring client-supplied numbers
  it('computes pricing on the server from timestamps and ignores client-supplied duration/pricing', async () => {
    const startTime = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const endTime = new Date(Date.now() + 28 * 3600 * 1000).toISOString(); // 4 hours

    const bookingPayload = {
      bikeId,
      startTime,
      endTime,
      pickupHubId: 'hub_block_c',
      depositType: 'laptop',
      ...addDocumentsForUser(student1Id),
      agreedToTermsVersion: 'v2.1-campus-2026',
      idempotencyKey: 'idemp_test_' + Math.random().toString(36).substring(2, 9),
      // Attempted client manipulation:
      durationHours: 1,
      rentalChargeInr: 1,
      totalPayableInr: 1,
    };

    const res = await request(app)
      .post('/api/bookings')
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student1Token}`])
      .send(bookingPayload);

    expect(res.status).toBe(201);
    createdBookingId = res.body.id;

    // Server computed: Ather is ₹65/hr * 4 hrs = ₹260 rental + ₹21 platform fee (8%)
    expect(res.body.pricing.durationHours).toBe(4);
    expect(res.body.pricing.rentalChargeInr).toBe(260);
    expect(res.body.pricing.totalPayableAtHandoverInr).toBe(281);
    expect(res.body.pricing.isServerCalculated).toBe(true);
    expect(res.body.drivingLicenseDocPath).toBeUndefined();
    expect(res.body.studentIdDocPath).toBeUndefined();
    expect(res.body.status).toBe('PENDING_VERIFICATION');
  });

  // 5. A student cannot read another student's booking
  it('strictly forbids a student from reading another student’s booking record', async () => {
    expect(createdBookingId).toBeDefined();

    // Student 2 attempts to query Student 1's booking
    const res = await request(app)
      .get(`/api/bookings/${createdBookingId}`)
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student2Token}`]);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/access denied/i);

    // Student 1 can view their own booking
    const ownRes = await request(app)
      .get(`/api/bookings/${createdBookingId}`)
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student1Token}`]);
    expect(ownRes.status).toBe(200);
    expect(ownRes.body.id).toBe(createdBookingId);
  });

  // 6. Mass-assignment rejection
  it('rejects mass-assignment attempts on student profile updates', async () => {
    const maliciousPayload = {
      name: 'Legitimate Name',
      enrollmentNumber: 'ABCD-0555',
      phone: '9848099887',
      course: 'B.Tech CSE',
      year: '3rd Year',
      // Malicious mass-assignment attempts:
      role: 'admin',
      verificationStatus: 'verified_superadmin',
      passwordHash: 'injected_hash',
    };

    const res = await request(app)
      .put('/api/users/me/profile')
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student1Token}`])
      .send(maliciousPayload);

    expect(res.status).toBe(200);
    // Verify user record in DB: role MUST remain 'student'
    const userInDb = db.getUserById(student1Id);
    expect(userInDb.role).toBe('student');
    expect(userInDb.passwordHash).toBeUndefined();
  });

  // 7. Concurrent overlapping bookings produce exactly one success (Atomic lock)
  it('guarantees atomic concurrency: overlapping requests produce exactly one success', async () => {
    const conflictStart = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const conflictEnd = new Date(Date.now() + 52 * 3600 * 1000).toISOString();

    const payloadA = {
      bikeId: 'bike-tvs-jupiter',
      startTime: conflictStart,
      endTime: conflictEnd,
      pickupHubId: 'hub_main_gate',
      depositType: 'laptop',
      ...addDocumentsForUser(student1Id),
      agreedToTermsVersion: 'v2.1',
      idempotencyKey: 'idemp_race_a_' + Math.random().toString(36).substring(2, 9),
    };

    const payloadB = {
      bikeId: 'bike-tvs-jupiter',
      startTime: conflictStart,
      endTime: conflictEnd,
      pickupHubId: 'hub_main_gate',
      depositType: 'cash_hub',
      ...addDocumentsForUser(student2Id),
      agreedToTermsVersion: 'v2.1',
      idempotencyKey: 'idemp_race_b_' + Math.random().toString(36).substring(2, 9),
    };

    // Dispatch concurrent requests simultaneously
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/bookings')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student1Token}`])
        .send(payloadA),
      request(app)
        .post('/api/bookings')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student2Token}`])
        .send(payloadB),
    ]);

    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409); // One must succeed, other must be rejected with 409 Conflict
  });

  // 8. Invalid state transitions are rejected
  it('rejects invalid state transitions on completed or cancelled bookings', async () => {
    // Cancel the booking first
    const cancelRes = await request(app)
      .post(`/api/bookings/${createdBookingId}/cancel`)
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student1Token}`])
      .send({ reason: 'Trip cancelled' });
    expect(cancelRes.status).toBe(200);

    // Attempting to cancel an already cancelled booking must be rejected
    const secondCancel = await request(app)
      .post(`/api/bookings/${createdBookingId}/cancel`)
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student1Token}`])
      .send({ reason: 'Trip cancelled again' });
    expect(secondCancel.status).toBe(400);
    expect(secondCancel.body.error).toMatch(/cannot cancel/i);
  });

  // 9. Session expiry & logout enforcement
  it('enforces logout and revokes active session', async () => {
    // Logout student 2
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student2Token}`]);
    expect(logoutRes.status).toBe(200);

    // Verify token is now invalid in subsequent request
    const afterLogoutRes = await request(app)
      .get('/api/bookings/my')
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${student2Token}`]);
    expect(afterLogoutRes.status).toBe(401);
  });
});
