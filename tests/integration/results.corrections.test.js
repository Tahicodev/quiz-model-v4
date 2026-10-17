/**
 * tests/integration/results.corrections.test.js
 *
 * GET /api/v1/results/:id/corrections — server-graded answer breakdown.
 *
 * Student browsers never receive question answers (bootstrap strips them),
 * so the workspace fetches grading here after an attempt is persisted.
 * Covers: training breakdown content + score, self/owner isolation,
 * exam preset gating (showExplanations), and the bulk write path that must
 * preserve the per-question answers map.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let studentToken;
let otherToken;
let instructorToken;
let studentId;
let qMcq;
let qMulti;
let qMatch;

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
  const mkStudent = (username, name) =>
    prisma.user.create({
      data: {
        school_id: 'school-test',
        username,
        name,
        password_hash: passwordHash,
        role: 'student',
        status: 'active',
      },
    });
  const s1 = await mkStudent('correction-student', 'Correction Student');
  const s2 = await mkStudent('correction-other', 'Correction Other');
  studentId = s1.id;
  studentToken = await login('correction-student', 'student123');
  otherToken = await login('correction-other', 'student123');
  instructorToken = await login('admin', 'admin123');

  qMcq = await prisma.question.create({
    data: {
      school_id: 'school-test',
      type: 'multiple-choice',
      text: 'What is 2 + 2?',
      options_json: JSON.stringify(['3', '4', '5']),
      answer: '4',
      explanation: 'Basic addition.',
    },
  });
  qMulti = await prisma.question.create({
    data: {
      school_id: 'school-test',
      type: 'multiple-choice',
      text: 'Pick the even numbers.',
      options_json: JSON.stringify(['1', '2', '3', '4']),
      answer: 'multi::2|4',
    },
  });
  qMatch = await prisma.question.create({
    data: {
      school_id: 'school-test',
      type: 'matching-pairs',
      text: 'Match capitals.',
      options_json: JSON.stringify(['Paris', 'France', 'Rome', 'Italy']),
      answer: 'Paris-->France|Rome-->Italy',
    },
  });
});

afterAll(async () => {
  await teardownTestDb();
});

async function postResult(token, body) {
  return request(app)
    .post('/api/v1/results')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('GET /api/v1/results/:id/corrections', () => {
  it('grades a training attempt and reveals answers + explanations', async () => {
    const answers = {
      [qMcq.id]: '4',
      [qMulti.id]: '2|4',
      [qMatch.id]: 'Paris→France|Rome→Italy',
    };
    const created = await postResult(studentToken, {
      id: 'result-training-1',
      user_id: studentId,
      mode: 'training',
      total_points: 3,
      earned_points: 0,
      grade20: 0,
      answers_json: JSON.stringify(answers),
    });
    expect(created.status).toBe(201);

    const res = await request(app)
      .get('/api/v1/results/result-training-1/corrections')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(3);
    expect(res.body.total).toBe(3);
    expect(res.body.grade20).toBe(20);
    expect(res.body.passed).toBe(true);
    expect(res.body.items).toHaveLength(3);

    const byId = Object.fromEntries(res.body.items.map((i) => [i.questionId, i]));
    expect(byId[qMcq.id]).toMatchObject({
      correct: true,
      userAnswer: '4',
      correctAnswer: '4',
      explanation: 'Basic addition.',
    });
    // multi:: rows grade as multi-select after decoding
    expect(byId[qMulti.id].correct).toBe(true);
    expect(byId[qMulti.id].type).toBe('multiple-choice-multi');
    expect(byId[qMatch.id].correct).toBe(true);
  });

  it('marks wrong and missing answers incorrect', async () => {
    const created = await postResult(studentToken, {
      id: 'result-training-2',
      user_id: studentId,
      mode: 'training',
      total_points: 3,
      earned_points: 0,
      grade20: 0,
      answers_json: JSON.stringify({ [qMcq.id]: '3', [qMulti.id]: '2' }),
    });
    expect(created.status).toBe(201);

    const res = await request(app)
      .get('/api/v1/results/result-training-2/corrections')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(0);
    expect(res.body.total).toBe(2);
    expect(res.body.items.every((i) => i.correct === false)).toBe(true);
  });

  it('refuses another student (403) and strangers get 404', async () => {
    const forbidden = await request(app)
      .get('/api/v1/results/result-training-1/corrections')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(forbidden.status).toBe(403);

    const missing = await request(app)
      .get('/api/v1/results/does-not-exist/corrections')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(missing.status).toBe(404);
  });

  it('lets instructors review any attempt in their tenant', async () => {
    const res = await request(app)
      .get('/api/v1/results/result-training-1/corrections')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
  });

  it('gates exam attempts on the preset showExplanations flag', async () => {
    const exam = await prisma.exam.create({
      data: {
        school_id: 'school-test',
        name: 'Gated Exam',
        status: 'active',
        options_json: JSON.stringify({ presetSnapshot: { showExplanations: false } }),
      },
    });
    const created = await postResult(studentToken, {
      id: 'result-exam-gated',
      user_id: studentId,
      exam_id: exam.id,
      mode: 'exam',
      total_points: 1,
      earned_points: 0,
      grade20: 0,
      answers_json: JSON.stringify({ [qMcq.id]: '4' }),
    });
    expect(created.status).toBe(201);

    const denied = await request(app)
      .get('/api/v1/results/result-exam-gated/corrections')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(denied.status).toBe(403);

    // Instructors can still review gated exams (they own the bank).
    const instructor = await request(app)
      .get('/api/v1/results/result-exam-gated/corrections')
      .set('Authorization', `Bearer ${instructorToken}`);
    expect(instructor.status).toBe(200);

    await prisma.exam.update({
      where: { id: exam.id },
      data: { options_json: JSON.stringify({ presetSnapshot: { showExplanations: true } }) },
    });
    const allowed = await request(app)
      .get('/api/v1/results/result-exam-gated/corrections')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.items[0]).toMatchObject({ correct: true, correctAnswer: '4' });
  });

  it('works for attempts written through the bulk endpoint', async () => {
    const bulk = await request(app)
      .post('/api/v1/bulk/results')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        items: [
          {
            id: 'result-bulk-1',
            userId: studentId,
            mode: 'training',
            totalPoints: 1,
            earnedPoints: 0,
            grade20: 0,
            answers_json: JSON.stringify({ [qMcq.id]: '4' }),
          },
        ],
      });
    expect(bulk.status).toBe(201);

    const res = await request(app)
      .get('/api/v1/results/result-bulk-1/corrections')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.score).toBe(1);
    expect(res.body.items[0]).toMatchObject({ correct: true, correctAnswer: '4' });
  });
});
