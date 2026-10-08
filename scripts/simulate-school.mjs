/**
 * scripts/simulate-school.mjs
 *
 * End-to-end usage simulation of the quiz app against a throwaway tenant.
 *
 * It stands up a "virtual school" and drives it the way real people would,
 * over HTTP + Socket.IO:
 *
 *   1.  School  (tenant created by the seed, profile configured by the admin)
 *   2.  Classes (3 classes)
 *   3.  Teachers (2 teachers, class assignments)
 *   4.  Categories + questions (parent/child categories, all 5 question types)
 *   5.  Students (12 students created by their own teachers)
 *   6.  Game    (lobby join -> start -> answer -> scores -> finish, REST+socket)
 *   7.  Tournament (create -> open -> register -> answer -> leaderboard -> finish)
 *   8.  Verification (bootstrap payload, results, role scoping)
 *   9.  Abuse/edge probes (ownership, escalation, leaks, rate limits, tenants)
 *
 * Everything runs against a dedicated SQLite database (prisma/simulation.db)
 * and a server spawned on its own port, so `prisma/dev.db` is never touched.
 * Findings are written to "issues to fix.md" in the repo root.
 *
 * Usage:
 *   node scripts/simulate-school.mjs
 *   node scripts/simulate-school.mjs --keep        # reuse the previous sim DB
 *   node scripts/simulate-school.mjs --port 4321
 *   node scripts/simulate-school.mjs --external    # drive an already-running
 *                                                  # server (QUIZ_BASE_URL)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io as ioClient } from 'socket.io-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagVal = (f, d) => {
	const i = argv.indexOf(f);
	return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

const EXTERNAL = hasFlag('--external');
const KEEP_DB = hasFlag('--keep');
const PORT = Number(flagVal('--port', 4310));
const BASE = EXTERNAL
	? (process.env.QUIZ_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
	: `http://127.0.0.1:${PORT}`;

const SCHOOL_ID = 'sim-school';
const SIM_DB_URL = 'file:./simulation.db';
const DB_FILE = path.join(ROOT, 'prisma', 'simulation.db');
const REPORT_PATH = path.join(ROOT, 'issues to fix.md');
const SERVER_LOG = path.join(os.tmpdir(), 'quiz-sim-server.log');

// ─────────────────────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) =>
	String(s)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60);

function log(tag, msg) {
	console.log(`[${tag}] ${msg}`);
}

function brief(value, max = 600) {
	let text;
	try {
		text = typeof value === 'string' ? value : JSON.stringify(value);
	} catch {
		text = String(value);
	}
	if (text == null) return '';
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Findings collected while running
// ─────────────────────────────────────────────────────────────────────────────

const issues = [];
const checks = [];

function addIssue({ id, severity, title, area, detail, evidence = [], fix = '', refs = [] }) {
	const existing = issues.find((i) => i.id === id);
	if (existing) {
		for (const e of evidence) if (!existing.evidence.includes(e)) existing.evidence.push(e);
		return;
	}
	issues.push({ id, severity, title, area, detail, evidence, fix, refs });
	log('ISSUE', `(${severity}) ${title}`);
}

function pass(name) {
	checks.push({ name, pass: true });
	log('ok', name);
}

function failCheck(name, note = '') {
	checks.push({ name, pass: false, note });
	log('FAIL', `${name}${note ? ` — ${note}` : ''}`);
}

/** Assert an expectation. On mismatch, record an issue. */
function expectTrue(condition, { name, issue }) {
	if (condition) {
		pass(name);
		return true;
	}
	failCheck(name, issue?.title || 'expectation failed');
	if (issue) addIssue(issue);
	return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP client (self-throttled so we stay under the server's 300 req/min limiter)
// ─────────────────────────────────────────────────────────────────────────────

const RATE_MAX = 260; // per 60s window (server allows 300/min on /api/)
const rateStamps = [];
const httpLog = [];

async function throttle() {
	for (;;) {
		const now = Date.now();
		while (rateStamps.length && now - rateStamps[0] >= 60_000) rateStamps.shift();
		if (rateStamps.length < RATE_MAX) {
			rateStamps.push(now);
			return;
		}
		await sleep(60_000 - (now - rateStamps[0]) + 25);
	}
}

async function rawRequest(method, urlPath, { token, body } = {}) {
	await throttle();
	const headers = {};
	if (token) headers.authorization = `Bearer ${token}`;
	if (body !== undefined) headers['content-type'] = 'application/json';
	const res = await fetch(`${BASE}${urlPath}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await res.text();
	let data = null;
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = text;
		}
	}
	httpLog.push({ method, path: urlPath, status: res.status, body: brief(data, 300) });
	return { status: res.status, data };
}

/** Request that must satisfy `expect`; throws otherwise. */
async function api(method, urlPath, { token, body, expect = [200, 201] } = {}) {
	const res = await rawRequest(method, urlPath, { token, body });
	if (!expect.includes(res.status)) {
		const err = new Error(
			`${method} ${urlPath} → ${res.status} ${brief(res.data, 240)}`,
		);
		err.status = res.status;
		err.data = res.data;
		throw err;
	}
	return res.data;
}

async function login(username, password, portal = 'admin') {
	const res = await rawRequest('POST', '/api/v1/auth/login', {
		body: { username, password, portal },
	});
	if (res.status !== 200) {
		const err = new Error(`login ${username} → ${res.status} ${brief(res.data, 200)}`);
		err.status = res.status;
		err.data = res.data;
		throw err;
	}
	return { token: res.data.accessToken, user: res.data.user };
}

// ─────────────────────────────────────────────────────────────────────────────
// Socket helpers
// ─────────────────────────────────────────────────────────────────────────────

const sockets = [];

function connectSocket(token) {
	const socket = ioClient(BASE, {
		auth: { token },
		transports: ['websocket'],
		reconnection: false,
		forceNew: true,
		timeout: 8000,
	});
	sockets.push(socket);
	return socket;
}

function waitFor(socket, event, timeoutMs = 8000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			socket.off(event, handler);
			reject(new Error(`timeout waiting for "${event}"`));
		}, timeoutMs);
		function handler(payload) {
			clearTimeout(timer);
			resolve(payload);
		}
		socket.once(event, handler);
	});
}

function emitAck(socket, event, payload, timeoutMs = 8000) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`no ack for "${event}"`)),
			timeoutMs,
		);
		socket.emit(event, payload, (response) => {
			clearTimeout(timer);
			resolve(response);
		});
	});
}

async function connected(socket) {
	if (socket.connected) return;
	await waitFor(socket, 'connect', 8000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario state
// ─────────────────────────────────────────────────────────────────────────────

const S = {
	admin: null,
	teachers: {},
	classes: {},
	students: {},
	categories: {},
	questions: [],
	game: null,
	tournament: null,
};

const TEACHERS = [
	{
		key: 'benali',
		username: 'm.benali',
		password: 'Teach1234',
		name: 'M. Youssef Benali',
		title: 'Mr',
		subjects: ['Mathematiques'],
		classes: ['6eme A'],
	},
	{
		key: 'alaoui',
		username: 'mme.alaoui',
		password: 'Teach1234',
		name: 'Mme Salma Alaoui',
		title: 'Mme',
		subjects: ['Sciences', 'Physique'],
		classes: ['6eme B', '6eme C'],
	},
];

const CLASS_DEFS = [
	{ key: '6eme A', name: '6eme A', description: 'Sixieme A — mathematics track' },
	{ key: '6eme B', name: '6eme B', description: 'Sixieme B — general' },
	{ key: '6eme C', name: '6eme C', description: 'Sixieme C — small group' },
];

const STUDENT_DEFS = [
	{ username: 's.amina', name: 'Amina Zahra', classKey: '6eme A', numero: '6001' },
	{ username: 's.yassine', name: 'Yassine Idrissi', classKey: '6eme A', numero: '6002' },
	{ username: 's.khadija', name: 'Khadija Naji', classKey: '6eme A', numero: '6003' },
	{ username: 's.omar', name: 'Omar Tazi', classKey: '6eme A', numero: '6004' },
	{ username: 's.lina', name: 'Lina Berrada', classKey: '6eme A', numero: '6005' },
	{ username: 's.hamza', name: 'Hamza Fassi', classKey: '6eme B', numero: '6101' },
	{ username: 's.safaa', name: 'Safaa Rouahi', classKey: '6eme B', numero: '6102' },
	{ username: 's.mehdi', name: 'Mehdi Chraibi', classKey: '6eme B', numero: '6103' },
	{ username: 's.nour', name: 'Nour Belhaj', classKey: '6eme B', numero: '6104' },
	{ username: 's.ayoub', name: 'Ayoub Sbai', classKey: '6eme B', numero: '6105' },
	{ username: 's.ikram', name: 'Ikram Lahlou', classKey: '6eme C', numero: '6201' },
	{ username: 's.zakaria', name: 'Zakaria Amrani', classKey: '6eme C', numero: '6202' },
];

const PASSWORD = 'Student123';

// Question catalogue. `answer` is the exact string the server grades against.
const MATH_QUESTIONS = [
	{
		key: 'capital',
		type: 'mcq',
		text: 'Quelle est la capitale du Maroc ?',
		options_json: JSON.stringify(['Casablanca', 'Rabat', 'Marrakech']),
		answer: 'Rabat',
		points: 2,
		difficulty: 'easy',
	},
	{
		key: 'fraction',
		type: 'mcq',
		text: '1/2 + 1/2 = ?',
		options_json: JSON.stringify(['1/2', '1', '2']),
		answer: '1',
		points: 3,
		difficulty: 'medium',
	},
	{
		key: 'earth',
		type: 'true-false',
		text: 'La Terre tourne autour du Soleil.',
		options_json: JSON.stringify(['Vrai', 'Faux']),
		answer: 'Vrai',
		points: 1,
		difficulty: 'easy',
	},
	{
		key: 'double7',
		type: 'fill-blank',
		text: 'Le double de 7 est ___.',
		answer: '14',
		points: 2,
		difficulty: 'easy',
	},
	{
		key: 'pairs',
		type: 'matching',
		text: 'Reliez 1 a un, 2 a deux.',
		options_json: JSON.stringify(['1', '2', 'un', 'deux']),
		answer: '1-un;2-deux',
		points: 4,
		difficulty: 'hard',
	},
	{
		key: 'order',
		type: 'order',
		text: 'Classe du plus petit au plus grand : 3, 1, 2',
		options_json: JSON.stringify(['1', '2', '3']),
		answer: '1,2,3',
		points: 3,
		difficulty: 'medium',
	},
];

const SCIENCE_QUESTIONS = [
	{
		key: 'co2',
		type: 'mcq',
		text: 'Quel gaz les plantes absorbent-elles ?',
		options_json: JSON.stringify(['Oxygene', 'Dioxyde de carbone', 'Azote']),
		answer: 'Dioxyde de carbone',
		points: 2,
		difficulty: 'easy',
	},
	{
		key: 'boil',
		type: 'true-false',
		text: "L'eau bout a 100 °C au niveau de la mer.",
		options_json: JSON.stringify(['Vrai', 'Faux']),
		answer: 'Vrai',
		points: 1,
		difficulty: 'easy',
	},
	{
		key: 'water',
		type: 'fill-blank',
		text: 'Le formule chimique de l\'eau est ___.',
		answer: 'H2O',
		points: 2,
		difficulty: 'medium',
	},
	{
		key: 'mercury',
		type: 'mcq',
		text: 'Quelle planete est la plus proche du Soleil ?',
		options_json: JSON.stringify(['Venus', 'Mercure', 'Terre']),
		answer: 'Mercure',
		points: 2,
		difficulty: 'easy',
	},
];

const qByKey = (key) => S.questions.find((q) => q.key === key);
const studentUsernames = (classKey) =>
	STUDENT_DEFS.filter((s) => s.classKey === classKey).map((s) => s.username);

// ─────────────────────────────────────────────────────────────────────────────
// Phase runner
// ─────────────────────────────────────────────────────────────────────────────

/** Run a phase, numbering it automatically. On throw, record an abort issue. */
let phaseIndex = 0;
async function phase(label, fn) {
	phaseIndex += 1;
	console.log('');
	log('====', `${phaseIndex} · ${label}`);
	try {
		return await fn();
	} catch (err) {
		failCheck(`${label} aborted`, err.message);
		addIssue({
			id: `phase-${slug(label)}`,
			severity: 'high',
			title: `Phase aborted: ${label}`,
			area: label,
			detail:
				'The happy path broke here, so the rest of this flow could not be exercised.',
			evidence: [String(err.message || err), ...serverErrors()],
		});
		return null;
	}
}

/** Last error-looking lines from the spawned server, for abort evidence. */
function serverErrors(limit = 8) {
	const text = serverLogLines.join('');
	const lines = text
		.split(/\r?\n/)
		.filter((l) => /Unhandled Exception|\berror\b|Error:|P\d{4}|Invalid|failed/i.test(l))
		.map((l) => l.replace(/\u001b\[[0-9;]*m/g, '').trim().slice(0, 400))
		.filter(Boolean);
	return lines.slice(-limit);
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment: database + server
// ─────────────────────────────────────────────────────────────────────────────

function runSync(command, { env = {}, allowFail = false } = {}) {
	const result = spawnSync(command, {
		cwd: ROOT,
		shell: true,
		encoding: 'utf8',
		env: { ...process.env, ...env },
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.status !== 0 && !allowFail) {
		throw new Error(
			`command failed (${result.status}): ${command}\n${result.stderr || result.stdout}`,
		);
	}
	return result;
}

function readJwtSecret() {
	try {
		const envFile = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
		const match = /^JWT_SECRET\s*=\s*(.+)$/m.exec(envFile);
		if (match && match[1].trim().length >= 64) return match[1].trim();
	} catch {
		/* no .env — fall through */
	}
	return randomBytes(32).toString('hex');
}

async function prepareDatabase() {
	if (!KEEP_DB) {
		for (const suffix of ['', '-journal', '-shm', '-wal']) {
			fs.rmSync(`${DB_FILE}${suffix}`, { force: true });
		}
	}
	log('db', 'running prisma migrate deploy against prisma/simulation.db');
	let migrate = null;
	try {
		migrate = runSync('npx prisma migrate deploy', { env: { DATABASE_URL: SIM_DB_URL } });
	} catch (err) {
		// Migration history does not reproduce a fresh database — record it and
		// fall back to `db push` so the rest of the scenario can still run.
		const output = `${err.message}`;
		addIssue({
			id: 'migration-history-broken',
			severity: 'high',
			title: 'A fresh database cannot be created with `prisma migrate deploy` (P3018)',
			area: 'Migrations / deployment',
			detail:
				'The migration history never creates the Kids* tables, so a brand-new environment ' +
				'(CI, a teammate, a prod provisioning step, or this simulation) fails at ' +
				'20261004_kids_attribution with "no such table: KidsGame" and refuses to go further ' +
				'(P3018: a failed migration blocks every later one). The dev database only works because ' +
				'the tables were added out-of-band with `prisma db push` — exactly the drift that ' +
				'20260923_repair_schema_drift was written to clean up, and the same thing has happened again. ' +
				'Missing CREATE TABLE for: KidsGame, KidsGameSession, KidsChampionship, KidsChampionshipScore.',
			evidence: [
				'npx prisma migrate deploy → P3018, migration 20261004_kids_attribution, "no table: KidsGame"',
				'grep migrations for CREATE TABLE: KidsGame, KidsGameSession, KidsChampionship, KidsChampionshipScore → none',
				'prisma/migrations/20260923_repair_schema_drift/migration.sql documents the previous occurrence of this pattern',
			],
			fix:
				'Write a migration that creates the four missing tables (prisma migrate diff --from-empty --to-schema-datamodel), ' +
				'rebase the Kids* migrations in dependency order, and add a CI job that runs `prisma migrate deploy` on an empty SQLite file.',
			refs: [
				'prisma/migrations/20261004_kids_attribution/migration.sql',
				'prisma/migrations/20261005_kids_sessions_unified/migration.sql',
				'prisma/schema.prisma',
			],
		});
		migrate = runSync('npx prisma db push --skip-generate --accept-data-loss', {
			env: { DATABASE_URL: SIM_DB_URL },
			allowFail: true,
		});
		log('db', 'fell back to `prisma db push` (schema.prisma → simulation.db)');
	}
	log('db', 'seeding the simulation tenant (school + admin + settings)');
	runSync('node prisma/seed.js', {
		env: { DATABASE_URL: SIM_DB_URL, DEFAULT_SCHOOL_ID: SCHOOL_ID },
	});
}

let serverChild = null;
const serverLogLines = [];

async function waitForHealth(timeoutMs = 60_000) {
	const deadline = Date.now() + timeoutMs;
	let lastError = '';
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${BASE}/health`);
			if (res.ok) return true;
			lastError = `status ${res.status}`;
		} catch (err) {
			lastError = err.message;
		}
		await sleep(300);
	}
	throw new Error(`server never became healthy: ${lastError}`);
}

