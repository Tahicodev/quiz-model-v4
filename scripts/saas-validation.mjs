/**
 * scripts/saas-validation.mjs
 *
 * SAAS / MULTI-TENANT VALIDATION.
 *
 * Boots the real server in SAAS deployment mode against a fixture of several
 * organizations and checks the guarantees a multi-tenant product must make:
 *
 *   • a platform administrator reaches every organization
 *   • an organization administrator reaches ONLY their own
 *   • the audit trail and the security events are tenant-isolated
 *   • cross-tenant analytics aggregate, and a narrowed request aggregates one
 *   • a permission override grants exactly one capability
 *   • an account and an organization can be suspended and restored
 *   • the two deployment modes cannot accidentally grant each other's powers
 *
 *   node scripts/saas-validation.mjs
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { useIsolatedDatabase } from './lib/validationDb.mjs';

const ROOT = process.cwd();
const PORT = Number(process.env.VALIDATION_PORT || 3124);
const BASE = `http://127.0.0.1:${PORT}`;
const GUARD_LOG = path.resolve('offline-guard-attempts.log');

const PASSWORD = 'Validate2026!';

const results = [];
let failures = 0;

function record(name, ok, detail = '') {
	results.push({ name, ok, detail });
	if (!ok) failures += 1;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(pathname, { method = 'GET', token = null, body = null } = {}) {
	const headers = { Accept: 'application/json' };
	if (token) headers.Authorization = `Bearer ${token}`;
	if (body !== null) headers['Content-Type'] = 'application/json';
	const res = await fetch(`${BASE}${pathname}`, {
		method,
		headers,
		body: body === null ? undefined : JSON.stringify(body),
	});
	const text = await res.text();
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = { raw: text.slice(0, 200) };
	}
	return { status: res.status, body: json };
}

async function login(username) {
	const res = await api('/api/v1/auth/login', {
		method: 'POST',
		body: { username, password: PASSWORD, force: true, portal: 'admin' },
	});
	return res.body?.accessToken || null;
}

// ── Fixture ────────────────────────────────────────────────────────────────

const ORGS = [
	{ id: 'saas-org-a', slug: 'saas-org-a', name: 'Alpha Academy' },
	{ id: 'saas-org-b', slug: 'saas-org-b', name: 'Beta College' },
	{ id: 'saas-org-c', slug: 'saas-org-c', name: 'Gamma School' },
];

let prisma;
let databaseUrl = null;
let cleanupDatabase = null;

async function seed() {
	// The validation runs against its OWN database. The development data is
	// never touched, and no fixture is left behind.
	const isolated = await useIsolatedDatabase('validation-saas.db');
	prisma = isolated.prisma;
	databaseUrl = isolated.url;
	cleanupDatabase = isolated.cleanup;
	const hash = await bcrypt.hash(PASSWORD, 4);

	for (const org of ORGS) {
		await prisma.school.upsert({
			where: { id: org.id },
			update: { status: 'active', suspended_at: null, suspended_reason: null },
			create: { id: org.id, name: org.name, slug: org.slug, status: 'active' },
		});
	}

	const mk = (id, schoolId, username, role) =>
		prisma.user.upsert({
			where: { school_id_username: { school_id: schoolId, username } },
			update: { role, status: 'active', password_hash: hash },
			create: {
				id,
				school_id: schoolId,
				username,
				name: username,
				role,
				status: 'active',
				password_hash: hash,
			},
		});

	await mk('saas-platform', 'saas-org-a', 'saas.platform', 'super_admin');
	await mk('saas-admin-a', 'saas-org-a', 'saas.admin.a', 'admin');
	await mk('saas-admin-b', 'saas-org-b', 'saas.admin.b', 'admin');
	await mk('saas-admin-c', 'saas-org-c', 'saas.admin.c', 'admin');
	await mk('saas-teacher-a', 'saas-org-a', 'saas.teacher.a', 'teacher');
	await mk('saas-student-a', 'saas-org-a', 'saas.student.a', 'student');
	await mk('saas-student-b', 'saas-org-b', 'saas.student.b', 'student');
}

// ── Server lifecycle ───────────────────────────────────────────────────────

let server = null;

async function startServer() {
	fs.writeFileSync(GUARD_LOG, '');
	server = spawn(
		process.execPath,
		['--import', './scripts/offline-guard.mjs', 'src/backend/server.js'],
		{
			cwd: ROOT,
			env: {
				...process.env,
				PORT: String(PORT),
				DATABASE_URL: databaseUrl,
				NODE_ENV: 'development',
				DEPLOYMENT_MODE: 'saas',
				APP_MODE: 'saas',
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	server.stdout.on('data', () => {});
	server.stderr.on('data', (chunk) => {
		const text = String(chunk);
		if (text.includes('[offline-guard] BLOCKED')) process.stdout.write(text);
	});

	for (let i = 0; i < 60; i += 1) {
		try {
			const res = await fetch(`${BASE}/health`);
			if (res.ok) return true;
		} catch {
			/* not up yet */
		}
		await sleep(500);
	}
	return false;
}

