/**
 * src/backend/routes/notifications.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// Notifications are a school-wide broadcast channel. Only admins, super
// admins, and teachers (for their own class-scoped notifications) can post.
const NOTIFICATION_AUTHOR_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER];

router.get('/', async (req, res, next) => {
  try {
    const { notificationSvc } = getContainer();
    const result = await notificationSvc.listForTenant(req.schoolId);
    res.json(result.data);
  } catch (err) { next(err); }
});

router.get('/count', async (req, res, next) => {
  try {
    const { notificationSvc } = getContainer();
    res.json({ unread: await notificationSvc.countUnread(req.schoolId) });
  } catch (err) { next(err); }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    const { notificationSvc } = getContainer();
    res.json({ updated: await notificationSvc.markAllRead(req.schoolId) });
  } catch (err) { next(err); }
});

// Restricted endpoint — the UI uses this for admin/teacher-authored notices.
router.post('/', requireRole(NOTIFICATION_AUTHOR_ROLES), async (req, res, next) => {
  try {
    const { notificationSvc } = getContainer();
    const created = await notificationSvc.push({
      schoolId: req.schoolId,
      type: req.body.type || 'admin_notice',
      message: req.body.message || '',
      data: req.body.data ?? null,
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

export default router;
