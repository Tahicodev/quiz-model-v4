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
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

const SCHOOL = 'school-test';
const BASE = '/api/v1/courses';

let prisma;
let app;
let teacherToken;
let studentToken;
let teacher;
let subjectId;
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
	const subject = await prisma.subject.create({
		data: { school_id: SCHOOL, created_by: teacher.id, name: 'French' },
	});
	subjectId = subject.id;
	await prisma.user.create({
		data: {
			school_id: SCHOOL, class_id: classOne.id, username: 'rt-student', name: 'Student',
			password_hash: hash, role: 'student', status: 'active',
		},
	});

	const branch = await prisma.category.create({
		data: { school_id: SCHOOL, subject_id: subjectId, name: 'Unit 3', created_by: teacher.id },
	});
	branchRootId = branch.id;
	const axe = await prisma.category.create({
		data: { school_id: SCHOOL, subject_id: subjectId, name: 'Unit 3 — Axe 1', parent_id: branch.id, created_by: teacher.id },
	});
	lessonCategoryId = axe.id;
	const emptyBranch = await prisma.category.create({
		data: { school_id: SCHOOL, subject_id: subjectId, name: 'Unit 9', created_by: teacher.id },
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

	it('can generate an outline for a new empty category structure when explicitly requested', async () => {
		stubProvider(JSON.stringify([
			{ categoryId: emptyCategoryId, title: 'First lesson', summary: 'A new lesson outline.' },
		]));
		const res = await asTeacher()
			.post(`${BASE}/generate`)
			.send({
				name: 'New structure course',
				categoryId: emptyCategoryId,
				configId,
				includeEmptyCategories: true,
			});
		vi.unstubAllGlobals('fetch');
		expect(res.status).toBe(201);
		expect(res.body.lessons).toHaveLength(1);
		expect(String(res.body.lessons[0].category_id)).toBe(String(emptyCategoryId));
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

	it('exports a structured course document as PDF and DOCX using selected styles', async () => {
		const payload = {
			templateId: 'moderne',
			headerLayout: 'split',
			includeCover: true,
			includeTableOfContents: true,
			startEachLessonOnNewPage: false,
			header: { schoolName: 'North School', teacherName: 'Teacher A', academicYear: '2025-2026' },
		};
		const pdf = await asTeacher()
			.post(`${BASE}/${courseId}/documents/export`)
			.send({ ...payload, format: 'pdf' });
		expect(pdf.status).toBe(200);
		expect(pdf.headers['content-type']).toContain('application/pdf');
		expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

		const docx = await asTeacher()
			.post(`${BASE}/${courseId}/documents/export`)
			.buffer(true)
			.parse((response, callback) => {
				const chunks = [];
				response.on('data', (chunk) => chunks.push(chunk));
				response.on('end', () => callback(null, Buffer.concat(chunks)));
			})
			.send({ ...payload, format: 'docx' });
		expect(docx.status).toBe(200);
		expect(docx.headers['content-type']).toContain('wordprocessingml.document');
		expect(docx.body.subarray(0, 2).toString()).toBe('PK');
	});

	it('validates document export options', async () => {
		const res = await asTeacher()
			.post(`${BASE}/${courseId}/documents/export`)
			.send({ format: 'html', templateId: 'unknown' });
		expect(res.status).toBe(422);
		expect(res.body.error.code).toBe('VALIDATION_ERROR');
	});

	it('students cannot reach the management surface', async () => {
		expect((await asStudent().get('/api/v1/courses')).status).toBe(403);
		expect((await asStudent().post(`/api/v1/courses/${courseId}/publish`)).status).toBe(403);
	});

	it('generates lesson content into markdown and stores it', async () => {
		stubProvider('## Objectifs\n- reconnaître les pluriels irréguliers\n\n## Vérifiez vos acquis\nPratiquez les questions.');
		const res = await asTeacher()
			.post(`/api/v1/courses/${courseId}/lessons/${lessonIds[0]}/generate-content`)
			.send({ configId, language: 'French', includeQuestions: true });
		vi.unstubAllGlobals('fetch');
		expect(res.status).toBe(200);
		expect(res.body.content).toContain('## Objectifs');

		const detail = await asTeacher().get(`/api/v1/courses/${courseId}`);
		expect(detail.body.lessons[0].content).toContain('Vérifiez vos acquis');
	});

	it('returns the lesson-generation prompt for copying to another AI', async () => {
		const res = await asTeacher()
			.post(`/api/v1/courses/${courseId}/lessons/${lessonIds[0]}/generate-content`)
			.send({ promptOnly: true, language: 'French', includeQuestions: true });
		expect(res.status).toBe(200);
		expect(res.body.prompt).toContain('COURSE: French — Unit 3');
		expect(res.body.prompt).toContain('Les pluriels irréguliers');
		expect(res.body.prompt).toContain('Unit 3 > Unit 3 — Axe 1');
		expect(res.body.prompt).toContain('What is the plural of "cheval"?');
		// headings are localized to the target language, not left in English
		expect(res.body.prompt).toContain('## Objectifs');
		expect(res.body.prompt).toContain('## Vérifiez vos acquis');
	});

	it('uses the established lesson route for prompt-only mode without calling an AI provider', async () => {
		const res = await asTeacher()
			.post(`/api/v1/courses/${courseId}/lessons/${lessonIds[0]}/generate-content`)
			.send({ promptOnly: true, language: 'French' });
		expect(res.status).toBe(200);
		expect(res.body.prompt).toContain('RULES:');
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

describe('course document import', () => {
	it('previews an editable outline and creates categories with unchanged source text', async () => {
		const document = new Document({
			sections: [{
				children: [
					new Paragraph({ text: 'Imported Module', heading: HeadingLevel.HEADING_1 }),
					new Paragraph('Introductory paragraph.'),
					new Paragraph({ text: 'Basics', heading: HeadingLevel.HEADING_2 }),
					new Paragraph({ text: 'Information', heading: HeadingLevel.HEADING_3 }),
					new Paragraph('This text must remain exactly as written.'),
				],
			}],
		});
		const file = await Packer.toBuffer(document);
		const providerFetch = vi.fn();
		vi.stubGlobal('fetch', providerFetch);
		const preview = await asTeacher()
			.post(`${BASE}/import/preview`)
			.send({
				filename: 'imported-course.docx',
				data: file.toString('base64'),
			});
		expect(providerFetch).not.toHaveBeenCalled();
		vi.unstubAllGlobals('fetch');

		expect(preview.status, JSON.stringify(preview.body)).toBe(200);
		expect(preview.body.detectionMethod).toBe('docx-styles-and-local-patterns');
		expect(preview.body.title).toBe('imported course');
		expect(preview.body.description).toBe('');
		expect(preview.body.documentText).toContain('This text must remain exactly as written.');
		expect(preview.body.headings.map(({ line, level }) => ({ line, level }))).toEqual([
			{ line: 1, level: 1 },
			{ line: 5, level: 2 },
			{ line: 7, level: 3 },
		]);

		const duplicateNames = await asTeacher()
			.post(`${BASE}/import`)
			.send({
				name: 'Invalid imported course',
				subject_id: subjectId,
				documentText: preview.body.documentText,
				headings: [
					{ line: 1, level: 1, title: 'Repeated category' },
					{ line: 5, level: 1, title: 'Repeated category' },
				],
			});
		expect(duplicateNames.status).toBe(422);
		expect(duplicateNames.body.error.fields.headings[0]).toContain('cannot repeat under the same parent');
		expect(await prisma.category.count({ where: { school_id: SCHOOL, name: 'Repeated category' } })).toBe(0);

		const existingCategoryName = await asTeacher()
			.post(`${BASE}/import`)
			.send({
				name: 'Existing category title import',
				subject_id: subjectId,
				documentText: 'Unit 3\nSome content',
				headings: [{ line: 1, level: 1, title: 'Unit 3' }],
			});
		// One course owns one branch: "Unit 3" is already the structure of the
		// generated course, so a second course on it is refused (422) instead of
		// silently sharing the branch. The heading still resolves to the existing
		// row, so no duplicate category is authored by the failed import.
		expect(existingCategoryName.status, JSON.stringify(existingCategoryName.body)).toBe(422);
		expect(String(existingCategoryName.body.error.fields.category_id[0]))
			.toContain('This structure already belongs to the course "French — Unit 3 (v2)"');
		expect(await prisma.category.count({ where: { school_id: SCHOOL, name: 'Unit 3' } })).toBe(1);
		expect(await prisma.course.count({ where: { school_id: SCHOOL, name: 'Existing category title import' } })).toBe(0);

		const created = await asTeacher()
			.post(`${BASE}/import`)
			.send({
				name: 'Imported Module',
				subject_id: subjectId,
				description: preview.body.description,
				documentText: preview.body.documentText,
				headings: preview.body.headings.map((heading) => ({
					line: heading.line,
					level: heading.level,
					title: heading.sourceText,
				})),
			});
		expect(created.status).toBe(201);
		expect(created.body.lessons).toHaveLength(3);
		expect(created.body.lessons[0].content).toContain('Introductory paragraph.');
		expect(created.body.lessons[2].content).toContain('This text must remain exactly as written.');
		expect(created.body.imported_categories).toHaveLength(3);
		expect(created.body.category_id).toBe(created.body.imported_categories[0].id);
		expect(created.body.imported_categories[2].parent_id).toBe(created.body.imported_categories[1].id);
		expect(created.body.subject_id).toBe(subjectId);
		expect(created.body.imported_categories.every((category) => category.subject_id === subjectId)).toBe(true);

		const repeatedImport = await asTeacher()
			.post(`${BASE}/import`)
			.send({
				name: 'Repeated Imported Module',
				subject_id: subjectId,
				documentText: preview.body.documentText,
				headings: preview.body.headings.map((heading) => ({
					line: heading.line,
					level: heading.level,
					title: heading.sourceText,
				})),
			});
		// The identical outline resolves to the categories the first import just
		// authored — and those belong to "Imported Module", so the second course
		// is refused. The rollback only removes rows this request created, so the
		// first import's branch survives untouched.
		expect(repeatedImport.status, JSON.stringify(repeatedImport.body)).toBe(422);
		expect(String(repeatedImport.body.error.fields.category_id[0]))
			.toContain('This structure already belongs to the course "Imported Module"');
		expect(await prisma.category.count({ where: { school_id: SCHOOL, name: 'Imported Module' } })).toBe(1);
		expect(await prisma.course.count({ where: { school_id: SCHOOL, name: 'Repeated Imported Module' } })).toBe(0);
	});
});

describe('POST /courses and POST /courses/with-structure (the merged pipeline)', () => {
	it('creates the subject-bound structure and its course in one call', async () => {
		const res = await asTeacher()
			.post(`${BASE}/with-structure`)
			.send({
				name: 'Addition workspace',
				subjectId,
				rootName: 'Addition',
				groups: [
					{ name: 'Tens', axes: ['Carrying', 'Without carrying'] },
					{ name: 'Units', axes: ['Make ten'] },
				],
			});
		expect(res.status, JSON.stringify(res.body)).toBe(201);
		// root + 2 subcategories + 3 axes, every row stamped with the subject.
		expect(res.body.created_categories).toHaveLength(6);
		expect(res.body.created_categories.every((c) => String(c.subject_id) === String(subjectId))).toBe(true);
		const [root] = res.body.created_categories;
		expect(root.parent_id).toBeNull();
		expect(String(res.body.category_id)).toBe(String(root.id));
		expect(String(res.body.subject_id)).toBe(String(subjectId));
		expect(res.body.status).toBe('draft');
		expect(Array.isArray(res.body.lessons)).toBe(true);
		const subs = await prisma.category.findMany({ where: { parent_id: root.id } });
		expect(subs.map((c) => c.name).sort()).toEqual(['Tens', 'Units']);
		const axes = await prisma.category.count({
			where: { parent_id: { in: subs.map((c) => c.id) } },
		});
		expect(axes).toBe(3);
		const logs = await prisma.auditLog.findMany({ where: { entity_id: root.id, action: 'create' } });
		expect(logs.length).toBeGreaterThan(0);
	});

	it('rejects an incomplete scaffold before touching the database', async () => {
		const categoriesBefore = await prisma.category.count({ where: { school_id: SCHOOL } });
		const res = await asTeacher().post(`${BASE}/with-structure`).send({});
		expect(res.status).toBe(422);
		expect(res.body.error.fields.name).toBeTruthy();
		expect(res.body.error.fields.subjectId).toBeTruthy();
		expect(res.body.error.fields.rootName).toBeTruthy();
		expect(res.body.error.fields.groups).toBeTruthy();
		expect(await prisma.category.count({ where: { school_id: SCHOOL } })).toBe(categoriesBefore);
	});

	it('removes the categories it created when the AI outline call fails', async () => {
		stubProviderFailure();
		const res = await asTeacher()
			.post(`${BASE}/with-structure`)
			.send({
				name: 'Failed outline course',
				subjectId,
				rootName: 'Rollback Root',
				groups: [{ name: 'Rollback Sub', axes: ['Rollback Axe'] }],
				configId,
			});
		vi.unstubAllGlobals('fetch');
		expect(res.status, JSON.stringify(res.body)).toBe(502);
		expect(res.body.error.code).toBe('AI_PROVIDER_ERROR');
		expect(await prisma.category.count({
			where: { school_id: SCHOOL, name: { in: ['Rollback Root', 'Rollback Sub', 'Rollback Axe'] } },
		})).toBe(0);
		expect(await prisma.course.count({ where: { school_id: SCHOOL, name: 'Failed outline course' } })).toBe(0);
	});

	it('refuses to create the course twice on the same branch', async () => {
		const res = await asTeacher()
			.post(BASE)
			.send({ name: 'Second Unit 3 course', category_id: branchRootId, subject_id: subjectId });
		expect(res.status, JSON.stringify(res.body)).toBe(422);
		expect(String(res.body.error.fields.category_id[0])).toMatch(/already belongs to the course/i);
		expect(await prisma.course.count({ where: { school_id: SCHOOL, name: 'Second Unit 3 course' } })).toBe(0);
	});

	it('refuses a course without a category structure', async () => {
		const res = await asTeacher().post(BASE).send({ name: 'Branch-less course' });
		expect(res.status).toBe(422);
		expect(res.body.error.fields.category_id[0]).toMatch(/needs its own category structure/i);
	});

	it('creates a course on a still-free branch, deriving its subject from it', async () => {
		const spare = await prisma.category.create({
			data: { school_id: SCHOOL, subject_id: subjectId, name: 'Unit 7', created_by: teacher.id },
		});
		const res = await asTeacher().post(BASE).send({ name: 'Manual course', category_id: spare.id });
		expect(res.status, JSON.stringify(res.body)).toBe(201);
		expect(String(res.body.category_id)).toBe(String(spare.id));
		expect(String(res.body.subject_id)).toBe(String(subjectId));
		expect(res.body.lessons).toEqual([]);
	});

	it('refuses a teacher using another teacher\'s branch or subject', async () => {
		const hash = await bcrypt.hash('pass1234', 4);
		const peer = await prisma.user.create({
			data: {
				school_id: SCHOOL, username: 'rt-peer', name: 'Peer teacher', password_hash: hash,
				role: 'teacher', status: 'active',
			},
		});
		const peerSubject = await prisma.subject.create({
			data: { school_id: SCHOOL, created_by: peer.id, name: 'Peer French' },
		});
		const login = await request(app).post('/api/v1/auth/login')
			.send({ username: 'rt-peer', password: 'pass1234' });
		expect(login.status).toBe(200);
		const asPeer = () => authed(login.body.accessToken);

		// The branch belongs to somebody else…
		const onBranch = await asPeer().post(BASE).send({ name: 'Stolen branch course', category_id: branchRootId });
		expect(onBranch.status).toBe(403);
		// …and so does the subject the structure would be created under.
		const onSubject = await asPeer().post(`${BASE}/with-structure`).send({
			name: 'Stolen subject course', subjectId, rootName: 'Stolen root', groups: [{ name: 'Sub', axes: [] }],
		});
		expect(onSubject.status).toBe(403);
		expect(await prisma.category.count({ where: { school_id: SCHOOL, name: 'Stolen root' } })).toBe(0);
		// The peer can scaffold their own subject, so the refusals above are about
		// ownership and not about the role.
		const own = await asPeer().post(`${BASE}/with-structure`).send({
			name: 'Peer workspace', subjectId: peerSubject.id, rootName: 'Peer unit',
			groups: [{ name: 'Peer sub', axes: ['Peer axe'] }],
		});
		expect(own.status, JSON.stringify(own.body)).toBe(201);
		expect(String(own.body.subject_id)).toBe(String(peerSubject.id));
	});

	it('keeps other tenants out of both routes', async () => {
		const other = await prisma.school.create({ data: { name: 'Other School', slug: 'other-tenant' } });
		const otherSubject = await prisma.subject.create({
			data: { school_id: other.id, created_by: teacher.id, name: 'Foreign subject' },
		});
		const otherBranch = await prisma.category.create({
			data: { school_id: other.id, name: 'Foreign branch', created_by: teacher.id },
		});

		const crossBranch = await asTeacher().post(BASE).send({ name: 'Cross tenant course', category_id: otherBranch.id });
		expect(crossBranch.status).toBe(422);
		expect(String(crossBranch.body.error.fields.category_id[0])).toMatch(/not found in this school/i);

		const crossSubject = await asTeacher().post(`${BASE}/with-structure`).send({
			name: 'Cross tenant structure', subjectId: otherSubject.id, rootName: 'Cross root',
			groups: [{ name: 'Sub', axes: [] }],
		});
		expect(crossSubject.status).toBe(422);
		expect(String(crossSubject.body.error.fields.subject_id[0])).toMatch(/does not belong to this school/i);
		expect(await prisma.category.count({ where: { school_id: SCHOOL, name: 'Cross root' } })).toBe(0);

		expect((await asStudent().post(BASE).send({ name: 'Student course', category_id: branchRootId })).status).toBe(403);
		expect((await asStudent().post(`${BASE}/with-structure`).send({
			name: 'Student structure', subjectId, rootName: 'Student root', groups: [{ name: 'Sub', axes: [] }],
		})).status).toBe(403);
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
		expect(detail.body.lessons[0].content).toContain('## Objectifs');
		expect(detail.body.lessons[0].category_levels.map((level) => level.name)).toEqual([
			'Unit 3',
			'Unit 3 — Axe 1',
		]);
		expect(detail.body.category_structure).toMatchObject({
			name: 'Unit 3',
			children: [{ name: 'Unit 3 — Axe 1', lesson: { id: lessonIds[0] } }],
		});

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
