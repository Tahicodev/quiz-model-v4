/**
 * src/backend/services/learning/LearningTaxonomyService.js
 *
 * Phase 1 taxonomy: the global Bloom catalog, school-managed learning
 * objectives (with the D2 proposal workflow), competencies, objective↔competency
 * links and prerequisite edges.
 *
 * Tenant isolation is enforced HERE, not only in the routes: every read filters
 * on the caller's `school_id`, and any id that does not resolve inside that
 * school raises NotFoundError (never a cross-tenant read or write).
 *
 * Phase 1 has no hard delete for taxonomy: referenced objectives/competencies
 * are never destroyed, they are archived.
 */

import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} from '../../../shared/errors.js';
import { ROLES } from '../../../shared/constants.js';
import { BLOOM_DIMENSIONS, BLOOM_DIMENSION_IDS, toBloomRow } from '../../../shared/learning/bloomCatalog.js';
import { validateBloomSeed } from '../../../shared/learning/bloom-catalog-validator.js';
import { validateCompetencyLink } from '../../../shared/learning/competency-link-validator.js';
import { findCycle } from '../../../shared/learning/prerequisite-validator.js';
import { fetchAllRows } from '../../../shared/pagination.js';

/** Setting that decides whether teachers create objectives directly (D2). */
export const TEACHER_OBJECTIVE_CREATION_SETTING = 'learning.teacher_objective_creation';

/**
 * Master switch for the Phase 1 learning surfaces (default OFF).
 *
 * The API stays reachable behind its permissions — this flag only decides
 * whether the taxonomy and pedagogy UI is shown at all. It is surfaced to the
 * client through `GET /learning/flags` and is never trusted for authorization.
 */
export const ADAPTIVE_ENABLED_SETTING = 'learning.adaptive.enabled';

export const OBJECTIVE_STATUS = Object.freeze({
  PROPOSED: 'proposed',
  ACTIVE: 'active',
  REJECTED: 'rejected',
  ARCHIVED: 'archived',
});

export const COMPETENCY_STATUS = Object.freeze({
  ACTIVE: 'active',
  ARCHIVED: 'archived',
});

export const COMPETENCY_KINDS = Object.freeze(['competency', 'skill', 'domain']);

/**
 * Page size for the school-wide loaders. It is a PAGE, not a cap: the loaders
 * read every page until the dataset is complete (see `fetchAllRows`), so a
 * school with more rows than this is never silently truncated.
 */
const SCHOOL_WIDE_PAGE_SIZE = 1000;

export class LearningTaxonomyService {
  #repo;
  #auditSvc;

  constructor(repo, { auditSvc = null } = {}) {
    this.#repo = repo;
    this.#auditSvc = auditSvc;
  }

  // ─── Roles ───────────────────────────────────────────────────────────────
  // Objective proposals are administered by admins; competencies, links and
  // prerequisites are admin-only in Phase 1. Kept in one place so WP4 can swap
  // these for permission checks (`school.learning.*`) without touching callers.

