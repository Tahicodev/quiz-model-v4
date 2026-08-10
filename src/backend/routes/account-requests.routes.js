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
import { getContainer } from '../container.js';

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

router.use(requireAuth, enforceTenant, requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]));

router.get('/', async (req, res, next) => {
  try {
    const { accountRequestSvc } = getContainer();
    const result = await accountRequestSvc.listForCaller(req.user, { status: req.query.status });
    res.json(result.data);
  } catch (err) { next(err); }
});

router.post('/:id/approve', async (req, res, next) => {
  try {
    const { accountRequestSvc, auditSvc } = getContainer();
    const result = await accountRequestSvc.approve(req.params.id, req.user, { note: req.body?.note ?? null });
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'account_request', entityId: req.params.id, action: 'approve', ip: req.ip });
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:id/reject', async (req, res, next) => {
  try {
    const { accountRequestSvc, auditSvc } = getContainer();
    const result = await accountRequestSvc.reject(req.params.id, req.user, { note: req.body?.note ?? null });
    await auditSvc.log({ schoolId: req.schoolId, actorId: req.user.id, entityType: 'account_request', entityId: req.params.id, action: 'reject', ip: req.ip });
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
