/**
 * src/backend/routes/results.routes.js
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { getContainer } from '../container.js';
import { gradeAttempt, grade20 } from '../services/GradingService.js';

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

// GET /api/v1/results/:id/corrections — server-graded answer breakdown for a
// completed attempt (the "Answer Breakdown & Corrections" view in the student
// workspace).
//
// Student browsers never receive question `answer`/`explanation` fields (the
// bootstrap payload strips them as an anti-cheat measure), so the workspace
// cannot grade locally. This endpoint grades the persisted attempt
// server-side and reveals the correct answers + explanations ONLY for:
//   - training/practice attempts (always reviewable), and
//   - exam attempts whose preset explicitly enables explanations
//     (`showExplanations === true`, mirroring the workspace gate).
// Instructors may review any result in their tenant (they already have full
// question-bank access). Every reveal is bound to a persisted attempt row,
// so answer harvesting is audit-visible to teachers via the results list.
router.get('/:id/corrections', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const result = await repo.modelFor('results').findFirst({
      where: { id: req.params.id, school_id: req.schoolId },
    });
    if (!result) throw new NotFoundError('Result');
    assertSelfOrInstructor(req, result.user_id);

    const answersMap = extractAttemptAnswers(result.answers_json);
    const questionIds = Object.keys(answersMap).slice(0, 200);
    if (!questionIds.length) {
      throw new NotFoundError('Attempt answers');
    }

    const mode = String(result.mode || 'training').toLowerCase();
    const isExamAttempt = mode === 'exam' || Boolean(result.exam_id);
    if (isExamAttempt && !isInstructor(req)) {
      const allowed = await examAllowsCorrections(repo, result.exam_id, req.schoolId);
      if (!allowed) {
        throw new ForbiddenError('Corrections are not enabled for this exam');
      }
    }

    const rows = await repo.modelFor('questions').findMany({
      where: { id: { in: questionIds }, school_id: req.schoolId },
    });
    const byId = new Map((rows || []).map((q) => [String(q.id), q]));
    // Preserve the attempt's question order; drop questions that no longer
    // exist (deleted bank rows must not break the breakdown).
    const ordered = questionIds.map((qid) => byId.get(String(qid))).filter(Boolean);

    const { score, total, items } = gradeAttempt(ordered, answersMap);
    const grade = grade20(score, total);
    // Preset pass mark (optional): the workspace sends the attempt's
    // configured passing score; without it the default 50% applies
    // (50% of the /20 grade → grade 10).
    const passingScore = Number(req.query.passing_score ?? req.query.passingScore) || 50;
    const passingGrade = (passingScore / 100) * 20;
    res.json({
      resultId: result.id,
      mode: result.mode || 'training',
      score,
      total,
      grade20: grade,
      passingScore,
      passed: grade + 1e-9 >= passingGrade,
      items: items.map((item) => ({
        questionId: item.questionId,
        type: item.type,
        question: item.question,
        options: item.options,
        userAnswer: item.userAnswer,
        correctAnswer: item.correctAnswer,
        correct: item.correct,
        explanation: item.explanation,
        points: item.points,
      })),
    });
  } catch (err) { next(err); }
});

function parseJsonObject(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

// The persisted answers take several shapes depending on the write path:
//  - POST /results stores the workspace `{ questionId: userAnswer }` map
//    verbatim in `answers_json`;
//  - POST /bulk/results wraps it as `answersPayload.userAnswers` alongside
//    numeric/curated metadata (totalQuestions, grade20, …) which must NOT be
//    mistaken for answers;
//  - legacy writers nest it under `userAnswers`/`answers`.
// Accept all three; ignore non-string values (metadata, not answers).
function extractAttemptAnswers(answersJson) {
  const root = parseJsonObject(answersJson);
  if (!root) return {};
  const pickEntries = (obj) => {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      if ((typeof value === 'string' || typeof value === 'number') && String(key).trim()) {
        out[String(key).trim()] = String(value);
      }
    }
    return out;
  };
  for (const key of ['userAnswers', 'answers']) {
    const nested = parseJsonObject(root[key]);
    if (nested) {
      const out = pickEntries(nested);
      if (Object.keys(out).length) return out;
    }
  }
  // Verbatim map shape has no wrapper keys at all. When a wrapper key is
  // present (even null — bulk metadata shape), the root itself is metadata.
  if ('userAnswers' in root || 'answers' in root) return {};
  return pickEntries(root);
}

// Exam corrections follow the workspace gate: only when the exam's preset
// explicitly enables explanations. The preset snapshot travels on the exam
// row (`options_json.presetSnapshot`) so student devices can enforce the
// same rule offline.
async function examAllowsCorrections(repo, examId, schoolId) {
  if (!examId) return false;
  try {
    const exam = await repo.modelFor('exams').findFirst({
      where: { id: String(examId), school_id: schoolId },
    });
    if (!exam) return false;
    const legacy = parseJsonObject(exam.options_json) || {};
    const snapshot = legacy.presetSnapshot;
    if (!snapshot || typeof snapshot !== 'object') return false;
    return snapshot.showExplanations === true;
  } catch (_) {
    return false;
  }
}

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
router.delete('/:id', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const result = await repo.modelFor('results').findFirst({
      where: { id: req.params.id, school_id: req.schoolId },
      select: { id: true, user_id: true },
    });
    if (!result) return res.status(404).json({ code: 'NOT_FOUND', message: 'Result not found' });
    assertSelfOrInstructor(req, result.user_id);
    await repo.delete('results', result.id);
    res.status(204).send();
  } catch (err) { next(err); }
});

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
    const totalPoints = body.total_points != null
      ? Math.round(Number(body.total_points))
      : (body.totalPoints != null ? Math.round(Number(body.totalPoints)) : 0);
    const earnedPoints = body.earned_points != null
      ? Math.round(Number(body.earned_points))
      : (body.earnedPoints != null ? Math.round(Number(body.earnedPoints)) : 0);
    const mode = String(body.mode || 'training');

    // `score` is stored as a percentage (0-100) per the Result schema.
    // The student workspace now sends the /20 grade directly (grade20),
    // but legacy count-based payloads (score = correct answers) are still
    // normalized here so single-record and bulk writes stay consistent.
    let score;
    if (body.grade20 != null && Number.isFinite(Number(body.grade20))) {
      score = Math.round((Number(body.grade20) / 20) * 10000) / 100; // /20 → %
    } else if (body.score != null && Number.isFinite(Number(body.score))) {
      const raw = Number(body.score);
      if (totalPoints > 0 && earnedPoints > 0 && raw <= totalPoints && raw <= 20) {
        // Legacy count-based score (e.g. 8 correct of 10): convert to %.
        score = Math.round((raw / totalPoints) * 10000) / 100;
      } else if (raw >= 0 && raw <= 20) {
        // /20 grade (e.g. 12.5) → percentage.
        score = Math.round((raw / 20) * 10000) / 100;
      } else {
        score = Math.max(0, Math.min(100, raw)); // already a percentage
      }
    } else {
      score = totalPoints > 0
        ? Math.round((earnedPoints / totalPoints) * 10000) / 100
        : 0;
    }
    score = Math.max(0, Math.min(100, score));

    const resultRow = {
      id: body.id || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'result-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)),
      user_id: body.user_id || body.userId || userId,
      school_id: schoolId,
      exam_id: validExamId,
      score,
      total_points: totalPoints,
      earned_points: earnedPoints,
      time_spent: body.time_spent != null
        ? Math.round(Number(body.time_spent))
        : (body.timeSpent != null ? Math.round(Number(body.timeSpent)) : null),
      mode,
      passed: body.passed != null
        ? Boolean(body.passed)
        : (totalPoints > 0 ? earnedPoints * 2 >= totalPoints : score >= 50),
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

