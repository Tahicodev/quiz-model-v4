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

// POST /api/v1/results — accept a result from the student workspace
// (training, practice, etc.) and persist it. This complements the
// `bulk/results` endpoint and is what the legacy bridge's `create_sync`
// hits. Students can only create results for themselves.
router.post('/', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const body = req.body || {};
    const userId = String(req.user.id);
    const schoolId = String(req.schoolId);

    const rawExamId = String(body.exam_id || body.examId || '').trim();
    let validExamId = null;
    if (rawExamId) {
      try {
        const exam = await repo.modelFor('exams').findFirst({
          where: { id: rawExamId, school_id: schoolId },
          select: { id: true },
        });
        if (exam) {
          validExamId = exam.id;
        }
      } catch (_) {}
    }

    let answersJson = '';
    if (typeof body.answers_json === 'string' && body.answers_json.trim()) {
      answersJson = body.answers_json.trim();
    } else if (typeof body.answersJson === 'string' && body.answersJson.trim()) {
      answersJson = body.answersJson.trim();
    } else if (body.answers && typeof body.answers === 'object') {
      try {
        answersJson = JSON.stringify(body.answers);
      } catch (_) {
        answersJson = '{}';
      }
    } else {
      answersJson = JSON.stringify({
        examId: rawExamId || null,
        examTitle: body.examTitle || body.examName || null,
        mode: body.mode || 'training',
        userAnswers: body.userAnswers || body.answers || {},
      });
    }

    // The bridge sends the row with a mix of snake_case and camelCase
    // keys; we accept both and normalize to the Prisma schema.
    const resultRow = {
      id: body.id || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'result-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)),
      user_id: body.user_id || body.userId || userId,
      school_id: schoolId,
      exam_id: validExamId,
      score: body.score != null ? Number(body.score) : 0,
      total_points: body.total_points != null
        ? Math.round(Number(body.total_points))
        : (body.totalPoints != null ? Math.round(Number(body.totalPoints)) : 0),
      earned_points: body.earned_points != null
        ? Math.round(Number(body.earned_points))
        : (body.earnedPoints != null ? Math.round(Number(body.earnedPoints)) : 0),
      time_spent: body.time_spent != null
        ? Math.round(Number(body.time_spent))
        : (body.timeSpent != null ? Math.round(Number(body.timeSpent)) : null),
      mode: String(body.mode || 'training'),
      passed: body.passed != null ? Boolean(body.passed) : false,
      attempt_number: body.attempt_number != null
        ? Number(body.attempt_number)
        : (body.attemptNumber != null ? Number(body.attemptNumber) : 1),
      answers_json: answersJson || '{}',
      date_taken: body.date_taken || body.dateTaken || new Date().toISOString(),
    };

    // Prevent students from writing results on behalf of other users.
    if (String(resultRow.user_id) !== userId && !isInstructor(req)) {
      throw new ForbiddenError('You can only save your own results');
    }

    const resultModel = repo.modelFor('results');
    const record = await resultModel.upsert({
      where: { id: resultRow.id },
      create: resultRow,
      update: resultRow,
    });
    res.status(201).json(record);
  } catch (err) { next(err); }
});

export default router;

