/**
 * src/frontend/services/GameService.js
 * Manages multiplayer real-time games.
 *
 * This service is shared by the browser and the backend. The backend remains
 * authoritative for tenant ownership, question order, scoring, progression,
 * and final ranks; the browser repository only transports the requests.
 */

import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../../shared/errors.js';
import { GameCreateSchema, GameUpdateSchema, GameFilterSchema, GameJoinSchema } from '../../shared/schemas/game.schema.js';
import { ROLES, GAME_STATUS } from '../../shared/constants.js';

const RESERVED_INDEX_KEY = '__currentQuestionIndex';
const RESERVED_COMPLETE_KEY = '__completed';

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function parseObject(value) {
  const parsed = parseJson(value, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function questionIds(game) {
  const parsed = parseJson(game?.question_ids, []);
  return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
}

function safeQuestion(question, index, total) {
  if (!question) return null;
  const parsedOptions = parseJson(question.options_json, question.options ?? []);
  return {
    id: question.id,
    text: question.text ?? question.question ?? '',
    type: question.type ?? 'mcq',
    options: Array.isArray(parsedOptions) ? parsedOptions : [],
    points: Number(question.points) || 1,
    index,
    total,
  };
}

export class GameService {
  #repo;

  constructor(repo) {
    this.#repo = repo;
  }

  async list(filters = {}, pagination = {}) {
    const parsed = GameFilterSchema.safeParse({ ...filters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    return this.#repo.getAll('games', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id, schoolId = null) {
    return this.#getGame(id, schoolId);
  }

  async findByJoinCode(code, schoolId = null) {
    if (!code) throw new ValidationError({ join_code: ['Required'] });
    const { data } = await this.#repo.getAll('games', {
      filters: { join_code: String(code).toUpperCase() },
    });
    const game = data.find((candidate) => !schoolId || candidate.school_id === schoolId);
    if (!game) throw new NotFoundError('Game');
    return game;
  }

  async create(data, currentUser) {
    this.#requireAdmin(currentUser);
    const parsed = GameCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    await this.#assertQuestionSet(parsed.data.question_ids, currentUser.school_id);
    const joinCode = await this.#generateJoinCode();

    // Keep question_ids as an array at the service/API boundary. The backend
    // service is the only layer that serializes it for Prisma.
    return this.#repo.create('games', {
      ...parsed.data,
      school_id: currentUser?.school_id,
      creator_id: currentUser?.id ?? null,
      status: GAME_STATUS.WAITING,
      join_code: joinCode,
    });
  }

  async update(id, data, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#getGame(id, currentUser.school_id);
    if (existing.status !== GAME_STATUS.WAITING) {
      throw new ValidationError({ status: ['Cannot modify a game that has already started'] });
    }

    const parsed = GameUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    if (parsed.data.question_ids) {
      await this.#assertQuestionSet(parsed.data.question_ids, currentUser.school_id);
    }

    return this.#repo.update('games', id, parsed.data);
  }

  async joinGame({ gameId, joinCode, userId, schoolId = null }) {
    const parsed = GameJoinSchema.safeParse({ game_id: gameId, join_code: joinCode });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const game = gameId
      ? await this.#getGame(gameId, schoolId)
      : await this.findByJoinCode(joinCode, schoolId);

    if (game.status === GAME_STATUS.FINISHED) {
      throw new ValidationError({ status: ['This game has already finished'] });
    }
    if (![GAME_STATUS.WAITING, GAME_STATUS.ACTIVE, GAME_STATUS.PAUSED].includes(game.status)) {
      throw new ValidationError({ status: ['This game is not accepting players'] });
    }

    const { data: existingSessions } = await this.#repo.getAll('game_sessions', {
      filters: { game_id: game.id, user_id: userId },
    });

    if (existingSessions.length > 0) {
      return this.#repo.update('game_sessions', existingSessions[0].id, { connected: true });
    }

    const settings = parseObject(game.settings_json);
    const maxPlayers = Number(settings.max_players ?? settings.maxPlayers ?? 0);
    const { data: playerSessions } = await this.#repo.getAll('game_sessions', {
      filters: { game_id: game.id, ...(schoolId ? { school_id: schoolId } : {}) },
      limit: 100000,
    });
    if (Number.isInteger(maxPlayers) && maxPlayers > 0 && playerSessions.length >= maxPlayers) {
      throw new ConflictError('This game lobby is full');
    }

    return this.#repo.create('game_sessions', {
      game_id: game.id,
      user_id: userId,
      school_id: game.school_id,
      score: 0,
      answers_json: '{}',
      completed: false,
      connected: true,
      joined_at: new Date().toISOString(),
    });
  }

  async start(gameId, currentUser) {
    this.#requireAdmin(currentUser);
    const game = await this.#getGame(gameId, currentUser.school_id);
    if (game.status !== GAME_STATUS.WAITING) {
      throw new ValidationError({ status: ['Game has already started'] });
    }

    const ids = questionIds(game);
    if (!ids.length) throw new ValidationError({ question_ids: ['A game must contain at least one question'] });

    if (typeof this.#repo.startGame === 'function') {
      return this.#repo.startGame(gameId);
    }

    return this.#repo.update('games', gameId, {
      status: GAME_STATUS.ACTIVE,
      started_at: new Date().toISOString(),
    });
  }

  async recordAnswer({ gameId, userId, questionId, answer, schoolId = null }) {
    const game = await this.#getGame(gameId, schoolId);
    if (game.status !== GAME_STATUS.ACTIVE) {
      throw new ValidationError({ status: ['Game is not active'] });
    }

    const ids = questionIds(game);
    if (!ids.length || !ids.includes(String(questionId))) {
      throw new ValidationError({ question_id: ['Question is not part of this game'] });
    }

    const session = await this.#getSession(gameId, userId);
    if (!session) throw new NotFoundError('Session');
    if (session.completed) {
      throw new ValidationError({ status: ['You have completed this game'] });
    }

    const answers = parseObject(session.answers_json);
    const currentIndex = Math.min(
      Math.max(Number(answers[RESERVED_INDEX_KEY]) || 0, 0),
      ids.length,
    );

    // Retries are idempotent: a reconnect or double-click never awards points
    // twice for the same question.
    if (Object.prototype.hasOwnProperty.call(answers, questionId)) {
      const previous = answers[questionId];
      return {
        correct: Boolean(previous && typeof previous === 'object' ? previous.correct : false),
        points: 0,
        showAnswer: false,
        correctAnswer: null,
        alreadyAnswered: true,
        completed: Boolean(answers[RESERVED_COMPLETE_KEY]),
        nextQuestion: await this.#getQuestionForIndex(game, currentIndex, schoolId),
      };
    }

    const expectedQuestionId = ids[currentIndex];
    if (!expectedQuestionId || String(questionId) !== String(expectedQuestionId)) {
      throw new ValidationError({ question_id: ['Answer the current question before advancing'] });
    }

    const question = await this.#getQuestion(questionId, schoolId);
    const isCorrect = String(answer).trim().toLowerCase() === String(question.answer).trim().toLowerCase();
    const points = isCorrect ? (Number(question.points) || 1) : 0;
    const nextIndex = currentIndex + 1;
    const completed = nextIndex >= ids.length;

    answers[questionId] = { value: String(answer), correct: isCorrect };
    answers[RESERVED_INDEX_KEY] = nextIndex;
    answers[RESERVED_COMPLETE_KEY] = completed;

    const sessionUpdate = {
      score: (Number(session.score) || 0) + points,
      answers_json: JSON.stringify(answers),
      completed,
    };
    if (completed) sessionUpdate.completed_at = new Date().toISOString();
    await this.#repo.update('game_sessions', session.id, sessionUpdate);

    const settings = parseObject(game.settings_json);
    const showAnswer = settings.show_answers_immediately ?? false;

    return {
      correct: isCorrect,
      points,
      showAnswer,
      correctAnswer: showAnswer ? question.answer : null,
      completed,
      nextQuestion: completed ? null : await this.#getQuestionForIndex(game, nextIndex, schoolId),
    };
  }

  async getScores(gameId, schoolId = null) {
    await this.#getGame(gameId, schoolId);
    if (typeof this.#repo.getGameScores === 'function') {
      return this.#repo.getGameScores(gameId);
    }
    const sessions = await this.#repo.query('game.sessions', { gameId, schoolId });
    return sessions
      .map((s) => ({
        userId: s.user?.id ?? s.user_id,
        username: s.user?.username,
        playerName: s.user?.name ?? s.user?.username,
        name: s.user?.name ?? s.user?.username,
        score: Number(s.score) || 0,
        rank: s.rank,
        completed: Boolean(s.completed),
        connected: Boolean(s.connected),
      }))
      .sort((a, b) => b.score - a.score || String(a.playerName).localeCompare(String(b.playerName)));
  }

  async getClientState(gameId, { schoolId = null, userId = null } = {}) {
    const game = await this.#getGame(gameId, schoolId);
    const settings = parseObject(game.settings_json);
    const currentQuestion = game.status === GAME_STATUS.ACTIVE || game.status === GAME_STATUS.PAUSED
      ? (userId
        ? await this.getCurrentQuestion(gameId, { schoolId, userId })
        : await this.#getQuestionForIndex(game, 0, schoolId))
      : null;
    const session = userId ? await this.#getSession(gameId, userId) : null;

    return {
      id: game.id,
      name: game.name,
      type: game.type,
      status: game.status,
      // Never expose question_ids or reserved server state to clients.
      settings_json: JSON.stringify(
        Object.fromEntries(Object.entries(settings).filter(([key]) => !key.startsWith('__'))),
      ),
      currentQuestion,
      questionCount: questionIds(game).length,
      completed: Boolean(session?.completed || parseObject(session?.answers_json)[RESERVED_COMPLETE_KEY]),
    };
  }

  async getCurrentQuestion(gameId, { schoolId = null, userId = null } = {}) {
    const game = await this.#getGame(gameId, schoolId);
    const session = userId ? await this.#getSession(gameId, userId) : null;
    const answers = parseObject(session?.answers_json);
    const index = Math.max(Number(answers[RESERVED_INDEX_KEY]) || 0, 0);
    if (session?.completed || answers[RESERVED_COMPLETE_KEY]) return null;
    return this.#getQuestionForIndex(game, index, schoolId);
  }

  async finish(gameId, currentUser) {
    this.#requireAdmin(currentUser);
    const game = await this.#getGame(gameId, currentUser.school_id);
    if (game.status === GAME_STATUS.FINISHED) return game;
    if (![GAME_STATUS.ACTIVE, GAME_STATUS.PAUSED].includes(game.status)) {
      throw new ValidationError({ status: ['Only an active game can be finished'] });
    }

    if (typeof this.#repo.finishGame === 'function') {
      return this.#repo.finishGame(gameId);
    }

    const sessions = await this.#repo.query('game.sessions', {
      gameId,
      schoolId: currentUser.school_id,
    });
    sessions.sort((a, b) => Number(b.score) - Number(a.score));

    for (let i = 0; i < sessions.length; i++) {
      await this.#repo.update('game_sessions', sessions[i].id, {
        rank: i + 1,
        completed: true,
        completed_at: new Date().toISOString(),
      });
    }

    return this.#repo.update('games', gameId, {
      status: GAME_STATUS.FINISHED,
      ended_at: new Date().toISOString(),
    });
  }

  async markPlayerDisconnected(userId, schoolId = null, gameId = null) {
    const { data: sessions } = await this.#repo.getAll('game_sessions', {
      filters: {
        user_id: userId,
        ...(gameId ? { game_id: gameId } : {}),
        ...(schoolId ? { school_id: schoolId } : {}),
        connected: true,
        completed: false,
      },
    });
    for (const session of sessions) {
      await this.#repo.update('game_sessions', session.id, { connected: false });
    }
  }

  async leaveGame({ gameId, userId, schoolId = null }) {
    await this.#getGame(gameId, schoolId);
    const { data: sessions } = await this.#repo.getAll('game_sessions', {
      filters: { game_id: gameId, user_id: userId, ...(schoolId ? { school_id: schoolId } : {}) },
    });
    if (sessions[0] && !sessions[0].completed) {
      return this.#repo.update('game_sessions', sessions[0].id, { connected: false });
    }
    return sessions[0] ?? null;
  }

  async delete(id, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#getGame(id, currentUser.school_id);

    if ([GAME_STATUS.ACTIVE, GAME_STATUS.PAUSED].includes(existing.status)) {
      throw new ValidationError({ status: ['Cannot delete an active game; finish it first'] });
    }

    const { data: sessions } = await this.#repo.getAll('game_sessions', {
      filters: { game_id: id },
    });
    for (const session of sessions) {
      await this.#repo.delete('game_sessions', session.id);
    }

    await this.#repo.delete('games', id);
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.TEACHER, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }

  async #getGame(id, schoolId = null) {
    const game = await this.#repo.getById('games', id);
    if (!game || (schoolId && game.school_id !== schoolId)) throw new NotFoundError('Game');
    return game;
  }

  async #getQuestion(id, schoolId = null) {
    const question = await this.#repo.getById('questions', id);
    if (!question || (schoolId && question.school_id !== schoolId)) throw new NotFoundError('Question');
    return question;
  }

  async #getSession(gameId, userId) {
    const { data } = await this.#repo.getAll('game_sessions', {
      filters: { game_id: gameId, user_id: userId },
    });
    return data[0] ?? null;
  }

  async #getQuestionForIndex(game, index, schoolId = null) {
    const ids = questionIds(game);
    if (index < 0 || index >= ids.length) return null;
    const question = await this.#getQuestion(ids[index], schoolId);
    return safeQuestion(question, index, ids.length);
  }

  async #assertQuestionSet(ids, schoolId) {
    const uniqueIds = [...new Set((ids ?? []).map(String))];
    if (uniqueIds.length !== (ids ?? []).length) {
      throw new ValidationError({ question_ids: ['Questions must not be duplicated'] });
    }

    const missing = [];
    for (const id of uniqueIds) {
      try { await this.#getQuestion(id, schoolId); }
      catch { missing.push(id); }
    }
    if (missing.length) {
      throw new ValidationError({
        question_ids: ['Unknown or inaccessible question(s): ' + missing.join(', ')],
      });
    }
  }

  async #generateJoinCode() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');
      const { data } = await this.#repo.getAll('games', {
        filters: { join_code: code },
        limit: 1,
        offset: 0,
      });
      if (!data?.length) return code;
    }
    throw new ConflictError('Could not allocate a unique game code');
  }
}
