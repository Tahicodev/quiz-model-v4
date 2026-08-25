/**
 * src/backend/routes/bulk.routes.js
 *
 * Generic bulk-create endpoint for all entities.
 * The frontend ApiRepository (and legacy-bridge.js setAll_sync) calls
 * POST /api/v1/bulk/:table with a payload shaped by the *legacy* admin UI.
 *
 * The legacy UI does NOT share the Prisma schema's field names. It sends
 * things like `dateCreated` instead of `created_at`, `questionCount` /
 * `isSystem` on categories, `students` arrays on classes, etc. Handing
 * those row objects straight to Prisma crashes the request with
 * `Unknown argument` (Prisma error P2009-style) and the entire bulk write
 * fails — which is the root cause of "Add Class / Add User don't save".
 *
 * The sanitizer below maps each legacy payload to the actual Prisma schema:
 * - drops fields the model doesn't have                (with a warn log)
 * - renames camelCase → snake_case for known fields
 * - coerces types where the legacy UI uses looser ones (dates, ints, bools)
 *
 * Accepts:  { items: object[] }
 * Returns:  201 { count: number }
 * Requires: JWT auth + admin role + tenant scoping.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { enforceTenant } from '../middleware/tenant.js';
import { ROLES } from '../../shared/constants.js';
import { ForbiddenError } from '../../shared/errors.js';
import { getContainer } from '../container.js';
import { logger } from '../logger.js';

const router = Router();

// Bulk remains an admin API by default. The legacy student workspace needs
// one compatibility write for locally-computed training results; keep that
// exception explicit and deny every other table before it reaches Prisma.
const STUDENT_BULK_TABLES = new Set(['results']);

router.use(requireAuth, enforceTenant);

// ─── Helpers ────────────────────────────────────────────────────────────────

const pickDate = (v) => {
  if (!v) return undefined;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const pickInt = (v) => {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

const pickBool = (v) => (v === undefined ? undefined : Boolean(v));

const pickStr = (v) => (v == null ? undefined : String(v));

/** Real v4-UUID test — legacy Date.now() / simpleHash ids must be dropped so Prisma's @default(uuid()) fires. */
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pickUuid = (v) => {
  const s = pickStr(v);
  return s && UUID_RX.test(s) ? s : undefined;
};

/**
 * Resolve a legacy creator/owner reference to a real User.id.
 * The legacy UI ships `ownerId`/`createdBy` as a UUID, a username, or a
 * display name depending on the code path. `legacyCtx.userIdByKey` maps
 * lowercase username|numero|name -> User.id; `legacyCtx.validUserIds` holds
 * the set of real ids. Falls back to the JWT actor so the FK is always
 * satisfied.
 */
const resolveCreatorId = (row, actorId, legacyCtx = {}) => {
  const candidates = [row.creator_id, row.creatorId, row.ownerId, row.createdBy];
  for (const c of candidates) {
    const s = pickStr(c);
    if (!s || !s.trim()) continue;
    const t = s.trim();
    if (legacyCtx.validUserIds instanceof Set && legacyCtx.validUserIds.has(t)) return t;
    if (legacyCtx.userIdByKey instanceof Map) {
      const found = legacyCtx.userIdByKey.get(t.toLowerCase());
      if (found) return found;
    }
  }
  return actorId != null ? String(actorId) : undefined;
};

/**
 * Per-table sanitizers. Each receives the legacy row + the tenant school_id
 * and returns a row whose keys are exactly the columns the Prisma model
 * expects. Unknown fields are returned on `dropped` so we can warn.
 */
