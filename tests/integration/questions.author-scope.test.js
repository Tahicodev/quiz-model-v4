/**
 * tests/integration/questions.author-scope.test.js
 *
 * The Questions tab shows a different library to different teachers:
 *   - a teacher sees ONLY the questions they authored — never a colleague's,
 *     and never a legacy unattributed row (created_by NULL), which stays
 *     admin-only;
 *   - a teacher in another school sees only their own questions, never the
 *     other school's;
 *   - an admin sees every question of their own organization, because they
 *     administer content for the whole school.
 *
 * ── WHY THIS FILE REPLACES questions.game-studio-scope.test.js ──────────────
 * That test asserted a rule that no longer exists. It seeded
 * `prisma.kidsActivity` / `prisma.kidsActivityLevel` and expected a
 * `is_game_studio` flag on the question payload. Both were REMOVED:
 *   • KidsActivity was renamed to KidsGame, and its levels moved into
 *     KidsGame.config_json (migration 20261003_kids_tables);
 *   • the `is_game_studio` flag and the "primaire teacher sees only Game
 *     Studio questions" rule were replaced by AUTHORSHIP scoping
 *     (bootstrap.routes.js: a teacher receives only rows with
 *     created_by = their own id).
 *
 * `prisma.kidsActivity` has not existed in schema.prisma for many releases —
 * the test was asserting against a deleted schema and failing in
 * `beforeAll` before it could test anything. Reintroducing the model purely
 * to satisfy it would resurrect a deleted feature, so the coverage was
 * rewritten against the rule that is actually enforced today: authorship
 * scoping plus tenant isolation.
 *
 * This runs against a real database because the whole rule is a query, and a
 * mocked Prisma cannot catch a query the engine rejects.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;
let adminToken;

const PASSWORD = 'teacher123';

const PRIMAIRE = 'school-primaire';
const COLLEGE = 'school-college';

const TEACHER_PRIMAIRE = 'teacher-primaire';
const TEACHER_OTHER = 'teacher-college';
const TEACHER_COLLEAGUE = 'teacher-colleague';

// A question id per role expectation, so each assertion reads as the rule.
const Q_OWN = 'q-own';                   // authored by the primaire teacher
const Q_COLLEAGUE = 'q-colleague';      // authored by a colleague
const Q_LEGACY = 'q-legacy';            // unattributed legacy row (created_by NULL)
const Q_COLLEGE = 'q-college';          // the other school's question

const ALL_QUESTIONS = [Q_OWN, Q_COLLEAGUE, Q_LEGACY, Q_COLLEGE];

const questionIdsFor = (res) =>
	(res.body.data.questions || []).map((q) => q.id).sort();

beforeAll(async () => {
	const db = await setupTestDb();
	prisma = db.prisma;
	app = (await import('./helpers/app.js')).default;

	await prisma.school.create({ data: { id: PRIMAIRE, name: 'Ecole Primaire', slug: 'ecole-primaire', school_type: 'primaire' } });
	await prisma.school.create({ data: { id: COLLEGE, name: 'College', slug: 'college', school_type: 'college' } });

	// Real logins, because the rule is read off req.user: a fabricated token
	// would test the token check instead of the scoping.
	const teachers = [
		{ id: TEACHER_PRIMAIRE, username: 'tp', school_id: PRIMAIRE },
		{ id: TEACHER_OTHER, username: 'tc', school_id: COLLEGE },
		{ id: TEACHER_COLLEAGUE, username: 'tcol', school_id: PRIMAIRE },
	];
	for (const teacher of teachers) {
		await prisma.user.create({
			data: {
				...teacher,
				name: teacher.id,
				password_hash: await bcrypt.hash(PASSWORD, 4),
				role: 'teacher',
				status: 'active',
			},
		});
	}

	// An admin per school, so the admin case runs against real content instead
	// of the seeded school-test tenant, which holds no questions of its own.
	for (const schoolId of [PRIMAIRE, COLLEGE]) {
		await prisma.user.create({
			data: {
				id: `admin-${schoolId}`,
				name: `Admin ${schoolId}`,
				username: `admin-${schoolId}`,
				password_hash: await bcrypt.hash(PASSWORD, 4),
				role: 'admin',
				school_id: schoolId,
				status: 'active',
			},
		});
	}

	const question = (id, schoolId, createdBy) =>
		prisma.question.create({
			data: {
				id,
				school_id: schoolId,
				type: 'mcq',
				text: `Question ${id}`,
				answer: 'a',
				options_json: '["a","b"]',
				...(createdBy ? { created_by: createdBy } : {}),
			},
		});

	await question(Q_OWN, PRIMAIRE, TEACHER_PRIMAIRE);
	await question(Q_COLLEAGUE, PRIMAIRE, TEACHER_COLLEAGUE);
	await question(Q_LEGACY, PRIMAIRE, null);
	await question(Q_COLLEGE, COLLEGE, TEACHER_OTHER);

	adminToken = (await login(app, `admin-${PRIMAIRE}`)).body.accessToken;
});

afterAll(async () => {
	await teardownTestDb();
});

async function login(app, username) {
	const res = await request(app)
		.post('/api/v1/auth/login')
		// `force` ends the previous session of this account: the single-active
		// -session rule otherwise refuses the second sign-in of the same user.
		.send({ username, password: PASSWORD, force: true });
	if (!res.body?.accessToken) {
		throw new Error(`login failed for ${username}: ${JSON.stringify(res.body)}`);
	}
	return res;
}

/** A real access token for a seeded user, so scoping reads req.user correctly. */
async function tokenFor(app, username) {
	return (await login(app, username)).body.accessToken;
}

