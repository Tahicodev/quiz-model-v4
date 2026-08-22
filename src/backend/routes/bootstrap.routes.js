/**
 * src/backend/routes/bootstrap.routes.js
 *
 * /api/v1/bootstrap — bulk read-only preload of everything the current school
 * is allowed to see. Used once at page load by the legacy-bridge shim so the
 * legacy MPA scripts have the data they expect synchronously cacheable.
 *
 * Auth: admin or student (tenant-scoped via requireAuth + enforceTenant).
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { getContainer } from '../container.js';
import { logger } from '../logger.js';
import { ROLES } from '../../shared/constants.js';

const router = Router();

// Tables exposed to the legacy preload. Order irrelevant — we read them all
// in one pass. Excludes server-owned tables (audit_logs, refresh_tokens) and
// any join table that is already embedded inside its parent's payload shape.
const PRELOAD_TABLES = [
  'schools',
  'classes',
  'categories',
  'users',
  'questions',
  'exams',
  'exam_questions',
  'exam_classes',
  'results',
  'games',
  'game_sessions',
  'tournaments',
  'tournament_entries',
  'exam_sessions',
  'settings',
  'profile_requests',
  'account_requests',
  'game_presets',
  'notifications',
  'teacher_messages',
  'teacher_assignments',
];

// Tables with a direct school_id column. Join tables are scoped through their
// parent records instead, while schools are scoped by their primary key.
const DIRECT_SCHOOL_TABLES = new Set([
  'classes',
  'categories',
  'users',
  'questions',
  'exams',
  'results',
  'games',
  'game_sessions',
  'tournaments',
  'tournament_entries',
  'exam_sessions',
  'settings',
  'profile_requests',
  'account_requests',
  'game_presets',
  'notifications',
  'teacher_messages',
  'teacher_assignments',
]);

const STATUS_QUERY = {
  schools:            (schoolId) => ({ filters: { id: schoolId }, orderBy: 'created_at' }),
  results:            (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'date_taken' }),
  exam_questions:     (schoolId) => ({ filters: { exam: { school_id: schoolId } }, orderBy: 'order_index' }),
  exam_classes:       (schoolId) => ({ filters: { exam: { school_id: schoolId } }, orderBy: 'assigned_at' }),
  game_sessions:      (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'joined_at' }),
  tournament_entries: (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'registered_at' }),
  exam_sessions:      (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'started_at' }),
  settings:           (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'updated_at' }),
  profile_requests:   (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'created_at' }),
  account_requests:   (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'created_at' }),
  game_presets:       (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'created_at' }),
  notifications:      (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'created_at' }),
  teacher_messages:   (schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'date' }),
  teacher_assignments:(schoolId) => ({ filters: { school_id: schoolId }, orderBy: 'created_at' }),
};

function queryForTable(table, schoolId) {
  return STATUS_QUERY[table]?.(schoolId) || {
    filters: DIRECT_SCHOOL_TABLES.has(table) ? { school_id: schoolId } : {},
    orderBy: 'created_at',
  };
}

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

/**
 * The legacy workspace is still a supported student surface. Prisma returns
 * normalized snake_case rows and junction tables, while that surface expects
 * the old `{ questions, classes }` exam shape. Hydrate that compatibility
 * shape from the normalized rows without changing the database source of
 * truth.
 */
