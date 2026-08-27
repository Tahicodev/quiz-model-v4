/**
 * src/backend/routes/teacher-messages.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// Teachers create messages to their own classes; admins and super_admins
// can manage any message. PATCH/DELETE stay admin-only because the existing
// service `listForCaller`/`update`/`delete` already enforce ownership.
const authorRoles = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]);
const adminOnly = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]);

router.get('/', async (req, res, next) => {
  try {
    const { teacherMessageSvc } = getContainer();
    const result = await teacherMessageSvc.listForCaller(req.user, { classId: req.query.classId });
    res.json(result.data);
  } catch (err) { next(err); }
});

router.post('/', authorRoles, async (req, res, next) => {
  try {
    const { teacherMessageSvc } = getContainer();
    res.status(201).json(await teacherMessageSvc.create(req.user, req.body));
  } catch (err) { next(err); }
});

router.patch('/:id', adminOnly, async (req, res, next) => {
  try {
    const { teacherMessageSvc } = getContainer();
    res.json(await teacherMessageSvc.update(req.user, req.params.id, req.body));
  } catch (err) { next(err); }
});

router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    const { teacherMessageSvc } = getContainer();
    await teacherMessageSvc.delete(req.user, req.params.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
