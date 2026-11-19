/**
 * tests/unit/pedagogy-validator.test.js
 *
 * Whole-set validation for a question's assessment criteria, plus the two pure
 * derivations that keep the cached `Question` columns in sync:
 * `derivePedagogyStatus` and `pickPrimaryBloom`.
 *
 * The invariants pinned here are the Phase 1 acceptance criteria:
 *   - at least one criterion;
 *   - weights sum to 1 (within tolerance);
 *   - no duplicate criterion key and no duplicate (objective, Bloom, key) triple;
 *   - every referenced objective/competency is in the caller's school and
 *     competency↔objective subjects agree;
 *   - status is DERIVED: unclassified / partial / classified / needs_review;
 *   - the primary Bloom is the heaviest, with a deterministic tie-break.
 */

import { describe, it, expect } from 'vitest';

import {
  WEIGHT_TOLERANCE,
  PEDAGOGY_STATUS,
  CRITERION_SOURCES,
  REVIEW_STATUSES,
  validateCriteriaSet,
  derivePedagogyStatus,
  pickPrimaryBloom,
} from '../../src/shared/learning/pedagogy-validator.js';

const BLOOM_IDS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

const criterion = (overrides = {}) => ({
  objective_id: 'obj-1',
  bloom_dimension_id: 'apply',
  weight: 1,
  ...overrides,
});

const context = (overrides = {}) => ({
  bloomIds: BLOOM_IDS,
  objectiveIds: ['obj-1', 'obj-2'],
  competencyIds: ['comp-1'],
  objectiveSubjectById: { 'obj-1': 'sub-math', 'obj-2': 'sub-math' },
  competencySubjectById: { 'comp-1': 'sub-math' },
  ...overrides,
});

