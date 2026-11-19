/**
 * src/backend/services/learning/QuestionPedagogyService.js
 *
 * The authoritative source of a question's pedagogy is its
 * `QuestionAssessmentCriterion` rows. `Question.pedagogy_status` and
 * `Question.primary_bloom_dimension_id` are CACHES derived from them, recomputed
 * on every write (and re-derivable by `recompute` after an import).
 *
 * Tenant isolation and question ownership are enforced here: a teacher may
 * classify only their own questions, and any id from another school is a 404.
 *
 * Phase 1 has no AI suggestions: nothing here writes `pedagogy_source`
 * 'ai_accepted' and no suggestion table is consulted.
 */

import { NotFoundError, ForbiddenError, ValidationError } from '../../../shared/errors.js';
import { ROLES } from '../../../shared/constants.js';
import { BLOOM_DIMENSION_IDS } from '../../../shared/learning/bloomCatalog.js';
import {
  validateCriteriaSet,
  derivePedagogyStatus,
  pickPrimaryBloom,
  PEDAGOGY_STATUS,
} from '../../../shared/learning/pedagogy-validator.js';

const SCHOOL_WIDE_LIMIT = 1000;

export class QuestionPedagogyService {
  #repo;
  #auditSvc;

  constructor(repo, { auditSvc = null } = {}) {
    this.#repo = repo;
    this.#auditSvc = auditSvc;
  }

  // ─── Scoping ─────────────────────────────────────────────────────────────

