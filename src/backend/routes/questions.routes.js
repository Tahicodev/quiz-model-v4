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
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// GET /api/v1/questions
router.get('/', validateQuery(QuestionFilterSchema), async (req, res, next) => {
  try {
    const { questionSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, ...filters } = req.query;
    const result = await questionSvc.list({ ...filters, school_id: req.schoolId }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/questions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const { questionSvc } = getContainer();
    const q = await questionSvc.getById(req.params.id);
    res.json(q);
  } catch (err) { next(err); }
});

// POST /api/v1/questions
router.post('/', requireRole([ROLES.ADMIN, ROLES.TEACHER]), validate(QuestionCreateSchema), async (req, res, next) => {
  try {
    const { questionSvc, auditSvc } = getContainer();
    const question = await questionSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'question', entityId: question.id, action: 'create', ip: req.ip });
    res.status(201).json(question);
  } catch (err) { next(err); }
});

// PATCH /api/v1/questions/:id
router.patch('/:id', requireRole([ROLES.ADMIN, ROLES.TEACHER]), validate(QuestionUpdateSchema), async (req, res, next) => {
  try {
    const { questionSvc, auditSvc } = getContainer();
    const updated = await questionSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'question', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/v1/questions/:id
router.delete('/:id', requireRole([ROLES.ADMIN, ROLES.TEACHER]), async (req, res, next) => {
  try {
    const { questionSvc, auditSvc } = getContainer();
    await questionSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'question', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
