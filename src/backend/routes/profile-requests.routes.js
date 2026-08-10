/**
 * src/backend/routes/profile-requests.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

const adminOnly = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]);

router.get('/', async (req, res, next) => {
  try {
    const { profileRequestSvc } = getContainer();
    const result = await profileRequestSvc.listForCaller(req.user, { status: req.query.status });
    res.json(result.data);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { profileRequestSvc } = getContainer();
    const created = await profileRequestSvc.createForUser(req.user, req.body);
    // Notify admins
    const { notificationSvc } = getContainer();
    await notificationSvc.push({
      schoolId: req.schoolId,
      type: 'profile_request',
      message: `${req.user.name || req.user.username} submitted a profile update request`,
      data: { requestId: created.id },
    }).catch(() => {});
    res.status(201).json(created);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { profileRequestSvc } = getContainer();
    res.json(await profileRequestSvc.updatePendingOwn(req.params.id, req.user, req.body));
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { profileRequestSvc } = getContainer();
    await profileRequestSvc.cancelPendingOwn(req.params.id, req.user);
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post('/:id/approve', adminOnly, async (req, res, next) => {
  try {
    const { profileRequestSvc } = getContainer();
    res.json(await profileRequestSvc.review(req.params.id, req.user, {
      approve: true, note: req.body?.note ?? null,
    }));
  } catch (err) { next(err); }
});

router.post('/:id/reject', adminOnly, async (req, res, next) => {
  try {
    const { profileRequestSvc } = getContainer();
    res.json(await profileRequestSvc.review(req.params.id, req.user, {
      approve: false, note: req.body?.note ?? null,
    }));
  } catch (err) { next(err); }
});

export default router;
