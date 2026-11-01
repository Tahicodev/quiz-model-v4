/**
 * tests/integration/courses.routes.test.js
 *
 * HTTP contract of /api/v1/courses, including the AI generation path:
 * validation errors (422), provider failures (502), the generated course
 * shape, publish/assign gating and the answer-free student practice feed.
 * The provider itself is stubbed at `fetch`, so no external call is made.
 *
 * Routes are imported through `helpers/app.js` (built with the shared Prisma
 * singleton), which only points at the test database once `setupTestDb()` has
 * rewritten DATABASE_URL — so the import has to stay dynamic.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

const SCHOOL = 'school-test';
const BASE = '/api/v1/courses';

let prisma;
let app;
let teacherToken;
let studentToken;
let teacher;
let classOne;
let branchRootId;
let lessonCategoryId;
let emptyCategoryId;
let configId;
let courseId;
let lessonIds = [];

/** Stub the provider transport for one request. */
function stubProvider(content) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: true,
			status: 200,
			json: async () => ({ choices: [{ message: { content } }] }),
			text: async () => '',
		})),
	);
}

function stubProviderFailure() {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => ({
			ok: false,
			status: 503,
			json: async () => ({}),
			text: async () => 'upstream unavailable',
		})),
	);
}

beforeAll(async () => {
	const db = await setupTestDb();
	prisma = db.prisma;
	app = (await import('./helpers/app.js')).default;
	const { getContainer } = await import('../../src/backend/container.js');

	classOne = await prisma.class.create({ data: { school_id: SCHOOL, name: 'Roster 1' } });
	const hash = await bcrypt.hash('pass1234', 4);
	teacher = await prisma.user.create({
		data: {
			school_id: SCHOOL, username: 'rt-teacher', name: 'Teacher', password_hash: hash,
			role: 'teacher', status: 'active',
		},
	});
	await prisma.user.create({
		data: {
			school_id: SCHOOL, class_id: classOne.id, username: 'rt-student', name: 'Student',
			password_hash: hash, role: 'student', status: 'active',
		},
	});

	const branch = await prisma.category.create({
		data: { school_id: SCHOOL, name: 'Unit 3', created_by: teacher.id },
	});
	branchRootId = branch.id;
	const axe = await prisma.category.create({
		data: { school_id: SCHOOL, name: 'Unit 3 — Axe 1', parent_id: branch.id, created_by: teacher.id },
	});
	lessonCategoryId = axe.id;
	const emptyBranch = await prisma.category.create({
		data: { school_id: SCHOOL, name: 'Unit 9', created_by: teacher.id },
	});
	emptyCategoryId = emptyBranch.id;

	await prisma.question.createMany({
		data: [
			{
				school_id: SCHOOL, category_id: lessonCategoryId, type: 'multiple-choice',
				text: 'What is the plural of "cheval"?', options_json: '["chevaux","chevals"]',
				answer: 'chevaux', explanation: 'Irregular plural.', created_by: teacher.id,
			},
			{
				school_id: SCHOOL, category_id: lessonCategoryId, type: 'fill-blank',
				text: 'Le cheval ___ au pluriel.', options_json: '["chevaux"]', answer: 'chevaux',
				created_by: teacher.id,
			},
		],
	});

	const { aiConfigSvc } = getContainer();
	const cfg = await aiConfigSvc.create(teacher, SCHOOL, {
		provider: 'openai', name: 'Test model', model_id: 'gpt-test', api_key: 'sk-test', shared: false,
	});
	configId = cfg.id;

	const login = async (username) => {
		const res = await request(app).post('/api/v1/auth/login').send({ username, password: 'pass1234' });
		expect(res.status).toBe(200);
		return res.body.accessToken;
	};
	teacherToken = await login('rt-teacher');
	studentToken = await login('rt-student');
});

afterAll(async () => {
	vi.unstubAllGlobals();
	await teardownTestDb();
});

