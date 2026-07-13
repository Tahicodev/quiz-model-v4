/**
 * src/backend/routes/users.routes.js
 *
 * User CRUD endpoints. Admin-only access.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { validate, validateQuery } from '../middleware/validate.js';
import { UserCreateSchema, UserUpdateSchema, UserFilterSchema } from '../../shared/schemas/user.schema.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// GET /api/v1/users
router.get('/', requireRole(ROLES.ADMIN), validateQuery(UserFilterSchema), async (req, res, next) => {
  try {
    const { userSvc } = getContainer();
    const { limit, offset, orderBy, direction, search, ...filters } = req.query;
    const result = await userSvc.list({ ...filters, school_id: req.schoolId }, { limit, offset, orderBy, direction, search });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/users/:id
router.get('/:id', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { userSvc } = getContainer();
    const user = await userSvc.getById(req.params.id);
    res.json(user);
  } catch (err) { next(err); }
});

// POST /api/v1/users
router.post('/', requireRole(ROLES.ADMIN), validate(UserCreateSchema), async (req, res, next) => {
  try {
    const { userSvc, auditSvc } = getContainer();
    const user = await userSvc.create(req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'user', entityId: user.id, action: 'create', ip: req.ip });
    res.status(201).json(user);
  } catch (err) { next(err); }
});

// PATCH /api/v1/users/:id
router.patch('/:id', requireRole(ROLES.ADMIN), validate(UserUpdateSchema), async (req, res, next) => {
  try {
    const { userSvc, auditSvc } = getContainer();
    const updated = await userSvc.update(req.params.id, req.body, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'user', entityId: updated.id, action: 'update', ip: req.ip });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/v1/users/:id
router.delete('/:id', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { userSvc, auditSvc } = getContainer();
    await userSvc.delete(req.params.id, req.user);
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'user', entityId: req.params.id, action: 'delete', ip: req.ip });
    res.status(204).send();
  } catch (err) { next(err); }
});

// POST /api/v1/users/:id/reset-password
router.post('/:id/reset-password', requireRole(ROLES.ADMIN), async (req, res, next) => {
  try {
    const { userSvc } = getContainer();
    const { newPassword } = req.body;
    await userSvc.resetPassword(req.params.id, newPassword, req.user);
    res.json({ message: 'Password reset' });
  } catch (err) { next(err); }
});

export default router;
