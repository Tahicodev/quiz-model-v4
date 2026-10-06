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
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// Exam authoring is shared between admins and teachers. Teachers create and
// manage their own exams; admins keep the master roster. Hard delete and
// class assignment stay admin-only because they affect the whole school.
const EXAM_AUTHORING_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];

/** Teachers see and manage only the exams they created. Admins see all. */
function assertExamOwnership(exam, user) {
  if (!exam) return;
  if (user.role !== ROLES.TEACHER) return;
  if (exam.creator_id !== user.id) {
    throw new ForbiddenError('Not your exam');
  }
}

router.get('/', validateQuery(ExamFilterSchema), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, creator_id, ...filters } = req.query;
    const result = await examSvc.list({
      ...filters,
      school_id: req.schoolId,
      // Teachers are confined to their own exams; a client-supplied
      // creator_id is ignored for them. Admins may filter by author.
      ...(req.user.role === ROLES.TEACHER
        ? { creator_id: req.user.id }
        : (creator_id ? { creator_id } : {})),
    }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const exam = await examSvc.getById(req.params.id);
    if (req.user?.role === ROLES.STUDENT && exam.status !== 'active') {
      return res.status(404).json({ message: 'Exam not found' });
    }
    assertExamOwnership(exam, req.user);
    res.json(exam);
  } catch (err) { next(err); }
});

router.get('/:id/questions', async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const exam = await examSvc.getWithQuestions(req.params.id, req.schoolId);
    if (req.user?.role === ROLES.STUDENT && exam.status !== 'active') {
      return res.status(404).json({ message: 'Exam not found' });
    }
    assertExamOwnership(exam, req.user);
    res.json(exam);
  } catch (err) { next(err); }
});

router.get('/:id/classes', requireRole(EXAM_AUTHORING_ROLES), async (req, res, next) => {
  try {
    const { examSvc, repo } = getContainer();
    await examSvc.getById(req.params.id);
    const result = await repo.getAll('exam_classes', {
      filters: { exam_id: req.params.id },
      limit: 200,
      orderBy: 'assigned_at',
      direction: 'desc',
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/', requireRole(EXAM_AUTHORING_ROLES), validate(ExamCreateSchema), async (req, res, next) => {
  try {
    const { examSvc, auditSvc } = getContainer();
    const exam = await examSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'exam', entityId: exam.id, action: 'create', ip: req.ip });
    res.status(201).json(exam);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(EXAM_AUTHORING_ROLES), validate(ExamUpdateSchema), async (req, res, next) => {
  try {
    const { examSvc, auditSvc } = getContainer();
    assertExamOwnership(await examSvc.getById(req.params.id), req.user);
    const updated = await examSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'exam', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]), async (req, res, next) => {
  try {
    const { examSvc, auditSvc } = getContainer();
    await examSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'exam', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

// Question management
router.post('/:id/questions', requireRole(EXAM_AUTHORING_ROLES), validate(ExamAddQuestionSchema), async (req, res, next) => {
  try {
    const { examSvc, questionSvc } = getContainer();
    assertExamOwnership(await examSvc.getById(req.params.id), req.user);
    // Teachers may only attach their own questions to their exams.
    if (req.user.role === ROLES.TEACHER) {
      const q = await questionSvc.getById(req.body.question_id);
      if (!q || q.created_by !== req.user.id) {
        throw new ForbiddenError('Not your question');
      }
    }
    const link = await examSvc.addQuestion(req.params.id, req.body.question_id, req.body.order_index, req.user);
    res.status(201).json(link);
  } catch (err) { next(err); }
});

router.delete('/:id/questions/:questionId', requireRole(EXAM_AUTHORING_ROLES), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    assertExamOwnership(await examSvc.getById(req.params.id), req.user);
    await examSvc.removeQuestion(req.params.id, req.params.questionId, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.put('/:id/questions/order', requireRole(EXAM_AUTHORING_ROLES), validate(ExamReorderSchema), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    assertExamOwnership(await examSvc.getById(req.params.id), req.user);
    await examSvc.reorderQuestions(req.params.id, req.body.question_ids, req.user);
    res.json({ message: 'Questions reordered' });
  } catch (err) { next(err); }
});

// Lifecycle
router.post('/:id/publish', requireRole(EXAM_AUTHORING_ROLES), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    assertExamOwnership(await examSvc.getById(req.params.id), req.user);
    const exam = await examSvc.publish(req.params.id, req.user);
    res.json(exam);
  } catch (err) { next(err); }
});

router.post('/:id/archive', requireRole(EXAM_AUTHORING_ROLES), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    assertExamOwnership(await examSvc.getById(req.params.id), req.user);
    const exam = await examSvc.archive(req.params.id, req.user);
    res.json(exam);
  } catch (err) { next(err); }
});

// Class assignment
router.post('/:id/classes', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]), validate(ExamAssignClassSchema), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    const link = await examSvc.assignToClass(req.params.id, req.body.class_id, req.user);
    res.status(201).json(link);
  } catch (err) { next(err); }
});

router.delete('/:id/classes/:classId', requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]), async (req, res, next) => {
  try {
    const { examSvc } = getContainer();
    await examSvc.removeFromClass(req.params.id, req.params.classId, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
