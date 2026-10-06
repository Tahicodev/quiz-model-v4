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
router.get('/', validateQuery(QuestionFilterSchema), async (req, res, next) => {
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

// GET /api/v1/questions/:id
router.get('/:id', async (req, res, next) => {
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
