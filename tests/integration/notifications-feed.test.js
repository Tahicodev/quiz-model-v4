/**
 * tests/integration/notifications-feed.test.js
 *
 * Role-scoped notification feed (`GET /api/v1/notifications/feed`):
 *   - admin sees the whole school (staff + every student)
 *   - teacher sees their own actions plus their classes/students only
 *   - student sees their own actions only
 *   - read state is per user (one user's "mark read" never clears another's)
 *   - the actor is stamped from the JWT, so students cannot spoof staff.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;
let teacher1Token;
let teacher2Token;
let student1Token;
let student2Token;
let t1 = {};
let t2 = {};

async function login(username, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

function authed(token) {
  return request(app).get('/api/v1/notifications/feed').set('Authorization', `Bearer ${token}`);
}

async function feed(token) {
  const res = await authed(token);
  expect(res.status).toBe(200);
  return res.body;
}

function texts(items) {
  return (items || []).map((item) => String(item.title || ''));
}

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  const teacherHash = await bcrypt.hash('teacher123', 4);
  const studentHash = await bcrypt.hash('student123', 4);

  const teacher1 = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'feed-teacher1',
      name: 'Feed Teacher One',
      password_hash: teacherHash,
      role: 'teacher',
      status: 'active',
    },
  });
  const teacher2 = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'feed-teacher2',
      name: 'Feed Teacher Two',
      password_hash: teacherHash,
      role: 'teacher',
      status: 'active',
    },
  });
  t1 = teacher1;
  t2 = teacher2;

  const class1 = await prisma.class.create({
    data: { school_id: 'school-test', name: 'Feed Class One' },
  });
  const class2 = await prisma.class.create({
    data: { school_id: 'school-test', name: 'Feed Class Two' },
  });

  const student1 = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'feed-student1',
      name: 'Feed Student One',
      password_hash: studentHash,
      role: 'student',
      status: 'active',
      class_id: class1.id,
      numero: 'S-001',
    },
  });
  const student2 = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'feed-student2',
      name: 'Feed Student Two',
      password_hash: studentHash,
      role: 'student',
      status: 'active',
      class_id: class2.id,
      numero: 'S-002',
    },
  });

  // Each teacher manages only their own class.
  const assignments = {
    [teacher1.id]: [class1.id],
    [teacher2.id]: [class2.id],
  };
  await prisma.setting.upsert({
    where: {
      school_id_key: { school_id: 'school-test', key: 'teacherClassAssignments' },
    },
    create: {
      school_id: 'school-test',
      key: 'teacherClassAssignments',
      value: JSON.stringify(assignments),
      visibility: 'teacher',
    },
    update: { value: JSON.stringify(assignments) },
  });

  adminToken = await login('admin', 'admin123');
  teacher1Token = await login('feed-teacher1', 'teacher123');
  teacher2Token = await login('feed-teacher2', 'teacher123');
  student1Token = await login('feed-student1', 'student123');
  student2Token = await login('feed-student2', 'student123');

  const post = (token, body) =>
    request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  // Distinct, recognizable activity rows.
  expect(
    (await post(adminToken, {
      type: 'admin_notice',
      message: 'ADMIN published a notice',
    })).status,
  ).toBe(201);
  expect(
    (await post(teacher1Token, {
      type: 'activity',
      message: 'T1 updated a question',
    })).status,
  ).toBe(201);
  expect(
    (await post(teacher2Token, {
      type: 'activity',
      message: 'T2 updated an exam',
    })).status,
  ).toBe(201);

  // Student profile request (class-scoped request type).
  expect(
    (await post(student1Token, {
      type: 'profile_request',
      message: 'S1 requested a profile update',
      data: { requestId: 'req-1', userId: student1.id, classId: class1.id },
    })).status,
  ).toBe(201);

  // Attempts are the student activity stream.
  await prisma.result.create({
    data: {
      school_id: 'school-test',
      user_id: student1.id,
      score: 90,
      total_points: 10,
      earned_points: 9,
      answers_json: '{}',
      mode: 'exam',
    },
  });
  await prisma.result.create({
    data: {
      school_id: 'school-test',
      user_id: student2.id,
      score: 40,
      total_points: 10,
      earned_points: 4,
      answers_json: '{}',
      mode: 'exam',
    },
  });

  // Server-side audit rows: one per role.
  await prisma.auditLog.create({
    data: {
      school_id: 'school-test',
      actor_id: t1.id,
      entity_type: 'question',
      entity_id: 'q-1',
      action: 'update',
    },
  });
  await prisma.auditLog.create({
    data: {
      school_id: 'school-test',
      actor_id: student1.id,
      entity_type: 'auth',
      entity_id: student1.id,
      action: 'login',
    },
  });

  globalThis.__feedIds = {
    class1: class1.id,
    class2: class2.id,
    student1: student1.id,
    student2: student2.id,
    teacher1: teacher1.id,
    teacher2: teacher2.id,
  };
}, 120000);

afterAll(async () => {
  await teardownTestDb();
});

describe('notification feed scoping', () => {
  it('admin sees the whole school', async () => {
    const body = await feed(adminToken);
    expect(body.scope).toBe('school');
    const joined = texts(body.items).join('\n');
    expect(joined).toContain('ADMIN published a notice');
    expect(joined).toContain('T1 updated a question');
    expect(joined).toContain('T2 updated an exam');
    expect(joined).toContain('Feed Student One completed');
    expect(joined).toContain('Feed Student Two completed');
    expect(joined).toContain('S1 requested a profile update');
  });

  it('teacher sees own activity, own classes and their students', async () => {
    const body = await feed(teacher1Token);
    expect(body.scope).toBe('teacher');
    const joined = texts(body.items).join('\n');
    expect(joined).toContain('T1 updated a question');
    expect(joined).toContain('Feed Student One completed');
    expect(joined).toContain('S1 requested a profile update');
    // ... and nothing from other teachers, admin or other classes.
    expect(joined).not.toContain('ADMIN published a notice');
    expect(joined).not.toContain('T2 updated an exam');
    expect(joined).not.toContain('Feed Student Two completed');
  });

  it('student sees only their own activity', async () => {
    const body = await feed(student1Token);
    expect(body.scope).toBe('self');
    const joined = texts(body.items).join('\n');
    expect(joined).toContain('S1 requested a profile update');
    expect(joined).toContain('Feed Student One completed');
    expect(joined).not.toContain('T1 updated a question');
    expect(joined).not.toContain('ADMIN published a notice');
    expect(joined).not.toContain('Feed Student Two completed');
  });

  it('another teacher in the same school sees only their own scope', async () => {
    const body = await feed(teacher2Token);
    const joined = texts(body.items).join('\n');
    expect(joined).toContain('T2 updated an exam');
    expect(joined).toContain('Feed Student Two completed');
    expect(joined).not.toContain('T1 updated a question');
    expect(joined).not.toContain('Feed Student One completed');
  });

  it('stamps the actor from the session (students cannot spoof staff)', async () => {
    const spoof = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${student1Token}`)
      .send({
        type: 'student_activity',
        message: 'SPOOF attempt from student',
        data: { actor: { id: t1.id, name: 'Feed Teacher One', role: 'teacher' } },
      });
    expect(spoof.status).toBe(201);

    const body = await feed(teacher1Token);
    const item = body.items.find((entry) => entry.title.includes('SPOOF attempt'));
    expect(item).toBeTruthy();
    expect(String(item.actor.id)).toBe(String(globalThis.__feedIds.student1));
    expect(item.actor.role).toBe('student');
  });

  it('keeps read state per user', async () => {
    const before = await feed(adminToken);

    // New activity created after the watermark...
    const created = await request(app)
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${teacher1Token}`)
      .send({ type: 'activity', message: 'T1 fresh activity' });
    expect(created.status).toBe(201);

    const adminUnread = await feed(adminToken);
    expect(adminUnread.unread).toBeGreaterThan(before.unread);

    const teacherUnread = await feed(teacher1Token);
    expect(teacherUnread.unread).toBeGreaterThan(0);

    // Admin reads; teacher's badge must stay.
    const marked = await request(app)
      .patch('/api/v1/notifications/read')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(marked.status).toBe(200);

    expect((await feed(adminToken)).unread).toBe(0);
    expect((await feed(teacher1Token)).unread).toBeGreaterThan(0);
  });
});