const SANITIZERS = {
  // model Category { id, school_id, name, parent_id?, icon?, color?,
  //                  created_at, updated_at }
  categories: (row, schoolId) => ({
    ...(row.id && { id: String(row.id) }),
    school_id: schoolId,
    name: String(row.name ?? '').trim() || 'Untitled',
    ...(row.parent_id && { parent_id: String(row.parent_id) }),
    ...(row.parentId && { parent_id: String(row.parentId) }),
    ...(row.icon != null && { icon: pickStr(row.icon) }),
    ...(row.color != null && { color: pickStr(row.color) }),
    // legacy fields `description`, `questionCount`, `dateCreated`,
    // `isSystem`, `ownerId` are not in the schema — dropped.
  }),

  // model Class { id, school_id, name, description?, created_at, updated_at }
  classes: (row, schoolId) => ({
    ...(row.id && { id: String(row.id) }),
    school_id: schoolId,
    name: String(row.name ?? '').trim() || 'Untitled',
    // The legacy UI sends `students` (array of {number,name}) and `ownerId`;
    // neither exists on Class. We keep `description` if explicitly sent.
    ...(row.description != null && { description: pickStr(row.description) }),
  }),

  // model User { id, school_id, class_id?, username, password_hash, role,
  //              name, numero?, status, last_login?, created_at, updated_at }
  users: (row, schoolId) => {
    // The legacy UI stores client-hashed passwords under `passwordHash` and
    // uses `studentNumber` instead of `numero`.
    const passwordHash =
      row.password_hash || row.passwordHash || row.password || undefined;
    // class_id is a real FK — drop obviously-bogus legacy ids ("test-class-1")
    // so the upsert doesn't P2003 against a Class row that doesn't exist.
    const classId = pickUuid(row.class_id ?? row.classId);
    return {
      ...(pickUuid(row.id) && { id: pickUuid(row.id) }),
      school_id: schoolId,
      ...(classId && { class_id: classId }),
      username: String(row.username ?? row.email ?? '').trim(),
      ...(passwordHash && { password_hash: String(passwordHash) }),
      role: pickStr(row.role) || 'student',
      name: pickStr(row.name) || pickStr(row.username) || 'Unknown',
      ...(row.numero != null && { numero: pickStr(row.numero) }),
      ...(row.studentNumber != null && { numero: pickStr(row.studentNumber) }),
      status: pickStr(row.status) || 'active',
      ...(row.last_login && { last_login: pickDate(row.last_login) }),
      ...(row.lastLogin && { last_login: pickDate(row.lastLogin) }),
    };
  },

  // model Question { id, school_id, category_id?, type, text, options_json?,
  //                  answer, explanation?, points, difficulty, tags?,
  //                  media_url?, created_at, updated_at }
  //
  // Legacy question shape (questions-management.js):
  //   { id, question, options | optionData: [{text, image}], answer,
  //     explanation, image, category (string name OR id), type, difficulty,
  //     instruction, isDraggable, allowMultipleAnswers, dateCreated,
  //     ownerId, distractors, codeSnippet, codeLanguage, codeAnswerMode }
  //
  // The schema's `type` is a constrained enum (see shared/constants.js
  // QUESTION_TYPES); legacy types like "multiple-choice" need mapping.
  questions: (row, schoolId) => {
    // Map legacy question type strings to the backend's QUESTION_TYPES.
    const TYPE_MAP = {
      'multiple-choice': 'mcq',
      'mcq': 'mcq',
      'true-false': 'true-false',
      'true_false': 'true-false',
      'matching-pairs': 'matching',
      'matching': 'matching',
      'ordering': 'order',
      'draggable': 'order',
      'order': 'order',
      'fill-blank': 'fill-blank',
      'fill_blank': 'fill-blank',
      // Pass-through if the type already matches a backend value.
      'MCQ': 'mcq', 'TRUE_FALSE': 'true-false', 'MATCHING': 'matching',
      'ORDER': 'order', 'FILL_BLANK': 'fill-blank',
    };
    const rawType = pickStr(row.type) || 'multiple-choice';
    const mappedType = TYPE_MAP[rawType] || 'mcq';

    // Options: prefer `optionData` (array of `{text, image}`), fall back to
    // the plain `options` array. Always serialize as a JSON string array.
    const rawOptions =
      Array.isArray(row.optionData) && row.optionData.length > 0
        ? row.optionData.map((o) =>
            typeof o === 'string' ? o : (o && o.text) ?? '',
          )
        : Array.isArray(row.options)
          ? row.options
          : [];
    const optionsJson =
      rawOptions.length > 0 ? JSON.stringify(rawOptions) : undefined;

    // category: legacy row stores either the category id (string) or
    // "uncategorized" / category name. If it's a non-empty string that
    // looks like an id (uuid or similar), use it; otherwise drop it so
    // the FK to `categories.id` doesn't fail.
    const rawCat = row.category_id ?? row.categoryId ?? row.category;
    const categoryId =
      typeof rawCat === 'string' &&
      rawCat.trim() !== '' &&
      rawCat !== 'uncategorized' &&
      rawCat !== 'default'
        ? String(rawCat)
        : undefined;

    // answer must always be a string per the schema.
    const rawAnswer = row.answer;
    const answer =
      typeof rawAnswer === 'string'
        ? rawAnswer
        : Array.isArray(rawAnswer)
          ? JSON.stringify(rawAnswer)
          : rawAnswer == null
            ? ''
            : String(rawAnswer);

    const text = pickStr(row.text) ?? pickStr(row.question) ?? pickStr(row.title);
    if (!text) return null; // required by schema - skip silently

    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      ...(categoryId && { category_id: categoryId }),
      type: mappedType,
      text,
      ...(optionsJson !== undefined && { options_json: optionsJson }),
      answer,
      ...(row.explanation != null && { explanation: pickStr(row.explanation) }),
      ...(row.instruction != null && { explanation: pickStr(row.instruction) }),
      ...(row.points != null && { points: pickInt(row.points) ?? 1 }),
      ...(row.difficulty != null && {
        difficulty: pickStr(row.difficulty) || 'medium',
      }),
      ...(row.tags != null && {
        tags: Array.isArray(row.tags) ? row.tags.join(',') : pickStr(row.tags),
      }),
      ...(row.media_url != null && { media_url: pickStr(row.media_url) }),
      ...(row.mediaUrl != null && { media_url: pickStr(row.mediaUrl) }),
      ...(row.image != null && row.image !== '' && { media_url: pickStr(row.image) }),
      // legacy extras silently dropped: dateCreated, ownerId, isDraggable,
      // allowMultipleAnswers, distractors, codeSnippet, codeLanguage,
      // codeAnswerMode, optionData (already encoded into options_json).
    };
  },

  // model Exam { id, school_id, creator_id, name, description?, duration?,
  //              passing_score, status, is_training, randomize, max_attempts?,
  //              options_json?, created_at, updated_at }
  //
  // The legacy UI puts `questions: [rowIndex, ...]` and `classes: [nameOrId, ...]`
  // on the exam row. We can't relay the row indices onto the exam_questions
  // junction without a snapshot of the questions table (they are positional
  // indices into the admin UI's in-memory `questions[]`, not UUIDs), and the
  // classes array mixes ids with free-text names. Rather than dropping the
  // data, persist the raw arrays as JSON in Exam.options_json so the wire
  // format is durable and no user input is lost.
  exams: (row, schoolId, actorId, legacyCtx = {}) => {
    const optionsPayload = {};
    if (Array.isArray(row.questions) && row.questions.length > 0) {
      optionsPayload.questions = row.questions;
    }
    if (Array.isArray(row.classes) && row.classes.length > 0) {
      optionsPayload.classes = row.classes;
    }
    if (row.presetId != null) optionsPayload.presetId = row.presetId;
    if (row.dateCreated != null) optionsPayload.dateCreated = row.dateCreated;

    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      creator_id: resolveCreatorId(row, actorId, legacyCtx),
      name: pickStr(row.name) ?? pickStr(row.title) ?? 'Untitled exam',
      ...(row.description != null && { description: pickStr(row.description) }),
      ...(row.duration != null && { duration: pickInt(row.duration) }),
      ...(row.durationMinutes != null && { duration: pickInt(row.durationMinutes) }),
      ...(row.passing_score != null && { passing_score: pickInt(row.passing_score) }),
      ...(row.passingScore != null && { passing_score: pickInt(row.passingScore) }),
      ...(row.status != null && { status: pickStr(row.status) }),
      ...(row.is_training != null && { is_training: pickBool(row.is_training) }),
      ...(row.isTraining != null && { is_training: pickBool(row.isTraining) }),
      ...(row.randomize != null && { randomize: pickBool(row.randomize) }),
      ...(row.max_attempts != null && { max_attempts: pickInt(row.max_attempts) }),
      ...(row.maxAttempts != null && { max_attempts: pickInt(row.maxAttempts) }),
      ...(Object.keys(optionsPayload).length > 0 && {
        options_json: JSON.stringify(optionsPayload),
      }),
    };
  },

  // model Result { id, school_id, exam_id, user_id, score Float, total_points,
  //                earned_points, time_spent?, answers_json, mode, passed,
  //                attempt_number, date_taken }
  //
  // The legacy UI writes results under three shapes (training / exam / game),
  // all of them keyed by a *student identifier that is not a User UUID*:
  // training rows use `numero` (S001), exam rows use `name`, and game rows
  // use `winnerId` / `participants[].id` which may be either a real user id
  // or an ad-hoc guest handle. The Prisma `Result.user_id` is a hard FK to
  // `User.id`, so writing any of these rows with the legacy identifier would
  // violate the FK and crash the batch.
  //
  // Resolve a real user id: lookup by username / numero / name inside the
  // same school scope, falling back to the actor (the admin recording the
  // result). The school-scoped user list is provided by the route handler in
  // `legacyCtx.userIdByKey` — a Map keyed by lowercase username|numero|name.
  results: (row, schoolId, actorId, legacyCtx = {}) => {
    const keys = [];
    const pushKey = (v) => {
      const s = pickStr(v);
      if (s && s.trim()) keys.push(s.trim().toLowerCase());
    };
    pushKey(row.userId);
    pushKey(row.user_id);
    pushKey(row.username);
    pushKey(row.numero);
    pushKey(row.studentNumber);
    pushKey(row.name);
    pushKey(row.studentName);

    let userId;
    if (legacyCtx.userIdByKey instanceof Map) {
      for (const k of keys) {
        const found = legacyCtx.userIdByKey.get(k);
        if (found) { userId = found; break; }
      }
    }
    // Also accept a direct UUID-style value without consulting the map —
    // some paths (game results from logged-in students) already carry it.
    if (!userId) {
      for (const k of [row.userId, row.user_id]) {
        const s = pickStr(k);
        if (s && legacyCtx.validUserIds instanceof Set && legacyCtx.validUserIds.has(s)) {
          userId = s;
          break;
        }
      }
    }
    if (!userId) userId = pickStr(actorId) || undefined;
    if (!userId) return null; // schema requires user_id — skip row.

    // exam_id is also a hard FK. Legacy training/game results have no exam;
    // store the synthetic exam identifier on answers_json and leave the column
    // null so the write doesn't blow up on the junction FK lookup.
    const rawExamId = pickStr(row.exam_id ?? row.examId);
    const examId =
      rawExamId && legacyCtx.validExamIds instanceof Set && legacyCtx.validExamIds.has(rawExamId)
        ? rawExamId
        : undefined;

    const answersPayload = {
      examId: rawExamId ?? null,
      examTitle: row.examTitle ?? row.examName ?? null,
      numero: row.numero ?? null,
      studentName: row.studentName ?? row.name ?? null,
      class: row.class ?? row.className ?? null,
      classId: row.classId ?? null,
      totalQuestions: row.totalQuestions ?? null,
      gameId: row.gameId ?? null,
      gameName: row.gameName ?? null,
      lobbyId: row.lobbyId ?? null,
      lobbyLabel: row.lobbyLabel ?? null,
      gameType: row.gameType ?? null,
      gameMode: row.gameMode ?? null,
      winners: Array.isArray(row.winners) ? row.winners : null,
      leaderboard: Array.isArray(row.leaderboard) ? row.leaderboard : null,
      participants: Array.isArray(row.participants) ? row.participants : null,
      participantDetails: Array.isArray(row.participantDetails) ? row.participantDetails : null,
      winnerId: row.winnerId ?? null,
      winnerName: row.winnerName ?? null,
      // NOTE: the legacy `raw: row` passthrough was dropped — it double-stored
      // every field inside answers_json and leaked client-only junk into the
      // normalized snapshot. The curated fields above are the canonical set.
    };

    const totalPoints = pickInt(row.totalPoints ?? row.total_points) ?? 0;
    const scoreNum = Number(row.score);
    const earnedPointsRaw = row.earnedPoints ?? row.earned_points ?? row.score;
    const earnedPoints = Number.isFinite(Number(earnedPointsRaw)) ? Number(earnedPointsRaw) : 0;
    // Legacy screens store `score` as the number of correct answers while
    // normalized Prisma results store it as a percentage. `totalQuestions`
    // identifies the legacy shape, so convert it once at the API boundary.
    const legacyCountScore = row.totalQuestions != null || row.total_questions != null;
    const score = legacyCountScore && totalPoints > 0
      ? (earnedPoints / totalPoints) * 100
      : Number.isFinite(scoreNum)
        ? scoreNum
        : (totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0);

    const passed =
      pickBool(row.passed) ??
      pickBool(row.isPassed) ??
      (totalPoints > 0 ? earnedPoints >= Math.ceil(totalPoints / 2) : undefined);

    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      ...(examId && { exam_id: examId }),
      user_id: userId,
      score,
      total_points: totalPoints,
      earned_points: earnedPoints,
      ...(row.timeSpent != null && { time_spent: pickInt(row.timeSpent) }),
      ...(row.time_spent != null && { time_spent: pickInt(row.time_spent) }),
      ...(row.time != null && { time_spent: pickInt(row.time) }),
      answers_json: JSON.stringify(answersPayload),
      ...(row.mode != null && { mode: pickStr(row.mode) }),
      ...(passed !== undefined && { passed }),
      ...(row.attemptNumber != null && { attempt_number: pickInt(row.attemptNumber) }),
      ...(row.attempt_number != null && { attempt_number: pickInt(row.attempt_number) }),
      ...(row.dateTaken && { date_taken: pickDate(row.dateTaken) }),
      ...(row.date && { date_taken: pickDate(row.date) }),
      ...(row.completedAt && { date_taken: pickDate(row.completedAt) }),
    };
  },

  // model Game { id, school_id, creator_id, name, type, status, settings_json?,
  //              join_code?, question_ids, started_at?, ended_at?,
  //              created_at, updated_at }
  //
  // The legacy `normalizeGame()` shape carries a giant `settings` object, a
  // `session` blob, `classIds`, `lobbyHistory`, and the quiz questions
  // embedded as `questions`/`penaltyQuestions`. We map what fits, and JSON-
  // pack the rest into `settings_json` so it survives a round trip.
  games: (row, schoolId, actorId, legacyCtx = {}) => {
    const questionIds = Array.isArray(row.questions)
      ? row.questions.map((q) => (q && (q.id || q.question_id || q.uuid)) || q).filter(Boolean)
      : Array.isArray(row.question_ids)
        ? row.question_ids
        : [];
    const settingsBlob = {
      ...(typeof row.settings === 'object' && row.settings !== null ? row.settings : {}),
      classIds: Array.isArray(row.classIds) ? row.classIds : undefined,
      session: row.session ?? undefined,
      results: row.results ?? undefined,
      lobbyCounter: row.lobbyCounter ?? undefined,
      lobbyHistory: Array.isArray(row.lobbyHistory) ? row.lobbyHistory : undefined,
      tournamentContext: row.tournamentContext ?? undefined,
      penaltyQuestions: Array.isArray(row.penaltyQuestions) ? row.penaltyQuestions : undefined,
    };
    // Strip undefined keys so the blob stays compact.
    for (const k of Object.keys(settingsBlob)) {
      if (settingsBlob[k] === undefined) delete settingsBlob[k];
    }
    const rawStatus = pickStr(row.status);
    const status =
      rawStatus === 'live' ? 'active'
      : rawStatus === 'completed' ? 'finished'
      : rawStatus === 'open' ? 'waiting'
      : ['waiting', 'active', 'paused', 'finished'].includes(rawStatus) ? rawStatus
      : 'waiting';

    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      creator_id: resolveCreatorId(row, actorId, legacyCtx),
      name: pickStr(row.name) || 'Untitled game',
      type: pickStr(row.type) || pickStr(row.mode) || 'custom',
      status,
      ...(Object.keys(settingsBlob).length > 0 && {
        settings_json: JSON.stringify(settingsBlob),
      }),
      ...(row.join_code && { join_code: String(row.join_code) }),
      ...(row.joinCode && { join_code: String(row.joinCode) }),
      question_ids: JSON.stringify(questionIds),
      ...(row.startedAt && { started_at: pickDate(row.startedAt) }),
      ...(row.started_at && { started_at: pickDate(row.started_at) }),
      ...(row.endedAt && { ended_at: pickDate(row.endedAt) }),
      ...(row.ended_at && { ended_at: pickDate(row.ended_at) }),
    };
  },

  // model Tournament { id, school_id, creator_id, name, description?, status,
  //                    settings_json?, starts_at?, ends_at?, created_at, updated_at }
  //
  // The legacy UI writes two stores here: `quizTournamentActive` (one object,
  // no stable schema — status 'active') and `quizTournamentsHistory` (array of
  // completed tournaments). Both map onto Tournament. Extra legacy fields
  // (planner config, round assignments, participants, winners, rewards) go
  // into `settings_json`; the legacy `status` vocabulary ('active', 'open',
  // 'completed') maps onto the schema's free-form string column.
  tournaments: (row, schoolId, actorId, legacyCtx = {}) => {
    const statusMap = { active: 'active', open: 'active', live: 'active', completed: 'completed', draft: 'draft' };
    const rawStatus = pickStr(row.status) || 'draft';
    const status = statusMap[rawStatus] || 'draft';

    const settingsBlob = {
      planner: row.planner ?? undefined,
      currentRound: row.currentRound ?? undefined,
      recommendedRounds: row.recommendedRounds ?? undefined,
      matchMinutes: row.matchMinutes ?? undefined,
      bestOf: row.bestOf ?? undefined,
      pointMultiplier: row.pointMultiplier ?? undefined,
      winnerBonus: row.winnerBonus ?? undefined,
      rewardExpBonus: row.rewardExpBonus ?? undefined,
      rewardBadge: row.rewardBadge ?? undefined,
      notes: row.notes ?? undefined,
      autoSeeding: row.autoSeeding ?? undefined,
      allowReentry: row.allowReentry ?? undefined,
      estimatedMatches: row.estimatedMatches ?? undefined,
      estimatedDurationHours: row.estimatedDurationHours ?? undefined,
      roundAssignments: row.roundAssignments ?? undefined,
      participants: Array.isArray(row.participants) ? row.participants : undefined,
      winners: Array.isArray(row.winners) ? row.winners : undefined,
      pausedAt: row.pausedAt ?? undefined,
      createdBy: row.createdBy ?? undefined,
    };
    for (const k of Object.keys(settingsBlob)) {
      if (settingsBlob[k] === undefined) delete settingsBlob[k];
    }

    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      creator_id: resolveCreatorId(row, actorId, legacyCtx),
      name: pickStr(row.name) || 'Tournament',
      ...(row.description != null && { description: pickStr(row.description) }),
      status,
      ...(Object.keys(settingsBlob).length > 0 && {
        settings_json: JSON.stringify(settingsBlob),
      }),
      ...(row.startedAt && { starts_at: pickDate(row.startedAt) }),
      ...(row.startsAt && { starts_at: pickDate(row.startsAt) }),
      ...(row.starts_at && { starts_at: pickDate(row.starts_at) }),
      ...(row.endedAt && { ends_at: pickDate(row.endedAt) }),
      ...(row.endsAt && { ends_at: pickDate(row.endsAt) }),
      ...(row.ends_at && { ends_at: pickDate(row.ends_at) }),
    };
  },

  // model TournamentHistory { id, school_id, name, ended_at?, winners_json?,
  //                           payload_json?, created_at }
  // Completed-tournament archive. Keep the legacy row verbatim in
  // payload_json so no planner/reward/participant data is lost, and surface
  // the few columns useful for listing (name, ended_at, winners).
  tournament_history: (row, schoolId) => {
    const name = pickStr(row.name) ?? pickStr(row.title);
    if (!name) return null;
    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      name,
      ...(row.endedAt && { ended_at: pickDate(row.endedAt) }),
      ...(row.ended_at && { ended_at: pickDate(row.ended_at) }),
      ...(row.completedAt && { ended_at: pickDate(row.completedAt) }),
      winners_json: JSON.stringify(Array.isArray(row.winners) ? row.winners : []),
      payload_json: JSON.stringify(row),
    };
  },

  // model ExamSession { id, school_id, exam_id, user_id, status,
  //                     answers_json, current_question_index, started_at,
  //                     expires_at, last_heartbeat, completed_at? }
  //
  // Legacy UI writes these to `examActiveSession` (unmapped key) so we don't
  // normally see them here, but the bridge does accept table writes for
  // completeness. exam_id is a hard FK, so unknown exams are dropped.
  exam_sessions: (row, schoolId, actorId, legacyCtx = {}) => {
    const rawExamId = pickStr(row.exam_id ?? row.examId);
    const examId =
      rawExamId && legacyCtx.validExamIds instanceof Set && legacyCtx.validExamIds.has(rawExamId)
        ? rawExamId
        : undefined;
    if (!examId) return null;

    let userId;
    if (legacyCtx.userIdByKey instanceof Map) {
      const keys = [row.userId, row.user_id, row.username, row.numero, row.studentNumber, row.name];
      for (const k of keys) {
        const s = pickStr(k);
        if (!s) continue;
        const found = legacyCtx.userIdByKey.get(s.trim().toLowerCase());
        if (found) { userId = found; break; }
      }
    }
    if (!userId && pickStr(row.userId) && legacyCtx.validUserIds instanceof Set && legacyCtx.validUserIds.has(pickStr(row.userId))) {
      userId = pickStr(row.userId);
    }
    if (!userId) userId = pickStr(actorId) || undefined;
    if (!userId) return null;

    const statusMap = { active: 'active', open: 'active', live: 'active', completed: 'completed', submitted: 'completed' };
    const rawStatus = pickStr(row.status) || 'active';
    const status = statusMap[rawStatus] || 'active';
    // expires_at is required. If the legacy row doesn't carry it, default to
    // 24h after started_at (or now) so the row satisfies the schema without
    // inventing timing semantics.
    const startedAt = pickDate(row.startedAt ?? row.started_at) || new Date();
    const expiresAt =
      pickDate(row.expiresAt ?? row.expires_at) ||
      new Date(startedAt.getTime() + 24 * 60 * 60 * 1000);

    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      exam_id: examId,
      user_id: userId,
      status,
      answers_json:
        typeof row.answers_json === 'string'
          ? row.answers_json
          : JSON.stringify(row.answers ?? row.answersJson ?? {}),
      ...(row.currentQuestionIndex != null && { current_question_index: pickInt(row.currentQuestionIndex) }),
      ...(row.current_question_index != null && { current_question_index: pickInt(row.current_question_index) }),
      started_at: startedAt,
      expires_at: expiresAt,
      ...(row.lastHeartbeat && { last_heartbeat: pickDate(row.lastHeartbeat) }),
      ...(row.last_heartbeat && { last_heartbeat: pickDate(row.last_heartbeat) }),
      ...(row.completedAt && { completed_at: pickDate(row.completedAt) }),
      ...(row.completed_at && { completed_at: pickDate(row.completed_at) }),
    };
  },

  // model ExamQuestion { id, exam_id, question_id, order_index, points_override? }
  // The legacy UI never writes this table directly (it embeds question ids on
  // the exam row), but the route is registered so direct API consumers and
  // tests can upsert junction rows.
  exam_questions: (row) => {
    const examId = pickStr(row.exam_id ?? row.examId);
    const questionId = pickStr(row.question_id ?? row.questionId);
    if (!examId || !questionId) return null;
    return {
      ...(row.id && { id: String(row.id) }),
      exam_id: examId,
      question_id: questionId,
      ...(row.order_index != null && { order_index: pickInt(row.order_index) }),
      ...(row.orderIndex != null && { order_index: pickInt(row.orderIndex) }),
      ...(row.points_override != null && { points_override: pickInt(row.points_override) }),
      ...(row.pointsOverride != null && { points_override: pickInt(row.pointsOverride) }),
    };
  },

  // model ExamClass { id, exam_id, class_id, assigned_at }
  exam_classes: (row) => {
    const examId = pickStr(row.exam_id ?? row.examId);
    const classId = pickStr(row.class_id ?? row.classId);
    if (!examId || !classId) return null;
    return {
      ...(row.id && { id: String(row.id) }),
      exam_id: examId,
      class_id: classId,
      ...(row.assigned_at && { assigned_at: pickDate(row.assigned_at) }),
      ...(row.assignedAt && { assigned_at: pickDate(row.assignedAt) }),
    };
  },

  // ── Full-persistence stores (Phase 2) ─────────────────────────────────────
  // Real sanitizers matching the new Prisma models, so any remaining legacy
  // setAll_sync(...) write is honored instead of silently dropped. Routes still
  // exist for these tables; prefer them — these are a compatibility floor.

  // model ProfileRequest { id, school_id, user_id, status, changes_json,
  //                        avatar?, note?, snapshot_json?, reviewer_id?,
  //                        review_note?, reviewed_at? }
  profile_requests: (row, schoolId, actorId, legacyCtx = {}) => {
    let userId = pickUuid(row.user_id ?? row.userId) || null;
    if (!userId && legacyCtx.userIdByKey instanceof Map) {
      const key = pickStr(row.username ?? row.userName ?? row.name)?.toLowerCase();
      if (key) userId = legacyCtx.userIdByKey.get(key) || null;
    }
    if (!userId) return null;
    const changes = row.changes_json ?? row.changes ?? null;
    if (!changes) return null;
    return {
      ...(pickUuid(row.id) && { id: pickUuid(row.id) }),
      school_id: schoolId,
      user_id: userId,
      status: pickStr(row.status) || 'pending',
      changes_json: typeof changes === 'string' ? changes : JSON.stringify(changes),
      ...(row.avatar != null && { avatar: pickStr(row.avatar) }),
      ...(row.note != null && { note: pickStr(row.note) }),
    };
  },

  // model AccountRequest { id, school_id, status, full_name, username,
  //                        student_number, class_id?, class_name?,
  //                        password_hash, note?, reviewer_id?, created_user_id? }
  account_requests: (row, schoolId) => {
    const username = pickStr(row.username);
    const fullName = pickStr(row.full_name ?? row.fullName ?? row.name);
    const studentNumber = pickStr(row.student_number ?? row.studentNumber ?? row.numero);
    const passwordHash = pickStr(row.password_hash ?? row.passwordHash ?? row.password);
    if (!username || !fullName || !studentNumber || !passwordHash) return null;
    return {
      ...(pickUuid(row.id) && { id: pickUuid(row.id) }),
      school_id: schoolId,
      status: pickStr(row.status) || 'pending',
      full_name: fullName,
      username,
      student_number: studentNumber,
      ...(row.class_id && { class_id: pickStr(row.class_id) }),
      ...(row.classId && { class_id: pickStr(row.classId) }),
      ...(row.class_name && { class_name: pickStr(row.class_name) }),
      ...(row.className && { class_name: pickStr(row.className) }),
      password_hash: passwordHash,
      ...(row.note != null && { note: pickStr(row.note) }),
    };
  },

  // model GamePreset { id, school_id, name, game_type, game_mode, rules_json, is_default }
  game_presets: (row, schoolId) => {
    const name = pickStr(row.name);
    const gameType = pickStr(row.game_type ?? row.gameType ?? row.type);
    const gameMode = pickStr(row.game_mode ?? row.gameMode ?? row.mode);
    if (!name || !gameType || !gameMode) return null;
    const rules = row.rules_json ?? row.rules ?? {};
    return {
      ...(pickUuid(row.id) && { id: pickUuid(row.id) }),
      school_id: schoolId,
      name,
      game_type: gameType,
      game_mode: gameMode,
      rules_json: typeof rules === 'string' ? rules : JSON.stringify(rules),
      is_default: pickBool(row.is_default ?? row.isDefault) ?? false,
    };
  },

  // model Notification { id, school_id, type, message, data_json?, read_at? }
  notifications: (row, schoolId) => {
    const type = pickStr(row.type);
    const message = pickStr(row.message ?? row.text ?? row.title);
    if (!type || !message) return null;
    const data = row.data_json ?? row.data ?? null;
    return {
      ...(pickUuid(row.id) && { id: pickUuid(row.id) }),
      school_id: schoolId,
      type,
      message,
      ...(data != null && { data_json: typeof data === 'string' ? data : JSON.stringify(data) }),
      ...(row.read_at && { read_at: pickDate(row.read_at) }),
      ...(row.readAt && { read_at: pickDate(row.readAt) }),
      ...(row.date && { created_at: pickDate(row.date) }),
    };
  },

  // model GamificationConfig { school_id (PK), exp_per_correct, exp_per_win, auto_award_badges }
  // legacy-bridge wraps the single object; normalizeObjectStoreBody already flattens it.
  gamification: (row, schoolId) => {
    const src = row && typeof row === 'object' ? (row.value && typeof row.value === 'object' ? row.value : row) : {};
    // Only upsert when at least one field is explicitly given.
    if (src.exp_per_correct == null && src.expPerCorrect == null &&
        src.exp_per_win == null && src.expPerWin == null &&
        src.auto_award_badges == null && src.autoAwardBadges == null) return null;
    return {
      school_id: schoolId,
      exp_per_correct: pickInt(src.exp_per_correct ?? src.expPerCorrect) ?? 10,
      exp_per_win: pickInt(src.exp_per_win ?? src.expPerWin) ?? 100,
      auto_award_badges: pickBool(src.auto_award_badges ?? src.autoAwardBadges) ?? true,
    };
  },

  // model TeacherMessage { id, school_id, class_id?, class_name?, teacher_id?,
  //                        teacher_name?, title, body, date }
  teacher_messages: (row, schoolId, actorId) => {
    const title = pickStr(row.title ?? row.subject);
    const body = pickStr(row.body ?? row.message ?? row.text);
    if (!title || !body) return null;
    return {
      ...(pickUuid(row.id) && { id: pickUuid(row.id) }),
      school_id: schoolId,
      ...(row.class_id && { class_id: pickStr(row.class_id) }),
      ...(row.classId && { class_id: pickStr(row.classId) }),
      ...(row.class_name && { class_name: pickStr(row.class_name) }),
      ...(row.className && { class_name: pickStr(row.className) }),
      ...(pickUuid(row.teacher_id) && { teacher_id: pickUuid(row.teacher_id) }),
      ...(pickUuid(row.teacherId) && { teacher_id: pickUuid(row.teacherId) }),
      ...(row.teacher_name && { teacher_name: pickStr(row.teacher_name) }),
      ...(row.teacherName && { teacher_name: pickStr(row.teacherName) }),
      // fall back to the JWT actor as author when the UI sent nothing usable
      ...(!pickUuid(row.teacher_id) && !pickUuid(row.teacherId) && actorId && { teacher_id: String(actorId) }),
      title,
      body,
      ...(row.date && { date: pickDate(row.date) }),
      ...(row.createdAt && { date: pickDate(row.createdAt) }),
    };
  },

  // model TeacherAssignment { id, school_id, class_id?, teacher_id?, title,
  //                           description?, due_date? }
  teacher_assignments: (row, schoolId, actorId) => {
    const title = pickStr(row.title);
    if (!title) return null;
    return {
      ...(pickUuid(row.id) && { id: pickUuid(row.id) }),
      school_id: schoolId,
      ...(row.class_id && { class_id: pickStr(row.class_id) }),
      ...(row.classId && { class_id: pickStr(row.classId) }),
      ...(pickUuid(row.teacher_id) && { teacher_id: pickUuid(row.teacher_id) }),
      ...(pickUuid(row.teacherId) && { teacher_id: pickUuid(row.teacherId) }),
      ...(!pickUuid(row.teacher_id) && !pickUuid(row.teacherId) && actorId && { teacher_id: String(actorId) }),
      title,
      ...(row.description != null && { description: pickStr(row.description) }),
      ...(row.due_date && { due_date: pickDate(row.due_date) }),
      ...(row.dueDate && { due_date: pickDate(row.dueDate) }),
    };
  },

  // activity / account-activity visual feed stays local-only
  activity: () => null,

  // refresh_tokens is internal to AuthService and should never be bulk-written
  // from the UI — the endpoint requires admin but defense-in-depth matters.
  refresh_tokens: () => null,

  // model Setting { id, school_id, key, value, visibility, updated_at }
  // Note when items are given as a `{key:value}` object map, the caller
  // should send [{key, value}, ...]; we accept both shapes below.
  settings: (row, schoolId) => {
    if (row && typeof row === 'object' && 'key' in row) {
      return {
        ...(row.id && { id: String(row.id) }),
        school_id: schoolId,
        key: String(row.key),
        value: row.value == null ? '' : String(row.value),
        ...(row.visibility && { visibility: pickStr(row.visibility) }),
      };
    }
    // row is already reduced to key/value via routes below
    return null;
  },

  // model AuditLog { id, school_id, actor_id?, entity_type, entity_id,
  //                  action, diff_json?, ip_address?, user_agent?, occurred_at }
  // The legacy UI writes "activity" entries shaped like
  //   { type, action, name, details, date, author, icon, color, ... }
  // which has NO entity_id at all. We map them to a minimal valid AuditLog,
  // treating the UI's `type` as entity_type and synthesizing entity_id from
  // the row's own id. Purely-visual events (no real backing entity) are
  // dropped because `entity_id` is required.
  audit_logs: (row, schoolId, actorId) => {
    // entity_id is required by the schema; if the legacy row has nothing
    // entity-like, skip the write rather than rejecting the whole batch.
    const entityId = row.entity_id || row.entityId || row.targetId;
    if (!entityId) return null;
    const entityType =
      row.entity_type || row.entityType || row.type || 'unknown';
    return {
      ...(row.id && { id: String(row.id) }),
      school_id: schoolId,
      ...(actorId && { actor_id: actorId }),
      entity_type: String(entityType),
      entity_id: String(entityId),
      action: pickStr(row.action) || 'unknown',
      ...(row.diff_json != null && { diff_json: pickStr(row.diff_json) }),
      ...(row.diffJson != null && { diff_json: pickStr(row.diffJson) }),
      ...(row.ip_address != null && { ip_address: pickStr(row.ip_address) }),
      ...(row.user_agent != null && { user_agent: pickStr(row.user_agent) }),
      ...(row.date && { occurred_at: pickDate(row.date) }),
      ...(row.occurred_at && { occurred_at: pickDate(row.occurred_at) }),
    };
  },
};

