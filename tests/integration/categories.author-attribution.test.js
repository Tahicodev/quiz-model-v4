/**
 * tests/integration/categories.author-attribution.test.js
 *
 * Regression test for the role-attribution bug: a category created by a
 * teacher ("Kids · info") showed the admin as its creator in admin sessions.
 *
 * Root cause (frontend): the edit dialog rebuilt the local row with
 * `ownerId = existing.ownerId || currentUser.id`, but server rows carry
 * `created_by` — not `ownerId` — so an admin editing a teacher's category
 * silently reattributed it to themselves in the local mirror ("By" badge).
 *
 * These tests lock the server-side invariant: category authorship is stamped
 * once at creation and is immutable afterwards — neither PATCH nor an admin
 * browser's full-table bulk mirror may reattribute an existing row.
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
const ADMIN_ID = 'user-test-admin';
let categoryId;

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

describe('category author attribution', () => {
  it('stamps the teacher as author when a teacher creates a category', async () => {
    const res = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ name: 'Kids · info', color: '#3b82f6' });
    expect(res.status).toBe(201);
    expect(res.body.created_by).toBe(teacherId);
    categoryId = res.body.id;
  });

  it('keeps the teacher as author when an admin edits the category', async () => {
    const res = await request(app)
      .patch(`/api/v1/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ color: '#10b981' });
    expect(res.status).toBe(200);

    const row = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    expect(row.created_by).toBe(teacherId);
  });

  it('admin bulk mirror with a stale conflicting ownerId cannot steal authorship', async () => {
    // Simulates the pre-fix corrupted local mirror: correct server key plus
    // a stale legacy ownerId pointing at the admin.
    const res = await request(app)
      .post('/api/v1/bulk/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            id: categoryId,
            name: 'Kids · info',
            color: '#10b981',
            created_by: teacherId,
            ownerId: ADMIN_ID,
          },
        ],
      });
    expect(res.status).toBe(201);

    const row = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    expect(row.created_by).toBe(teacherId);
  });

  it('admin bulk mirror of a row carrying only a stale ownerId cannot steal authorship', async () => {
    // Worst case: the local mirror lost the server key entirely and only
    // carries the wrong legacy ownerId. Authorship is create-only via bulk,
    // so the existing row must keep its author.
    const res = await request(app)
      .post('/api/v1/bulk/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [
          {
            id: categoryId,
            name: 'Kids · info',
            color: '#10b981',
            ownerId: ADMIN_ID,
          },
        ],
      });
    expect(res.status).toBe(201);

    const row = await prisma.category.findUnique({
      where: { id: categoryId },
    });
    expect(row.created_by).toBe(teacherId);
  });

  it('bulk create resolves a legacy ownerId to the real author', async () => {
    const res = await request(app)
      .post('/api/v1/bulk/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ name: 'Bulk Legacy Category', ownerId: teacherId }],
      });
    expect(res.status).toBe(201);

    const row = await prisma.category.findFirst({
      where: { name: 'Bulk Legacy Category' },
    });
    expect(row).toBeTruthy();
    expect(row.created_by).toBe(teacherId);
  });

  it('bulk create with an unresolvable author leaves it unattributed (no actor fallback)', async () => {
    const res = await request(app)
      .post('/api/v1/bulk/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        items: [{ name: 'Bulk Orphan Category', ownerId: 'no-such-user' }],
      });
    expect(res.status).toBe(201);

    const row = await prisma.category.findFirst({
      where: { name: 'Bulk Orphan Category' },
    });
    expect(row).toBeTruthy();
    expect(row.created_by).toBeNull();
  });
});
