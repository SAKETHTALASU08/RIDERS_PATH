import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../server';
import { db, sqlite } from '../db';
import { env } from '../config/env';
import { STUDENT_SESSION_COOKIE } from '../middleware/auth';
import { setMailer, MemoryTestMailer, NodemailerMailer, DevelopmentConsoleMailer } from '../services/mailer';

describe('Passwordless Email-OTP Authentication & Security Tests', () => {
  let testMailer: MemoryTestMailer;

  beforeAll(() => {
    // Configure allowed email domain for tests
    env.ALLOWED_EMAIL_DOMAINS = 'student.example.edu,alternate.example.org';
  });

  beforeEach(() => {
    // Reset test artifacts
    sqlite.prepare('DELETE FROM otp_codes').run();
    sqlite.prepare('DELETE FROM otp_send_logs').run();
    sqlite.prepare('DELETE FROM sessions').run();
    sqlite.prepare('DELETE FROM manual_verification_requests').run();
    sqlite.prepare('DELETE FROM verifications').run();
    sqlite.prepare('DELETE FROM bookings').run();
    sqlite.prepare("DELETE FROM users WHERE id NOT IN ('usr_system_admin', 'usr_owner_student_01')").run();

    // Use test mailer to intercept emails
    testMailer = new MemoryTestMailer();
    setMailer(testMailer);
  });

  // ----------------------------------------------------
  // 1. OTP REQUEST TESTS
  // ----------------------------------------------------
  describe('OTP Request (/api/auth/otp/request)', () => {
    it('returns the same generic success shape for disallowed and unknown email addresses', async () => {
      const disallowed = await request(app)
        .post('/api/auth/otp/request')
        .send({ email: 'attacker@gmail.com' });
      const unknownAllowed = await request(app)
        .post('/api/auth/otp/request')
        .send({ email: 'new.user@student.example.edu' });

      expect(disallowed.status).toBe(200);
      expect(unknownAllowed.status).toBe(200);
      expect(disallowed.body).toEqual(unknownAllowed.body);
      expect(disallowed.body.success).toBe(true);
      expect(disallowed.body.message).toMatch(/verification code has been dispatched/i);

      // Verify NO email was dispatched and NO code stored
      expect(testMailer.sentEmails.length).toBe(1);
      const inDb = sqlite.prepare('SELECT * FROM otp_codes WHERE email = ?').get('attacker@gmail.com');
      expect(inDb).toBeUndefined();
    });

    it('does not distinguish an existing account from a new address', async () => {
      db.createUser({ email: 'known.user@student.example.edu' });
      const known = await request(app)
        .post('/api/auth/otp/request')
        .send({ email: 'known.user@student.example.edu' });
      const unknown = await request(app)
        .post('/api/auth/otp/request')
        .send({ email: 'new.user.two@student.example.edu' });

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(known.body).toEqual(unknown.body);
    });

    it('dispatches a 6-digit numeric code for valid campus email domain', async () => {
      const targetEmail = 'student.fresh@student.example.edu';
      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cooldownSeconds).toBe(60);

      // Verify email was received by mailer
      expect(testMailer.sentEmails.length).toBe(1);
      const emailRecord = testMailer.getLastEmailFor(targetEmail);
      expect(emailRecord).toBeDefined();
      expect(emailRecord?.code).toMatch(/^[0-9]{6}$/);
      const sendLog = sqlite.prepare('SELECT email FROM otp_send_logs WHERE email = ?').get(
        crypto.createHash('sha256').update(targetEmail).digest('hex')
      ) as { email: string } | undefined;
      expect(sendLog?.email).toBe(crypto.createHash('sha256').update(targetEmail).digest('hex'));
      expect(sendLog?.email).not.toBe(targetEmail);
    });

    it('fails closed with a generic error when no email domains are configured', async () => {
      const configuredDomains = env.ALLOWED_EMAIL_DOMAINS;
      env.ALLOWED_EMAIL_DOMAINS = '';
      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ email: 'student@student.example.edu' });
      env.ALLOWED_EMAIL_DOMAINS = configuredDomains;

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        error: 'Unable to process the verification request at this time. Please try again later.',
        code: 'AUTH_UNAVAILABLE',
      });
      expect(testMailer.sentEmails).toHaveLength(0);
    });

    it('stores only HMAC-SHA256 hash in database and never plaintext code', async () => {
      const targetEmail = 'security.check@student.example.edu';
      await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });

      const emailRecord = testMailer.getLastEmailFor(targetEmail);
      const rawCode = emailRecord!.code;

      const dbRow = sqlite
        .prepare('SELECT * FROM otp_codes WHERE email = ?')
        .get(targetEmail) as any;

      expect(dbRow).toBeDefined();
      expect(dbRow.code_hash).not.toBe(rawCode);
      // HMAC-SHA256 hex string is 64 characters
      expect(dbRow.code_hash).toHaveLength(64);
      expect(dbRow.attempts).toBe(0);
      expect(dbRow.consumed).toBe(0);
    });

    it('enforces resend cooldown between rapid requests to the same email', async () => {
      const targetEmail = 'cooldown.test@student.example.edu';
      // First request
      const res1 = await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });
      expect(res1.status).toBe(200);

      // Immediate second request
      const res2 = await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });
      expect(res2.status).toBe(429);
      expect(res2.body.code).toBe('OTP_RATE_LIMITED');
      expect(res2.body.cooldownSeconds).toBeGreaterThan(0);
    });

    it('enforces per-email hourly cap', async () => {
      const targetEmail = 'hourly.cap@student.example.edu';
      // Artificially populate 5 sends in last hour
      for (let i = 0; i < 5; i++) {
        db.logOtpSend(targetEmail, '127.0.0.1');
      }

      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_RATE_LIMITED');
      expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('enforces the per-IP hourly cap from persistent SQLite send records', async () => {
      const originalLimit = env.OTP_MAX_SENDS_PER_IP_PER_HOUR;
      env.OTP_MAX_SENDS_PER_IP_PER_HOUR = 2;
      const ip = '203.0.113.45';
      db.logOtpSend('one@student.example.edu', ip);
      db.logOtpSend('two@student.example.edu', ip);

      const res = await request(app)
        .post('/api/auth/otp/request')
        .set('X-Forwarded-For', ip)
        .send({ email: 'three@student.example.edu' });

      env.OTP_MAX_SENDS_PER_IP_PER_HOUR = originalLimit;
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_RATE_LIMITED');
      expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('keeps the same generic response and removes the code after mail delivery fails', async () => {
      setMailer({ sendOtpEmail: vi.fn().mockRejectedValue(new Error('SMTP unavailable')) });
      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({ email: 'mail.failure@student.example.edu' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        message: 'If this is a valid campus email address, a verification code has been dispatched.',
        cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      });
      expect(sqlite.prepare('SELECT * FROM otp_codes WHERE email = ?').get('mail.failure@student.example.edu')).toBeUndefined();
    });

    it('removes the old development login and profile alias routes', async () => {
      const oldLogin = await request(app).post('/api/auth/dev-login').send({
        email: 'any@student.example.edu',
        enrollment: 'ABCD-123',
      });
      const oldProfile = await request(app).put('/api/auth/profile').send({});
      expect(oldLogin.status).toBe(404);
      expect(oldProfile.status).toBe(404);
    });

    it('invalidates previous unused code when a new OTP is requested for the same email', async () => {
      const targetEmail = 'invalidation.test@student.example.edu';

      // 1. Request first code
      await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });
      const firstCode = testMailer.getLastEmailFor(targetEmail)!.code;

      // Fast-forward cooldown by clearing send log
      sqlite.prepare('DELETE FROM otp_send_logs').run();

      // 2. Request second code
      await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });
      const secondCode = testMailer.getLastEmailFor(targetEmail)!.code;

      expect(firstCode).not.toBe(secondCode);

      // 3. Attempting to verify the first code MUST fail
      const verifyFirst = await request(app)
        .post('/api/auth/otp/verify')
        .send({ email: targetEmail, code: firstCode });
      expect(verifyFirst.status).toBe(400);

      // 4. Verifying the second code MUST succeed
      const verifySecond = await request(app)
        .post('/api/auth/otp/verify')
        .send({ email: targetEmail, code: secondCode });
      expect(verifySecond.status).toBe(200);
    });
  });

  // ----------------------------------------------------
  // 2. OTP VERIFICATION TESTS
  // ----------------------------------------------------
  describe('OTP Verification (/api/auth/otp/verify)', () => {
    it('verifies valid code, creates student user with emailVerified=true, profileComplete=false, and sets httpOnly session cookie with NO token in body', async () => {
      const targetEmail = 'new.student@student.example.edu';

      await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });
      const code = testMailer.getLastEmailFor(targetEmail)!.code;
      const timingSafeEqual = vi.spyOn(crypto, 'timingSafeEqual');

      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ email: targetEmail, code });

      expect(res.status).toBe(200);
      expect(res.body.requiresProfileCompletion).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.emailVerified).toBe(true);
      expect(res.body.user.profileComplete).toBe(false);
      expect(res.body.user.drivingLicenceVerified).toBe(false);
      expect(res.body.user.isVerified).toBe(false);
      expect(res.body.user.studentIdVerified).toBe(false);
      expect(new Date(res.body.user.createdAt).toString()).not.toBe('Invalid Date');
      expect(res.body.token).toBeUndefined(); // NO token in body
      expect(timingSafeEqual).toHaveBeenCalledOnce();
      timingSafeEqual.mockRestore();

      // Verify cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes(STUDENT_SESSION_COOKIE))).toBe(true);

      const me = await request(app).get('/api/auth/me').set('Cookie', cookies);
      expect(me.status).toBe(200);
      expect(me.body.createdAt).toBe(res.body.user.createdAt);
      expect(me.body.studentIdVerified).toBe(false);

      // Verify user in DB
      const userInDb = db.getUserByEmail(targetEmail);
      expect(userInDb).toBeDefined();
      expect(userInDb.email_verified).toBe(1);
      expect(userInDb.profile_complete).toBe(0);
      expect(userInDb.role).toBe('student');
    });

    it('enforces single-use: code cannot be reused once consumed', async () => {
      const targetEmail = 'single.use@student.example.edu';
      await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });
      const code = testMailer.getLastEmailFor(targetEmail)!.code;

      // First verification succeeds
      const firstRes = await request(app)
        .post('/api/auth/otp/verify')
        .send({ email: targetEmail, code });
      expect(firstRes.status).toBe(200);

      // Re-use must fail
      const reuseRes = await request(app)
        .post('/api/auth/otp/verify')
        .send({ email: targetEmail, code });
      expect(reuseRes.status).toBe(400);
      expect(reuseRes.body.code).toBe('INVALID_OTP');
    });

    it('atomically rejects a second verification based on a stale active-code read', async () => {
      const targetEmail = 'stale.read@student.example.edu';
      await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });
      const code = testMailer.getLastEmailFor(targetEmail)!.code;
      const staleFirstRead = db.getActiveOtp(targetEmail)!;
      const staleSecondRead = db.getActiveOtp(targetEmail)!;
      const expectedHash = crypto
        .createHmac('sha256', env.OTP_HMAC_SECRET)
        .update(`${targetEmail}:${code}`)
        .digest('hex');
      const expectedBuffer = Buffer.from(expectedHash, 'hex');
      const storedBuffer = Buffer.from(staleFirstRead.code_hash, 'hex');
      const matchesHash = expectedBuffer.length === storedBuffer.length
        && crypto.timingSafeEqual(expectedBuffer, storedBuffer);

      expect(db.applyOtpVerification(staleFirstRead.id, matchesHash, env.OTP_MAX_ATTEMPTS).status).toBe('verified');
      expect(db.applyOtpVerification(staleSecondRead.id, matchesHash, env.OTP_MAX_ATTEMPTS).status).toBe('inactive');
    });

    it('increments attempts on wrong code and returns remaining attempts', async () => {
      const targetEmail = 'attempts.test@student.example.edu';
      await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });

      const wrongRes = await request(app)
        .post('/api/auth/otp/verify')
        .send({ email: targetEmail, code: '000000' });

      expect(wrongRes.status).toBe(400);
      expect(wrongRes.body.code).toBe('INVALID_OTP');
      expect(wrongRes.body.attemptsRemaining).toBe(4);
    });

    it('locks out and invalidates code after max failed attempts', async () => {
      const targetEmail = 'lockout.test@student.example.edu';
      await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });
      const correctCode = testMailer.getLastEmailFor(targetEmail)!.code;

      // Fail 5 times
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post('/api/auth/otp/verify')
          .send({ email: targetEmail, code: '000000' });
      }

      // 5th failure triggers lockout
      const fifthRes = await request(app)
        .post('/api/auth/otp/verify')
        .send({ email: targetEmail, code: '000000' });
      expect(fifthRes.status).toBe(400);
      expect(fifthRes.body.code).toBe('OTP_LOCKED_OUT');

      // Subsequent attempt with correct code must now fail
      const correctAfterLockout = await request(app)
        .post('/api/auth/otp/verify')
        .send({ email: targetEmail, code: correctCode });
      expect(correctAfterLockout.status).toBe(400);
      expect(correctAfterLockout.body.code).toBe('OTP_LOCKED_OUT');
    });

    it('rejects expired OTP code', async () => {
      const targetEmail = 'expired.test@student.example.edu';
      await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });
      const code = testMailer.getLastEmailFor(targetEmail)!.code;

      // Expire code in DB manually
      const pastTime = new Date(Date.now() - 60000).toISOString();
      sqlite.prepare('UPDATE otp_codes SET expires_at = ? WHERE email = ?').run(pastTime, targetEmail);

      const res = await request(app)
        .post('/api/auth/otp/verify')
        .send({ email: targetEmail, code });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
    });
  });

  // ----------------------------------------------------
  // 3. SESSION SECURITY & ROTATION TESTS
  // ----------------------------------------------------
  describe('Session Security & Rotation', () => {
    it('revokes pre-login session ID upon login and issues fresh session', async () => {
      const targetEmail = 'session.rotation@student.example.edu';

      // Simulate a pre-login session token
      const preLoginToken = 'pre_login_token_abc_123';
      const user = db.createUser({ email: targetEmail });
      db.createSession(preLoginToken, user.id, 'student');

      // Request and verify OTP
      await request(app)
        .post('/api/auth/otp/request')
        .send({ email: targetEmail });
      const code = testMailer.getLastEmailFor(targetEmail)!.code;

      const res = await request(app)
        .post('/api/auth/otp/verify')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${preLoginToken}`])
        .send({ email: targetEmail, code });

      expect(res.status).toBe(200);

      // Verify pre-login session is revoked in DB
      const oldSession = db.getSession(preLoginToken);
      expect(oldSession).toBeNull();
      const cookie = (res.headers['set-cookie'] as string[]).find((value) => value.startsWith(`${STUDENT_SESSION_COOKIE}=`));
      const freshToken = cookie?.split(';', 1)[0].slice(`${STUDENT_SESSION_COOKIE}=`.length);
      expect(freshToken).toBeDefined();
      expect(freshToken).not.toBe(preLoginToken);
      expect(db.getSession(freshToken!)).not.toBeNull();
    });

    it('enforces logout, revokes session in DB and clears cookie', async () => {
      // Create session
      const token = 'active_session_to_logout';
      const user = db.createUser({ email: 'logout.user@student.example.edu' });
      db.createSession(token, user.id, 'student');

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${token}`]);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Session must be removed from DB
      expect(db.getSession(token)).toBeNull();

      // Subsequent /api/auth/me returns 401
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${token}`]);
      expect(meRes.status).toBe(401);
    });

    it('GET /api/auth/me returns 401 without active session', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('invalidates all sessions when a user role changes', () => {
      const user = db.createUser({ email: 'session.change@student.example.edu' });
      const first = 'role_change_session_a';
      const second = 'role_change_session_b';
      db.createSession(first, user.id, 'student');
      db.createSession(second, user.id, 'student');

      db.updateUser(user.id, { role: 'owner' });

      expect(db.getSession(first)).toBeNull();
      expect(db.getSession(second)).toBeNull();
    });

    it('invalidates all sessions when a user email changes', () => {
      const user = db.createUser({ email: 'email.change@student.example.edu' });
      const first = 'email_change_session_a';
      const second = 'email_change_session_b';
      db.createSession(first, user.id, 'student');
      db.createSession(second, user.id, 'student');

      db.updateUser(user.id, { email: 'new.email@student.example.edu' });

      expect(db.getSession(first)).toBeNull();
      expect(db.getSession(second)).toBeNull();
    });
  });

  // ----------------------------------------------------
  // 4. PROFILE COMPLETION & ENROLLMENT UNIQUENESS
  // ----------------------------------------------------
  describe('Profile Completion & Unique Enrollment', () => {
    it('completes student profile with valid enrollment and Indian phone', async () => {
      const email = 'profile.student@student.example.edu';
      const user = db.createUser({ email, emailVerified: 1, profileComplete: 0 });
      const token = 'profile_test_session_token';
      db.createSession(token, user.id, 'student');

      const res = await request(app)
        .put('/api/users/me/profile')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${token}`])
        .send({
          name: 'Priya Sharma',
          enrollmentNumber: 'ABCD-888',
          phone: '9848011223',
          course: 'B.Tech CSE',
          year: '2nd Year',
        });

      expect(res.status).toBe(200);
      expect(res.body.profileComplete).toBe(true);
      expect(res.body.enrollmentNumber).toBe('ABCD-888');

      const inDb = db.getUserById(user.id);
      expect(inDb.profile_complete).toBe(1);
      expect(inDb.icfai_enrollment).toBe('ABCD-888');
    });

    it('uses the configured shared enrollment validator and normalizes a +91 phone', async () => {
      const priorRegex = env.ENROLLMENT_FORMAT_REGEX;
      const priorExample = env.ENROLLMENT_FORMAT_EXAMPLE;
      env.ENROLLMENT_FORMAT_REGEX = '^STU-[0-9]{4}$';
      env.ENROLLMENT_FORMAT_EXAMPLE = 'STU-1234';
      const user = db.createUser({ email: 'configured.format@student.example.edu', emailVerified: 1 });
      const token = 'configured_format_session';
      db.createSession(token, user.id, 'student');

      const res = await request(app)
        .put('/api/users/me/profile')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${token}`])
        .send({
          name: 'Taylor Student',
          enrollmentNumber: 'stu-1234',
          phone: '+91 98765 43210',
          course: 'Computer Science',
          year: '1st Year',
        });

      env.ENROLLMENT_FORMAT_REGEX = priorRegex;
      env.ENROLLMENT_FORMAT_EXAMPLE = priorExample;
      expect(res.status).toBe(200);
      expect(res.body.enrollmentNumber).toBe('STU-1234');
      expect(res.body.phone).toBe('9876543210');
    });

    it('rejects duplicate enrollment number without leaking owner details', async () => {
      // First student registers enrollment
      db.createUser({
        fullName: 'First Student',
        email: 'student.first@student.example.edu',
        icfaiEnrollment: 'ABCD-777',
        profileComplete: 1,
      });

      // Second student tries to claim same enrollment
      const student2 = db.createUser({ email: 'student.second@student.example.edu', emailVerified: 1 });
      const token2 = 'student2_session_token';
      db.createSession(token2, student2.id, 'student');

      const res = await request(app)
        .put('/api/users/me/profile')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${token2}`])
        .send({
          name: 'Imposter Student',
          enrollmentNumber: 'ABCD-777',
          phone: '9848099887',
          course: 'BBA',
          year: '1st Year',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ENROLLMENT_CONFLICT');
      // Must NOT leak whose account it belongs to
      expect(res.body.error).not.toMatch(/student\.first/i);
    });

    it('rejects bookings if student has not completed profile', async () => {
      const incompleteUser = db.createUser({
        email: 'incomplete@student.example.edu',
        emailVerified: 1,
        profileComplete: 0,
      });
      const token = 'incomplete_booking_session';
      db.createSession(token, incompleteUser.id, 'student');

      const res = await request(app)
        .post('/api/bookings')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${token}`])
        .send({
          bikeId: 'bike-ather-450x',
          startTime: new Date(Date.now() + 3600000).toISOString(),
          endTime: new Date(Date.now() + 7200000).toISOString(),
          pickupHubId: 'hub_main_gate',
          depositType: 'laptop',
          drivingLicenceImage: '/uploads/dl.jpg',
          studentIdCardImage: '/uploads/id.jpg',
          agreedToTermsVersion: 'v2.1',
          idempotencyKey: 'idemp_incomplete_test',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PROFILE_INCOMPLETE');
    });

    it('rejects booking and owner onboarding when the email is not verified', async () => {
      const unverified = db.createUser({
        email: 'email.unverified@student.example.edu',
        emailVerified: 0,
        profileComplete: 1,
      });
      const token = 'unverified_gate_session';
      db.createSession(token, unverified.id, 'student');

      const booking = await request(app)
        .post('/api/bookings')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${token}`])
        .send({});
      const owner = await request(app)
        .post('/api/owner/onboard')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${token}`])
        .send({});

      expect(booking.status).toBe(403);
      expect(booking.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
      expect(owner.status).toBe(403);
      expect(owner.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    });

    it('requires an admin-approved driving licence before booking', async () => {
      const user = db.createUser({
        email: 'licence.pending@student.example.edu',
        emailVerified: 1,
        profileComplete: 1,
        drivingLicenceVerified: 0,
      });
      const token = 'licence_pending_session';
      db.createSession(token, user.id, 'student');

      const res = await request(app)
        .post('/api/bookings')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${token}`])
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('LICENCE_VERIFICATION_REQUIRED');
    });

    it('rejects owner onboarding if student has not completed profile', async () => {
      const incompleteUser = db.createUser({
        email: 'incomplete.owner@student.example.edu',
        emailVerified: 1,
        profileComplete: 0,
      });
      const token = 'incomplete_owner_session';
      db.createSession(token, incompleteUser.id, 'student');

      const res = await request(app)
        .post('/api/owner/onboard')
        .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${token}`])
        .send({
          brand: 'Honda',
          model: 'Activa 6G',
          year: 2023,
          bikeType: 'scooter',
          fuelType: 'petrol',
          transmission: 'automatic',
          registrationNumber: 'TS07AB1234',
          hourlyRateInr: 45,
          dailyRateInr: 320,
          preferredHubId: 'hub_main_gate',
          images: ['/uploads/activa.jpg'],
          rcDocumentImage: '/uploads/rc.jpg',
          insuranceDocumentImage: '/uploads/ins.jpg',
          payoutUpiId: 'student@okhdfcbank',
          ownerResponsibilityAgreed: true,
          termsVersionAgreed: 'v2.1',
          idempotencyKey: 'idemp_own_incomplete',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PROFILE_INCOMPLETE');
    });
  });

  // ----------------------------------------------------
  // 5. PRODUCTION LOGGING & FALLBACK VERIFICATION
  // ----------------------------------------------------
  describe('Production Privacy & Manual Fallback', () => {
    it('never logs OTP to console under production environment', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // Temporarily simulate production
      const originalEnv = env.NODE_ENV;
      (env as any).NODE_ENV = 'production';

      const mailer = new NodemailerMailer();
      // Stub the internal nodemailer sendMail method
      (mailer as any).transporter = {
        sendMail: vi.fn().mockResolvedValue({ messageId: 'test_id' }),
      };

      await mailer.sendOtpEmail({
        toEmail: 'prod.student@student.example.edu',
        code: '948214',
        validityMinutes: 10,
      });
      await expect(new DevelopmentConsoleMailer().sendOtpEmail({
        toEmail: 'prod.student@student.example.edu',
        code: '948214',
        validityMinutes: 10,
      })).rejects.toThrow(/disabled in production/i);

      (env as any).NODE_ENV = originalEnv;

      // Verify that 948214 was NEVER printed by console.log
      for (const call of consoleSpy.mock.calls) {
        const loggedString = call.join(' ');
        expect(loggedString).not.toContain('948214');
      }
      consoleSpy.mockRestore();
    });

    it('submits manual verification request, creates pending record, and grants NO session/tokens', async () => {
      const res = await request(app)
        .post('/api/auth/manual-verification-request')
        .send({
          name: 'Manual Applicant',
          enrollmentNumber: 'ABCD-333',
          alternateEmail: 'personal.applicant@gmail.com',
          note: 'Awaiting college email credentials from campus IT department.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.headers['set-cookie']).toBeUndefined(); // Zero session granted

      // Check DB record
      const inDb = sqlite
        .prepare('SELECT * FROM manual_verification_requests WHERE alternate_email = ?')
        .get('personal.applicant@gmail.com') as any;

      expect(inDb).toBeDefined();
      expect(inDb.status).toBe('PENDING');
      expect(inDb.enrollment_number).toBe('ABCD-333');
    });
  });
});
