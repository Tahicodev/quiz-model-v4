/**
 * tests/unit/ai-question-generator.test.js
 *
 * Exercises AIQuestionGenerator.normalizeQuestion — the last line of defense
 * between a raw model response and the app's question format. Covers the
 * two production defects seen in the wild:
 *
 *   1. "0,0" answers: the model returned 0-based indices ("0,1") over the
 *      options ["0","1","2","A"]; the old 1-based mapping collapsed the
 *      "1" token onto the first option again.
 *   2. Multi-answer questions without the allowMultipleAnswers flag: the
 *      badge/grading in training, exams, games and tournaments keys off
 *      that flag, so it must be inferred when the answer maps to several
 *      distinct options.
 *   3. Fill-blank answers without the "id:value|id:value" structure.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

// The generator is a browser script (window.* globals, no exports). Load it
// in a minimal DOM-ish environment and grab the class off window.
const makeWindow = () => {
	const listeners = {};
	return {
		location: { origin: 'http://localhost:3000' },
		localStorage: {
			getItem: vi.fn(() => null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		},
		addEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
		fetch: vi.fn(),
		console,
		navigator: { onLine: true },
	};
};

async function loadGenerator() {
	const window = makeWindow();
	// Evaluate the script with `window` bound to its global scope.
	const source = await import('node:fs').then((fs) =>
		fs.promises.readFile('ai-question-generator.js', 'utf8'),
	);
	const moduleUrl = new URL(`data:text/javascript,${encodeURIComponent(`(function(window){${source}\n})`)}`);
	// Execute via a Function constructor with our fake window.
	new Function('window', source)(window);
	return window.AIQuestionGenerator;
}

let GeneratorClass;

beforeAll(async () => {
	GeneratorClass = await loadGenerator();
});

describe('AIQuestionGenerator.normalizeQuestion', () => {
	const normalize = (raw) =>
		GeneratorClass && new GeneratorClass().normalizeQuestion(raw, 0);

	it('resolves 0-based index answers without collapsing to duplicates', () => {
		const q = normalize({
			question: 'Quels chiffres sont utilisés dans le système binaire ?',
			type: 'multiple-choice',
			options: ['0', '1', '2', 'A'],
			answer: '0,1', // 0-based indices from the model
			explanation: '',
			difficulty: 'easy',
		});
		// Both tokens must resolve to the option TEXTS "0" and "1" — not the
		// 1-based reinterpretation "0","0".
		expect(q.answer).toBe('0,1');
		expect(q.allowMultipleAnswers).toBe(true);
	});

	it('keeps 1-based index answers working', () => {
		const q = normalize({
			question: 'Pick one:',
			type: 'multiple-choice',
			options: ['Red', 'Green', 'Blue'],
			answer: '2', // 1-based → "Green"
		});
		expect(q.answer).toBe('Green');
		expect(q.allowMultipleAnswers).toBe(false);
	});

	it('prefers exact option-text matches over positional reinterpretation', () => {
		const q = normalize({
			question: 'Pick the number two:',
			type: 'multiple-choice',
			options: ['0', '1', '2', 'A'],
			answer: '2', // "2" IS an option text — must stay "2"
		});
		expect(q.answer).toBe('2');
	});

	it('maps letter tokens (A-H) to option texts', () => {
		const q = normalize({
			question: 'Pick:',
			type: 'multiple-choice',
			options: ['Alpha', 'Beta', 'Gamma'],
			answer: 'B',
		});
		expect(q.answer).toBe('Beta');
	});

	it('dedupes collapsed answer tokens', () => {
		const q = normalize({
			question: 'Pick:',
			type: 'multiple-choice',
			options: ['Alpha', 'Beta', 'Gamma'],
			answer: 'Alpha,Alpha',
		});
		expect(q.answer).toBe('Alpha');
	});

	it('infers allowMultipleAnswers from a multi-option answer even when the flag is missing', () => {
		const q = normalize({
			question: 'Which are input devices?',
			type: 'multiple-choice',
			options: ['Le clavier', 'La souris', "L'imprimante", "L'écran standard"],
			answer: 'Le clavier,La souris', // model forgot allowMultipleAnswers
		});
		expect(q.answer).toBe('Le clavier,La souris');
		expect(q.allowMultipleAnswers).toBe(true);
	});

	it('accepts pipe-joined multi answers', () => {
		const q = normalize({
			question: 'Which are fruits?',
			type: 'multiple-choice',
			options: ['Apple', 'Pear', 'Car', 'Bike'],
			answer: 'Apple|Pear',
		});
		expect(q.answer).toBe('Apple,Pear');
		expect(q.allowMultipleAnswers).toBe(true);
	});

	it('renumbers bare-word fill-blank answers into id:value pairs', () => {
		const q = normalize({
			question: 'jjj___zzz___',
			type: 'fill-blank',
			options: ['e', 'z', 'ez'],
			answer: 'z', // bare word — old bug produced "1:z" for 2 blanks
		});
		expect(q.answer).toBe('1:z');
	});

	it('renumbers comma word lists for fill-blank', () => {
		const q = normalize({
			question: 'The ___ stores data in ___.',
			type: 'fill-blank',
			options: ['variable', 'memory', 'function'],
			answer: 'variable,memory',
		});
		expect(q.answer).toBe('1:variable|2:memory');
	});

	it('leaves well-formed fill-blank answers untouched', () => {
		const q = normalize({
			question: 'The ___ stores data in ___.',
			type: 'fill-blank',
			options: ['variable', 'memory'],
			answer: '1:variable|2:memory',
		});
		expect(q.answer).toBe('1:variable|2:memory');
	});

	it('normalizes code questions with a codeAnswerMode', () => {
		const q = normalize({
			question: 'What does this print?',
			type: 'code',
			codeSnippet: 'console.log(2 + 2);',
			codeLanguage: 'javascript',
			codeAnswerMode: 'multiple-choice',
			options: ['4', '5', '6'],
			answer: '4',
		});
		expect(q.type).toBe('code');
		expect(q.codeAnswerMode).toBe('multiple-choice');
		expect(q.answer).toBe('4');
		// Code questions never carry the MCQ multi flag.
		expect(q.allowMultipleAnswers).toBeUndefined();
	});
});
