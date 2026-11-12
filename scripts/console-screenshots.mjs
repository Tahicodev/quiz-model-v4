/**
 * scripts/console-screenshots.mjs
 *
 * Capture the Admin control center at a desktop size, for visual review.
 *
 * Drives headless Chrome over the DevTools protocol, signs in through the
 * real API, then screenshots each console route. Output lands in .zcode/.
 *
 *   node scripts/console-screenshots.mjs
 *   SHOT_USER=platform.root SHOT_PASS='…' node scripts/console-screenshots.mjs
 *   SHOT_WIDTH=768 SHOT_HEIGHT=1024 node scripts/console-screenshots.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9444;
const OUT = path.resolve('.zcode');
const BASE = 'http://127.0.0.1:3000';
const ROUTES = ['/', '/organizations', '/users', '/analytics', '/audit', '/health', '/settings'];
// Detail routes are resolved at runtime (they need a real record id).
const DETAIL_ROUTES = [
	{ label: 'organization-detail', hash: '/organizations/local' },
	{ label: 'user-detail', hash: null }, // filled in from the user list
];
const USER = process.env.SHOT_USER || 'admin';
const PASS = process.env.SHOT_PASS || 'admin123';
const WIDTH = Number(process.env.SHOT_WIDTH || 1440);
const HEIGHT = Number(process.env.SHOT_HEIGHT || 900);

fs.mkdirSync(OUT, { recursive: true });

const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		`--remote-debugging-port=${PORT}`,
		'--disable-gpu',
		'--no-first-run',
		'--no-default-browser-check',
		`--user-data-dir=${path.resolve('.zcode', 'console-shot-profile')}`,
		`--window-size=${WIDTH},${HEIGHT}`,
		'about:blank',
	],
	{ stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
	const res = await fetch(url);
	return res.json();
}

let ws;
let nextId = 1;
const pending = new Map();

function send(method, params = {}) {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params }));
	});
}

async function main() {
	// Wait for the DevTools endpoint.
	let version = null;
	for (let i = 0; i < 40; i += 1) {
		try {
			version = await getJson(`http://127.0.0.1:${PORT}/json/version`);
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

	// session-scoped send
	const sessionSend = (method, params = {}) =>
		new Promise((resolve, reject) => {
			const id = nextId++;
			pending.set(id, { resolve, reject });
			ws.send(JSON.stringify({ id, method, params, sessionId }));
		});

	await sessionSend('Page.enable');
	await sessionSend('Runtime.enable');
	await sessionSend('Emulation.setDeviceMetricsOverride', {
		width: WIDTH,
		height: HEIGHT,
		deviceScaleFactor: 1,
		mobile: false,
	});

	// Sign in through the real API, then seed the session the console reads.
	await sessionSend('Page.navigate', { url: `${BASE}/console` });
	await sleep(1200);
	const login = await sessionSend('Runtime.evaluate', {
		expression: `(async () => {
			const res = await fetch('/api/v1/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ username: '${USER}', password: '${PASS}', force: true, portal: 'admin' })
			});
			const body = await res.json();
			if (!body.accessToken) return { status: res.status };
			const session = { token: body.accessToken, userId: body.user.id, username: body.user.username, role: body.user.role, school_id: body.user.school_id };
			localStorage.setItem('quizSession', JSON.stringify(session));
			sessionStorage.setItem('quizSession', JSON.stringify(session));
			localStorage.setItem('quizAuthToken', body.accessToken);
			return { status: res.status, role: body.user.role };
		})()`,
		awaitPromise: true,
		returnByValue: true,
	});
	console.log('login:', JSON.stringify(login.result?.value));

	// The console boots on load, so the page must be reloaded after the
	// session was seeded — a hash change alone does not re-boot it.
	await sessionSend('Page.reload', { ignoreCache: true });
	await sleep(2600);

	for (const route of ROUTES) {
		if (route !== '/') {
			await sessionSend('Runtime.evaluate', {
				expression: `location.hash = ${JSON.stringify(`#${route}`)};`,
			});
			await sleep(2200);
		}
		const shot = await sessionSend('Page.captureScreenshot', { format: 'png' });
		const name = route === '/' ? 'console-overview' : `console${route.replace(/\//g, '-')}`;
		const file = path.join(OUT, `${name}.png`);
		fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
		console.log('wrote', file);
	}

	// Detail pages: resolve a real record id from the API first.
	const ids = await sessionSend('Runtime.evaluate', {
		expression: `(async () => {
			const token = JSON.parse(localStorage.getItem('quizSession') || 'null')?.token;
			const headers = { Authorization: 'Bearer ' + token };
			const orgs = await (await fetch('/api/v1/console/organizations?limit=50', { headers })).json();
			const org = (orgs.data || []).find((row) => row.students > 0) || (orgs.data || [])[0];
			const users = await (await fetch('/api/v1/console/users?limit=50', { headers })).json();
			const user = (users.data || []).find((row) => row.role === 'student') || (users.data || [])[0];
			return { org: org?.id || null, user: user?.id || null };
		})()`,
		awaitPromise: true,
		returnByValue: true,
	});
	const resolved = ids.result?.value || {};
	for (const detail of DETAIL_ROUTES) {
		const hash = detail.hash === null ? (resolved.user ? `/users/${resolved.user}` : null) : detail.hash;
		if (!hash) continue;
		await sessionSend('Runtime.evaluate', {
			expression: `location.hash = ${JSON.stringify(`#${hash}`)};`,
		});
		await sleep(2200);
		const shot = await sessionSend('Page.captureScreenshot', { format: 'png' });
		const file = path.join(OUT, `console-${detail.label}.png`);
		fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
		console.log('wrote', file);
	}
}

main()
	.catch((err) => {
		console.error('FAILED', err);
		process.exitCode = 1;
	})
	.finally(async () => {
		try {
			chrome.kill();
		} catch {
			/* ignore */
		}
	});