const authed = (token) => ({
	get: (path) => request(app).get(path).set('Authorization', `Bearer ${token}`),
	post: (path) => request(app).post(path).set('Authorization', `Bearer ${token}`),
	patch: (path) => request(app).patch(path).set('Authorization', `Bearer ${token}`),
	delete: (path) => request(app).delete(path).set('Authorization', `Bearer ${token}`),
});
const asTeacher = () => authed(teacherToken);
const asStudent = () => authed(studentToken);

describe('POST /courses/generate', () => {
	it('rejects an incomplete payload with a field-level 422', async () => {
		const res = await asTeacher().post(`${BASE}/generate`).send({ categoryId: branchRootId });
		expect(res.status).toBe(422);
		expect(res.body.error.code).toBe('VALIDATION_ERROR');
		expect(res.body.error.fields.name).toBeTruthy();
	});

	it('rejects a branch that holds no questions instead of creating a hollow course', async () => {
		const res = await asTeacher()
			.post(`${BASE}/generate`)
			.send({ name: 'Empty branch course', categoryId: emptyCategoryId, configId });
		expect(res.status).toBe(422);
		expect(String(res.body.error.fields.categoryId[0])).toMatch(/No questions found/i);
	});

	it('surfaces a provider outage as 502 AI_PROVIDER_ERROR', async () => {
		stubProviderFailure();
		const res = await asTeacher()
			.post(`${BASE}/generate`)
			.send({ name: 'Broken provider', categoryId: branchRootId, configId });
		expect(res.status).toBe(502);
		expect(res.body.error.code).toBe('AI_PROVIDER_ERROR');
		vi.unstubAllGlobals('fetch');
	});

	it('creates one lesson per leaf category, mapped to the server plan', async () => {
		stubProvider(
			'```json\n' +
				JSON.stringify([
					{ categoryId: lessonCategoryId, title: 'Les pluriels irréguliers', summary: 'Travailler les pluriels.' },
				]) +
				'\n```',
		);
		const res = await asTeacher()
			.post(`${BASE}/generate`)
			.send({ name: 'French — Unit 3', categoryId: branchRootId, configId, language: 'French' });
		vi.unstubAllGlobals('fetch');
		expect(res.status).toBe(201);
		expect(res.body.status).toBe('draft');
		expect(res.body.lessons).toHaveLength(1);
		expect(String(res.body.lessons[0].category_id)).toBe(String(lessonCategoryId));
		expect(res.body.lessons[0].ai_generated).toBe(true);
		courseId = res.body.id;
		lessonIds = res.body.lessons.map((l) => l.id);

		// The generation is audited like every other teacher mutation.
		const logs = await prisma.auditLog.findMany({ where: { entity_id: courseId, action: 'create' } });
		expect(logs.length).toBeGreaterThan(0);
	});
});

