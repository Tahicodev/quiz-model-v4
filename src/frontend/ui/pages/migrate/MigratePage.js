/**
 * src/frontend/ui/pages/migrate/MigratePage.js
 * Tooling for migrating legacy LocalStorage data to the backend (SaaS mode).
 *
 * POSTs to /api/v1/migrate (admin-only, tenant-scoped, idempotent) instead of
 * pushing rows through container.repo.createMany directly. The backend enforces
 * FK order, tenant scoping, and skip-duplicates idempotency — see
 * src/backend/routes/migrate.routes.js.
 */

import { getContainer } from '../../../container.js';
import { apiUrl }        from '../../../config.js';
import { withError }    from '../../../utils/eventBus.js';

/** FK-safe order — parents before children. Must match the backend's MIGRATE_ORDER. */
const MIGRATE_ORDER = [
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
];

const asId = (value) => {
  const id = String(value ?? '').trim();
  return id || undefined;
};

const asNumber = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const asBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  return Boolean(value);
};

const asJson = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    try { JSON.parse(value); return value; } catch { return JSON.stringify(value); }
  }
  try { return JSON.stringify(value); } catch { return fallback; }
};

const normalizeQuestionType = (row) => {
  const raw = String(row.type || row.questionType || '').toLowerCase();
  if (raw === 'multiple-choice' || raw === 'multiple_choice' || raw === 'code') return 'mcq';
  if (raw === 'draggable' || raw === 'ordering' || raw === 'order') return 'order';
  if (raw === 'matching-pairs' || raw === 'matching_pairs') return 'matching';
  if (['mcq', 'true-false', 'fill-blank', 'matching'].includes(raw)) return raw;
  return 'mcq';
};

const normalizeQuestion = (row) => {
  const options = Array.isArray(row.options)
    ? row.options.map((option) => typeof option === 'object' ? option.text : option).filter(Boolean)
    : row.options_json;
  const answer = Array.isArray(row.answer) || typeof row.answer === 'object'
    ? asJson(row.answer, 'unknown')
    : String(row.answer ?? row.correctAnswer ?? '').trim() || 'unknown';

  return {
    id: asId(row.id),
    category_id: asId(row.category_id || row.category) || null,
    type: normalizeQuestionType(row),
    text: String(row.text || row.question || '').trim() || 'Migrated question',
    options_json: asJson(options, '[]'),
    answer,
    explanation: row.explanation == null ? null : String(row.explanation),
    points: asNumber(row.points, 1),
    difficulty: ['easy', 'medium', 'hard'].includes(String(row.difficulty)) ? row.difficulty : 'medium',
    tags: row.tags == null ? null : String(row.tags),
    media_url: row.media_url || row.image || null,
    created_at: row.created_at || row.createdAt,
    updated_at: row.updated_at || row.updatedAt,
  };
};

const normalizeUser = (row) => ({
  id: asId(row.id),
  username: String(row.username || row.email || '').trim() || `migrated-${asId(row.id) || 'user'}`,
  password_hash: row.password_hash || row.passwordHash || row.password || 'legacy-migrated',
  role: ['admin', 'teacher', 'student', 'super_admin'].includes(row.role) ? row.role : 'student',
  name: String(row.name || row.username || 'Migrated user'),
  numero: row.numero || row.studentNumber || null,
  class_id: asId(row.class_id || row.classId) || null,
  status: row.status === 'disabled' ? 'inactive' : (row.status || 'active'),
  created_at: row.created_at || row.createdAt,
  updated_at: row.updated_at || row.updatedAt,
});

const normalizeClass = (row) => ({
  id: asId(row.id),
  name: String(row.name || 'Migrated class'),
  description: row.description == null ? null : String(row.description),
  created_at: row.created_at || row.dateCreated,
  updated_at: row.updated_at || row.updatedAt,
});

const normalizeCategory = (row) => ({
  id: asId(row.id),
  name: String(row.name || 'Migrated category'),
  parent_id: asId(row.parent_id || row.parentId) || null,
  icon: row.icon || null,
  color: row.color || null,
  created_at: row.created_at || row.createdAt,
  updated_at: row.updated_at || row.updatedAt,
});

