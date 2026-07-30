/**
 * src/backend/routes/results.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

router.get('/', async (req, res, next) => {
  try {
    const { resultSvc } = getContainer();
    const { userId, examId, limit = 50, offset = 0 } = req.query;
    const result = examId
      ? await resultSvc.getByExam(examId, { limit, offset, schoolId: req.schoolId })
      : await resultSvc.getByUser(userId || req.user.id, { limit, offset, schoolId: req.schoolId });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/exam/:examId', async (req, res, next) => {
  try {
    const { resultSvc } = getContainer();
    const { limit = 50, offset = 0 } = req.query;
    const result = await resultSvc.getByExam(req.params.examId, { limit, offset, schoolId: req.schoolId });
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { resultSvc } = getContainer();
    const result = await resultSvc.getById(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/exam/:examId/stats', async (req, res, next) => {
  try {
    const { resultSvc } = getContainer();
    const stats = await resultSvc.getStatsByExam(req.params.examId, req.schoolId);
    res.json(stats);
  } catch (err) { next(err); }
});

router.get('/user/:userId/stats', async (req, res, next) => {
  try {
    const { resultSvc } = getContainer();
    const stats = await resultSvc.getStatsByUser(req.params.userId, req.schoolId);
    res.json(stats);
  } catch (err) { next(err); }
});

export default router;
