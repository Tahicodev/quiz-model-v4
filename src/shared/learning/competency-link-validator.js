/**
 * src/shared/learning/competency-link-validator.js
 *
 * Pure validation for the objective ↔ competency link
 * (`LearningObjectiveCompetency`).
 *
 * Rules:
 *  - both endpoints must belong to the SAME school (tenant isolation);
 *  - a competency that names a subject may only link to objectives of that
 *    subject (a subject-less competency is transversal and links to any);
 *  - weight must be a finite number ≥ 0;
 *  - at most ONE link per objective may be `is_primary`.
 *
 * Pure: no repository, no I/O.
 */

/**
 * @param {object} link                 the link being validated
 * @param {string} link.objective_id
 * @param {string} link.competency_id
 * @param {number} [link.weight]
 * @param {boolean} [link.is_primary]
 * @param {object} context
 * @param {string} context.schoolId
 * @param {{school_id: string, subject_id: string|null}} context.objective
 * @param {{school_id: string, subject_id: string|null}} context.competency
 * @param {object[]} [context.existingLinks] other links of the same objective
 * @returns {{ ok: boolean, errors: Record<string, string[]> }}
 */
export function validateCompetencyLink(link, context = {}) {
  const errors = {};
  const push = (key, msg) => {
    (errors[key] ||= []).push(msg);
  };

  const { schoolId, objective, competency, existingLinks = [] } = context;

  if (!objective) push('objective_id', ['Objective not found in this school']);
  if (!competency) push('competency_id', ['Competency not found in this school']);

  if (objective && schoolId && objective.school_id !== schoolId) {
    push('objective_id', ['Objective belongs to another school']);
  }
  if (competency && schoolId && competency.school_id !== schoolId) {
    push('competency_id', ['Competency belongs to another school']);
  }

  if (objective && competency && competency.subject_id && objective.subject_id
      && competency.subject_id !== objective.subject_id) {
    push('competency_id', ['Competency and objective belong to different subjects']);
  }

  const weight = Number(link?.weight ?? 1);
  if (!Number.isFinite(weight) || weight < 0) {
    push('weight', ['weight must be a number greater than or equal to 0']);
  }

  if (link?.is_primary) {
    const other = (existingLinks || []).find(
      (candidate) => candidate?.is_primary
        && candidate.objective_id === link.objective_id
        && candidate.competency_id !== link.competency_id,
    );
    if (other) {
      push('is_primary', ['This objective already has a primary competency']);
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