/**
 * For `settings`, the legacy UI often calls setValue_sync('settings', {...})
 * and the bridge wraps it as `{value: {...}}` instead of `{items: [...]}`.
 * Accept that alternative shape and flat-map it into [{key, value}] rows.
 */
function normalizeSettingsBody(body) {
  if (Array.isArray(body?.items)) return body.items;
  if (body && typeof body === 'object') {
    const target = body.value && typeof body.value === 'object' ? body.value : body;
    const items = [];
    for (const [key, value] of Object.entries(target)) {
      if (key === 'items' || key === 'value' || key === 'school_id') continue;
      items.push({
        key,
        value: value == null ? '' : String(value),
      });
    }
    if (items.length > 0) return items;
  }
  return null;
}

/**
 * For object-stores (gamification) the bridge POSTs the single object as the
 * body itself ({value: {...}} is already used by settings). Wrap it so the
 * rest of the handler can treat it uniformly. We don't upsert anywhere (the
 * sanitizer returns null) but we ack the write so the bridge doesn't retry.
 */
function normalizeObjectStoreBody(body) {
  if (Array.isArray(body?.items)) return body.items;
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return [body];
  }
  return null;
}

/**
 * Fields that must be present (non-null) on the *sanitized* row for the
 * upsert to succeed. If a sanitizer produces a row missing one of these the
 * whole batch would blow up on Prisma's FK/required validation, so we drop
 * just that row. Keep this in sync with the schema's `String` / `Int`
 * non-optional columns.
 */
