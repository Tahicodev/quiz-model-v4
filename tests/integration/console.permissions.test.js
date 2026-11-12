/**
 * tests/integration/console.permissions.test.js
 *
 * The console is the only surface that can reach across organizations. These
 * tests pin the boundaries that matter:
 *
 *   1. A teacher or a student cannot open the console at all.
 *   2. An organization administrator sees ONLY their own organization — for
 *      the user list, the organization list, the audit trail and the overview.
 *   3. A platform administrator sees every organization, and may NARROW a
 *      request to one of them.
 *   4. A suspended account is refused even with a valid token.
 *   5. The console never leaks another organization's rows.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;

const SCHOOL_A = 'school-test'; // seeded by setupTestDb
const SCHOOL_B = 'school-b';

beforeAll(async () => {
	({ prisma } = await setupTestDb());
	app = (await import('./helpers/app.js')).default;

	await prisma.school.create({
		data: { id: SCHOOL_B, name: 'Second School', slug: 'second-school', status: 'active' },
	});

	const hash = await bcrypt.hash('pass1234', 4);
	const mk = (id, schoolId, username, role, status = 'active') =>
		prisma.user.create({
			data: {
				id,
				school_id: schoolId,
				username,
				password_hash: hash,
				role,
				status,
				name: username,
			},
		});

	await mk('u-admin-a', SCHOOL_A, 'admin-a', 'admin');
	await mk('u-admin-b', SCHOOL_B, 'admin-b', 'admin');
	await mk('u-teacher-a', SCHOOL_A, 'teacher-a', 'teacher');
	await mk('u-student-a', SCHOOL_A, 'student-a', 'student');
	await mk('u-platform', SCHOOL_A, 'platform', 'super_admin');
	await mk('u-suspended', SCHOOL_A, 'suspended', 'admin', 'suspended');

	// A student and a class in each organization, so the user list has rows.
	await prisma.class.create({
		data: { id: 'class-b', school_id: SCHOOL_B, name: 'B Class' },
	});
	await prisma.user.update({
		where: { id: 'u-admin-b' },
		data: { class_id: 'class-b' },
	});
});

afterAll(async () => {
	await teardownTestDb();
});

async function login(username) {
	const res = await request(app)
		.post('/api/v1/auth/login')
		.send({ username, password: 'pass1234', force: true, portal: 'admin' });
	expect(res.status, `login ${username}`).toBe(200);
	return res.body.accessToken;
}

const as = (token) => ({ Authorization: `Bearer ${token}` });

describe('Console access control', () => {
	it('refuses a teacher', async () => {
		const token = await login('teacher-a');
		const res = await request(app).get('/api/v1/console/session').set(as(token));
		expect(res.status).toBe(403);
	});

	it('refuses a student', async () => {
		const token = await login('student-a');
		const res = await request(app).get('/api/v1/console/session').set(as(token));
		expect(res.status).toBe(403);
	});

	it('refuses an unauthenticated request', async () => {
		const res = await request(app).get('/api/v1/console/session');
		expect(res.status).toBe(401);
	});

	it('refuses a suspended account even with a valid token', async () => {
		// The account cannot sign in …
		const loginRes = await request(app)
			.post('/api/v1/auth/login')
			.send({ username: 'suspended', password: 'pass1234', force: true });
		expect(loginRes.status).toBe(403);

		// … and a token minted before the suspension stops working on the
		// console, because requireActiveAccount re-reads the account.
		const token = await login('admin-a');
		await prisma.user.update({ where: { id: 'u-admin-a' }, data: { status: 'suspended' } });
		const res = await request(app).get('/api/v1/console/session').set(as(token));
		expect(res.status).toBe(403);
		await prisma.user.update({ where: { id: 'u-admin-a' }, data: { status: 'active' } });
	});
});

describe('Tenant isolation', () => {
	it('an organization administrator sees only their own users', async () => {
		const token = await login('admin-a');
		const res = await request(app).get('/api/v1/console/users?limit=100').set(as(token));
		expect(res.status).toBe(200);
		const schoolIds = new Set(res.body.data.map((row) => row.schoolId));
		expect(schoolIds.size).toBe(1);
		expect([...schoolIds]).toContain(SCHOOL_A);
		expect([...schoolIds]).not.toContain(SCHOOL_B);
	});

	it('an organization administrator sees only their own organization', async () => {
		const token = await login('admin-a');
		const res = await request(app).get('/api/v1/console/organizations?limit=100').set(as(token));
		expect(res.status).toBe(200);
		expect(res.body.data).toHaveLength(1);
		expect(res.body.data[0].id).toBe(SCHOOL_A);
	});

	it('an organization administrator cannot narrow the request to another organization', async () => {
		const token = await login('admin-a');
		const res = await request(app)
			.get(`/api/v1/console/organizations?school_id=${SCHOOL_B}`)
			.set(as(token));
		expect(res.status).toBe(403);
	});

	it('an organization administrator cannot narrow the user list to another organization', async () => {
		const token = await login('admin-a');
		const res = await request(app)
			.get(`/api/v1/console/users?school_id=${SCHOOL_B}`)
			.set(as(token));
		expect(res.status).toBe(403);
	});

	it('an organization administrator only sees their own audit trail', async () => {
		const token = await login('admin-a');
		const res = await request(app).get('/api/v1/console/audit?limit=100').set(as(token));
		expect(res.status).toBe(200);
		for (const row of res.body.data) {
			expect(row.schoolId).toBe(SCHOOL_A);
		}
	});

	it('the overview is scoped to the caller organization', async () => {
		const token = await login('admin-a');
		const res = await request(app).get('/api/v1/console/overview').set(as(token));
		expect(res.status).toBe(200);
		expect(res.body.data.meta.scope.kind).toBe('school');
		expect(res.body.data.meta.scope.schoolIds).toEqual([SCHOOL_A]);
	});
});

describe('Platform scope', () => {
	it('a platform administrator sees every organization', async () => {
		const token = await login('platform');
		const res = await request(app).get('/api/v1/console/organizations?limit=100').set(as(token));
		expect(res.status).toBe(200);
		const ids = res.body.data.map((row) => row.id);
		expect(ids).toContain(SCHOOL_A);
		expect(ids).toContain(SCHOOL_B);
	});

	it('a platform administrator may narrow the request to one organization', async () => {
		const token = await login('platform');
		const res = await request(app)
			.get(`/api/v1/console/organizations?school_id=${SCHOOL_B}&limit=100`)
			.set(as(token));
		expect(res.status).toBe(200);
		expect(res.body.data).toHaveLength(1);
		expect(res.body.data[0].id).toBe(SCHOOL_B);
	});

	it('a platform administrator narrowing to an unknown organization gets 404', async () => {
		const token = await login('platform');
		const res = await request(app)
			.get('/api/v1/console/organizations?school_id=does-not-exist')
			.set(as(token));
		expect(res.status).toBe(404);
	});

	it('the session reports the platform scope and the platform permissions', async () => {
		const token = await login('platform');
		const res = await request(app).get('/api/v1/console/session').set(as(token));
		expect(res.status).toBe(200);
		expect(res.body.scope.kind).toBe('platform');
		expect(res.body.scope.isPlatform).toBe(true);
		expect(res.body.permissions).toContain('platform.users.read');
		expect(res.body.permissions).toContain('school.users.manage');
	});

	it('an organization administrator holds no platform permission', async () => {
		const token = await login('admin-b');
		const res = await request(app).get('/api/v1/console/session').set(as(token));
		expect(res.status).toBe(200);
		expect(res.body.scope.kind).toBe('school');
		expect(res.body.permissions).toContain('school.users.manage');
		expect(res.body.permissions).not.toContain('platform.users.read');
	});
});
