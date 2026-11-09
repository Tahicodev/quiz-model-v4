/**
 * src/backend/routes/notifications.routes.js
 *
 * Notification surface:
 *   GET   /feed        role-scoped activity inbox (notifications + audit + results)
 *   PATCH /read        marks the caller's feed as read (per-user watermark)
 *   GET   /            raw tenant notification rows (legacy mirror)
 *   POST  /            records an activity row for the signed-in user
 *
 * Authorship is stamped from the JWT, never trusted from the payload, so a
 * teacher's inbox can safely filter by actor.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { ROLES } from '../../shared/constants.js';
import { getContainer } from '../container.js';
import { getTeacherClassIds } from './users.routes.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// Every signed-in role may record its own activity (students included: quiz
// attempts and account/profile requests are student activity). The actor is
// overwritten server-side, so this is not a broadcast impersonation channel.
const NOTIFICATION_AUTHOR_ROLES = [
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
  ROLES.TEACHER,
  ROLES.STUDENT,
];

// Students cannot pick arbitrary types (an "admin_notice" authored by a
// student would be misleading in the UI). Unknown types are stored as plain
// activity.
const STUDENT_NOTIFICATION_TYPES = new Set([
  'activity',
  'result',
  'profile_request',
  'account_request',
  'student_activity',
]);

router.get('/', async (req, res, next) => {
  try {
    const { notificationSvc } = getContainer();
    const result = await notificationSvc.listForTenant(req.schoolId);
    res.json(result.data);
  } catch (err) { next(err); }
});

// Role-scoped inbox: admin sees the school, teachers see themselves plus the
// students of their assigned classes, students see themselves.
router.get('/feed', async (req, res, next) => {
  try {
    const { notificationFeedSvc } = getContainer();
    const teacherClassIds =
      req.user.role === ROLES.TEACHER
        ? await getTeacherClassIds(req.schoolId, req.user.id)
        : [];
    const feed = await notificationFeedSvc.build({
      schoolId: req.schoolId,
      viewer: { id: req.user.id, role: req.user.role },
      teacherClassIds,
      limit: req.query.limit,
    });
    res.json(feed);
  } catch (err) { next(err); }
});

router.get('/count', async (req, res, next) => {
  try {
    const { notificationFeedSvc } = getContainer();
    const teacherClassIds =
      req.user.role === ROLES.TEACHER
        ? await getTeacherClassIds(req.schoolId, req.user.id)
        : [];
    const feed = await notificationFeedSvc.build({
      schoolId: req.schoolId,
      viewer: { id: req.user.id, role: req.user.role },
      teacherClassIds,
      limit: 1,
    });
    res.json({ unread: feed.unread });
  } catch (err) { next(err); }
});

// Per-user read watermark. Replaces the old tenant-wide read-all, which let
// one user clear everybody else's badge.
router.patch('/read', async (req, res, next) => {
  try {
    const { notificationFeedSvc } = getContainer();
    const result = await notificationFeedSvc.markSeen({
      schoolId: req.schoolId,
      userId: req.user.id,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// Deprecated alias kept for older clients; now scoped to the caller.
router.patch('/read-all', async (req, res, next) => {
  try {
    const { notificationFeedSvc } = getContainer();
    const result = await notificationFeedSvc.markSeen({
      schoolId: req.schoolId,
      userId: req.user.id,
    });
    res.json({ updated: 1, lastSeenAt: result.lastSeenAt });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { notificationSvc, repo } = getContainer();
    const authorId = String(req.user.id || '');
    const author = authorId ? await repo.getById('users', authorId) : null;

    const requestedType = String(req.body?.type || '').trim();
    const type =
      req.user.role === ROLES.STUDENT
        ? STUDENT_NOTIFICATION_TYPES.has(requestedType)
          ? requestedType
          : 'student_activity'
        : requestedType || 'admin_notice';

    const message = String(req.body?.message || '').trim().slice(0, 500);
    if (!message) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'message is required' });
    }

    const incomingData =
      req.body?.data && typeof req.body.data === 'object' && !Array.isArray(req.body.data)
        ? req.body.data
        : {};

    // Server-stamped identity: the client cannot claim another actor.
    const actor = author
      ? {
          id: String(author.id),
          name: author.name || author.username || '',
          username: author.username || '',
          role: author.role || req.user.role,
          studentNumber: author.numero || '',
          classId: author.class_id || '',
          className: '',
        }
      : {
          id: authorId,
          name: req.user.name || req.user.username || '',
          username: req.user.username || '',
          role: req.user.role,
          studentNumber: req.user.numero || '',
          classId: req.user.class_id || '',
          className: '',
        };

    const created = await notificationSvc.push({
      schoolId: req.schoolId,
      type,
      message,
      data: { ...incomingData, actor },
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

export default router;
