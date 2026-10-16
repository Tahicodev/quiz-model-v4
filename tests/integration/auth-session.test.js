/**
 * tests/integration/auth-session.test.js
 *
 * Single active session per user: a second login while a live session exists
 * is rejected (409 SESSION_ACTIVE) unless it explicitly takes over
 * (force:true), which ends the previous session server-side â€” its refresh
 * token dies and /auth/session reports it superseded.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;

function cookies(res) {
  const raw = res.headers['set-cookie'] || [];
  return raw.map((c) => String(c).split(';')[0]).join('; ');
}

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  const passwordHash = await bcrypt.hash('teacher123', 4);
  await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'solo-teacher',
      name: 'Solo Teacher',
      password_hash: passwordHash,
      role: 'teacher',
      status: 'active',
    },
  });
});

afterAll(async () => {
  await teardownTestDb();
});

describe('logout ends the server session', () => {  it('logout with an expired/missing access token still revokes (cookie proof)', async () => {
    const passwordHash = await bcrypt.hash('teacher123', 4);
    await prisma.user.create({
      data: {
        school_id: 'school-test',
        username: 'logout-teacher',
        name: 'Logout Teacher',
        password_hash: passwordHash,
        role: 'teacher',
        status: 'active',
      },
    });
    const first = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'logout-teacher', password: 'teacher123' });
    expect(first.status).toBe(200);
    const cookie = cookies(first);
    expect(cookie).toContain('refreshToken');

    // No Authorization header at all (e.g. access token long expired):
    // the presented refresh cookie is proof enough to revoke.
    const out = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .send({});
    expect(out.status).toBe(200);

    // Signing in again must NOT report "already signed in".
    const again = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'logout-teacher', password: 'teacher123' });
    expect(again.status).toBe(200);
    expect(again.body.accessToken).toBeTruthy();
  });
});

describe('single active session', () => {
  it('first login succeeds and reports an active session', async () => {
    const first = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'solo-teacher', password: 'teacher123' });
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeTruthy();

    const status = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${first.body.accessToken}`);
    expect(status.status).toBe(200);
    expect(status.body.active).toBe(true);

    globalThis.__firstAccess = first.body.accessToken;
    globalThis.__firstCookie = cookies(first);
  });

  it('second login without force is rejected (409 SESSION_ACTIVE)', async () => {
    const second = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'solo-teacher', password: 'teacher123' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SESSION_ACTIVE');
  });

  it('force login takes over; the old session is ended everywhere', async () => {
    const takeOver = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'solo-teacher', password: 'teacher123', force: true });
    expect(takeOver.status).toBe(200);
    expect(takeOver.body.accessToken).toBeTruthy();
    expect(takeOver.body.accessToken).not.toBe(globalThis.__firstAccess);

    // Old access token: session endpoint reports superseded.
    const oldStatus = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${globalThis.__firstAccess}`);
    expect(oldStatus.status).toBe(409);
    expect(oldStatus.body.error.code).toBe('SESSION_SUPERSEDED');

    // Old refresh token is dead.
    const oldRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', globalThis.__firstCookie)
      .send({});
    expect(oldRefresh.status).toBe(401);

    // New session is live.
    const newStatus = await request(app)
      .get('/api/v1/auth/session')
      .set('Authorization', `Bearer ${takeOver.body.accessToken}`);
    expect(newStatus.status).toBe(200);
    expect(newStatus.body.active).toBe(true);

    // ...and the new refresh token still rotates fine.
    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies(takeOver))
      .send({});
    expect(rotated.status).toBe(200);
    expect(rotated.body.accessToken).toBeTruthy();
  });
});

describe('admin session kill-switch', () => {
  it('admin lists sessions, teacher cannot, revoke unblocks login', async () => {
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin123', force: true });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.body.accessToken;

    const teacher = await prisma.user.findFirst({ where: { username: 'solo-teacher' } });

    // Admin sees session metadata, never hashes.
    const list = await request(app)
      .get('/api/v1/users/' + teacher.id + '/sessions')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.length).toBeGreaterThan(0);
    expect(list.body[0].token_hash).toBeUndefined();
    expect(list.body.some((s) => s.live)).toBe(true);

    // A teacher asking for sessions gets 403.
    const teacherLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'solo-teacher', password: 'teacher123', force: true });
    expect(teacherLogin.status).toBe(200);
    const forbidden = await request(app)
      .get('/api/v1/users/' + teacher.id + '/sessions')
      .set('Authorization', 'Bearer ' + teacherLogin.body.accessToken);
    expect(forbidden.status).toBe(403);

    // Admin ends every session: the teacher signs in fresh right after.
    const kill = await request(app)
      .delete('/api/v1/users/' + teacher.id + '/sessions')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(kill.status).toBe(200);
    expect(kill.body.revoked).toBeGreaterThan(0);

    const fresh = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'solo-teacher', password: 'teacher123' });
    expect(fresh.status).toBe(200);

    // Unknown user -> 404, not a leak oracle.
    const missing = await request(app)
      .get('/api/v1/users/no-such-user/sessions')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(missing.status).toBe(404);
  });
});