describe('validateCriteriaSet', () => {
  it('requires at least one criterion', () => {
    const result = validateCriteriaSet([], context());
    expect(result.ok).toBe(false);
    expect(result.errors.criteria).toEqual(['At least one criterion is required']);
  });

  it('accepts a single criterion carrying the whole weight', () => {
    expect(validateCriteriaSet([criterion()], context())).toEqual({ ok: true, errors: {} });
  });

  it('accepts a multi-criterion set that sums to 1', () => {
    const result = validateCriteriaSet(
      [criterion({ weight: 0.6 }), criterion({ weight: 0.4, bloom_dimension_id: 'create', criterion_key: 'creative' })],
      context(),
    );
    expect(result.ok).toBe(true);
  });

  it('accepts a sum inside the floating-point tolerance', () => {
    const result = validateCriteriaSet(
      [criterion({ weight: 0.3333 }), criterion({ weight: 0.3333, criterion_key: 'b' }), criterion({ weight: 0.3334, criterion_key: 'c' })],
      context(),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects weights that do not sum to 1', () => {
    const result = validateCriteriaSet([criterion({ weight: 0.5 })], context());
    expect(result.ok).toBe(false);
    expect(result.errors.weights.join(' ')).toMatch(/must sum to 1/);
  });

  it('rejects a negative or non-numeric weight', () => {
    const negative = validateCriteriaSet([criterion({ weight: -1 })], context());
    expect(negative.ok).toBe(false);
    expect(negative.errors['criteria[0]'].join(' ')).toMatch(/weight must be a number/);

    const nan = validateCriteriaSet([criterion({ weight: 'heavy' })], context());
    expect(nan.ok).toBe(false);
    expect(nan.errors['criteria[0]'].join(' ')).toMatch(/weight must be a number/);
  });

  it('requires objective_id and bloom_dimension_id', () => {
    const result = validateCriteriaSet([criterion({ objective_id: '', bloom_dimension_id: '' })], context());
    expect(result.ok).toBe(false);
    expect(result.errors['criteria[0]']).toEqual(
      expect.arrayContaining(['objective_id is required', 'bloom_dimension_id is required']),
    );
  });

  it('rejects an objective from another school', () => {
    const result = validateCriteriaSet([criterion({ objective_id: 'obj-foreign' })], context());
    expect(result.ok).toBe(false);
    expect(result.errors['criteria[0]'].join(' ')).toMatch(/does not belong to this school/);
  });

  it('rejects an unknown Bloom dimension', () => {
    const result = validateCriteriaSet([criterion({ bloom_dimension_id: 'synthesize' })], context());
    expect(result.ok).toBe(false);
    expect(result.errors['criteria[0]'].join(' ')).toMatch(/unknown Bloom dimension/);
  });

  it('rejects a competency from another school', () => {
    const result = validateCriteriaSet([criterion({ competency_id: 'comp-foreign' })], context());
    expect(result.ok).toBe(false);
    expect(result.errors['criteria[0]'].join(' ')).toMatch(/competency does not belong to this school/);
  });

  it('rejects a competency and objective from different subjects', () => {
    const result = validateCriteriaSet(
      [criterion({ competency_id: 'comp-1' })],
      context({ competencySubjectById: { 'comp-1': 'sub-science' } }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors['criteria[0]'].join(' ')).toMatch(/different subjects/);
  });

  it('allows a subject-less (transversal) competency on any objective', () => {
    const result = validateCriteriaSet(
      [criterion({ competency_id: 'comp-1' })],
      context({ competencySubjectById: { 'comp-1': null } }),
    );
    expect(result.ok).toBe(true);
  });

  it('treats a blank competency_id as absent', () => {
    const result = validateCriteriaSet([criterion({ competency_id: '' })], context({ competencyIds: [] }));
    expect(result.ok).toBe(true);
  });

  it('rejects two criteria sharing the same criterion_key', () => {
    const result = validateCriteriaSet(
      [criterion({ weight: 0.5 }), criterion({ weight: 0.5, bloom_dimension_id: 'create' })],
      context(),
    );
    expect(result.ok).toBe(false);
    expect(result.errors['criteria[1]'].join(' ')).toMatch(/duplicate criterion_key "main"/);
  });

  it('defaults a missing criterion_key to "main" (so two blanks collide)', () => {
    const result = validateCriteriaSet(
      [criterion({ weight: 0.5 }), criterion({ weight: 0.5, objective_id: 'obj-2' })],
      context(),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.weights).toBeUndefined();
    expect(result.errors['criteria[1]'].join(' ')).toMatch(/duplicate criterion_key "main"/);
  });

  it('rejects two criteria targeting the same objective, Bloom and key', () => {
    const result = validateCriteriaSet(
      [criterion({ weight: 0.5, criterion_key: 'main' }), criterion({ weight: 0.5, criterion_key: 'main' })],
      context(),
    );
    expect(result.ok).toBe(false);
    expect(result.errors['criteria[1]'].join(' ')).toMatch(/same objective, Bloom dimension and criterion key/);
  });

  it('accepts the same objective and Bloom under different keys', () => {
    const result = validateCriteriaSet(
      [criterion({ weight: 0.5, criterion_key: 'recall' }), criterion({ weight: 0.5, criterion_key: 'transfer' })],
      context(),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a negative max_score and an unknown source / review_status', () => {
    const result = validateCriteriaSet(
      [criterion({ max_score: -2, source: 'guessed', review_status: 'maybe' })],
      context(),
    );
    expect(result.ok).toBe(false);
    expect(result.errors['criteria[0]'].join(' ')).toMatch(/max_score must be a number/);
    expect(result.errors['criteria[0]'].join(' ')).toMatch(new RegExp(`source must be one of ${CRITERION_SOURCES.join(' \\| ')}`));
    expect(result.errors['criteria[0]'].join(' ')).toMatch(new RegExp(`review_status must be one of ${REVIEW_STATUSES.join(' \\| ')}`));
  });

  it('does not read or infer difficulty', () => {
    // A `difficulty` property on the criterion is ignored: Bloom ≠ difficulty.
    const easy = validateCriteriaSet([criterion({ difficulty: 'easy' })], context());
    const hard = validateCriteriaSet([criterion({ difficulty: 'hard' })], context());
    expect(easy).toEqual(hard);
    expect(easy.ok).toBe(true);
  });
});

describe('derivePedagogyStatus', () => {
  it('is unclassified with no criteria', () => {
    expect(derivePedagogyStatus([])).toBe(PEDAGOGY_STATUS.UNCLASSIFIED);
    expect(derivePedagogyStatus(null)).toBe(PEDAGOGY_STATUS.UNCLASSIFIED);
  });

  it('is classified when weights sum to 1', () => {
    expect(derivePedagogyStatus([{ weight: 1 }])).toBe(PEDAGOGY_STATUS.CLASSIFIED);
    expect(derivePedagogyStatus([{ weight: 0.5 }, { weight: 0.5 }])).toBe(PEDAGOGY_STATUS.CLASSIFIED);
  });

  it('is partial when weights do not sum to 1', () => {
    expect(derivePedagogyStatus([{ weight: 0.5 }])).toBe(PEDAGOGY_STATUS.PARTIAL);
  });

  it('lets needs_review win over classification', () => {
    expect(
      derivePedagogyStatus([{ weight: 1, review_status: 'needs_review' }]),
    ).toBe(PEDAGOGY_STATUS.NEEDS_REVIEW);
  });

  it('treats a non-numeric weight as 0 rather than NaN', () => {
    expect(derivePedagogyStatus([{ weight: 'oops' }])).toBe(PEDAGOGY_STATUS.PARTIAL);
  });

  it('classifies sums inside the tolerance', () => {
    expect(derivePedagogyStatus([{ weight: 1 - WEIGHT_TOLERANCE / 2 }])).toBe(PEDAGOGY_STATUS.CLASSIFIED);
  });
});

describe('pickPrimaryBloom', () => {
  it('returns null without criteria', () => {
    expect(pickPrimaryBloom([])).toBeNull();
    expect(pickPrimaryBloom(null)).toBeNull();
  });

  it('picks the heaviest single dimension', () => {
    expect(pickPrimaryBloom([
      { bloom_dimension_id: 'remember', weight: 0.2 },
      { bloom_dimension_id: 'create', weight: 0.8 },
    ])).toBe('create');
  });

  it('accumulates weight across criteria of the same dimension', () => {
    expect(pickPrimaryBloom([
      { bloom_dimension_id: 'analyze', weight: 0.3 },
      { bloom_dimension_id: 'analyze', weight: 0.3 },
      { bloom_dimension_id: 'apply', weight: 0.4 },
    ])).toBe('analyze');
  });

  it('breaks a tie by taxonomy order, not by row order', () => {
    expect(pickPrimaryBloom([
      { bloom_dimension_id: 'apply', weight: 0.5 },
      { bloom_dimension_id: 'understand', weight: 0.5 },
    ])).toBe('understand');

    expect(pickPrimaryBloom([
      { bloom_dimension_id: 'understand', weight: 0.5 },
      { bloom_dimension_id: 'apply', weight: 0.5 },
    ])).toBe('understand');
  });

  it('ignores criteria without a Bloom id', () => {
    expect(pickPrimaryBloom([
      { bloom_dimension_id: null, weight: 0.9 },
      { bloom_dimension_id: 'evaluate', weight: 0.1 },
    ])).toBe('evaluate');
  });
});