const normalizeExam = (row, currentUserId) => ({
  id: asId(row.id),
  creator_id: asId(row.creator_id || row.creatorId || row.ownerId) || currentUserId,
  name: String(row.name || 'Migrated exam'),
  description: row.description == null ? null : String(row.description),
  duration: asNumber(row.duration, null),
  passing_score: asNumber(row.passing_score ?? row.passingScore, 50),
  status: ['draft', 'active', 'archived'].includes(row.status) ? row.status : 'draft',
  is_training: asBoolean(row.is_training ?? row.isTraining ?? row.training),
  randomize: asBoolean(row.randomize),
  max_attempts: asNumber(row.max_attempts ?? row.maxAttempts, null),
  created_at: row.created_at || row.dateCreated,
  updated_at: row.updated_at || row.updatedAt,
});

const referencesFor = (value) => Array.isArray(value) ? value : [];

/**
 * Convert the legacy admin shapes to the snake_case Prisma shapes expected by
 * the migration route. Legacy questions use `question/options/category`, exams
 * store question indexes and class ids inline, and users/classes use camelCase.
 */
export function normalizeLegacyData(raw, currentUser) {
  const users = raw.users.map(normalizeUser);
  const classes = raw.classes.map(normalizeClass);
  const categories = raw.categories.map(normalizeCategory);
  const questions = raw.questions.map(normalizeQuestion);
  const currentUserId = asId(currentUser?.id) || users.find((user) => user.role === 'admin')?.id;
  const exams = raw.exams.map((exam) => normalizeExam(exam, currentUserId));
  const questionIdByIndex = new Map(raw.questions.map((question, index) => [index, asId(question.id)]));
  const questionIds = new Set(questions.map((question) => question.id).filter(Boolean));
  const classIds = new Set(classes.map((item) => item.id).filter(Boolean));

  const examQuestions = [];
  const examClasses = [];
  raw.exams.forEach((legacyExam, examIndex) => {
    const examId = exams[examIndex]?.id;
    if (!examId) return;
    referencesFor(legacyExam.questions).forEach((reference, orderIndex) => {
      const questionId = typeof reference === 'number'
        ? questionIdByIndex.get(reference)
        : asId(reference?.id || reference);
      if (questionId && questionIds.has(questionId)) {
        examQuestions.push({ exam_id: examId, question_id: questionId, order_index: orderIndex });
      }
    });
    referencesFor(legacyExam.classes || legacyExam.classIds).forEach((reference) => {
      const classId = asId(reference?.id || reference);
      if (classId && classIds.has(classId)) examClasses.push({ exam_id: examId, class_id: classId });
    });
  });

  const results = raw.results.map((row) => ({
    id: asId(row.id),
    exam_id: asId(row.exam_id || row.examId),
    user_id: asId(row.user_id || row.userId),
    score: asNumber(row.score, 0),
    total_points: asNumber(row.total_points ?? row.totalPoints, 0),
    earned_points: asNumber(row.earned_points ?? row.earnedPoints, 0),
    time_spent: asNumber(row.time_spent ?? row.timeSpent, null),
    answers_json: asJson(row.answers_json ?? row.answers, '{}'),
    mode: ['exam', 'training', 'game', 'tournament'].includes(row.mode) ? row.mode : 'exam',
    passed: asBoolean(row.passed ?? row.isPassed),
    attempt_number: asNumber(row.attempt_number ?? row.attemptNumber, 1),
    date_taken: row.date_taken || row.dateTaken || row.created_at || row.createdAt,
  })).filter((row) => row.exam_id && row.user_id);

  const games = raw.games.map((row) => {
    const ids = referencesFor(row.questions || row.questionIds || row.question_ids)
      .map((question) => asId(question?.id || question)).filter(Boolean);
    return {
      id: asId(row.id),
      creator_id: asId(row.creator_id || row.creatorId || row.ownerId) || currentUserId,
      name: String(row.name || 'Migrated game'),
      type: ['quiz', 'flashcard', 'memory', 'speed', 'battle'].includes(row.type) ? row.type : 'quiz',
      status: ['waiting', 'active', 'paused', 'finished'].includes(row.status) ? row.status : 'waiting',
      settings_json: asJson(row.settings_json ?? row.settings, '{}'),
      join_code: row.join_code || row.joinCode || null,
      question_ids: JSON.stringify(ids),
      started_at: row.started_at || row.startedAt,
      ended_at: row.ended_at || row.endedAt,
      created_at: row.created_at || row.createdAt,
      updated_at: row.updated_at || row.updatedAt,
    };
  }).filter((row) => row.creator_id);

  const tournaments = raw.tournaments.map((row) => ({
    id: asId(row.id),
    creator_id: asId(row.creator_id || row.creatorId || row.ownerId) || currentUserId,
    name: String(row.name || 'Migrated tournament'),
    description: row.description == null ? null : String(row.description),
    status: ['draft', 'open', 'active', 'finished'].includes(row.status) ? row.status : 'draft',
    settings_json: asJson(row.settings_json ?? row.settings, '{}'),
    starts_at: row.starts_at || row.startsAt,
    ends_at: row.ends_at || row.endsAt,
    created_at: row.created_at || row.createdAt,
    updated_at: row.updated_at || row.updatedAt,
  })).filter((row) => row.creator_id);

  const settings = raw.settings.map((row) => ({
    id: asId(row.id),
    key: String(row.key || row.name || '').trim(),
    value: typeof row.value === 'string' ? row.value : JSON.stringify(row.value ?? ''),
    visibility: ['public', 'teacher', 'admin', 'system'].includes(row.visibility) ? row.visibility : 'admin',
    updated_at: row.updated_at || row.updatedAt,
  })).filter((row) => row.key);

  return { classes, categories, users, questions, exams, exam_questions: examQuestions, exam_classes: examClasses, results, games, tournaments, settings };
}

