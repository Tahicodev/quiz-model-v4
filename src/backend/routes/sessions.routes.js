/**
 * src/backend/routes/sessions.routes.js
 *
 * Exam session management (in-progress exam attempts).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { SessionCreateSchema, SessionAnswerSchema, SessionFilterSchema } from '../../shared/schemas/session.schema.js';
import { getContainer } from '../container.js';

const router = Router();
router.use(requireAuth, enforceTenant);

// Start or resume a session
router.post('/', validate(SessionCreateSchema), async (req, res, next) => {
  try {
    const { sessionSvc, examSvc } = getContainer();
    const { exam_id, duration_minutes } = req.body;

    // Get exam to check duration
    const exam = await examSvc.getById(exam_id);
    const duration = duration_minutes ?? exam.duration ?? 60;

    const session = await sessionSvc.createSession({
      examId: exam_id,
      userId: req.user.id,
      durationMinutes: duration,
    });
    res.status(201).json(session);
  } catch (err) { next(err); }
});

// Get active session for current user + exam
router.get('/active/:examId', async (req, res, next) => {
  try {
    const { sessionSvc } = getContainer();
    const session = await sessionSvc.getActiveSession(req.params.examId, req.user.id);
    if (!session) return res.json(null);
    res.json(session);
  } catch (err) { next(err); }
});

// Save answer
router.post('/:id/answer', validate(SessionAnswerSchema), async (req, res, next) => {
  try {
    const { sessionSvc } = getContainer();
    const { question_id, answer } = req.body;
    const session = await sessionSvc.saveAnswer({
      sessionId: req.params.id,
      questionId: question_id,
      answer,
    });
    res.json(session);
  } catch (err) { next(err); }
});

// Heartbeat (keep session alive)
router.post('/:id/heartbeat', async (req, res, next) => {
  try {
    const { sessionSvc } = getContainer();
    await sessionSvc.heartbeat(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Submit/complete session
router.post('/:id/submit', async (req, res, next) => {
  try {
    const { sessionSvc, resultSvc } = getContainer();
    const result = await sessionSvc.completeSession(req.params.id, resultSvc);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