const REQUIRED_FIELDS = {
  users: ['username', 'role', 'name'],   // password_hash optional — an update via bulk may not carry it
  classes: ['name'],
  categories: ['name'],
  questions: ['type', 'text', 'answer'],
  exams: ['creator_id', 'name'],
  results: ['user_id', 'answers_json'],
  games: ['creator_id', 'name', 'type'],
  tournaments: ['creator_id', 'name'],
  exam_sessions: ['exam_id', 'user_id', 'status', 'answers_json', 'started_at', 'expires_at'],
  exam_questions: ['exam_id', 'question_id'],
  exam_classes: ['exam_id', 'class_id'],
  tournament_history: ['name'],
  settings: ['key', 'value'],
  audit_logs: ['entity_type', 'entity_id', 'action'],
  profile_requests: ['user_id', 'changes_json'],
  account_requests: ['full_name', 'username', 'student_number', 'password_hash'],
  game_presets: ['name', 'game_type', 'game_mode', 'rules_json'],
  notifications: ['type', 'message'],
  teacher_messages: ['title', 'body'],
  teacher_assignments: ['title'],
};

/**
 * POST /api/v1/bulk/:table
 * Body: { items: object[] } | { value: object } (settings only)
 *
 * Each row is passed through a per-table sanitizer that maps legacy
 * UI fields to the actual Prisma schema, then createMany()-ed.
 * school_id is always taken from the JWT (never trusted from the body).
 */
