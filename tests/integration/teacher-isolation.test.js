/**
 * tests/integration/teacher-isolation.test.js
 *
 * Strict teacher isolation: a teacher's bootstrap payload must contain ONLY
 * their own rows — never another teacher's or the admin's exams, games,
 * tournaments, questions, categories, classes, results, sessions, messages
 * or activity notifications. Admins still see everything (they manage the
 * teachers' data). There is no shared library anymore.
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
let teacher1Id;
let teacher2Id;

async function login(username, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password });
  expect(res.status).toBe(200);
  return res.body.accessToken;
}

async function bootstrap(token) {
  const res = await request(app)
    .get('/api/v1/bootstrap')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.data;
}

const ids = (rows) => (rows || []).map((r) => String(r.id));

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  const passwordHash = await bcrypt.hash('teacher123', 4);
  const t1 = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'teacher1',
      name: 'Teacher One',
      password_hash: passwordHash,
      role: 'teacher',
      status: 'active',
    },
  });
  const t2 = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'teacher2',
      name: 'Teacher Two',
      password_hash: passwordHash,
      role: 'teacher',
      status: 'active',
    },
  });
  teacher1Id = t1.id;
  teacher2Id = t2.id;

  adminToken = await login('admin', 'admin123');
  teacher1Token = await login('teacher1', 'teacher123');
  teacher2Token = await login('teacher2', 'teacher123');

  const api = (token) => ({
    post: (path, body) =>
      request(app).post(path).set('Authorization', `Bearer ${token}`).send(body),
    patch: (path, body) =>
      request(app).patch(path).set('Authorization', `Bearer ${token}`).send(body),
  });

  // ── Admin seeds school-wide content ───────────────────────────────
  const adminCat = await api(adminToken).post('/api/v1/categories', {
    name: 'Admin Cat',
    color: '#3b82f6',
  });
  expect(adminCat.status).toBe(201);
  const adminQ = await api(adminToken).post('/api/v1/questions', {
    type: 'mcq',
    text: 'Admin question?',
    answer: 'A',
  });
  expect(adminQ.status).toBe(201);
  const adminExam = await api(adminToken).post('/api/v1/exams', {
    name: 'Admin Exam',
  });
  expect(adminExam.status).toBe(201);
  const adminGame = await api(adminToken).post('/api/v1/games', {
    name: 'Admin Game',
    question_ids: [adminQ.body.id],
  });
  expect(adminGame.status).toBe(201);
  const adminTournament = await api(adminToken).post(
    '/api/v1/tournaments',
    { name: 'Admin Tournament' },
  );
  expect(adminTournament.status).toBe(201);
  const adminClass = await api(adminToken).post('/api/v1/classes', {
    name: 'Admin Class',
  });
  expect(adminClass.status).toBe(201);
  const adminNotif = await api(adminToken).post('/api/v1/notifications', {
    type: 'activity',
    message: 'Admin did something',
    data: { actor: { id: 'user-test-admin', name: 'Admin' } },
  });
  expect(adminNotif.status).toBe(201);

  // ── Teacher 1 builds their own library ──────────────────────────
  const t1Class = await api(teacher1Token).post('/api/v1/classes', {
    name: 'T1 Class',
  });
  expect(t1Class.status).toBe(201);
  const t1Cat = await api(teacher1Token).post('/api/v1/categories', {
    name: 'T1 Cat',
    color: '#10b981',
  });
  expect(t1Cat.status).toBe(201);
  const t1Q = await api(teacher1Token).post('/api/v1/questions', {
    type: 'mcq',
    text: 'T1 question?',
    answer: 'B',
    category_id: t1Cat.body.id,
  });
  expect(t1Q.status).toBe(201);
  const t1Exam = await api(teacher1Token).post('/api/v1/exams', {
    name: 'T1 Exam',
  });
  expect(t1Exam.status).toBe(201);
  const t1ExamLink = await api(teacher1Token).patch(
    `/api/v1/exams/${t1Exam.body.id}`,
    { questions: [t1Q.body.id] },
  );
  expect(t1ExamLink.status).toBe(200);
  const t1Game = await api(teacher1Token).post('/api/v1/games', {
    name: 'T1 Game',
    question_ids: [t1Q.body.id],
  });
  expect(t1Game.status).toBe(201);
  const t1Tournament = await api(teacher1Token).post(
    '/api/v1/tournaments',
    { name: 'T1 Tournament' },
  );
  expect(t1Tournament.status).toBe(201);
  const t1Notif = await api(teacher1Token).post('/api/v1/notifications', {
    type: 'activity',
    message: 'T1 did something',
    data: { actor: { id: teacher1Id, name: 'Teacher One' } },
  });
  expect(t1Notif.status).toBe(201);
  // NOTE: POST /teacher-messages as teacher currently 403s (route allows
  // TEACHER but the service is admin-only) — pre-existing gap, out of scope
  // here. Seed directly; this suite tests bootstrap *read* scoping.
  await prisma.teacherMessage.create({
    data: {
      school_id: 'school-test',
      class_id: t1Class.body.id,
      teacher_id: teacher1Id,
      title: 'T1 note',
      body: 'hello class',
    },
  });

  // ── Teacher 2 builds theirs ─────────────────────────────────────
  const t2Q = await api(teacher2Token).post('/api/v1/questions', {
    type: 'mcq',
    text: 'T2 question?',
    answer: 'C',
  });
  expect(t2Q.status).toBe(201);
  const t2Exam = await api(teacher2Token).post('/api/v1/exams', {
    name: 'T2 Exam',
  });
  expect(t2Exam.status).toBe(201);

  // ── Students + results (seeded directly) ────────────────────────
  const pw = await bcrypt.hash('student123', 4);
  const s1 = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'student1',
      name: 'Student One',
      password_hash: pw,
      role: 'student',
      status: 'active',
      class_id: t1Class.body.id,
    },
  });
  const s2 = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'student2',
      name: 'Student Two',
      password_hash: pw,
      role: 'student',
      status: 'active',
      class_id: adminClass.body.id,
    },
  });
  await prisma.result.create({
    data: {
      school_id: 'school-test',
      user_id: s1.id,
      score: 80,
      total_points: 10,
      earned_points: 8,
      answers_json: '{}',
    },
  });
  await prisma.result.create({
    data: {
      school_id: 'school-test',
      user_id: s2.id,
      score: 50,
      total_points: 10,
      earned_points: 5,
      answers_json: '{}',
    },
  });
  await prisma.result.create({
    data: {
      school_id: 'school-test',
      user_id: null,
      score: 70,
      total_points: 10,
      earned_points: 7,
      answers_json: '{}',
    },
  });
  // Admin message to the OTHER class must not leak to teacher 1.
  await prisma.teacherMessage.create({
    data: {
      school_id: 'school-test',
      class_id: adminClass.body.id,
      teacher_id: 'user-test-admin',
      title: 'Admin note',
      body: 'other class only',
    },
  });

  // stash ids for assertions
  globalThis.__iso = {
    adminQ: adminQ.body.id,
    t1Q: t1Q.body.id,
    t2Q: t2Q.body.id,
    adminCat: adminCat.body.id,
    t1Cat: t1Cat.body.id,
    adminExam: adminExam.body.id,
    t1Exam: t1Exam.body.id,
    t2Exam: t2Exam.body.id,
    adminGame: adminGame.body.id,
    t1Game: t1Game.body.id,
    adminTournament: adminTournament.body.id,
    t1Tournament: t1Tournament.body.id,
    t1Class: t1Class.body.id,
    adminClass: adminClass.body.id,
    s1: s1.id,
    s2: s2.id,
  };
});

afterAll(async () => {
  await teardownTestDb();
});

describe('teacher bootstrap isolation', () => {
  it('teacher 1 receives only their own bank rows', async () => {
    const data = await bootstrap(teacher1Token);
    const iso = globalThis.__iso;
    expect(ids(data.questions)).toEqual([String(iso.t1Q)]);
    expect(ids(data.categories)).toEqual([String(iso.t1Cat)]);
  });

  it('teacher 1 receives only their own exams, games, tournaments', async () => {
    const data = await bootstrap(teacher1Token);
    const iso = globalThis.__iso;
    expect(ids(data.exams)).toEqual([String(iso.t1Exam)]);
    expect(ids(data.games)).toEqual([String(iso.t1Game)]);
    expect(ids(data.tournaments)).toEqual([String(iso.t1Tournament)]);
  });

  it('teacher 1 receives only their own exam junctions', async () => {
    const data = await bootstrap(teacher1Token);
    const iso = globalThis.__iso;
    expect((data.exam_questions || []).length).toBeGreaterThan(0);
    for (const link of data.exam_questions || []) {
      expect(String(link.exam_id)).toBe(String(iso.t1Exam));
    }
    for (const link of data.exam_classes || []) {
      expect(String(link.exam_id)).toBe(String(iso.t1Exam));
    }
  });

  it('teacher 1 receives only their assigned class', async () => {
    const data = await bootstrap(teacher1Token);
    const iso = globalThis.__iso;
    expect(ids(data.classes)).toEqual([String(iso.t1Class)]);
  });

  it('teacher 1 receives only their own students results', async () => {
    const data = await bootstrap(teacher1Token);
    const iso = globalThis.__iso;
    const userIds = (data.results || []).map((r) => String(r.user_id));
    expect(userIds).toEqual([String(iso.s1)]);
  });

  it('teacher 1 receives only their own notifications and class messages', async () => {
    const data = await bootstrap(teacher1Token);
    expect((data.notifications || []).length).toBeGreaterThan(0);
    for (const n of data.notifications || []) {
      expect(String(n.message)).not.toMatch(/Admin did something/);
    }
    const titles = (data.teacher_messages || []).map((m) => m.title);
    expect(titles).toContain('T1 note');
    expect(titles).not.toContain('Admin note');
  });

  it('teacher 1 never sees teacher 2 data', async () => {
    const data = await bootstrap(teacher1Token);
    const iso = globalThis.__iso;
    const dump = JSON.stringify(data);
    expect(dump).not.toContain(String(iso.t2Q));
    expect(dump).not.toContain(String(iso.t2Exam));
    expect(dump).not.toContain('T2 question?');
  });

  it('admin still sees everything', async () => {
    const data = await bootstrap(adminToken);
    const iso = globalThis.__iso;
    expect(ids(data.questions)).toEqual(
      expect.arrayContaining(
        [iso.adminQ, iso.t1Q, iso.t2Q].map(String),
      ),
    );
    expect(ids(data.exams)).toEqual(
      expect.arrayContaining(
        [iso.adminExam, iso.t1Exam, iso.t2Exam].map(String),
      ),
    );
    expect(ids(data.games)).toEqual(
      expect.arrayContaining([iso.adminGame, iso.t1Game].map(String)),
    );
    expect(ids(data.classes)).toEqual(
      expect.arrayContaining([iso.t1Class, iso.adminClass].map(String)),
    );
    expect((data.results || []).length).toBeGreaterThanOrEqual(3);
  });
});
