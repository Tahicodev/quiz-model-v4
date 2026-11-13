/**
 * tests/integration/security-hardening.test.js
 *
 * The Phase 5 hardening, proven against the real API:
 *
 *   1. A TEACHER cannot overwrite an administrator-only setting through the
 *      bulk endpoint. `system.recovery_code_hash` is the sharpest case: a
 *      teacher who could write it would mint a recovery ticket and reset an
 *      administrator's password — a full privilege escalation.
 *   2. A teacher cannot change the visibility tier of a setting.
 *   3. The generic query dispatcher CLAMPS the settings visibility tier to
 *      the caller's role, so a student cannot ask for the admin tier.
 *   4. The generic query dispatcher refuses to resolve another user's
 *      "available for student" data outside the caller's organization.
 *   5. The server monitoring view is an ADMINISTRATOR surface: a teacher is
 *      refused, and an organization administrator only sees their own
 *      organization's traffic.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;

const SCHOOL_A = 'school-a';
const SCHOOL_B = 'school-b';
const PASSWORD = 'teacher123';

beforeAll(async () => {
	const db = await setupTestDb();
	prisma = db.prisma;
	app = (await import('./helpers/app.js')).default;

	await prisma.school.create({ data: { id: SCHOOL_A, name: 'School A', slug: 'school-a' } });
	await prisma.school.create({ data: { id: SCHOOL_B, name: 'School B', slug: 'school-b' } });

	const hash = await bcrypt.hash(PASSWORD, 4);
	const mk = (id, schoolId, username, role) =>
		prisma.user.create({
			data: {
				id,
				school_id: schoolId,
				username,
				name: username,
				password_hash: hash,
				role,
				status: 'active',
			},
		});

	await mk('admin-a', SCHOOL_A, 'admin-a', 'admin');
	await mk('teacher-a', SCHOOL_A, 'teacher-a', 'teacher');
	await mk('student-a', SCHOOL_A, 'student-a', 'student');
	await mk('admin-b', SCHOOL_B, 'admin-b', 'admin');
	await mk('student-b', SCHOOL_B, 'student-b', 'student');

	// An admin-only setting and a system setting to protect.
	await prisma.setting.create({
		data: {
			id: 'set-public',
			school_id: SCHOOL_A,
			key: 'app.name',
			value: 'Quiz App',
			visibility: 'public',
		},
	});
	await prisma.setting.create({
		data: {
			id: 'set-admin',
			school_id: SCHOOL_A,
			key: 'auth.registration_code',
			value: 'admin-only',
			visibility: 'admin',
		},
	});
	await prisma.setting.create({
		data: {
			id: 'set-system',
			school_id: SCHOOL_A,
			key: 'system.recovery_code_hash',
			value: 'server-owned',
			visibility: 'system',
		},
	});
	await prisma.setting.create({
		data: {
			id: 'set-teacher',
			school_id: SCHOOL_A,
			key: 'exam.default_duration',
			value: '60',
			visibility: 'teacher',
		},
	});
});

afterAll(async () => {
	await teardownTestDb();
});

async function login(username) {
	const res = await request(app)
		.post('/api/v1/auth/login')
		.send({ username, password: PASSWORD, force: true });
	expect(res.status, `login ${username}`).toBe(200);
	return res.body.accessToken;
}

const settingValue = async (key, schoolId = SCHOOL_A) => {
	const row = await prisma.setting.findFirst({ where: { key, school_id: schoolId } });
	return row?.value;
};

describe('bulk settings writes are an administrator surface', () => {
	it('refuses to let a teacher overwrite the system recovery hash', async () => {
		const token = await login('teacher-a');
		const before = await settingValue('system.recovery_code_hash');

		await request(app)
			.post('/api/v1/bulk/settings')
			.set('Authorization', `Bearer ${token}`)
			.send({
				items: [{ key: 'system.recovery_code_hash', value: 'attacker-chosen-hash' }],
			});

		expect(await settingValue('system.recovery_code_hash')).toBe(before);
	});

	it('refuses to let a teacher overwrite an admin-visibility setting', async () => {
		const token = await login('teacher-a');
		const before = await settingValue('auth.registration_code');

		await request(app)
			.post('/api/v1/bulk/settings')
			.set('Authorization', `Bearer ${token}`)
			.send({ items: [{ key: 'auth.registration_code', value: 'attacker' }] });

		expect(await settingValue('auth.registration_code')).toBe(before);
	});

	it('refuses to let a teacher promote a setting to the admin tier', async () => {
		const token = await login('teacher-a');

		await request(app)
			.post('/api/v1/bulk/settings')
			.set('Authorization', `Bearer ${token}`)
			.send({
				items: [
					{ key: 'exam.default_duration', value: '5', visibility: 'admin' },
				],
			});

		const row = await prisma.setting.findFirst({
			where: { key: 'exam.default_duration', school_id: SCHOOL_A },
		});
		expect(row?.visibility).toBe('teacher');
	});

	it('still lets a teacher write a teacher-tier setting', async () => {
		const token = await login('teacher-a');

		await request(app)
			.post('/api/v1/bulk/settings')
			.set('Authorization', `Bearer ${token}`)
			.send({ items: [{ key: 'exam.default_duration', value: '45' }] });

		expect(await settingValue('exam.default_duration')).toBe('45');
	});

	it('lets an administrator write the system tier', async () => {
		const token = await login('admin-a');

		await request(app)
			.post('/api/v1/bulk/settings')
			.set('Authorization', `Bearer ${token}`)
			.send({
				items: [{ key: 'system.recovery_code_hash', value: 'admin-chosen' }],
			});

		expect(await settingValue('system.recovery_code_hash')).toBe('admin-chosen');
	});
});

describe('the generic query dispatcher clamps what a caller may ask for', () => {
	it('refuses a student the admin settings tier', async () => {
		const token = await login('student-a');
		const res = await request(app)
			.post('/api/v1/query/settings.byVisibility')
			.set('Authorization', `Bearer ${token}`)
			.send({ visibility: 'admin' });

		expect(res.status).toBe(200);
		const keys = (res.body || []).map((row) => row.key);
		expect(keys).not.toContain('auth.registration_code');
		expect(keys).not.toContain('system.recovery_code_hash');
		// The clamp must still RETURN the public tier, not an empty set —
		// an empty result would hide a broken clamp behind a passing test.
		expect(keys).toContain('app.name');
	});

	it('never returns the system tier to anyone', async () => {
		for (const username of ['student-a', 'teacher-a', 'admin-a']) {
			const token = await login(username);
			const res = await request(app)
				.post('/api/v1/query/settings.byVisibility')
				.set('Authorization', `Bearer ${token}`)
				.send({ visibility: 'system' });

			expect(res.status).toBe(200);
			const keys = (res.body || []).map((row) => row.key);
			expect(keys, username).not.toContain('system.recovery_code_hash');
			// 'system' is clamped to 'admin' for an administrator and to the
			// caller's own ceiling below that.
			expect(keys.length, username).toBeGreaterThan(0);
		}
	});

	it('gives a teacher the teacher tier', async () => {
		const token = await login('teacher-a');
		const res = await request(app)
			.post('/api/v1/query/settings.byVisibility')
			.set('Authorization', `Bearer ${token}`)
			.send({ visibility: 'teacher' });

		expect(res.status).toBe(200);
		const keys = (res.body || []).map((row) => row.key);
		expect(keys).toContain('exam.default_duration');
		expect(keys).not.toContain('auth.registration_code');
	});

	it('gives an administrator the admin tier but never the system tier', async () => {
		const token = await login('admin-a');
		const res = await request(app)
			.post('/api/v1/query/settings.byVisibility')
			.set('Authorization', `Bearer ${token}`)
			.send({ visibility: 'admin' });

		expect(res.status).toBe(200);
		const keys = (res.body || []).map((row) => row.key);
		expect(keys).toContain('auth.registration_code');
		expect(keys).toContain('exam.default_duration');
		expect(keys).not.toContain('system.recovery_code_hash');
	});

	it('refuses to resolve another organization\'s student', async () => {
		const token = await login('admin-a');
		const res = await request(app)
			.post('/api/v1/query/exam.availableForStudent')
			.set('Authorization', `Bearer ${token}`)
			.send({ userId: 'student-b' });

		expect(res.status).toBe(403);
	});

	it('refuses a query name the repository does not implement', async () => {
		const token = await login('admin-a');
		const res = await request(app)
			.post('/api/v1/query/analytics.summary')
			.set('Authorization', `Bearer ${token}`)
			.send({});

		// A name that is not implemented must be a clean refusal, never a 500.
		expect(res.status).toBe(403);
	});
});

describe('the monitoring view is an administrator surface', () => {
	it('refuses a teacher', async () => {
		const token = await login('teacher-a');
		const res = await request(app)
			.get('/api/v1/admin/metrics')
			.set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(403);
	});

	it('refuses a student', async () => {
		const token = await login('student-a');
		const res = await request(app)
			.get('/api/v1/admin/metrics')
			.set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(403);
	});

	it('lets an administrator read it, scoped to their organization', async () => {
		const token = await login('admin-a');
		const res = await request(app)
			.get('/api/v1/admin/metrics')
			.set('Authorization', `Bearer ${token}`);
		expect(res.status).toBe(200);
		expect(res.body?.data?.filter?.schoolId).toBe(SCHOOL_A);
	});
});
