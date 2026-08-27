/**
 * src/backend/routes/teacher-assignments.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// Teachers can create their own assignments; admin-only for PATCH/DELETE
// because the service enforces ownership on update/delete.
const authorRoles = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]);
const adminOnly = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]);

router.get('/', async (req, res, next) => {
  try {
    const { teacherAssignmentSvc } = getContainer();
    const result = await teacherAssignmentSvc.listForCaller(req.user, { classId: req.query.classId });
    res.json(result.data);
  } catch (err) { next(err); }
});

router.post('/', authorRoles, async (req, res, next) => {
  try {
    const { teacherAssignmentSvc } = getContainer();
    res.status(201).json(await teacherAssignmentSvc.create(req.user, req.body));
  } catch (err) { next(err); }
});

router.patch('/:id', adminOnly, async (req, res, next) => {
  try {
    const { teacherAssignmentSvc } = getContainer();
    res.json(await teacherAssignmentSvc.update(req.user, req.params.id, req.body));
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { teacherAssignmentSvc } = getContainer();
    await teacherAssignmentSvc.delete(req.user, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
