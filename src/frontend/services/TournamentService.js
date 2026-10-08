/**
 * src/frontend/services/TournamentService.js
 * Manages Tournaments and leaderboards.
 */

import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../../shared/errors.js';
import { TournamentCreateSchema, TournamentUpdateSchema, TournamentFilterSchema } from '../../shared/schemas/tournament.schema.js';
import { ROLES, TOURNAMENT_STATUS, RESULT_MODE }                              from '../../shared/constants.js';

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function parseObject(value) {
  const parsed = parseJson(value, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/**
 * The authoritative set of questions a tournament scores against. Preferred
 * source is the dedicated `question_ids` column (like Game.question_ids);
 * tournaments created before it existed carry the set in settings_json.
 * An empty array means "no declared set" and disables membership checks.
 */
function questionSetOf(tournament) {
  const column = parseJson(tournament?.question_ids, []);
  if (Array.isArray(column) && column.length) return column.map(String).filter(Boolean);
  const fromSettings = parseObject(tournament?.settings_json).question_ids;
  if (Array.isArray(fromSettings) && fromSettings.length) return fromSettings.map(String).filter(Boolean);
  return [];
}

export class TournamentService {
  #repo;
  #gameService;

  constructor(repo, gameService) {
    this.#repo        = repo;
    this.#gameService = gameService;
  }

  async list(filters = {}, pagination = {}) {
    // `creator_id` is server-derived (route-enforced teacher scope / admin
    // author filter), not client input — validate the rest, then re-attach.
    const { creator_id = undefined, ...restFilters } = filters;
    const parsed = TournamentFilterSchema.safeParse({ ...restFilters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    if (creator_id !== undefined) rest.creator_id = creator_id;
    return this.#repo.getAll('tournaments', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id) {
    const t = await this.#repo.getById('tournaments', id);
    if (!t) throw new NotFoundError('Tournament');
    return t;
  }

  async create(data, currentUser) {
    this.#requireAdmin(currentUser);
    const parsed = TournamentCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    await this.#assertKidsGame(parsed.data.kids_game_id, currentUser?.school_id);

    const setIds = parseObject(parsed.data.settings_json).question_ids;
    const questionIds = Array.isArray(setIds) ? setIds.map(String).filter(Boolean) : [];
    await this.#assertQuestionSet(questionIds, currentUser);

    return this.#repo.create('tournaments', {
      ...parsed.data,
      question_ids: JSON.stringify(questionIds),
      school_id:  currentUser?.school_id,
      creator_id: currentUser?.id        ?? 'system',
      status:     TOURNAMENT_STATUS.DRAFT,
    });
  }

  async update(id, data, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('tournaments', id);
    if (!existing) throw new NotFoundError('Tournament');
    if (existing.status === TOURNAMENT_STATUS.FINISHED) {
      throw new ValidationError({ status: ['Cannot modify a finished tournament'] });
    }

    const parsed = TournamentUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    if (parsed.data.kids_game_id !== undefined) {
      await this.#assertKidsGame(parsed.data.kids_game_id, existing.school_id);
    }

    const patch = { ...parsed.data };
    if (parsed.data.settings_json !== undefined) {
      const setIds = parseObject(parsed.data.settings_json).question_ids;
      const questionIds = Array.isArray(setIds) ? setIds.map(String).filter(Boolean) : [];
      await this.#assertQuestionSet(questionIds, currentUser);
      patch.question_ids = JSON.stringify(questionIds);
    }

    return this.#repo.update('tournaments', id, patch);
  }

  /**
   * Validate a tournament's question set: every id must exist in the school
   * (admins may pick any), and a teacher may only pick questions they authored
   * — the same rule questions.routes.js applies to the bank itself.
   */
  async #assertQuestionSet(questionIds, currentUser) {
    if (!questionIds.length) return;
    const schoolId = currentUser?.school_id ?? null;
    const isTeacher = currentUser?.role === ROLES.TEACHER;
    const missing = [];
    const foreign = [];
    for (const id of questionIds) {
      let question = null;
      try { question = await this.#repo.getById('questions', id); }
      catch { missing.push(id); continue; }
      if (!question || (schoolId && question.school_id !== schoolId)) {
        missing.push(id);
        continue;
      }
      if (isTeacher && question.created_by !== currentUser.id) foreign.push(id);
    }
    if (missing.length) {
      throw new ValidationError({ question_ids: ['Unknown question(s): ' + missing.join(', ')] });
    }
    if (foreign.length) {
      throw new ValidationError({ question_ids: ['Not your question(s): ' + foreign.join(', ')] });
    }
  }

  /** A linked kids game must exist, be published, and belong to the school. */
  async #assertKidsGame(kidsGameId, schoolId) {
    if (kidsGameId == null || kidsGameId === '') return;
    const game = await this.#repo.getById('kidsGames', kidsGameId);
    if (!game || (schoolId && game.school_id !== schoolId)) {
      throw new ValidationError({ kids_game_id: ['Unknown kids game'] });
    }
    if (game.status !== 'published') {
      throw new ValidationError({ kids_game_id: ['Kids game must be published first'] });
    }
  }

  async open(id, currentUser) {
    this.#requireAdmin(currentUser);
    const t = await this.#repo.getById('tournaments', id);
    if (!t) throw new NotFoundError('Tournament');
    if (t.status !== TOURNAMENT_STATUS.DRAFT) {
      throw new ValidationError({ status: ['Only draft tournaments can be opened'] });
    }
    return this.#repo.update('tournaments', id, { status: TOURNAMENT_STATUS.OPEN });
  }

  async close(id, currentUser) {
    this.#requireAdmin(currentUser);
    const t = await this.#repo.getById('tournaments', id);
    if (!t) throw new NotFoundError('Tournament');
    if (t.status !== TOURNAMENT_STATUS.OPEN) {
      throw new ValidationError({ status: ['Only open tournaments can be closed (made active)'] });
    }
    return this.#repo.update('tournaments', id, { status: TOURNAMENT_STATUS.ACTIVE });
  }

  async register(tournamentId, userId) {
    const t = await this.#repo.getById('tournaments', tournamentId);
    if (!t) throw new NotFoundError('Tournament');
    if (t.status !== TOURNAMENT_STATUS.OPEN && t.status !== TOURNAMENT_STATUS.ACTIVE) {
      throw new ValidationError({ status: ['Registration is closed'] });
    }

    if (typeof this.#repo.registerTournament === 'function') {
      return this.#repo.registerTournament(tournamentId);
    }

    const { data: existing } = await this.#repo.getAll('tournament_entries', {
      filters: { tournament_id: tournamentId, user_id: userId },
    });
    if (existing.length > 0) throw new ConflictError('Already registered');

    return this.#repo.create('tournament_entries', {
      tournament_id: tournamentId,
      user_id:       userId,
      school_id:     t.school_id,
      score:         0,
      completed:     false,
      registered_at: new Date().toISOString(),
    });
  }

  async getLeaderboard(tournamentId, limit = 50) {
    // Express hands query params over as strings; Prisma's `take` demands an
    // Int, so an explicit ?limit=50 would otherwise throw. Coerce once here so
    // both the REST path and the socket path stay integer-only.
    const parsedLimit = Number(limit);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), 5000)
      : 50;
    if (typeof this.#repo.getTournamentLeaderboard === 'function') {
      return this.#repo.getTournamentLeaderboard(tournamentId, safeLimit);
    }
    return this.#repo.query('tournament.leaderboard', { tournamentId, limit: safeLimit });
  }

  /**
   * Score a single tournament answer (used by the realtime tournament handler).
   * Mirrors GameService.recordAnswer's scoring logic but accumulates the
   * tournament entry's aggregate `score` (entries don't store per-question
   * answers — only a running total).
   *
   * @returns {Promise<{ correct: boolean, points: number, score: number, showAnswer: boolean, correctAnswer: string|null }>}
   */
  async recordAnswer({ tournamentId, userId, questionId, answer }) {
    if (typeof this.#repo.answerTournament === 'function') {
      return this.#repo.answerTournament(tournamentId, questionId, answer);
    }
    const t = await this.#repo.getById('tournaments', tournamentId);
    if (!t) throw new NotFoundError('Tournament');
    if (t.status !== TOURNAMENT_STATUS.ACTIVE) {
      throw new ValidationError({ status: ['Tournament is not active'] });
    }

    // Only questions from the tournament's declared set may be scored. The
    // check is skipped when no set is declared (older tournaments) because
    // there is nothing to be outside of.
    const setIds = questionSetOf(t);
    if (setIds.length && !setIds.includes(String(questionId))) {
      throw new ValidationError({ question_id: ['Question is not part of this tournament'] });
    }

    const { data: entries } = await this.#repo.getAll('tournament_entries', {
      filters: { tournament_id: tournamentId, user_id: userId },
    });
    const entry = entries[0];
    if (!entry) throw new NotFoundError('TournamentEntry (not registered)');

    // Idempotent: a reconnect, retry or a deliberate loop must never farm the
    // same question twice. Mirrors GameService.recordAnswer's guard.
    const answers = parseObject(entry.answers_json);
    if (Object.prototype.hasOwnProperty.call(answers, questionId)) {
      return {
        correct: Boolean(answers[questionId]?.correct),
        points: 0,
        score: Number(entry.score) || 0,
        showAnswer: false,
        correctAnswer: null,
        alreadyAnswered: true,
      };
    }

    const question = await this.#repo.getById('questions', questionId);
    if (!question) throw new NotFoundError('Question');

    const isCorrect = String(answer).trim().toLowerCase() === String(question.answer).trim().toLowerCase();
    const points    = isCorrect ? (question.points ?? 1) : 0;

    answers[questionId] = { value: String(answer), correct: isCorrect };
    await this.#repo.update('tournament_entries', entry.id, {
      score: (Number(entry.score) || 0) + points,
      answers_json: JSON.stringify(answers),
    });

    const settings = parseObject(t.settings_json);
    const showAnswer = settings.show_answers_immediately ?? false;

    return {
      correct:      isCorrect,
      points,
      score:        (Number(entry.score) || 0) + points,
      showAnswer,
      correctAnswer: showAnswer ? question.answer : null,
      alreadyAnswered: false,
    };
  }

  async finish(id, currentUser) {
    this.#requireAdmin(currentUser);
    const t = await this.#repo.getById('tournaments', id);
    if (!t) throw new NotFoundError('Tournament');

    const entries = await this.#repo.query('tournament.leaderboard', { tournamentId: id, limit: 9999 });
    for (let i = 0; i < entries.length; i++) {
      await this.#repo.update('tournament_entries', entries[i].id, {
        rank:         i + 1,
        completed:    true,
        completed_at: new Date().toISOString(),
      });
    }

    // Archive a Result per ranked entry (mode 'tournament') so the finished
    // tournament appears in each student's history. Backend-only: the generic
    // browser repository has no modelFor marker and must never write results.
    if (typeof this.#repo.modelFor === 'function') {
      const ids = questionSetOf(t);
      let totalPoints = 0;
      for (const qid of ids) {
        try {
          const question = await this.#repo.getById('questions', qid);
          totalPoints += Number(question?.points) || 1;
        } catch { /* question removed after start - ignore */ }
      }
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const earned = Number(entry.score) || 0;
        const percent = totalPoints > 0
          ? Math.round((earned / totalPoints) * 10000) / 100
          : 0;
        try {
          await this.#repo.create('results', {
            school_id: t.school_id,
            exam_id: null,
            user_id: entry.user_id ?? null,
            score: percent,
            total_points: totalPoints,
            earned_points: earned,
            time_spent: null,
            answers_json: JSON.stringify({
              ...parseObject(entry.answers_json),
              tournamentId: t.id,
              tournamentName: t.name,
              mode: RESULT_MODE.TOURNAMENT,
              rank: i + 1,
              totalQuestions: ids.length,
            }),
            mode: RESULT_MODE.TOURNAMENT,
            passed: percent >= 50,
            attempt_number: 1,
            date_taken: new Date().toISOString(),
          });
        } catch { /* best-effort archive */ }
      }
    }

    return this.#repo.update('tournaments', id, { status: TOURNAMENT_STATUS.FINISHED });
  }

  async delete(id, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('tournaments', id);
    if (!existing) throw new NotFoundError('Tournament');

    // Prevent deletion of active tournaments
    if (existing.status === TOURNAMENT_STATUS.ACTIVE) {
      throw new ValidationError({ status: ['Cannot delete an active tournament'] });
    }

    // Cascade: delete all entries first
    const { data: entries } = await this.#repo.getAll('tournament_entries', {
      filters: { tournament_id: id },
    });
    for (const e of entries) {
      await this.#repo.delete('tournament_entries', e.id);
    }

    await this.#repo.delete('tournaments', id);
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.TEACHER, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }
}
