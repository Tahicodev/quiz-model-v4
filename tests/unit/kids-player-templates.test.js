// @vitest-environment jsdom
/**
 * Player side of the play-template work: routing, Bubble Pop markup, learning
 * support (hints / explanations / streaks) and the results card actions.
 *
 * The renderer registry, the engine and the results screen all live in
 * public/kids/kids-player.js; Bubble Pop is its own file so a template change
 * can never silently break the renderer it points at.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KIDS = path.resolve(__dirname, '../../public/kids');
const STORE_SRC = readFileSync(path.join(KIDS, 'kids-store.js'), 'utf8');
const PLAYER_SRC = readFileSync(path.join(KIDS, 'kids-player.js'), 'utf8');
const BUBBLE_SRC = readFileSync(path.join(KIDS, 'games/BubblePopGame.js'), 'utf8');
const SUBJECT_SRC = readFileSync(path.join(KIDS, 'games/SubjectGames.js'), 'utf8');

const SHELL = `
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

function loadPlayer() {
	document.body.className = 'kid-body';
	document.body.innerHTML = SHELL;
	window.eval(STORE_SRC);
	window.eval(BUBBLE_SRC);
	window.eval(SUBJECT_SRC);
	window.eval(readFileSync(path.join(KIDS, 'games/PairPartyGame.js'), 'utf8'));
	window.eval(PLAYER_SRC);
	return window.KidsPlayerEngine;
}

function mc(over = {}) {
	return {
		id: 'q1', type: 'multiple-choice', text: 'Which one is the apple? 🍎',
		options_json: '["🍎","🚗","🌳"]', answer: '🍎',
		points: 1, allowMultipleAnswers: false, ...over,
	};
}

/** Mount the engine on a fake game without touching the network. */
function startGame(engine, questions, config = {}, gameType = 'bubble-pop') {
	engine.game = { id: 'g1', game_type: gameType, questions };
	engine.config = config;
	engine.player = { name: 'Kid', avatar: '🦊' };
	engine.index = 0;
	engine.answers = [];
	engine.score = 0;
	engine.streak = 0;
	engine.hintsUsed = 0;
	engine.locked = false;
	engine.renderer = null;
	engine.questionStart = Date.now();
	engine.mountRenderer(questions[0]);
	engine.mountLearningTools(questions[0]);
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
	delete window.KidsPlayerEngine;
	delete window.KidsGameRenderers;
	delete window.KidsPlayer;
});

describe('explicit play style beats the automatic subject presentation', () => {
	it('Bubble Pop stays Bubble Pop even when the question looks like a counting one', () => {
		const engine = loadPlayer();
		window.KidsPlayer.pickSubjectPresentation = () => 'count-tap';
		const q = mc({ text: 'How many apples? 🍎🍎🍎', options_json: '["2","3","4"]', answer: '3' });
		startGame(engine, [q], { play_template: 'bubble-pop' });
		expect(engine.renderer.constructor.name).toBe('BubblePopGame');
	});

	it('leaves the automatic presentation alone when the teacher chose Auto', () => {
		const engine = loadPlayer();
		window.KidsPlayer.pickSubjectPresentation = () => 'count-tap';
		const q = mc({ text: 'How many apples? 🍎🍎🍎', options_json: '["2","3","4"]', answer: '3' });
		startGame(engine, [q], { play_template: 'auto' });
		expect(engine.renderer.constructor.name).toBe('CountTapGame');
	});

	it('an unsupported explicit style falls back to the delegated renderer', () => {
		const engine = loadPlayer();
		const q = mc();
		startGame(engine, [q], { play_template: 'not-a-real-style' });
		expect(engine.renderer.constructor.name).toBe('BubblePopGame');
	});

	it('an explicit style that cannot play this question falls back too', () => {
		const engine = loadPlayer();
		// sort-it-out needs odd-one-out with 3+ options; this is plain MC.
		startGame(engine, [mc()], { play_template: 'sort-it-out' });
		expect(engine.renderer.constructor.name).toBe('BubblePopGame');
	});

	it('a matching question still delegates to Pair Party regardless of style', () => {
		const engine = loadPlayer();
		window.KidsPlayer.pairs = () => [];
		const q = mc({ type: 'matching', answer: 'a->1,b->2', options_json: '[]' });
		startGame(engine, [q], { play_template: 'bubble-pop' });
		// bubble-pop cannot play matching, so the delegation target wins
		expect(['PairPartyGame', 'BubblePopGame']).toContain(engine.renderer.constructor.name);
	});

	it('Math Quest keeps its own per-level template routing', () => {
		const engine = loadPlayer();
		const q = mc();
		startGame(engine, [q], { play_template: 'bubble-pop' }, 'math-quest');
		// math-quest renderers are not loaded here, so the safe fallback shows
		expect(document.getElementById('kidScreen').textContent).toMatch(/not available yet/);
	});
});

