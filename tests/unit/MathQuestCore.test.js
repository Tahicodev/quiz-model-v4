/**
 * tests/unit/MathQuestCore.test.js
 *
 * Pure-logic contract for the Math Quest kids game:
 *  - level planning from teacher config (with explicit fallback),
 *  - the map → quiz → results → map screen state machine (legal/illegal
 *    transitions, duplicate-submission prevention, replay),
 *  - question-type delegation keys,
 *  - cosmetic coin rules (never persisted).
 * Source: public/kids/games/math-quest-core.js
 */
import { describe, it, expect } from 'vitest';
import { MathQuestCore as MQC } from '../../public/kids/games/math-quest-core.js';

const QUESTIONS = [
	{ id: 'q1', type: 'multiple-choice', text: 'a', options_json: '["1","2","3","4"]', answer: '1', points: 1 },
	{ id: 'q2', type: 'multiple-choice', text: 'b', options_json: '["1","2","3","4"]', answer: '2', points: 1 },
	{ id: 'q3', type: 'multiple-choice', text: 'c', options_json: '["1","2","3","4"]', answer: '3', points: 1 },
];

const validConfig = {
	levels: [
		{ id: 'l1', name: 'Jungle Trail', questions: ['q1', 'q2', 'q3'] },
	],
};

describe('planLevels — teacher-curated levels', () => {
	it('uses the configured level when it references real question ids', () => {
		const levels = MQC.planLevels(validConfig, QUESTIONS);
		expect(levels).toHaveLength(1);
		expect(levels[0].questionIds).toEqual(['q1', 'q2', 'q3']);
		expect(levels[0].name).toBe('Jungle Trail');
	});

	it('falls back to ONE default level when config levels are absent', () => {
		const levels = MQC.planLevels({}, QUESTIONS);
		expect(levels).toHaveLength(1);
		expect(levels[0].questionIds).toEqual(['q1', 'q2', 'q3']);
	});

	it('falls back when a level references an unknown question id', () => {
		const bad = { levels: [{ id: 'x', name: 'X', questions: ['q1', 'ghost'] }] };
		const levels = MQC.planLevels(bad, QUESTIONS);
		expect(levels).toHaveLength(1);
		expect(levels[0].id).toBe('default');
		expect(levels[0].questionIds).toEqual(['q1', 'q2', 'q3']);
	});

	it('falls back when ids are duplicated across levels', () => {
		const bad = {
			levels: [
				{ id: 'a', name: 'A', questions: ['q1', 'q1'] },
				{ id: 'b', name: 'B', questions: ['q2', 'q3'] },
			],
		};
		const levels = MQC.planLevels(bad, QUESTIONS);
		expect(levels).toHaveLength(1);
	});

	it('falls back when the config does not cover every question', () => {
		const bad = { levels: [{ id: 'l1', name: 'L', questions: ['q1', 'q2'] }] };
		const levels = MQC.planLevels(bad, QUESTIONS);
		expect(levels).toHaveLength(1);
		expect(levels[0].questionIds).toEqual(['q1', 'q2', 'q3']);
	});

	it('falls back when a level has no stable id (stage-2 server parity)', () => {
		const bad = { levels: [{ name: 'NoIdLevel', questions: ['q1', 'q2', 'q3'] }] };
		const levels = MQC.planLevels(bad, QUESTIONS);
		expect(levels).toHaveLength(1);
		expect(levels[0].id).toBe('default');
	});
});

describe('planLevels — multi-level plans (stage 2)', () => {
	it('normalizes a two-level plan with thresholds and art', () => {
		const config = {
			levels: [
				{ id: 'l1', name: 'Jungle Trail', questions: ['q1'], pass_stars: 1, art: 'home' },
				{ id: 'l2', name: 'Temple Steps', questions: ['q2', 'q3'], pass_stars: 2, art: 'temple' },
			],
		};
		const levels = MQC.planLevels(config, QUESTIONS);
		expect(levels).toHaveLength(2);
		expect(levels[0]).toMatchObject({ index: 0, id: 'l1', thresholdStars: 1, art: 'home', questionIds: ['q1'] });
		expect(levels[1]).toMatchObject({ index: 1, id: 'l2', thresholdStars: 2, art: 'temple', questionIds: ['q2', 'q3'] });
	});

	it('defaults pass_stars to 1 and clamps bad art values to home', () => {
		const config = {
			levels: [
				{ id: 'a', name: 'A', questions: ['q1', 'q2'] },
				{ id: 'b', name: 'B', questions: ['q3'], art: 'not-a-key' },
			],
		};
		const levels = MQC.planLevels(config, QUESTIONS);
		expect(levels[0].thresholdStars).toBe(1);
		expect(levels[1].thresholdStars).toBe(1);
		expect(levels[1].art).toBe('home');
	});

	it('falls back when ids repeat the same level id (stable-id uniqueness matters)', () => {
		const config = {
			levels: [
				{ id: 'same', name: 'A', questions: ['q1'] },
				{ id: 'same', name: 'B', questions: ['q2', 'q3'] },
			],
		};
		const levels = MQC.planLevels(config, QUESTIONS);
		expect(levels).toHaveLength(1);
		expect(levels[0].id).toBe('default');
	});
});

