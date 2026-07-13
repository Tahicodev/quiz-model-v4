/**
 * src/backend/routes/exams.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { ExamCreateSchema, ExamUpdateSchema, ExamFilterSchema, ExamAddQuestionSchema, ExamReorderSchema, ExamAssignClassSchema } from '../../shared/schemas/exam.schema.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

router.get('/', validateQuery(ExamFilterSchema), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, ...filters } = req.query;
    const result = await examSvc.list({ ...filters, school_id: req.schoolId }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const exam = await examSvc.getById(req.params.id);
    res.json(exam);
  } catch (err) { next(err); }
});

router.get('/:id/questions', async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const exam = await examSvc.getWithQuestions(req.params.id, req.schoolId);
    res.json(exam);
  } catch (err) { next(err); }
});

router.post('/', requireRole(ROLES.ADMIN), validate(ExamCreateSchema), async (req, res, next) => {
  try {
    const { examSvc, auditSvc } = getContainer();
    const exam = await examSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'exam', entityId: exam.id, action: 'create', ip: req.ip });
    res.status(201).json(exam);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(ROLES.ADMIN), validate(ExamUpdateSchema), async (req, res, next) => {
  try {
    const { examSvc, auditSvc } = getContainer();
    const updated = await examSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'exam', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { examSvc, auditSvc } = getContainer();
    await examSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'exam', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

// Question management
router.post('/:id/questions', requireRole(ROLES.ADMIN), validate(ExamAddQuestionSchema), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const link = await examSvc.addQuestion(req.params.id, req.body, req.user);
    res.status(201).json(link);
  } catch (err) { next(err); }
});

router.delete('/:id/questions/:questionId', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    await examSvc.removeQuestion(req.params.id, req.params.questionId, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.put('/:id/questions/order', requireRole(ROLES.ADMIN), validate(ExamReorderSchema), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    await examSvc.reorderQuestions(req.params.id, req.body.question_ids, req.user);
    res.json({ message: 'Questions reordered' });
  } catch (err) { next(err); }
});

// Lifecycle
router.post('/:id/publish', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const exam = await examSvc.publish(req.params.id, req.user);
    res.json(exam);
  } catch (err) { next(err); }
});

router.post('/:id/archive', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const exam = await examSvc.archive(req.params.id, req.user);
    res.json(exam);
  } catch (err) { next(err); }
});

// Class assignment
router.post('/:id/classes', requireRole(ROLES.ADMIN), validate(ExamAssignClassSchema), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const link = await examSvc.assignToClass(req.params.id, req.body, req.user);
    res.status(201).json(link);
  } catch (err) { next(err); }
});

router.delete('/:id/classes/:classId', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    await examSvc.removeFromClass(req.params.id, req.params.classId, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