  #isAdmin(user) {
    return !!user && [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role);
  }

  async #loadQuestion(schoolId, questionId) {
    if (!questionId) throw new NotFoundError('Question');
    const question = await this.#repo.getById('questions', questionId);
    if (!question || question.school_id !== schoolId) throw new NotFoundError('Question');
    return question;
  }

  /**
   * Teachers may classify strictly their own questions (same ownership rule as
   * the author-scope read filter); admins may classify any question of the
   * school.
   */
  #assertCanEdit(user, question) {
    if (this.#isAdmin(user)) return;
    if (!user || question.created_by == null || question.created_by !== user.id) {
      throw new ForbiddenError('You can only classify your own questions');
    }
  }

  async #audit(user, entityId, action, diff = null) {
    if (!this.#auditSvc) return;
    await this.#auditSvc.log({
      schoolId: user.school_id,
      actorId: user.id || null,
      entityType: 'question_pedagogy',
      entityId,
      action,
      diff,
    });
  }

  // ─── Reads ───────────────────────────────────────────────────────────────

  async listCriteria(user, questionId) {
    await this.#loadQuestion(user.school_id, questionId);
    const { data } = await this.#repo.getAll('question_assessment_criteria', {
      filters: { school_id: user.school_id, question_id: questionId },
      limit: 50,
    });
    // Deterministic read order: heaviest criterion first (it drives the primary
    // Bloom cache), ties broken by criterion_key. The table has no natural
    // ordering, so without this a panel could reorder between reads.
    return [...(data || [])].sort((a, b) => {
      const delta = (Number(b.weight) || 0) - (Number(a.weight) || 0);
      if (delta !== 0) return delta;
      return String(a.criterion_key || '').localeCompare(String(b.criterion_key || ''));
    });
  }

  /** Question + its criteria + the labels a panel needs, in one call. */
  async getQuestionPedagogy(user, questionId) {
    const question = await this.#loadQuestion(user.school_id, questionId);
    const [criteria, objectives, competencies, bloom] = await Promise.all([
      this.listCriteria(user, questionId),
      this.#objectiveLabels(user.school_id),
      this.#competencyLabels(user.school_id),
      this.#bloomLabels(),
    ]);

    return {
      question,
      criteria: criteria.map((criterion) => ({
        ...criterion,
        objective_code: objectives.get(criterion.objective_id)?.code ?? null,
        objective_statement: objectives.get(criterion.objective_id)?.statement ?? null,
        competency_code: competencies.get(criterion.competency_id)?.code ?? null,
        bloom_name: bloom.get(criterion.bloom_dimension_id)?.name ?? null,
        bloom_labels: bloom.get(criterion.bloom_dimension_id)?.labels ?? null,
      })),
      pedagogy_status: question.pedagogy_status,
      primary_bloom_dimension_id: question.primary_bloom_dimension_id,
    };
  }

  async #objectiveLabels(schoolId) {
    const { data } = await this.#repo.getAll('learning_objectives', {
      filters: { school_id: schoolId },
      limit: SCHOOL_WIDE_LIMIT,
    });
    return new Map((data || []).map((row) => [row.id, row]));
  }

  async #competencyLabels(schoolId) {
    const { data } = await this.#repo.getAll('competencies', {
      filters: { school_id: schoolId },
      limit: SCHOOL_WIDE_LIMIT,
    });
    return new Map((data || []).map((row) => [row.id, row]));
  }

  async #bloomLabels() {
    const { data } = await this.#repo.getAll('bloom_dimensions', {
      orderBy: 'order_index',
      direction: 'asc',
      limit: 20,
    });
    return new Map((data || []).map((row) => {
      let labels = null;
      try {
        labels = row.labels_json ? JSON.parse(row.labels_json) : null;
      } catch {
        labels = null;
      }
      return [row.id, { ...row, labels }];
    }));
  }

  // ─── Writes ──────────────────────────────────────────────────────────────

  /**
   * Replace a question's criteria with `criteria` (an empty array clears the
   * classification). Validates the whole set first, so a rejected request
   * changes nothing.
   *
   * @param {{ source?: 'manual'|'imported', markReviewed?: boolean }} [options]
   */
  async setCriteria(user, questionId, criteria, { source = 'manual', markReviewed = true } = {}) {
    const question = await this.#loadQuestion(user.school_id, questionId);
    this.#assertCanEdit(user, question);

    const list = Array.isArray(criteria) ? criteria : [];

    if (list.length === 0) {
      return this.#clearCriteria(user, question);
    }

    const context = await this.#buildValidationContext(user.school_id, list);
    const check = validateCriteriaSet(
      list.map((criterion) => ({ ...criterion, question_id: questionId })),
      context,
    );
    if (!check.ok) throw new ValidationError(check.errors);

    const rows = list.map((criterion) => ({
      school_id: user.school_id,
      question_id: questionId,
      objective_id: criterion.objective_id,
      competency_id: criterion.competency_id || null,
      bloom_dimension_id: criterion.bloom_dimension_id,
      criterion_key: criterion.criterion_key?.trim() ? criterion.criterion_key.trim() : 'main',
      weight: Number(criterion.weight),
      max_score: criterion.max_score != null ? Number(criterion.max_score) : null,
      rubric_json: criterion.rubric_json ? JSON.stringify(criterion.rubric_json) : null,
      source,
      review_status: criterion.review_status === 'needs_review' ? 'needs_review' : 'approved',
      created_by: user.id || null,
    }));

    // Replace, then re-derive the caches. Validation already passed, so a
    // failure mid-write cannot leave a half-validated set behind.
    await this.#deleteAllCriteria(user.school_id, questionId);
    for (const row of rows) {
      await this.#repo.create('question_assessment_criteria', row);
    }
    const updated = await this.#applyDerivedFields(question, rows, { markReviewed, userId: user.id });

    await this.#audit(user, questionId, 'criteria.set', {
      criteria_count: rows.length,
      pedagogy_status: updated.pedagogy_status,
      primary_bloom_dimension_id: updated.primary_bloom_dimension_id,
    });
    return { question: updated, criteria: await this.listCriteria(user, questionId) };
  }

  /** Append one criterion, re-validating the resulting set as a whole. */
  async addCriterion(user, questionId, criterion) {
    const existing = await this.listCriteria(user, questionId);
    return this.setCriteria(user, questionId, [...existing, criterion]);
  }

  /** Remove one criterion by id, re-validating the remaining set. */
  async removeCriterion(user, questionId, criterionId) {
    const existing = await this.listCriteria(user, questionId);
    const remaining = existing.filter((row) => row.id !== criterionId);
    if (remaining.length === existing.length) throw new NotFoundError('Criterion');
    return this.setCriteria(user, questionId, remaining);
  }

  /** Remove every criterion: the question becomes `unclassified` again. */
  async clearCriteria(user, questionId) {
    const question = await this.#loadQuestion(user.school_id, questionId);
    this.#assertCanEdit(user, question);
    return this.#clearCriteria(user, question);
  }

  async #clearCriteria(user, question) {
    await this.#deleteAllCriteria(user.school_id, question.id);
    const updated = await this.#repo.update('questions', question.id, {
      pedagogy_status: PEDAGOGY_STATUS.UNCLASSIFIED,
      primary_bloom_dimension_id: null,
      pedagogy_reviewed_at: null,
      pedagogy_reviewed_by: null,
    });
    await this.#audit(user, question.id, 'criteria.clear', { before: question, after: updated });
    return { question: updated, criteria: [] };
  }

  /**
   * Re-derive the cached question columns from the stored criteria rows. Used
   * after imports/restores that write criteria directly.
   */
  async recompute(user, questionId) {
    const question = await this.#loadQuestion(user.school_id, questionId);
    const criteria = await this.listCriteria(user, questionId);
    return this.#applyDerivedFields(question, criteria, {
      markReviewed: false,
      userId: user.id,
    });
  }

  async #deleteAllCriteria(schoolId, questionId) {
    const { data } = await this.#repo.getAll('question_assessment_criteria', {
      filters: { school_id: schoolId, question_id: questionId },
      limit: 200,
    });
    for (const row of data || []) {
      await this.#repo.delete('question_assessment_criteria', row.id);
    }
  }

  /** Write the derived caches (status, primary Bloom, review stamp) together. */
  async #applyDerivedFields(question, criteriaRows, { markReviewed, userId }) {
    const patch = {
      pedagogy_status: derivePedagogyStatus(criteriaRows),
      primary_bloom_dimension_id: pickPrimaryBloom(criteriaRows),
    };
    if (markReviewed && criteriaRows.length > 0) {
      patch.pedagogy_reviewed_at = new Date();
      patch.pedagogy_reviewed_by = userId || null;
    }
    return this.#repo.update('questions', question.id, patch);
  }

  /**
   * Resolve every referenced objective/competency INSIDE the caller's school.
   * A foreign id is a 404 — never a silent cross-tenant write — which is what
   * the teacher-scope tests assert.
   */
  async #buildValidationContext(schoolId, criteria) {
    const objectiveIds = [...new Set(criteria.map((c) => c?.objective_id).filter(Boolean))];
    const competencyIds = [...new Set(criteria.map((c) => c?.competency_id).filter(Boolean))];

    const objectiveSubjectById = {};
    for (const id of objectiveIds) {
      const objective = await this.#repo.getById('learning_objectives', id);
      if (!objective || objective.school_id !== schoolId) throw new NotFoundError('Learning objective');
      objectiveSubjectById[id] = objective.subject_id;
    }

    const competencySubjectById = {};
    for (const id of competencyIds) {
      const competency = await this.#repo.getById('competencies', id);
      if (!competency || competency.school_id !== schoolId) throw new NotFoundError('Competency');
      competencySubjectById[id] = competency.subject_id;
    }

    return {
      bloomIds: BLOOM_DIMENSION_IDS,
      objectiveIds,
      competencyIds,
      objectiveSubjectById,
      competencySubjectById,
    };
  }
}

export { PEDAGOGY_STATUS };
