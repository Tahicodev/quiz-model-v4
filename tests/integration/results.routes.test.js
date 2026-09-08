/**
 * tests/integration/results.routes.test.js
 *
 * Tests POST /api/v1/results for training results, synthetic exam IDs,
 * null field sanitization, and upsert idempotency.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;
let studentToken;
let studentUser;

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  // Login as admin
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = adminRes.body.accessToken;

  // Create a student user
  studentUser = await prisma.user.create({
    data: {
      school_id: 'school-test',
      name: 'Test Student',
      username: 'student1',
      role: 'student',
      numero: 'S001',
      password_hash: 'hashed',
    },
  });

  // Mint a JWT for the student
  const { signJwt } = await import('../../../src/backend/utils/jwt.js');
  studentToken = signJwt({
    id: studentUser.id,
    school_id: 'school-test',
    role: 'student',
  });
});

afterAll(async () => {
  await teardownTestDb();
});

describe('POST /api/v1/results', () => {
  it('successfully persists training result with synthetic exam_id, /20-normalized score', async () => {
    const payload = {
      id: 'training-test-1',
      user_id: studentUser.id,
      school_id: 'school-test',
      exam_id: 'training-practice',
      score: 1,
      total_points: 7,
      earned_points: 1,
      time_spent: 62,
      mode: 'training',
      passed: null,
      attempt_number: 1,
      answers_json: null,
      date_taken: new Date().toISOString(),
    };

    const res = await request(app)
      .post('/api/v1/results')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('training-test-1');
    expect(res.body.exam_id).toBeNull();
    expect(res.body.passed).toBe(false);
    expect(typeof res.body.answers_json).toBe('string');
    const parsed = JSON.parse(res.body.answers_json);
    expect(parsed.examId).toBe('training-practice');

    // Verify in database. Count-based scores are normalized to a
    // percentage at the API boundary (1 correct of 7 → 1/7 * 100).
    const inDb = await prisma.result.findUnique({ where: { id: 'training-test-1' } });
    expect(inDb).not.toBeNull();
    expect(inDb.exam_id).toBeNull();
    expect(inDb.score).toBeCloseTo((1 / 7) * 100, 2);
  });

  it('stores an explicit /20 grade as a percentage (grade20 12.5 → 62.5)', async () => {
    const payload = {
      id: 'training-test-grade20',
      user_id: studentUser.id,
      grade20: 12.5,
      score: 12.5,
      total_points: 8,
      earned_points: 5,
      mode: 'training',
      passed: true,
    };

    const res = await request(app)
      .post('/api/v1/results')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.score).toBeCloseTo(62.5, 2);
    expect(res.body.passed).toBe(true);
  });

  it('is idempotent when the same result id is sent again (upsert)', async () => {
    const payload = {
      id: 'training-test-1',
      user_id: studentUser.id,
      score: 2,
      total_points: 7,
      earned_points: 2,
      mode: 'training',
    };

    const res = await request(app)
      .post('/api/v1/results')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('training-test-1');
    // Count-based score (2 of 7) is normalized to a percentage.
    expect(res.body.score).toBeCloseTo((2 / 7) * 100, 2);

    const inDb = await prisma.result.findUnique({ where: { id: 'training-test-1' } });
    expect(inDb.score).toBeCloseTo((2 / 7) * 100, 2);
  });

  it('prevents students from creating results on behalf of other users', async () => {
    const payload = {
      id: 'training-test-unauthorized',
      user_id: 'some-other-student-uuid',
      score: 5,
    };

    const res = await request(app)
      .post('/api/v1/results')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(payload);

    expect(res.status).toBe(403);
  });
});