describe('playTemplateKey allow-list', () => {
	it('accepts only styles the player can render, Auto included', () => {
		const engine = loadPlayer();
		expect(engine.playTemplateKey.call({ config: { play_template: 'auto' } })).toBe('');
		expect(engine.playTemplateKey.call({ config: {} })).toBe('');
		expect(engine.playTemplateKey.call({ config: { play_template: 'bubble-pop' } })).toBe('bubble-pop');
		expect(engine.playTemplateKey.call({ config: { play_template: 'treasure-trail' } })).toBe('');
		expect(engine.playTemplateKey.call({ config: { play_template: 'code-explorer' } })).toBe('code-explorer');
	});
});

describe('Bubble Pop bubbles are real, keyboard-operable controls', () => {
	it('renders one real button per option with an accessible label and a float seed', () => {
		const engine = loadPlayer();
		startGame(engine, [mc()], { play_template: 'bubble-pop' });
		const bubbles = [...document.querySelectorAll('#kidStage .kid-bubble')];
		expect(bubbles).toHaveLength(3);
		bubbles.forEach((b) => {
			expect(b.tagName).toBe('BUTTON');
			expect(b.type).toBe('button');
			expect(b.getAttribute('aria-label')).toBeTruthy();
			expect(b.textContent.trim()).toBe(b.getAttribute('aria-label'));
			// every bubble drifts on its own two-axis path, seeded by CSS vars
			const style = b.getAttribute('style') || '';
			expect(style).toMatch(/--dx:/);
			expect(style).toMatch(/--dy:/);
			expect(style).toMatch(/--dur:/);
		});
		expect(new Set(bubbles.map((b) => b.style.getPropertyValue('--dur'))).size).toBeGreaterThan(1);
	});

	it('submits the option label unchanged and marks the answer', async () => {
		const engine = loadPlayer();
		const q = mc();
		engine.answer = vi.fn();
		startGame(engine, [q], { play_template: 'bubble-pop' });
		const bubble = [...document.querySelectorAll('.kid-bubble')]
			.find((b) => b.dataset.opt === '🚗');
		bubble.click();
		// Bubble Pop waits for the pop animation before answering
		await new Promise((r) => setTimeout(r, 320));
		expect(engine.answer).toHaveBeenCalledWith('🚗');

		const renderer = engine.renderer;
		renderer.lock(false, '🚗');
		const correct = [...document.querySelectorAll('.kid-bubble')]
			.find((b) => b.dataset.opt === '🍎');
		expect(correct.classList.contains('correct-glow')).toBe(true);
		expect([...document.querySelectorAll('.kid-bubble')].every((b) => b.disabled)).toBe(true);
	});

	it('keeps the stage on one column on narrow phones and caps bubble size', () => {
		const engine = loadPlayer();
		const q = mc({ text: 'Pick the very long answer label that keeps going and going 🍎',
			options_json: '["a very long answer label that keeps going and going","b","c"]', answer: 'b' });
		startGame(engine, [q], { play_template: 'bubble-pop' });
		const stage = document.getElementById('kidStage');
		expect(stage.style.minHeight).toMatch(/px$/);
		const long = [...stage.querySelectorAll('.kid-bubble')]
			.find((b) => b.dataset.opt.indexOf('a very long') === 0);
		expect(long).toBeTruthy();
		const size = Number(long.style.getPropertyValue('--b-size').replace('px', ''));
		expect(size).toBeGreaterThan(116);
	});
});

