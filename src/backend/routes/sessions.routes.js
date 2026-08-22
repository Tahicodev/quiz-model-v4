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

async function getAccessibleSession(id, user, repo) {
  const session = await repo.getById('exam_sessions', id);
  if (!session) return null;
  if (String(session.school_id) !== String(user?.school_id)) return null;
  const isAdmin = ['admin', 'super_admin'].includes(user?.role);
  return isAdmin || String(session.user_id) === String(user?.id) ? session : null;
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function canStudentStartExam(exam, user, repo) {
  if (user?.role !== 'student') return true;
  if (exam?.status !== 'active' || String(exam.school_id) !== String(user.school_id)) return false;

  const { data: links } = await repo.getAll('exam_classes', {
    filters: { exam_id: exam.id },
    limit: 200,
  });
  const assignedClassIds = (links || []).map((link) => String(link.class_id || '').trim()).filter(Boolean);
  if (!assignedClassIds.length) {
    const legacyClasses = parseJson(exam.options_json, {}).classes;
    if (!Array.isArray(legacyClasses) || !legacyClasses.length) return true;
    const classRow = user.class_id ? await repo.getById('classes', user.class_id) : null;
    const studentClassId = String(user.class_id || '').trim().toLowerCase();
    const studentClassName = String(classRow?.name || '').trim().toLowerCase();
    return legacyClasses.some((value) => {
      const normalized = String(value?.id || value?.classId || value?.name || value || '').trim().toLowerCase();
      return normalized === studentClassId || normalized === studentClassName;
    });
  }
  return Boolean(user.class_id && assignedClassIds.includes(String(user.class_id)));
}

// Start or resume a session
router.post('/', validate(SessionCreateSchema), async (req, res, next) => {
  try {
    const { sessionSvc, examSvc } = getContainer();
    const { exam_id, duration_minutes } = req.body;

    // Get exam to check duration
    const exam = await examSvc.getById(exam_id);
    const { repo } = getContainer();
    if (String(exam.school_id) !== String(req.schoolId)) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    if (!await canStudentStartExam(exam, req.user, repo)) {
      return res.status(404).json({ message: 'Exam not found' });
    }
    const duration = duration_minutes ?? exam.duration ?? 60;

    const session = await sessionSvc.createSession({
      examId: exam_id,
      userId: req.user.id,
      durationMinutes: duration,
    });
    res.status(201).json(session);
  } catch (err) { next(err); }
});

// Resume an existing attempt. Students can only read their own session;
// admins may inspect sessions through this endpoint for support purposes.
router.get('/:id', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const session = await getAccessibleSession(req.params.id, req.user, repo);
    if (!session) return res.status(404).json({ message: 'Session not found' });
    res.json(session);
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
    const { sessionSvc, repo } = getContainer();
    if (!await getAccessibleSession(req.params.id, req.user, repo)) {
      return res.status(404).json({ message: 'Session not found' });
    }
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
    const { sessionSvc, repo } = getContainer();
    if (!await getAccessibleSession(req.params.id, req.user, repo)) {
      return res.status(404).json({ message: 'Session not found' });
    }
    await sessionSvc.heartbeat(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Submit/complete session
router.post('/:id/submit', async (req, res, next) => {
  try {
    const { sessionSvc, resultSvc, repo } = getContainer();
    if (!await getAccessibleSession(req.params.id, req.user, repo)) {
      return res.status(404).json({ message: 'Session not found' });
    }
    const result = await sessionSvc.completeSession(req.params.id, resultSvc);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
