/**
 * tests/integration/auth-sessions-live.test.js
 *
 * GET /api/v1/auth/sessions/live — school-wide blocking sign-ins.
 *
 * Login sessions are not device rows, so a stuck "already signed in"
 * account never appears in Classroom Devices. This endpoint makes every
 * blocking session discoverable so an admin can end it (DELETE
 * /users/:id/sessions) and unblock the next login.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;
let teacherToken;
let studentId;
let studentToken;

async function login(username, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  const passwordHash = await bcrypt.hash('student123', 4);
  const student = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'stuck-student',
      name: 'Stuck Student',
      password_hash: passwordHash,
      role: 'student',
      status: 'active',
    },
  });
  studentId = student.id;
  await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'session-teacher',
      name: 'Session Teacher',
      password_hash: passwordHash,
      role: 'teacher',
      status: 'active',
    },
  });

  adminToken = await login('admin', 'admin123');
  teacherToken = await login('session-teacher', 'student123');
  studentToken = await login('stuck-student', 'student123');
});

afterAll(async () => {
  await teardownTestDb();
});

describe('GET /api/v1/auth/sessions/live', () => {
  it('lists the blocking session, never token hashes; teachers get 403', async () => {
    const res = await request(app)
      .get('/api/v1/auth/sessions/live')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const entry = res.body.find((e) => String(e.user?.id) === String(studentId));
    expect(entry).toBeTruthy();
    expect(entry.blocking).toBe(true);
    expect(entry.user.password_hash).toBeUndefined();
    expect(entry.sessions.length).toBeGreaterThan(0);
    expect(entry.sessions.every((s) => s.live === true)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('token_hash');

    const forbidden = await request(app)
      .get('/api/v1/auth/sessions/live')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(forbidden.status).toBe(403);
  });

  it('omits stale tokens and other schools', async () => {
    // Stale but unrevoked token: expired activity window → not blocking.
    const staleUser = await prisma.user.create({
      data: {
        school_id: 'school-test',
        username: 'stale-student',
        name: 'Stale Student',
        password_hash: await bcrypt.hash('student123', 4),
        role: 'student',
        status: 'active',
      },
    });
    await prisma.refreshToken.create({
      data: {
        user_id: staleUser.id,
        token_hash: 'stale-hash-' + Date.now(),
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
        revoked: false,
        created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
      },
    });

    // Live token in another school: tenant-scoped out.
    const otherSchool = await prisma.school.create({
      data: { name: 'Other School', slug: 'other-school-' + Date.now() },
    });
    const outsider = await prisma.user.create({
      data: {
        school_id: otherSchool.id,
        username: 'outsider',
        name: 'Outsider',
        password_hash: await bcrypt.hash('student123', 4),
        role: 'student',
        status: 'active',
      },
    });
    await prisma.refreshToken.create({
      data: {
        user_id: outsider.id,
        token_hash: 'outsider-hash-' + Date.now(),
        expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
        revoked: false,
      },
    });

    const res = await request(app)
      .get('/api/v1/auth/sessions/live')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.map((e) => String(e.user?.id));
    expect(ids).not.toContain(String(staleUser.id));
    expect(ids).not.toContain(String(outsider.id));
    expect(ids).toContain(String(studentId));
  });

  it('admin revoke clears the list and unblocks the next login', async () => {
    // Second login is rejected while the session lives.
    const blocked = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'stuck-student', password: 'student123' });
    expect(blocked.status).toBe(409);

    const kill = await request(app)
      .delete('/api/v1/users/' + studentId + '/sessions')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(kill.status).toBe(200);
    expect(kill.body.revoked).toBeGreaterThan(0);

    const after = await request(app)
      .get('/api/v1/auth/sessions/live')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(after.status).toBe(200);
    expect(after.body.map((e) => String(e.user?.id))).not.toContain(String(studentId));

    // The stuck account signs in cleanly now.
    const fresh = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'stuck-student', password: 'student123' });
    expect(fresh.status).toBe(200);
    expect(fresh.body.accessToken).toBeTruthy();
    studentToken = fresh.body.accessToken;
  });
});
