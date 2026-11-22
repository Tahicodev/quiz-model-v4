/**
 * tests/integration/bulk.drop-report.test.js
 *
 * A bulk restore must never lose rows silently.
 *
 * The legacy client mirrors whole tables through POST /bulk/:table. That
 * endpoint sanitizes, scopes and pre-validates every row, and it has always
 * dropped some of them (unknown shape, another teacher's row, a missing
 * required column, a snapshot row the sanitizer cannot map). Before this
 * suite the response only carried `count`, so a restore that lost half the
 * batch looked identical to a clean one.
 *
 * The contract under test:
 *   - `dropped.total` and `dropped.reasons` name every refused row;
 *   - `dropped.samples` carries the first few (bounded) with index/id/reason;
 *   - a clean write omits `dropped` entirely (no noise in the happy path);
 *   - `replace: true` refuses to delete the existing snapshot when any row
 *     would be dropped, and still reports which rows were refused.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;
let studentOneToken;
let studentTwoId;

const SCHOOL = 'school-test';

function uuid() {
  return crypto.randomUUID();
}

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = adminLogin.body.accessToken;

  const hash = await bcrypt.hash('student123', 4);
  await prisma.user.create({
    data: {
      id: 'u-drop-s1',
      school_id: SCHOOL,
      name: 'Student One',
      username: 'drop-s1',
      role: 'student',
      status: 'active',
      password_hash: hash,
    },
  });
  await prisma.user.create({
    data: {
      id: 'u-drop-s2',
      school_id: SCHOOL,
      name: 'Student Two',
      username: 'drop-s2',
      role: 'student',
      status: 'active',
      password_hash: hash,
    },
  });
  studentTwoId = 'u-drop-s2';

  const studentLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'drop-s1', password: 'student123' });
  studentOneToken = studentLogin.body.accessToken;
});

afterAll(async () => {
  await teardownTestDb();
});

function bulkQuestions(token, body) {
  return request(app)
    .post('/api/v1/bulk/questions')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('bulk restore drop reporting', () => {
  it('counts invalid and incomplete rows while persisting the valid ones', async () => {
    const validQuestion = {
      id: uuid(),
      type: 'mcq',
      text: 'Which number is even?',
      answer: '2',
      options: ['2', '3'],
    };

    const res = await bulkQuestions(adminToken, {
      items: [
        null, // not an object at all
        { type: 'mcq', answer: '1' }, // no text → missingRequired
        validQuestion,
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);
    expect(res.body.dropped.total).toBe(2);
    expect(res.body.dropped.reasons).toMatchObject({
      invalid: 1,
      sanitizerRejected: 1,
      missingRequired: 0,
      outOfScope: 0,
    });
    expect(res.body.dropped.samples).toHaveLength(2);
    expect(res.body.dropped.samples[0]).toMatchObject({ index: 0, reason: 'invalid' });
    expect(res.body.dropped.samples[1]).toMatchObject({
      index: 1,
      reason: 'sanitizerRejected',
    });

    const stored = await prisma.question.findUnique({ where: { id: validQuestion.id } });
    expect(stored).not.toBeNull();
    expect(stored.text).toBe('Which number is even?');
    expect(await prisma.question.count({ where: { text: 'Which number is even?' } })).toBe(1);
  });

  it('omits the dropped block when every row is persisted', async () => {
    const res = await bulkQuestions(adminToken, {
      items: [
        {
          id: uuid(),
          type: 'mcq',
          text: 'Clean row',
          answer: 'a',
          options: ['a', 'b'],
        },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);
    expect(res.body).not.toHaveProperty('dropped');
  });

  it('refuses a snapshot replacement that would drop rows and reports them', async () => {
    const survivor = {
      id: uuid(),
      type: 'mcq',
      text: 'Survivor question',
      answer: 's',
      options: ['s', 't'],
    };
    const first = await bulkQuestions(adminToken, { items: [survivor] });
    expect(first.status).toBe(201);
    expect((await prisma.question.findUnique({ where: { id: survivor.id } }))).not.toBeNull();

    const res = await bulkQuestions(adminToken, {
      replace: true,
      deleteIds: [survivor.id],
      items: [{ type: 'mcq', answer: 'x' }], // would be dropped: no text
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SNAPSHOT');
    expect(res.body.dropped.total).toBe(1);
    expect(res.body.dropped.reasons.sanitizerRejected).toBe(1);
    expect(res.body.dropped.samples[0]).toMatchObject({
      index: 0,
      reason: 'sanitizerRejected',
    });

    // A refused snapshot must not have removed the existing rows.
    expect(await prisma.question.findUnique({ where: { id: survivor.id } })).not.toBeNull();
  });

  it('reports a student result that belongs to another student as out of scope', async () => {
    const own = {
      id: uuid(),
      userId: 'u-drop-s1',
      score: 8,
      totalQuestions: 10,
      answers_json: {},
    };
    const foreign = {
      id: uuid(),
      userId: studentTwoId,
      score: 9,
      totalQuestions: 10,
      answers_json: {},
    };

    const res = await request(app)
      .post('/api/v1/bulk/results')
      .set('Authorization', `Bearer ${studentOneToken}`)
      .send({ items: [own, foreign] });

    expect(res.status).toBe(201);
    expect(res.body.count).toBe(1);
    expect(res.body.dropped.total).toBe(1);
    expect(res.body.dropped.reasons.outOfScope).toBe(1);
    expect(res.body.dropped.samples[0]).toMatchObject({
      index: 1,
      id: foreign.id,
      reason: 'outOfScope',
    });

    expect(await prisma.result.findUnique({ where: { id: own.id } })).not.toBeNull();
    expect(await prisma.result.findUnique({ where: { id: foreign.id } })).toBeNull();
  });
});