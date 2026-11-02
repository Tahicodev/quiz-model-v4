/**
 * tests/integration/results.routes.test.js
 *
 * Tests result persistence, category training rankings, score normalization,
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
let trainingCategory;
let trainingQuestions;
let trainingClass;
let classPeers;
let outsider;

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

  trainingClass = await prisma.class.create({
    data: { school_id: 'school-test', name: 'Training Class' },
  });
  await prisma.user.update({
    where: { id: studentUser.id },
    data: { class_id: trainingClass.id },
  });
  classPeers = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      prisma.user.create({
        data: {
          school_id: 'school-test',
          class_id: trainingClass.id,
          name: `Classmate ${index + 1}`,
          username: `classmate${index + 1}`,
          role: 'student',
          password_hash: 'hashed',
          status: 'active',
        },
      }),
    ),
  );
  const otherClass = await prisma.class.create({
    data: { school_id: 'school-test', name: 'Other Class' },
  });
  outsider = await prisma.user.create({
    data: {
      school_id: 'school-test',
      class_id: otherClass.id,
      name: 'Other Class Student',
      username: 'otherclassstudent',
      role: 'student',
      password_hash: 'hashed',
      status: 'active',
    },
  });
  trainingCategory = await prisma.category.create({
    data: { school_id: 'school-test', name: 'Training Category' },
  });
  trainingQuestions = await Promise.all([
    prisma.question.create({
      data: {
        school_id: 'school-test',
        category_id: trainingCategory.id,
        type: 'multiple-choice',
        text: 'Question one',
        answer: 'A',
        created_by: studentUser.id,
      },
    }),
    prisma.question.create({
      data: {
        school_id: 'school-test',
        category_id: trainingCategory.id,
        type: 'multiple-choice',
        text: 'Question two',
        answer: 'B',
        created_by: studentUser.id,
      },
    }),
  ]);
  await prisma.setting.create({
    data: {
      school_id: 'school-test',
      key: 'categoryTrainingMap',
      value: JSON.stringify({ [trainingCategory.id]: true }),
    },
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

  describe('GET /api/v1/results/training/category-stats', () => {
    it('returns own latest/best attempts and a class-only top ten graded from answers', async () => {
      const questionIds = trainingQuestions.map((question) => question.id);
      const createAttempt = (id, userId, answers, timeSpent, date) =>
        prisma.result.create({
          data: {
            id,
            school_id: 'school-test',
            user_id: userId,
            score: 0,
            total_points: 2,
            earned_points: 0,
            time_spent: timeSpent,
            answers_json: JSON.stringify({
              userAnswers: answers,
              trainingContext: {
                categoryId: trainingCategory.id,
                rankedCategoryQuiz: true,
                questionIds,
              },
            }),
            mode: 'training',
            date_taken: new Date(date),
          },
        });

      await createAttempt(
        'category-own-best',
        studentUser.id,
        { [questionIds[0]]: 'A', [questionIds[1]]: 'B' },
        80,
        '2025-01-01T10:00:00.000Z',
      );
      await createAttempt(
        'category-own-latest',
        studentUser.id,
        { [questionIds[0]]: 'A' },
        30,
        '2025-02-01T10:00:00.000Z',
      );
      await Promise.all(
        classPeers.map((peer, index) =>
          createAttempt(
            `category-peer-${index}`,
            peer.id,
            index < 5
              ? { [questionIds[0]]: 'A', [questionIds[1]]: 'B' }
              : { [questionIds[0]]: 'A' },
            60 + index,
            `2025-03-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
          ),
        ),
      );
      await createAttempt(
        'category-outsider',
        outsider.id,
        { [questionIds[0]]: 'A', [questionIds[1]]: 'B' },
        1,
        '2025-04-01T10:00:00.000Z',
      );
      await prisma.result.create({
        data: {
          id: 'category-subset-attempt',
          school_id: 'school-test',
          user_id: studentUser.id,
          score: 100,
          total_points: 1,
          earned_points: 1,
          time_spent: 1,
          answers_json: JSON.stringify({
            userAnswers: { [questionIds[0]]: 'A' },
            trainingContext: {
              categoryId: trainingCategory.id,
              rankedCategoryQuiz: true,
              questionIds: [questionIds[0]],
            },
          }),
          mode: 'training',
        },
      });

      const res = await request(app)
        .get(`/api/v1/results/training/category-stats?categoryIds=${trainingCategory.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      const stats = res.body.categories[trainingCategory.id];
      expect(stats.mine).toEqual({ attempts: 2, latestScore: 10, bestScore: 20 });
      expect(stats.leaderboard).toHaveLength(10);
      expect(stats.leaderboard[0]).toMatchObject({
        rank: 1,
        score: 20,
        timeSpent: 60,
      });
      expect(stats.leaderboard.every((entry) => entry.name !== outsider.name)).toBe(true);
      expect(stats.leaderboard.map((entry) => entry.rank)).toEqual(
        Array.from({ length: 10 }, (_, index) => index + 1),
      );
    });

    it('does not expose rankings for a category disabled by the teacher', async () => {
      await prisma.setting.update({
        where: {
          school_id_key: {
            school_id: 'school-test',
            key: 'categoryTrainingMap',
          },
        },
        data: { value: JSON.stringify({ [trainingCategory.id]: false }) },
      });

      const res = await request(app)
        .get(`/api/v1/results/training/category-stats?categoryIds=${trainingCategory.id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.categories[trainingCategory.id]).toBeUndefined();
    });
  });

  it('returns server-graded per-question accuracy for the current student only', async () => {
    const accuracyQuestion = await prisma.question.create({
      data: {
        school_id: 'school-test',
        type: 'multiple-choice',
        text: 'Accuracy test question',
        answer: 'A',
        created_by: studentUser.id,
      },
    });
    await prisma.result.create({
      data: {
        id: 'training-accuracy-own-attempt',
        school_id: 'school-test',
        user_id: studentUser.id,
        score: 0,
        total_points: 1,
        earned_points: 0,
        answers_json: JSON.stringify({
          userAnswers: { [accuracyQuestion.id]: 'A' },
          trainingContext: {
            categoryId: trainingCategory.id,
            rankedCategoryQuiz: true,
          },
        }),
        mode: 'training',
      },
    });
    await prisma.result.create({
      data: {
        id: 'training-accuracy-other-student-attempt',
        school_id: 'school-test',
        user_id: outsider.id,
        score: 0,
        total_points: 1,
        earned_points: 0,
        answers_json: JSON.stringify({
          userAnswers: { [accuracyQuestion.id]: 'A' },
        }),
        mode: 'training',
      },
    });

    const res = await request(app)
      .get('/api/v1/results/training/accuracy')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.questions[accuracyQuestion.id]).toMatchObject({
      question: 'Accuracy test question',
      attempts: 1,
      correct: 1,
    });
    expect(res.body.questions[accuracyQuestion.id]).not.toHaveProperty('correctAnswer');
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

  it("deletes only the student's generic training attempts", async () => {
    const attempts = [
      {
        id: 'legacy-training-generic',
        user_id: studentUser.id,
        answers_json: JSON.stringify({ userAnswers: {} }),
      },
      {
        id: 'legacy-training-category',
        user_id: studentUser.id,
        answers_json: JSON.stringify({
          trainingContext: { categoryId: trainingCategory.id, rankedCategoryQuiz: true },
        }),
      },
      {
        id: 'legacy-training-course',
        user_id: studentUser.id,
        answers_json: JSON.stringify({
          trainingContext: { courseTitle: 'Course practice', lessonTitle: 'Section 1' },
        }),
      },
      {
        id: 'legacy-training-other-student',
        user_id: classPeers[0].id,
        answers_json: JSON.stringify({ userAnswers: {} }),
      },
    ];
    await Promise.all(
      attempts.map((attempt) =>
        prisma.result.create({
          data: {
            ...attempt,
            school_id: 'school-test',
            score: 0,
            earned_points: 0,
            total_points: 0,
            mode: 'training',
          },
        }),
      ),
    );
    const storedCategoryAttempt = await prisma.result.findUnique({
      where: { id: 'legacy-training-category' },
    });
    expect(JSON.parse(storedCategoryAttempt.answers_json).trainingContext.categoryId).toBe(
      trainingCategory.id,
    );

    const res = await request(app)
      .delete('/api/v1/results/training/legacy')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBeGreaterThanOrEqual(1);
    const remaining = await prisma.result.findMany({
      where: { id: { in: attempts.map(({ id }) => id) } },
      select: { id: true },
    });
    expect(remaining.map(({ id }) => id).sort()).toEqual(
      [
        'legacy-training-category',
        'legacy-training-course',
        'legacy-training-other-student',
      ].sort(),
    );
  });
});
