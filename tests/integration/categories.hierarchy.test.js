/**
 * tests/integration/categories.hierarchy.test.js
 *
 * End-to-end hierarchy contract: a teacher creates Math → Addition /
 * Subtraction → Equations (sub-sub), files questions at the deepest level
 * only, and the server guards the tree (leaf-only filing, no cycles,
 * no deleting parents/children with content).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;
let teacherToken;
let teacherId;
let mathId;
let additionId;
let subtractionId;
let equationsId;

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  const passwordHash = await bcrypt.hash('teacher123', 4);
  const teacher = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'teacher1',
      name: 'Teacher One',
      password_hash: passwordHash,
      role: 'teacher',
      status: 'active',
    },
  });
  teacherId = teacher.id;

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = adminRes.body.accessToken;
  const teacherRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'teacher1', password: 'teacher123' });
  teacherToken = teacherRes.body.accessToken;
  expect(adminToken).toBeTruthy();
  expect(teacherToken).toBeTruthy();
});

afterAll(async () => {
  await teardownTestDb();
});

async function createCategory(token, payload, expectedStatus = 201) {
  const res = await request(app)
    .post('/api/v1/categories')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  expect(res.status).toBe(expectedStatus);
  return res;
}

describe('nested categories', () => {
  it('teacher creates Math with Addition/Subtraction underneath', async () => {
    const math = await createCategory(teacherToken, {
      name: 'Math',
      color: '#3b82f6',
    });
    mathId = math.body.id;
    expect(math.body.created_by).toBe(teacherId);

    const addition = await createCategory(teacherToken, {
      name: 'Addition',
      parent_id: mathId,
    });
    additionId = addition.body.id;
    expect(addition.body.parent_id).toBe(mathId);

    const subtraction = await createCategory(teacherToken, {
      name: 'Subtraction',
      parent_id: mathId,
    });
    subtractionId = subtraction.body.id;
  });

  it('supports a third level (Equations under Addition)', async () => {
    const equations = await createCategory(teacherToken, {
      name: 'Equations',
      parent_id: additionId,
    });
    equationsId = equations.body.id;
    expect(equations.body.parent_id).toBe(additionId);
  });

  it('rejects an unknown parent', async () => {
    await createCategory(
      teacherToken,
      { name: 'Orphan', parent_id: '99999999-9999-4999-8999-999999999999' },
      422,
    );
  });

  it('rejects moving Math inside its own subcategory (cycle)', async () => {
    const res = await request(app)
      .patch(`/api/v1/categories/${mathId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ parent_id: additionId });
    expect(res.status).toBe(422);
  });

  it('rejects moving Addition under its own child Equations (deep cycle)', async () => {
    const res = await request(app)
      .patch(`/api/v1/categories/${additionId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ parent_id: equationsId });
    expect(res.status).toBe(422);
  });

  it('files a question in the deepest level (Equations)', async () => {
    const res = await request(app)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        type: 'mcq',
        text: 'Solve x + 2 = 5',
        answer: '3',
        category_id: equationsId,
      });
    expect(res.status).toBe(201);
  });

  it('rejects filing a question directly under Math (has subcategories)', async () => {
    const res = await request(app)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        type: 'mcq',
        text: 'What is math?',
        answer: 'Numbers',
        category_id: mathId,
      });
    expect(res.status).toBe(422);
  });

  it('rejects deleting Math while it has subcategories', async () => {
    const res = await request(app)
      .delete(`/api/v1/categories/${mathId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(422);
  });

  it('rejects deleting Equations while it contains questions', async () => {
    const res = await request(app)
      .delete(`/api/v1/categories/${equationsId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(422);
  });

  it('serves the nested tree', async () => {
    const res = await request(app)
      .get('/api/v1/categories/tree')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const math = res.body.find((c) => c.id === mathId);
    expect(math).toBeTruthy();
    const names = (math.children || []).map((c) => c.name).sort();
    expect(names).toEqual(['Addition', 'Subtraction']);
    const addition = math.children.find((c) => c.id === additionId);
    expect((addition.children || []).map((c) => c.name)).toEqual([
      'Equations',
    ]);
  });

  it('editing a subcategory name keeps its parent', async () => {
    const res = await request(app)
      .patch(`/api/v1/categories/${additionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ color: '#10b981' });
    expect(res.status).toBe(200);
    const row = await prisma.category.findUnique({
      where: { id: additionId },
    });
    expect(row.parent_id).toBe(mathId);
    expect(row.created_by).toBe(teacherId);
  });

  it('moving Subtraction back to top-level clears its parent', async () => {
    const res = await request(app)
      .patch(`/api/v1/categories/${subtractionId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ parent_id: null });
    expect(res.status).toBe(200);
    const row = await prisma.category.findUnique({
      where: { id: subtractionId },
    });
    expect(row.parent_id).toBeNull();
  });
});
