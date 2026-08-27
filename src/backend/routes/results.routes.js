/**
 * src/backend/routes/results.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// Students can only read their own results. Admins/teachers (instructor
// roles) can read any result in their tenant. The check is duplicated
// across the per-user endpoints below — once here, once on the per-exam
// listing when a `userId` is provided.
const isInstructor =
  req => req.user && [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.TEACHER].includes(req.user.role);
const assertSelfOrInstructor = (req, targetUserId) => {
  if (!targetUserId) return; // no userId → caller is reading their own
  if (isInstructor(req)) return;
  if (String(req.user.id) === String(targetUserId)) return;
  throw new ForbiddenError('You can only read your own results');
};

router.get('/', async (req, res, next) => {
  try {
    const { resultSvc } = getContainer();
    const { userId, examId, limit = 50, offset = 0 } = req.query;
    if (userId) assertSelfOrInstructor(req, userId);
    const result = examId
      ? await resultSvc.getByExam(examId, { limit, offset, schoolId: req.schoolId })
      : await resultSvc.getByUser(userId || req.user.id, { limit, offset, schoolId: req.schoolId });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/exam/:examId', async (req, res, next) => {
  try {
    const { resultSvc } = getContainer();
    const { userId, limit = 50, offset = 0 } = req.query;
    if (userId) assertSelfOrInstructor(req, userId);
    const result = await resultSvc.getByExam(req.params.examId, {
      userId,
      limit,
      offset,
      schoolId: req.schoolId,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { resultSvc } = getContainer();
    const result = await resultSvc.getById(req.params.id);
    if (result) assertSelfOrInstructor(req, result.user_id);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/exam/:examId/stats', async (req, res, next) => {
  try {
    if (!isInstructor(req)) {
      throw new ForbiddenError('Instructor role required for exam statistics');
    }
    const { resultSvc } = getContainer();
    const stats = await resultSvc.getStatsByExam(req.params.examId, req.schoolId);
    res.json(stats);
  } catch (err) { next(err); }
});

router.get('/user/:userId/stats', async (req, res, next) => {
  try {
    assertSelfOrInstructor(req, req.params.userId);
    const { resultSvc } = getContainer();
    const stats = await resultSvc.getStatsByUser(req.params.userId, req.schoolId);
    res.json(stats);
  } catch (err) { next(err); }
});

export default router;
