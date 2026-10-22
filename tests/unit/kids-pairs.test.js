// @vitest-environment jsdom
/**
 * tests/unit/kids-pairs.test.js
 *
 * Matching-pairs support in the kid player (training-mode parity):
 *  - KidsPlayer.pairs(question) parses pair blocks the same way the main
 *    quiz does — answer-first ("A-->1|B-->2", "A→1,B-->2", "A:1"…), then
 *    option strings, then flat alternating options — keeping each pair's
 *    RAW token so submissions grade byte-for-byte,
 *  - PairPartyGame renders pairs even when options_json is empty (pairs
 *    live only in the answer) and submits the original tokens,
 *  - non-matching kid games delegate matching questions to pair-party
 *    (mountRenderer), while math-quest keeps delegating internally.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KIDS = path.resolve(__dirname, '../../public/kids');
const SCRIPTS = [
	'kids-player.js',
	'games/BubblePopGame.js',
	'games/PairPartyGame.js',
	'games/math-quest-core.js',
	'games/MathQuestGame.js',
];

beforeEach(() => {
	document.body.className = 'kid-body';
	document.body.innerHTML = `
		<div class="kid-wrap">
			<div class="kid-header">
				<div id="kidMascot" class="kid-mascot">🦊</div>
				<div class="kid-title"><h1 id="kidGameName"></h1><p id="kidGameSub"></p></div>
				<div class="spacer"></div>
				<button id="kidSoundBtn" class="kid-sound-btn" aria-label="sound">🔊</button>
			</div>
			<div class="kid-progress" id="kidProgress" hidden><span id="kidProgressLabel">1/1</span></div>
			<div id="kidScreen"></div>
		</div>
		<div class="kid-stars-rain" id="kidStarsRain" hidden></div>
	`;
	for (const f of SCRIPTS) window.eval(readFileSync(path.join(KIDS, f), 'utf8'));
});

describe('KidsPlayer.pairs — training-mode parser parity', () => {
	it('reads pairs from the ANSWER first (pipe-joined arrows)', () => {
		const qs = window.KidsPlayer.pairs({ type: 'matching', answer: 'A-->1|B-->2|C-->3' });
		expect(qs).toHaveLength(3);
		expect(qs[0].raw).toBe('A-->1');
		expect(qs[0].left).toBe('A');
		expect(qs[2].right).toBe('3');
	});

	it('reads comma-joined kid-canonical answers and every separator family', () => {
		expect(window.KidsPlayer.pairs({ answer: 'A-->1,B-->2' }).map(p => p.raw)).toEqual(['A-->1', 'B-->2']);
		expect(window.KidsPlayer.pairs({ answer: 'A→1|B→2' }).map(p => p.left)).toEqual(['A', 'B']);
		expect(window.KidsPlayer.pairs({ answer: 'A::1|B::2' }).map(p => p.right)).toEqual(['1', '2']);
		expect(window.KidsPlayer.pairs({ answer: 'A=>1|B=>2' })[0].right).toBe('1');
		expect(window.KidsPlayer.pairs({ answer: 'A=1|B=2' })[0].raw).toBe('A=1');
		expect(window.KidsPlayer.pairs({ answer: 'A:1|B:2' })[0].left).toBe('A');
	});

	it('strips a meta:: prefix and dedupes pairs', () => {
		expect(window.KidsPlayer.pairs({ answer: 'meta::AAAA::A-->1|A-->1|B-->2' })).toHaveLength(2);
	});

	it('falls back to option strings carrying pair syntax', () => {
		const qs = window.KidsPlayer.pairs({ type: 'matching', options_json: '["A-->1","B-->2"]', answer: '' });
		expect(qs).toHaveLength(2);
		expect(qs[1].raw).toBe('B-->2');
	});

	it('pairs flat even-count option lists like the training quiz', () => {
		const qs = window.KidsPlayer.pairs({ options_json: '["H2O","Homme","Fe","Femme"]', answer: '' });
		expect(qs).toHaveLength(2);
		expect(qs[0]).toEqual({ raw: 'H2O-->Homme', left: 'H2O', right: 'Homme' });
		expect(qs[1].left).toBe('Fe');
	});

	it('never invents pairs from plain multiple-choice options', () => {
		expect(window.KidsPlayer.pairs({ options_json: '["3"], ', answer: 'nope' })).toHaveLength(0);
		expect(window.KidsPlayer.pairs({ options_json: '["Paris","Berlin"]', answer: '' })).toHaveLength(0);
	});
});

describe('PairPartyGame renders matching questions with empty options', () => {
	it('"Associez chaque notion à sa définition." with pairs only in the answer', () => {
		const engine = {
			answer: (v) => { engine.lastAnswer = v; },
			nudge: () => { },
		};
		const root = document.getElementById('kidScreen');
		const q = {
			type: 'matching',
			text: 'Associez chaque notion à sa définition.',
			options_json: '[]',
			answer: 'A-->1,B-->2',
		};
		const game = new window.KidsPlayer.renderers['pair-party'](engine, root, q, {});
		game.render();
		const leftBtns = root.querySelectorAll('#kidLeft .kid-pair-item');
		const rightBtns = root.querySelectorAll('#kidRight .kid-pair-item');
		expect(leftBtns.length).toBe(2);
		expect(rightBtns.length).toBe(2);
		expect(root.querySelector('.kid-question').textContent).toContain('Associez chaque notion');
		// link both pairs, then check → submits the RAW answer tokens
		const tapPairs = function tap(leftVal, rightVal) {
			for (const el of leftBtns) if (el.dataset.v === leftVal) el.click();
			for (const el of root.querySelectorAll('#kidRight .kid-pair-item')) if (el.dataset.v === rightVal) el.click();
		};
		tapPairs('A', '1');
		tapPairs('B', '2');
		expect(root.querySelectorAll('.kid-link-chip').length).toBe(2);
		root.querySelector('#kidCheck').click();
		expect(engine.lastAnswer).toBe('A-->1,B-->2');
	});

	it('rejects a link reuse and submits wrong pairs as-is', () => {
		const engine = { answer: (v) => { engine.lastAnswer = v; }, nudge: () => { } };
		const root = document.getElementById('kidScreen');
		const game = new window.KidsPlayer.renderers['pair-party'](
			engine, root,
			{ type: 'matching', options_json: '[]', answer: 'A-->1,B-->2' },
			{}
		);
		game.render();
		const taps = function taps(leftVal, rightVal) {
			for (const el of root.querySelectorAll('#kidLeft .kid-pair-item')) if (el.dataset.v === leftVal) el.click();
			for (const el of root.querySelectorAll('#kidRight .kid-pair-item')) if (el.dataset.v === rightVal) el.click();
		};
		taps('A', '2'); // wrong pairing (A↔2) — a raw composed token
		taps('A', '1'); // reuse of the linked left card must be ignored
		taps('B', '1'); // second (wrong) pairing B↔1 — now every pair is linked
		expect(engine.lastAnswer).toBeUndefined();
		root.querySelector('#kidCheck').click();
		// tokens keep link order in the payload; the grader sorts before comparing
		expect(engine.lastAnswer.split(',')).toEqual(expect.arrayContaining(['A-->2', 'B-->1']));
	});
});

describe('mountRenderer delegates matching questions to pair-party', () => {
	function stubEngine() {
		const engine = window.KidsPlayerEngine;
		engine.game = { game_type: 'bubble-pop' };
		engine.renderer = null;
		engine.screen = (html) => { document.getElementById('kidScreen').innerHTML = html; };
		return engine;
	}

	it('bubble-pop + matching question → pair-party UI, not bubbles', () => {
		const engine = stubEngine();
		engine.mountRenderer({ type: 'matching', text: 'Associez…', options_json: '[]', answer: 'A-->1,B-->2' });
		expect(engine.renderer.constructor).toBe(window.KidsPlayer.renderers['pair-party']);
		expect(document.getElementById('kidScreen').querySelector('.kid-pair-col')).toBeTruthy();
	});

	it('math-quest keeps its own question-type delegation', () => {
		const engine = stubEngine();
		engine.game = { game_type: 'math-quest' };
		engine.mountRenderer({ type: 'matching', options_json: '[]', answer: 'A-->1' });
		expect(engine.renderer.constructor).toBe(window.KidsGameRenderers['math-quest']);
	});

	it('matching-pairs alias reaches pair-party too', () => {
		const engine = stubEngine();
		engine.game = { game_type: 'star-collector' };
		engine.mountRenderer({ type: 'matching-pairs', options_json: '[]', answer: 'A-->1' });
		expect(engine.renderer.constructor).toBe(window.KidsPlayer.renderers['pair-party']);
	});
});
