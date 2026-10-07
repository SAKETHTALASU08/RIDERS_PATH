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
});
