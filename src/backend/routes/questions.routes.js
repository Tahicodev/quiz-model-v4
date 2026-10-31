/**
 * src/backend/routes/questions.routes.js
 *
 * Question CRUD endpoints. Reference implementation from the spec.
 */

import { Router } from 'express';
import { logger } from '../logger.js';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { QuestionCreateSchema, QuestionUpdateSchema, QuestionFilterSchema } from '../../shared/schemas/question.schema.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

/**
 * Teachers are strictly confined to their own rows. Legacy unattributed
 * rows (created_by NULL) are NOT visible to teachers — every teacher sees
 * only the questions they authored; admins see all.
 */
function assertOwnership(row, user) {
  if (!row) return;
  if (user.role !== ROLES.TEACHER) return;
  if (row.created_by !== user.id) {
    throw new ForbiddenError('Not your question');
  }
}

// GET /api/v1/questions
// Questions carry their `answer` and `explanation` fields, so the bank is
// staff-only. Students never call this route — they receive a projected,
// answer-stripped question list from /bootstrap (and during an exam session).
router.get('/', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), validateQuery(QuestionFilterSchema), async (req, res, next) => {
  try {
    const { questionSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, created_by, ...filters } = req.query;
    // Teachers see only their own rows. Admins see all, optionally
    // narrowed to one author via ?created_by=.
    const or = req.user.role === ROLES.TEACHER
      ? [{ created_by: req.user.id }]
      : null;
    const result = await questionSvc.list(
      { ...filters, school_id: req.schoolId, ...(created_by && req.user.role !== ROLES.TEACHER ? { created_by } : {}), ...(or ? { or } : {}) },
      { limit, offset, orderBy, direction, search },
    );
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/questions/usage
// Aggregated "where is this question used" map for the Questions tab: every
// game, tournament, training activity and exam that references each question.
// Computed by backend aggregation (one call, school-scoped) instead of the
// client pulling whole collections. Read-only. Category membership is
// intentionally omitted — the question row already carries its category, so
// the client renders that chip locally. Must be declared before '/:id'.
router.get('/usage', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const schoolId = req.schoolId;
    // Game/Tournament store question ids as a JSON string array; defensive parse.
    const parseIds = (v) => {
      if (Array.isArray(v)) return v.map(String).filter(Boolean);
      try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p.map(String).filter(Boolean) : []; }
      catch (_) { return []; }
    };
    const [games, tournaments, exams, examLinks] = await Promise.all([
      repo.modelFor('game').findMany({ where: { school_id: schoolId }, select: { name: true, question_ids: true } }),
      repo.modelFor('tournament').findMany({ where: { school_id: schoolId }, select: { name: true, question_ids: true } }),
      repo.modelFor('exam').findMany({ where: { school_id: schoolId }, select: { id: true, name: true, is_training: true } }),
      // exam_questions has no school_id column; scope through the exam relation.
      repo.modelFor('examQuestion').findMany({ where: { exam: { school_id: schoolId } }, select: { exam_id: true, question_id: true } }),
    ]);
    const examMeta = new Map(exams.map((e) => [e.id, { name: e.name, training: !!e.is_training }]));
    const usage = Object.create(null);
    const bucket = (qid) => usage[qid] || (usage[qid] = { games: [], tournaments: [], training: [], exams: [] });
    const push = (qid, key, name) => { const u = bucket(qid); if (name && u[key].indexOf(name) === -1) u[key].push(name); };
    for (const g of games) for (const qid of parseIds(g.question_ids)) push(qid, 'games', g.name);
    for (const t of tournaments) for (const qid of parseIds(t.question_ids)) push(qid, 'tournaments', t.name);
    for (const l of examLinks) {
      const meta = examMeta.get(l.exam_id);
      if (!meta) continue;
      push(l.question_id, meta.training ? 'training' : 'exams', meta.name);
    }
    // Drop questions with no cross-container usage to keep the payload small.
    const out = {};
    for (const qid of Object.keys(usage)) {
      const u = usage[qid];
      if (u.games.length + u.tournaments.length + u.training.length + u.exams.length > 0) out[qid] = u;
    }
    res.json({ usage: out });
  } catch (err) { next(err); }
});

// GET /api/v1/questions/:id
router.get('/:id', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const { questionSvc } = getContainer();
    const q = await questionSvc.getById(req.params.id);
    assertOwnership(q, req.user);
    res.json(q);
  } catch (err) { next(err); }
});

// POST /api/v1/questions
router.post('/', requireRole([ROLES.ADMIN, ROLES.TEACHER]), validate(QuestionCreateSchema), async (req, res, next) => {
  try {
    const { questionSvc, auditSvc } = getContainer();
    // Teachers may only file new questions under their own categories.
    if (req.user.role === ROLES.TEACHER && req.body?.category_id) {
      const { categorySvc } = getContainer();
      const cat = await categorySvc.getById(req.body.category_id);
      if (!cat || cat.created_by !== req.user.id) {
        throw new ForbiddenError('Not your category');
      }
    }
    const question = await questionSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'question', entityId: question.id, action: 'create', ip: req.ip });
    res.status(201).json(question);
  } catch (err) { next(err); }
});

// PATCH /api/v1/questions/:id
router.patch('/:id', requireRole([ROLES.ADMIN, ROLES.TEACHER]), validate(QuestionUpdateSchema), async (req, res, next) => {
  try {
    const { questionSvc, auditSvc } = getContainer();
    assertOwnership(await questionSvc.getById(req.params.id), req.user);
    // Teachers may only file their questions under their own categories.
    if (req.user.role === ROLES.TEACHER && req.body?.category_id) {
      const { categorySvc } = getContainer();
      const cat = await categorySvc.getById(req.body.category_id);
      if (!cat || cat.created_by !== req.user.id) {
        throw new ForbiddenError('Not your category');
      }
    }
    const updated = await questionSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'question', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/v1/questions/:id
router.delete('/:id', requireRole([ROLES.ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const { questionSvc, auditSvc } = getContainer();
    assertOwnership(await questionSvc.getById(req.params.id), req.user);
    await questionSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'question', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