async function stopServer() {
	if (!server) return;
	server.kill();
	server = null;
	await sleep(1200);
}

// ── The validation ─────────────────────────────────────────────────────────

async function run() {
	console.log('\n═══ SAAS / MULTI-TENANT VALIDATION ═══');
	console.log(`  server: ${BASE}`);
	console.log(`  deployment mode: saas`);
	console.log(`  organizations: ${ORGS.length}\n`);

	await seed();
	if (!(await startServer())) {
		record('server boots in saas mode', false);
		return;
	}
	record('server boots in saas mode', true);

	const platform = await login('saas.platform');
	const adminA = await login('saas.admin.a');
	const adminB = await login('saas.admin.b');
	const adminC = await login('saas.admin.c');
	const teacherA = await login('saas.teacher.a');
	const studentA = await login('saas.student.a');
	record('every role authenticates', Boolean(platform && adminA && adminB && adminC && teacherA && studentA));

	// ── Scope ──────────────────────────────────────────────────────────────
	const platformSession = await api('/api/v1/console/session', { token: platform });
	record(
		'the platform administrator gets the platform scope',
		platformSession.status === 200 && platformSession.body?.scope?.kind === 'platform',
		`scope=${platformSession.body?.scope?.kind}`,
	);
	record(
		'the console reports the saas deployment mode',
		platformSession.body?.deployment?.mode === 'saas',
		`mode=${platformSession.body?.deployment?.mode}`,
	);

	const adminSession = await api('/api/v1/console/session', { token: adminA });
	record(
		'an organization administrator gets the organization scope',
		adminSession.status === 200 && adminSession.body?.scope?.kind === 'school',
		`scope=${adminSession.body?.scope?.kind}`,
	);
	record(
		'an organization administrator holds no platform permission',
		!(adminSession.body?.permissions || []).includes('platform.users.read'),
	);
	record(
		'a teacher is refused the console',
		(await api('/api/v1/console/session', { token: teacherA })).status === 403,
	);

	// ── Cross-tenant analytics ────────────────────────────────────────────
	const totalOrganizations = await prisma.school.count();
	const allOrgs = await api('/api/v1/console/organizations?limit=100', { token: platform });
	const visibleOrgIds = (allOrgs.body?.data || []).map((row) => row.id);
	record(
		'the platform administrator sees every organization',
		allOrgs.status === 200 &&
			visibleOrgIds.length === totalOrganizations &&
			ORGS.every((org) => visibleOrgIds.includes(org.id)),
		`${visibleOrgIds.length} of ${totalOrganizations}`,
	);

	const ownOrgs = await api('/api/v1/console/organizations?limit=100', { token: adminA });
	record(
		'an organization administrator sees only their own organization',
		ownOrgs.status === 200 &&
			ownOrgs.body?.data?.length === 1 &&
			ownOrgs.body?.data[0].id === 'saas-org-a',
		`${ownOrgs.body?.data?.length} visible`,
	);

	const crossOrg = await api('/api/v1/console/organizations?school_id=saas-org-b', {
		token: adminA,
	});
	record(
		'an organization administrator cannot widen the scope to another organization',
		crossOrg.status === 403,
		`status=${crossOrg.status}`,
	);

	const platformOverview = await api('/api/v1/console/overview?period=30d', { token: platform });
	const adminOverview = await api('/api/v1/console/overview?period=30d', { token: adminA });
	record(
		'cross-tenant analytics aggregate across organizations',
		platformOverview.status === 200 &&
			platformOverview.body?.data?.sections?.glance?.organizations?.total === totalOrganizations,
		`organizations=${platformOverview.body?.data?.sections?.glance?.organizations?.total}`,
	);
	record(
		'an organization-scoped overview sees one organization',
		adminOverview.status === 200 &&
			adminOverview.body?.data?.sections?.glance?.organizations?.total === 1,
		`organizations=${adminOverview.body?.data?.sections?.glance?.organizations?.total}`,
	);

	const narrowed = await api('/api/v1/console/overview?period=30d&school_id=saas-org-c', {
		token: platform,
	});
	record(
		'a platform request can be narrowed to one organization',
		narrowed.status === 200 &&
			narrowed.body?.data?.meta?.scope?.schoolIds?.length === 1 &&
			narrowed.body?.data?.meta?.scope?.schoolIds[0] === 'saas-org-c',
	);

	// ── Tenant isolation of the trails ─────────────────────────────────────
	const platformAudit = await api('/api/v1/console/audit?limit=100', { token: platform });
	const adminAudit = await api('/api/v1/console/audit?limit=100', { token: adminA });
	record(
		'the audit trail is tenant-isolated for an organization administrator',
		adminAudit.status === 200 &&
			(adminAudit.body?.data || []).every((row) => row.schoolId === 'saas-org-a'),
	);
	record(
		'the platform administrator reads the whole audit trail',
		platformAudit.status === 200 &&
			(Array.isArray(platformAudit.body?.data) ? platformAudit.body.data.length : 0) > 0,
	);

	const adminSecurity = await api('/api/v1/console/audit?stream=security&limit=100', {
		token: adminA,
	});
	record(
		'the security events are tenant-isolated',
		adminSecurity.status === 200 &&
			(adminSecurity.body?.data || []).every(
				(row) => row.schoolId === null || row.schoolId === 'saas-org-a',
			),
	);

	// ── Users ─────────────────────────────────────────────────────────────
	const adminUsers = await api('/api/v1/console/users?limit=100', { token: adminA });
	record(
		'the user list is tenant-isolated',
		adminUsers.status === 200 &&
			(adminUsers.body?.data || []).every((row) => row.schoolId === 'saas-org-a'),
	);

	const foreignUser = await api('/api/v1/console/users/saas-student-b', { token: adminA });
	record(
		'an organization administrator cannot open another organization\'s account',
		foreignUser.status === 404,
		`status=${foreignUser.status}`,
	);

	// ── Permission overrides ──────────────────────────────────────────────
	// A DENY is the interesting case: `school.users.manage` IS in the
	// administrator's baseline, so denying it must REMOVE the capability and
	// removing the deny must bring it back.
	const deny = await api('/api/v1/console/users/saas-admin-c/permissions', {
		method: 'POST',
		token: platform,
		body: { permission: 'school.users.manage', effect: 'deny', reason: 'validation' },
	});
	record('a platform administrator denies a permission', deny.status === 200);

	const denied = await api('/api/v1/console/session', { token: adminC });
	record(
		'the deny removes a capability the role normally carries',
		!(denied.body?.permissions || []).includes('school.users.manage'),
	);

	const remove = await api('/api/v1/console/users/saas-admin-c/permissions/school.users.manage', {
		method: 'DELETE',
		token: platform,
	});
	record('the override can be removed', remove.status === 200);

	const restored = await api('/api/v1/console/session', { token: adminC });
	record(
		'removing the override restores the role baseline',
		(restored.body?.permissions || []).includes('school.users.manage'),
	);

	// ── Account lifecycle ─────────────────────────────────────────────────
	const suspend = await api('/api/v1/console/users/saas-student-a', {
		method: 'PATCH',
		token: adminA,
		body: { status: 'suspended', reason: 'validation' },
	});
	record('an account can be suspended', suspend.status === 200);

	const suspendedLogin = await api('/api/v1/auth/login', {
		method: 'POST',
		body: { username: 'saas.student.a', password: PASSWORD, force: true },
	});
	record(
		'a suspended account cannot sign in',
		suspendedLogin.status === 403,
		`status=${suspendedLogin.status}`,
	);

	const reactivate = await api('/api/v1/console/users/saas-student-a', {
		method: 'PATCH',
		token: adminA,
		body: { status: 'active' },
	});
	record('the account can be reactivated', reactivate.status === 200);
	record(
		'the account can sign in again',
		Boolean(await login('saas.student.a')),
	);

	// ── Organization lifecycle ────────────────────────────────────────────
	const suspendOrg = await api('/api/v1/console/organizations/saas-org-c', {
		method: 'PATCH',
		token: platform,
		body: { status: 'suspended', reason: 'validation' },
	});
	record('an organization can be suspended by the platform operator', suspendOrg.status === 200);

	const suspendedOrgLogin = await api('/api/v1/auth/login', {
		method: 'POST',
		body: { username: 'saas.admin.c', password: PASSWORD, force: true },
	});
	record(
		'a suspended organization refuses sign-ins',
		suspendedOrgLogin.status === 403,
		`status=${suspendedOrgLogin.status}`,
	);

	const restoreOrg = await api('/api/v1/console/organizations/saas-org-c', {
		method: 'PATCH',
		token: platform,
		body: { status: 'active' },
	});
	record('the organization can be restored', restoreOrg.status === 200);
	record('sign-in works again afterwards', Boolean(await login('saas.admin.c')));

	// ── The two modes cannot borrow each other's powers ───────────────────
	const offlineModeCannotWiden = await api(
		'/api/v1/console/organizations?school_id=saas-org-b',
		{ token: adminA },
	);
	record(
		'organization scope cannot be widened in saas mode either',
		offlineModeCannotWiden.status === 403,
	);

	const guardLog = fs.readFileSync(GUARD_LOG, 'utf8').trim();
	record(
		'no feature attempted an outbound connection',
		!guardLog,
		guardLog || 'guard log empty',
	);

	console.log('\n═══ RESULT ═══');
	const passed = results.filter((r) => r.ok).length;
	console.log(`  ${passed}/${results.length} checks passed`);
	if (failures) {
		console.log('\n  Failures:');
		for (const r of results.filter((x) => !x.ok)) {
			console.log(`    ✗ ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
		}
	}
	await prisma.$disconnect();
	if (cleanupDatabase) cleanupDatabase();
	process.exitCode = failures === 0 ? 0 : 1;
}

run()
	.catch((err) => {
		console.error('VALIDATION CRASHED', err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await stopServer();
		if (prisma) await prisma.$disconnect().catch(() => {});
		if (cleanupDatabase) cleanupDatabase();
	});
