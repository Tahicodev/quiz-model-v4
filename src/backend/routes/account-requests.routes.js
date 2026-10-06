/**
 * src/backend/routes/account-requests.routes.js
 * POST / is public (anonymous signup form, rate-limited in server.js).
 * Everything else is admin-only.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';
import { getTeacherClassIds } from './users.routes.js';

const router = Router();

// Public: anonymous account signup. School defaults to 'local' (single-tenant LAN app).
router.post('/', async (req, res, next) => {
  try {
    const { accountRequestSvc, notificationSvc } = getContainer();
    const schoolId = req.body.school_id || 'local';
    const created = await accountRequestSvc.submit(schoolId, req.body);
    await notificationSvc.push({
      schoolId,
      type: 'account_request',
      message: `New account request from ${created.full_name} (${created.username})`,
      data: { requestId: created.id },
    }).catch(() => {});
    const { password_hash, ...safe } = created;
    res.status(201).json(safe);
  } catch (err) { next(err); }
});

router.use(requireAuth, enforceTenant);

const reviewerRoles = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]);

/**
 * Teachers review only account requests targeting their assigned classes.
 * Class-less requests stay admin-only (no scope to attach them to).
 */
async function assertTeacherAccountScope(req) {
  if (req.user.role !== ROLES.TEACHER) return;
  const { accountRequestSvc } = getContainer();
  const target = await accountRequestSvc.getOwned(req.params.id, req.user);
  const classIds = await getTeacherClassIds(req.schoolId, req.user.id);
  if (!target.class_id || !classIds.includes(String(target.class_id))) {
    throw new ForbiddenError('Not your class request');
  }
}

router.get('/', reviewerRoles, async (req, res, next) => {
  try {
    const { accountRequestSvc } = getContainer();
    const teacherClassIds = req.user.role === ROLES.TEACHER
      ? await getTeacherClassIds(req.schoolId, req.user.id)
      : null;
    const result = await accountRequestSvc.listForCaller(req.user, { status: req.query.status, teacherClassIds });
    res.json(result.data);
  } catch (err) { next(err); }
});

router.post('/:id/approve', reviewerRoles, async (req, res, next) => {
  try {
    await assertTeacherAccountScope(req);
    const { accountRequestSvc, auditSvc } = getContainer();
    const result = await accountRequestSvc.approve(req.params.id, req.user, { note: req.body?.note ?? null });
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'account_request', entityId: req.params.id, action: 'approve', ip: req.ip });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:id/reject', reviewerRoles, async (req, res, next) => {
  try {
    await assertTeacherAccountScope(req);
    const { accountRequestSvc, auditSvc } = getContainer();
    const result = await accountRequestSvc.reject(req.params.id, req.user, { note: req.body?.note ?? null });
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'account_request', entityId: req.params.id, action: 'reject', ip: req.ip });
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