describe('course management endpoints', () => {
	it('lists the course with lesson count, class names and branch path', async () => {
		const res = await asTeacher().get('/api/v1/courses?limit=100');
		expect(res.status).toBe(200);
		const row = res.body.data.find((c) => String(c.id) === String(courseId));
		expect(row.lesson_count).toBe(1);
		// The list labels the course with its branch ROOT category; the full
		// leaf path is what the practice feed reports.
		expect(row.category_path).toBe('Unit 3');
		expect(row.class_names).toEqual([]);
	});

	it('students cannot reach the management surface', async () => {
		expect((await asStudent().get('/api/v1/courses')).status).toBe(403);
		expect((await asStudent().post(`/api/v1/courses/${courseId}/publish`)).status).toBe(403);
	});

	it('generates lesson content into markdown and stores it', async () => {
		stubProvider('## Objectives\n- reconnaître les pluriels irréguliers\n\n## Check yourself\nPratiquez les questions.');
		const res = await asTeacher()
			.post(`/api/v1/courses/${courseId}/lessons/${lessonIds[0]}/generate-content`)
			.send({ configId, language: 'French', includeQuestions: true });
		vi.unstubAllGlobals('fetch');
		expect(res.status).toBe(200);
		expect(res.body.content).toContain('## Objectives');

		const detail = await asTeacher().get(`/api/v1/courses/${courseId}`);
		expect(detail.body.lessons[0].content).toContain('Check yourself');
	});

	it('adds, edits and reorders lessons manually', async () => {
		const created = await asTeacher()
			.post(`/api/v1/courses/${courseId}/lessons`)
			.send({ title: 'Bilan', summary: 'Revision lesson' });
		expect(created.status).toBe(201);
		const secondId = created.body.id;

		const patched = await asTeacher()
			.patch(`/api/v1/courses/lessons/${secondId}`)
			.send({ summary: 'End-of-unit review' });
		expect(patched.body.summary).toBe('End-of-unit review');

		const reordered = await asTeacher()
			.post(`/api/v1/courses/${courseId}/lessons/reorder`)
			.send({ lessonIds: [secondId, lessonIds[0]] });
		expect(reordered.body.lessons.map((l) => l.id)).toEqual([secondId, lessonIds[0]]);

		const removed = await asTeacher().delete(`/api/v1/courses/lessons/${secondId}`);
		expect(removed.status).toBe(204);
		const after = await asTeacher().get(`/api/v1/courses/${courseId}`);
		expect(after.body.lessons.map((l) => l.id)).toEqual([lessonIds[0]]);
	});

	it('renames the course through PATCH', async () => {
		const res = await asTeacher().patch(`/api/v1/courses/${courseId}`).send({ name: 'French — Unit 3 (v2)' });
		expect(res.body.name).toBe('French — Unit 3 (v2)');
	});
});

describe('student visibility over HTTP', () => {
	it('hides drafts, then serves published + assigned courses only', async () => {
		expect((await asStudent().get('/api/v1/courses/student')).body.data).toHaveLength(0);

		const assign = await asTeacher()
			.post(`/api/v1/courses/${courseId}/assign`)
			.send({ classIds: [classOne.id] });
		expect(assign.status).toBe(200);
		expect(assign.body.class_ids).toEqual([classOne.id]);
		// Assigning twice is idempotent.
		const again = await asTeacher()
			.post(`/api/v1/courses/${courseId}/assign`)
			.send({ classIds: [classOne.id] });
		expect(again.body.class_ids).toEqual([classOne.id]);
		expect(await prisma.courseClass.count({ where: { course_id: courseId } })).toBe(1);

		// Assigned but still a draft → invisible.
		expect((await asStudent().get('/api/v1/courses/student')).body.data).toHaveLength(0);

		const published = await asTeacher().post(`/api/v1/courses/${courseId}/publish`);
		expect(published.body.status).toBe('published');

		const list = await asStudent().get('/api/v1/courses/student');
		expect(list.body.data).toHaveLength(1);
		expect(list.body.data[0].lesson_count).toBe(1);

		const detail = await asStudent().get(`/api/v1/courses/student/${courseId}`);
		expect(detail.body.lessons[0].content).toContain('## Objectives');

		// A draft the student was never assigned to is simply not found.
		const other = await prisma.course.create({
			data: { school_id: SCHOOL, created_by: teacher.id, name: 'Private draft' },
		});
		expect((await asStudent().get(`/api/v1/courses/student/${other.id}`)).status).toBe(404);
	});

	it('serves practice questions with answers and explanations stripped', async () => {
		const res = await asStudent().get(`/api/v1/courses/student/lessons/${lessonIds[0]}/practice`);
		expect(res.status).toBe(200);
		expect(res.body.total).toBe(2);
		expect(res.body.category.path).toBe('Unit 3 > Unit 3 — Axe 1');
		for (const q of res.body.data) {
			expect(q.answer).toBeUndefined();
			expect(q.explanation).toBeUndefined();
			expect(q.options_json).toBeUndefined();
			expect(q.question || q.text).toBeTruthy();
			expect(Array.isArray(q.options)).toBe(true);
		}
	});

	it('unpublishing hides the course again', async () => {
		await asTeacher().post(`/api/v1/courses/${courseId}/unpublish`);
		expect((await asStudent().get('/api/v1/courses/student')).body.data).toHaveLength(0);
	});
});
