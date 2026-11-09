import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9346;
const PROFILE = path.resolve('.zcode', 'cd-real-profile');
const OUT = path.resolve('.zcode');
const BASE = 'http://127.0.0.1:3000';
const ADMIN = { user: 'zz_verify_admin', pass: 'verify1234' };

const log = (...a) => console.log('[cd]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, msgId = 0;
const pending = new Map();
const logs = [];

function send(method, params = {}) {
	return new Promise((resolve, reject) => {
		const id = ++msgId;
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params }));
	});
}

async function connect() {
	fs.rmSync(PROFILE, { recursive: true, force: true });
	fs.mkdirSync(PROFILE, { recursive: true });
	const child = spawn(CHROME, [
		'--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
		'--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
		'--window-size=1280,900', 'about:blank',
	], { stdio: 'ignore' });
	let target = null;
	for (let i = 0; i < 60 && !target; i++) {
		await sleep(500);
		try { const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()); target = list.find((t) => t.type === 'page'); } catch (_) {}
	}
	if (!target) throw new Error('no target');
	ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	ws.onmessage = (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result); return; }
		if (!msg.params) return;
		if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) logs.push((msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '));
		if (msg.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
	};
	await send('Page.enable'); await send('Runtime.enable');
	return child;
}

async function js(expression, opts = {}) {
	try { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: !!opts.awaitPromise }); if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0] }; return r.result?.value; }
	catch (e) { return { __err: String(e.message).slice(0, 200) }; }
}
async function goto(url) { await send('Page.navigate', { url }); for (let i = 0; i < 60; i++) { if ((await js('document.readyState')) === 'complete') break; await sleep(300); } await sleep(1500); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }); fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); log('shot →', name); }

async function login() {
	await js(`(() => { const f = document.getElementById('authLoginForm'); f.querySelector('[data-auth="username"]').value = ${JSON.stringify(ADMIN.user)}; f.querySelector('[data-auth="password"]').value = ${JSON.stringify(ADMIN.pass)}; f.requestSubmit(); return 'ok'; })()`);
	await sleep(5000);
}

const INJECT = `(() => {
  const now = Date.now();
  const DEVICES = [
    { id: 'dev-1', device_key: 'lab-pc-1', hostname: 'Lab A - PC 01', note: null, device_type: 'desktop', platform: 'Windows 11', last_ip: '192.168.1.21', status: 'allowed', assigned_user_id: 'stu-1', assignedUser: { id: 'stu-1', name: 'Sara Bennani', username: 's.bennani', role: 'student' }, last_seen: new Date(now - 120000).toISOString() },
    { id: 'dev-2', device_key: 'lab-pc-2', hostname: 'Lab A - PC 02', note: null, device_type: 'desktop', platform: 'Windows 11', last_ip: '192.168.1.22', status: 'blocked', assigned_user_id: 'stu-2', assignedUser: { id: 'stu-2', name: 'Omar Idrissi', username: 'o.idrissi', role: 'student' }, last_seen: new Date(now - 600000).toISOString() },
    { id: 'dev-3', device_key: 'teacher-pc', hostname: 'Salle des profs', note: null, device_type: 'desktop', platform: 'Windows 10', last_ip: '192.168.1.10', status: 'allowed', assigned_user_id: 'tea-1', assignedUser: { id: 'tea-1', name: 'Hicham Taybi', username: 'h.taybi', role: 'teacher' }, last_seen: new Date(now - 30000).toISOString() }
  ];
  const LIVE = [
    { user: { id: 'stu-1', name: 'Sara Bennani', username: 's.bennani', role: 'student' }, sessions: [ { id: 's1', created_at: new Date(now - 120000).toISOString(), ip_address: '192.168.1.21', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0' } ] },
    { user: { id: 'tea-1', name: 'Hicham Taybi', username: 'h.taybi', role: 'teacher' }, sessions: [ { id: 's4', created_at: new Date(now - 30000).toISOString(), ip_address: '192.168.1.10', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120.0' } ] }
  ];
  window.fetch = function (url) {
    url = String(url); var body = {};
    if (url.indexOf('/users') !== -1) body = { data: [{ id: 'stu-1', name: 'Sara Bennani', username: 's.bennani' }, { id: 'stu-2', name: 'Omar Idrissi', username: 'o.idrissi' }], total: 2 };
    else if (url.indexOf('/sessions/live') !== -1) body = LIVE;
    else if (url.indexOf('/devices') !== -1) body = DEVICES;
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(body); } });
  };
  return 'injected';
})()`;

const probe = `JSON.stringify((() => {
  const sub = document.querySelector('tr.device-sessions-subrow');
  const list = document.getElementById('devicesMobileList');
  const table = document.getElementById('devicesTable');
  const cs = el => el ? getComputedStyle(el).display : 'n/a';
  const box = el => { if (!el) return 'n/a'; const r = el.getBoundingClientRect(); return Math.round(r.width)+'x'+Math.round(r.height); };
  const sec = document.getElementById('devices');
  return { sectionActive: sec ? sec.classList.contains('active') : false, rows: document.querySelectorAll('tr.device-card').length, subrows: document.querySelectorAll('tr.device-sessions-subrow').length, subExpanded: sub ? sub.classList.contains('is-expanded') : 'none', subDisplay: cs(sub), subBox: box(sub), tableDisplay: cs(table), mobileListDisplay: cs(list), mcards: document.querySelectorAll('.device-mcard').length, dmSessions: document.querySelectorAll('.dm-sessions').length, bodyScrollW: document.documentElement.scrollWidth, viewportW: window.innerWidth };
})())`;

async function main() {
	const child = await connect();
	await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
	await goto(`${BASE}/admin.html`);
	await login();
	await goto(`${BASE}/admin.html`);
	await sleep(2500);

	await js(`(() => { const b = document.querySelector('.nav-tab[data-tab="devices"]'); if (!b) return 'no-tab'; b.click(); return 'ok'; })()`);
	await sleep(2500);
	log('after open tab', await js(probe));

	await js(INJECT);
	await js('window.ClassroomDevices.refresh()');
	await sleep(1500);
	log('DESKTOP collapsed (injected)', await js(probe));
	await shot('cdreal-desktop-1.png');

	await js(`document.querySelector('tr.device-card').click()`);
	await sleep(500);
	log('DESKTOP expanded', await js(probe));
	await shot('cdreal-desktop-2-expanded.png');

	await js(`document.querySelector('tr.device-card').click()`);
	await sleep(400);
	log('DESKTOP collapsed again', await js(probe));

	await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
	await sleep(500);
	await js('window.ClassroomDevices.filter()');
	await sleep(500);
	log('MOBILE', await js(probe));
	await shot('cdreal-mobile-1.png');

	await js(`window.ClassroomDevices.toggleSessions('dev-1')`);
	await sleep(300);
	await js('window.ClassroomDevices.filter()');
	await sleep(400);
	log('MOBILE expanded', await js(probe));
	await shot('cdreal-mobile-2-expanded.png');

	console.log('\nCONSOLE(filtered):', [...new Set(logs)].filter((l) => /device|classroom|Classroom|Uncaught|EXCEPTION/i.test(l)).slice(0, 30).join('\n') || '(none)');
	try { ws.close(); } catch (_) {}
	child.kill();
}
main().catch((e) => { console.error('RUNNER ERROR:', e); try { ws && ws.close(); } catch (_) {}; process.exit(1); });
