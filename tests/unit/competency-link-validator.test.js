/**
 * tests/unit/competency-link-validator.test.js
 *
 * Validation for the objective ↔ competency link.
 *
 * The rules are tenant and subject rules more than shape rules:
 *   - both endpoints must belong to the caller's school;
 *   - a competency that names a subject only links to objectives of that
 *     subject (a subject-less competency is transversal);
 *   - weight is a finite number ≥ 0;
 *   - at most one `is_primary` link per objective.
 */

import { describe, it, expect } from 'vitest';

import { validateCompetencyLink } from '../../src/shared/learning/competency-link-validator.js';

const schoolId = 'school-a';

const objective = { school_id: schoolId, subject_id: 'sub-math' };
const competency = { school_id: schoolId, subject_id: 'sub-math' };

const link = (overrides = {}) => ({
  objective_id: 'obj-1',
  competency_id: 'comp-1',
  ...overrides,
});

const context = (overrides = {}) => ({
  schoolId,
  objective,
  competency,
  existingLinks: [],
  ...overrides,
});

describe('validateCompetencyLink', () => {
  it('accepts a same-school, same-subject link', () => {
    expect(validateCompetencyLink(link(), context())).toEqual({ ok: true, errors: {} });
  });

  it('accepts a subject-less (transversal) competency', () => {
    const result = validateCompetencyLink(
      link(),
      context({ competency: { school_id: schoolId, subject_id: null } }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a missing objective or competency', () => {
    const result = validateCompetencyLink(link(), context({ objective: null, competency: null }));
    expect(result.ok).toBe(false);
    expect(result.errors.objective_id).toEqual(['Objective not found in this school']);
    expect(result.errors.competency_id).toEqual(['Competency not found in this school']);
  });

  it('rejects a foreign objective', () => {
    const result = validateCompetencyLink(
      link(),
      context({ objective: { school_id: 'school-b', subject_id: 'sub-math' } }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.objective_id).toEqual(['Objective belongs to another school']);
  });

  it('rejects a foreign competency', () => {
    const result = validateCompetencyLink(
      link(),
      context({ competency: { school_id: 'school-b', subject_id: 'sub-math' } }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.competency_id).toEqual(['Competency belongs to another school']);
  });

  it('rejects a cross-subject link', () => {
    const result = validateCompetencyLink(
      link(),
      context({ competency: { school_id: schoolId, subject_id: 'sub-science' } }),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.competency_id).toEqual(['Competency and objective belong to different subjects']);
  });

  it('defaults the weight to 1', () => {
    expect(validateCompetencyLink(link(), context()).ok).toBe(true);
  });

  it('rejects a negative or non-finite weight', () => {
    expect(validateCompetencyLink(link({ weight: -0.5 }), context()).errors.weight).toBeDefined();
    expect(validateCompetencyLink(link({ weight: Infinity }), context()).errors.weight).toBeDefined();
  });

  it('allows a second primary link on the same objective only if it is the same competency', () => {
    const existingLinks = [{ objective_id: 'obj-1', competency_id: 'comp-1', is_primary: true }];

    // Re-marking the SAME competency primary is an update, not a conflict.
    expect(validateCompetencyLink(link({ is_primary: true }), context({ existingLinks })).ok).toBe(true);

    // A DIFFERENT competency claiming primary on the same objective conflicts.
    const conflict = validateCompetencyLink(
      link({ competency_id: 'comp-2', is_primary: true }),
      context({
        existingLinks,
        competency: { school_id: schoolId, subject_id: 'sub-math' },
      }),
    );
    expect(conflict.ok).toBe(false);
    expect(conflict.errors.is_primary).toEqual(['This objective already has a primary competency']);
  });

  it('ignores primary links belonging to another objective', () => {
    const existingLinks = [{ objective_id: 'obj-2', competency_id: 'comp-2', is_primary: true }];
    const result = validateCompetencyLink(link({ is_primary: true }), context({ existingLinks }));
    expect(result.ok).toBe(true);
  });

  it('does not require is_primary on the new link', () => {
    const existingLinks = [{ objective_id: 'obj-1', competency_id: 'comp-2', is_primary: true }];
    expect(validateCompetencyLink(link(), context({ existingLinks })).ok).toBe(true);
  });
});