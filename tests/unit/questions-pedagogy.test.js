/**
 * tests/unit/questions-pedagogy.test.js
 *
 * Unit tests for the pure helpers of questions-pedagogy.js — the WP5-refactor
 * module that integrates Adaptive Learning into the EXISTING Questions tab.
 * These helpers are the client-side safety net around the WP1–WP4 APIs:
 * labels, the filter predicate, the coverage summary, and the payload builders
 * that must mirror the server's CriteriaSetSchema / weight tolerance.
 *
 * The module is a classic browser script; importing it in Node attaches the
 * API to `module.exports` without booting any DOM behavior (the boot guard
 * only fires when `window` and `document` exist).
 */
import { describe, it, expect } from 'vitest';
import qp from '../../questions-pedagogy.js';

const internals = qp.__internals;

describe('questions-pedagogy — status labels and chips', () => {
	it('labels every known pedagogy status in every supported language', () => {
		for (const lang of ['en', 'fr', 'ar']) {
			for (const status of ['unclassified', 'partial', 'classified', 'needs_review']) {
				expect(typeof internals.STRINGS[lang][status]).toBe('string');
				expect(internals.STRINGS[lang][status].length).toBeGreaterThan(0);
			}
		}
	});

	it('maps unknown statuses to unclassified (fail-closed display)', () => {
		expect(internals.statusLabel('garbage')).toBe(internals.statusLabel('unclassified'));
		expect(internals.statusChipClass('garbage')).toBe(internals.statusChipClass('unclassified'));
	});
});

describe('questions-pedagogy — filter predicate', () => {
	const question = (id, status, bloom) => ({
		id,
		pedagogy_status: status,
		primary_bloom_dimension_id: bloom,
	});

	it('matches everything on an empty filter set', () => {
		expect(internals.rowMatchesPedagogyFilter(null, question('1', 'classified', 'b1'))).toBe(true);
		expect(internals.rowMatchesPedagogyFilter({ status: '', bloomId: '', objectiveIds: null }, question('1', 'unclassified', ''))).toBe(true);
	});

	it('filters by status and never matches an unknown status pattern', () => {
		const f = { status: 'needs_review', bloomId: '', objectiveIds: null };
		expect(internals.rowMatchesPedagogyFilter(f, question('1', 'needs_review', ''))).toBe(true);
		expect(internals.rowMatchesPedagogyFilter(f, question('2', 'classified', ''))).toBe(false);
		expect(internals.rowMatchesPedagogyFilter(f, question('3', undefined, ''))).toBe(false); // missing column → unclassified
	});

	it('"any" means HAS a classification, never unclassified', () => {
		const f = { status: 'any', bloomId: '', objectiveIds: null };
		expect(internals.rowMatchesPedagogyFilter(f, question('1', 'partial', ''))).toBe(true);
		expect(internals.rowMatchesPedagogyFilter(f, question('2', 'unclassified', ''))).toBe(false);
	});

	it('filters by primary Bloom (Bloom ≠ difficulty — no difficulty input exists)', () => {
		const f = { status: '', bloomId: 'bloom-apply', objectiveIds: null };
		expect(internals.rowMatchesPedagogyFilter(f, question('1', 'classified', 'bloom-apply'))).toBe(true);
		expect(internals.rowMatchesPedagogyFilter(f, question('2', 'classified', 'bloom-analyze'))).toBe(false);
	});

	it('filters by the objective id set (server-derived criteria join)', () => {
		const f = { status: '', bloomId: '', objectiveIds: new Set(['q1', 'q2']) };
		expect(internals.rowMatchesPedagogyFilter(f, question('q1', 'classified', ''))).toBe(true);
		expect(internals.rowMatchesPedagogyFilter(f, question('q3', 'classified', ''))).toBe(false);
	});
});

describe('questions-pedagogy — coverage summary', () => {
	it('summarizes statuses and defaults missing columns to unclassified', () => {
		const counts = internals.summarizeStatuses([
			{ pedagogy_status: 'classified' },
			{ pedagogy_status: 'partial' },
			{ pedagogy_status: 'needs_review' },
			{},
			null,
		]);
		expect(counts).toEqual({ total: 5, unclassified: 2, partial: 1, classified: 1, needs_review: 1 });
	});

	it('handles an empty list', () => {
		expect(internals.summarizeStatuses([])).toEqual({ total: 0, unclassified: 0, partial: 0, classified: 0, needs_review: 0 });
	});
});

describe('questions-pedagogy — single-criterion payload (simple editor)', () => {
	it('builds the exact CriteriaSetSchema shape with weight 1.00', () => {
		const payload = internals.buildSingleCriterion('obj-1', 'bloom-2', 'comp-3');
		expect(payload).toEqual({
			criteria: [{ objective_id: 'obj-1', bloom_dimension_id: 'bloom-2', competency_id: 'comp-3', weight: 1 }],
			source: 'manual',
			mark_reviewed: true,
		});
	});

	it('omits the competency when none is chosen', () => {
		const payload = internals.buildSingleCriterion('obj-1', 'bloom-2', '');
		expect(payload.criteria[0]).not.toHaveProperty('competency_id');
	});

	it('refuses an incomplete selection — never a half-criterion write', () => {
		expect(internals.buildSingleCriterion('', 'bloom-2', '')).toBeNull();
		expect(internals.buildSingleCriterion('obj-1', '', '')).toBeNull();
	});
});

