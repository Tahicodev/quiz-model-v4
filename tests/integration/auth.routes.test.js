/**
 * tests/integration/auth.routes.test.js
 *
 * SuperTest integration tests for the auth endpoints (spec §25 + Phase 5
 * checkpoint: "Auth flow (login → access token → refresh → logout) verified").
 *
 * Uses an isolated SQLite test DB seeded with one school + admin user.
 * Refresh tokens are exchanged via httpOnly cookies (matching the real routes).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;

beforeAll(async () => {
  await setupTestDb();
  app = (await import('./helpers/app.js')).default;
});

afterAll(async () => {
  await teardownTestDb();
});

const BASE = '/api/v1/auth';

describe('Auth routes', () => {
  let accessToken;
  let cookie; // raw Cookie header value from set-cookie

  it('POST /login with valid credentials returns user + accessToken + cookie', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ username: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.accessToken).toEqual(expect.any(String));
    // Refresh token is in the cookie, not the body
    expect(res.body.refreshToken).toBeUndefined();
    // Sensitive fields stripped
    expect(res.body.user.password_hash).toBeUndefined();

    // Capture the auth cookie + bearer token for subsequent requests
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    // set-cookie is an array of strings; extract the refreshToken
    cookie = Array.isArray(setCookie) ? setCookie : [setCookie];
    accessToken = res.body.accessToken;
  });

  it('POST /login with wrong password returns 401', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ username: 'admin', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /login with unknown user returns 401', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ username: 'nobody', password: 'x' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /login with empty fields returns 422 (ValidationError)', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ username: '', password: '' });

    expect(res.status).toBe(422);
  });

  it('POST /refresh with a valid cookie returns a new access token + rotated cookie', async () => {
    const res = await request(app)
      .post(`${BASE}/refresh`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    // Refresh token is rotated in the cookie, not body
    expect(res.body.refreshToken).toBeUndefined();

    // Update the cookie and access token for logout
    const setCookie = res.headers['set-cookie'];
    if (setCookie) cookie = Array.isArray(setCookie) ? setCookie : [setCookie];
    accessToken = res.body.accessToken;
  });

  it('POST /refresh without a cookie returns 401', async () => {
    const res = await request(app)
      .post(`${BASE}/refresh`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /logout with valid cookie + auth revokes the token and succeeds', async () => {
    const res = await request(app)
      .post(`${BASE}/logout`)
      .set('Cookie', cookie)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });

  it('the revoked token cannot be used again for refresh', async () => {
    const res = await request(app)
      .post(`${BASE}/refresh`)
      .set('Cookie', cookie);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('/health returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
