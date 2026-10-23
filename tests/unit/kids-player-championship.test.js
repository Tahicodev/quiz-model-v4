// @vitest-environment jsdom
/**
 * Bridge A — how a kid "passes into" a championship from the game itself.
 *
 * The whole server side of this already existed: the session-complete PATCH
 * only writes a championship score because the client echoes `championship_id`.
 * So these tests cover the one thing that was missing — how the player decides
 * which championship (if any) a run belongs to, and what it remembers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KIDS = path.resolve(__dirname, '../../public/kids');
const STORE_SRC = readFileSync(path.join(KIDS, 'kids-store.js'), 'utf8');
const PLAYER_SRC = readFileSync(path.join(KIDS, 'kids-player.js'), 'utf8');

function fakeJwt(expSeconds = 3600) {
	const b64 = (o) => window.btoa(JSON.stringify(o)).replace(/=+$/, '');
	return [b64({ alg: 'HS256', typ: 'JWT' }), b64({ id: 'u1', role: 'student', exp: Math.floor(Date.now() / 1000) + expSeconds }), 'sig'].join('.');
}

function loadPlayer({ withStore = true } = {}) {
	document.body.className = 'kid-body';
	document.body.innerHTML = `
		<div class="kid-wrap">
			<div class="kid-header">
				<div id="kidMascot" class="kid-mascot" aria-hidden="true">🦊</div>
				<div class="kid-title"><h1 id="kidGameName"></h1><p id="kidGameSub"></p></div>
				<div class="spacer"></div>
				<button id="kidSoundBtn" class="kid-sound-btn" aria-label="sound">🔊</button>
			</div>
			<div class="kid-progress" id="kidProgress" hidden>
				<span id="kidProgressLabel">1/1</span>
				<div class="kid-progress-bar"><div id="kidProgressFill" class="kid-progress-fill"></div></div>
			</div>
			<div id="kidScreen"></div>
		</div>
		<div class="kid-stars-rain" id="kidStarsRain" hidden></div>`;
	if (withStore) window.eval(STORE_SRC);
	else delete window.KidsStore;
	window.eval(PLAYER_SRC);
	return window.KidsPlayerEngine;
}

beforeEach(() => {
	window.history.replaceState(null, '', '/kids/play/MQTS');
	localStorage.clear();
	sessionStorage.clear();
	vi.restoreAllMocks();
	vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue();
});

afterEach(() => {
	delete window.KidsStore;
});

describe('which championship the run belongs to', () => {
	it('a ?championship= link wins over anything remembered', () => {
		const engine = loadPlayer();
		window.history.replaceState(null, '', '/kids/play/MQTS?championship=c-link');
		window.KidsStore.setRun('c-run');
		expect(engine.championshipFromUrl()).toBe('c-link');
	});

	it('remembers the run chosen on the offer screen (no URL parameter)', () => {
		const engine = loadPlayer();
		expect(engine.championshipFromUrl()).toBe(null);
		window.KidsStore.setRun('c-run');
		expect(engine.championshipFromUrl()).toBe('c-run');
		// and it survives a fresh engine, because it lives in sessionStorage
		const again = loadPlayer();
		expect(again.championshipFromUrl()).toBe('c-run');
	});

	it('still works on a page running without the shared store', () => {
		const engine = loadPlayer({ withStore: false });
		expect(window.KidsStore).toBe(undefined);
		sessionStorage.setItem('kidChampionshipRun', 'c-raw');
		expect(engine.championshipFromUrl()).toBe('c-raw');
	});

	it('reads game_ids whether the transport sends a JSON string or an array', () => {
		const engine = loadPlayer();
		expect(engine.championshipGameIds({ game_ids: '["g1","g2"]' })).toEqual(['g1', 'g2']);
		expect(engine.championshipGameIds({ game_ids: ['g1'] })).toEqual(['g1']);
		// anything unusable resolves to [] instead of throwing mid-game
		expect(engine.championshipGameIds({ game_ids: 'not json' })).toEqual([]);
		expect(engine.championshipGameIds({})).toEqual([]);
		expect(engine.championshipGameIds(null)).toEqual([]);
	});
});

describe('discovering the championships a game is in', () => {
	it('asks the browse endpoint with the student token and keeps only real matches', async () => {
		const engine = loadPlayer();
		engine.game = { id: 'g1' };
		localStorage.setItem('quizAuthToken:student', fakeJwt());
		const fetchMock = vi.fn(async (url) => ({
			ok: true,
			json: async () => ({
				data: [
					{ id: 'c-1', name: 'Jungle Cup', emoji: '🌴', code: 'x9y8', game_ids: '["g1","g9"]' },
					{ id: 'c-2', name: 'Space Cup', game_ids: ['g7'] },
				],
			}),
		}));
		window.fetch = fetchMock;

		const list = await engine.detectChampionship();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toContain('/championships/browse?status=active');
		expect(fetchMock.mock.calls[0][1].headers.Authorization).toContain('Bearer ');
		// only the championship that really contains this game, normalized
		expect(list).toEqual([{ id: 'c-1', name: 'Jungle Cup', emoji: '🌴', code: 'X9Y8' }]);
	});

	it('never blocks play: no token, 401 or a broken response all resolve to []', async () => {
		const engine = loadPlayer();
		engine.game = { id: 'g1' };
		const fetchMock = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
		window.fetch = fetchMock;
		expect(await engine.detectChampionship()).toEqual([]);
		expect(fetchMock).not.toHaveBeenCalled(); // no token → no request at all

		localStorage.setItem('quizAuthToken:student', fakeJwt());
		expect(await engine.detectChampionship()).toEqual([]);

		window.fetch = vi.fn(async () => { throw new Error('offline'); });
		expect(await engine.detectChampionship()).toEqual([]);
	});
});

describe('naming the championship a run belongs to', () => {
	it('uses what the lobby already remembered, with no request', async () => {
		const engine = loadPlayer();
		window.KidsStore.setChampionship({ id: 'c-1', name: 'Jungle Cup', emoji: '🌴', code: 'X9Y8' });
		const fetchMock = vi.fn();
		window.fetch = fetchMock;

		const info = await engine.resolveChampInfo('c-1');
		expect(fetchMock).not.toHaveBeenCalled();
		expect(info.name).toBe('Jungle Cup');
		expect(engine.championshipBadge()).toContain('Jungle Cup');
		expect(engine.championshipBadge()).toContain('🌴');
	});

	it('falls back to the public view endpoint and caches the answer', async () => {
		const engine = loadPlayer();
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({ id: 'c-9', name: 'Space Cup', emoji: '🚀', code: 'x9y8' }),
		}));
		window.fetch = fetchMock;

		const info = await engine.resolveChampInfo('c-9');
		expect(fetchMock.mock.calls[0][0]).toContain('/championships/view/c-9');
		expect(info).toEqual({ id: 'c-9', name: 'Space Cup', emoji: '🚀', code: 'X9Y8' });
		// the hub and the next game reuse it
		expect(window.KidsStore.championship().name).toBe('Space Cup');
		// a second call is served from memory
		await engine.resolveChampInfo('c-9');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('says something generic rather than nothing when the name is unknown', () => {
		const engine = loadPlayer();
		expect(engine.championshipBadge()).toContain('Kids Championship');
	});
});

describe('the offer screen', () => {
	it('"Yes, count my score" records the run and the championship', () => {
		const engine = loadPlayer();
		engine.createSession = vi.fn();
		engine.offerChampionship([{ id: 'c-1', name: 'Jungle Cup', emoji: '🌴' }]);

		const screen = document.getElementById('kidScreen');
		expect(screen.textContent).toContain('This game counts for');
		expect(screen.textContent).toContain('Jungle Cup');
		document.getElementById('kidChampYes').click();
		expect(engine.createSession).toHaveBeenCalledTimes(1);
		expect(window.KidsStore.run()).toBe('c-1');
		expect(window.KidsStore.championship()).toEqual(expect.objectContaining({ id: 'c-1', name: 'Jungle Cup', emoji: '🌴' }));
	});

	it('"Just play" clears any previous choice and starts the game anyway', () => {
		const engine = loadPlayer();
		window.KidsStore.setRun('c-old');
		engine.createSession = vi.fn();
		engine.offerChampionship([{ id: 'c-1', name: 'Jungle Cup', emoji: '🌴' }]);
		document.getElementById('kidChampNo').click();
		expect(engine.createSession).toHaveBeenCalledTimes(1);
		expect(engine.championshipFromUrl()).toBe(null);
	});

	it('lets the kid choose when a game is a challenge in several championships', () => {
		const engine = loadPlayer();
		engine.createSession = vi.fn();
		engine.offerChampionship([
			{ id: 'c-1', name: 'Jungle Cup', emoji: '🌴' },
			{ id: 'c-2', name: 'Space Cup', emoji: '🚀' },
		]);
		const chips = [...document.querySelectorAll('.kid-champ-chip')];
		expect(chips.map((c) => c.textContent)).toEqual(['🌴 Jungle Cup', '🚀 Space Cup']);
		expect(document.getElementById('kidChampYes')).toBe(null); // no single default to confirm
		chips[1].click();
		expect(window.KidsStore.run()).toBe('c-2');
		expect(engine.createSession).toHaveBeenCalledTimes(1);
	});
});
