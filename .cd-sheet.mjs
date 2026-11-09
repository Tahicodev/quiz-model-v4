import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9347;
const PROFILE = path.resolve('.zcode', 'cd-sheet-profile');
const OUT = path.resolve('.zcode');
const BASE = 'http://127.0.0.1:3000';
const ADMIN = { user: 'zz_verify_admin', pass: 'verify1234' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, msgId = 0; const pending = new Map();
function send(method, params = {}) { return new Promise((resolve, reject) => { const id = ++msgId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); }); }
async function connect() {
	fs.rmSync(PROFILE, { recursive: true, force: true }); fs.mkdirSync(PROFILE, { recursive: true });
	const child = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
	let target = null;
	for (let i = 0; i < 60 && !target; i++) { await sleep(500); try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()); target = l.find(t => t.type === 'page'); } catch (_) {} }
	ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
	await send('Page.enable'); await send('Runtime.enable'); return child;
}
async function js(e) { try { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.exceptionDetails ? { __err: r.exceptionDetails.text } : r.result?.value; } catch (e) { return { __err: String(e.message) }; } }
async function goto(u) { await send('Page.navigate', { url: u }); for (let i = 0; i < 60; i++) { if ((await js('document.readyState')) === 'complete') break; await sleep(300); } await sleep(1200); }
async function shot(n, beyond) { const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!beyond }); fs.writeFileSync(path.join(OUT, n), Buffer.from(r.data, 'base64')); }

async function main() {
	const child = await connect();
	await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
	await goto(`${BASE}/admin.html`);
	await js(`(() => { const f = document.getElementById('authLoginForm'); f.querySelector('[data-auth="username"]').value = ${JSON.stringify(ADMIN.user)}; f.querySelector('[data-auth="password"]').value = ${JSON.stringify(ADMIN.pass)}; f.requestSubmit(); return 1; })()`);
	await sleep(5000);
	await goto(`${BASE}/admin.html`);
	await sleep(2500);
	await js(`(() => { const b = document.querySelector('.nav-tab[data-tab="devices"]'); if (b) b.click(); return 1; })()`);
	await sleep(2500);
	const sheet = `JSON.stringify((() => { const s = document.getElementById('mobileActionSheet'); if (!s) return 'no-el'; const cs = getComputedStyle(s); const r = s.getBoundingClientRect(); return { cls: s.className, display: cs.display, visibility: cs.visibility, opacity: cs.opacity, rect: Math.round(r.width)+'x'+Math.round(r.height)+'@'+Math.round(r.top), bodyCls: document.body.className, htmlCls: document.documentElement.className }; })())`;
	console.log('SHEET after open', await js(sheet));
	await shot('cdsheet-desktop.png', false);
	await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
	await sleep(800);
	console.log('SHEET mobile', await js(sheet));
	await shot('cdsheet-mobile.png', false);
	try { ws.close(); } catch (_) {} child.kill();
}
main().catch((e) => { console.error(e); process.exit(1); });
