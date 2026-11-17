/**
 * tests/integration/password-reset.test.js
 *
 * Regression cover for the reported symptom: "I reset the password and
 * reconnect, it gives me incorrect username or password".
 *
 * Root cause: the edit-user form sends `password` in a `PATCH /users/:id`
 * body. `UserUpdateSchema` has no `password` key, so zod STRIPPED it and the
 * service never touched `password_hash`. The UI reported "User saved
 * successfully", the database kept the old credential, and the next sign-in
 * failed with "Invalid username or password".
 *
 * These tests pin the behaviour that must hold:
 *   1. Resetting a credential through the REST endpoint changes it.
 *   2. The new password works; the old one does not.
 *   3. The profile changes that came with the password are still applied.
 *   4. The reset is audited and recorded as a security event.
 *   5. The target's live sessions are revoked.
 *   6. A reset cannot cross the tenant boundary.
 *   7. A bulk sync never overwrites a stored credential with a client hash.
 *   8. A plaintext password is hashed before it is stored.
 *   9. An account still on a legacy hash can change its own password.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';

import { setupTestDb, teardownTestDb } from './helpers/testDb.js';

let app;
let prisma;

const PASSWORD = 'teacher123';
const NEW_PASSWORD = 'BrandNewPass2026!';

beforeAll(async () => {
	const db = await setupTestDb();
	prisma = db.prisma;
	app = (await import('./helpers/app.js')).default;

	const hash = await bcrypt.hash(PASSWORD, 4);
	await prisma.school.create({
		data: { id: 'pw-school', name: 'Password School', slug: 'password-school' },
	});
	await prisma.school.create({
		data: { id: 'pw-other', name: 'Other School', slug: 'other-school' },
	});

	const mk = (id, schoolId, username, role) =>
		prisma.user.create({
			data: {
				id,
				school_id: schoolId,
				username,
				name: username,
				role,
				status: 'active',
				password_hash: hash,
			},
		});

	await mk('pw-admin', 'pw-school', 'pw-admin', 'admin');
	await mk('pw-teacher', 'pw-school', 'pw-teacher', 'teacher');
	await mk('pw-foreign', 'pw-other', 'pw-foreign', 'teacher');
	await mk('pw-legacy', 'pw-school', 'pw-legacy', 'teacher');
});

afterAll(async () => {
	await teardownTestDb();
});

async function login(username, password = PASSWORD) {
	const res = await request(app)
		.post('/api/v1/auth/login')
		.send({ username, password, force: true });
	return res;
}

describe('an administrator resets a credential', () => {
	it('changes the credential and the new password works', async () => {
		const adminToken = (await login('pw-admin')).body.accessToken;

		const reset = await request(app)
			.post('/api/v1/users/pw-teacher/reset-password')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({ newPassword: NEW_PASSWORD });
		expect(reset.status).toBe(200);

		// The stored hash is bcrypt and matches the new password.
		const row = await prisma.user.findUnique({ where: { id: 'pw-teacher' } });
		expect(row.password_hash.startsWith('$2')).toBe(true);
		expect(await bcrypt.compare(NEW_PASSWORD, row.password_hash)).toBe(true);

		// The new password signs in …
		const good = await login('pw-teacher', NEW_PASSWORD);
		expect(good.status).toBe(200);
		expect(good.body.accessToken).toBeTruthy();

		// … and the old one does not.
		const bad = await login('pw-teacher', PASSWORD);
		expect(bad.status).toBe(401);
		expect(bad.body?.error?.message).toMatch(/invalid username or password/i);
	});

	it('records the reset in the audit trail and the security trail', async () => {
		const adminToken = (await login('pw-admin')).body.accessToken;
		await request(app)
			.post('/api/v1/users/pw-teacher/reset-password')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({ newPassword: 'AnotherPass2026!' });

		const audit = await prisma.auditLog.findFirst({
			where: { entity_type: 'user', entity_id: 'pw-teacher', action: 'reset-password' },
		});
		expect(audit).toBeTruthy();
		expect(audit.severity).toBe('critical');
		expect(audit.outcome).toBe('success');

		const event = await prisma.securityEvent.findFirst({
			where: { user_id: 'pw-teacher', event_type: 'password_reset' },
		});
		expect(event).toBeTruthy();
	});

	it('revokes the target\'s live sessions', async () => {
		const adminToken = (await login('pw-admin')).body.accessToken;
		await request(app)
			.post('/api/v1/users/pw-teacher/reset-password')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({ newPassword: 'ThirdPass2026!' });

		const live = await prisma.refreshToken.count({
			where: { user_id: 'pw-teacher', revoked: false },
		});
		expect(live).toBe(0);
	});

	it('refuses a reset across the tenant boundary', async () => {
		const adminToken = (await login('pw-admin')).body.accessToken;
		const res = await request(app)
			.post('/api/v1/users/pw-foreign/reset-password')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({ newPassword: 'CrossTenant2026!' });
		expect(res.status).toBe(404);
	});

	it('refuses to reset the administrator\'s own credential', async () => {
		const adminToken = (await login('pw-admin')).body.accessToken;
		const res = await request(app)
			.post('/api/v1/users/pw-admin/reset-password')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({ newPassword: 'SelfReset2026!' });
		expect(res.status).toBe(409);
	});

	it('rejects a short password', async () => {
		const adminToken = (await login('pw-admin')).body.accessToken;
		const res = await request(app)
			.post('/api/v1/users/pw-teacher/reset-password')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({ newPassword: 'abc' });
		expect(res.status).toBe(422);
	});
});

describe('the edit-user form', () => {
	it('applies the profile changes AND the password', async () => {
		const adminToken = (await login('pw-admin')).body.accessToken;

		// This is what the legacy edit-user form sends.
		const res = await request(app)
			.patch('/api/v1/users/pw-foreign')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({ name: 'Renamed Teacher', password: 'EditFormPass2026!' });
		// A different organization is out of scope, so this one is rejected
		// before the credential matters.
		expect(res.status).toBe(404);

		// Same organization: the profile change applies …
		const own = await request(app)
			.patch('/api/v1/users/pw-teacher')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({ name: 'Renamed Teacher', password: 'EditFormPass2026!' });
		expect(own.status).toBe(200);

		const row = await prisma.user.findUnique({ where: { id: 'pw-teacher' } });
		expect(row.name).toBe('Renamed Teacher');

		// … and the credential actually changed.
		expect(await bcrypt.compare('EditFormPass2026!', row.password_hash)).toBe(true);
		expect((await login('pw-teacher', 'EditFormPass2026!')).status).toBe(200);
	});
});

describe('the bulk sync', () => {
	it('never overwrites a stored credential with a client hash', async () => {
		const adminToken = (await login('pw-admin')).body.accessToken;
		const before = await prisma.user.findUnique({ where: { id: 'pw-teacher' } });

		// What the legacy client pushes: a client-side SHA-256 digest.
		const clientHash = 'a'.repeat(64);
		await request(app)
			.post('/api/v1/bulk/users')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({
				items: [
					{
						id: before.id,
						school_id: before.school_id,
						username: before.username,
						name: before.name,
						role: before.role,
						password_hash: clientHash,
					},
				],
			});

		const after = await prisma.user.findUnique({ where: { id: 'pw-teacher' } });
		expect(after.password_hash).toBe(before.password_hash);
	});

	it('hashes a plaintext password before storing it', async () => {
		const adminToken = (await login('pw-admin')).body.accessToken;
		const created = await request(app)
			.post('/api/v1/bulk/users')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({
				items: [
					{
						id: '44444444-4444-4444-8444-444444444444',
						username: 'bulk-created',
						name: 'Bulk Created',
						role: 'student',
						password: 'BulkPlaintext2026!',
					},
				],
			});
		expect(created.status).toBeLessThan(300);

		const row = await prisma.user.findFirst({
			where: { username: 'bulk-created' },
		});
		expect(row).toBeTruthy();
		// Never the plaintext.
		expect(row.password_hash).not.toBe('BulkPlaintext2026!');
		expect(row.password_hash.startsWith('$2')).toBe(true);
		// And the account can actually sign in.
		expect((await login('bulk-created', 'BulkPlaintext2026!')).status).toBe(200);
	});
});

describe('an account still on a legacy hash', () => {
	it('can change its own password', async () => {
		// A `simple-` hash — the oldest generation the login path accepts.
		// The digest is the client-side simpleHash of 'teacher123'.
		const simple = 'simple--1193423088';
		await prisma.user.update({
			where: { id: 'pw-legacy' },
			data: { password_hash: simple },
		});

		// It can still sign in …
		expect((await login('pw-legacy')).status).toBe(200);

		// … and it can change its own password, which used to be impossible
		// because the comparison was bcrypt-only.
		const res = await request(app)
			.post('/api/v1/auth/change-password')
			.set('Authorization', `Bearer ${(await login('pw-legacy')).body.accessToken}`)
			.send({ oldPassword: 'teacher123', newPassword: 'MigratedPass2026!' });
		expect(res.status).toBe(200);

		const row = await prisma.user.findUnique({ where: { id: 'pw-legacy' } });
		expect(row.password_hash.startsWith('$2')).toBe(true);
		expect((await login('pw-legacy', 'MigratedPass2026!')).status).toBe(200);
	});
});
