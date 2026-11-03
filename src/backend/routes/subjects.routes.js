import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import {
  SubjectCreateSchema,
  SubjectUpdateSchema,
  SubjectFilterSchema,
} from '../../shared/schemas/subject.schema.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);
const MANAGE_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];

function assertOwnership(subject, user) {
  if (subject && user.role === ROLES.TEACHER && String(subject.created_by) !== String(user.id)) {
    throw new ForbiddenError('Not your subject');
  }
}

router.get('/', validateQuery(SubjectFilterSchema), async (req, res, next) => {
  try {
    const { subjectSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, created_by } = req.query;
    const result = await subjectSvc.list({
      school_id: req.schoolId,
      ...(req.user.role === ROLES.TEACHER
        ? { created_by: req.user.id }
        : created_by ? { created_by } : {}),
    }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { subjectSvc } = getContainer();
    const subject = await subjectSvc.getById(req.params.id);
    if (String(subject.school_id) !== String(req.schoolId)) {
      throw new ForbiddenError('Not your subject');
    }
    assertOwnership(subject, req.user);
    res.json(subject);
  } catch (err) { next(err); }
});

router.post('/', requireRole(MANAGE_ROLES), validate(SubjectCreateSchema), async (req, res, next) => {
  try {
    const { subjectSvc, auditSvc } = getContainer();
    const subject = await subjectSvc.create(req.body, req.user);
    await auditSvc.log({
      schoolId: req.schoolId, actorId: req.user.id, entityType: 'subject',
      entityId: subject.id, action: 'create', ip: req.ip,
    });
    res.status(201).json(subject);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(MANAGE_ROLES), validate(SubjectUpdateSchema), async (req, res, next) => {
  try {
    const { subjectSvc, auditSvc } = getContainer();
    const existing = await subjectSvc.getById(req.params.id);
    if (String(existing.school_id) !== String(req.schoolId)) {
      throw new ForbiddenError('Not your subject');
    }
    assertOwnership(existing, req.user);
    const subject = await subjectSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({
      schoolId: req.schoolId, actorId: req.user.id, entityType: 'subject',
      entityId: subject.id, action: 'update', ip: req.ip,
    });
    res.json(subject);
  } catch (err) { next(err); }
});

// Cascade delete: the subject's category forest goes with it (questions
// detach to Uncategorized) and every course generated from those branches
// is removed — answers { categoriesRemoved, coursesRemoved } for the UI.
router.delete('/:id', requireRole(MANAGE_ROLES), async (req, res, next) => {
  try {
    const { subjectSvc, auditSvc } = getContainer();
    const existing = await subjectSvc.getById(req.params.id);
    if (String(existing.school_id) !== String(req.schoolId)) {
      throw new ForbiddenError('Not your subject');
    }
    assertOwnership(existing, req.user);
    const outcome = await subjectSvc.delete(req.params.id, req.user);
    await auditSvc.log({
      schoolId: req.schoolId, actorId: req.user.id, entityType: 'subject',
      entityId: req.params.id, action: 'delete', ip: req.ip,
    });
    res.json(outcome);
  } catch (err) { next(err); }
});

export default router;
