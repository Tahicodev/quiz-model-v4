/**
 * scripts/teacher-regression-shot.mjs
 *
 * Regression check for the TEACHER session.
 *
 * Signs in through the real legacy login form on /admin.html (the same path a
 * teacher uses) and screenshots the teacher Overview — the analytics surface
 * that must not be damaged by the Admin console work.
 *
 *   node scripts/teacher-regression-shot.mjs
 *   TEACHER_USER=… TEACHER_PASS=… node scripts/teacher-regression-shot.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9445;
const OUT = path.resolve('.zcode');
const BASE = 'http://127.0.0.1:3000';
const USER = process.env.TEACHER_USER || 'zz_console_teacher';
const PASS = process.env.TEACHER_PASS || 'VerifyTeacher2026!';
const SCHOOL = process.env.TEACHER_SCHOOL || 'local';
const WIDTH = 1440;
const HEIGHT = 900;

fs.mkdirSync(OUT, { recursive: true });

/**
 * Make sure the verification teacher exists with a known password. A dedicated
 * account keeps the check repeatable without touching anybody's real account.
 */
async function ensureTeacher() {
	const prisma = new PrismaClient();
	try {
		const passwordHash = await bcrypt.hash(PASS, 4);
		await prisma.user.upsert({
			where: { school_id_username: { school_id: SCHOOL, username: USER } },
			update: { password_hash: passwordHash, role: 'teacher', status: 'active' },
			create: {
				school_id: SCHOOL,
				username: USER,
				password_hash: passwordHash,
				role: 'teacher',
				status: 'active',
				name: 'Console Regression Teacher',
			},
		});
	} finally {
		await prisma.$disconnect();
	}
}

const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		`--remote-debugging-port=${PORT}`,
		'--disable-gpu',
		'--no-first-run',
		'--no-default-browser-check',
		`--user-data-dir=${path.resolve('.zcode', 'teacher-shot-profile')}`,
		`--window-size=${WIDTH},${HEIGHT}`,
		'about:blank',
	],
	{ stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}, sessionId) {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
	});
}

async function main() {
	await ensureTeacher();

	let version = null;
	for (let i = 0; i < 40; i += 1) {
		try {
			version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
			break;
		} catch {
			await sleep(250);
		}
	}
	if (!version) throw new Error('Chrome DevTools endpoint never came up');

	ws = new WebSocket(version.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.addEventListener('open', resolve, { once: true });
		ws.addEventListener('error', reject, { once: true });
	});
	ws.addEventListener('message', (event) => {
		const message = JSON.parse(event.data);
		if (message.id && pending.has(message.id)) {
			const { resolve, reject } = pending.get(message.id);
			pending.delete(message.id);
			if (message.error) reject(new Error(message.error.message));
			else resolve(message.result);
		}
	});

	const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
	const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
	const s = (method, params = {}) => send(method, params, sessionId);

	await s('Page.enable');
	await s('Runtime.enable');
	await s('Emulation.setDeviceMetricsOverride', {
		width: WIDTH,
		height: HEIGHT,
		deviceScaleFactor: 1,
		mobile: false,
	});

	await s('Page.navigate', { url: `${BASE}/admin.html` });
	await sleep(2500);

	// Fill the legacy login form and submit it exactly as a teacher would.
	const filled = await s('Runtime.evaluate', {
		expression: `(() => {
			const user = document.getElementById('auth-username');
			const pass = document.getElementById('auth-password');
			if (!user || !pass) return { ok: false, found: { user: !!user, pass: !!pass } };
			const set = (el, value) => {
				el.value = value;
				el.dispatchEvent(new Event('input', { bubbles: true }));
				el.dispatchEvent(new Event('change', { bubbles: true }));
			};
			set(user, ${JSON.stringify(USER)});
			set(pass, ${JSON.stringify(PASS)});
			document.getElementById('authLoginForm')?.requestSubmit();
			return { ok: true };
		})()`,
		returnByValue: true,
	});
	console.log('login form:', JSON.stringify(filled.result?.value));

	await sleep(4000);

	const state = await s('Runtime.evaluate', {
		expression: `({
			loggedIn: sessionStorage.getItem('adminLoggedIn'),
			role: window.currentUser?.role || null,
			name: window.currentUser?.name || null,
			activeTab: document.querySelector('.tab-content.active')?.id || null,
			navVisible: Array.from(document.querySelectorAll('.nav-tab[data-tab]')).filter((el) => !el.classList.contains('role-hidden')).map((el) => el.dataset.tab),
			overviewPanels: document.querySelectorAll('#overview .dashboard-panel, #overview .stat-card').length,
		})`,
		returnByValue: true,
	});
	console.log('teacher session:', JSON.stringify(state.result?.value));

	const shot = await s('Page.captureScreenshot', { format: 'png' });
	const file = path.join(OUT, 'teacher-overview-regression.png');
	fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
	console.log('wrote', file);
}

main()
	.catch((err) => {
		console.error('FAILED', err);
		process.exitCode = 1;
	})
	.finally(() => {
		try {
			chrome.kill();
		} catch {
			/* ignore */
		}
	});