router.post('/:table', async (req, res, next) => {
  try {
    const { repo } = getContainer();
    const { table } = req.params;

    const isAdmin = [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user?.role);
    const isStudentResultWrite =
      req.user?.role === ROLES.STUDENT && STUDENT_BULK_TABLES.has(table);
    if (!isAdmin && !isStudentResultWrite) {
      return next(new ForbiddenError());
    }

    let { items } = req.body;

    // Settings accept either {items:[{key,value}]} or {value:{k:v}} shape.
    if (table === 'settings' && !Array.isArray(items)) {
      items = normalizeSettingsBody(req.body);
    }
    // Object-stores (gamification) send the object as the whole body.
    if (table === 'gamification' && !Array.isArray(items)) {
      items = normalizeObjectStoreBody(req.body);
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'items must be a non-empty array',
      });
    }

    // Pre-load lookup maps so sanitizers can resolve FK references without
    // their own DB round-trips. Any table with a creator/owner/user FK needs
    // the users map; results / exam_sessions additionally needs the exams map.
    const needsUsers =
      table === 'results' ||
      table === 'exam_sessions' ||
      table === 'games' ||
      table === 'exams' ||
      table === 'tournaments' ||
      table === 'profile_requests';
    const needsExams = table === 'results' || table === 'exam_sessions';
    let legacyCtx = {};
    if (needsUsers || needsExams) {
      try {
        if (needsUsers) {
          const users = await repo.getAll('users', {
            filters: { school_id: req.schoolId },
            limit: 1000,
          });
          // getAll returns { data, total }.
          const list = users?.data ?? [];
          const userIdByKey = new Map();
          const validUserIds = new Set();
          for (const u of list) {
            if (!u?.id) continue;
            validUserIds.add(String(u.id));
            for (const k of [u.username, u.numero, u.name]) {
              if (k) userIdByKey.set(String(k).trim().toLowerCase(), String(u.id));
            }
          }
          legacyCtx.userIdByKey = userIdByKey;
          legacyCtx.validUserIds = validUserIds;
        }
        if (needsExams) {
          const exams = await repo.getAll('exams', {
            filters: { school_id: req.schoolId },
            limit: 1000,
          });
          const list = exams?.data ?? [];
          legacyCtx.validExamIds = new Set(list.map((e) => String(e.id)));
        }
      } catch (lookupErr) {
        // If lookup fails (fresh DB, repo not ready), continue with empty
        // maps; sanitizers will fall back to actorId / drop the row.
        logger.warn('bulk.routes: legacy-context lookup failed', {
          table,
          error: lookupErr?.message,
        });
      }
    }

    const sanitize = SANITIZERS[table];
    const required = REQUIRED_FIELDS[table] || [];
    const scoped = [];
    const droppedPerRow = [];
    let missingRequiredCount = 0;

    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      if (!sanitize) {
        // Unknown table — pass through with only school_id injected, but warn
        // loudly so we notice a missing sanitizer the first time it happens.
        logger.warn(`bulk.routes: no sanitizer registered for table "${table}" — passing through verbatim`);
        scoped.push({ ...item, school_id: req.schoolId });
        continue;
      }

      const cleaned = sanitize(item, req.schoolId, req.user?.id, legacyCtx);
      if (!cleaned) continue; // sanitizer chose to skip this row (e.g. game_presets)

      // A student may send the legacy results array, which can contain rows
      // from other users because the browser cache is shared/preloaded. The
      // sanitizer resolves every row to a real Prisma user; silently discard
      // rows outside the JWT owner and persist only this student's result.
      if (
        req.user?.role === ROLES.STUDENT &&
        table === 'results' &&
        String(cleaned.user_id) !== String(req.user.id)
      ) {
        continue;
      }

      // Pre-flight required-field guard: drop the row (and count it) rather
      // than letting Prisma reject the entire batch with P2009/P2003.
      const missing = required.filter((f) => cleaned[f] == null || cleaned[f] === '');
      if (missing.length > 0) {
        missingRequiredCount += 1;
        logger.warn('bulk.routes: dropping row missing required fields', {
          table,
          missing,
          rowId: item?.id ?? null,
          rowKeys: Object.keys(item || {}),
          cleanedKeys: Object.keys(cleaned || {}),
        });
        continue;
      }

      // Track which legacy keys we discarded so the warning is actionable.
      const kept = new Set(Object.keys(cleaned));
      const dropped = Object.keys(item).filter(
        (k) => !kept.has(k) && k !== 'school_id' && item[k] !== undefined,
      );
      droppedPerRow.push(dropped);
      scoped.push(cleaned);
    }

    if (scoped.length === 0) {
      // Either the table is intentionally skipped (game_presets) or every row
      // was rejected by the sanitizer. Return success with count 0 — telling
      // the truth (nothing was written) but not breaking the UI.
      return res.status(201).json({ count: 0, skipped: items.length });
    }

    if (droppedPerRow.some((d) => d.length > 0)) {
      logger.info('bulk.routes: dropped legacy-only fields', {
        table,
        sample: droppedPerRow[0],
      });
    }

    // The legacy UI sends the entire array each time (not just new rows), so
    // we must UPSERT — createMany alone would skip updates to existing rows.
    // Prisma has no efficient bulk-upsert on SQLite; doing per-row upsert is
    // fine for the data sizes involved (classes/categories/users in the low
    // hundreds at most) and avoids silently dropping edits.
    const model = repo.modelFor ? repo.modelFor(table) : null;
    let upserted = 0;
    if (model && typeof model.upsert === 'function') {
      for (const row of scoped) {
        // GamificationConfig is keyed by school_id, not id — handle explicitly.
        if (table === 'gamification') {
          const { school_id, ...rest } = row;
          await model.upsert({
            where: { school_id },
            create: row,
            update: rest,
          });
          upserted += 1;
          continue;
        }

        // Setting model has composite unique index @@unique([school_id, key]).
        if (table === 'settings') {
          await model.upsert({
            where: {
              school_id_key: { school_id: req.schoolId, key: row.key },
            },
            create: row,
            update: { value: row.value, ...(row.visibility && { visibility: row.visibility }) },
          });
          upserted += 1;
          continue;
        }
        // Strip the id from the update payload so Prisma doesn't try to set
        // the primary key on update (some drivers reject that).
        const { id, ...rest } = row;
        if (id) {
          // Users: never accept a client-supplied password_hash on UPDATE. The
          // UI's `passwordHash` is a sha256/simpleHash digest of whatever the
          // user typed — overwriting the bcrypt hash breaks login. Password
          // changes go through POST /users/:id/reset-password.
          if (table === 'users' && rest.password_hash !== undefined) {
            delete rest.password_hash;
          }
          // For exams the legacy UI sends partial `classes`/`questions`
          // (e.g. a class reassignment in class-management.js sends only
          // `classes`), and we persist those in `options_json` as a JSON
          // blob. Blindly overwriting would drop the untouched slice, so
          // merge the existing blob with the new one on update.
          if (
            table === 'exams' &&
            typeof rest.options_json === 'string' &&
            typeof model.findUnique === 'function'
          ) {
            try {
              const existing = await model.findUnique({
                where: { id: String(id) },
                select: { options_json: true },
              });
              if (existing?.options_json) {
                const prev = JSON.parse(existing.options_json);
                const next = JSON.parse(rest.options_json);
                rest.options_json = JSON.stringify({ ...prev, ...next });
              }
            } catch (mergeErr) {
              logger.warn('bulk.routes: options_json merge failed', {
                id,
                error: mergeErr?.message,
              });
            }
          }
          if (table === 'users' && row.password_hash === undefined) {
            // Bulk sync from list API / post-delete re-upload has no password —
            // treat as update-only (the row must already exist to be listed).
            await model.update({ where: { id: String(id) }, data: rest })
              .catch((err) => {
                if (err?.code !== 'P2025') throw err;
                // Row isn't actually in the DB yet: skip, don't create a
                // password-less user.
                missingRequiredCount += 1;
              });
          } else {
            await model.upsert({
              where: { id: String(id) },
              create: row,
              update: rest,
            });
          }
        } else if (table === 'users' && scoped.length > 0) {
          // Sanitizer dropped a legacy non-UUID id (e.g. "test-user-1",
          // "Date.now()"). Look the user up by username before creating —
          // otherwise we P2002 against the (school_id, username) unique
          // index for accounts that already exist in the DB.
          const existing = await model.findFirst({
            where: {
              school_id: req.schoolId,
              username: row.username,
            },
            select: { id: true },
          });
          if (existing) {
            // Never let a bulk sync overwrite the real bcrypt hash
            const { password_hash, ...rest } = row;
            await model.update({ where: { id: existing.id }, data: rest });
          } else {
            // Schema requires password_hash. If the payload didn't carry one
            // (the UI stripped it on update), skip this row rather than
            // creating a user with an un-loginable account.
            if (!row.password_hash) {
              missingRequiredCount += 1;
              logger.warn('bulk.routes: skipping user create without password_hash', {
                table, username: row.username,
              });
              continue;
            }
            await model.create({ data: row });
          }
        } else {
          await model.create({ data: row });
        }
        upserted += 1;
      }
      return res.status(201).json({
        count: upserted,
        ...(missingRequiredCount > 0 && { droppedInvalid: missingRequiredCount }),
      });
    }

    // Fallback: if the repo doesn't expose the underlying Prisma model,
    // use createMany (idempotent on ids) — updates to existing rows will be
    // dropped, but at least new rows are persisted.
    const result = await repo.createMany(table, scoped);
    res.status(201).json({
      ...result,
      ...(missingRequiredCount > 0 && { droppedInvalid: missingRequiredCount }),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
