/**
 * tests/unit/ai-exercise.test.js
 *
 * The lesson-exercise generator must ask the model for a SITUATION-PROBLEM
 * (not a quiz question) and normalise whatever it sends back. The provider
 * transport is stubbed at `fetch`; no network call is made.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AIService } from '../../src/backend/services/AIService.js';

const loggerStub = { warn() {}, error() {}, info() {} };
const svc = new AIService({}, loggerStub);

const config = { provider: 'openai', model_id: 'gpt-test', api_key: 'sk-test' };

const valid = {
	title: 'Le budget du voyage',
	situation: 'Une classe organise une sortie au musée.',
	givenData: ['24 élèves', 'Bus : 180 €'],
	tasks: [{ prompt: 'Calcule le prix des entrées.', points: 2 }],
	solutionSteps: ['24 × 4,50 = 108 €'],
	finalAnswer: '288 € au total.',
	keyCompetencies: ['Résoudre un problème'],
};

function stubReply(content) {
	const fn = vi.fn(async () => ({
		ok: true,
		status: 200,
		json: async () => ({ choices: [{ message: { content } }] }),
		text: async () => '',
	}));
	vi.stubGlobal('fetch', fn);
	return fn;
}

beforeEach(() => {
	vi.unstubAllGlobals();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('AIService.buildLessonExercisePrompt', () => {
	const prompt = svc.buildLessonExercisePrompt({
		language: 'French',
		difficulty: 'hard',
		lesson: { title: 'Les fractions', summary: 'Parts égales.', content: 'Une fraction est…' },
		categoryPath: 'Maths › Nombres',
	});

	it('frames the output as a situation-problem, not a question', () => {
		expect(prompt).toContain('SITUATION-PROBLEM');
		expect(prompt).toContain('not a quiz question');
		expect(prompt).toMatch(/applications? of the lesson|apply the knowledge/i);
	});

	it('asks for the full worked correction and the given data', () => {
		expect(prompt).toContain('"givenData"');
		expect(prompt).toContain('"solutionSteps"');
		expect(prompt).toContain('"finalAnswer"');
		expect(prompt).toContain('complete correction');
	});

	it('threads language, difficulty, lesson and structure context in', () => {
		expect(prompt).toContain('DIFFICULTY: hard');
		expect(prompt).toContain('LESSON TITLE: Les fractions');
		expect(prompt).toContain('Maths › Nombres');
		expect(prompt).toContain('Language of every value: French');
	});
});

describe('AIService.generateLessonExercise', () => {
	it('parses a fenced JSON answer and stamps language/difficulty', async () => {
		stubReply('```json\n' + JSON.stringify(valid) + '\n```');
		const exercise = await svc.generateLessonExercise({
			config,
			language: 'French',
			difficulty: 'hard',
			lesson: { title: 'Les fractions', summary: '', content: '' },
		});
		expect(exercise.title).toBe('Le budget du voyage');
		expect(exercise.tasks).toHaveLength(1);
		expect(exercise.language).toBe('French');
		expect(exercise.difficulty).toBe('hard');
		expect(exercise.generatedAt).toBeTruthy();
	});

	it('retries once and succeeds on the second attempt', async () => {
		const fn = vi.fn()
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'not json' } }] }), text: async () => '' })
			.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(valid) } }] }), text: async () => '' });
		vi.stubGlobal('fetch', fn);
		const exercise = await svc.generateLessonExercise({ config, lesson: { title: 'T' } });
		expect(exercise.title).toBe('Le budget du voyage');
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('throws AI_PROVIDER_ERROR after two unusable answers', async () => {
		stubReply('sorry, no json');
		await expect(svc.generateLessonExercise({ config, lesson: { title: 'T' } })).rejects.toMatchObject({
			code: 'AI_PROVIDER_ERROR',
		});
	});

	it('requires a model', async () => {
		await expect(svc.generateLessonExercise({ config: {}, lesson: { title: 'T' } })).rejects.toMatchObject({
			code: 'VALIDATION_ERROR',
			fields: { model_id: ['No model selected'] },
		});
	});
});