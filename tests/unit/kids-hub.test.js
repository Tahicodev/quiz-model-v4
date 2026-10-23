// @vitest-environment jsdom
/**
 * The /kids/ hub — the real page markup, the real scripts.
 *
 * The DOM is parsed from public/kids/index.html itself, so this suite fails if
 * the page and the script drift apart (a renamed id, a forgotten script tag, a
 * store loaded after the module that needs it).
 *
 * Note: jsdom cannot navigate, so a click that walks through a door is asserted
 * through what the handler does *just before* it navigates — the sanitized code
 * it hands to the shared store — plus the pure URL builders it navigates with.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KIDS_DIR = path.resolve(__dirname, '../../public/kids');
const INDEX_HTML = readFileSync(path.join(KIDS_DIR, 'index.html'), 'utf8');
const BODY_HTML = new DOMParser().parseFromString(INDEX_HTML, 'text/html').body.innerHTML;
const STORE_SRC = readFileSync(path.join(KIDS_DIR, 'kids-store.js'), 'utf8');
const HUB_SRC = readFileSync(path.join(KIDS_DIR, 'kids-hub.js'), 'utf8');

function $(id) { return document.getElementById(id); }
function type(input, value) {
	input.value = value;
	input.dispatchEvent(new window.Event('input'));
}

/** Boot the page the way the browser does: markup, then the store, then the hub. */
function loadPage(seed = {}) {
	document.body.innerHTML = BODY_HTML;
	localStorage.clear();
	sessionStorage.clear();
	if (seed.championship) localStorage.setItem('kidChampionship', JSON.stringify(seed.championship));
	if (seed.recent) localStorage.setItem('kidRecentGames', JSON.stringify(seed.recent));
	if (seed.muted) localStorage.setItem('kidSoundMuted', '1');
	window.eval(STORE_SRC);
	window.eval(HUB_SRC); // runs init() on a ready document
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe('page ↔ script contract', () => {
	it('every element the hub reaches for exists in index.html', () => {
		const ids = new Set();
		HUB_SRC.replace(/\$\('([A-Za-z0-9_-]+)'\)/g, (_, id) => { ids.add(id); return _; });
		expect(ids.size).toBeGreaterThan(8);
		// these three are built by the hub itself (greeting button, championship
		// shortcut), so they are deliberately absent from the page markup
		const runtimeIds = new Set(['hubChangeBtn', 'hubMineGo', 'hubMineForget']);
		const missing = [...ids].filter((id) => !runtimeIds.has(id) && !new RegExp('id="' + id + '"').test(INDEX_HTML));
		expect(missing).toEqual([]);
	});

	it('loads the shared store before the hub, and both with the same cache-buster', () => {
		const store = INDEX_HTML.indexOf('kids-store.js');
		const hub = INDEX_HTML.indexOf('kids-hub.js');
		expect(store).toBeGreaterThan(-1);
		expect(hub).toBeGreaterThan(store);
		const versions = [...INDEX_HTML.matchAll(/\/kids\/(?:kids-store|kids-hub)\.js\?v=([^"]+)/g)].map((m) => m[1]);
		expect(new Set(versions).size).toBe(1);
	});

	it('keeps the original play contract: 4 chars, /kids/play/<PIN>', () => {
		loadPage();
		expect(window.KidsHub.sanitize('b7k2')).toBe('B7K2');
		expect(window.KidsHub.sanitize(' ab1! ')).toBe('AB'); // 0/1 and symbols can never match
		expect(window.KidsHub.isComplete('B7K2')).toBe(true);
		expect(window.KidsHub.isComplete('ABC')).toBe(false);
		expect(window.KidsHub.isComplete('ab1!')).toBe(false);
		expect(window.KidsHub.isComplete('B7K')).toBe(false);
		expect(window.KidsHub.playTarget('b7k2')).toBe('/kids/play/B7K2');
		expect(window.KidsHub.championshipTarget('xy7z')).toBe('/kids/championship?code=XY7Z');
		expect(window.KidsHub.championshipById('c-1')).toBe('/kids/championship?id=c-1');
	});
});

describe('door 1 — play a game', () => {
	it('says something kind when the code is too short, then lets a real code through', () => {
		loadPage();
		const remember = vi.spyOn(window.KidsStore, 'rememberGame');
		const pin = $('pinInput');
		const go = $('pinGoBtn');

		type(pin, 'ab1!');
		expect(pin.value).toBe('AB'); // filtered as it is typed
		expect(go.classList.contains('ready')).toBe(false);
		go.click();
		expect($('pinError').textContent).toBe('Oops! A game code has 4 letters or numbers 🔤');
		expect(remember).not.toHaveBeenCalled();
		// the reminder is loud but not rude: the door also shakes
		const door = pin.closest('.kid-hub-door');
		expect(door.classList.contains('kid-hub-shake')).toBe(true);

		type(pin, 'b7k2');
		expect(pin.value).toBe('B7K2');
		expect(go.classList.contains('ready')).toBe(true);
		go.click();
		expect($('pinError').textContent).toBe('');
		// the handler got all the way to its commit step, with the sanitized code
		expect(remember).toHaveBeenCalledWith(expect.objectContaining({ pin: 'B7K2', icon: '🎮' }));
	});

	it('submits on Enter without a mouse', () => {
		loadPage();
		const remember = vi.spyOn(window.KidsStore, 'rememberGame');
		const pin = $('pinInput');
		type(pin, 'x9y8');
		pin.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		expect(remember).toHaveBeenCalledWith(expect.objectContaining({ pin: 'X9Y8' }));
	});

	it('shows the codes already played, one tap to replay', () => {
		loadPage();
		window.KidsStore.rememberGame({ pin: 'B7K2', name: 'Jungle Maths', icon: '🦖' });
		window.KidsStore.rememberGame({ pin: 'Q4ZP', name: 'Stars', icon: '🌟' });
		window.KidsHub.renderRecent();
		const chips = [...$('hubRecent').querySelectorAll('[data-pin]')];
		expect(chips[0].dataset.pin).toBe('Q4ZP'); // newest first
		expect(chips[0].textContent).toContain('🌟 Stars');
		expect(chips[1].textContent).toContain('🦖 Jungle Maths');
		expect(window.KidsStore.recentGames().length).toBe(2);
	});
});

describe('door 2 — championship', () => {
	it('takes the same 4-character class code', () => {
		loadPage();
		const go = $('champGoBtn');
		type($('champCodeInput'), 'zz');
		go.click();
		expect($('champError').textContent).toBe('Oops! A class code has 4 letters or numbers 🔤');
		type($('champCodeInput'), 'X9Y8');
		expect(go.classList.contains('ready')).toBe(true);
		expect($('champError').textContent).toBe('');
		expect(window.KidsHub.championshipTarget('X9Y8')).toBe('/kids/championship?code=X9Y8');
	});

	it('shows "my championship" with the standing, and can be left behind', () => {
		loadPage({
			championship: { id: 'c-1', code: 'X9Y8', name: 'Jungle Cup', emoji: '🌴', rank: 2, points: 240 },
		});
		const mine = $('hubMine');
		expect(mine.hidden).toBe(false);
		expect(mine.textContent).toContain('🌴');
		expect(mine.textContent).toContain('Jungle Cup');
		expect(mine.querySelector('.standing').textContent).toContain('🥈 #2 · 240 pts');
		expect($('hubMineGo').textContent).toContain('Back in');
		// the class code is already in the second door, so one tap re-enters
		expect($('champCodeInput').value).toBe('X9Y8');
		expect($('champGoBtn').classList.contains('ready')).toBe(true);

		$('hubMineForget').click();
		expect(mine.hidden).toBe(true);
		expect(window.KidsStore.championship()).toBe(null);
	});

	it('invites a fresh code when no championship is remembered yet', () => {
		loadPage();
		expect($('hubMine').hidden).toBe(true);
		expect($('hubChampField').hidden).toBe(false);
		expect($('hubChampLink').hidden).toBe(false);
		expect($('champCodeInput').value).toBe('');
	});
});

describe('who is playing', () => {
	it('greets a new kid, then remembers the name and animal for the game', () => {
		loadPage();
		expect($('hubGreeting').textContent).toContain('Hi there!');
		expect($('hubGreeting').textContent).toContain('pick your name and animal');

		$('hubChangeBtn').click();
		const panel = $('hubIdentity');
		expect(panel.hidden).toBe(false);
		const avatars = panel.querySelectorAll('.kid-avatar');
		expect(avatars.length).toBe(window.KidsStore.AVATARS.length);
		expect(avatars.length).toBe(10);
		// an empty name is refused with an encouraging line
		$('hubSaveBtn').click();
		expect($('hubIdentityErr').textContent).toContain('Tell me your name');
		expect(panel.hidden).toBe(false);

		avatars[3].click();
		$('hubNameInput').value = 'Lina';
		$('hubSaveBtn').click();
		expect(panel.hidden).toBe(true);
		expect($('hubGreeting').textContent).toContain('Hi, Lina! 👋');
		expect($('hubGreeting').textContent).toContain(window.KidsStore.AVATARS[3]);
		// written through the shared store, so the player and lobby reuse it
		expect(window.KidsStore.player()).toEqual({ name: 'Lina', avatar: window.KidsStore.AVATARS[3] });
		// ...and mirrored to the legacy keys as plain strings (old cached pages)
		expect(localStorage.getItem('kidAvatar')).toBe(window.KidsStore.AVATARS[3]);
		expect(JSON.parse(localStorage.getItem('kidChampionshipPlayer')))
			.toEqual({ name: 'Lina', avatar: window.KidsStore.AVATARS[3] });
	});

	it('greets a returning kid from the store without asking again', () => {
		loadPage();
		window.KidsStore.setPlayer({ name: 'Amir', avatar: '🐼' });
		window.KidsHub.renderGreeting();
		expect($('hubGreeting').textContent).toContain('Hi, Amir! 👋');
		expect($('hubGreeting').textContent).toContain('🐼');
		expect($('hubChangeBtn').textContent).toContain('Change');
	});
});

describe('sound', () => {
	it('remembers the choice for the game screen too', () => {
		// jsdom has no audio device; the blip on un-mute is best-effort in the page
		vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue();
		loadPage();
		const btn = $('hubSoundBtn');
		expect(btn.textContent).toBe('🔊');
		btn.click();
		expect(btn.textContent).toBe('🔇');
		expect(btn.getAttribute('aria-pressed')).toBe('true');
		expect(localStorage.getItem('kidSoundMuted')).toBe('1');
		btn.click();
		expect(btn.textContent).toBe('🔊');
		expect(localStorage.getItem('kidSoundMuted')).toBe('0');
	});

	it('picks up a mute set by the player and stays muted on load', () => {
		loadPage({ muted: true });
		expect($('hubSoundBtn').textContent).toBe('🔇');
		expect($('hubSoundBtn').getAttribute('aria-pressed')).toBe('true');
	});
});
