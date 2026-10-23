// @vitest-environment jsdom
/**
 * tests/unit/kids-math-quest-flow.test.js
 *
 * Browser-level regression test for the Math Quest integration:
 *  - all nine kid renderers register (the existing eight stay untouched),
 *  - the math-quest flow renders the adventure map, delegates the level's
 *    questions to the platform's bubble renderer, and reaches the quest
 *    results screen with server-verified score/stars,
 *  - duplicate answer submissions are ignored while locked,
 *  - a failed completion PATCH still lands on an (offline-marked) results
 *    screen,
 *  - the map stays the home screen for replays, minting fresh sessions,
 *  - multi-level: locked→unlocked chain driven by server progress rows and
 *    per-level question scoping (stage 2).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KIDS = path.resolve(__dirname, '../../public/kids');
const SCRIPTS = [
	'kids-player.js',
	'games/BubblePopGame.js',
	'games/StarCollectorGame.js',
	'games/LeapFrogGame.js',
	'games/SortItOutGame.js',
	'games/PairPartyGame.js',
	'games/BuildATowerGame.js',
	'games/MagicWordsGame.js',
	'games/CodeExplorerGame.js',
	'games/math-quest-core.js',
	'games/MathQuestTemplates.js',
	'games/MathQuestGame.js',
];

const QUESTIONS = [
	{ id: 'mq-dev-q1', type: 'multiple-choice', text: '7 + 5 = ?', options_json: '["11","12","13","14"]', answer: '12', points: 1, allows: false },
	{ id: 'mq-dev-q2', type: 'multiple-choice', text: '12 − 4 = ?', options_json: '["6","7","8","9"]', answer: '8', points: 1 },
	{ id: 'mq-dev-q3', type: 'multiple-choice', text: 'Double of 6 = ?', options_json: '["10","12","14","16"]', answer: '12', points: 1 },
];
const ANSWER_KEY = { 'mq-dev-q1': '12', 'mq-dev-q2': '8', 'mq-dev-q3': '12' };
const SINGLE_LEVEL_PLAN = [{ id: 'l1', name: 'Jungle Trail', questions: ['mq-dev-q1', 'mq-dev-q2', 'mq-dev-q3'] }];
const MULTI_LEVEL_PLAN = [
	{ id: 'l1', name: 'Jungle Trail', questions: ['mq-dev-q1'], pass_stars: 1, art: 'home' },
	{ id: 'l2', name: 'Temple Steps', questions: ['mq-dev-q2', 'mq-dev-q3'], pass_stars: 2, art: 'temple' },
];

function fakeJwt() {
	const b64 = (o) => window.btoa(JSON.stringify(o)).replace(/=+$/, '');
	return [b64({ alg: 'HS256', typ: 'JWT' }), b64({ id: 'user-mq', role: 'student', school_id: 'school-test', exp: Math.floor(Date.now() / 1000) + 3600 }), 'sig'].join('.');
}

function gamePayload(multi = false) {
	return {
		id: 'game-mq-1', name: 'Math Quest Jungle Trail', game_type: 'math-quest',
		theme: 'jungle', grade: 'cp', subject: 'Maths',
		questions: QUESTIONS,
		config: { time_per_q: 20, levels: multi ? MULTI_LEVEL_PLAN : SINGLE_LEVEL_PLAN },
	};
}

beforeEach(() => {
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
				<div class="kid-timer"><div class="kid-timer-ring" id="kidTimerRing"><span id="kidTimerNum">15</span></div></div>
			</div>
			<div id="kidScreen"></div>
		</div>
		<div class="kid-stars-rain" id="kidStarsRain" hidden></div>
	`;
	window.history.replaceState(null, '', '/kids/play/MQXT');
	localStorage.clear();
	sessionStorage.clear();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function loadScripts() {
	for (const f of SCRIPTS) {
		const src = readFileSync(path.join(KIDS, f), 'utf8');
		window.eval(src);
	}
}
function setToken() { localStorage.setItem('quizAuthToken:student', fakeJwt()); }
async function settle(times = 12) { for (let i = 0; i < times; i++) await Promise.resolve(); }

/** Server-side grader mirror: exact level set match (or validated hint),
 * level-scoped star denominator, best-stars ratchet over progress rows. */