  #isAdmin(user) {
    return !!user && [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role);
  }

  #assertAdmin(user) {
    if (!this.#isAdmin(user)) throw new ForbiddenError('Administrator role required');
  }

  async #audit(user, entityType, entityId, action, diff = null) {
    if (!this.#auditSvc) return;
    await this.#auditSvc.log({
      schoolId: user.school_id,
      actorId: user.id || null,
      entityType,
      entityId,
      action,
      diff,
    });
  }

  // ─── Bloom catalog (global) ──────────────────────────────────────────────

  async listBloomDimensions() {
    const { data } = await this.#repo.getAll('bloom_dimensions', {
      orderBy: 'order_index',
      direction: 'asc',
      limit: 20,
    });
    return data || [];
  }

  /** The catalog as a Set, for validators. */
  bloomIdSet() {
    return new Set(BLOOM_DIMENSION_IDS);
  }

  /**
   * Idempotent seed of the six fixed dimensions. Safe to call on every boot and
   * from tests; it upserts by the stable id and never touches other rows.
   * Returns a small summary so the boot log can show what happened.
   */
  async ensureSeeded() {
    const check = validateBloomSeed();
    if (!check.ok) {
      throw new ValidationError(check.errors);
    }

    const delegate = this.#repo.modelFor('bloom_dimensions');
    const existing = await delegate.findMany({ select: { id: true } });
    const existingIds = new Set(existing.map((row) => row.id));

    let created = 0;
    for (const dimension of BLOOM_DIMENSIONS) {
      const row = toBloomRow(dimension);
      await delegate.upsert({ where: { id: row.id }, create: row, update: row });
      if (!existingIds.has(row.id)) created += 1;
    }

    return { created, updated: BLOOM_DIMENSIONS.length - created, total: BLOOM_DIMENSIONS.length };
  }

  // ─── Setting: may teachers create objectives directly? (D2) ───────────────

  /** @returns {Promise<boolean>} true only when the school explicitly enables it. */
  async isTeacherCreationEnabled(schoolId) {
    const { data } = await this.#repo.getAll('settings', {
      filters: { school_id: schoolId, key: TEACHER_OBJECTIVE_CREATION_SETTING },
      limit: 1,
    });
    const row = (data || [])[0];
    if (!row) return false; // default OFF
    return String(row.value).trim().toLowerCase() === 'true';
  }

  /**
   * The master switch for the Phase 1 surfaces. Absent or malformed → false.
   * Enforced by the `/learning` router itself (every route except `/flags`),
   * so this is an authorization input, not just a display hint.
   * @returns {Promise<boolean>} true only when the school explicitly opts in.
   */
  async isAdaptiveEnabled(schoolId) {
    const { data } = await this.#repo.getAll('settings', {
      filters: { school_id: schoolId, key: ADAPTIVE_ENABLED_SETTING },
      limit: 1,
    });
    const row = (data || [])[0];
    if (!row) return false; // default OFF
    return String(row.value).trim().toLowerCase() === 'true';
  }

  // ─── Shared loaders (tenant-scoped) ──────────────────────────────────────

  async #getScopedRow(table, schoolId, id, entity) {
    if (!id) throw new NotFoundError(entity);
    const row = await this.#repo.getById(table, id);
    if (!row || row.school_id !== schoolId) throw new NotFoundError(entity);
    return row;
  }

  async #loadSubject(schoolId, subjectId) {
    return this.#getScopedRow('subjects', schoolId, subjectId, 'Subject');
  }

  async #loadObjective(schoolId, id) {
    return this.#getScopedRow('learning_objectives', schoolId, id, 'Learning objective');
  }

  async #loadCompetency(schoolId, id) {
    return this.#getScopedRow('competencies', schoolId, id, 'Competency');
  }

  /**
   * Every competency of one school, for the validator contexts and the label
   * maps. Completeness matters: a truncated set silently drops labels and can
   * accept an invalid link, so the loaders read every page.
   */
  async #schoolCompetencies(schoolId) {
    return fetchAllRows(this.#repo, 'competencies', {
      filters: { school_id: schoolId },
      orderBy: 'id',
      direction: 'asc',
      pageSize: SCHOOL_WIDE_PAGE_SIZE,
    });
  }

  /**
   * Every prerequisite edge of one school. Used for cycle detection on write,
   * where a missing edge means a cycle is accepted — so this set MUST be
   * complete, never a single capped page.
   */
  async #schoolPrerequisites(schoolId) {
    return fetchAllRows(this.#repo, 'learning_prerequisites', {
      filters: { school_id: schoolId },
      orderBy: 'id',
      direction: 'asc',
      pageSize: SCHOOL_WIDE_PAGE_SIZE,
    });
  }

  // ─── Objectives ──────────────────────────────────────────────────────────

  /**
   * Teachers see the active/archived taxonomy plus their own proposals and
   * rejections; admins see everything. An explicit `status` filter narrows the
   * result for both.
   */
  async listObjectives(user, { status = null, subjectId = null, categoryId = null, parentId = null, search = null, limit = 50, offset = 0 } = {}) {
    const filters = { school_id: user.school_id };
    if (status) filters.status = status;
    if (subjectId) filters.subject_id = subjectId;
    if (categoryId) filters.category_id = categoryId;
    if (parentId) filters.parent_id = parentId;

    const options = {
      filters,
      limit,
      offset,
      orderBy: 'order_index',
      direction: 'asc',
      search,
    };

    if (!this.#isAdmin(user)) {
      // Only one OR group is allowed per query, so the teacher visibility rule
      // is expressed as the single `or` group.
      options.or = [
        { status: OBJECTIVE_STATUS.ACTIVE },
        { status: OBJECTIVE_STATUS.ARCHIVED },
        { proposed_by: user.id },
        { created_by: user.id },
      ];
    }

    return this.#repo.getAll('learning_objectives', options);
  }

  async getObjective(user, id) {
    const objective = await this.#loadObjective(user.school_id, id);
    const [links, prerequisites] = await Promise.all([
      this.listObjectiveCompetencies(user, id),
      this.listPrerequisites(user, { objectiveId: id }),
    ]);
    return { ...objective, competencies: links, prerequisites: prerequisites.data };
  }

  /**
   * The questions classified against one objective, as criteria rows.
   *
   * Read-only support for the pedagogy view's objective filter: a criterion is
   * the join between a question and an objective, so this is a plain filtered
   * read of that table — no question content is returned, only the mapping the
   * caller needs to narrow a list they already hold.
   */
  async listObjectiveQuestions(user, objectiveId, { limit = 500, offset = 0 } = {}) {
    await this.#loadObjective(user.school_id, objectiveId);
    return this.#repo.getAll('question_assessment_criteria', {
      filters: { school_id: user.school_id, objective_id: objectiveId },
      limit,
      offset,
      orderBy: 'created_at',
      direction: 'asc',
    });
  }

  /**
   * Create an objective. Governance (D2):
   *  - admin                        → `active`
   *  - teacher + setting ON         → `active`
   *  - teacher + setting OFF        → `proposed` (needs admin approval)
   * The executor is always recorded (`created_by`, and `proposed_by` when the
   * row needs approval).
   */
  async createObjective(user, data = {}) {
    const payload = await this.#validatedObjectivePayload(user.school_id, data);

    const isAdmin = this.#isAdmin(user);
    const directCreation = isAdmin || (await this.isTeacherCreationEnabled(user.school_id));
    const status = directCreation ? OBJECTIVE_STATUS.ACTIVE : OBJECTIVE_STATUS.PROPOSED;

    await this.#assertObjectiveCodeFree(user.school_id, payload.subject_id, payload.code, null);

    const created = await this.#repo.create('learning_objectives', {
      school_id: user.school_id,
      ...payload,
      status,
      proposed_by: directCreation ? null : user.id || null,
      created_by: user.id || null,
    });

    await this.#audit(user, 'learning_objective', created.id, 'create', { after: created });
    return created;
  }

  /**
   * Update an objective.
   *  - admin: any editable field; status only through approve/reject/archive.
   *  - teacher: only their own `proposed` row, and never the status.
   */
  async updateObjective(user, id, data = {}) {
    const objective = await this.#loadObjective(user.school_id, id);
    const isAdmin = this.#isAdmin(user);

    if (!isAdmin) {
      const isOwnProposal = objective.status === OBJECTIVE_STATUS.PROPOSED
        && (objective.proposed_by === user.id || objective.created_by === user.id);
      if (!isOwnProposal) throw new ForbiddenError('Only your own proposed objectives can be edited');
    }

    if (data.status != null && data.status !== objective.status) {
      throw new ValidationError({
        status: ['Status changes use approve, reject or archive'],
      });
    }

    // A teacher proposal keeps its own subject; code changes are administrative.
    // Only the keys actually supplied are forwarded, so a partial update never
    // looks like it set the untouched fields to undefined.
    const editable = isAdmin
      ? data
      : Object.fromEntries(
        [
          'statement',
          'description',
          'category_id',
          'parent_id',
          'order_index',
          'primary_bloom_dimension_id',
        ]
          .filter((key) => Object.prototype.hasOwnProperty.call(data, key))
          .map((key) => [key, data[key]]),
      );

    const payload = await this.#validatedObjectivePayload(user.school_id, editable, {
      subjectId: objective.subject_id,
      objectiveId: id,
      partial: true,
    });

    if (Object.keys(payload).length === 0) return objective;

    const updated = await this.#repo.update('learning_objectives', id, payload);
    await this.#audit(user, 'learning_objective', id, 'update', { before: objective, after: updated });
    return updated;
  }

  async approveObjective(user, id, { note = null } = {}) {
    this.#assertAdmin(user);
    const objective = await this.#loadObjective(user.school_id, id);
    if (objective.status !== OBJECTIVE_STATUS.PROPOSED) {
      throw new ValidationError({ status: ['Only a proposed objective can be approved'] });
    }
    const updated = await this.#repo.update('learning_objectives', id, {
      status: OBJECTIVE_STATUS.ACTIVE,
      reviewed_by: user.id || null,
      reviewed_at: new Date(),
      review_note: note || null,
    });
    await this.#audit(user, 'learning_objective', id, 'approve', { before: objective, after: updated });
    return updated;
  }

  async rejectObjective(user, id, { note = null } = {}) {
    this.#assertAdmin(user);
    const objective = await this.#loadObjective(user.school_id, id);
    if (objective.status !== OBJECTIVE_STATUS.PROPOSED) {
      throw new ValidationError({ status: ['Only a proposed objective can be rejected'] });
    }
    if (!note || !String(note).trim()) {
      throw new ValidationError({ review_note: ['A reason is required to reject an objective'] });
    }
    const updated = await this.#repo.update('learning_objectives', id, {
      status: OBJECTIVE_STATUS.REJECTED,
      reviewed_by: user.id || null,
      reviewed_at: new Date(),
      review_note: String(note).trim(),
    });
    await this.#audit(user, 'learning_objective', id, 'reject', { before: objective, after: updated });
    return updated;
  }

  /** Phase 1 has no hard delete: referenced taxonomy is archived, never removed. */
  async archiveObjective(user, id) {
    this.#assertAdmin(user);
    const objective = await this.#loadObjective(user.school_id, id);
    const updated = await this.#repo.update('learning_objectives', id, {
      status: OBJECTIVE_STATUS.ARCHIVED,
    });
    await this.#audit(user, 'learning_objective', id, 'archive', { before: objective, after: updated });
    return updated;
  }

  /**
   * Normalise + validate objective input. `partial` is used by update, where
   * only the supplied fields are checked.
   */
  async #validatedObjectivePayload(schoolId, data = {}, { subjectId = null, objectiveId = null, partial = false } = {}) {
    const errors = {};
    const payload = {};

    const has = (key) => Object.prototype.hasOwnProperty.call(data, key);

    // subject
    if (has('subject_id') || !partial) {
      const target = data.subject_id ?? subjectId;
      if (!target) errors.subject_id = ['A subject is required'];
      else await this.#loadSubject(schoolId, target); // 404 when foreign
      if (has('subject_id')) payload.subject_id = data.subject_id;
    } else if (!partial) {
      payload.subject_id = subjectId;
    }

    // code
    if (has('code') || !partial) {
      const code = String(data.code ?? '').trim();
      if (!code) errors.code = ['A code is required'];
      else payload.code = code;
    }

    // statement
    if (has('statement') || !partial) {
      const statement = String(data.statement ?? '').trim();
      if (!statement) errors.statement = ['A statement is required'];
      else payload.statement = statement;
    }

    if (has('description')) payload.description = data.description ? String(data.description) : null;

    if (has('order_index')) {
      const order = Number(data.order_index);
      if (!Number.isInteger(order) || order < 0) errors.order_index = ['order_index must be a non-negative integer'];
      else payload.order_index = order;
    }

    if (has('primary_bloom_dimension_id')) {
      const bloomId = data.primary_bloom_dimension_id;
      if (bloomId == null || bloomId === '') payload.primary_bloom_dimension_id = null;
      else if (!BLOOM_DIMENSION_IDS.includes(bloomId)) errors.primary_bloom_dimension_id = ['Unknown Bloom dimension'];
      else payload.primary_bloom_dimension_id = bloomId;
    }

    const effectiveSubject = payload.subject_id ?? subjectId;

    if (has('category_id')) {
      const categoryId = data.category_id;
      if (categoryId == null || categoryId === '') {
        payload.category_id = null;
      } else {
        const category = await this.#getScopedRow('categories', schoolId, categoryId, 'Category');
        if (category.subject_id && effectiveSubject && category.subject_id !== effectiveSubject) {
          errors.category_id = ['Category belongs to another subject'];
        } else {
          payload.category_id = categoryId;
        }
      }
    }

    if (has('parent_id')) {
      const parentId = data.parent_id;
      if (parentId == null || parentId === '') {
        payload.parent_id = null;
      } else {
        if (parentId === objectiveId) {
          errors.parent_id = ['An objective cannot be its own parent'];
        } else {
          const parent = await this.#loadObjective(schoolId, parentId);
          if (parent.subject_id !== effectiveSubject) {
            errors.parent_id = ['Parent objective belongs to another subject'];
          } else {
            payload.parent_id = parentId;
          }
        }
      }
    }

    if (Object.keys(errors).length) throw new ValidationError(errors);
    return payload;
  }

  /** (school, subject, code) is unique; check before writing so the error is readable. */
  async #assertObjectiveCodeFree(schoolId, subjectId, code, ignoreId) {
    const { data } = await this.#repo.getAll('learning_objectives', {
      filters: { school_id: schoolId, subject_id: subjectId, code },
      limit: 5,
    });
    const clash = (data || []).find((row) => row.id !== ignoreId);
    if (clash) {
      throw new ConflictError(`Objective code "${code}" already exists for this subject`);
    }
  }

  // ─── Competencies ────────────────────────────────────────────────────────

  async listCompetencies(user, { subjectId = null, kind = null, status = null, search = null, limit = 100, offset = 0 } = {}) {
    const filters = { school_id: user.school_id };
    if (subjectId) filters.subject_id = subjectId;
    if (kind) filters.kind = kind;
    if (status) filters.status = status;
    return this.#repo.getAll('competencies', { filters, limit, offset, orderBy: 'created_at', direction: 'asc', search });
  }

  async createCompetency(user, data = {}) {
    this.#assertAdmin(user);
    const payload = await this.#validatedCompetencyPayload(user.school_id, data);

    const { data: existing } = await this.#repo.getAll('competencies', {
      filters: { school_id: user.school_id, code: payload.code },
      limit: 1,
    });
    if ((existing || []).length) {
      throw new ConflictError(`Competency code "${payload.code}" already exists`);
    }

    const created = await this.#repo.create('competencies', {
      school_id: user.school_id,
      ...payload,
      created_by: user.id || null,
    });
    await this.#audit(user, 'learning_competency', created.id, 'create', { after: created });
    return created;
  }

  async updateCompetency(user, id, data = {}) {
    this.#assertAdmin(user);
    const competency = await this.#loadCompetency(user.school_id, id);
    const payload = await this.#validatedCompetencyPayload(user.school_id, data, { partial: true, competencyId: id });
    if (Object.keys(payload).length === 0) return competency;

    const updated = await this.#repo.update('competencies', id, payload);
    await this.#audit(user, 'learning_competency', id, 'update', { before: competency, after: updated });
    return updated;
  }

  async archiveCompetency(user, id) {
    this.#assertAdmin(user);
    const competency = await this.#loadCompetency(user.school_id, id);
    const updated = await this.#repo.update('competencies', id, { status: COMPETENCY_STATUS.ARCHIVED });
    await this.#audit(user, 'learning_competency', id, 'archive', { before: competency, after: updated });
    return updated;
  }

  async #validatedCompetencyPayload(schoolId, data = {}, { partial = false, competencyId = null } = {}) {
    const errors = {};
    const payload = {};
    const has = (key) => Object.prototype.hasOwnProperty.call(data, key);

    if (has('code') || !partial) {
      const code = String(data.code ?? '').trim();
      if (!code) errors.code = ['A code is required'];
      else payload.code = code;
    }
    if (has('name') || !partial) {
      const name = String(data.name ?? '').trim();
      if (!name) errors.name = ['A name is required'];
      else payload.name = name;
    }
    if (has('description')) payload.description = data.description ? String(data.description) : null;

    if (has('kind')) {
      const kind = data.kind ?? 'competency';
      if (!COMPETENCY_KINDS.includes(kind)) errors.kind = [`kind must be one of ${COMPETENCY_KINDS.join(' | ')}`];
      else payload.kind = kind;
    }

    if (has('subject_id')) {
      const subjectId = data.subject_id;
      if (subjectId == null || subjectId === '') {
        payload.subject_id = null;
      } else {
        await this.#loadSubject(schoolId, subjectId);
        payload.subject_id = subjectId;
      }
    }

    if (has('parent_id')) {
      const parentId = data.parent_id;
      if (parentId == null || parentId === '') {
        payload.parent_id = null;
      } else if (parentId === competencyId) {
        errors.parent_id = ['A competency cannot be its own parent'];
      } else {
        await this.#loadCompetency(schoolId, parentId);
        payload.parent_id = parentId;
      }
    }

    if (has('status')) {
      const status = data.status;
      if (!Object.values(COMPETENCY_STATUS).includes(status)) {
        errors.status = [`status must be one of ${Object.values(COMPETENCY_STATUS).join(' | ')}`];
      } else {
        payload.status = status;
      }
    }

    if (Object.keys(errors).length) throw new ValidationError(errors);
    return payload;
  }

  // ─── Objective ↔ competency links ────────────────────────────────────────

  async listObjectiveCompetencies(user, objectiveId) {
    await this.#loadObjective(user.school_id, objectiveId);
    const data = await fetchAllRows(this.#repo, 'learning_objective_competencies', {
      filters: { school_id: user.school_id, objective_id: objectiveId },
      orderBy: 'id',
      direction: 'asc',
      pageSize: SCHOOL_WIDE_PAGE_SIZE,
    });
    if (!data.length) return [];

    const competencies = await this.#schoolCompetencies(user.school_id);
    const byId = new Map(competencies.map((c) => [c.id, c]));
    return data.map((link) => {
      const competency = byId.get(link.competency_id) || null;
      return {
        ...link,
        code: competency?.code ?? null,
        name: competency?.name ?? null,
        competency_status: competency?.status ?? null,
      };
    });
  }

  /**
   * Link an objective to a competency. Idempotent per (objective, competency):
   * re-linking updates the weight / primary flag.
   */
  async linkCompetency(user, objectiveId, competencyId, { weight = 1, isPrimary = false } = {}) {
    this.#assertAdmin(user);
    const schoolId = user.school_id;
    const [objective, competency] = await Promise.all([
      this.#loadObjective(schoolId, objectiveId),
      this.#loadCompetency(schoolId, competencyId),
    ]);

    const existingLinks = await fetchAllRows(this.#repo, 'learning_objective_competencies', {
      filters: { school_id: schoolId, objective_id: objectiveId },
      orderBy: 'id',
      direction: 'asc',
      pageSize: SCHOOL_WIDE_PAGE_SIZE,
    });

    const check = validateCompetencyLink(
      { objective_id: objectiveId, competency_id: competencyId, weight, is_primary: !!isPrimary },
      { schoolId, objective, competency, existingLinks: existingLinks || [] },
    );
    if (!check.ok) throw new ValidationError(check.errors);

    const existing = (existingLinks || []).find((link) => link.competency_id === competencyId);
    if (existing) {
      const updated = await this.#repo.update('learning_objective_competencies', existing.id, {
        weight: Number(weight),
        is_primary: !!isPrimary,
      });
      await this.#audit(user, 'learning_objective_competency', updated.id, 'update', { before: existing, after: updated });
      return updated;
    }

    const created = await this.#repo.create('learning_objective_competencies', {
      school_id: schoolId,
      objective_id: objectiveId,
      competency_id: competencyId,
      weight: Number(weight),
      is_primary: !!isPrimary,
    });
    await this.#audit(user, 'learning_objective_competency', created.id, 'create', { after: created });
    return created;
  }

  async unlinkCompetency(user, objectiveId, competencyId) {
    this.#assertAdmin(user);
    await this.#loadObjective(user.school_id, objectiveId);
    const { data } = await this.#repo.getAll('learning_objective_competencies', {
      filters: { school_id: user.school_id, objective_id: objectiveId, competency_id: competencyId },
      limit: 1,
    });
    const link = (data || [])[0];
    if (!link) throw new NotFoundError('Competency link');

    await this.#repo.delete('learning_objective_competencies', link.id);
    await this.#audit(user, 'learning_objective_competency', link.id, 'delete', { before: link });
    return { deleted: true };
  }

  // ─── Prerequisites ───────────────────────────────────────────────────────

  async listPrerequisites(user, { objectiveId = null, limit = 100, offset = 0 } = {}) {
    const filters = { school_id: user.school_id };
    if (objectiveId) {
      await this.#loadObjective(user.school_id, objectiveId);
      filters.objective_id = objectiveId;
    }
    return this.#repo.getAll('learning_prerequisites', { filters, limit, offset, orderBy: 'created_at', direction: 'asc' });
  }

  /**
   * Add one prerequisite edge `objective → prerequisite`. Rejects self-edges and
   * any edge that would close a cycle (checked against every edge of the school).
   */
  async addPrerequisite(user, objectiveId, prerequisiteObjectiveId, { strength = 'required', minMasteryState = 'developing', rationale = null } = {}) {
    this.#assertAdmin(user);
    const schoolId = user.school_id;

    if (objectiveId === prerequisiteObjectiveId) {
      throw new ValidationError({ prerequisite_objective_id: ['An objective cannot be its own prerequisite'] });
    }
    await Promise.all([
      this.#loadObjective(schoolId, objectiveId),
      this.#loadObjective(schoolId, prerequisiteObjectiveId),
    ]);

    const edges = await this.#schoolPrerequisites(schoolId);
    const cycle = findCycle(edges, objectiveId, prerequisiteObjectiveId);
    if (cycle) {
      throw new ValidationError({
        prerequisite_objective_id: [`Prerequisite cycle: ${cycle.join(' → ')}`],
      });
    }

    const existing = edges.find(
      (edge) => edge.objective_id === objectiveId && edge.prerequisite_objective_id === prerequisiteObjectiveId,
    );
    if (existing) {
      const updated = await this.#repo.update('learning_prerequisites', existing.id, {
        strength,
        min_mastery_state: minMasteryState,
        rationale: rationale || null,
      });
      await this.#audit(user, 'learning_prerequisite', existing.id, 'update', { before: existing, after: updated });
      return updated;
    }

    const created = await this.#repo.create('learning_prerequisites', {
      school_id: schoolId,
      objective_id: objectiveId,
      prerequisite_objective_id: prerequisiteObjectiveId,
      strength,
      min_mastery_state: minMasteryState,
      rationale: rationale || null,
      created_by: user.id || null,
    });
    await this.#audit(user, 'learning_prerequisite', created.id, 'create', { after: created });
    return created;
  }

  async removePrerequisite(user, objectiveId, prerequisiteObjectiveId) {
    this.#assertAdmin(user);
    await this.#loadObjective(user.school_id, objectiveId);
    const { data } = await this.#repo.getAll('learning_prerequisites', {
      filters: {
        school_id: user.school_id,
        objective_id: objectiveId,
        prerequisite_objective_id: prerequisiteObjectiveId,
      },
      limit: 1,
    });
    const edge = (data || [])[0];
    if (!edge) throw new NotFoundError('Prerequisite');

    await this.#repo.delete('learning_prerequisites', edge.id);
    await this.#audit(user, 'learning_prerequisite', edge.id, 'delete', { before: edge });
    return { deleted: true };
  }
}
