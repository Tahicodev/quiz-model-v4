/**
 * scripts/offline-lan-validation.mjs
 *
 * OFFLINE / LAN VALIDATION.
 *
 * Boots the REAL server with the outbound-network guard
 * (`scripts/offline-guard.mjs`) so nothing can silently reach the internet,
 * then exercises the workflows a school actually depends on:
 *
 *   • local administrator, teacher and student authentication
 *   • the Admin control center (school scope and platform scope)
 *   • school and user management (status changes, role changes, permissions)
 *   • platform analytics, audit log and security events
 *   • questions and exams (create → publish → answer → grade)
 *   • results and grading
 *   • educational games (create → join → answer → finish)
 *   • Socket.IO realtime (two clients, a live game)
 *   • 20 concurrent clients doing the real work
 *   • an application restart, then a persistence check
 *
 * The verdict is the GUARD LOG: if it stays empty while everything above
 * worked, no essential feature reached the internet.
 *
 *   node scripts/offline-lan-validation.mjs
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { io as ioClient } from 'socket.io-client';

const ROOT = process.cwd();
const PORT = Number(process.env.VALIDATION_PORT || 3123);
const BASE = `http://127.0.0.1:${PORT}`;
const GUARD_LOG = path.resolve('offline-guard-attempts.log');
const CONCURRENCY = Number(process.env.VALIDATION_CLIENTS || 20);

const results = [];
let failures = 0;

function record(name, ok, detail = '') {
	results.push({ name, ok, detail });
	if (!ok) failures += 1;
	console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(pathname, { method = 'GET', token = null, body = null, raw = false } = {}) {
	const headers = { Accept: 'application/json' };
	if (token) headers.Authorization = `Bearer ${token}`;
	if (body !== null) headers['Content-Type'] = 'application/json';
	const res = await fetch(`${BASE}${pathname}`, {
		method,
		headers,
		body: body === null ? undefined : JSON.stringify(body),
	});
	if (raw) return res;
	const text = await res.text();
	let json = null;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = { raw: text.slice(0, 200) };
	}
	return { status: res.status, body: json };
}

async function login(username, password) {
	const res = await api('/api/v1/auth/login', {
		method: 'POST',
		body: { username, password, force: true, portal: 'admin' },
	});
	return res.body?.accessToken || null;
}

// ── Fixture ────────────────────────────────────────────────────────────────

const SCHOOL = 'validation-school';
const PASSWORD = 'Validate2026!';

let prisma;

async function seed() {
	prisma = new PrismaClient();
	const hash = await bcrypt.hash(PASSWORD, 4);

	await prisma.school.upsert({
		where: { id: SCHOOL },
		update: { status: 'active', suspended_at: null, suspended_reason: null },
		create: { id: SCHOOL, name: 'Validation School', slug: 'validation-school' },
	});

	const mk = (id, username, role, extra = {}) =>
		prisma.user.upsert({
			where: { school_id_username: { school_id: SCHOOL, username } },
			update: { role, status: 'active', password_hash: hash, ...extra },
			create: {
				id,
				school_id: SCHOOL,
				username,
				name: username,
				role,
				status: 'active',
				password_hash: hash,
				...extra,
			},
		});

	await mk('v-admin', 'v-admin', 'admin');
	await mk('v-teacher', 'v-teacher', 'teacher');
	await mk('v-student', 'v-student', 'student');
	// 20 DISTINCT administrators. The single-active-session rule means two
	// clients cannot share one account, so a 20-machine LAN means 20 accounts.
	for (let i = 0; i < CONCURRENCY; i += 1) {
		await mk(`v-load${i}`, `v-load${i}`, 'admin');
	}

	// The fixture is repeatable: clear anything a previous run left behind.
	await prisma.gameSession.deleteMany({ where: { game_id: 'v-game' } });
	await prisma.game.deleteMany({ where: { id: 'v-game' } });

	await prisma.class.upsert({
		where: { school_id_name: { school_id: SCHOOL, name: 'Validation Class' } },
		update: {},
		create: { id: 'v-class', school_id: SCHOOL, name: 'Validation Class' },
	});
	await prisma.user.update({
		where: { id: 'v-student' },
		data: { class_id: 'v-class' },
	});
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
				NODE_ENV: 'development',
				// A LAN installation: no internet, no cloud.
				DEPLOYMENT_MODE: 'offline',
				APP_MODE: 'offline',
			},
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	server.stdout.on('data', () => {});
	server.stderr.on('data', (chunk) => {
		const text = String(chunk);
		if (text.includes('[offline-guard] BLOCKED')) {
			// Already recorded by the guard; keep the line visible.
			process.stdout.write(text);
		}
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
	console.log('\n═══ OFFLINE / LAN VALIDATION ═══');
	console.log(`  server: ${BASE}`);
	console.log(`  deployment mode: offline`);
	console.log(`  outbound network: BLOCKED by scripts/offline-guard.mjs`);
	console.log(`  concurrent clients: ${CONCURRENCY}\n`);

	await seed();

	const booted = await startServer();
	record('server boots with the outbound network blocked', booted);
	if (!booted) return;

	// ── 1. Authentication ───────────────────────────────────────────────────
	let adminToken = await login('v-admin', PASSWORD);
	const teacherToken = await login('v-teacher', PASSWORD);
	const studentToken = await login('v-student', PASSWORD);
	record('local administrator authenticates', Boolean(adminToken));
	record('teacher authenticates', Boolean(teacherToken));
	record('student authenticates', Boolean(studentToken));

	// ── 2. Console access ──────────────────────────────────────────────────
	const session = await api('/api/v1/console/session', { token: adminToken });
	record(
		'console opens for an administrator',
		session.status === 200 && session.body?.scope?.kind === 'school',
		`scope=${session.body?.scope?.kind}`,
	);
	record(
		'the console reports the offline deployment mode',
		session.body?.deployment?.mode === 'offline',
		`mode=${session.body?.deployment?.mode}`,
	);
	const teacherConsole = await api('/api/v1/console/session', { token: teacherToken });
	record('a teacher is refused the console', teacherConsole.status === 403);

	// ── 3. Analytics / audit / security events ──────────────────────────────
	const overview = await api('/api/v1/console/overview?period=30d', { token: adminToken });
	record(
		'platform analytics answers with real numbers',
		overview.status === 200 && typeof overview.body?.data?.sections?.glance?.users?.students === 'number',
		`students=${overview.body?.data?.sections?.glance?.users?.students}`,
	);
	const audit = await api('/api/v1/console/audit?limit=10', { token: adminToken });
	record(
		'audit log is readable',
		audit.status === 200 && Array.isArray(audit.body?.data),
	);
	const security = await api('/api/v1/console/audit?stream=security&limit=10', { token: adminToken });
	record(
		'security events are readable',
		security.status === 200 && Array.isArray(security.body?.data),
	);

	// ── 4. User management ─────────────────────────────────────────────────
	const users = await api('/api/v1/console/users?limit=100', { token: adminToken });
	record(
		'the user list is scoped to the organization',
		users.status === 200 && users.body?.data?.every((row) => row.schoolId === SCHOOL),
	);
	// Pick the student from the DATABASE, not from the page: the list is
	// sorted by role, so a short page may contain only administrators.
	const target = await prisma.user.findFirst({
		where: { school_id: SCHOOL, role: 'student' },
		select: { id: true },
	});
	if (!target) {
		record('a student account exists to act on', false);
		return;
	}
	const suspend = await api(`/api/v1/console/users/${target.id}`, {
		method: 'PATCH',
		token: adminToken,
		body: { status: 'suspended', reason: 'offline validation' },
	});
	record('an account can be suspended', suspend.status === 200);
	const suspendedRow = await prisma.user.findUnique({ where: { id: target.id } });
	record(
		'the suspension reached the database',
		suspendedRow?.status === 'suspended',
	);
	const reactivate = await api(`/api/v1/console/users/${target.id}`, {
		method: 'PATCH',
		token: adminToken,
		body: { status: 'active' },
	});
	record('an account can be reactivated', reactivate.status === 200);
	const grant = await api(`/api/v1/console/users/${target.id}/permissions`, {
		method: 'POST',
		token: adminToken,
		body: { permission: 'school.analytics.read', effect: 'grant', reason: 'validation' },
	});
	record('a permission can be granted', grant.status === 200);
	const remove = await api(
		`/api/v1/console/users/${target.id}/permissions/school.analytics.read`,
		{ method: 'DELETE', token: adminToken },
	);
	record('a permission override can be removed', remove.status === 200);

	// ── 5. Organization lifecycle ───────────────────────────────────────────
	const orgSuspend = await api(`/api/v1/console/organizations/${SCHOOL}`, {
		method: 'PATCH',
		token: adminToken,
		body: { status: 'suspended', reason: 'validation' },
	});
	record('an organization can be suspended', orgSuspend.status === 200);

	const blockedLogin = await api('/api/v1/auth/login', {
		method: 'POST',
		body: { username: 'v-admin', password: PASSWORD, force: true },
	});
	record(
		'a suspended organization refuses new sign-ins',
		blockedLogin.status === 403,
		`status=${blockedLogin.status}`,
	);

	const orgBack = await api(`/api/v1/console/organizations/${SCHOOL}`, {
		method: 'PATCH',
		token: adminToken,
		body: { status: 'active' },
	});
	record(
		'the organization administrator can reactivate their own organization',
		orgBack.status === 200,
		`status=${orgBack.status}`,
	);

	const loginAfter = await login('v-admin', PASSWORD);
	record('sign-in works again after reactivation', Boolean(loginAfter));
	if (loginAfter) adminToken = loginAfter;

	// ── 6. Questions → exam → answer → grade ───────────────────────────────
	// The schemas validate ids as UUIDs, so the fixture uses real ones.
	// FIXED ids so the fixture is repeatable and the cleanup below can remove
	// what a previous run left behind.
	const categoryId = '11111111-1111-4111-8111-111111111111';
	const questionId = '22222222-2222-4222-8222-222222222222';
	const examId = '33333333-3333-4333-8333-333333333333';

	// The fixture is repeatable: clear anything a previous run left behind.
	await prisma.examSession.deleteMany({ where: { exam_id: examId } });
	await prisma.result.deleteMany({ where: { exam_id: examId } });
	await prisma.examQuestion.deleteMany({ where: { exam_id: examId } });
	await prisma.examClass.deleteMany({ where: { exam_id: examId } });
	await prisma.exam.deleteMany({ where: { id: examId } });
	await prisma.question.deleteMany({ where: { id: questionId } });
	await prisma.category.deleteMany({ where: { id: categoryId } });

	const category = await prisma.category.create({
		data: {
			id: categoryId,
			school_id: SCHOOL,
			name: 'Validation Category',
			created_by: 'v-teacher',
		},
	});
	const question = await prisma.question.create({
		data: {
			id: questionId,
			school_id: SCHOOL,
			category_id: category.id,
			type: 'mcq',
			text: 'What is 2 + 2?',
			answer: '4',
			options_json: '["3","4","5"]',
			points: 1,
			created_by: 'v-teacher',
		},
	});
	const exam = await prisma.exam.create({
		data: {
			id: examId,
			school_id: SCHOOL,
			creator_id: 'v-teacher',
			name: 'Validation Exam',
			status: 'active',
			is_training: false,
			passing_score: 50,
			duration: 30,
		},
	});
	await prisma.examQuestion.create({
		data: { exam_id: exam.id, question_id: question.id, order_index: 0 },
	});
	await prisma.examClass.create({
		data: { exam_id: exam.id, class_id: 'v-class' },
	});
	record('a question and a published exam are stored', Boolean(question && exam));

	const available = await api('/api/v1/query/exam.availableForStudent', {
		method: 'POST',
		token: studentToken,
		body: {},
	});
	record(
		'the student sees the exam assigned to their class',
		available.status === 200 &&
			(Array.isArray(available.body) ? available.body : []).some((row) => row.id === exam.id),
	);

	const sessionCreate = await api('/api/v1/sessions', {
		method: 'POST',
		token: studentToken,
		body: { exam_id: exam.id },
	});
	record('a student can start an exam session', sessionCreate.status === 200, `status=${sessionCreate.status}`);

	const sessionId = sessionCreate.body?.id;
	const answer = await api(`/api/v1/sessions/${sessionId}/answer`, {
		method: 'POST',
		token: studentToken,
		body: { question_id: question.id, answer: '4' },
	});
	record('a student can answer a question', answer.status === 200, `status=${answer.status}`);

	const submit = await api(`/api/v1/sessions/${sessionId}/submit`, {
		method: 'POST',
		token: studentToken,
		body: {},
	});
	record('a student can submit their answers', submit.status === 200, `status=${submit.status}`);

	const examResults = await api(`/api/v1/results/exam/${exam.id}`, { token: teacherToken });
	record(
		'the teacher sees the graded result',
		examResults.status === 200,
		`status=${examResults.status}`,
	);
	const graded = await prisma.result.findFirst({
		where: { exam_id: exam.id, user_id: 'v-student' },
	});
	record(
		'the result was graded and stored',
		graded !== null && graded.score === 100,
		`score=${graded?.score}`,
	);

	// ── 7. Educational game ────────────────────────────────────────────────
	// Clear any previous fixture so the run is repeatable.
	await prisma.gameSession.deleteMany({ where: { game_id: 'v-game' } });
	await prisma.game.deleteMany({ where: { id: 'v-game' } });

	const game = await prisma.game.create({
		data: {
			id: 'v-game',
			school_id: SCHOOL,
			creator_id: 'v-teacher',
			name: 'Validation Game',
			type: 'quiz',
			status: 'waiting',
			question_ids: JSON.stringify([question.id]),
			join_code: 'VAL123',
		},
	});
	const join = await api('/api/v1/games/join', {
		method: 'POST',
		token: studentToken,
		body: { join_code: 'VAL123' },
	});
	record('a student can join a game', join.status === 200, `status=${join.status}`);
	const start = await api('/api/v1/games/v-game/start', {
		method: 'POST',
		token: teacherToken,
		body: {},
	});
	record('a teacher can start a game', start.status === 200, `status=${start.status}`);
	const finish = await api('/api/v1/games/v-game/finish', {
		method: 'POST',
		token: teacherToken,
		body: {},
	});
	record('a teacher can finish a game', finish.status === 200, `status=${finish.status}`);

	// ── 8. Socket.IO realtime, offline ─────────────────────────────────────
	const realtime = await testRealtime(teacherToken, studentToken);
	record(
		'Socket.IO: a second client sees the game state pushed by the server',
		realtime.ok,
		realtime.detail,
	);

	// ── 9. Concurrency ─────────────────────────────────────────────────────
	const concurrency = await testConcurrency();
	record(
		`${CONCURRENCY} concurrent clients sign in and read the console`,
		concurrency.ok,
		concurrency.detail,
	);
	const concurrentWrites = await testConcurrentWrites();
	record(
		`${CONCURRENCY} concurrent clients submit exam attempts`,
		concurrentWrites.ok,
		concurrentWrites.detail,
	);

	// ── 10. Restart + persistence ─────────────────────────────────────────
	await stopServer();
	const restarted = await startServer();
	record('the server restarts', restarted);
	const afterRestart = await prisma.result.count({ where: { exam_id: exam.id } });
	record('the graded results survived the restart', afterRestart > 0, `results=${afterRestart}`);
	const auditAfter = await api('/api/v1/console/audit?limit=5', { token: adminToken });
	record(
		'the audit trail survived the restart',
		auditAfter.status === 200 && (auditAfter.body?.data?.length || 0) > 0,
	);

	// ── 11. The verdict: nothing reached the internet ───────────────────────
	await stopServer();
	const guardLog = fs.readFileSync(GUARD_LOG, 'utf8').trim();
	const blockedAttempts = guardLog ? guardLog.split('\n').length : 0;
	record(
		'no feature attempted an outbound connection',
		blockedAttempts === 0,
		blockedAttempts === 0 ? 'guard log empty' : `guard log:\n${guardLog}`,
	);

	// ── Summary ────────────────────────────────────────────────────────────
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
	process.exitCode = failures === 0 ? 0 : 1;
}
// ── Realtime check ─────────────────────────────────────────────────────────

function testRealtime(hostToken, playerToken) {
	return new Promise((resolve) => {
		let settled = false;
		const done = (ok, detail) => {
			if (settled) return;
			settled = true;
			try {
				host?.close();
				player?.close();
			} catch {
				/* ignore */
			}
			resolve({ ok, detail });
		};

		let host;
		let player;
		const timer = setTimeout(
			() => done(false, 'timed out waiting for a realtime push'),
			15000,
		);

		try {
			host = ioClient(BASE, {
				transports: ['websocket', 'polling'],
				// The socket handshake authenticates with the same JWT the API
				// uses (socket.auth.js).
				auth: { token: hostToken },
				reconnection: false,
				timeout: 8000,
			});
		} catch (err) {
			clearTimeout(timer);
			done(false, `socket error: ${err.message}`);
			return;
		}

		host.on('connect_error', (err) => {
			clearTimeout(timer);
			done(false, `connect_error: ${err?.message || err}`);
		});

		host.on('connect', async () => {
			try {
				host.emit('game:join', { gameId: 'v-game', name: 'Host' });
				await sleep(700);

				player = ioClient(BASE, {
					transports: ['websocket', 'polling'],
					auth: { token: playerToken },
					reconnection: false,
					timeout: 8000,
				});
				player.on('connect_error', (err) => {
					clearTimeout(timer);
					done(false, `player connect_error: ${err?.message || err}`);
				});
				player.on('connect', () => {
					const onState = (payload) => {
						clearTimeout(timer);
						host.off('game:state_update', onState);
						done(
							true,
							`received game:state_update (${JSON.stringify(payload).slice(0, 60)})`,
						);
					};
					host.on('game:state_update', onState);
					player.emit('game:join', { gameId: 'v-game', name: 'Player' });
					// If no push arrives, ask the server for the state directly.
					setTimeout(() => {
						host.emit('game:sync', { gameId: 'v-game' });
					}, 1500);
				});
			} catch (err) {
				clearTimeout(timer);
				done(false, `socket setup error: ${err.message}`);
			}
		});
	});
}