function makeGrader(multi = false) {
	const plan = multi ? MULTI_LEVEL_PLAN : SINGLE_LEVEL_PLAN;
	const gameCount = QUESTIONS.length;
	const progress = {}; plan.forEach((lv) => { progress[lv.id] = 0; });
	return {
		progress,
		grade(opts) {
			const parsed = opts && opts.body ? JSON.parse(opts.body) : {};
			const answers = JSON.parse(parsed.answers_json || '[]');
			const answered = answers.map((a) => String(a.question_id));
			const answeredSet = new Set(answered);
			let level = plan.find((lv) => lv.questions.length === answeredSet.size &&
				lv.questions.every((id) => answeredSet.has(id))) || null;
			if (!level && parsed.level_id) {
				const hinted = plan.find((lv) => lv.id === parsed.level_id);
				if (hinted && answered.length && answered.every((id) => hinted.questions.includes(id))) level = hinted;
			}
			const scope = level ? level.questions : plan.flatMap((lv) => lv.questions);
			const correct = answers.filter((a) => ANSWER_KEY[String(a.question_id)] === String(a.given)).length;
			const pct = scope.length ? Math.round((correct / scope.length) * 100) : 0;
			const stars = pct >= 90 ? 3 : pct >= 70 ? 2 : pct >= 50 ? 1 : 0;
			const whole = scope.length === gameCount;
			if (level) progress[level.id] = Math.max(progress[level.id], stars);
			return {
				score: correct,
				stars,
				totalPoints: whole ? scope.length : gameCount,
				percent: pct,
				answers,
				quest: level ? {
					level_id: level.id, level_name: level.name, level_total_points: scope.length,
				} : null,
			};
		},
	};
}

/** Installs a fetch mock serving the kids endpoints safely. */
function serveFetch({ patchError = false, multi = false } = {}) {
	let sessionCounter = 0;
	const grader = makeGrader(multi);
	return vi.fn(async (url, opts = {}) => {
		const u = String(url);
		const json = (obj, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => obj });
		if (u.includes('/api/v1/kids/play/MQXT') && !opts.method) return json(gamePayload(multi));
		if (u.includes('/api/v1/kids/games/game-mq-1/quest-progress')) {
			const plan = multi ? MULTI_LEVEL_PLAN : SINGLE_LEVEL_PLAN;
			let prevPassed = true;
			const levels = plan.map((lv, i) => {
				const best = grader.progress[lv.id];
				const unlocked = prevPassed;
				prevPassed = prevPassed && best >= (lv.pass_stars || 1);
				return {
					index: i, id: lv.id, name: lv.name, question_count: lv.questions.length,
					pass_stars: lv.pass_stars || 1, best_stars: best, passed: best >= (lv.pass_stars || 1), unlocked,
				};
			});
			return json({ game_id: 'game-mq-1', levels });
		}
		if (u.includes('/api/v1/kids/games/game-mq-1/session')) {
			return json({ session: { id: 'sess-' + (++sessionCounter) }, totalPoints: 3 });
		}
		if (u.includes('/api/v1/kids/play/session/')) {
			if (patchError) throw new Error('network down');
			return json(grader.grade(opts));
		}
		throw new Error('unexpected fetch ' + u);
	});
}

describe('kid renderer registration (platform unchanged)', () => {
	/** Covers the "eight existing games still register" requirement. */
	it('registers all nine renderers regardless of script order', () => {
		loadScripts();
		const keys = Object.keys(window.KidsGameRenderers);
		for (const k of ['bubble-pop', 'star-collector', 'leap-frog', 'sort-it-out', 'pair-party', 'build-a-tower', 'magic-words', 'code-explorer', 'math-quest']) {
			expect(keys).toContain(k);
		}
		expect(typeof window.KidsGameRenderers['math-quest']).toBe('function');
	});
});

