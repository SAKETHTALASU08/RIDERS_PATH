import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../server';

describe('Browser CSRF protection', () => {
  it('requires the double-submit token for same-origin unsafe requests', async () => {
    const browser = request.agent(app);
    const tokenResponse = await browser.get('/api/csrf-token');

    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body.csrfToken).toMatch(/^[a-f0-9]{64}$/);

    const missingHeader = await browser
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:5173');
    expect(missingHeader.status).toBe(403);
    expect(missingHeader.body.code).toBe('CSRF_TOKEN_REQUIRED');

    const acceptedByCsrf = await browser
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', tokenResponse.body.csrfToken);
    // Logout is idempotent and succeeds even when no session exists.
    expect(acceptedByCsrf.status).toBe(200);
    expect(acceptedByCsrf.body.success).toBe(true);
  });

  it('keeps admin and student CSRF tokens independent across the shared API origin', async () => {
    const browser = request.agent(app);
    const studentToken = (await browser.get('/api/csrf-token')).body.csrfToken as string;
    const adminTokenResponse = await browser.get('/api/admin/csrf-token');
    const adminToken = adminTokenResponse.body.csrfToken as string;
    expect(adminTokenResponse.headers['set-cookie']?.join(';')).toContain('rp_admin_csrf_token=');

    const adminLogin = await browser
      .post('/api/admin/login')
      .set('Origin', 'http://localhost:5174')
      .set('X-CSRF-Token', adminToken)
      .send({ username: 'invalid', password: 'invalid' });
    expect(adminLogin.status).not.toBe(403);

    const studentLogout = await browser
      .post('/api/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', studentToken);
    expect(studentLogout.status).toBe(200);
  });
});