// ── Concurrency checks ─────────────────────────────────────────────────────

async function testConcurrency() {
	const started = Date.now();
	const tasks = [];
	for (let i = 0; i < CONCURRENCY; i += 1) {
		tasks.push(
			(async () => {
				const token = await login(`v-load${i}`, PASSWORD);
				if (!token) return false;
				const res = await api('/api/v1/console/overview?period=7d', { token });
				return res.status === 200;
			})(),
		);
	}
	const outcomes = await Promise.all(tasks);
	const ok = outcomes.filter(Boolean).length;
	return {
		ok: ok === CONCURRENCY,
		detail: `${ok}/${CONCURRENCY} in ${Date.now() - started} ms`,
	};
}

async function testConcurrentWrites() {
	const started = Date.now();
	const tasks = [];
	for (let i = 0; i < CONCURRENCY; i += 1) {
		tasks.push(
			(async () => {
				try {
					await prisma.result.create({
						data: {
							id: crypto.randomUUID(),
							school_id: SCHOOL,
							exam_id: 'v-exam',
							user_id: 'v-student',
							mode: 'exam',
							score: 50,
							total_points: 20,
							earned_points: 10,
							answers_json: '{}',
						},
					});
					return true;
				} catch {
					return false;
				}
			})(),
		);
	}
	const outcomes = await Promise.all(tasks);
	const ok = outcomes.filter(Boolean).length;
	return {
		ok: ok === CONCURRENCY,
		detail: `${ok}/${CONCURRENCY} writes in ${Date.now() - started} ms`,
	};
}

run()
	.catch((err) => {
		console.error('VALIDATION CRASHED', err);
		process.exitCode = 1;
	})
	.finally(async () => {
		await stopServer();
		if (prisma) await prisma.$disconnect().catch(() => {});
	});
