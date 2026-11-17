/**
 * exam-analysis.js is a classic browser script (no module exports), so it is
 * loaded into a VM context like the other script-unit tests. These tests lock
 * the per-question accuracy behaviour: the stored `answers_json` wrapper, the
 * per-exam points override and the answer decoding.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, beforeAll } from 'vitest';

const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../..',
);

let ctx;
let store;

beforeAll(() => {
	store = {};
	const documentStub = {
		readyState: 'loading',
		getElementById: () => null,
		querySelectorAll: () => [],
		createElement: () => ({
			style: {},
			setAttribute() {},
			appendChild() {},
			remove() {},
			classList: { add() {}, remove() {}, toggle() {} },
		}),
		body: { appendChild() {}, classList: { add() {}, remove() {} } },
		documentElement: { classList: { add() {}, remove() {} } },
		addEventListener() {},
		removeEventListener() {},
	};
	ctx = vm.createContext({
		console,
		String,
		Number,
		Math,
		JSON,
		Date,
		Set,
		Map,
		store,
		window: {
			__DI_CONTAINER__: {
				repo: {
					getAll_sync: (name) => store[name] || [],
				},
			},
		},
		document: documentStub,
	});
	vm.runInContext(
		readFileSync(path.join(ROOT, 'exam-analysis.js'), 'utf8'),
		ctx,
		{ filename: 'exam-analysis.js' },
	);
});

function run(code) {
	return vm.runInContext(code, ctx);
}

describe('examAnalysisExtractAnswers', () => {
	it('unwraps the student-workspace { userAnswers, trainingContext } shape', () => {
		expect(
			run(
				`JSON.stringify(examAnalysisExtractAnswers(JSON.stringify({
					userAnswers: { q1: 'a', q2: 'b' },
					trainingContext: { mode: 'exam' },
				})))`,
			),
		).toBe('{"q1":"a","q2":"b"}');
	});

	it('unwraps the legacy "answers" key', () => {
		expect(
			run(
				`JSON.stringify(examAnalysisExtractAnswers({ answers: { q1: 'a' } }))`,
			),
		).toBe('{"q1":"a"}');
	});

	it('keeps a flat map as-is', () => {
		expect(
			run(`JSON.stringify(examAnalysisExtractAnswers({ q1: 'a', q2: 3 }))`),
		).toBe('{"q1":"a","q2":3}');
	});

	it('accepts a JSON string payload', () => {
		expect(
			run(`JSON.stringify(examAnalysisExtractAnswers('{"q1":"a"}'))`),
		).toBe('{"q1":"a"}');
	});

	it('is safe with junk input', () => {
		expect(run(`JSON.stringify(examAnalysisExtractAnswers(null))`)).toBe('{}');
		expect(run(`JSON.stringify(examAnalysisExtractAnswers('not json'))`)).toBe('{}');
		expect(run(`JSON.stringify(examAnalysisExtractAnswers('[1,2]'))`)).toBe('{}');
	});
});

describe('answer comparison', () => {
	it('compares plain answers case-insensitively', () => {
		expect(run(`examAnalysisAnswersEqual('A', 'a', 'multiple-choice')`)).toBe(true);
		expect(run(`examAnalysisAnswersEqual('a', 'b', 'multiple-choice')`)).toBe(false);
	});

	it('compares multi-select answers as sets, whatever separator', () => {
		expect(
			run(`examAnalysisAnswersEqual('multi::0|1', '0,1', 'multiple-choice-multi')`),
		).toBe(true);
		expect(
			run(`examAnalysisAnswersEqual('multi::1|0', '0;1', 'multiple-choice-multi')`),
		).toBe(true);
		expect(
			run(`examAnalysisAnswersEqual('multi::0|2', '0,1', 'multiple-choice-multi')`),
		).toBe(false);
	});

	it('ignores the meta:: metadata prefix', () => {
		expect(
			run(`examAnalysisAnswersEqual('meta::YWJj::a', 'a', 'multiple-choice')`),
		).toBe(true);
	});

	it('treats an empty user answer as incorrect', () => {
		expect(run(`examAnalysisAnswersEqual('', 'a', 'multiple-choice')`)).toBe(false);
		expect(run(`examAnalysisAnswersEqual(null, 'a', 'multiple-choice')`)).toBe(false);
	});
});

describe('buildExamAnalysis', () => {
	beforeAll(() => {
		store.questions = [
			{ id: 'q1', text: 'Question one', type: 'multiple-choice', answer: 'a', points: 1, category_id: 'c1' },
			{ id: 'q2', text: 'Question two', type: 'multiple-choice', answer: 'b', points: 1, category_id: 'c1' },
		];
		store.categories = [{ id: 'c1', name: 'Algebra' }];
		store.users = [
			{ id: 'u1', name: 'Ada', role: 'student' },
			{ id: 'u2', name: 'Bob', role: 'student' },
		];
		store.exam_questions = [
			{ exam_id: 'e1', question_id: 'q2', order_index: 1, points_override: 5 },
		];
		store.results = [
			{
				id: 'r1',
				examId: 'e1',
				userId: 'u1',
				date: '2026-01-02T10:00:00.000Z',
				grade20: 15,
				answers_json: JSON.stringify({
					userAnswers: { q1: 'a', q2: 'b' },
					trainingContext: { mode: 'exam' },
				}),
			},
			{
				id: 'r2',
				examId: 'e1',
				userId: 'u2',
				date: '2026-01-03T10:00:00.000Z',
				grade20: 10,
				answers_json: JSON.stringify({
					userAnswers: { q1: 'b', q2: 'x' },
					trainingContext: { mode: 'exam' },
				}),
			},
		];
		store.exams = [{ id: 'e1', name: 'Midterm', questions: ['q1', 'q2'] }];
	});

	it('reads the answers through the wrapper so the accuracy columns are filled', () => {
		const payload = run(`buildExamAnalysis(store.exams[0])`);
		const q1 = payload.perQuestion.find((q) => q.question.id === 'q1');
		expect(q1.attempts).toBe(2);
		expect(q1.correct).toBe(1);
		expect(q1.accuracy).toBe(50);
	});

	it('keeps the raw student id on the correct / wrong lists', () => {
		const payload = run(`buildExamAnalysis(store.exams[0])`);
		const q1 = payload.perQuestion.find((q) => q.question.id === 'q1');
		expect(q1.correctStudents[0].userId).toBe('u1');
		expect(q1.wrongStudents[0].userId).toBe('u2');
	});

	it('applies the per-exam points override', () => {
		const payload = run(`buildExamAnalysis(store.exams[0])`);
		const q1 = payload.perQuestion.find((q) => q.question.id === 'q1');
		const q2 = payload.perQuestion.find((q) => q.question.id === 'q2');
		expect(q1.points).toBe(1);
		expect(q2.points).toBe(5);
	});

	it('counts answered questions through the wrapper', () => {
		const payload = run(`buildExamAnalysis(store.exams[0])`);
		expect(payload.sessionRows.every((row) => row.answeredCount === 2)).toBe(true);
	});

	it('exposes one session row per attempt', () => {
		const payload = run(`buildExamAnalysis(store.exams[0])`);
		expect(payload.sessionRows.length).toBe(2);
		expect(payload.students).toBeUndefined();
	});
});

describe('exam membership', () => {
	beforeAll(() => {
		store.questions = [
			{ id: 'q1', text: 'Question one', type: 'multiple-choice', answer: 'a', points: 1, category_id: 'c1' },
			{ id: 'q2', text: 'Question two', type: 'multiple-choice', answer: 'b', points: 1, category_id: 'c1' },
			{ id: 'q3', text: 'Unrelated question', type: 'multiple-choice', answer: 'c', points: 1, category_id: 'c2' },
		];
		store.categories = [{ id: 'c1', name: 'Algebra' }, { id: 'c2', name: 'Geometry' }];
		store.exam_questions = [
			{ exam_id: 'e1', question_id: 'q1', order_index: 0 },
			{ exam_id: 'e1', question_id: 'q2', order_index: 1 },
			{ exam_id: 'e2', question_id: 'q3', order_index: 0 },
		];
		store.exams = [
			{ id: 'e1', name: 'Midterm', questions: ['q1', 'q2'] },
			// A legacy exam still carrying picker indices instead of uuids.
			{ id: 'e3', name: 'Legacy', questions: [0, 2] },
		];
		store.results = [
			{
				id: 'r1',
				examId: 'e1',
				userId: 'u1',
				date: '2026-01-02T10:00:00.000Z',
				grade20: 15,
				answers_json: JSON.stringify({ userAnswers: { q1: 'a', q2: 'b' } }),
			},
			{
				id: 'r3',
				examId: 'e3',
				userId: 'u1',
				date: '2026-01-04T10:00:00.000Z',
				grade20: 12,
				answers_json: JSON.stringify({ userAnswers: { q1: 'a', q2: 'b' } }),
			},
		];
	});

	it('only lists the questions the exam_questions junction assigns', () => {
		const payload = run(`buildExamAnalysis(store.exams[0])`);
		expect(payload.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
	});

	it('never lists a question from another exam', () => {
		const payload = run(`buildExamAnalysis(store.exams[0])`);
		expect(payload.questions.some((q) => q.id === 'q3')).toBe(false);
		expect(payload.perQuestion.some((q) => q.question.id === 'q3')).toBe(false);
	});

	it('ignores legacy picker indices instead of resolving them positionally', () => {
		const payload = run(`buildExamAnalysis(store.exams[1])`);
		// Index 2 pointed at q3, which is not in this exam.
		expect(payload.questions.some((q) => q.id === 'q3')).toBe(false);
	});

	it('falls back to the answered questions when only indices are known', () => {
		const payload = run(`buildExamAnalysis(store.exams[1])`);
		expect(payload.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
	});

	it('orders the questions by the junction order_index', () => {
		store.exam_questions = [
			{ exam_id: 'e1', question_id: 'q2', order_index: 0 },
			{ exam_id: 'e1', question_id: 'q1', order_index: 1 },
		];
		const payload = run(`buildExamAnalysis(store.exams[0])`);
		expect(payload.questions.map((q) => q.id)).toEqual(['q2', 'q1']);
		// Restore the original order for the other assertions.
		store.exam_questions = [
			{ exam_id: 'e1', question_id: 'q1', order_index: 0 },
			{ exam_id: 'e1', question_id: 'q2', order_index: 1 },
			{ exam_id: 'e2', question_id: 'q3', order_index: 0 },
		];
	});
});

