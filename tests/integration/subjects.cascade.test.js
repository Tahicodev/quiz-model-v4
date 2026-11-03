/**
 * tests/integration/subjects.cascade.test.js
 *
 * Cascade contract for the Subjects tab:
 *   • DELETE /categories/:id also removes the courses generated from that
 *     branch (the schema FK stays SetNull, the service deletes explicitly).
 *   • DELETE /subjects/:id removes the subject's whole category forest,
 *     detaches their questions to Uncategorized, deletes the courses built
 *     from them and answers { categoriesRemoved, coursesRemoved }.
 *   • Ownership is enforced: another teacher gets 403 and nothing is deleted.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;
let adminId;
let ownerToken;
let ownerId;
let otherToken;

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;
  app = (await import('./helpers/app.js')).default;

  const admin = await prisma.user.findUnique({ where: { id: 'user-test-admin' } });
  adminId = admin.id;
  const passwordHash = await bcrypt.hash('teacher123', 4);
  const owner = await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'subject-owner',
      name: 'Subject Owner',
      password_hash: passwordHash,
      role: 'teacher',
      status: 'active',
    },
  });
  ownerId = owner.id;
  await prisma.user.create({
    data: {
      school_id: 'school-test',
      username: 'subject-other',
      name: 'Other Teacher',
      password_hash: passwordHash,
      role: 'teacher',
      status: 'active',
    },
  });

  const login = async (username) => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username, password: username === 'admin' ? 'admin123' : 'teacher123' });
    expect(res.status).toBe(200);
    return res.body.accessToken;
  };
  adminToken = await login('admin');
  ownerToken = await login('subject-owner');
  otherToken = await login('subject-other');
});

afterAll(async () => {
  await teardownTestDb();
});

describe('category delete cascades to generated courses', () => {
  it('removes the course (and its lessons) built from the deleted branch', async () => {
    const root = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Chemistry' });
    expect(root.status).toBe(201);
    const rootId = root.body.id;
    const leaf = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Organic', parent_id: rootId });
    expect(leaf.status).toBe(201);

    const course = await prisma.course.create({
      data: {
        school_id: 'school-test',
        created_by: adminId,
        name: 'Chemistry course',
        category_id: rootId,
      },
    });
    await prisma.lesson.create({
      data: { course_id: course.id, title: 'Intro', category_id: leaf.body.id },
    });
    // A course on an unrelated branch must survive.
    const keeper = await prisma.course.create({
      data: { school_id: 'school-test', created_by: adminId, name: 'Keeper' },
    });

    const res = await request(app)
      .delete(`/api/v1/categories/${rootId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // The route reports its own cascade, so the UI can say how many courses
    // went away instead of leaving the user guessing.
    expect(res.body).toMatchObject({ coursesRemoved: 1 });

    expect(await prisma.course.findUnique({ where: { id: course.id } })).toBeNull();
    expect(await prisma.lesson.findMany({ where: { course_id: course.id } })).toHaveLength(0);
    expect(await prisma.course.findUnique({ where: { id: keeper.id } })).toBeTruthy();
    await prisma.course.delete({ where: { id: keeper.id } });
  });
});

describe('subject delete cascade', () => {
  async function createSubject(token, name) {
    const res = await request(app)
      .post('/api/v1/subjects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
    expect(res.status).toBe(201);
    return res.body.id;
  }

  it('removes the forest, its courses and reports the counts', async () => {
    const subjectId = await createSubject(ownerToken, 'Mathematics Cascade');
    const root = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Algebra', subject_id: subjectId });
    expect(root.status).toBe(201);
    const child = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Linear', subject_id: subjectId, parent_id: root.body.id });
    expect(child.status).toBe(201);

    const question = await prisma.question.create({
      data: {
        school_id: 'school-test',
        created_by: ownerId,
        type: 'mcq',
        text: 'Solve x + 2 = 5',
        answer: '3',
        category_id: child.body.id,
      },
    });
    const course = await prisma.course.create({
      data: {
        school_id: 'school-test',
        created_by: ownerId,
        name: 'Mathematics course',
        subject_id: subjectId,
        category_id: root.body.id,
      },
    });
    await prisma.lesson.create({
      data: { course_id: course.id, title: 'Linear systems', category_id: child.body.id },
    });

    const res = await request(app)
      .delete(`/api/v1/subjects/${subjectId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categoriesRemoved: 2, coursesRemoved: 1 });

    expect(await prisma.subject.findUnique({ where: { id: subjectId } })).toBeNull();
    expect(await prisma.category.findUnique({ where: { id: root.body.id } })).toBeNull();
    expect(await prisma.category.findUnique({ where: { id: child.body.id } })).toBeNull();
    expect(await prisma.course.findUnique({ where: { id: course.id } })).toBeNull();
    expect(await prisma.lesson.findMany({ where: { course_id: course.id } })).toHaveLength(0);
    // The question survives, just detached from the deleted category.
    const survivor = await prisma.question.findUnique({ where: { id: question.id } });
    expect(survivor).toBeTruthy();
    expect(survivor.category_id).toBeNull();
  });

  it('refuses another teacher and deletes nothing', async () => {
    const subjectId = await createSubject(ownerToken, 'Physics Cascade');
    const category = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Mechanics', subject_id: subjectId });
    expect(category.status).toBe(201);

    const res = await request(app)
      .delete(`/api/v1/subjects/${subjectId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);

    expect(await prisma.subject.findUnique({ where: { id: subjectId } })).toBeTruthy();
    expect(await prisma.category.findUnique({ where: { id: category.body.id } })).toBeTruthy();

    // Students have no access to the route at all.
    const student = await prisma.user.create({
      data: {
        school_id: 'school-test',
        username: 'cascade-student',
        name: 'Student',
        password_hash: await bcrypt.hash('student123', 4),
        role: 'student',
        status: 'active',
      },
    });
    const studentLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: student.username, password: 'student123' });
    expect([401, 403, 200]).toContain(studentLogin.status);
    if (studentLogin.body.accessToken) {
      const denied = await request(app)
        .delete(`/api/v1/subjects/${subjectId}`)
        .set('Authorization', `Bearer ${studentLogin.body.accessToken}`);
      expect(denied.status).toBe(403);
    }
  });

  it('lets an admin delete a teacher’s subject in their school', async () => {
    const subjectId = await createSubject(ownerToken, 'Geography Cascade');
    const res = await request(app)
      .delete(`/api/v1/subjects/${subjectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categoriesRemoved: 0, coursesRemoved: 0 });
    expect(await prisma.subject.findUnique({ where: { id: subjectId } })).toBeNull();
  });

  it('renames a subject through PATCH so the pill label follows', async () => {
    const subjectId = await createSubject(ownerToken, 'Old Name');
    const res = await request(app)
      .patch(`/api/v1/subjects/${subjectId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });
});