/** Build the { data: { [table]: rows } } payload from LocalStorage. */
async function buildPayload(currentUser) {
  // Read from a fresh LocalStorageRepository regardless of the active mode —
  // in SaaS mode the active repo is the ApiRepository, so we instantiate the
  // LocalStorage impl just to read the legacy data off disk.
  const { LocalStorageRepository } = await import('../../../infrastructure/LocalStorageRepository.js');
  const localRepo = new LocalStorageRepository();

  const raw = Object.fromEntries(MIGRATE_ORDER.map((table) => [table, localRepo.getAll_sync(table)]));
  const normalized = normalizeLegacyData(raw, currentUser);
  const data = Object.fromEntries(
    MIGRATE_ORDER
      .map((table) => [table, normalized[table] || []])
      .filter(([, rows]) => rows.length > 0),
  );
  return { data };
}

/**
 * POST all LocalStorage data to /api/v1/migrate.
 * @returns {Promise<string[]>} per-table human-readable log lines.
 */
export async function migrateDataToBackend() {
  const container = getContainer();
  const token     = container.authSvc.getToken();
  const log       = [];

  const payload = await buildPayload(container.authSvc.getCurrentUser());
  const tables  = Object.keys(payload.data);
  if (tables.length === 0) {
    log.push('No LocalStorage data found to migrate.');
    return log;
  }

  await withError(async () => {
    const res = await fetch(apiUrl('/migrate'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Migration failed (${res.status}): ${body.message || res.statusText}`);
    }

    const { results, totalInserted } = await res.json();
    for (const r of results) {
      log.push(`Migrated ${r.inserted}/${r.total} records for ${r.table}` +
        (r.skipped ? ` (${r.skipped} skipped as duplicates)` : '') +
        (r.error ? ` — ERROR: ${r.error}` : ''));
    }
    log.push(`Total inserted: ${totalInserted}. Re-run to confirm idempotency (expect 0 inserted).`);
  }, 'Migration to backend complete');

  return log;
}

/**
 * GET /api/v1/migrate/status — verify per-table counts in the backend match.
 * @returns {Promise<object>} { counts: { [table]: number } }
 */
export async function getMigrationStatus() {
  const container = getContainer();
  const token     = container.authSvc.getToken();
  const res = await fetch(apiUrl('/migrate/status'), {
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Status fetch failed (${res.status}): ${body.message || res.statusText}`);
  }
  return res.json();
}