function hydrateLegacyPayload(data) {
  // The browser only needs the public profile fields. Never mirror password
  // hashes into localStorage/IndexedDB while preparing the legacy payload.
  data.users = (data.users || []).map(({ password_hash, ...user }) => ({
    ...user,
    studentNumber: user.studentNumber || user.numero || '',
    classId: user.classId || user.class_id || '',
    className: user.className || user.class_name || '',
    number: user.number || user.numero || '',
  }));

  const questions = (data.questions || []).map((question) => ({
    ...question,
    question: question.question || question.text,
    options: parseJson(question.options_json, question.options || []),
  }));
  data.questions = questions;

  data.results = (data.results || []).map((result) => {
    const payload = parseJson(result.answers_json, {});
    return {
      ...result,
      examId: result.exam_id || payload.examId || '',
      userId: result.user_id,
      examName: payload.examTitle || payload.examName || '',
      numero: payload.numero || '',
      studentName: payload.studentName || payload.name || '',
      classId: payload.classId || '',
      className: payload.class || payload.className || '',
      totalQuestions: payload.totalQuestions || result.total_points || 0,
      earnedPoints: result.earned_points,
      date: result.date_taken,
      dateTaken: result.date_taken,
    };
  });

  const studentsByClass = new Map();
  for (const user of data.users || []) {
    if (!user.class_id) continue;
    if (!studentsByClass.has(String(user.class_id))) studentsByClass.set(String(user.class_id), []);
    studentsByClass.get(String(user.class_id)).push({
      id: user.id,
      number: user.numero || '',
      name: user.name || user.username || '',
    });
  }
  data.classes = (data.classes || []).map((classRow) => ({
    ...classRow,
    students: studentsByClass.get(String(classRow.id)) || [],
  }));
  const classNamesById = new Map((data.classes || []).map((classRow) => [String(classRow.id), classRow.name]));
  data.users = (data.users || []).map((user) => ({
    ...user,
    className: user.className || classNamesById.get(String(user.class_id || user.classId || '')) || '',
  }));

  const questionIdsByExam = new Map();
  for (const link of data.exam_questions || []) {
    const key = String(link.exam_id || '');
    if (!key) continue;
    if (!questionIdsByExam.has(key)) questionIdsByExam.set(key, []);
    questionIdsByExam.get(key).push(link.question_id);
  }

  const classIdsByExam = new Map();
  for (const link of data.exam_classes || []) {
    const key = String(link.exam_id || '');
    if (!key) continue;
    if (!classIdsByExam.has(key)) classIdsByExam.set(key, []);
    classIdsByExam.get(key).push(link.class_id);
  }

  data.exams = (data.exams || []).map((exam) => {
    const legacy = parseJson(exam.options_json, {});
    const normalizedQuestionIds = questionIdsByExam.get(String(exam.id)) || [];
    const normalizedClassIds = classIdsByExam.get(String(exam.id)) || [];
    return {
      ...exam,
      questions: normalizedQuestionIds.length ? normalizedQuestionIds : (legacy.questions || []),
      classes: normalizedClassIds.length ? normalizedClassIds : (legacy.classes || []),
      passingScore: exam.passing_score,
      isTraining: exam.is_training,
      maxAttempts: exam.max_attempts,
    };
  });

  const usersById = new Map((data.users || []).map((user) => [String(user.id), user]));
  const sessionsByGame = new Map();
  for (const session of data.game_sessions || []) {
    const key = String(session.game_id || '');
    if (!key) continue;
    if (!sessionsByGame.has(key)) sessionsByGame.set(key, []);
    const user = usersById.get(String(session.user_id));
    sessionsByGame.get(key).push({
      userId: session.user_id,
      name: user?.name || user?.username || 'Player',
      score: session.score || 0,
      connected: session.connected,
      completed: session.completed,
    });
  }
  data.games = (data.games || []).map((game) => {
    const settings = parseJson(game.settings_json, {});
    const participants = sessionsByGame.get(String(game.id)) || settings.session?.participants || [];
    return {
      ...game,
      status: game.status === 'waiting' ? 'open' : game.status === 'active' ? 'live' : game.status === 'finished' ? 'completed' : game.status,
      joinCode: game.join_code,
      questionIds: parseJson(game.question_ids, []),
      questions: parseJson(game.question_ids, []),
      settings: { ...settings, session: { ...(settings.session || {}), participants } },
      session: { ...(settings.session || {}), participants },
    };
  });

  const entriesByTournament = new Map();
  for (const entry of data.tournament_entries || []) {
    const key = String(entry.tournament_id || '').trim();
    if (!key) continue;
    if (!entriesByTournament.has(key)) entriesByTournament.set(key, []);
    const user = usersById.get(String(entry.user_id));
    entriesByTournament.get(key).push({
      id: entry.user_id,
      userId: entry.user_id,
      name: user?.name || user?.username || 'Player',
      score: entry.score || 0,
      rank: entry.rank,
      completed: entry.completed,
      joinedAt: entry.registered_at,
    });
  }
  data.tournaments = (data.tournaments || []).map((tournament) => {
    const settings = parseJson(tournament.settings_json, {});
    const participants = entriesByTournament.get(String(tournament.id)) || settings.participants || [];
    return {
      ...tournament,
      settings,
      participants,
      leaderboard: participants,
    };
  });
  return data;
}

