import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { signJwt } from './src/backend/utils/jwt.js';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9345;
const PROFILE = path.join(os.tmpdir(), `dsh-roster-check-${Date.now()}`);
const BASE = 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const identity = {
	id: '7bf87893-1110-4607-a989-e48b9c72e5f2',
	username: 'hicham',
	name: 'hicham taybi',
	role: 'teacher',
	school_id: 'local',
};
const token = signJwt(identity);
const session = {
	userId: identity.id,
	username: identity.username,
	name: identity.name,
	role: identity.role,
	token,
	issuedAt: Date.now(),
	expiresAt: Date.now() + 43200000,
	remember: false,
};
const user = { ...identity, status: 'active' };
let ws;
let msgId = 0;
const pending = new Map();
const errors = [];
const send = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const id = ++msgId;
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params }));
	});
fs.mkdirSync(PROFILE, { recursive: true });
spawn(
	CHROME,
	['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-gpu', '--window-size=1440,1100', 'about:blank'],
	{ stdio: 'ignore', detached: true },
).unref();
let target;
for (let i = 0; i < 60 && !target; i++) {
	await sleep(400);
	try {
		const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
		target = list.find((t) => t.type === 'page');
	} catch (_) {
		/* booting */
	}
}
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) {
		const p = pending.get(msg.id);
		pending.delete(msg.id);
		msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
		return;
	}
	if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
		errors.push((msg.params.args || []).map((a) => a.value ?? a.description).join(' '));
	}
	if (msg.method === 'Runtime.exceptionThrown') {
		errors.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
	}
};
await send('Page.enable');
await send('Runtime.enable');
const inject = `try{const s=${JSON.stringify(session)},u=${JSON.stringify(user)};localStorage.setItem('quizTheme:v2','dark');localStorage.setItem('quizSession',JSON.stringify(s));localStorage.setItem('quizSession:teacher',JSON.stringify(s));localStorage.setItem('quizAuthToken',s.token);localStorage.setItem('quizAuthToken:teacher',s.token);localStorage.setItem('quizCurrentUser',JSON.stringify(u));localStorage.setItem('quizCurrentUser:teacher',JSON.stringify(u));localStorage.setItem('quizUsers',JSON.stringify([u]));sessionStorage.setItem('quizSession',JSON.stringify(s));window.__authToken=s.token;}catch(e){}`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: inject });
const evalJs = async (expression, awaitPromise = false) => {
	const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
	if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
	return r.result?.value;
};
const shot = async (name) => {
	const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
	fs.writeFileSync(path.join(process.cwd(), `${name}.png`), Buffer.from(s.data, 'base64'));
};
const info = async () => JSON.parse(await evalJs(`JSON.stringify({
	rows: document.querySelectorAll('#selectedStudentsList .selected-student-item').length,
	bulkHidden: document.getElementById('bulk-actions-students')?.classList.contains('hidden'),
	bulkRect: (()=>{const el=document.getElementById('bulk-actions-students');if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})(),
	toolbarRect: (()=>{const el=document.querySelector('.roster-main-toolbar');if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})(),
	addRect: (()=>{const el=document.querySelector('.roster-add-actions');if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})(),
	controlsRect: (()=>{const el=document.querySelector('.roster-main-toolbar .toolbar-controls');if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})(),
	toolbarScrollWidth: document.querySelector('.roster-main-toolbar')?.scrollWidth,
	toolbarClientWidth: document.querySelector('.roster-main-toolbar')?.clientWidth,
	selected: document.getElementById('selected-count-students')?.innerText
})`));

await send('Page.navigate', { url: `${BASE}/admin.html` });
await sleep(7000);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
await evalJs(`window.openTab(null,'classes')`);
await sleep(800);
const classId = await evalJs(`(window.__DI_CONTAINER__.repo.getAll_sync('classes')||[])[0]?.id || ''`);
await evalJs(`window.openAssignClassStudents(${JSON.stringify(classId)})`);
await sleep(1800);
console.log('BEFORE', JSON.stringify(await info()));
await shot('students-roster-before');
await evalJs(`document.querySelector('#selectedStudentsList .student-checkbox')?.click()`);
await sleep(500);
console.log('ONE SELECTED', JSON.stringify(await info()));
await shot('students-roster-bulk');
await evalJs(`document.getElementById('selectAllStudents')?.click()`);
await sleep(500);
console.log('ALL SELECTED', JSON.stringify(await info()));
await shot('students-roster-bulk-all');
// Filters
await evalJs(`(()=>{const el=document.getElementById('studentRosterStatusFilter');el.value='active';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
await sleep(500);
console.log('STATUS FILTER', JSON.stringify(await info()));
await evalJs(`(()=>{const el=document.getElementById('studentRosterSearch');el.value='zzz';el.dispatchEvent(new Event('keyup',{bubbles:true}));})()`);
await sleep(500);
console.log('SEARCH FILTER', JSON.stringify(await info()));
await evalJs(`(()=>{const s=document.getElementById('studentRosterSearch');s.value='';s.dispatchEvent(new Event('keyup',{bubbles:true}));const st=document.getElementById('studentRosterStatusFilter');st.value='all';st.dispatchEvent(new Event('change',{bubbles:true}));})()`);
await sleep(500);
// Mobile action sheet
await send('Emulation.setDeviceMetricsOverride', { width: 500, height: 900, deviceScaleFactor: 1, mobile: true });
await sleep(400);
await evalJs(`(()=>{const row=document.querySelector('#selectedStudentsList .selected-student-item');row?.click();})()`);
await sleep(500);
console.log('MOBILE SHEET', await evalJs(`JSON.stringify({open:!!document.querySelector('#mobileActionSheet') && !document.querySelector('#mobileActionSheet').classList.contains('hidden'), title:document.getElementById('actionSheetTitle')?.innerText, actions:(document.getElementById('actionSheetContent')?.innerText||'').replace(/\\n/g,' | ')})`));
await shot('students-action-sheet');
console.log('CONSOLE ERRORS', JSON.stringify(errors.filter((e) => !/favicon|net::ERR/.test(e))));
process.exit(0);