async function boot({ patchError = false, multi = false } = {}) {
	vi.useFakeTimers();
	setToken();
	window.fetch = serveFetch({ patchError, multi });
	loadScripts();
	document.dispatchEvent(new window.Event('DOMContentLoaded'));
	// init → load → welcome(auto) → createSession → (quest) map
	await settle();
	await vi.advanceTimersByTimeAsync(10);
	await settle(20);
	return window.KidsPlayerEngine;
}

/** Answer the current story-cards question: select the option card, then
 * confirm — the MQ presentation layer's select-then-confirm interaction. */
function answerCurrent(correctAnswer) {
	const card = document.querySelector('.mq-card-opt[data-opt="' + correctAnswer + '"]');
	if (!card) throw new Error('no answer card for ' + correctAnswer);
	card.click();
	const confirm = document.querySelector('.mq-confirm');
	if (!confirm || confirm.disabled) throw new Error('confirm not enabled after picking');
	confirm.click();
	return vi.advanceTimersByTimeAsync(300).then(() => settle(24))
		.then(() => vi.advanceTimersByTimeAsync(1650)).then(() => settle(24));
}

describe('math-quest full flow (single level plan, server-verified)', () => {
	it('map → three delegated questions → quest results → back to map with stars', async () => {
		const engine = await boot();

		// 1) The adventure map is the first screen of a fresh session
		const map = document.querySelector('.mq-map');
		expect(map).toBeTruthy();
		// single-scene architecture: the landscape lives on the wrap — no
		// scene-in-a-card, no second header next to Math Quest's own
		const chrome = document.querySelector('.kid-wrap');
		expect(chrome.classList.contains('mq-map-mode')).toBe(true);
		expect(chrome.classList.contains('mq-header-ready')).toBe(true);
		expect(document.querySelector('.mq-map-trail')).toBeNull();
		expect(document.querySelector('.mq-header .mq-player-name').textContent).toBeTruthy();
		expect(document.querySelector('.kid-header')).toBeTruthy(); // shell header hidden by CSS only
		const nodes = document.querySelectorAll('.mq-level-node');
		expect(nodes.length).toBe(1); // explicit teacher plan: one level
		expect(document.querySelector('.mq-level-node.mq-ready .mq-node-name').textContent).toBe('Jungle Trail');

		// 2) Picking the level starts the quiz through the platform pipeline
		document.querySelector('.mq-level-node.mq-ready .mq-node-btn').click();
		await settle(24);
		expect(document.querySelector('.mq-map')).toBeNull();
		// focused quiz: the adventure scene steps aside, compact header shows
		// where the kid is on the quest
		expect(chrome.classList.contains('mq-quiz-mode')).toBe(true);
		expect(chrome.classList.contains('mq-map-mode')).toBe(false);
		expect(document.querySelector('.mq-header .mq-title').textContent).toContain('Level 1 — Jungle Trail');
		expect(document.getElementById('kidProgress').hidden).toBe(false);
		expect(document.getElementById('kidProgressLabel').textContent).toContain('1/3');
		// stage 3: MQ renders its OWN story-cards template (not the bubble game)
		expect(document.querySelector('.mq-panel .mq-scroll')).toBeTruthy();
		expect(document.querySelectorAll('.mq-card-opt').length).toBe(4);
		expect(document.querySelector('.mq-confirm').disabled).toBe(true);

		// 3) Answer three questions (select card → confirm) + feed the timers.
		// The first answer asserts the duplicate-prevention lock WHILE feedback
		// is on screen (before the auto-advance clears `locked` again).
		const firstCard = document.querySelector('.mq-card-opt[data-opt="12"]');
		expect(firstCard, 'answer card for 12').toBeTruthy();
		firstCard.click();
		expect(document.querySelector('.mq-card-opt[aria-pressed="true"]')).toBeTruthy();
		document.querySelector('.mq-confirm').click();
		await vi.advanceTimersByTimeAsync(300);
		await settle(24);
		expect(window.KidsPlayerEngine.locked).toBe(true); // duplicate-prevention lock is up
		expect(document.querySelector('.mq-card-opt.mq-correct')).toBeTruthy(); // feedback on the picked card
		expect(document.querySelector('.mq-card-star')).toBeTruthy(); // mq-star reward art
		await vi.advanceTimersByTimeAsync(1650);
		await settle(24);
		for (let i = 1; i < 3; i++) {
			await answerCurrent(['12', '8', '12'][i]);
		}

		// 4) The results screen shows the SERVER-graded values
		expect(document.querySelector('.mq-results')).toBeTruthy();
		// results live IN the adventure scene (no second background card)
		expect(chrome.classList.contains('mq-map-mode')).toBe(true);
		expect(document.querySelector('.mq-result-bg')).toBeNull();
		expect(document.querySelector('.mq-prop-chest')).toBeTruthy();
		expect(document.querySelector('.mq-result-card h2').textContent).toContain('3 / 3');
		expect(document.querySelector('.mq-result-card .hint').textContent).toContain('server');
		// the PATCH carried the level hint for server-side attribution
		const patchCall = window.fetch.mock.calls.filter((c) => String(c[0]).includes('/play/session/'))[0];
		expect(patchCall).toBeTruthy();
		const body = JSON.parse(patchCall[1].body);
		expect(body.answers_json).toBe(JSON.stringify(engine.answers));
		expect(engine.answers).toHaveLength(3);
		expect(body.level_id).toBe('l1');
	});

	it('ignores duplicate submissions while a question is locked', async () => {
		const engine = await boot();
		document.querySelector('.mq-level-node.mq-ready .mq-node-btn').click();
		await settle(24);
		expect(document.querySelector('.mq-panel')).toBeTruthy(); // stage-3 template live
		const before = engine.answers.length;
		engine.answer('12'); // locked already? not yet locked pre-click — simulate late double call instead
		expect(engine.answers.length).toBe(before + 1);
		engine.answer('11'); // duplicate call must be swallowed by the lock
		expect(engine.answers.length).toBe(before + 1);
	});

	it('falls back to an offline-noted results screen when the PATCH fails', async () => {
		await boot({ patchError: true });
		document.querySelector('.mq-level-node.mq-ready .mq-node-btn').click();
		await settle(24);
		for (let i = 0; i < 3; i++) {
			const card = document.querySelector('.mq-card-opt[data-opt="' + ['12', '8', '12'][i] + '"]');
			if (card) { card.click(); document.querySelector('.mq-confirm').click(); }
			await vi.advanceTimersByTimeAsync(300);
			await settle(24);
			await vi.advanceTimersByTimeAsync(1650);
			await settle(24);
		}
		expect(document.querySelector('.mq-results')).toBeTruthy();
		expect(document.querySelector('.mq-results .hint').textContent).toContain('Offline');
	});

	it('returns to the map after results and replays with a fresh session', async () => {
		const engine = await boot();
		// one full run
		document.querySelector('.mq-level-node.mq-ready .mq-node-btn').click();
		await settle(24);
		const firstSession = engine.sessionId;
		for (let i = 0; i < 3; i++) {
			document.querySelector('.mq-card-opt[data-opt="' + ['12', '8', '12'][i] + '"]').click();
			document.querySelector('.mq-confirm').click();
			await vi.advanceTimersByTimeAsync(300);
			await settle(24);
			await vi.advanceTimersByTimeAsync(1650);
			await settle(24);
		}
		expect(document.querySelector('.mq-results')).toBeTruthy();
		document.getElementById('mqBackToMap').click();
		await settle(12);
		const map = document.querySelector('.mq-map');
		expect(map).toBeTruthy();
		// best stars survived the round-trip (in-session state)
		const litStars = document.querySelectorAll('.mq-level-node .mq-star.lit');
		expect(litStars.length).toBe(3);
		// replay: fresh session id (a completed session can never be regraded), fresh answers
		document.querySelector('.mq-level-node.mq-done .mq-node-btn').click();
		await settle(30);
		expect(engine.sessionId).not.toBe(firstSession);
		expect(engine.answers).toHaveLength(0);
		expect(engine.index).toBe(0);
		expect(document.querySelector('.mq-map')).toBeNull();
	});
});

