import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';

const html = readFileSync('./admin.html', 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/' });
const { window } = dom;
global.window = window;
global.document = window.document;
global.localStorage = window.localStorage;
global.confirm = () => true;
window.Element.prototype.scrollIntoView = function () {};

const stubSrc = `
var document = window.document;
var localStorage = window.localStorage;
var confirm = function () { return true; };
var CSS = window.CSS || { escape: function (s) { return String(s); } };
var showToast = function (msg, type) { (window.__toasts = window.__toasts || []).push({ msg: msg, type: type }); };
var escapeHtml = function (s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
var GameCore = {
	getQuizGames: function () { return []; },
	getGameById: function () { return null; },
	normalizeGame: function (g) { return g; },
	saveQuizGames: function () {},
	getGamePairing: function () { return null; },
	nowIso: function () { return new Date().toISOString(); },
};
`;
const toasts = [];
window.__toasts = toasts;
window.Auth = {
	isAdmin: () => true,
	isTeacher: () => false,
	getCurrentUser: () => ({ id: 't1', role: 'admin' }),
	canAccessItem: () => true,
};
window.__DI_CONTAINER__ = {
	repo: {
		getAll_sync: (k) =>
			k === 'classes' ? [{ id: 'class-1', name: 'Class A' }] : [],
		setAll_sync: () => {},
	},
};
const apiCalls = [];
window.API = {
	list: async (entity) => {
		apiCalls.push({ op: 'list', entity });
		return [];
	},
	raw: async (method, url, body) => {
		apiCalls.push({ op: 'raw', method, url, body });
		if (method === 'GET' && url.startsWith('/kids/')) {
			return {
				data: [
					{
						id: 'kid-1',
						name: 'Bubble Pop',
						game_type: 'bubble-pop',
						status: 'published',
						grade: 'cp',
						config_json: JSON.stringify({ time_per_q: 20 }),
					},
					{
						id: 'kid-2',
						name: 'Star Collector',
						game_type: 'star-collector',
						status: 'draft',
						config_json: null,
					},
				],
				total: 2,
			};
		}
		return { ok: true };
	},
};

window.eval(stubSrc + '\n' + readFileSync('./games-management.js', 'utf8'));
window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
await new Promise((r) => setTimeout(r, 100));

window.openClassGamesModal('class-1');
await new Promise((r) => setTimeout(r, 150));
const modal = window.document.getElementById('classGamesModal');
const pickerText = modal
	.querySelector('.class-games-picker select')
	.innerHTML.replace(/\s+/g, ' ')
	.trim();
console.log('picker:', pickerText);

const ok = await window.assignGameToClass('class-1', 'kid-1');
const patch = apiCalls.find(
	(c) => c.op === 'raw' && c.method === 'PATCH' && c.url.includes('/kids/kid-1'),
);
console.log('assign returned:', ok);
console.log('PATCH body:', JSON.stringify(patch?.body));
console.log('toasts:', JSON.stringify(toasts));
const assigned = modal
	.querySelector('.class-games-assigned')
	.textContent.replace(/\s+/g, ' ')
	.trim();
console.log('assigned list:', assigned);

// Remove again
const okRm = await window.removeGameFromClass('class-1', 'kid-1');
const patchRm = apiCalls.filter(
	(c) => c.op === 'raw' && c.method === 'PATCH' && c.url.includes('/kids/kid-1'),
);
console.log('remove returned:', okRm, '| PATCH count:', patchRm.length);
console.log('last PATCH body:', JSON.stringify(patchRm[patchRm.length - 1]?.body));
process.exit(0);