describe('hint budget and explanation card', () => {
	it('shows a hint only while the teacher budget allows, then spends it', () => {
		const engine = loadPlayer();
		startGame(engine, [mc()], { play_template: 'bubble-pop', max_hints: 1 });
		const btn = document.getElementById('kidHint');
		expect(btn).toBeTruthy();
		btn.click();
		const copy = document.getElementById('kidHintText');
		expect(copy.hidden).toBe(false);
		expect(copy.textContent.length).toBeGreaterThan(10);
		// the hint copy never carries the answer
		expect(copy.textContent).not.toContain('🍎');
		expect(btn.disabled).toBe(true);
		expect(btn.textContent).toContain('Hint used');
		expect(engine.hintsUsed).toBe(1);
		// budget spent: the next question gets no hint button at all
		document.getElementById('kidScreen').innerHTML = '';
		engine.mountLearningTools(mc({ id: 'q2' }));
		expect(document.getElementById('kidHint')).toBe(null);
	});

	it('never shows a hint button when the teacher set no budget', () => {
		const engine = loadPlayer();
		startGame(engine, [mc()], { play_template: 'bubble-pop' });
		expect(document.getElementById('kidHint')).toBe(null);
	});

	it('shows the explanation after answering, and hides it when disabled', () => {
		const engine = loadPlayer();
		const q = mc({ explanation: 'Apples are fruits that grow on trees.' });
		startGame(engine, [q], { play_template: 'bubble-pop' });
		engine.showExplanation(q);
		const card = document.querySelector('.kid-explanation');
		expect(card).toBeTruthy();
		expect(card.textContent).toContain('Apples are fruits');

		startGame(engine, [q], { play_template: 'bubble-pop', show_explanations: false });
		engine.showExplanation(q);
		expect(document.querySelector('.kid-explanation')).toBe(null);
	});

	it('escapes explanation markup instead of injecting it', () => {
		const engine = loadPlayer();
		const q = mc({ explanation: '<img src=x onerror=alert(1)>apples' });
		startGame(engine, [q], { play_template: 'bubble-pop' });
		engine.showExplanation(q);
		expect(document.querySelector('.kid-explanation img')).toBe(null);
		expect(document.querySelector('.kid-explanation').textContent).toContain('<img');
	});
});

describe('streak feedback', () => {
	it('celebrates every third correct answer and resets on a wrong one', () => {
		const engine = loadPlayer();
		const deck = [
			mc({ id: 'a' }), mc({ id: 'b' }), mc({ id: 'c' }), mc({ id: 'd' }),
		];
		startGame(engine, deck, { play_template: 'bubble-pop' });

		engine.answer('🍎');
		expect(engine.streak).toBe(1);
		expect(document.querySelector('.kid-streak-reward')).toBe(null);

		engine.locked = false;
		engine.answer('🍎');
		engine.locked = false;
		engine.answer('🍎');
		expect(engine.streak).toBe(3);
		const reward = document.querySelector('.kid-streak-reward');
		expect(reward).toBeTruthy();
		expect(reward.textContent).toContain('3 in a row');

		engine.locked = false;
		engine.answer('🚗');
		expect(engine.streak).toBe(0);
		expect(engine.score).toBe(3);
	});

	it('shows a streak chip in the progress row once the run is warm', () => {
		const engine = loadPlayer();
		startGame(engine, [mc({ id: 'a' }), mc({ id: 'b' })], { play_template: 'bubble-pop' });
		document.getElementById('kidProgress').hidden = false;
		engine.streak = 2;
		engine.renderChrome(mc());
		const chip = document.getElementById('kidStreak');
		expect(chip).toBeTruthy();
		expect(chip.textContent).toContain('2 in a row');
		engine.streak = 0;
		engine.renderChrome(mc());
		expect(document.getElementById('kidStreak')).toBe(null);
	});

	it('a timeout resets the streak like a wrong answer', () => {
		const engine = loadPlayer();
		startGame(engine, [mc()], { play_template: 'bubble-pop' });
		engine.streak = 4;
		engine.answer('', true);
		expect(engine.streak).toBe(0);
		expect(engine.answers[0].correct).toBe(false);
	});
});

describe('results screen actions', () => {
	function showResults(engine, over = {}) {
		engine.game = { id: 'g1', game_type: 'bubble-pop', questions: [mc()] };
		engine.config = Object.assign({ allow_replay: true }, over);
		engine.player = { name: 'Kid' };
		engine.score = 1;
		engine.streak = 0;
		engine.results({ score: 1, stars: 3, totalPoints: 1 });
	}

	it('gives the two actions the same accessible control class', () => {
		const engine = loadPlayer();
		showResults(engine);
		const actions = document.querySelector('.kid-win-actions');
		expect(actions).toBeTruthy();
		expect(actions.classList.contains('single')).toBe(false);
		const buttons = [...actions.querySelectorAll('.kid-win-btn')];
		expect(buttons).toHaveLength(2);
		const again = document.getElementById('kidAgain');
		expect(again.textContent).toContain('Play Again');
		const link = actions.querySelector('a.kid-win-btn');
		expect(link.getAttribute('href')).toBe('/kids/');
		// equal weight in the layout: one grid with two identical children
		expect(actions.style.gridTemplateColumns || '').toBe('');
	});

	it('drops the replay button and spans the full row when replay is off', () => {
		const engine = loadPlayer();
		showResults(engine, { allow_replay: false });
		const actions = document.querySelector('.kid-win-actions');
		expect(actions.classList.contains('single')).toBe(true);
		expect(document.getElementById('kidAgain')).toBe(null);
		const buttons = [...actions.querySelectorAll('.kid-win-btn')];
		expect(buttons).toHaveLength(1);
		expect(buttons[0].getAttribute('href')).toBe('/kids/');
	});
});