describe('multi-level adventure (stage 2)', () => {
	it('renders the unlock chain: level 1 playable, level 2 locked behind it', async () => {
		await boot({ multi: true });
		const nodes = document.querySelectorAll('.mq-level-node');
		expect(nodes.length).toBe(2);
		expect(nodes[0].classList.contains('mq-ready')).toBe(true);
		expect(nodes[1].classList.contains('mq-locked')).toBe(true);
		expect(nodes[1].querySelector('.mq-node-btn').disabled).toBe(true);
		expect(nodes[1].textContent).toContain('Pass level 1');
		// every gate carries the gate artwork — locked INCLUDED (greyed gate
		// = the locked metaphor; overlays are dynamic DOM, never baked art)
		expect(document.querySelector('.mq-level-node.mq-ready .mq-node-gate img')).toBeTruthy();
		expect(document.querySelector('.mq-level-node.mq-locked .mq-node-gate img')).toBeTruthy();
		expect(nodes[0].querySelector('.mq-gate-num').textContent).toBe('1');
		expect(nodes[1].querySelector('.mq-gate-num').textContent).toBe('2');
		// the node is one coherent unit: badges live ON the art block, the
		// information plate is a distinct sibling (visible layer separation)
		expect(nodes[0].querySelector('.mq-node-art .mq-node-gate img')).toBeTruthy();
		expect(nodes[0].querySelector('.mq-node-art .mq-gate-num')).toBeTruthy();
		expect(nodes[0].querySelector('.mq-node-plate .mq-node-btn')).toBeTruthy();
		expect(nodes[0].querySelector('.mq-node-plate .mq-gate-num')).toBeNull(); // number is NOT in the plate
		// the old floating thumbnail chips are gone (single dominant scene)
		expect(document.querySelector('.mq-node-thumb')).toBeNull();
	});

	it('scopes level 1 to its own question and unlocks level 2 after passing', async () => {
		const engine = await boot({ multi: true });
		document.querySelector('.mq-level-node.mq-ready .mq-node-btn').click();
		await settle(24);
		// Level 1 plays ONLY its own question (not the whole game payload)
		expect(engine.game.questions).toHaveLength(1);
		expect(document.getElementById('kidProgressLabel').textContent).toContain('1/1');
		await answerCurrent('12');
		expect(document.querySelector('.mq-results')).toBeTruthy();
		expect(document.querySelector('.mq-result-card h2').textContent).toContain('1 / 1');
		expect(document.querySelector('.mq-result-card h2').textContent).toContain('Jungle Trail');

		document.getElementById('mqBackToMap').click();
		await settle(12);
		// server progress rows now show l1 best=3 → the chain opens l2
		const nodes = document.querySelectorAll('.mq-level-node');
		expect(nodes[0].classList.contains('mq-done')).toBe(true);
		expect(nodes[1].classList.contains('mq-locked')).toBe(false);
		expect(nodes[1].querySelector('.mq-node-btn').disabled).toBe(false);
	});

	it('grades level 2 out of its own 2 questions (per-level stars)', async () => {
		const engine = await boot({ multi: true });
		document.querySelectorAll('.mq-level-node .mq-node-btn')[0].click();
		await settle(24);
		await answerCurrent('12'); // l1 → 3⭐
		document.getElementById('mqBackToMap').click();
		await settle(12);

		document.querySelectorAll('.mq-level-node .mq-node-btn')[1].click();
		await settle(24);
		expect(engine.game.questions.map((q) => q.id)).toEqual(['mq-dev-q2', 'mq-dev-q3']);
		expect(document.getElementById('kidProgressLabel').textContent).toContain('1/2');

		await answerCurrent('8');  // q2 correct (1 of 2)
		await answerCurrent('14'); // q3 wrong → 1/2 correct = 50% → 1⭐ (level-scoped, not whole-game)
		expect(document.querySelector('.mq-results')).toBeTruthy();
		expect(document.querySelector('.mq-result-card h2').textContent).toContain('1 / 2');
		expect(document.querySelector('.mq-result-card h2').textContent).toContain('Temple Steps');
		const lit = document.querySelectorAll('.mq-result-card .mq-star.lit');
		expect(lit.length).toBe(1);
	});
});