async function startServer() {
	const jwtSecret = readJwtSecret();
	log('server', `starting backend on port ${PORT} (log: ${SERVER_LOG})`);
	serverChild = spawn(process.execPath, ['src/backend/server.js'], {
		cwd: ROOT,
		env: {
			...process.env,
			NODE_ENV: 'test', // disables the 10-login/15min route limiter only
			DATABASE_URL: SIM_DB_URL,
			DEFAULT_SCHOOL_ID: SCHOOL_ID,
			PORT: String(PORT),
			CORS_ORIGIN: `http://localhost:${PORT}`,
			LOG_LEVEL: 'warn',
			JWT_SECRET: jwtSecret,
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const sink = fs.createWriteStream(SERVER_LOG, { flags: 'a' });
	sink.write(`\n===== sim server start ${new Date().toISOString()} (port ${PORT}) =====\n`);
	serverChild.stdout.on('data', (b) => {
		serverLogLines.push(String(b));
		sink.write(b);
	});
	serverChild.stderr.on('data', (b) => {
		serverLogLines.push(String(b));
		sink.write(b);
	});
	serverChild.on('exit', (code) => {
		serverLogLines.push(`\n[server exited with code ${code}]\n`);
	});
	await waitForHealth();
	log('server', `healthy at ${BASE}`);
}

async function stopServer() {
	for (const socket of sockets) {
		try {
			socket.disconnect();
		} catch {
			/* ignore */
		}
	}
	if (serverChild && !serverChild.killed) {
		serverChild.kill('SIGTERM');
		await sleep(1500);
		if (!serverChild.killed) serverChild.kill('SIGKILL');
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — the school (tenant)
// ─────────────────────────────────────────────────────────────────────────────

async function phaseSchool() {
	S.admin = await login('admin', 'admin123');
	pass('admin can log in (admin/admin123)');

	const profile = await api('PUT', '/api/v1/school/profile', {
		token: S.admin.token,
		body: {
			name: 'Virtual School Ibn Sina',
			school_type: 'college',
			school_year: '2025-2026',
			address: '12 Atlas Street',
			city: 'Rabat',
			phone: '+212 5 37 00 00 00',
			email: 'contact@ibnsina.sim',
		},
	});
	expectTrue(profile.name === 'Virtual School Ibn Sina', {
		name: 'admin can configure the school profile',
	});

	const pub = await rawRequest('GET', '/api/v1/school/profile');
	expectTrue(pub.status === 200 && pub.data?.name === 'Virtual School Ibn Sina', {
		name: 'public school profile reflects the update',
	});

	// Probe: is there any way to create a tenant through the API?
	const create = await rawRequest('POST', '/api/v1/school', {
		token: S.admin.token,
		body: { name: 'Another School', slug: 'another-school', school_type: 'college' },
	});
	expectTrue(create.status !== 200 && create.status !== 201, {
		name: 'tenant creation is not exposed on the public API',
		issue: {
			id: 'no-school-create-api',
			severity: 'medium',
			title: 'There is no API to create a school (tenant)',
			area: 'Multi-tenancy',
			detail:
				'School rows can only be produced by prisma/seed.js or a direct DB insert. ' +
				'A SaaS onboarding flow (sign up a school, then invite its admin) has no endpoint to call, ' +
				'and there is no super_admin surface either.',
			evidence: [
				`POST /api/v1/school → ${create.status} ${brief(create.data, 160)}`,
				'grep for repo.create(\'schools\' in src/backend/routes returns nothing',
			],
			fix:
				'Add POST /api/v1/schools (super_admin or public signup) that creates the School row + its admin user, ' +
				'or document that provisioning is an operator/seed-only step.',
			refs: ['src/backend/routes/school.routes.js', 'prisma/seed.js'],
		},
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — classes
// ─────────────────────────────────────────────────────────────────────────────

async function phaseClasses() {
	for (const def of CLASS_DEFS) {
		const created = await api('POST', '/api/v1/classes', {
			token: S.admin.token,
			body: { name: def.name, description: def.description },
		});
		S.classes[def.key] = created.id;
	}
	expectTrue(Object.keys(S.classes).length === CLASS_DEFS.length, {
		name: 'admin created 3 classes',
	});

	// Probe: duplicate class name.
	const dup = await rawRequest('POST', '/api/v1/classes', {
		token: S.admin.token,
		body: { name: '6eme A', description: 'duplicate' },
	});
	expectTrue(dup.status === 409 || dup.status === 422, {
		name: 'duplicate class name is rejected cleanly (409/422)',
		issue: {
			id: 'duplicate-class-500',
			severity: 'medium',
			title: 'Creating a class with an existing name returns 500 instead of 409',
			area: 'Classes',
			detail:
				'ClassService.create() performs no uniqueness check, so the Prisma @@unique([school_id, name]) ' +
				'violation surfaces as an unhandled P2002 through the generic error handler (INTERNAL_ERROR / 500). ' +
				'The UI shows a generic failure instead of "a class with this name already exists".',
			evidence: [`POST /api/v1/classes {name:"6eme A"} → ${dup.status} ${brief(dup.data, 200)}`],
			fix:
				'Pre-check the name inside ClassService.create() (or map P2002 → ConflictError) so the API returns 409 with a field error.',
			refs: ['src/frontend/services/ClassService.js:27', 'src/backend/middleware/error.js'],
		},
	});

	// Probe: deleting a class that still has students is refused (later, after
	// students exist) — see phaseStudents().
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — teachers + class assignments
// ─────────────────────────────────────────────────────────────────────────────

async function phaseTeachers() {
	for (const def of TEACHERS) {
		const created = await api('POST', '/api/v1/users', {
			token: S.admin.token,
			body: {
				username: def.username,
				password: def.password,
				name: def.name,
				title: def.title,
				role: 'teacher',
				subjects: def.subjects,
			},
		});
		S.teachers[def.key] = { ...def, id: created.id, token: null };
	}
	expectTrue(Object.keys(S.teachers).length === 2, {
		name: 'admin created 2 teachers',
	});

	const assignments = {};
	for (const def of TEACHERS) {
		assignments[S.teachers[def.key].id] = def.classes.map((c) => S.classes[c]);
	}
	const setting = await api('PATCH', '/api/v1/settings/teacherClassAssignments', {
		token: S.admin.token,
		body: { key: 'teacherClassAssignments', value: JSON.stringify(assignments), visibility: 'admin' },
	});
	expectTrue(String(setting.value || '').includes(S.teachers.benali.id), {
		name: 'admin assigned classes to teachers via teacherClassAssignments',
	});

	// Probe: can a teacher rewrite the admin-visibility assignment map?
	S.teachers.benali.token = (await login(TEACHERS[0].username, TEACHERS[0].password)).token;
	S.teachers.alaoui.token = (await login(TEACHERS[1].username, TEACHERS[1].password)).token;
	pass('both teachers can log in');

	const escalation = await rawRequest('PATCH', '/api/v1/settings/teacherClassAssignments', {
		token: S.teachers.benali.token,
		body: { key: 'teacherClassAssignments', value: JSON.stringify(assignments), visibility: 'admin' },
	});
	expectTrue(escalation.status === 403, {
		name: 'teachers cannot rewrite admin settings',
		issue: {
			id: 'teacher-settings-escalation',
			severity: 'high',
			title: 'Teachers can overwrite admin-visibility settings (incl. their own class assignments)',
			area: 'Authorization',
			detail:
				'PATCH /api/v1/settings/:key only blocks three hard-coded keys (adminSecret, recoveryCode, teacherAccess) ' +
				'for teachers. Every other key — including teacherClassAssignments (visibility: admin), ' +
				'auth.allow_student_register, exam defaults — is writable by any teacher. A teacher can add any class ' +
				'to their own assignment list and therefore manage students they were never assigned.',
			evidence: [
				`PATCH /api/v1/settings/teacherClassAssignments (as teacher) → ${escalation.status} ${brief(escalation.data, 200)}`,
				'src/backend/routes/settings.routes.js:65 — allow-list is ["adminSecret","recoveryCode","teacherAccess"]',
			],
			fix:
				'Enforce the setting\'s visibility tier against the caller role (teacher may only write visibility ≤ teacher), ' +
				'or block every admin/system-visibility key for non-admins instead of a hard-coded list.',
			refs: [
				'src/backend/routes/settings.routes.js:58',
				'src/frontend/services/SettingsService.js:45',
			],
		},
	});
	if (escalation.status === 200) {
		// Restore the intended value so the rest of the scenario is sane.
		await api('PATCH', '/api/v1/settings/teacherClassAssignments', {
			token: S.admin.token,
			body: { key: 'teacherClassAssignments', value: JSON.stringify(assignments), visibility: 'admin' },
		});
	}

	// Probe: teacher must not read admin settings.
	const adminSettings = await rawRequest('GET', '/api/v1/settings/admin', {
		token: S.teachers.benali.token,
	});
	expectTrue(adminSettings.status === 403, {
		name: 'teachers cannot read admin settings',
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — categories + questions
// ─────────────────────────────────────────────────────────────────────────────

async function phaseContent() {
	// Teacher 1 — maths categories (parent + child).
	const mathCat = await api('POST', '/api/v1/categories', {
		token: S.teachers.benali.token,
		body: { name: 'Mathematiques', icon: 'calculator', color: '#2563eb' },
	});
	const fracCat = await api('POST', '/api/v1/categories', {
		token: S.teachers.benali.token,
		body: { name: 'Fractions', parent_id: mathCat.id, color: '#7c3aed' },
	});
	S.categories.math = mathCat;
	S.categories.fractions = fracCat;

	// Teacher 2 — science category.
	const sciCat = await api('POST', '/api/v1/categories', {
		token: S.teachers.alaoui.token,
		body: { name: 'Sciences', icon: 'flask', color: '#059669' },
	});
	S.categories.sciences = sciCat;

	expectTrue(Boolean(fracCat.parent_id === mathCat.id), {
		name: 'parent/child category tree works',
	});

	const badColor = await rawRequest('POST', '/api/v1/categories', {
		token: S.teachers.benali.token,
		body: { name: 'Bad color', color: 'blue' },
	});
	expectTrue(badColor.status === 422, {
		name: 'invalid category color is rejected (422)',
	});

	// Questions authored by each teacher, filed under their own categories.
	for (const def of MATH_QUESTIONS) {
		const created = await api('POST', '/api/v1/questions', {
			token: S.teachers.benali.token,
			body: {
				category_id: def.key === 'fraction' ? fracCat.id : mathCat.id,
				type: def.type,
				text: def.text,
				...(def.options_json ? { options_json: def.options_json } : {}),
				answer: def.answer,
				points: def.points,
				difficulty: def.difficulty,
				explanation: 'Correction fournie en cours.',
			},
		});
		S.questions.push({ ...def, id: created.id, owner: 'benali' });
	}
	for (const def of SCIENCE_QUESTIONS) {
		const created = await api('POST', '/api/v1/questions', {
			token: S.teachers.alaoui.token,
			body: {
				category_id: sciCat.id,
				type: def.type,
				text: def.text,
				...(def.options_json ? { options_json: def.options_json } : {}),
				answer: def.answer,
				points: def.points,
				difficulty: def.difficulty,
			},
		});
		S.questions.push({ ...def, id: created.id, owner: 'alaoui' });
	}
	expectTrue(
		S.questions.filter((q) => q.owner === 'benali').length === MATH_QUESTIONS.length &&
			S.questions.filter((q) => q.owner === 'alaoui').length === SCIENCE_QUESTIONS.length,
		{ name: 'teachers authored 6 + 4 questions (all 5 types covered)' },
	);

	// Ownership scoping ------------------------------------------------------
	const alaouiList = await api('GET', '/api/v1/questions?limit=200', {
		token: S.teachers.alaoui.token,
	});
	const alaouiRows = Array.isArray(alaouiList?.data) ? alaouiList.data : [];
	expectTrue(alaouiRows.length > 0, {
		name: 'the question list actually returns rows to its author',
	});
	const alaouiIds = new Set(alaouiRows.map((q) => q.id));
	const leaked = S.questions.filter((q) => q.owner === 'benali' && alaouiIds.has(q.id));
	expectTrue(leaked.length === 0, {
		name: "a teacher cannot list another teacher's questions",
	});

	const crossCategory = await rawRequest('POST', '/api/v1/questions', {
		token: S.teachers.alaoui.token,
		body: {
			category_id: mathCat.id,
			type: 'mcq',
			text: 'Filed under a foreign category?',
			options_json: JSON.stringify(['a', 'b']),
			answer: 'a',
		},
	});
	expectTrue(crossCategory.status === 403, {
		name: 'a teacher cannot file questions under a foreign category (403)',
	});

	const crossPatch = await rawRequest('PATCH', `/api/v1/questions/${qByKey('capital').id}`, {
		token: S.teachers.alaoui.token,
		body: { text: 'Hijacked by another teacher' },
	});
	expectTrue(crossPatch.status === 403, {
		name: "a teacher cannot edit another teacher's question (403)",
	});

	// Student probing the content API (see issue if 200).
	const studentToken = null; // students are logged in during phaseStudents()
	S._contentProbes = { mathCat, sciCat };
	return studentToken;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — students
// ─────────────────────────────────────────────────────────────────────────────

async function phaseStudents() {
	for (const def of STUDENT_DEFS) {
		const teacherKey = TEACHERS.find((t) => t.classes.includes(def.classKey)).key;
		const created = await api('POST', '/api/v1/users', {
			token: S.teachers[teacherKey].token,
			body: {
				username: def.username,
				password: PASSWORD,
				name: def.name,
				role: 'student',
				class_id: S.classes[def.classKey],
				numero: def.numero,
			},
		});
		S.students[def.username] = { ...def, id: created.id, token: null };
	}
	expectTrue(Object.keys(S.students).length === STUDENT_DEFS.length, {
		name: 'teachers created 12 students in their own classes',
	});

	// Teacher cannot place a student in a class that is not assigned to them.
	const foreignClass = await rawRequest('POST', '/api/v1/users', {
		token: S.teachers.benali.token,
		body: {
			username: 's.intruder',
			password: PASSWORD,
			name: 'Intruder',
			role: 'student',
			class_id: S.classes['6eme B'],
		},
	});
	expectTrue(foreignClass.status === 403, {
		name: 'teacher cannot enroll students in a class they do not own (403)',
	});

	// Duplicate username inside the tenant.
	const dupUser = await rawRequest('POST', '/api/v1/users', {
		token: S.admin.token,
		body: { username: 's.amina', password: PASSWORD, name: 'Clone', role: 'student' },
	});
	expectTrue(dupUser.status === 409, {
		name: 'duplicate username inside the school is rejected (409)',
	});

	// Class roster.
	const roster = await api('GET', `/api/v1/classes/${S.classes['6eme A']}/students`, {
		token: S.admin.token,
	});
	expectTrue((roster || []).length === 5, {
		name: 'class roster lists the 5 students of 6eme A',
	});

	// Deleting a class that still has students must be refused.
	const deleteClass = await rawRequest('DELETE', `/api/v1/classes/${S.classes['6eme A']}`, {
		token: S.admin.token,
	});
	expectTrue(deleteClass.status === 422 || deleteClass.status === 409, {
		name: 'a class with enrolled students cannot be deleted',
	});

	// Log the students that the rest of the scenario needs.
	for (const def of STUDENT_DEFS) {
		const { token } = await login(def.username, PASSWORD, 'student');
		S.students[def.username].token = token;
	}
	pass(`logged in ${STUDENT_DEFS.length} students`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — multiplayer game, end to end
// ─────────────────────────────────────────────────────────────────────────────

async function phaseGame() {
	const benali = S.teachers.benali;
	const questionIds = MATH_QUESTIONS.map((d) => qByKey(d.key).id);

	// Probe first: can a teacher ship another teacher's (invisible to them)
	// question inside their own game?
	const foreign = await rawRequest('POST', '/api/v1/games', {
		token: benali.token,
		body: {
			name: 'Probe: foreign question set',
			type: 'quiz',
			question_ids: [qByKey('co2').id],
			settings_json: JSON.stringify({ max_players: 10 }),
		},
	});
	expectTrue(foreign.status === 409 || foreign.status === 422 || foreign.status === 403, {
		name: "a teacher cannot bundle another teacher's questions into a game",
		issue: {
			id: 'game-foreign-question-ids',
			severity: 'medium',
			title: "Game.question_ids is only school-scoped — a teacher can use questions they cannot see",
			area: 'Content ownership',
			detail:
				'Questions are author-scoped for reads (GET /questions hides other teachers\' rows and ' +
				'POST /questions refuses foreign categories), but GameService.assertQuestionSet() only checks ' +
				'that the id exists in the same school. Any teacher who learns a question UUID can put it in ' +
				'their game and grade against its answer.',
			evidence: [
				`POST /api/v1/games with a question authored by another teacher → ${foreign.status} ${brief(foreign.data, 200)}`,
				'src/frontend/services/GameService.js:425 — #assertQuestionSet checks school_id only',
			],
			fix:
				'Apply the same ownership rule used elsewhere: a non-admin may only reference questions whose created_by is them (or NULL legacy rows visible to admins).',
			refs: ['src/frontend/services/GameService.js:425', 'src/backend/routes/questions.routes.js:26'],
		},
	});
	if (foreign.status === 201 && foreign.data?.id) {
		await api('DELETE', `/api/v1/games/${foreign.data.id}`, { token: benali.token, expect: [204] });
	}

	const game = await api('POST', '/api/v1/games', {
		token: benali.token,
		body: {
			name: 'Marathon des Maths - 6eme A',
			type: 'quiz',
			question_ids: questionIds,
			settings_json: JSON.stringify({
				max_players: 30,
				show_answers_immediately: true,
				time_per_question: 30,
			}),
		},
	});
	S.game = game;
	expectTrue(typeof game.join_code === 'string' && game.join_code.length === 6, {
		name: 'teacher created a game with a 6-character join code',
	});

	// Staff cannot join as players.
	const staffJoin = await rawRequest('POST', '/api/v1/games/join', {
		token: benali.token,
		body: { join_code: game.join_code },
	});
	expectTrue(staffJoin.status === 403, {
		name: 'staff accounts cannot join a game as players (403)',
	});

	// What can a student read about the game before joining?
	const student = S.students['s.amina'];
	const gameView = await rawRequest('GET', `/api/v1/games/${game.id}`, {
		token: student.token,
	});
	const leaksQuestionIds =
		gameView.status === 200 &&
		typeof gameView.data?.question_ids === 'string' &&
		gameView.data.question_ids.includes('[');
	expectTrue(!leaksQuestionIds, {
		name: 'the game payload does not leak the ordered question list to students',
		issue: {
			id: 'game-detail-leak-question-order',
			severity: 'low',
			title: 'GET /games/:id hands students the full ordered question_ids list',
			area: 'Data exposure',
			detail:
				'gameSvc.getById() returns the raw row (question_ids, settings_json, creator_id) to any ' +
				'authenticated tenant member. Students can read the exact question order of a live game — ' +
				'and with GET /questions (see answer-leak issue) the answers too — before answering.',
			evidence: [`GET /api/v1/games/${game.id} (as student) → ${gameView.status} ${brief(gameView.data, 300)}`],
			fix: 'Return a sanitized projection for students (id, name, type, status, questionCount) — the shape GameService.getClientState() already builds.',
			refs: ['src/frontend/services/GameService.js:65', 'src/backend/routes/games.routes.js:48'],
		},
	});

	// Students join: 4 over Socket.IO, 1 over REST (both supported paths).
	// The SaaS handler joins the room and emits game:stateUpdate; the legacy
	// engine also answers game:join (see joinAcks probe below), so we wait for
	// the SaaS signal rather than trusting the ack.
	const classA = studentUsernames('6eme A');
	const socketsByUsername = {};
	const joinAcks = {};
	const joinedState = {};
	for (const username of classA.slice(0, 4)) {
		const socket = connectSocket(S.students[username].token);
		await connected(socket);
		socketsByUsername[username] = socket;
		const statePromise = waitFor(socket, 'game:state_update', 8000).catch(() => null);
		joinAcks[username] = await emitAck(socket, 'game:join', { joinCode: game.join_code });
		joinedState[username] = Boolean(await statePromise);
	}
	expectTrue(Object.values(joinedState).every(Boolean), {
		name: 'students joined the lobby over Socket.IO (game:state_update received)',
	});

	// Probe: game:join is answered twice — the legacy engine 404s SaaS games.
	const badAcks = Object.entries(joinAcks).filter(([, ack]) => ack && ack.error);
	expectTrue(badAcks.length === 0, {
		name: 'game:join acknowledges Prisma-backed games',
		issue: {
			id: 'game-join-double-handler',
			severity: 'medium',
			title: 'game:join is handled twice — the legacy engine answers "Game not found" for SaaS games',
			area: 'Realtime / integration',
			detail:
				'mountLegacyGameEngine() and registerGameHandlers() both subscribe to game:join. The legacy ' +
				'engine only knows its own in-memory MPA lobbies, so for a game created through POST /api/v1/games ' +
				'it calls the ack first with { error: "Game not found" }, then the SaaS handler runs, joins the ' +
				'room and also acks { ok: true, gameId }. Clients that read the first ack (the documented one) ' +
				'see a failed join even though they are in the lobby; only clients that ignore the ack and wait ' +
				'for game:stateUpdate work.',
			evidence: [
				`join acks for a SaaS game: ${brief(joinAcks, 300)}`,
				'game-server.cjs — legacy game:join acks { error: "Game not found" } when getTrackedGameByJoinCode() misses',
				'src/backend/realtime/handlers/game.handler.js:26 — SaaS game:join acks { ok: true, gameId }',
			],
			fix:
				'Give the two engines distinct events (e.g. legacy:join) or have the legacy handler only ack when it actually owns the game, letting the SaaS handler own the ack for Prisma games.',
			refs: ['game-server.cjs', 'src/backend/realtime/handlers/game.handler.js:26', 'src/backend/realtime/legacy-engine.bridge.js'],
		},
	});
	const restJoiner = 's.lina';
	const restSession = await api('POST', '/api/v1/games/join', {
		token: S.students[restJoiner].token,
		body: { join_code: game.join_code },
	});
	expectTrue(Boolean(restSession?.game_id === game.id), {
		name: `${restJoiner} joined the lobby over REST`,
	});

	// Answering before the start must be refused.
	const early = await rawRequest('POST', `/api/v1/games/${game.id}/answer`, {
		token: student.token,
		body: { question_id: questionIds[0], answer: 'Rabat' },
	});
	expectTrue(early.status === 422, {
		name: 'answering before the game starts is refused (422)',
	});

	// Teacher starts the game; everyone should receive the first question.
	const startPromise = waitFor(socketsByUsername['s.amina'], 'game:question', 10_000);
	const started = await api('POST', `/api/v1/games/${game.id}/start`, {
		token: benali.token,
		expect: [200],
	});
	expectTrue(started.status === 'active', {
		name: 'teacher started the game (status → active)',
	});
	const firstQuestion = await startPromise;
	expectTrue(firstQuestion?.id === questionIds[0], {
		name: 'players received the first question over the socket',
	});

	// Scoring expectations per student.
	const patterns = {
		's.amina': [true, true, true, true, true, true], // 15 pts
		's.yassine': [true, true, true, true, false, true], // 11 pts
		's.khadija': [false, true, true, true, true, true], // 13 pts
		's.omar': [true, true, true, false, false, false], // 6 pts
		's.lina': [false, false, false, false, false, false], // 0 pts
	};

	// s.amina answers Q1 over the socket (verifies the realtime answer path and
	// gives the scoreboard listener something to observe).
	const socketUser = 's.amina';
	const socket = socketsByUsername[socketUser];
	let scoreEvents = 0;
	socket.on('game:scores', () => {
		scoreEvents += 1;
	});
	const answerResultWait = waitFor(socket, 'answer:result', 8000);
	const socketAck = await new Promise((resolve) => {
		socket.emit('game:answer', {
			gameId: game.id,
			questionId: questionIds[0],
			answer: MATH_QUESTIONS[0].answer,
		});
		answerResultWait.then(resolve).catch(() => resolve(null));
	});
	expectTrue(socketAck?.correct === true, {
		name: 'realtime answer was graded correctly (socket path)',
	});

	// Re-answering the same question is idempotent (checked while the player is
	// still mid-game, since a completed session is refused outright).
	const replay = await api('POST', `/api/v1/games/${game.id}/answer`, {
		token: student.token,
		body: { question_id: questionIds[0], answer: MATH_QUESTIONS[0].answer },
		expect: [200],
	});
	expectTrue(replay.alreadyAnswered === true && replay.points === 0, {
		name: 're-answering a question is idempotent (0 points, alreadyAnswered)',
	});

	// A later question, out of order and unanswered, must be refused.
	const outOfOrder = await rawRequest('POST', `/api/v1/games/${game.id}/answer`, {
		token: S.students['s.yassine'].token,
		body: { question_id: questionIds[3], answer: MATH_QUESTIONS[3].answer },
	});
	expectTrue(outOfOrder.status === 422, {
		name: 'answering out of order is refused (422)',
	});

	// Live score broadcasts: socket answers emit game:scores, REST answers should too.
	const restScoreEventsBefore = scoreEvents;
	await api('POST', `/api/v1/games/${game.id}/answer`, {
		token: S.students['s.omar'].token,
		body: { question_id: questionIds[0], answer: MATH_QUESTIONS[0].answer },
		expect: [200],
	});
	await sleep(1200);
	const restBroadcast = scoreEvents > restScoreEventsBefore;
	expectTrue(restBroadcast, {
		name: 'REST answers also broadcast game:scores to the room',
		issue: {
			id: 'rest-answer-no-broadcast',
			severity: 'medium',
			title: 'REST game/tournament answers never broadcast scores to other players',
			area: 'Realtime consistency',
			detail:
				'POST /api/v1/games/:id/answer and /api/v1/tournaments/:id/answer are documented fallbacks for ' +
				'clients that cannot hold a socket, but unlike the socket handlers they emit nothing. ' +
				'Any peer that answered over REST leaves every other scoreboard stale until the next socket answer, ' +
				'and a room made entirely of REST clients never updates live at all.',
			evidence: [
				`game:scores events observed after a first-time REST answer: ${scoreEvents - restScoreEventsBefore} (expected ≥ 1)`,
				'src/backend/routes/games.routes.js:145 — no io().to(room).emit() on the answer route',
				'src/backend/routes/tournaments.routes.js:169 — same gap',
			],
			fix:
				'Emit GAME_SCORES / TOURNAMENT_SCORES from the REST answer routes (they already import getIO for start/finish), or document REST as a degraded mode.',
			refs: ['src/backend/routes/games.routes.js:145', 'src/backend/routes/tournaments.routes.js:169'],
		},
	});

	// Everyone answers the remaining questions over REST (s.amina and s.omar
	// already sent Q1 above).
	for (const [username, pattern] of Object.entries(patterns)) {
		const token = S.students[username].token;
		const startIndex = username === socketUser || username === 's.omar' ? 1 : 0;
		for (let i = startIndex; i < MATH_QUESTIONS.length; i++) {
			const def = MATH_QUESTIONS[i];
			const want = pattern[i];
			const res = await api('POST', `/api/v1/games/${game.id}/answer`, {
				token,
				body: { question_id: questionIds[i], answer: want ? def.answer : `${def.answer}X` },
			});
			expectTrue(res.correct === Boolean(want), {
				name: `${username} Q${i + 1} graded ${want ? 'correct' : 'incorrect'} as expected`,
			});
		}
	}

	// A question that is not part of the game must be refused.
	const foreignQuestion = await rawRequest('POST', `/api/v1/games/${game.id}/answer`, {
		token: S.students['s.amina'].token,
		body: { question_id: qByKey('co2').id, answer: 'Dioxyde de carbone' },
	});
	expectTrue(foreignQuestion.status === 422, {
		name: 'answering with a question outside the game is refused (422)',
	});

	// Scores.
	const scores = await api('GET', `/api/v1/games/${game.id}/scores`, { token: benali.token });
	const byName = Object.fromEntries((scores || []).map((s) => [s.playerName, s]));
	const expectedScores = {
		'Amina Zahra': 15,
		'Yassine Idrissi': 11,
		'Khadija Naji': 13,
		'Omar Tazi': 6,
		'Lina Berrada': 0,
	};
	const mismatches = Object.entries(expectedScores).filter(
		([name, expected]) => Number(byName[name]?.score) !== expected,
	);
	expectTrue(mismatches.length === 0, {
		name: 'leaderboard scores match the expected grading',
		issue: {
			id: 'game-score-mismatch',
			severity: 'high',
			title: 'Game scores do not match the graded answers',
			area: 'Scoring',
			detail: 'Expected vs actual per player.',
			evidence: mismatches.map(
				([name, expected]) => `${name}: expected ${expected}, got ${byName[name]?.score}`,
			),
		},
	});
	const sorted = (scores || []).map((s) => Number(s.score));
	expectTrue(sorted.every((v, i) => i === 0 || sorted[i - 1] >= v), {
		name: 'scoreboard is sorted descending',
	});

	// Finish → ranks.
	const finished = await api('POST', `/api/v1/games/${game.id}/finish`, {
		token: benali.token,
		expect: [200],
	});
	expectTrue(finished.status === 'finished', {
		name: 'teacher finished the game (status → finished)',
	});
	const afterFinish = await api('GET', `/api/v1/games/${game.id}/scores`, {
		token: benali.token,
	});
	expectTrue(
		(afterFinish || []).every((s) => Number.isInteger(s.rank) && s.rank >= 1),
		{ name: 'every session received a final rank' },
	);

	const lateAnswer = await rawRequest('POST', `/api/v1/games/${game.id}/answer`, {
		token: S.students['s.amina'].token,
		body: { question_id: questionIds[0], answer: 'Rabat' },
	});
	expectTrue(lateAnswer.status === 422, {
		name: 'answering a finished game is refused (422)',
	});

	// Results must exist for history/analytics. Read them per student —
	// GET /results without a userId only ever returns the caller's own rows.
	const resultRows = [];
	for (const username of Object.keys(patterns)) {
		const res = await api('GET', `/api/v1/results?userId=${S.students[username].id}`, {
			token: S.admin.token,
		});
		resultRows.push(...(Array.isArray(res?.data) ? res.data : []));
	}
	const gameResults = resultRows.filter(
		(r) => r.mode === 'game' || String(r.answers_json || '').includes(game.id),
	);
	expectTrue(gameResults.length > 0, {
		name: 'finished game produced Result rows for the students',
		issue: {
			id: 'game-results-not-persisted',
			severity: 'medium',
			title: 'Finished games/tournaments never write Result rows',
			area: 'Data model',
			detail:
				'RESULT_MODE includes game and tournament, and the student workspace is built around a results ' +
				'history, but nothing in GameService.finish()/recordAnswer() or TournamentService.finish() inserts ' +
				'a Result. After a reload the only record of the played game is the game_session row; ' +
				'per-student history, class statistics and the overview dashboard never see it.',
			evidence: [
				`GET /api/v1/results?userId=<player> for the 5 players → ${resultRows.length} rows total, ${gameResults.length} tied to this game`,
				`sample row keys: ${brief(resultRows[0] ? Object.keys(resultRows[0]) : null, 300)}`,
				'search for mode: RESULT_MODE.GAME|game in src/ → no writers',
			],
			fix:
				'Persist a Result per completed session in GameService.finish() (and per entry in TournamentService.finish()) with mode: game/tournament.',
			refs: ['src/frontend/services/GameService.js:317', 'src/shared/constants.js:50'],
		},
	});

	// Keep sockets for the scoreboard observation; close them.
	for (const s of Object.values(socketsByUsername)) s.disconnect();
	return { scoreEvents };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7 — tournament, end to end
// ─────────────────────────────────────────────────────────────────────────────

async function phaseTournament() {
	const admin = S.admin;

	// The tournament model has no question set of its own; the scenario picks
	// six questions and stashes them in settings_json (as a client would).
	const tournamentQuestions = [
		qByKey('capital'),
		qByKey('fraction'),
		qByKey('co2'),
		qByKey('boil'),
		qByKey('water'),
		qByKey('mercury'),
	];
	const setIds = tournamentQuestions.map((q) => q.id);

	const tournament = await api('POST', '/api/v1/tournaments', {
		token: admin.token,
		body: {
			name: "Tournoi d'Excellence - Math & Sciences",
			description: 'Inter-class tournament, 6 questions, best score wins.',
			settings_json: JSON.stringify({
				point_multiplier: 2,
				question_ids: setIds,
			}),
			starts_at: new Date(Date.now() + 60_000).toISOString(),
		},
	});
	S.tournament = tournament;
	expectTrue(tournament.status === 'draft', {
		name: 'admin created a tournament (status → draft)',
	});

	// A teacher can author a tournament too…
	const teacherTournament = await api('POST', '/api/v1/tournaments', {
		token: S.teachers.benali.token,
		body: { name: 'Challenge Fractions' },
	});
	// …but cannot open it (lifecycle is admin-only).
	const teacherOpen = await rawRequest('POST', `/api/v1/tournaments/${teacherTournament.id}/open`, {
		token: S.teachers.benali.token,
	});
	expectTrue(teacherOpen.status === 403, {
		name: 'a teacher cannot open their own tournament (admin-only lifecycle)',
		issue: {
			id: 'tournament-lifecycle-split',
			severity: 'low',
			title: 'Teachers can create tournaments but cannot open/close/finish them',
			area: 'Workflow',
			detail:
				'POST /tournaments allows ADMIN|TEACHER, but /open, /close and /finish are ADMIN|SUPER_ADMIN only. ' +
				'A teacher who authors a tournament must ask an admin to publish it — the UI shows a "create" ' +
				'action that can never be completed by the same role. Worth confirming this is intentional; ' +
				'if it is, the create response should say so.',
			evidence: [
				`POST /tournaments (teacher) → 201`,
				`POST /tournaments/${teacherTournament.id}/open (same teacher) → ${teacherOpen.status} ${brief(teacherOpen.data, 160)}`,
			],
			fix: 'Either let the creator open/close their own tournament, or hide/annotate the lifecycle buttons for teachers.',
			refs: ['src/backend/routes/tournaments.routes.js:21', 'src/backend/routes/tournaments.routes.js:137'],
		},
	});
	await api('DELETE', `/api/v1/tournaments/${teacherTournament.id}`, {
		token: admin.token,
		expect: [204],
	});

	const opened = await api('POST', `/api/v1/tournaments/${tournament.id}/open`, {
		token: admin.token,
		expect: [200],
	});
	expectTrue(opened.status === 'open', {
		name: 'admin opened the tournament for registration',
	});

	// Registration: two students over socket, the rest over REST.
	const players = [
		's.amina',
		's.yassine',
		's.khadija',
		's.omar',
		's.hamza',
		's.safaa',
		's.mehdi',
		's.nour',
	];
	const socketPlayers = new Set(['s.amina', 's.hamza']);
	const tournamentSockets = {};
	const socketErrors = [];
	for (const username of players) {
		const token = S.students[username].token;
		if (socketPlayers.has(username)) {
			const socket = connectSocket(token);
			await connected(socket);
			socket.on('app:error', (payload) => socketErrors.push({ username, ...payload }));
			tournamentSockets[username] = socket;
			socket.emit('tournament:join', { tournamentId: tournament.id });
			await sleep(400); // the event carries no ack
		} else {
			await api('POST', `/api/v1/tournaments/${tournament.id}/register`, {
				token,
				expect: [201],
			});
		}
	}
	const entries = await api('GET', `/api/v1/tournaments/${tournament.id}/leaderboard`, {
		token: admin.token,
	});
	expectTrue((entries || []).length >= players.length - 1, {
		name: 'students registered for the tournament',
	});

	const doubleReg = await rawRequest('POST', `/api/v1/tournaments/${tournament.id}/register`, {
		token: S.students['s.amina'].token,
	});
	expectTrue(doubleReg.status === 409 || doubleReg.status === 422, {
		name: 'double registration is refused',
	});

	const teacherReg = await rawRequest('POST', `/api/v1/tournaments/${tournament.id}/register`, {
		token: S.teachers.benali.token,
	});
	expectTrue(teacherReg.status === 403, {
		name: 'teachers cannot register for tournaments (403)',
	});

	// Probe: the route accepts answers while status === 'open'…
	const openAnswer = await rawRequest('POST', `/api/v1/tournaments/${tournament.id}/answer`, {
		token: S.students['s.amina'].token,
		body: { question_id: setIds[0], answer: MATH_QUESTIONS[0].answer },
	});
	expectTrue(openAnswer.status === 409 || openAnswer.status === 422, {
		name: 'answering before the tournament is active is refused consistently',
		issue: {
			id: 'tournament-open-vs-active',
			severity: 'medium',
			title: 'Route and service disagree about when a tournament accepts answers',
			area: 'Tournament lifecycle',
			detail:
				'tournaments.routes.js:174 allows the request while status is open OR active, then ' +
				'TournamentService.recordAnswer() rejects anything that is not active. The client therefore ' +
				'gets a service-level 422 "Tournament is not active" for a state the route itself blessed — ' +
				'two different layers own the same rule and they drift.',
			evidence: [
				`POST /tournaments/:id/answer while status=open → ${openAnswer.status} ${brief(openAnswer.data, 220)}`,
				'src/backend/routes/tournaments.routes.js:174 vs src/frontend/services/TournamentService.js:146',
			],
			fix: 'Decide one owner for the rule (recommend the service) and mirror it in the route, or drop the duplicate check.',
			refs: ['src/backend/routes/tournaments.routes.js:169', 'src/frontend/services/TournamentService.js:140'],
		},
	});

	const closed = await api('POST', `/api/v1/tournaments/${tournament.id}/close`, {
		token: admin.token,
		expect: [200],
	});
	expectTrue(closed.status === 'active', {
		name: 'admin activated the tournament (open → active)',
	});

	// Scoring expectations (6 questions, points as authored).
	const expected = {
		's.amina': { pattern: [1, 1, 1, 1, 1, 1], want: 12 },
		's.yassine': { pattern: [1, 1, 1, 1, 0, 1], want: 11 },
		's.khadija': { pattern: [1, 1, 1, 0, 1, 1], want: 11 },
		's.omar': { pattern: [1, 1, 0, 1, 1, 0], want: 8 },
		's.hamza': { pattern: [1, 1, 1, 1, 1, 1], want: 12 },
		's.safaa': { pattern: [1, 0, 1, 1, 1, 1], want: 11 },
		's.mehdi': { pattern: [1, 1, 1, 1, 1, 0], want: 10 },
		's.nour': { pattern: [0, 1, 1, 1, 1, 1], want: 11 },
	};

	// One socket answer (realtime path)…
	const s1Socket = tournamentSockets['s.amina'];
	const tscoreWait = waitFor(s1Socket, 'tournament:scores', 8000).catch(() => null);
	s1Socket.emit('tournament:answer', {
		tournamentId: tournament.id,
		questionId: setIds[0],
		answer: MATH_QUESTIONS[0].answer,
	});
	const tAnswerResult = await waitFor(s1Socket, 'answer:result', 8000).catch(() => null);
	expectTrue(tAnswerResult?.correct === true && Number(tAnswerResult?.score) > 0, {
		name: 'realtime tournament answer was graded and added to the entry score',
	});
	await tscoreWait;

	// …the rest over REST.
	for (const [username, spec] of Object.entries(expected)) {
		for (let i = 0; i < setIds.length; i++) {
			if (username === 's.amina' && i === 0) continue; // already sent over the socket
			const question = tournamentQuestions[i];
			const correct = spec.pattern[i] === 1;
			await api('POST', `/api/v1/tournaments/${tournament.id}/answer`, {
				token: S.students[username].token,
				body: {
					question_id: setIds[i],
					answer: correct
						? question.answer
						: `${question.answer}X`,
				},
				expect: [200],
			});
		}
	}
	pass('all 8 students answered the 6 tournament questions');

	// Probe A: the same question can be answered repeatedly, inflating the score.
	const before = await api('GET', `/api/v1/tournaments/${tournament.id}/leaderboard`, {
		token: admin.token,
	});
	const beforeAmina = (before || []).find(
		(e) => e.user?.username === 's.amina' || e.user_id === S.students['s.amina'].id,
	);
	for (let i = 0; i < 3; i++) {
		await api('POST', `/api/v1/tournaments/${tournament.id}/answer`, {
			token: S.students['s.amina'].token,
			body: { question_id: setIds[0], answer: MATH_QUESTIONS[0].answer },
			expect: [200],
		});
	}
	const after = await api('GET', `/api/v1/tournaments/${tournament.id}/leaderboard`, {
		token: admin.token,
	});
	const afterAmina = (after || []).find((e) => e.id === beforeAmina?.id || e.user_id === beforeAmina?.user_id);
	const inflated = Number(afterAmina?.score) - Number(beforeAmina?.score);
	expectTrue(inflated === 0, {
		name: 'tournament answers are idempotent (no score inflation)',
		issue: {
			id: 'tournament-score-inflation',
			severity: 'high',
			title: 'Tournament answers are not deduplicated — score can be farmed infinitely',
			area: 'Scoring / integrity',
			detail:
				'GameService.recordAnswer() guards replays with a hasOwnProperty check on the stored answers map, ' +
				'but TournamentService.recordAnswer() only reads and adds to entry.score. A registered student can ' +
				'POST the same correct answer in a loop and top any leaderboard; the REST route does no per-question ' +
				'state either (tournament_entries store only a running total).',
			evidence: [
				`3 extra identical answers by s.amina changed the entry score by ${inflated} points`,
				`leaderboard: ${beforeAmina?.score} → ${afterAmina?.score}`,
				'src/frontend/services/TournamentService.js:140 — no per-question dedupe',
			],
			fix:
				'Persist per-question answers on the entry (answers_json, mirroring game_sessions) and reject repeats, ' +
				'or key the score update on (entry, question) uniqueness.',
			refs: ['src/frontend/services/TournamentService.js:140', 'src/frontend/services/GameService.js:214'],
		},
	});

	// Probe B: answers to questions outside any tournament set are accepted.
	const outside = await rawRequest('POST', `/api/v1/tournaments/${tournament.id}/answer`, {
		token: S.students['s.yassine'].token,
		body: { question_id: qByKey('double7').id, answer: '14' },
	});
	expectTrue(outside.status === 409 || outside.status === 422, {
		name: 'tournament rejects questions that are not part of its set',
		issue: {
			id: 'tournament-no-question-set',
			severity: 'high',
			title: 'Tournaments have no question set — any question_id is scored',
			area: 'Tournament model',
			detail:
				'Tournament has no question_ids column and nothing validates the question a student submits. ' +
				'Combined with the missing dedupe, a registered student can score on every easy question in the ' +
				'school, repeatedly. The only place tournament questions appear today is the legacy "rounds of games" ' +
				'studio (settings_json), which the server never reads.',
			evidence: [
				`POST /tournaments/:id/answer with a question outside the six picked questions → ${outside.status} ${brief(outside.data, 200)}`,
				'prisma/schema.prisma — model Tournament has no question relation/column',
			],
			fix:
				'Add question_ids to Tournament (like Game), validate them on create, and reject answers whose question_id is not in the set.',
			refs: ['prisma/schema.prisma', 'src/shared/schemas/tournament.schema.js'],
		},
	});

	// Probe C: an unvalidated ?limit= string is handed straight to Prisma.
	const limited = await rawRequest(
		'GET',
		`/api/v1/tournaments/${tournament.id}/leaderboard?limit=50`,
		{ token: admin.token },
	);
	expectTrue(limited.status === 200, {
		name: 'leaderboard accepts a ?limit= query parameter',
		issue: {
			id: 'query-limit-string-500',
			severity: 'medium',
			title: 'Unvalidated string query params reach Prisma — `?limit=` turns into a 500',
			area: 'Input validation',
			detail:
				'GET /tournaments/:id/leaderboard and GET /results take `limit`/`offset` straight from ' +
				'req.query (no validateQuery) and pass them to repo query builders as `take`/`skip`. ' +
				'Express gives strings, Prisma demands Int, so every paginated request that carries an ' +
				'explicit limit 500s — including the default page size the UI itself asks for. ' +
				'Reads that do go through validateQuery (questions, classes, tournaments) coerce correctly, ' +
				'so the bug is invisible until a route without a query schema is hit.',
			evidence: [
				`GET /api/v1/tournaments/:id/leaderboard?limit=50 → ${limited.status} ${brief(limited.data, 220)}`,
				'prisma.<model>.findMany({ take: "50" }) → Argument `take`: Invalid value provided. Expected Int, provided String.',
				'src/backend/routes/tournaments.routes.js (leaderboard) and src/backend/routes/results.routes.js — no validateQuery',
			],
			fix:
				'Add validateQuery(...) with z.coerce.number() to both routes (or coerce inside the repository) so limit/offset are integers.',
			refs: [
				'src/backend/routes/tournaments.routes.js',
				'src/backend/routes/results.routes.js',
				'src/backend/infrastructure/PrismaRepository.js',
			],
		},
	});

	// Leaderboard sanity (with the known inflation caveat).
	const leaderboard = await api(
		'GET',
		`/api/v1/tournaments/${tournament.id}/leaderboard`,
		{ token: admin.token },
	);
	const scores = (leaderboard || []).map((e) => Number(e.score));
	expectTrue(scores.every((v, i) => i === 0 || scores[i - 1] >= v), {
		name: 'tournament leaderboard is sorted by score',
	});

	const studentView = await api('GET', '/api/v1/tournaments?limit=50', {
		token: S.students['s.amina'].token,
	});
	expectTrue((studentView?.data || []).some((t) => t.id === tournament.id), {
		name: 'students can list the open tournament',
	});

	const finished = await api('POST', `/api/v1/tournaments/${tournament.id}/finish`, {
		token: admin.token,
		expect: [200],
	});
	expectTrue(finished.status === 'finished', {
		name: 'admin finished the tournament (status → finished)',
	});

	const ranked = await api('GET', `/api/v1/tournaments/${tournament.id}/leaderboard`, {
		token: admin.token,
	});
	expectTrue((ranked || []).every((e) => Number.isInteger(e.rank) && e.rank >= 1), {
		name: 'every entry received a final rank',
	});

	const afterFinish = await rawRequest('POST', `/api/v1/tournaments/${tournament.id}/answer`, {
		token: S.students['s.amina'].token,
		body: { question_id: setIds[0], answer: MATH_QUESTIONS[0].answer },
	});
	expectTrue(afterFinish.status === 409 || afterFinish.status === 422, {
		name: 'answering a finished tournament is refused',
	});

	const lateRegister = await rawRequest(
		'POST',
		`/api/v1/tournaments/${tournament.id}/register`,
		{ token: S.students['s.zakaria'].token },
	);
	expectTrue(lateRegister.status === 409 || lateRegister.status === 422, {
		name: 'registering after the tournament closed is refused',
	});

	for (const s of Object.values(tournamentSockets)) s.disconnect();
	if (socketErrors.length) {
		log('note', `socket app:error events: ${brief(socketErrors, 300)}`);
	}
	return { leaderboard: ranked };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 8 — cross-cutting verification (bootstrap + answer exposure)
// ─────────────────────────────────────────────────────────────────────────────

async function phaseVerification() {
	// 0. The payload is { school_id, data: { <table>: rows } } — unwrap it so
	//    the checks below read real rows instead of `undefined || []`.
	const adminBootWrap = await api('GET', '/api/v1/bootstrap', { token: S.admin.token });
	const adminBoot = adminBootWrap?.data || adminBootWrap || {};
	const counts = {
		classes: (adminBoot.classes || []).length,
		users: (adminBoot.users || []).length,
		categories: (adminBoot.categories || []).length,
		questions: (adminBoot.questions || []).length,
		games: (adminBoot.games || []).length,
		tournaments: (adminBoot.tournaments || []).length,
	};
	log('bootstrap', `admin sees ${brief(counts, 300)}`);
	expectTrue(
		counts.classes === 3 &&
			counts.users === 15 &&
			counts.categories === 3 &&
			counts.questions === 10 &&
			counts.games === 1 &&
			counts.tournaments === 1,
		{ name: 'admin bootstrap payload matches the created data (3/15/3/10/1/1)' },
	);

	const teacherBootWrap = await api('GET', '/api/v1/bootstrap', {
		token: S.teachers.benali.token,
	});
	const teacherBoot = teacherBootWrap?.data || teacherBootWrap || {};
	const teacherUsernames = new Set((teacherBoot.users || []).map((u) => u.username));
	expectTrue((teacherBoot.users || []).length > 0, {
		name: 'teacher bootstrap actually contains user rows',
	});
	expectTrue(
		!teacherUsernames.has('mme.alaoui') &&
			!teacherUsernames.has('admin') &&
			teacherUsernames.has('s.amina'),
		{ name: 'teacher bootstrap is scoped to their own classes (no staff rows)' },
	);

	const studentBootWrap = await api('GET', '/api/v1/bootstrap', {
		token: S.students['s.amina'].token,
	});
	const studentBoot = studentBootWrap?.data || studentBootWrap || {};
	expectTrue((studentBoot.questions || []).length > 0, {
		name: 'student bootstrap actually contains question rows',
	});

	// 1. Do students receive question answers?
	const answered = (studentBoot.questions || []).filter(
		(q) => String(q.answer || '').trim().length > 0,
	);
	expectTrue(answered.length === 0, {
		name: 'bootstrap does not hand answers to students',
		issue: {
			id: 'bootstrap-answer-leak',
			severity: 'high',
			title: 'GET /bootstrap sends every question — with its answer — to students',
			area: 'Data exposure',
			detail:
				'bootstrap.routes.js decodes multi::/meta:: answer prefixes and forwards the whole question row ' +
				'for every role; the isStudent branch narrows exams/results/games but never strips `answer` ' +
				'(or `explanation`). Any student can read the answer key from the preload the app itself fires ' +
				'on page load.',
			evidence: [
				`student bootstrap: ${answered.length} of ${(studentBoot.questions || []).length} questions carry an answer`,
				`sample: ${brief((studentBoot.questions || [])[0], 240)}`,
				'src/backend/routes/bootstrap.routes.js (student branch has no question projection)',
			],
			fix:
				'Project questions per role: students get {id, type, text, options, points, difficulty, category_id} only; answers/explanations stay for staff.',
			refs: ['src/backend/routes/bootstrap.routes.js', 'src/backend/routes/questions.routes.js'],
		},
	});

	// 2. Do students see system-visibility settings?
	const systemSettings = (studentBoot.settings || []).filter(
		(s) => s.visibility === 'system',
	);
	expectTrue(systemSettings.length === 0, {
		name: 'bootstrap hides system settings from students',
		issue: {
			id: 'bootstrap-system-settings-leak',
			severity: 'high',
			title: 'Students receive system-visibility settings (recovery hash, backup key) in bootstrap',
			area: 'Data exposure',
			detail:
				'SettingsService deliberately has no getSystemSettings(), and GET /settings/* tiers by role — ' +
				'but bootstrap queries the settings table with only {school_id}, so visibility=system rows ' +
				'(system.recovery_code_hash, system.backup_key) are delivered to every authenticated role, ' +
				'including students. The bcrypt recovery hash can then be taken offline for cracking.',
			evidence: [
				`system rows in student bootstrap: ${systemSettings.map((s) => s.key).join(', ') || 'none'}`,
				`all settings keys seen by the student: ${(studentBoot.settings || []).map((s) => `${s.key}(${s.visibility})`).join(', ')}`,
				'src/backend/routes/bootstrap.routes.js — queryForTable() has no visibility filter for settings',
			],
			fix:
				"Filter settings by visibility using the caller's role (mirror settings.byVisibility query) inside bootstrap.",
			refs: [
				'src/backend/routes/bootstrap.routes.js',
				'src/backend/infrastructure/PrismaRepository.js:308',
			],
		},
	});

	// 3. The REST question API itself.
	const studentQuestions = await rawRequest('GET', '/api/v1/questions?limit=200', {
		token: S.students['s.amina'].token,
	});
	const withAnswers = (studentQuestions.data?.data || []).filter(
		(q) => String(q.answer || '').trim().length > 0,
	);
	expectTrue(studentQuestions.status !== 200 || withAnswers.length === 0, {
		name: 'students cannot read the answer key through GET /questions',
		issue: {
			id: 'questions-api-no-role-gate',
			severity: 'high',
			title: 'GET /api/v1/questions has no role gate and returns answers to students',
			area: 'Authorization',
			detail:
				'Every other content router gates writes by role, but questions.routes.js GET / and GET /:id ' +
				'only require authentication. Students receive the whole school question bank including ' +
				'`answer` and `explanation` — no need for bootstrap at all. The same hole exists for ' +
				'GET /categories (lower impact).',
			evidence: [
				`GET /api/v1/questions (as student) → ${studentQuestions.status}, ${(studentQuestions.data?.data || []).length} rows, ${withAnswers.length} with answers`,
				'src/backend/routes/questions.routes.js:35 — no requireRole on the read routes',
			],
			fix:
				'Add requireRole([ADMIN, TEACHER]) to the question read routes (or a student projection that drops answer/explanation).',
			refs: ['src/backend/routes/questions.routes.js:35', 'src/backend/routes/questions.routes.js:52'],
		},
	});

	// 4. Do students receive the whole user directory?
	const directory = (studentBoot.users || []).filter((u) => u.role === 'student');
	const otherClasses = directory.filter((u) => u.class_id && u.class_id !== S.classes['6eme A']);
	expectTrue(otherClasses.length === 0, {
		name: 'student bootstrap is limited to their own class roster',
		issue: {
			id: 'bootstrap-user-directory',
			severity: 'low',
			title: 'Students receive every user row in the school (all classes, staff contact data)',
			area: 'Data exposure',
			detail:
				'The student branch of bootstrap narrows profile_requests/results/games but not `users`: ' +
				'names, usernames, e-mails, phone numbers and staff rows for the entire tenant are delivered ' +
				'to every student device and cached in localStorage by the legacy bridge.',
			evidence: [
				`users in student bootstrap: ${(studentBoot.users || []).length} (own class roster: ${directory.length})`,
				`other-class rows: ${otherClasses.length}`,
			],
			fix: "Scope `users` to the student's own class (and staff rows only if the UI needs them).",
			refs: ['src/backend/routes/bootstrap.routes.js'],
		},
	});

	// 5. Class listing for a student (informational).
	const studentClasses = await rawRequest('GET', '/api/v1/classes', {
		token: S.students['s.amina'].token,
	});
	log('note', `student GET /classes → ${studentClasses.status}`);

	return { counts, studentBoot };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9 — tenancy + rate limiting probes
// ─────────────────────────────────────────────────────────────────────────────

async function phaseTenancyProbe() {
	process.env.DATABASE_URL = SIM_DB_URL;
	const { PrismaClient } = await import('@prisma/client');
	const prisma = new PrismaClient();
	try {
		// Give a second tenant a user with the SAME username as the seed admin.
		const other = await prisma.school.upsert({
			where: { slug: 'other-school' },
			update: {},
			create: { id: 'other-school', name: 'Rival School', slug: 'other-school' },
		});
		const bcrypt = await import('bcrypt');
		const hash = await bcrypt.hash('OtherSecret99', 12);
		await prisma.user.upsert({
			where: { school_id_username: { school_id: other.id, username: 'admin' } },
			update: {},
			create: {
				school_id: other.id,
				username: 'admin',
				password_hash: hash,
				role: 'admin',
				name: 'Rival Administrator',
				status: 'active',
			},
		});

		// Which tenant does the shared username resolve to?
		const seedLogin = await rawRequest('POST', '/api/v1/auth/login', {
			body: { username: 'admin', password: 'admin123' },
		});
		const rivalLogin = await rawRequest('POST', '/api/v1/auth/login', {
			body: { username: 'admin', password: 'OtherSecret99' },
		});
		const seedUser = seedLogin.data?.user;
		const rivalUser = rivalLogin.data?.user;
		const bothResolveToRival =
			seedLogin.status !== 200 && rivalLogin.status === 200 && rivalUser?.school_id === other.id;
		const ambiguous =
			seedLogin.status === 200 &&
			rivalLogin.status === 200 &&
			seedUser?.school_id === rivalUser?.school_id;

		expectTrue(!bothResolveToRival && !ambiguous, {
			name: 'login resolves the username inside the tenant',
			issue: {
				id: 'global-username-login',
				severity: 'high',
				title: 'Login ignores the school — duplicate usernames across tenants lock each other out',
				area: 'Multi-tenancy / auth',
				detail:
					'AuthService.login() looks up users by username alone (no school filter) while the schema ' +
					'promises @@unique([school_id, username]). Every tenant that uses the conventional "admin" ' +
					'username collides: the newest row wins (getAll default order created_at desc), so the other ' +
					'tenants\' admins get "Invalid username or password" for correct credentials. LoginSchema even ' +
					'accepts a schoolSlug field that login() never reads.',
				evidence: [
					`login admin/admin123 → ${seedLogin.status} ${seedUser ? `school_id=${seedUser.school_id}` : brief(seedLogin.data, 120)}`,
					`login admin/OtherSecret99 → ${rivalLogin.status} ${rivalUser ? `school_id=${rivalUser.school_id}` : brief(rivalLogin.data, 120)}`,
					'src/backend/services/AuthService.js:59 — filters: { username } only',
					'src/shared/schemas/user.schema.js:95 — schoolSlug parsed but unused',
				],
				fix:
					'Resolve by (schoolSlug | school_id) + username, and expose the tenant choice on the login screen; ' +
					'at minimum fall back to DEFAULT_SCHOOL_ID so the seeded admin keeps working.',
				refs: ['src/backend/services/AuthService.js:53', 'src/shared/schemas/user.schema.js:92'],
			},
		});
	} finally {
		await prisma.$disconnect();
	}
}

async function phaseRateLimitProbe() {
	// Drain the remaining auth budget to measure the real login ceiling.
	let allowed = 0;
	let limitedAt = null;
	for (let i = 0; i < 30; i++) {
		const res = await rawRequest('POST', '/api/v1/auth/login', {
			body: { username: 's.amina', password: PASSWORD },
		});
		if (res.status === 429) {
			limitedAt = i + 1;
			break;
		}
		if (res.status === 200) allowed += 1;
	}
	expectTrue(limitedAt === null, {
		name: 'login rate limit tolerates a classroom of logins from one IP',
		issue: {
			id: 'auth-rate-limit-lan',
			severity: 'medium',
			title: 'Auth is capped at 10 (route) / 20 (mount) logins per 15 minutes per IP',
			area: 'Availability',
			detail:
				'Two limiters stack on /api/v1/auth: the mount-level one (20/15min) and auth.routes.js own ' +
				'(10/15min, disabled only when NODE_ENV=test). They count by IP, so a whole computer lab ' +
				'behind one NAT/proxy — or a class refreshing tabs — burns the budget in seconds and every ' +
				'following login fails for 15 minutes. Nothing in the response tells a user which door is closed.',
			evidence: [
				`logins allowed from one IP on a freshly restarted server before the 429: ${limitedAt ?? '> 30'}`,
				'src/backend/server.js:144 — authLimiter max: 20 / 15min',
				'src/backend/routes/auth.routes.js:24 — own limiter max: 10 / 15min',
			],
			fix:
				'Raise the ceiling for private deployments, key the limiter on username+IP instead of IP alone, ' +
				'and/or allow disabling it with an env flag (RATE_LIMIT_DISABLED) for LAN installs.',
			refs: ['src/backend/server.js:144', 'src/backend/routes/auth.routes.js:24'],
		},
	});
	if (limitedAt) log('note', `auth rate limit kicked in after ${allowed} successful logins`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

function writeReport() {
	const severityOrder = { high: 0, medium: 1, low: 2 };
	const sorted = [...issues].sort(
		(a, b) => severityOrder[a.severity] - severityOrder[b.severity],
	);
	const failed = checks.filter((c) => !c.pass);
	const passed = checks.filter((c) => c.pass);

	const lines = [];
	lines.push('# Issues to fix');
	lines.push('');
	lines.push(
		`Generated by \`node scripts/simulate-school.mjs\` on ${new Date().toISOString()}`,
	);
	lines.push(
		`Target: ${BASE} · tenant \`${SCHOOL_ID}\` · DB \`prisma/simulation.db\` (throwaway, \`prisma/dev.db\` untouched)`,
	);
	lines.push('');
	lines.push('## What the simulation runs');
	lines.push('');
	lines.push('```');
	lines.push('fresh DB (prisma migrate deploy, with db push fallback) → seed tenant');
	lines.push('virtual school → 3 classes → 2 teachers → 12 students');
	lines.push('  → 3 categories (parent/child) → 10 questions (mcq, true-false, fill-blank, matching, order)');
	lines.push('  → 1 game   (lobby over socket + REST, start, 30 graded answers, scores, finish, ranks)');
	lines.push('  → 1 tournament (open → register ×8 → answer ×48 → leaderboard → finish)');
	lines.push('  → bootstrap/role-scoping checks → cross-tenant login probe → rate-limit probe');
	lines.push('```');
	lines.push('');
	lines.push('## Summary');
	lines.push('');
	lines.push(`- **${sorted.length} issues**: ${['high', 'medium', 'low']
		.map((s) => `${sorted.filter((i) => i.severity === s).length} ${s}`)
		.join(' · ')}`);
	lines.push(`- **${passed.length} checks passed**, **${failed.length} failed** (each failed check maps to an issue below)`);
	lines.push('');
	lines.push('| # | Severity | Area | Issue |');
	lines.push('|---|----------|------|-------|');
	sorted.forEach((issue, i) => {
		lines.push(`| ${i + 1} | ${issue.severity} | ${issue.area} | ${issue.title} |`);
	});
	lines.push('');

	sorted.forEach((issue, i) => {
		lines.push(`## ${i + 1}. ${issue.title}`);
		lines.push('');
		lines.push(`- **Severity:** ${issue.severity}`);
		lines.push(`- **Area:** ${issue.area}`);
		lines.push(`- **Where:** \`${issue.refs.join('`, `') || 'n/a'}\``);
		lines.push('');
		lines.push(issue.detail);
		lines.push('');
		if (issue.evidence.length) {
			lines.push('**Evidence from the run:**');
			lines.push('');
			for (const e of issue.evidence) lines.push(`- \`${String(e).replace(/`/g, "'")}\``);
			lines.push('');
		}
		if (issue.fix) {
			lines.push(`**Suggested fix:** ${issue.fix}`);
			lines.push('');
		}
	});

	lines.push('## Checks that passed');
	lines.push('');
	for (const c of passed) lines.push(`- ${c.name}`);
	if (failed.length) {
		lines.push('');
		lines.push('## Failed checks (each one confirms an issue above)');
		lines.push('');
		for (const c of failed) lines.push(`- ${c.name}${c.note ? ` — ${c.note}` : ''}`);
	}
	lines.push('');
	lines.push('## Reproduce');
	lines.push('');
	lines.push('```powershell');
	lines.push('node scripts/simulate-school.mjs');
	lines.push('```');
	lines.push('');
	lines.push('Flags: `--keep` reuse the previous simulation DB · `--port <n>` · `--external` target a running server (`QUIZ_BASE_URL`).');
	lines.push('');

	fs.writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
	log('report', `wrote ${REPORT_PATH}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
	console.log('quiz-model-v4 · end-to-end school simulation');
	console.log(`base url: ${BASE}`);

	if (!EXTERNAL) {
		if (!KEEP_DB) {
			for (const suffix of ['', '-journal', '-shm', '-wal']) {
				fs.rmSync(`${DB_FILE}${suffix}`, { force: true });
			}
		}
		await prepareDatabase();
		await startServer();
	} else {
		await waitForHealth(10_000);
	}

	await phase('School (tenant + profile)', phaseSchool);
	// The tenancy login probe burns two of the 20-logins/15min budget, so it has
	// to run before the 15 classroom logins — otherwise a 429 masks the real answer.
	await phase('Tenancy (cross-tenant login)', phaseTenancyProbe);
	await phase('Classes', phaseClasses);
	await phase('Teachers + assignments', phaseTeachers);
	await phase('Categories + questions', phaseContent);
	await phase('Students', phaseStudents);
	await phase('Game end-to-end', phaseGame);
	await phase('Tournament end-to-end', phaseTournament);
	await phase('Bootstrap + role scoping', phaseVerification);
	await phase('Rate-limit probe (fresh server)', async () => {
		// Restart so the in-memory limiters start from zero and the measurement
		// is the real ceiling, not the remainder of the scenario's budget.
		if (!EXTERNAL) {
			await stopServer();
			await sleep(500);
			await startServer();
		}
		await phaseRateLimitProbe();
	});

	writeReport();

	console.log('');
	log('done', `${issues.length} issue(s), ${checks.filter((c) => c.pass).length} passed checks`);
}

let exitCode = 0;
try {
	await main();
} catch (err) {
	exitCode = 1;
	console.error('[fatal]', err);
	addIssue({
		id: 'simulation-aborted',
		severity: 'high',
		title: 'The simulation itself aborted',
		area: 'Tooling',
		detail: 'The run stopped before finishing; see evidence.',
		evidence: [String(err?.stack || err)],
	});
	try {
		writeReport();
	} catch {
		/* ignore */
	}
} finally {
	await stopServer();
}
process.exit(exitCode);
