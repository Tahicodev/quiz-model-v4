// @vitest-environment jsdom

/**
 * tests/unit/exam-question-assignment.test.js
 *
 * The teacher → student exam question pipeline used to leak extra questions.
 * The chain was:
 *
 *   1. the picker stored numeric bank indices in `exam.questions`;
 *   2. api-client.js dropped the `questions` key entirely when the filtered
 *      UUID list came out empty, so ExamService never reconciled the
 *      `exam_questions` junction;
 *   3. ExamService therefore left the OLD junction rows in place, and
 *      bootstrap hydration (which prefers the junction) sent every surplus
 *      row to the student — a "5 question" exam rendered 12 questions.
 *
 * These tests pin the three links that were fixed:
 *   - api-client forwards `questions` whenever the key is present, including
 *     `[]` (an intentional clear must reach the server);
 *   - api-client only forwards genuine UUIDs, never legacy numeric indices;
 *   - ExamService.#syncExamQuestions deletes the surplus rows and clears the
 *      junction to zero when the payload is `[]`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ExamService } from '../../src/frontend/services/ExamService.js';
import { ROLES, EXAM_STATUS } from '../../src/shared/constants.js';

const ROOT = process.cwd();
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

const examManagementSource = read('exam-management.js');

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

/* ------------------------------------------------------------------ */
/* api-client: the real script, driven through a stubbed fetch        */
/* ------------------------------------------------------------------ */

describe('api-client exam question mirror', () => {
	let sentBody = null;

	beforeEach(async () => {
		sentBody = null;
		delete window.API;
		window.APP_CONFIG = { apiUrl: '/api/v1' };
		global.fetch = vi.fn(async (_url, init) => {
			if (init && init.body) sentBody = JSON.parse(init.body);
			return {
				ok: true,
				status: 200,
				json: async () => ({ id: 'exam-1' }),
				text: async () => '',
			};
		});
		// api-client.js is a classic browser script (IIFE, no exports) —
		// importing it runs it and installs window.API. The module cache has
		// to be reset so every test gets a fresh installation.
		vi.resetModules();
		await import('../../api-client.js');
	});

	afterEach(() => {
		delete window.API;
		delete global.fetch;
	});

	it('forwards an empty questions array so an intentional clear reaches the server', async () => {
		await window.API.update('exams', 'exam-1', { name: 'Exam', questions: [] });
		expect(sentBody).toHaveProperty('questions');
		// The key must survive the mapping — dropping it would leave the old
		// exam_questions junction untouched and the student would keep
		// seeing the removed questions.
		expect(sentBody.questions).toEqual([]);
	});

	it('forwards only genuine question UUIDs and drops legacy bank indices', async () => {
		await window.API.update('exams', 'exam-1', {
			name: 'Exam',
			questions: [0, 3, UUID_A, 'not-a-uuid'],
		});
		expect(sentBody.questions).toEqual([UUID_A]);
	});

	it('accepts question objects and reads their id', async () => {
		await window.API.update('exams', 'exam-1', {
			name: 'Exam',
			questions: [{ id: UUID_A }, { question_id: UUID_B }],
		});
		expect(sentBody.questions).toEqual([UUID_A, UUID_B]);
	});

	it('keeps the legacy array in options_json so nothing is lost', async () => {
		await window.API.update('exams', 'exam-1', {
			name: 'Exam',
			questions: [0, 3],
		});
		const legacy = JSON.parse(sentBody.options_json);
		expect(legacy.questions).toEqual([0, 3]);
	});

	it('omits the questions key entirely when the caller did not supply one', async () => {
		await window.API.update('exams', 'exam-1', { name: 'Exam' });
		expect(sentBody).not.toHaveProperty('questions');
	});
});

/* ------------------------------------------------------------------ */
/* teacher picker → server payload                                     */
/* ------------------------------------------------------------------ */