router.use(requireAuth, enforceTenant);

// ── GET /api/v1/bootstrap ────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const isAdmin = [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user?.role);
    const isStudent = req.user?.role === ROLES.STUDENT;
    // Students must never receive the admin-only queues.
    const SKIP_FOR_STUDENT = new Set(['account_requests', 'notifications']);
    const data = {};
    for (const table of PRELOAD_TABLES) {
      if (isStudent && SKIP_FOR_STUDENT.has(table)) { data[table] = []; continue; }
      try {
        const query = queryForTable(table, req.schoolId);
        // Role-scoped narrowing on top of the school filter.
        if (isStudent) {
          if (table === 'profile_requests') query.filters.user_id = req.user.id;
          if (table === 'teacher_messages' || table === 'teacher_assignments') {
            query.filters.class_id = req.user.class_id ?? '__none__';
          }
        }
        const { data: rows } = await repo.getAll(table, { ...query, limit: 100000 });
        data[table] = rows;
      } catch (err) {
        logger.warn({ err, table }, 'Bootstrap: per-table read failed');
        data[table] = [];
      }
    }
    if (isStudent) {
      // Students receive only publishable learning content and live/open
      // activities. Draft administration records must never be exposed to a
      // browser cache merely because the tenant owns them.
      const studentClassId = String(req.user?.class_id || '').trim();
      const studentClassName = String(
        (data.classes || []).find((classRow) => String(classRow.id) === studentClassId)?.name || '',
      ).trim().toLowerCase();
      const assignedClassesByExam = new Map();
      for (const link of data.exam_classes || []) {
        const examId = String(link.exam_id || '').trim();
        if (!examId) continue;
        if (!assignedClassesByExam.has(examId)) assignedClassesByExam.set(examId, []);
        assignedClassesByExam.get(examId).push(String(link.class_id || '').trim());
      }
      data.exams = (data.exams || []).filter((exam) => {
        if (exam.status !== 'active') return false;
        // If an exam has normalized class assignments, expose it only to a
        // student in one of those classes. Exams without assignments remain
        // visible for backwards compatibility with legacy published exams.
        const assigned = assignedClassesByExam.get(String(exam.id)) || [];
        if (!assigned.length || !studentClassId) return true;
        if (assigned.includes(studentClassId)) return true;
        const legacyClasses = parseJson(exam.options_json, {}).classes;
        return Array.isArray(legacyClasses) && legacyClasses.some((value) => {
          const normalized = String(value?.id || value?.classId || value?.name || value || '').trim().toLowerCase();
          return normalized === studentClassId.toLowerCase() || normalized === studentClassName;
        });
      });
      // Results are private student records. Other participants remain
      // available through the dedicated game/tournament leaderboard routes.
      data.results = (data.results || []).filter((result) => String(result.user_id) === String(req.user.id));
      data.exam_sessions = (data.exam_sessions || []).filter((session) => String(session.user_id) === String(req.user.id));
      data.tournaments = (data.tournaments || []).filter((tournament) =>
        ['open', 'active', 'finished'].includes(tournament.status),
      );
    }
    res.json({ school_id: req.schoolId, data: hydrateLegacyPayload(data) });
  } catch (err) {
    next(err);
  }
});

export default router;
