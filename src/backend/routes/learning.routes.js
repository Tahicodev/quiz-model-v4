/**
 * src/backend/routes/learning.routes.js
 *
 * Phase 1 learning taxonomy + question pedagogy endpoints, mounted at
 * `/api/v1/learning`. Every route sits behind `requireAuth` + `enforceTenant`;
 * the services then re-check the caller's `school_id`, so a foreign id is a 404
 * and never a cross-tenant read or write.
 *
 * Authority model (mirrors the frozen spec):
 *   - read       → `school.learning.read` | `class.learning.read`
 *   - classify   → `class.learning.classify` (teachers, own questions) or
 *                  `school.learning.manage` (admins, any question)
 *   - manage     → `school.learning.manage` (admin only) — competencies, links,
 *                  prerequisites, objective approval/rejection/archive
 * Services remain the final authority (e.g. a teacher may only edit their own
 * proposed objective); the permissions here stop a student token from reaching
 * the services at all.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireAnyPermission, requirePermission } from '../middleware/permission.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { ValidationError } from '../../shared/errors.js';
import {
  ObjectiveCreateSchema,
  ObjectiveUpdateSchema,
  ObjectiveFilterSchema,
  ObjectiveApproveSchema,
  ObjectiveRejectSchema,
  CompetencyCreateSchema,
  CompetencyUpdateSchema,
  CompetencyFilterSchema,
  CompetencyLinkSchema,
  PrerequisiteCreateSchema,
  CriteriaSetSchema,
  CriterionSchema,
} from '../../shared/schemas/learning.schema.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

const requireLearningRead = requireAnyPermission([
  'school.learning.read',
  'class.learning.read',
  'school.learning.manage',
  'class.learning.classify',
]);
const requireLearningWrite = requireAnyPermission([
  'school.learning.manage',
  'class.learning.classify',
]);
const requireLearningManage = requirePermission('school.learning.manage');

// ─── Bloom catalog (global, read-only) ──────────────────────────────────────

router.get('/bloom', requireLearningRead, async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.json({ data: await learningTaxonomySvc.listBloomDimensions() });
  } catch (err) { next(err); }
});

// ─── Feature flags ──────────────────────────────────────────────────────────

/**
 * The Phase 1 flags, readable by anyone who may read the taxonomy.
 *
 * The settings themselves are admin-visibility rows, so a teacher cannot read
 * them through `/settings/*`; the UI still needs to know whether the surfaces
 * are enabled and whether an objective they create is published or proposed.
 * This exposes the two booleans and nothing else — the write path stays
 * `PATCH /settings/:key`, which is admin-only.
 */
router.get('/flags', requireLearningRead, async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    const [adaptiveEnabled, teacherObjectiveCreation] = await Promise.all([
      learningTaxonomySvc.isAdaptiveEnabled(req.schoolId),
      learningTaxonomySvc.isTeacherCreationEnabled(req.schoolId),
    ]);
    res.json({
      adaptive_enabled: adaptiveEnabled,
      teacher_objective_creation: teacherObjectiveCreation,
    });
  } catch (err) { next(err); }
});

// ─── Objectives ─────────────────────────────────────────────────────────────

router.get('/objectives', requireLearningRead, validateQuery(ObjectiveFilterSchema), async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    const { status, subject_id, category_id, parent_id, search, limit, offset } = req.query;
    const result = await learningTaxonomySvc.listObjectives(req.user, {
      status: status || null,
      subjectId: subject_id || null,
      categoryId: category_id || null,
      parentId: parent_id || null,
      search: search || null,
      limit,
      offset,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/objectives/:id', requireLearningRead, async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.json(await learningTaxonomySvc.getObjective(req.user, req.params.id));
  } catch (err) { next(err); }
});

/**
 * The criteria rows that map questions to this objective — the pedagogy view's
 * objective filter reads the returned question ids. Three segments, so it can
 * never be shadowed by `/objectives/:id` above.
 */
router.get('/objectives/:id/questions', requireLearningRead, async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json(await learningTaxonomySvc.listObjectiveQuestions(req.user, req.params.id, { limit, offset }));
  } catch (err) { next(err); }
});

// D2: admin → active; teacher + setting ON → active; teacher + setting OFF → proposed.
router.post('/objectives', requireLearningWrite, validate(ObjectiveCreateSchema), async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.status(201).json(await learningTaxonomySvc.createObjective(req.user, req.body));
  } catch (err) { next(err); }
});

router.patch('/objectives/:id', requireLearningWrite, validate(ObjectiveUpdateSchema), async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    const { status, ...fields } = req.body || {};

    // The spec keeps archive on the PATCH verb: `status='archived'`. It is an
    // administrator action, so it is routed to the archive use-case (which
    // asserts admin). Any other status value is refused — status transitions
    // have dedicated endpoints (approve / reject) or are not allowed at all.
    if (status != null && status !== 'archived') {
      throw new ValidationError({
        status: ['Status changes use approve, reject or archive'],
      });
    }
    if (status === 'archived') {
      return res.json(await learningTaxonomySvc.archiveObjective(req.user, req.params.id));
    }

    res.json(await learningTaxonomySvc.updateObjective(req.user, req.params.id, fields));
  } catch (err) { next(err); }
});

router.post('/objectives/:id/approve', requireLearningManage, validate(ObjectiveApproveSchema), async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.json(await learningTaxonomySvc.approveObjective(req.user, req.params.id, { note: req.body?.note ?? null }));
  } catch (err) { next(err); }
});

router.post('/objectives/:id/reject', requireLearningManage, validate(ObjectiveRejectSchema), async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.json(await learningTaxonomySvc.rejectObjective(req.user, req.params.id, { note: req.body.note }));
  } catch (err) { next(err); }
});