describe('teacher picker → server payload', () => {
	function saveAssignExamQuestionsSource() {
		const start = examManagementSource.indexOf(
			'async function saveAssignExamQuestions()',
		);
		const end = examManagementSource.indexOf(
			'\nasync function ',
			start + 10,
		);
		expect(start).toBeGreaterThan(-1);
		return examManagementSource.slice(start, end);
	}

	it('always sends the questions key, including as an empty array', () => {
		// The save path must not build a payload that conditionally omits
		// `questions`; ExamService only reconciles the junction when the key
		// is present.
		expect(saveAssignExamQuestionsSource()).toContain('questions: selectedIds');
	});

	it('resolves the selected bank indices to question ids before saving', () => {
		expect(saveAssignExamQuestionsSource()).toMatch(
			/selectedQuestions[\s\S]*\.map\(\(idx\) => bank\[idx\]/,
		);
	});
});

/* ------------------------------------------------------------------ */
/* ExamService question junction reconciliation                        */
/* ------------------------------------------------------------------ */

describe('ExamService question junction reconciliation', () => {
	const ADMIN = { id: 'u-1', role: ROLES.ADMIN, school_id: 's-1' };

	let service;
	let repo;
	let links;

	/** A tiny in-memory stand-in for the exam_questions junction. */
	function makeRepo() {
		const questions = {
			[UUID_A]: { id: UUID_A },
			[UUID_B]: { id: UUID_B },
		};
		const exams = {
			'exam-1': {
				id: 'exam-1',
				status: EXAM_STATUS.DRAFT,
				school_id: 's-1',
			},
		};
		return {
			links,
			getAll: vi.fn(async (table, opts = {}) => {
				const filters = opts.filters || {};
				if (table === 'exam_questions') {
					const rows = links.filter((row) => {
						if (
							filters.exam_id != null &&
							String(row.exam_id) !== String(filters.exam_id)
						)
							return false;
						if (
							filters.question_id != null &&
							String(row.question_id) !== String(filters.question_id)
						)
							return false;
						return true;
					});
					return { data: rows, total: rows.length };
				}
				if (table === 'exams') return { data: Object.values(exams), total: 1 };
				return { data: [], total: 0 };
			}),
			getById: vi.fn(async (table, id) => {
				if (table === 'questions') return questions[id] || null;
				if (table === 'exams') return exams[id] || null;
				return null;
			}),
			create: vi.fn(async (table, row) => {
				const created = { id: `eq-${links.length + 1}`, ...row };
				links.push(created);
				return created;
			}),
			update: vi.fn(async (table, id, patch) => {
				if (table === 'exam_questions') {
					const row = links.find((link) => link.id === id);
					if (row) Object.assign(row, patch);
				}
				return { id, ...patch };
			}),
			delete: vi.fn(async (table, id) => {
				const index = links.findIndex((link) => link.id === id);
				if (index >= 0) links.splice(index, 1);
				return {};
			}),
			query: vi.fn(),
		};
	}

	beforeEach(() => {
		links = [];
		repo = makeRepo();
		service = new ExamService(repo);
	});

	it('deletes the surplus junction rows when the selection shrinks', async () => {
		links.push(
			{ id: 'eq-1', exam_id: 'exam-1', question_id: UUID_A, order_index: 0 },
			{ id: 'eq-2', exam_id: 'exam-1', question_id: UUID_B, order_index: 1 },
		);

		await service.update('exam-1', { questions: [UUID_A] }, ADMIN);

		// eq-2 is no longer wanted → it must be removed.
		expect(repo.delete).toHaveBeenCalledWith('exam_questions', 'eq-2');
		expect(repo.delete).not.toHaveBeenCalledWith('exam_questions', 'eq-1');
		expect(links.map((link) => link.question_id)).toEqual([UUID_A]);
	});

	it('clears the junction to zero when the payload is an empty array', async () => {
		links.push(
			{ id: 'eq-1', exam_id: 'exam-1', question_id: UUID_A, order_index: 0 },
			{ id: 'eq-2', exam_id: 'exam-1', question_id: UUID_B, order_index: 1 },
		);

		await service.update('exam-1', { questions: [] }, ADMIN);

		expect(repo.delete).toHaveBeenCalledTimes(2);
		expect(repo.delete).toHaveBeenCalledWith('exam_questions', 'eq-1');
		expect(repo.delete).toHaveBeenCalledWith('exam_questions', 'eq-2');
		expect(repo.create).not.toHaveBeenCalled();
		expect(links).toHaveLength(0);
	});

	it('never syncs the junction when the payload omits the questions key', async () => {
		await service.update('exam-1', { name: 'Renamed' }, ADMIN);

		expect(repo.delete).not.toHaveBeenCalled();
		expect(repo.create).not.toHaveBeenCalled();
	});

	it('adds the missing question and preserves the assigned order', async () => {
		links.push({
			id: 'eq-1',
			exam_id: 'exam-1',
			question_id: UUID_B,
			order_index: 0,
		});

		await service.update('exam-1', { questions: [UUID_A, UUID_B] }, ADMIN);

		expect(repo.create).toHaveBeenCalledWith('exam_questions', {
			exam_id: 'exam-1',
			question_id: UUID_A,
			order_index: 0,
		});
		// UUID_B moved from index 0 to index 1 → its order_index is rewritten.
		expect(repo.update).toHaveBeenCalledWith('exam_questions', 'eq-1', {
			order_index: 1,
		});
		expect(
			[...links]
				.sort((a, b) => a.order_index - b.order_index)
				.map((link) => link.question_id),
		).toEqual([UUID_A, UUID_B]);
	});
});
