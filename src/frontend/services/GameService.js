/**
 * src/frontend/services/GameService.js
 * Manages multiplayer real-time games.
 */

import { NotFoundError, ForbiddenError, ValidationError }       from '../../shared/errors.js';
import { GameCreateSchema, GameUpdateSchema, GameFilterSchema, GameJoinSchema } from '../../shared/schemas/game.schema.js';
import { ROLES, GAME_STATUS }                                   from '../../shared/constants.js';

export class GameService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async list(filters = {}, pagination = {}) {
    const parsed = GameFilterSchema.safeParse({ ...filters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    return this.#repo.getAll('games', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id) {
    const game = await this.#repo.getById('games', id);
    if (!game) throw new NotFoundError('Game');
    return game;
  }

  async findByJoinCode(code) {
    if (!code) throw new ValidationError({ join_code: ['Required'] });
    const { data } = await this.#repo.getAll('games', {
      filters: { join_code: code.toUpperCase() },
    });
    if (data.length === 0) throw new NotFoundError('Game');
    return data[0];
  }

  async create(data, currentUser) {
    this.#requireAdmin(currentUser);
    const parsed = GameCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    // Generate unique 6-char join code
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    return this.#repo.create('games', {
      ...parsed.data,
      school_id:    currentUser?.school_id ?? 'local',
      creator_id:   currentUser?.id        ?? 'system',
      status:       GAME_STATUS.WAITING,
      join_code:    joinCode,
      question_ids: JSON.stringify(parsed.data.question_ids),
    });
  }

  async update(id, data, currentUser) {
    this.#requireAdmin(currentUser);
    const existing = await this.#repo.getById('games', id);
    if (!existing) throw new NotFoundError('Game');
    if (existing.status !== GAME_STATUS.WAITING) {
      throw new ValidationError({ status: ['Cannot modify a game that has already started'] });
    }

    const parsed = GameUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const updateData = { ...parsed.data };
    if (parsed.data.question_ids) {
      updateData.question_ids = JSON.stringify(parsed.data.question_ids);
    }

    return this.#repo.update('games', id, updateData);
  }

  async joinGame({ gameId, joinCode, userId }) {
    const parsed = GameJoinSchema.safeParse({ game_id: gameId, join_code: joinCode });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    let game;
    if (gameId) {
      game = await this.#repo.getById('games', gameId);
    } else {
      const { data } = await this.#repo.getAll('games', { filters: { join_code: joinCode.toUpperCase() } });
      game = data[0];
    }

    if (!game) throw new NotFoundError('Game not found or invalid code');
    if (game.status === GAME_STATUS.FINISHED) throw new ValidationError({ status: ['This game has already finished'] });

    // Check if player is already in this game
    const { data: existingSessions } = await this.#repo.getAll('game_sessions', {
      filters: { game_id: game.id, user_id: userId },
    });

    if (existingSessions.length > 0) {
      // Re-joining an active session — mark as connected
      return this.#repo.update('game_sessions', existingSessions[0].id, { connected: true });
    }

    return this.#repo.create('game_sessions', {
      game_id:      game.id,
      user_id:      userId,
      school_id:    game.school_id,
      score:        0,
      answers_json: '{}',
      completed:    false,
      connected:    true,
      joined_at:    new Date().toISOString(),
    });
  }

  async start(gameId, currentUser) {
    this.#requireAdmin(currentUser);
    const game = await this.#repo.getById('games', gameId);
    if (!game) throw new NotFoundError('Game');
    if (game.status !== GAME_STATUS.WAITING) {
      throw new ValidationError({ status: ['Game has already started'] });
    }
    return this.#repo.update('games', gameId, {
      status:     GAME_STATUS.ACTIVE,
      started_at: new Date().toISOString(),
    });
  }

  async recordAnswer({ gameId, userId, questionId, answer }) {
    const game = await this.#repo.getById('games', gameId);
    if (!game || game.status !== GAME_STATUS.ACTIVE) {
      throw new ValidationError({ status: ['Game is not active'] });
    }

    const { data: sessions } = await this.#repo.getAll('game_sessions', {
      filters: { game_id: gameId, user_id: userId },
    });
    const session = sessions[0];
    if (!session) throw new NotFoundError('Session');

    const question = await this.#repo.getById('questions', questionId);
    if (!question) throw new NotFoundError('Question');

    const isCorrect = String(answer).trim().toLowerCase() === String(question.answer).trim().toLowerCase();
    const points    = isCorrect ? (question.points ?? 1) : 0;

    const answers = JSON.parse(session.answers_json || '{}');
    answers[questionId] = answer;

    await this.#repo.update('game_sessions', session.id, {
      score:        session.score + points,
      answers_json: JSON.stringify(answers),
    });

    const settings = JSON.parse(game.settings_json || '{}');
    const showAnswer = settings.show_answers_immediately ?? false;

    return {
      correct: isCorrect,
      points,
      showAnswer,
      correctAnswer: showAnswer ? question.answer : null,
    };
  }

  async getScores(gameId) {
    const sessions = await this.#repo.query('game.activeSessions', { gameId });
    return sessions
      .map(s => ({
        userId:   s.user?.id,
        username: s.user?.username,
        name:     s.user?.name,
        score:    s.score,
        rank:     s.rank,
      }))
      .sort((a, b) => b.score - a.score);
  }

  async getClientState(gameId) {
    const game = await this.#repo.getById('games', gameId);
    if (!game) throw new NotFoundError('Game');

    // NEVER return raw question IDs array which could let clients cheat by fetching questions early
    // Game logic usually requires the server to broadcast the *current* question
    // This is just the base safe state
    return {
      id:            game.id,
      name:          game.name,
      type:          game.type,
      status:        game.status,
      settings_json: game.settings_json,
    };
  }

  async finish(gameId, currentUser) {
    this.#requireAdmin(currentUser);
    const game = await this.#repo.getById('games', gameId);
    if (!game) throw new NotFoundError('Game');

    const sessions = await this.#repo.query('game.activeSessions', { gameId });
    sessions.sort((a, b) => b.score - a.score);

    for (let i = 0; i < sessions.length; i++) {
      await this.#repo.update('game_sessions', sessions[i].id, {
        rank:         i + 1,
        completed:    true,
        completed_at: new Date().toISOString(),
      });
    }

    return this.#repo.update('games', gameId, {
      status:   GAME_STATUS.FINISHED,
      ended_at: new Date().toISOString(),
    });
  }

  async markPlayerDisconnected(userId) {
    const { data: sessions } = await this.#repo.getAll('game_sessions', {
      filters: { user_id: userId, connected: true, completed: false },
    });
    for (const s of sessions) {
      await this.#repo.update('game_sessions', s.id, { connected: false });
    }
  }

  #requireAdmin(user) {
    if (!user || ![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenError();
    }
  }
}