describe('questions-pedagogy — criteria editor client-side checks', () => {
	const row = (weight, objectiveId = 'o', bloomId = 'b') => ({
		objective_id: objectiveId,
		bloom_dimension_id: bloomId,
		competency_id: '',
		weight,
		criterion_key: '',
		max_score: '',
		rubric: '',
	});

	it('accepts a set that totals 1.00 within the server tolerance', () => {
		expect(internals.criteriaProblem([row(0.6), row(0.4)])).toBeNull();
		// exactly at the tolerance boundary, like the server validator
		expect(internals.criteriaProblem([row(0.999), row(0.001)])).toBeNull();
	});

	it('rejects an empty set and any missing objective / Bloom / weight', () => {
		expect(internals.criteriaProblem([])).toBeTruthy();
		expect(internals.criteriaProblem([row(1, '', 'b')])).toBeTruthy();
		expect(internals.criteriaProblem([row(1, 'o', '')])).toBeTruthy();
		expect(internals.criteriaProblem([row(-0.5)])).toBeTruthy();
	});

	it('rejects a set whose weights drift beyond the tolerance', () => {
		expect(internals.criteriaProblem([row(0.5), row(0.4)])).toBeTruthy();
	});

	it('maps an editor row onto the wire criterion shape (rubric round-trip)', () => {
		const wire = internals.toWireCriterion({ ...row(1), max_score: '2.5', rubric: 'Show the work' });
		expect(wire).toEqual({
			objective_id: 'o',
			bloom_dimension_id: 'b',
			weight: 1,
			max_score: 2.5,
			rubric_json: { text: 'Show the work' },
		});
		// optional fields stay absent when empty
		const minimal = internals.toWireCriterion(row(1));
		expect(minimal).not.toHaveProperty('competency_id');
		expect(minimal).not.toHaveProperty('criterion_key');
		expect(minimal).not.toHaveProperty('max_score');
		expect(minimal).not.toHaveProperty('rubric_json');
	});

	it('round-trips rubric_json text through criterionToRow / rubricText', () => {
		expect(internals.rubricText(JSON.stringify({ text: 'Explain' }))).toBe('Explain');
		expect(internals.rubricText('plain')).toBe('plain');
		expect(internals.rubricText('')).toBe('');
		const back = internals.criterionToRow({ objective_id: 'o', bloom_dimension_id: 'b', weight: 1, rubric_json: JSON.stringify({ text: 'Explain' }) });
		expect(back.rubric).toBe('Explain');
		// 'main' is the stored default key — shown blank in the editor
		expect(internals.criterionToRow({ objective_id: 'o', bloom_dimension_id: 'b', weight: 1, criterion_key: 'main' }).criterion_key).toBe('');
	});
});

describe('questions-pedagogy — objective labels', () => {
	it('truncates long statements for dropdown and coverage labels', () => {
		const long = 'a'.repeat(120);
		const label = internals.objectiveLabelStatement({ statement: long });
		expect(label.length).toBeLessThanOrEqual(70);
		expect(label.endsWith('…')).toBe(true);
		const short = internals.objectiveLabelStatement({ statement: 'short' });
		expect(short).toBe('short');
	});
});

describe('questions-pedagogy — coverage attention ordering', () => {
	const objectives = [
		{ id: 'o-2', code: 'B-2', statement: 'b' },
		{ id: 'o-1', code: 'A-1', statement: 'a' },
		{ id: 'o-3', code: 'C-3', statement: 'c' },
	];

	it('puts zero-coverage objectives first, then fewest questions, then code order', () => {
		const rows = internals.coverageAttentionRows(objectives, {
			'o-1': { questions: 5, truncated: false, bloomCounts: { b1: 3, b2: 2 } },
			'o-2': { questions: 0, truncated: false, bloomCounts: {} },
			'o-3': { questions: 5, truncated: false, bloomCounts: { b1: 5 } },
		});
		expect(rows[0].objective.id).toBe('o-2'); // zero coverage first
		expect(rows[1].objective.code).toBe('A-1'); // tie on count → code order
		expect(rows[1].spread.concentrated).toBe(false);
		expect(rows[1].spread.levels).toBe(2);
		expect(rows[2].spread.concentrated).toBe(true); // single Bloom level
	});

	it('marks missing/error entries without throwing', () => {
		const rows = internals.coverageAttentionRows(objectives, {
			'o-1': { questions: null, error: true, bloomCounts: null },
		});
		expect(rows[0].error).toBe(true);
		expect(rows[0].spread).toBeNull();
		expect(rows[1].count).toBeNull();
	});

	it('returns no spread note for empty bloom counts', () => {
		expect(internals.bloomSpreadNote({})).toBeNull();
		expect(internals.bloomSpreadNote(null)).toBeNull();
		const single = internals.bloomSpreadNote({ 'bloom-apply': 4 });
		expect(single.concentrated).toBe(true);
		expect(single.label).toBe(internals.STRINGS.en.bloomConcentrated);
	});
});

describe('questions-pedagogy — searchable objective picker', () => {
	const objectives = [
		{ id: 'o-1', code: 'MATH-3.N1', statement: 'Read numbers', subject_id: 's-math' },
		{ id: 'o-2', code: 'FR-4.G1', statement: 'Recognize verbs', subject_id: 's-french' },
	];

	it('filters by subject context (empty context = all)', () => {
		expect(internals.objectivesForSubject('', objectives)).toHaveLength(2);
		expect(internals.objectivesForSubject('s-math', objectives).map((o) => o.id)).toEqual(['o-1']);
		expect(internals.objectivesForSubject('s-unknown', objectives)).toHaveLength(0);
	});

	it('matches a query against code and statement, case-insensitively', () => {
		expect(internals.objectiveMatchesQuery(objectives[0], 'math')).toBe(true);
		expect(internals.objectiveMatchesQuery(objectives[0], 'READ')).toBe(true);
		expect(internals.objectiveMatchesQuery(objectives[1], 'math')).toBe(false);
		expect(internals.objectiveMatchesQuery(objectives[1], '')).toBe(true);
	});
});
