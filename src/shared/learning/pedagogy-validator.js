/**
 * src/shared/learning/pedagogy-validator.js
 *
 * Pure validation for a question's assessment criteria, plus the two pure
 * derivation helpers the services use to keep the cached question columns in
 * sync with the authoritative criterion rows.
 *
 * Pure: no repository, no I/O. Nothing here writes to the database.
 *
 * Bloom is a cognitive-process dimension and MUST stay independent of
 * `Question.difficulty`; nothing in this module reads or infers difficulty.
 */

import { BLOOM_ORDER } from './bloomCatalog.js';

/** Weights must sum to 1 within this tolerance (floating point). */
export const WEIGHT_TOLERANCE = 0.001;

/** Derived `Question.pedagogy_status` values. */
export const PEDAGOGY_STATUS = Object.freeze({
  UNCLASSIFIED: 'unclassified',
  PARTIAL: 'partial',
  CLASSIFIED: 'classified',
  NEEDS_REVIEW: 'needs_review',
});

export const CRITERION_SOURCES = Object.freeze(['manual', 'imported']);
export const REVIEW_STATUSES = Object.freeze(['approved', 'needs_review']);

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * Validate a full criteria set for one question.
 *
 * @param {object[]} criteria
 * @param {object}   context
 * @param {string[]} context.bloomIds        allowed Bloom dimension ids
 * @param {Set<string>|string[]} [context.objectiveIds]   objectives of THIS school
 * @param {Set<string>|string[]} [context.competencyIds]  competencies of THIS school
 * @param {Record<string, string|null>} [context.objectiveSubjectById]
 *        objective id → its subject_id (to check competency subject compatibility)
 * @param {Record<string, string|null>} [context.competencySubjectById]
 * @returns {{ ok: boolean, errors: Record<string, string[]> }}
 */
export function validateCriteriaSet(criteria, context = {}) {
  const errors = {};
  const push = (key, msg) => {
    (errors[key] ||= []).push(msg);
  };

  if (!Array.isArray(criteria) || criteria.length === 0) {
    return { ok: false, errors: { criteria: ['At least one criterion is required'] } };
  }

  const bloomIds = new Set(context.bloomIds || []);
  const objectiveIds = context.objectiveIds ? new Set(context.objectiveIds) : null;
  const competencyIds = context.competencyIds ? new Set(context.competencyIds) : null;
  const objectiveSubjectById = context.objectiveSubjectById || {};
  const competencySubjectById = context.competencySubjectById || {};

  const seenKeys = new Set();
  const seenTriples = new Set();
  let weightSum = 0;

  criteria.forEach((criterion, index) => {
    const at = `criteria[${index}]`;
    const value = criterion || {};

    if (!isNonEmptyString(value.objective_id)) {
      push(at, ['objective_id is required']);
    } else if (objectiveIds && !objectiveIds.has(value.objective_id)) {
      push(at, ['objective does not belong to this school']);
    }

    if (!isNonEmptyString(value.bloom_dimension_id)) {
      push(at, ['bloom_dimension_id is required']);
    } else if (bloomIds.size && !bloomIds.has(value.bloom_dimension_id)) {
      push(at, [`unknown Bloom dimension "${value.bloom_dimension_id}"`]);
    }

    if (value.competency_id != null && value.competency_id !== '') {
      if (competencyIds && !competencyIds.has(value.competency_id)) {
        push(at, ['competency does not belong to this school']);
      } else {
        // Subject compatibility: a competency with a subject may only be linked
        // to objectives of the SAME subject. A subject-less competency is
        // transversal and may link to any objective.
        const compSubject = competencySubjectById[value.competency_id] ?? null;
        const objSubject = objectiveSubjectById[value.objective_id] ?? null;
        if (compSubject && objSubject && compSubject !== objSubject) {
          push(at, ['competency and objective belong to different subjects']);
        }
      }
    }

    const weight = Number(value.weight);
    if (!Number.isFinite(weight) || weight < 0) {
      push(at, ['weight must be a number greater than or equal to 0']);
    } else {
      weightSum += weight;
    }

    const key = isNonEmptyString(value.criterion_key) ? value.criterion_key : 'main';
    if (seenKeys.has(key)) push(at, [`duplicate criterion_key "${key}"`]);
    else seenKeys.add(key);

    const triple = `${value.question_id ?? ''}|${value.objective_id}|${value.bloom_dimension_id}|${key}`;
    if (seenTriples.has(triple)) {
      push(at, ['two criteria target the same objective, Bloom dimension and criterion key']);
    } else {
      seenTriples.add(triple);
    }

    if (value.max_score != null && value.max_score !== '') {
      const max = Number(value.max_score);
      if (!Number.isFinite(max) || max < 0) push(at, ['max_score must be a number greater than or equal to 0']);
    }

    if (value.source != null && !CRITERION_SOURCES.includes(value.source)) {
      push(at, [`source must be one of ${CRITERION_SOURCES.join(' | ')}`]);
    }

    if (value.review_status != null && !REVIEW_STATUSES.includes(value.review_status)) {
      push(at, [`review_status must be one of ${REVIEW_STATUSES.join(' | ')}`]);
    }
  });

  if (criteria.length > 0 && Math.abs(weightSum - 1) > WEIGHT_TOLERANCE) {
    push('weights', [`Criterion weights must sum to 1 (got ${Number(weightSum.toFixed(4))})`]);
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Derive `Question.pedagogy_status` from the authoritative criterion rows.
 *
 * - no criteria                                  → `unclassified`
 * - any criterion flagged `needs_review`         → `needs_review`
 * - criteria present and weights sum to 1        → `classified`
 * - criteria present but weights do not sum to 1 → `partial`
 *
 * Writes go through `validateCriteriaSet`, so `partial` is produced by imported
 * or legacy rows rather than by the interactive classifier — which is exactly
 * why the state exists.
 */
export function derivePedagogyStatus(criteria) {
  const rows = Array.isArray(criteria) ? criteria : [];
  if (rows.length === 0) return PEDAGOGY_STATUS.UNCLASSIFIED;
  if (rows.some((c) => c?.review_status === 'needs_review')) return PEDAGOGY_STATUS.NEEDS_REVIEW;

  const sum = rows.reduce((acc, c) => acc + (Number.isFinite(Number(c?.weight)) ? Number(c.weight) : 0), 0);
  return Math.abs(sum - 1) <= WEIGHT_TOLERANCE
    ? PEDAGOGY_STATUS.CLASSIFIED
    : PEDAGOGY_STATUS.PARTIAL;
}

/**
 * Cache the question's primary Bloom dimension: the dimension carrying the
 * greatest total criterion weight. Ties break on the taxonomy order, so the
 * result is deterministic and never depends on row order.
 * @returns {string|null}
 */
export function pickPrimaryBloom(criteria) {
  const totals = new Map();
  for (const criterion of Array.isArray(criteria) ? criteria : []) {
    const id = criterion?.bloom_dimension_id;
    if (!id) continue;
    const weight = Number.isFinite(Number(criterion?.weight)) ? Number(criterion.weight) : 0;
    totals.set(id, (totals.get(id) || 0) + weight);
  }
  if (totals.size === 0) return null;

  return [...totals.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const orderA = BLOOM_ORDER[a[0]] ?? Number.MAX_SAFE_INTEGER;
      const orderB = BLOOM_ORDER[b[0]] ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a[0] < b[0] ? -1 : 1;
    })[0][0];
}
