/**
 * src/backend/routes/classes.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { ClassCreateSchema, ClassUpdateSchema, ClassFilterSchema } from '../../shared/schemas/class.schema.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

router.get('/', validateQuery(ClassFilterSchema), async (req, res, next) => {
  try {
    const { classSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, ...filters } = req.query;
    const result = await classSvc.list({ ...filters, school_id: req.schoolId }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { classSvc } = getContainer();
    const cls = await classSvc.getById(req.params.id);
    res.json(cls);
  } catch (err) { next(err); }
});

router.get('/:id/students', async (req, res, next) => {
  try {
    const { classSvc } = getContainer();
    const students = await classSvc.getStudents(req.params.id);
    res.json(students);
  } catch (err) { next(err); }
});

router.post('/', requireRole(ROLES.ADMIN), validate(ClassCreateSchema), async (req, res, next) => {
  try {
    const { classSvc, auditSvc } = getContainer();
    const cls = await classSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'class', entityId: cls.id, action: 'create', ip: req.ip });
    res.status(201).json(cls);
  } catch (err) { next(err); }
});

router.patch('/:id', requireRole(ROLES.ADMIN), validate(ClassUpdateSchema), async (req, res, next) => {
  try {
    const { classSvc, auditSvc } = getContainer();
    const updated = await classSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'class', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { classSvc, auditSvc } = getContainer();
    await classSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'class', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