describe('the Questions tab shows each teacher the right library', () => {
	it('gives a teacher only the questions they authored', async () => {
		const res = await request(app)
			.get('/api/v1/bootstrap')
			.set('Authorization', `Bearer ${await tokenFor(app, 'tp')}`);
		expect(res.status).toBe(200);
		expect(questionIdsFor(res)).toEqual([Q_OWN]);
	});

	it("hides a colleague's question from a teacher", async () => {
		const res = await request(app)
			.get('/api/v1/bootstrap')
			.set('Authorization', `Bearer ${await tokenFor(app, 'tp')}`);
		expect(questionIdsFor(res)).not.toContain(Q_COLLEAGUE);
	});

	it('hides an unattributed legacy question from a teacher', async () => {
		// A row with created_by NULL is legacy shared content: admin-only.
		const res = await request(app)
			.get('/api/v1/bootstrap')
			.set('Authorization', `Bearer ${await tokenFor(app, 'tp')}`);
		expect(questionIdsFor(res)).not.toContain(Q_LEGACY);
	});

	it('gives a teacher in another school only their own questions', async () => {
		const res = await request(app)
			.get('/api/v1/bootstrap')
			.set('Authorization', `Bearer ${await tokenFor(app, 'tc')}`);
		expect(questionIdsFor(res)).toEqual([Q_COLLEGE]);
	});

	it('never leaks another school\'s questions across the tenant boundary', async () => {
		const primaire = await request(app)
			.get('/api/v1/bootstrap')
			.set('Authorization', `Bearer ${await tokenFor(app, 'tp')}`);
		const college = await request(app)
			.get('/api/v1/bootstrap')
			.set('Authorization', `Bearer ${await tokenFor(app, 'tc')}`);
		for (const id of questionIdsFor(primaire)) {
			expect(questionIdsFor(college)).not.toContain(id);
		}
	});

	it('gives an admin every question of their organization', async () => {
		const res = await request(app)
			.get('/api/v1/bootstrap')
			.set('Authorization', `Bearer ${adminToken}`);
		expect(res.status).toBe(200);
		for (const id of [Q_OWN, Q_COLLEAGUE, Q_LEGACY]) {
			expect(questionIdsFor(res)).toContain(id);
		}
		// …and never another organization's.
		expect(questionIdsFor(res)).not.toContain(Q_COLLEGE);
	});
});
