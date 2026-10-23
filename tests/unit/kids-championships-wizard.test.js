// @vitest-environment jsdom
/**
 * Bridge D — the publish step hands the freshly published game to the
 * championship wizard: `openCreate({ gameIds, name })`.
 *
 * Two things can go wrong here and both are covered: the preset could be lost
 * (the game arrives unticked) or a plain click could be mistaken for a preset
 * (`addEventListener('click', openCreate)` passes a MouseEvent with no
 * `gameIds`) and silently create a championship around nothing.
 *
 * The modal markup comes from admin.html itself, so this also catches a
 * renamed id in the page.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const ADMIN_HTML = readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
const MODAL_HTML = new DOMParser()
	.parseFromString(ADMIN_HTML, 'text/html')
	.getElementById('kidsChampionshipModal').outerHTML;
const SRC = path.join(ROOT, 'kids-championships-management.js');

const GAMES = [
	{ id: 'g1', name: 'Jungle Maths', game_type: 'bubble-pop', questions_json: '[{"id":"q1"},{"id":"q2"}]', grade: 'cp' },
	{ id: 'g2', name: 'Star Hunt', game_type: 'star-collector', questions_json: '[{"id":"q1"}]', grade: 'ce1' },
];

function $(id) { return document.getElementById(id); }
function panel(n) { return document.querySelector(`.kw-step-panel[data-kc-step="${n}"]`); }
/** openCreate resolves the game list behind a promise chain; let it settle. */
async function settle(times = 8) { for (let i = 0; i < times; i++) await Promise.resolve(); }

beforeEach(() => {
	document.body.innerHTML = `<div id="kidsChampionshipList"></div>${MODAL_HTML}`;
	window.showToast = () => {};
	window.API = { raw: (method, url) => (url.indexOf('/kids?') === 0 ? Promise.resolve({ data: GAMES }) : Promise.resolve({ data: [] })), list: () => Promise.resolve({ data: [] }) };
	window.Auth = { getCurrentUser: () => ({ id: 'u1', role: 'admin' }) };
	window.eval(readFileSync(SRC, 'utf8'));
	// the wizard's buttons are bound on DOMContentLoaded (as in admin.html)
	document.dispatchEvent(new window.Event('DOMContentLoaded'));
});

describe('openCreate with a preset', () => {
	it('prefills the name, ticks the published game and opens on Challenges', async () => {
		window.KidsChampionships.openCreate({ gameIds: ['g1'], name: 'Jungle Maths Championship' });
		await settle();

		expect($('kidsChampionshipModal').classList.contains('active')).toBe(true);
		expect($('kidsChampionshipModalTitle').textContent).toBe('New Championship');
		expect($('kidsChampionshipName').value).toBe('Jungle Maths Championship');
		// the teacher lands on step 2, where the tick already is
		expect(panel(2).classList.contains('active')).toBe(true);
		expect($('kidsChampionshipStepHint').textContent).toBe('Step 2 of 3');
		const picked = document.querySelector('[data-game-check="g1"]');
		expect(picked.checked).toBe(true);
		expect(picked.closest('.kids-championship-game').classList.contains('checked')).toBe(true);
		expect(document.querySelector('[data-game-check="g2"]').checked).toBe(false);
		// and the summary agrees: one challenge, 100 points up for grabs
		expect($('kidsChampionshipCount').textContent).toBe('1 / 8 selected · up to 100 pts');
		expect($('kidsChampionshipPicked').hidden).toBe(false);
		expect($('kidsChampionshipPicked').textContent).toContain('Jungle Maths');
	});

	it('the drafted championship is valid: add a second game and review it', async () => {
		window.KidsChampionships.openCreate({ gameIds: ['g1'], name: 'Jungle Maths Championship' });
		await settle();
		const second = document.querySelector('[data-game-check="g2"]');
		second.checked = true;
		second.dispatchEvent(new window.Event('change'));
		expect($('kidsChampionshipCount').textContent).toBe('2 / 8 selected · up to 200 pts');

		$('kidsChampionshipNextBtn').click(); // 2 → 3
		expect(panel(3).classList.contains('active')).toBe(true);
		const rows = [...$('kidsChampionshipReview').querySelectorAll('.kc-review-row')];
		expect(rows.length).toBe(2);
		expect(rows.map((r) => r.querySelector('.kc-review-name').textContent)).toEqual(['Jungle Maths', 'Star Hunt']);
		expect($('kidsChampionshipReview').textContent).toContain('2 challenges · up to 200 pts total');
		expect($('kidsChampionshipReview').textContent).toContain('A 4-letter join code is generated when you start');
		expect($('saveKidsChampionshipBtn').hidden).toBe(false);
	});

	it('a plain click is not a preset: the wizard opens empty on step 1', async () => {
		const tab = document.createElement('button');
		tab.setAttribute('data-games-studio-tab', 'kids-championships');
		document.body.appendChild(tab);
		window.KidsChampionships.openCreate(new window.MouseEvent('click'));
		await settle();

		expect(panel(1).classList.contains('active')).toBe(true);
		expect($('kidsChampionshipName').value).toBe('');
		expect($('kidsChampionshipPicked').hidden).toBe(true);
		expect($('kidsChampionshipCount').textContent).toBe('0 / 8 selected');
		expect(document.querySelector('[data-game-check="g1"]').checked).toBe(false);
	});

	it('an object that is not a preset preset (no gameIds array, or a real event) is ignored', async () => {
		window.KidsChampionships.openCreate({ gameIds: ['g1'], name: 'Nope', currentTarget: document.body });
		await settle();
		expect(panel(1).classList.contains('active')).toBe(true);
		expect($('kidsChampionshipName').value).toBe('');
		expect(document.querySelector('[data-game-check="g1"]').checked).toBe(false);

		window.KidsChampionships.openCreate({ name: 'Also nope' });
		await settle();
		expect($('kidsChampionshipName').value).toBe('');
		expect(panel(1).classList.contains('active')).toBe(true);
	});

	it('a game that no longer exists is dropped, and stays on step 1 without pretending', async () => {
		window.KidsChampionships.openCreate({ gameIds: ['g-deleted'], name: 'Ghost Cup' });
		await settle();
		expect($('kidsChampionshipName').value).toBe('Ghost Cup');
		// nothing left to challenge → no jump, no phantom chip
		expect(panel(1).classList.contains('active')).toBe(true);
		expect($('kidsChampionshipPicked').hidden).toBe(true);
		expect($('kidsChampionshipCount').textContent).toBe('0 / 8 selected');
		// and the wizard still refuses to go live without a challenge
		$('kidsChampionshipNextBtn').click(); // step 1 is fine: it has a name
		expect(panel(2).classList.contains('active')).toBe(true);
		$('kidsChampionshipNextBtn').click();
		expect(panel(2).classList.contains('active')).toBe(true);
		expect($('kidsChampionshipGamesErr').textContent).toBe('Pick at least one challenge game to continue.');
	});

	it('caps the preset at the 8 challenges the API accepts', async () => {
		const many = Array.from({ length: 12 }, (_, i) => ({ id: 'g' + i, name: 'Game ' + i, game_type: 'bubble-pop', questions_json: '[]' }));
		window.API = { raw: () => Promise.resolve({ data: many }), list: () => Promise.resolve({ data: [] }) };
		window.KidsChampionships.openCreate({ gameIds: many.map((g) => g.id), name: 'Big Cup' });
		await settle();
		expect($('kidsChampionshipCount').textContent).toBe('8 / 8 selected · up to 800 pts');
		expect($('kidsChampionshipCount').classList.contains('full')).toBe(true);
	});
});
