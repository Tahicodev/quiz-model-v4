import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9345;
const PROFILE = path.resolve('.zcode', 'cd-check-profile');
const OUT = path.resolve('.zcode');
const FILE = pathToFileURL(path.resolve('.cd-harness.html')).href;

const log = (...a) => console.log('[cd]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, msgId = 0;
const pending = new Map();
const consoleErrors = [];

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
		try {
			const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
			target = list.find((t) => t.type === 'page');
		} catch (_) {}
	}
	if (!target) throw new Error('chrome did not expose a CDP page target');
	ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
	ws.onmessage = (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.id && pending.has(msg.id)) {
			const { resolve, reject } = pending.get(msg.id);
			pending.delete(msg.id);
			msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
			return;
		}
		if (!msg.params) return;
		if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
			consoleErrors.push('CONSOLE ' + (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '));
		}
		if (msg.method === 'Runtime.exceptionThrown') {
			consoleErrors.push('EXCEPTION ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
		}
	};
	await send('Page.enable');
	await send('Runtime.enable');
	return child;
}

async function js(expression, opts = {}) {
	try {
		const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: !!opts.awaitPromise });
		if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').split('\n')[0] };
		return r.result?.value;
	} catch (e) {
		return { __err: String(e.message).slice(0, 200) };
	}
}

async function goto(url) {
	await send('Page.navigate', { url });
	for (let i = 0; i < 40; i++) { if ((await js('document.readyState')) === 'complete') break; await sleep(300); }
	await sleep(800);
}

async function shot(name) {
	const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
	fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
	log('shot →', name);
}

const probe = `JSON.stringify((() => {
  const sub = document.querySelector('tr.device-sessions-subrow');
  const card = document.querySelector('tr.device-card');
  const list = document.getElementById('devicesMobileList');
  const table = document.getElementById('devicesTable');
  const mcard = document.querySelector('.device-mcard');
  const cs = el => el ? getComputedStyle(el).display : 'n/a';
  const box = el => { if (!el) return 'n/a'; const r = el.getBoundingClientRect(); return Math.round(r.width)+'x'+Math.round(r.height); };
  return {
    rows: document.querySelectorAll('tr.device-card').length,
    subrows: document.querySelectorAll('tr.device-sessions-subrow').length,
    subExpanded: sub ? sub.classList.contains('is-expanded') : 'none',
    subDisplay: cs(sub),
    subBox: box(sub),
    cardBox: box(card),
    tableDisplay: cs(table),
    mobileListDisplay: cs(list),
    mcards: document.querySelectorAll('.device-mcard').length,
    mcardBox: box(mcard),
    toggles: document.querySelectorAll('.dm-sessions-toggle').length,
    toggleOpen: !!document.querySelector('.dm-sessions-toggle.is-open'),
    nameW: box(document.querySelector('.device-mcard .device-name')),
    headW: box(document.querySelector('.device-mcard .dm-head')),
    dmSessions: document.querySelectorAll('.dm-sessions').length,
    openCards: document.querySelectorAll('.device-mcard.is-open').length,
    moreBtns: document.querySelectorAll('.device-mcard .dm-more-btn').length,
    sheetOpens: window.__sheetOpens || 0,
    sheetProbe: document.querySelector('#sheet-probe') ? document.querySelector('#sheet-probe').textContent : '',
    bodyScrollW: document.documentElement.scrollWidth,
    viewportW: window.innerWidth
  };
})())`;

async function main() {
	const child = await connect();
	await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
	await goto(FILE);
	await sleep(600);
	log('DESKTOP collapsed', await js(probe));
	await shot('cd-desktop-1-collapsed.png');

	await js(`document.querySelector('tr.device-card .device-expand-btn').click()`);
	await sleep(400);
	log('DESKTOP expanded (button)', await js(probe));
	await shot('cd-desktop-2-expanded.png');

	await js(`document.querySelector('tr.device-card').click()`);
	await sleep(400);
	log('DESKTOP re-collapsed (row)', await js(probe));

	// tablet-ish width in the gap
	await send('Emulation.setDeviceMetricsOverride', { width: 820, height: 900, deviceScaleFactor: 1, mobile: false });
	await sleep(300);
	await js('window.ClassroomDevices.filter()');
	await sleep(300);
	log('TABLET 820', await js(probe));
	await shot('cd-820.png');

	// mobile
	await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
	await sleep(400);
	await js('window.ClassroomDevices.filter()');
	await sleep(400);
	log('MOBILE 390', await js(probe));
	await shot('cd-mobile-1.png');

	await js(`document.querySelector('.device-mcard .device-name').click()`);
	await sleep(400);
	log('MOBILE 390 tapped card → expanded', await js(probe));
	await shot('cd-mobile-2-expanded.png');

	await js(`document.querySelector('.device-mcard .dm-more-btn').click()`);
	await sleep(300);
	log('MOBILE 390 kebab → sheet', await js(probe));

	await js(`document.querySelector('.device-mcard .device-name').click()`);
	await sleep(300);
	log('MOBILE 390 tapped card again → collapsed', await js(probe));

	// narrow phones
	for (const width of [360, 320, 273]) {
		await send('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 2, mobile: true });
		await sleep(350);
		await js('window.ClassroomDevices.filter()');
		await sleep(350);
		log('MOBILE ' + width, await js(probe));
		await shot('cd-mobile-' + width + '.png');
	}

	console.log('\nIMAGE_DIR', OUT);
	console.log('\nCONSOLE:', [...new Set(consoleErrors)].slice(0, 30).join('\n') || '(none)');
	try { ws.close(); } catch (_) {}
	child.kill();
}

main().catch((e) => { console.error('RUNNER ERROR:', e); try { ws && ws.close(); } catch (_) {}; process.exit(1); });
