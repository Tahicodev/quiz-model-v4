/**
 * src/backend/routes/profile-requests.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { requireRole } from '../middleware/role.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';
import { assertTeacherStudent, getTeacherClassIds } from './users.routes.js';

const router = Router();
router.use(requireAuth, enforceTenant);

const adminOnly = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN]);
const reviewerRoles = requireRole([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER]);

/**
 * Teachers review only requests of students in their assigned classes, and
 * may not move a student out of scope via a class change. Admins review all.
 */
async function assertTeacherRequestScope(req) {
  if (req.user.role !== ROLES.TEACHER) return;
  const { profileRequestSvc, repo } = getContainer();
  const pr = await profileRequestSvc.getOwned(req.params.id, req.user);
  const target = await repo.getById('users', pr.user_id);
  await assertTeacherStudent(target, req);
  let changes = {};
  try {
    changes = JSON.parse(pr.changes_json || '{}') || {};
  } catch {
    changes = {};
  }
  if (changes.classId) {
    const classIds = await getTeacherClassIds(req.schoolId, req.user.id);
    if (!classIds.includes(String(changes.classId))) {
      throw new ForbiddenError('Cannot move a student out of your classes');
    }
  }
}

router.get('/', async (req, res, next) => {
  try {
    const { profileRequestSvc } = getContainer();
    const teacherClassIds = req.user.role === ROLES.TEACHER
      ? await getTeacherClassIds(req.schoolId, req.user.id)
      : null;
    const result = await profileRequestSvc.listForCaller(req.user, { status: req.query.status, teacherClassIds });
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

router.post('/:id/approve', reviewerRoles, async (req, res, next) => {
  try {
    await assertTeacherRequestScope(req);
    const { profileRequestSvc } = getContainer();
    res.json(await profileRequestSvc.review(req.params.id, req.user, {
      approve: true, note: req.body?.note ?? null,
    }));
  } catch (err) { next(err); }
});

router.post('/:id/reject', reviewerRoles, async (req, res, next) => {
  try {
    await assertTeacherRequestScope(req);
    const { profileRequestSvc } = getContainer();
    res.json(await profileRequestSvc.review(req.params.id, req.user, {
      approve: false, note: req.body?.note ?? null,
    }));
  } catch (err) { next(err); }
});

export default router;