describe('computeProgress — deterministic unlock chain (stage 2)', () => {
	const TWO = [
		{ index: 0, id: 'l1', name: 'L1', questionIds: ['q1'], thresholdStars: 1, art: 'home' },
		{ index: 1, id: 'l2', name: 'L2', questionIds: ['q2', 'q3'], thresholdStars: 2, art: 'temple' },
	];

	it('level 0 is always unlocked; later levels need the previous level passed', () => {
		const p = MQC.computeProgress(TWO, {});
		expect(p[0]).toEqual({ unlocked: true, bestStars: 0, passed: false });
		expect(p[1]).toEqual({ unlocked: false, bestStars: 0, passed: false });
	});

	it('meets the threshold → next level unlocks', () => {
		const p = MQC.computeProgress(TWO, { l1: 1 });
		expect(p[0].passed).toBe(true);
		expect(p[1].unlocked).toBe(true);
		expect(p[1].passed).toBe(false); // needs its own 2 stars
	});

	it('below threshold stays locked', () => {
		const p = MQC.computeProgress(TWO, { l1: 0, l2: 3 });
		expect(p[1].unlocked).toBe(false); // l2 stars cannot unlock anything while l1 is unpassed
	});

	it('chains three levels: unlocks gate on EVERY previous level passing', () => {
		const THREE = TWO.concat([{ index: 2, id: 'l3', name: 'L3', questionIds: [], thresholdStars: 1, art: 'sunset' }]);
		const p = MQC.computeProgress(THREE, { l1: 3, l2: 2 });
		expect(p[1].passed).toBe(true);
		expect(p[2].unlocked).toBe(true);
	});

	it('clamps junk stars into 0..3', () => {
		const p = MQC.computeProgress(TWO, { l1: 99 });
		expect(p[0]).toEqual({ unlocked: true, bestStars: 3, passed: true });
		expect(p[1].unlocked).toBe(true);
	});
});

describe('screen state machine — stage-1 legal flow', () => {
	it('walks map → level pick → session → quiz → complete → results → map', () => {
		let s = { screen: MQC.SCREENS.MAP, sessionStarted: false, processing: false, levelCount: 1, completed: [null], levelIndex: 0 };
		s = MQC.next(s, 'session-started');
		expect(s.screen).toBe(MQC.SCREENS.MAP);
		s = MQC.next(s, 'level-picked');
		expect(s.processing).toBe(true);
		s = MQC.next(s, 'session-started');
		expect(s.screen).toBe(MQC.SCREENS.QUIZ);
		expect(s.processing).toBe(false);
		s = MQC.next(s, 'level-answered');
		expect(s.screen).toBe(MQC.SCREENS.QUIZ); // shell keeps driving questions
		s = MQC.next(s, 'level-complete');
		expect(s.screen).toBe(MQC.SCREENS.LEVEL_RESULTS);
		s = MQC.next(s, 'back-to-map');
		expect(s.screen).toBe(MQC.SCREENS.MAP);
		expect(s.sessionStarted).toBe(false); // replay must mint a fresh session
	});

	it('prevents dropping the map screen back in mid-quiz', () => {
		let s = { screen: MQC.SCREENS.QUIZ, processing: false, sessionStarted: true, levelCount: 1, completed: [null], levelIndex: 0 };
		s = MQC.next(s, 'session-started');
		expect(s.screen).toBe(MQC.SCREENS.QUIZ);
		s = MQC.next(s, 'back-to-map');
		expect(s.screen).toBe(MQC.SCREENS.QUIZ);
	});

	it('rejects duplicate completion (level-complete twice)', () => {
		let s = { screen: MQC.SCREENS.QUIZ, processing: false, sessionStarted: true, levelCount: 1, completed: [null], levelIndex: 0, data: { score: 3, stars: 3 } };
		s = MQC.next(s, 'level-complete');
		expect(s.screen).toBe(MQC.SCREENS.LEVEL_RESULTS);
		const again = MQC.next(s, 'level-complete');
		expect(again).toEqual(s); // second completion is a no-op
	});

	it('records best stars and replays work (back-to-map → pick → session)', () => {
		let s = { screen: MQC.SCREENS.MAP, processing: false, sessionStarted: true, levelCount: 1, completed: [3], levelIndex: 0 };
		s = MQC.next(s, 'level-picked'); // replay allowed
		expect(s.processing).toBe(true);
		s = MQC.next(s, 'session-started');
		expect(s.screen).toBe(MQC.SCREENS.QUIZ);
	});

	it('degrades gracefully when PATCH fails (level-failed → results, no completed stars)', () => {
		let s = { screen: MQC.SCREENS.QUIZ, processing: false, sessionStarted: true, levelCount: 1, completed: [null], levelIndex: 0 };
		s = MQC.next(s, 'level-failed');
		expect(s.screen).toBe(MQC.SCREENS.LEVEL_RESULTS);
		expect(s.data.verified).toBe(false);
	});
});

describe('delegation — existing renderers stay in charge of the quiz', () => {
	it('maps question types to existing pipeline renderers', () => {
		expect(MQC.delegateKey({ type: 'multiple-choice' })).toBe('bubble-pop');
		expect(MQC.delegateKey({ type: 'multiple-choice', allowMultipleAnswers: true })).toBe('star-collector');
		expect(MQC.delegateKey({ type: 'true-false' })).toBe('leap-frog');
		expect(MQC.delegateKey({ type: 'fill-blank' })).toBe('magic-words');
		expect(MQC.delegateKey({ type: 'unknown-watever' })).toBe('bubble-pop');
	});
});

describe('cosmetic coin rule (v1: never persisted)', () => {
	it('derives 0..3 coins from server-verified stars, clamped', () => {
		expect(MQC.coinsForStars(0)).toBe(0);
		expect(MQC.coinsForStars(1)).toBe(1);
		expect(MQC.coinsForStars(3)).toBe(3);
		expect(MQC.coinsForStars(7)).toBe(3);
		expect(MQC.coinsForStars(-2)).toBe(0);
		expect(MQC.coinsForStars('x')).toBe(0);
	});
});
