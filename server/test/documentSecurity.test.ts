import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import sharp from 'sharp';
import { app } from '../../server';
import { db, sqlite } from '../db';
import { env } from '../config/env';
import { ADMIN_SESSION_COOKIE, STUDENT_SESSION_COOKIE } from '../middleware/auth';
import { purgeExpiredDocuments } from '../services/documentRetention';
import { readPrivateDocument, storePrivateDocument } from '../services/privateDocumentStorage';

describe('Private document upload and review security', () => {
  const studentToken = crypto.randomBytes(32).toString('hex');
  const otherStudentToken = crypto.randomBytes(32).toString('hex');
  const adminToken = crypto.randomBytes(32).toString('hex');
  const student = db.createUser({ fullName: 'Document Test Student', email: `document-${crypto.randomUUID()}@student.example.edu`, icfaiEnrollment: `D${crypto.randomUUID().slice(0, 7)}`, phone: '9848099887', emailVerified: 1, profileComplete: 1 });
  const otherStudent = db.createUser({ fullName: 'Other Document Student', email: `other-${crypto.randomUUID()}@student.example.edu`, icfaiEnrollment: `O${crypto.randomUUID().slice(0, 7)}`, phone: '9848099888', emailVerified: 1, profileComplete: 1 });
  let consentId = '';
  let documentId = '';

  beforeAll(() => {
    db.createSession(studentToken, student.id, 'student');
    db.createSession(otherStudentToken, otherStudent.id, 'student');
    db.createSession(adminToken, 'usr_system_admin', 'admin');
  });

  afterAll(() => {
    sqlite.prepare('DELETE FROM user_documents WHERE user_id IN (?, ?)').run(student.id, otherStudent.id);
    sqlite.prepare('DELETE FROM document_consents WHERE user_id IN (?, ?)').run(student.id, otherStudent.id);
    sqlite.prepare('DELETE FROM sessions WHERE id IN (?, ?, ?)').run(studentToken, otherStudentToken, adminToken);
    sqlite.prepare('DELETE FROM users WHERE id IN (?, ?)').run(student.id, otherStudent.id);
  });

  it('records explicit consent and validates uploaded image bytes before encrypted storage', async () => {
    const config = await request(app).get('/api/config');
    expect(config.status).toBe(200);
    expect(config.body.requireAadhaarUpload).toBe(true);

    const consent = await request(app)
      .post('/api/documents/consent')
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${studentToken}`])
      .send({ accepted: true, version: env.DOCUMENT_CONSENT_VERSION });
    expect(consent.status).toBe(201);
    consentId = consent.body.id;
    const storedConsent = sqlite.prepare('SELECT user_id, version, accepted_at FROM document_consents WHERE id = ?').get(consentId) as any;
    expect(storedConsent.user_id).toBe(student.id);
    expect(storedConsent.version).toBe(env.DOCUMENT_CONSENT_VERSION);
    expect(new Date(storedConsent.accepted_at).toString()).not.toBe('Invalid Date');

    const invalid = await request(app)
      .post('/api/upload/documents')
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${studentToken}`])
      .field('documentType', 'aadhaar')
      .field('consentId', consentId)
      .attach('file', Buffer.from('not an image'), { filename: 'fake.jpg', contentType: 'image/jpeg' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_FILE_TYPE');

    const png = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#fff' } }).png().toBuffer();
    const uploaded = await request(app)
      .post('/api/upload/documents')
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${studentToken}`])
      .field('documentType', 'aadhaar')
      .field('consentId', consentId)
      .attach('file', png, { filename: 'id.png', contentType: 'image/png' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.documentType).toBe('aadhaar');
    expect(uploaded.body.reviewStatus).toBe('pending');
    expect(uploaded.body.objectKey).toBeUndefined();
    expect(uploaded.body.path).toBeUndefined();
    documentId = uploaded.body.id;
    const row = sqlite.prepare('SELECT object_key, mime_type, byte_size, review_status FROM user_documents WHERE id = ?').get(documentId) as any;
    expect(row.object_key).not.toContain('id.png');
    expect(row.mime_type).toBe('image/jpeg');
    expect(row.byte_size).toBeGreaterThan(0);
    expect(row.review_status).toBe('pending');
  });

  it('isolates document ownership and gives admins audited short-lived viewing links', async () => {
    expect(documentId).toBeTruthy();
    const otherDelete = await request(app)
      .delete(`/api/upload/documents/${documentId}`)
      .set('Cookie', [`${STUDENT_SESSION_COOKIE}=${otherStudentToken}`]);
    expect(otherDelete.status).toBe(404);

    const crossRole = await request(app)
      .get('/api/admin/documents')
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${studentToken}`]);
    expect(crossRole.status).toBe(403);

    const queue = await request(app).get('/api/admin/documents').set('Cookie', [`${ADMIN_SESSION_COOKIE}=${adminToken}`]);
    expect(queue.status).toBe(200);
    const row = queue.body.find((item: any) => item.id === documentId);
    expect(row).toBeDefined();
    expect(row.emailMasked).not.toContain(student.email);
    expect(row.enrollmentMasked).not.toContain(student.icfai_enrollment);
    expect(row.object_key).toBeUndefined();
    expect(row.documentBase64).toBeUndefined();

    const view = await request(app).get(`/api/admin/documents/${documentId}/view-url`).set('Cookie', [`${ADMIN_SESSION_COOKIE}=${adminToken}`]);
    expect(view.status).toBe(200);
    expect(view.body.expiresInSeconds).toBe(60);
    expect(view.body.url).not.toContain('object_key');
    const viewPath = new URL(view.body.url, 'http://local.test').pathname + new URL(view.body.url, 'http://local.test').search;
    const image = await request(app).get(viewPath);
    expect(image.status).toBe(200);
    expect(image.headers['cache-control']).toMatch(/no-store/);
    expect(image.headers['content-type']).toMatch(/image\/jpeg/);
    const expired = await request(app).get(`/api/admin/documents/${documentId}/content?expires=1&signature=invalid`);
    expect(expired.status).toBe(403);
    const audit = sqlite.prepare(`SELECT action FROM audit_logs WHERE target_id = ? AND action = 'DOCUMENT_VIEW_URL_ISSUED'`).get(documentId);
    expect(audit).toBeDefined();
    const viewed = sqlite.prepare(`SELECT actor_id, action FROM audit_logs WHERE target_id = ? AND action = 'DOCUMENT_VIEWED'`).get(documentId) as any;
    expect(viewed?.action).toBe('DOCUMENT_VIEWED');
    expect(viewed.actor_id).toBe('usr_system_admin');
  });

  it('requires an admin reason for rejection and purges unused private uploads after configured retention', async () => {
    const denied = await request(app)
      .post(`/api/admin/documents/${documentId}/review`)
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${adminToken}`])
      .send({ status: 'rejected' });
    expect(denied.status).toBe(400);
    const rejected = await request(app)
      .post(`/api/admin/documents/${documentId}/review`)
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${adminToken}`])
      .send({ status: 'rejected', reason: 'Image is not readable' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.reviewStatus).toBe('rejected');

    const expiredId = crypto.randomUUID();
    const key = await storePrivateDocument(expiredId, Buffer.from('test document bytes'), 'image/jpeg');
    sqlite.prepare(`INSERT INTO user_documents (id,user_id,consent_id,document_type,object_key,storage_driver,mime_type,byte_size,uploaded_at) VALUES (?,?,?,'student_id',?,?, 'image/jpeg', ?, ?)`)
      .run(expiredId, student.id, consentId, key, 'local', 18, new Date(Date.now() - (env.UNUSED_DOCUMENT_RETENTION_DAYS + 2) * 24 * 60 * 60 * 1000).toISOString());
    expect(await purgeExpiredDocuments()).toBeGreaterThanOrEqual(1);
    expect(sqlite.prepare('SELECT id FROM user_documents WHERE id = ?').get(expiredId)).toBeUndefined();
    await expect(readPrivateDocument(key)).rejects.toThrow();
  });

  it('supports admin listing decisions and owner-facing change notes', async () => {
    const bike = db.createBike({
      ownerId: student.id, brand: 'Honda', model: 'Test Commuter', year: 2024,
      registrationNumber: 'TS08AB1234', bikeType: 'commuter', fuelType: 'petrol', transmission: 'manual',
      hourlyRateInr: 50, dailyRateInr: 350, hubId: 'hub_main_gate', hubName: 'Main Gate',
      images: ['/assets/test-bike.jpg'], features: [], availabilityStatus: 'AVAILABLE', approvalStatus: 'PENDING_APPROVAL',
    });
    const queue = await request(app).get('/api/admin/listings').set('Cookie', [`${ADMIN_SESSION_COOKIE}=${adminToken}`]);
    expect(queue.status).toBe(200);
    const row = queue.body.find((item: any) => item.id === bike.id);
    expect(row.ownerEmailMasked).not.toContain(student.email);
    expect(row.status).toBe('PENDING_APPROVAL');

    const changes = await request(app)
      .post(`/api/admin/listings/${bike.id}/review`)
      .set('Cookie', [`${ADMIN_SESSION_COOKIE}=${adminToken}`])
      .send({ decision: 'changes_requested', notes: 'Upload a clearer registration document.' });
    expect(changes.status).toBe(200);
    expect(changes.body.status).toBe('CHANGES_REQUESTED');
    const updated = sqlite.prepare('SELECT approval_status, admin_notes FROM bikes WHERE id = ?').get(bike.id) as any;
    expect(updated.approval_status).toBe('CHANGES_REQUESTED');
    expect(updated.admin_notes).toMatch(/clearer registration/i);
  });
});
