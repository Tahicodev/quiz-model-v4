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
 * Restore question metadata that the Prisma schema cannot store. The write
 * paths (api-client.js mapper, bulk.routes.js sanitizer) encode the legacy
 * flags (allowMultipleAnswers, isDraggable, odd-one-out, code metadata)
 * inside the `answer` string — the only field guaranteed to round-trip.
 * Decode `multi::` / `meta::` prefixes here so every consumer (training,
 * exams, games, tournaments) sees the original shape again.
 */
function decodeQuestionMetadata(question) {
  const rawAnswer = String(question.answer ?? '');

  if (rawAnswer.startsWith('multi::')) {
    const tokens = rawAnswer
      .slice('multi::'.length)
      .split('|')
      .map((t) => t.trim())
      .filter(Boolean);
    return {
      ...question,
      allowMultipleAnswers: true,
      answer: tokens.join(','),
    };
  }

  if (rawAnswer.startsWith('meta::')) {
    const rest = rawAnswer.slice('meta::'.length);
    const separatorIndex = rest.indexOf('::');
    if (separatorIndex > 0) {
      const encoded = rest.slice(0, separatorIndex);
      const payload = rest.slice(separatorIndex + 2);
      try {
        const meta = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        const decoded = { ...question, answer: payload };
        if (meta.multi) decoded.allowMultipleAnswers = true;
        if (meta.drag) decoded.isDraggable = true;
        if (meta.odd) decoded.oddOneOut = true;
        if (meta.code) {
          decoded.codeSnippet = meta.code.snippet || '';
          decoded.codeLanguage = meta.code.language || 'javascript';
          decoded.codeAnswerMode = meta.code.mode || 'multiple-choice';
          decoded.type = 'code';
        }
        return decoded;
      } catch (decodeErr) {
        logger.warn({ err: decodeErr }, 'Bootstrap: question meta decode failed');
      }
    }
  }

  if (rawAnswer && !question.allowMultipleAnswers) {
    // No prefix on this row. Fall back to the multi-answer heuristic: a
    // comma-joined answer whose tokens all match stored options means the
    // multi flag was lost by an older write path.
    try {
      const options = parseJson(question.options_json, []);
      if (Array.isArray(options) && options.length) {
        const tokens = rawAnswer.split(',').map((t) => t.trim()).filter(Boolean);
        if (
          tokens.length > 1 &&
          tokens.every((t) =>
            options.some((o) => String(o || '').trim().toLowerCase() === t.toLowerCase()),
          )
        ) {
          return { ...question, allowMultipleAnswers: true };
        }
      }
    } catch (_) { /* heuristic only */ }
  }

  return question;
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
    // Teacher/staff contacts: spread snake_case + parse subjects_json into a
    // plain array so the legacy UI's user modal can pre-fill them.
    email: user.email ?? null,
    phone: user.phone ?? null,
    subjects: Array.isArray(user.subjects)
      ? user.subjects
      : parseJson(user.subjects_json, []),
    ...(user.gamification_json ? parseJson(user.gamification_json, {}) : {}),
  }));

  const questions = (data.questions || []).map((question) => {
    const decoded = decodeQuestionMetadata(question);
    return {
      ...decoded,
      question: decoded.question || decoded.text,
      options: parseJson(decoded.options_json, decoded.options || []),
    };
  });
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
      // Authoritative /20 grade computed by the student workspace, when the
      // writer recorded it (may be absent on older rows).
      grade20:
        payload.grade20 != null
          ? payload.grade20
          : result.grade_20 ?? null,
      timeSpent:
        payload.timeSpent != null
          ? payload.timeSpent
          : payload.duration != null
            ? payload.duration
            : result.time_spent,
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

  // Teacher class assignments live in a dedicated settings row (JSON map of
  // userId → classIds) because User has no such column. Rehydrate them onto
  // the top level so the legacy UI's teacher scoping keeps working after a
  // DB round trip.
  try {
    const assignmentRow = (data.settings || []).find(
      (row) => String(row?.key || '') === 'teacherClassAssignments',
    );
    if (assignmentRow?.value) {
      const assignments = parseJson(assignmentRow.value, {});
      data.users = (data.users || []).map((user) => ({
        ...user,
        classIds: Array.isArray(assignments[String(user.id)]) ? assignments[String(user.id)] : [],
      }));
    }
  } catch (assignmentErr) {
    logger.warn({ err: assignmentErr }, 'Bootstrap: teacherClassAssignments hydrate failed');
  }

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
      // Preset configuration travels with the exam (options_json) so student
      // devices — which never receive the admin's quizPresets store — still
      // see every preset-driven rule: welcome title/message, penalty, time
      // limit, colors, shuffle, explanations, font family.
      presetId: legacy.presetId ?? exam.preset_id ?? null,
      presetName: legacy.presetName ?? '',
      presetSnapshot: legacy.presetSnapshot ?? null,
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
  // Legacy status vocabulary: draft (admin-only) / open / live / completed.
  // SaaS vocabulary: waiting / active / paused / finished. `draft` has no SaaS
  // twin and never maps onto waiting — waiting means "lobby open for players"
  // while draft means "still being authored, hidden from students". The bulk
  // writer stores the exact legacy status in settings_json.legacyStatus; use
  // it when present so a draft survives the DB round trip as a draft.
  const toLegacyGameStatus = (status, settings) => {
    const legacyStatus = String(settings?.legacyStatus || '').toLowerCase();
    if (['draft', 'open', 'live', 'completed'].includes(legacyStatus)) return legacyStatus;
    switch (String(status || '')) {
      case 'waiting': return 'open';
      case 'active': return 'live';
      case 'paused': return 'live';
      case 'finished': return 'completed';
      default: return String(status || '');
    }
  };
  // Hydrate a game's embedded questions from the bootstrap question list.
  // `question_ids` is only an array of ID strings — the engine's start
  // validation (game.questions.filter(q => q && q.id)) rejects bare strings,
  // so serving them raw made games fail "Need at least 1 question" even
  // with 16 assigned questions.
  const materializeGameQuestions = (game, questionsById) => {
    const ids = parseJson(game.question_ids, []);
    if (!Array.isArray(ids) || !ids.length) return [];
    return ids
      .map((id) => {
        const source = questionsById.get(String(id || '').trim());
        if (!source) return null;
        const decoded = decodeQuestionMetadata(source);
        return {
          ...decoded,
          id: decoded.id,
          question: decoded.question || decoded.text,
          text: decoded.text || decoded.question,
          options: parseJson(decoded.options_json, decoded.options || []),
        };
      })
      .filter(Boolean);
  };

  const questionsById = new Map(
    (data.questions || []).map((question) => [String(question.id || '').trim(), question]),
  );
  data.games = (data.games || []).map((game) => {
    const settings = parseJson(game.settings_json, {});
    const participants = sessionsByGame.get(String(game.id)) || settings.session?.participants || [];
    // The Game table has no classIds column — bulk writes pack the legacy
    // array into settings_json. Restore it to the top level the workspace
    // filters on (game.classIds) so class scoping survives a DB round trip.
    const classIds = Array.isArray(settings.classIds)
      ? settings.classIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    // Tournament-only instances pack their tournamentContext the same way;
    // without restoring it, a server restart + DB re-hydration strips every
    // instance of its context — isTournamentManagedGame() then reports false,
    // the instances leak into the public game list, and stopTournament's
    // fallback winner can no longer find the round's matches.
    const tournamentContext =
      settings.tournamentContext &&
      typeof settings.tournamentContext === 'object' &&
      String(settings.tournamentContext.tournamentId || '').trim()
        ? settings.tournamentContext
        : null;
    const questions = materializeGameQuestions(game, questionsById);
    const settingsSession = { ...(settings.session || {}), participants };
    return {
      ...game,
      status: toLegacyGameStatus(game.status, settings),
      classIds,
      joinCode: game.join_code,
      questionIds: parseJson(game.question_ids, []),
      questions,
      settings: { ...settings, classIds, session: settingsSession },
      session: settingsSession,
      ...(tournamentContext && {
        tournamentContext,
        tournament_context: tournamentContext,
      }),
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
      // Games follow the same rule as exams: drafts stay hidden, and a game
      // scoped to specific classes is only delivered to students of those
      // classes. Games without a class assignment remain visible to everyone
      // (legacy "all classes" behavior).
      const classNamesById = new Map((data.classes || []).map((classRow) => [String(classRow.id), String(classRow.name || '').toLowerCase()]));
      data.games = (data.games || []).filter((game) => {
        const status = String(game.status || '').toLowerCase();
        if (status === 'draft') return false;
        const gameClassIds = Array.isArray(game.classIds) ? game.classIds.map((id) => String(id || '').trim()) : [];
        if (!gameClassIds.length || !studentClassId) return true;
        if (gameClassIds.includes(studentClassId)) return true;
        const studentClassNameKey = studentClassName || String(classNamesById.get(studentClassId) || '').toLowerCase();
        return gameClassIds.some((value) => {
          const key = String(value || '').toLowerCase();
          return key === studentClassNameKey;
        });
      });
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
