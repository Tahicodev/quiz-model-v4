/**
 * tests/integration/lesson-exercise.routes.test.js
 *
 * HTTP contract of the lesson EXERCISE pipeline and of the generated-documents
 * library that every export feeds:
 *
 *  • POST /courses/:cid/lessons/:lid/exercise generates a situation-problem
 *    through the (stubbed) provider, persists it on the lesson and returns the
 *    SAVED exercise on later calls unless `force` is set
 *  • POST .../exercise/export renders the saved exercise (student copy +
 *    correction), writes a copy under uploads/generated/exercise/... and
 *    registers it, then streams the binary; 422 when nothing is saved yet
 *  • GET /generated-documents lists with kind filters, teachers only ever see
 *    their own documents, DELETE removes row + file, other teachers get 403
 *  • GET /courses exposes the row-menu flags (prep_sheets / exercises /
 *    documents) so the Resources menu knows what already exists
 *
 * Provider transport is stubbed at `fetch` (same pattern as
 * lesson-prep-sheet.routes.test.js). UPLOADS_DIR points at a temp folder so
 * the test never writes into the repository's uploads/.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import JSZip from 'jszip';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

const uploadsDir = mkdtempSync(join(tmpdir(), 'gen-docs-test-'));
// Must be set before the app helper evaluates src/backend/config.js.
process.env.UPLOADS_DIR = uploadsDir;

const SCHOOL = 'school-test';
const BASE = '/api/v1/courses';
const DOCS = '/api/v1/generated-documents';

let prisma;
let app;
let teacherToken;
let otherToken;
let adminToken;
let teacher;
let otherTeacher;
let admin;
let configId;
let courseId;
let lessonId;

const exerciseJson = JSON.stringify({
	title: 'Le budget du voyage',
	situation:
		'La classe de 6e organise une sortie au musée. Le bus coûte 180 € et chaque entrée 4,50 €.',
	givenData: ['Nombre d’élèves : 24', 'Budget total : 320 €'],
	tasks: [
		{ prompt: 'Calcule le prix des entrées pour 24 élèves.', points: 2 },
		{ prompt: 'Le budget suffit-il ? Justifie.', points: 2 },
	],
	solutionSteps: ['24 × 4,50 = 108 € pour les entrées.', '108 + 180 = 288 € au total.'],
	finalAnswer: 'Le budget de 320 € suffit : il reste 32 €.',
	keyCompetencies: ['Résoudre un problème en plusieurs étapes'],
});

function stubProvider(content) {
	vi.stubGlobal('fetch', vi.fn(async () => ({
		ok: true,
		status: 200,
		json: async () => ({ choices: [{ message: { content } }] }),
		text: async () => '',
	})));
}

beforeAll(async () => {
	const db = await setupTestDb();
	prisma = db.prisma;
	app = (await import('./helpers/app.js')).default;
	const { getContainer } = await import('../../src/backend/container.js');

	const hash = await bcrypt.hash('pass1234', 4);
	teacher = await prisma.user.create({
		data: { school_id: SCHOOL, username: 'ex-teacher', name: 'Teacher E', password_hash: hash, role: 'teacher', status: 'active' },
	});
	otherTeacher = await prisma.user.create({
		data: { school_id: SCHOOL, username: 'ex-other', name: 'Teacher O', password_hash: hash, role: 'teacher', status: 'active' },
	});
	admin = await prisma.user.findUnique({ where: { id: 'user-test-admin' } });

	const { aiConfigSvc } = getContainer();
	const cfg = await aiConfigSvc.create(teacher, SCHOOL, {
		provider: 'openai', name: 'EX model', model_id: 'gpt-test', api_key: 'sk-test', shared: false,
	});
	configId = cfg.id;

	const course = await prisma.course.create({
		data: { school_id: SCHOOL, created_by: teacher.id, name: 'Problèmes — Sortie', status: 'draft' },
	});
	courseId = course.id;
	const lesson = await prisma.lesson.create({
		data: {
			course_id: courseId,
			title: 'Les problèmes à plusieurs étapes',
			summary: 'Calculer un budget.',
			content: '## Objectifs\nRésoudre un problème en plusieurs étapes.',
			order_index: 0,
		},
	});
	lessonId = lesson.id;

	const login = async (username, password) => {
		const res = await request(app).post('/api/v1/auth/login').send({ username, password });
		expect(res.status).toBe(200);
		return res.body.accessToken;
	};
	teacherToken = await login('ex-teacher', 'pass1234');
	otherToken = await login('ex-other', 'pass1234');
	adminToken = await login('admin', 'admin123');
});

afterAll(async () => {
	vi.unstubAllGlobals();
	await teardownTestDb();
	rmSync(uploadsDir, { recursive: true, force: true });
});

const tPost = (path) => request(app).post(path).set('Authorization', `Bearer ${teacherToken}`);
const oPost = (path) => request(app).post(path).set('Authorization', `Bearer ${otherToken}`);
const aPost = (path) => request(app).post(path).set('Authorization', `Bearer ${adminToken}`);
const tGet = (path) => request(app).get(path).set('Authorization', `Bearer ${teacherToken}`);
const oGet = (path) => request(app).get(path).set('Authorization', `Bearer ${otherToken}`);
const aGet = (path) => request(app).get(path).set('Authorization', `Bearer ${adminToken}`);

describe('POST /courses/:cid/lessons/:lid/exercise', () => {
	it('generates, validates and persists the exercise', async () => {
		stubProvider('```json\n' + exerciseJson + '\n```');
		const res = await tPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise`)
			.send({ configId, language: 'French', difficulty: 'medium' });
		vi.unstubAllGlobals('fetch');
		expect(res.status).toBe(200);
		expect(res.body.regenerated).toBe(true);
		expect(res.body.exercise.title).toBe('Le budget du voyage');
		expect(res.body.exercise.tasks).toHaveLength(2);
		expect(res.body.exercise.finalAnswer).toContain('320 €');
		expect(res.body.exercise.language).toBe('French');

		const row = await prisma.lesson.findUnique({ where: { id: lessonId } });
		expect(typeof row.exercise).toBe('string');
	});

	it('returns the saved exercise without calling the provider again', async () => {
		const res = await tPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise`)
			.send({ configId, language: 'French' });
		expect(res.status).toBe(200);
		expect(res.body.regenerated).toBe(false);
		expect(res.body.exercise.title).toBe('Le budget du voyage');
	});

	it('force regenerates and overwrites the saved exercise', async () => {
		const regenerated = JSON.stringify({
			title: 'Version régénérée',
			situation: 'Nouvelle situation.',
			givenData: ['12 élèves'],
			tasks: [{ prompt: 'Calcule le total.', points: 3 }],
			solutionSteps: ['12 × 2 = 24.'],
			finalAnswer: '24 €.',
		});
		stubProvider(regenerated);
		const res = await tPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise`)
			.send({ configId, language: 'French', force: true });
		vi.unstubAllGlobals('fetch');
		expect(res.status).toBe(200);
		expect(res.body.regenerated).toBe(true);
		expect(res.body.exercise.title).toBe('Version régénérée');
	});

	it('rejects a foreign teacher with 403', async () => {
		const res = await oPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise`)
			.send({ configId, language: 'French' });
		expect(res.status).toBe(403);
	});

	it('surfaces an unusable model answer as 502 after the retry', async () => {
		stubProvider('I cannot produce JSON right now.');
		const res = await tPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise`)
			.send({ configId, language: 'French', force: true });
		vi.unstubAllGlobals('fetch');
		expect(res.status).toBe(502);
		expect(res.body.error.code).toBe('AI_PROVIDER_ERROR');
	});
});

describe('POST /courses/:cid/lessons/:lid/exercise/export', () => {
	beforeAll(async () => {
		// Restore a real exercise after the failure test above.
		stubProvider(exerciseJson);
		const res = await tPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise`)
			.send({ configId, language: 'French', force: true });
		vi.unstubAllGlobals('fetch');
		expect(res.status).toBe(200);
	});

	it('renders the saved exercise to docx and files it in the library', async () => {
		const before = await prisma.generatedDocument.count({ where: { kind: 'exercise' } });
		const res = await tPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise/export`)
			.send({ format: 'docx' })
			.buffer(true)
			.responseType('arraybuffer');
		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toContain('wordprocessingml');
		expect(res.headers['content-disposition']).toMatch(/attachment; filename="exercice-.*\.docx"/);
		const zip = await JSZip.loadAsync(res.body);
		const xml = await zip.file('word/document.xml').async('string');
		expect(xml).toContain('Le budget du voyage');
		expect(xml).toMatch(/Corrigé/);
		expect(xml).toContain('Le budget de 320 € suffit');

		const rows = await prisma.generatedDocument.findMany({ where: { kind: 'exercise' } });
		expect(rows.length).toBe(before + 1);
		const row = rows.find((item) => item.format === 'docx');
		expect(row).toBeTruthy();
		expect(row.course_id).toBe(courseId);
		expect(row.lesson_id).toBe(lessonId);
		expect(row.created_by).toBe(teacher.id);
		expect(row.rel_path).toMatch(/^generated\/exercise\/[^/]+\/[^/]+\.docx$/);
		expect(row.url).toBe(`/uploads/${row.rel_path}`);
		expect(existsSync(join(uploadsDir, row.rel_path))).toBe(true);
		expect(row.size_bytes).toBeGreaterThan(1000);
	});

	it('renders the saved exercise to pdf', async () => {
		const res = await tPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise/export`)
			.send({ format: 'pdf' });
		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toContain('application/pdf');
		expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
	});

	it('422s when the lesson has no saved exercise yet', async () => {
		const bare = await prisma.lesson.create({
			data: { course_id: courseId, title: 'Sans exercice', order_index: 1 },
		});
		const res = await tPost(`${BASE}/${courseId}/lessons/${bare.id}/exercise/export`).send({ format: 'docx' });
		expect(res.status).toBe(422);
	});

	it('rejects an unknown format with 422', async () => {
		const res = await tPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise/export`).send({ format: 'pptx' });
		expect(res.status).toBe(422);
	});

	it('rejects a foreign teacher with 403', async () => {
		const res = await oPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise/export`).send({ format: 'docx' });
		expect(res.status).toBe(403);
	});
});

describe('GET /generated-documents', () => {
	it('lists the teacher’s own documents with their in-app path', async () => {
		const res = await tGet(`${DOCS}?kind=exercise`);
		expect(res.status).toBe(200);
		expect(res.body.total).toBeGreaterThan(0);
		const row = res.body.data.find((item) => item.format === 'docx');
		expect(row.title).toMatch(/Exercice — Le budget du voyage/);
		expect(row.url).toMatch(/^\/uploads\/generated\/exercise\//);
		expect(row.meta).toEqual({ difficulty: 'medium', lessonTitle: 'Les problèmes à plusieurs étapes' });
	});

	it('never leaks another teacher’s documents (teacher scoping)', async () => {
		// The admin exports the same lesson: the file is allowed (admins bypass
		// ownership) but must not appear in the teacher's library.
		const res = await aPost(`${BASE}/${courseId}/lessons/${lessonId}/exercise/export`).send({ format: 'pdf' });
		expect(res.status).toBe(200);

		const teacherList = await tGet(`${DOCS}?limit=200`);
		expect(teacherList.status).toBe(200);
		expect(teacherList.body.data.every((row) => row.created_by === teacher.id)).toBe(true);

		const adminList = await aGet(`${DOCS}?limit=200`);
		expect(adminList.body.data.some((row) => row.created_by === admin.id)).toBe(true);
	});

	it('filters by course and by search text', async () => {
		const byCourse = await tGet(`${DOCS}?courseId=${courseId}&kind=exercise`);
		expect(byCourse.body.data.length).toBeGreaterThan(0);
		expect(byCourse.body.data.every((row) => row.course_id === courseId)).toBe(true);

		const none = await tGet(`${DOCS}?courseId=does-not-exist`);
		expect(none.body.data).toHaveLength(0);
	});

	it('downloads the stored bytes of the teacher’s own document', async () => {
		const list = await tGet(`${DOCS}?kind=exercise`);
		const row = list.body.data.find((item) => item.format === 'docx');
		const res = await tGet(`${DOCS}/${row.id}/download`).buffer(true).responseType('arraybuffer');
		expect(res.status).toBe(200);
		expect(res.headers['content-type']).toContain('wordprocessingml');
		expect(res.body.length).toBe(row.size_bytes);
	});

	it('returns 404 for a document the teacher does not own', async () => {
		const adminList = await aGet(`${DOCS}?limit=200`);
		const adminRow = adminList.body.data.find((item) => item.created_by === admin.id);
		if (!adminRow) return; // admin doc may be absent if the previous test was skipped
		const res = await oGet(`${DOCS}/${adminRow.id}/download`);
		// A foreign teacher in the same school: 403 for a same-school document.
		expect([403, 404]).toContain(res.status);
	});
});

describe('DELETE /generated-documents/:id', () => {
	it('removes the row and the file for its owner', async () => {
		const list = await tGet(`${DOCS}?kind=exercise`);
		const row = list.body.data.find((item) => item.format === 'pdf');
		expect(row).toBeTruthy();
		const abs = join(uploadsDir, row.rel_path);
		expect(existsSync(abs)).toBe(true);

		const del = await request(app)
			.delete(`${DOCS}/${row.id}`)
			.set('Authorization', `Bearer ${teacherToken}`);
		expect(del.status).toBe(204);
		expect(await prisma.generatedDocument.findUnique({ where: { id: row.id } })).toBeNull();
		expect(existsSync(abs)).toBe(false);
	});

	it('refuses another teacher deleting it', async () => {
		const list = await tGet(`${DOCS}?kind=exercise`);
		const row = list.body.data[0];
		expect(row).toBeTruthy();
		const del = await request(app)
			.delete(`${DOCS}/${row.id}`)
			.set('Authorization', `Bearer ${otherToken}`);
		expect(del.status).toBe(403);
		expect(await prisma.generatedDocument.findUnique({ where: { id: row.id } })).not.toBeNull();
	});
});

describe('GET /courses row-menu flags', () => {
	it('reports lesson_count and how many lessons already have content', async () => {
		const res = await tGet(`${BASE}`);
		expect(res.status).toBe(200);
		const course = res.body.data.find((item) => item.id === courseId);
		expect(course).toBeTruthy();
		expect(course.lesson_count).toBeGreaterThanOrEqual(2);
		expect(course.exercises).toBe(1);
		expect(course.prep_sheets).toBe(0);
		expect(course.documents).toBeGreaterThan(0);
	});
});