// ─── Objectives ↔ competencies ──────────────────────────────────────────────

router.get('/objectives/:id/competencies', requireLearningRead, async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.json({ data: await learningTaxonomySvc.listObjectiveCompetencies(req.user, req.params.id) });
  } catch (err) { next(err); }
});

router.post('/objectives/:id/competencies', requireLearningManage, validate(CompetencyLinkSchema), async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    const { competency_id, weight, is_primary } = req.body;
    const link = await learningTaxonomySvc.linkCompetency(req.user, req.params.id, competency_id, {
      weight: weight ?? 1,
      isPrimary: !!is_primary,
    });
    res.status(201).json(link);
  } catch (err) { next(err); }
});

router.delete('/objectives/:id/competencies/:competencyId', requireLearningManage, async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.json(await learningTaxonomySvc.unlinkCompetency(req.user, req.params.id, req.params.competencyId));
  } catch (err) { next(err); }
});

// ─── Objectives → prerequisites ─────────────────────────────────────────────

router.get('/objectives/:id/prerequisites', requireLearningRead, async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.json(await learningTaxonomySvc.listPrerequisites(req.user, { objectiveId: req.params.id }));
  } catch (err) { next(err); }
});

router.post('/objectives/:id/prerequisites', requireLearningManage, validate(PrerequisiteCreateSchema), async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    const { prerequisite_objective_id, strength, min_mastery_state, rationale } = req.body;
    const edge = await learningTaxonomySvc.addPrerequisite(
      req.user,
      req.params.id,
      prerequisite_objective_id,
      {
        strength: strength ?? 'required',
        minMasteryState: min_mastery_state ?? 'developing',
        rationale: rationale ?? null,
      },
    );
    res.status(201).json(edge);
  } catch (err) { next(err); }
});

router.delete('/objectives/:id/prerequisites/:prerequisiteObjectiveId', requireLearningManage, async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.json(await learningTaxonomySvc.removePrerequisite(
      req.user,
      req.params.id,
      req.params.prerequisiteObjectiveId,
    ));
  } catch (err) { next(err); }
});

// ─── Competencies ───────────────────────────────────────────────────────────

router.get('/competencies', requireLearningRead, validateQuery(CompetencyFilterSchema), async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    const { subject_id, kind, status, search, limit, offset } = req.query;
    res.json(await learningTaxonomySvc.listCompetencies(req.user, {
      subjectId: subject_id || null,
      kind: kind || null,
      status: status || null,
      search: search || null,
      limit,
      offset,
    }));
  } catch (err) { next(err); }
});

router.post('/competencies', requireLearningManage, validate(CompetencyCreateSchema), async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.status(201).json(await learningTaxonomySvc.createCompetency(req.user, req.body));
  } catch (err) { next(err); }
});

router.patch('/competencies/:id', requireLearningManage, validate(CompetencyUpdateSchema), async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.json(await learningTaxonomySvc.updateCompetency(req.user, req.params.id, req.body));
  } catch (err) { next(err); }
});

// Never a hard delete: a referenced competency is archived.
router.post('/competencies/:id/archive', requireLearningManage, async (req, res, next) => {
  try {
    const { learningTaxonomySvc } = getContainer();
    res.json(await learningTaxonomySvc.archiveCompetency(req.user, req.params.id));
  } catch (err) { next(err); }
});

// ─── Question pedagogy ──────────────────────────────────────────────────────

router.get('/questions/:questionId/pedagogy', requireLearningRead, async (req, res, next) => {
  try {
    const { questionPedagogySvc } = getContainer();
    res.json(await questionPedagogySvc.getQuestionPedagogy(req.user, req.params.questionId));
  } catch (err) { next(err); }
});

// Replace the whole criteria set (empty array clears it).
router.put('/questions/:questionId/pedagogy', requireLearningWrite, validate(CriteriaSetSchema), async (req, res, next) => {
  try {
    const { questionPedagogySvc } = getContainer();
    const { criteria, source, mark_reviewed } = req.body;
    res.json(await questionPedagogySvc.setCriteria(req.user, req.params.questionId, criteria, {
      source: source ?? 'manual',
      markReviewed: mark_reviewed !== false,
    }));
  } catch (err) { next(err); }
});

router.post('/questions/:questionId/pedagogy/criteria', requireLearningWrite, validate(CriterionSchema), async (req, res, next) => {
  try {
    const { questionPedagogySvc } = getContainer();
    res.status(201).json(await questionPedagogySvc.addCriterion(req.user, req.params.questionId, req.body));
  } catch (err) { next(err); }
});

router.delete('/questions/:questionId/pedagogy/criteria/:criterionId', requireLearningWrite, async (req, res, next) => {
  try {
    const { questionPedagogySvc } = getContainer();
    res.json(await questionPedagogySvc.removeCriterion(req.user, req.params.questionId, req.params.criterionId));
  } catch (err) { next(err); }
});

router.delete('/questions/:questionId/pedagogy', requireLearningWrite, async (req, res, next) => {
  try {
    const { questionPedagogySvc } = getContainer();
    res.json(await questionPedagogySvc.clearCriteria(req.user, req.params.questionId));
  } catch (err) { next(err); }
});

// Re-derive the cached columns from the stored criteria (post-import upkeep).
router.post('/questions/:questionId/pedagogy/recompute', requireLearningManage, async (req, res, next) => {
  try {
    const { questionPedagogySvc } = getContainer();
    res.json(await questionPedagogySvc.recompute(req.user, req.params.questionId));
  } catch (err) { next(err); }
});

export default router;
