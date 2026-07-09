/**
 * tests/unit/GameService.test.js
 *
 * Unit tests for GameService with a mocked repository, grounded in the real
 * signatures in src/frontend/services/GameService.js:
 *   - constructor(repo)
 *   - joinGame({ gameId, joinCode, userId })    — re-joins an existing session
 *   - recordAnswer({ gameId, userId, questionId, answer }) — scores + never reveals answer unless show_answers_immediately
 *   - markPlayerDisconnected(userId)             — disconnects all active sessions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameService } from '../../src/frontend/services/GameService.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../src/shared/errors.js';
import { ROLES, GAME_STATUS } from '../../src/shared/constants.js';

const ADMIN = { id: 'u-admin', role: ROLES.ADMIN, school_id: 's-1' };

function makeRepo(overrides = {}) {
  return {
    getAll:     vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getById:    vi.fn().mockResolvedValue(null),
    create:     vi.fn(),
    update:     vi.fn(),
    delete:     vi.fn(),
    query:      vi.fn().mockResolvedValue([]),
    createMany: vi.fn(),
    ...overrides,
  };
}

describe('GameService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new GameService(repo);
  });

  describe('create()', () => {
    it('throws ForbiddenError for a non-admin', async () => {
      await expect(service.create({ name: 'G', type: 'quiz', question_ids: [] }, { id: 'u', role: ROLES.STUDENT, school_id: 's-1' }))
        .rejects.toBeInstanceOf(ForbiddenError);
    });

    it('generates a join_code and assigns the creator + school', async () => {
      repo.create.mockImplementation(async (_, data) => ({ id: 'g1', ...data }));
      const game = await service.create({ name: 'G', type: 'quiz', question_ids: ['q1'] }, ADMIN);
      expect(game.join_code).toMatch(/^[A-Z0-9]{6}$/);
      expect(game.school_id).toBe('s-1');
      expect(game.creator_id).toBe('u-admin');
      expect(game.status).toBe(GAME_STATUS.WAITING);
    });
  });

  describe('joinGame()', () => {
    it('throws NotFoundError when the game does not exist', async () => {
      repo.getById.mockResolvedValue(null);
      await expect(service.joinGame({ gameId: 'missing', userId: 'u-1' })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('re-activates an existing session (marks connected:true) instead of duplicating', async () => {
      repo.getById.mockResolvedValue({ id: 'g1', school_id: 's-1', status: GAME_STATUS.WAITING });
      repo.getAll.mockResolvedValue({ data: [{ id: 'gs1', connected: false }], total: 1 });
      repo.update.mockResolvedValue({ id: 'gs1', connected: true });

      const result = await service.joinGame({ gameId: 'g1', userId: 'u-1' });
      expect(result.connected).toBe(true);
      expect(repo.update).toHaveBeenCalledWith('game_sessions', 'gs1', { connected: true });
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('creates a new game_sessions row when the player is new', async () => {
      repo.getById.mockResolvedValue({ id: 'g1', school_id: 's-1', status: GAME_STATUS.WAITING });
      repo.getAll.mockResolvedValue({ data: [], total: 0 }); // no existing session
      repo.create.mockImplementation(async (_, data) => ({ id: 'gs-new', ...data }));

      const result = await service.joinGame({ gameId: 'g1', userId: 'u-1' });
      expect(result.id).toBe('gs-new');
      expect(result.connected).toBe(true);
      expect(repo.create).toHaveBeenCalledOnce();
    });

    it('throws ValidationError when the game is already finished', async () => {
      repo.getById.mockResolvedValue({ id: 'g1', school_id: 's-1', status: GAME_STATUS.FINISHED });
      await expect(service.joinGame({ gameId: 'g1', userId: 'u-1' })).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('recordAnswer()', () => {
    it('throws ValidationError when the game is not active', async () => {
      repo.getById.mockResolvedValue({ id: 'g1', status: GAME_STATUS.WAITING });
      await expect(service.recordAnswer({ gameId: 'g1', userId: 'u-1', questionId: 'q1', answer: 'A' }))
        .rejects.toBeInstanceOf(ValidationError);
    });

    it('scores a correct answer and NEVER reveals the answer when show_answers_immediately is off', async () => {
      repo.getById.mockResolvedValue({ id: 'g1', status: GAME_STATUS.ACTIVE, settings_json: '{}' });
      repo.getAll.mockResolvedValue({ data: [{ id: 'gs1', score: 5, answers_json: '{}' }], total: 1 });
      repo.getById.mockResolvedValueOnce({ id: 'g1', status: GAME_STATUS.ACTIVE, settings_json: '{}' });
      repo.getById.mockResolvedValueOnce({ id: 'q1', answer: 'A', points: 2 });
      repo.update.mockResolvedValue({});

      const result = await service.recordAnswer({ gameId: 'g1', userId: 'u-1', questionId: 'q1', answer: 'A' });
      expect(result.correct).toBe(true);
      expect(result.points).toBe(2);
      expect(result.showAnswer).toBe(false);
      expect(result.correctAnswer).toBeNull();
    });

    it('reveals the answer only when the game\'s show_answers_immediately setting is on', async () => {
      repo.getById.mockResolvedValueOnce({ id: 'g1', status: GAME_STATUS.ACTIVE, settings_json: '{"show_answers_immediately":true}' });
      repo.getAll.mockResolvedValue({ data: [{ id: 'gs1', score: 0, answers_json: '{}' }], total: 1 });
      repo.getById.mockResolvedValueOnce({ id: 'q1', answer: 'B', points: 1 });
      repo.update.mockResolvedValue({});

      const result = await service.recordAnswer({ gameId: 'g1', userId: 'u-1', questionId: 'q1', answer: 'B' });
      expect(result.showAnswer).toBe(true);
      expect(result.correctAnswer).toBe('B');
    });
  });

  describe('markPlayerDisconnected()', () => {
    it('marks every connected, incomplete session as connected:false', async () => {
      repo.getAll.mockResolvedValue({
        data: [{ id: 'gs1', connected: true, completed: false }, { id: 'gs2', connected: true, completed: false }],
        total: 2,
      });
      repo.update.mockResolvedValue({});
      await service.markPlayerDisconnected('u-1');
      expect(repo.update).toHaveBeenCalledTimes(2);
      expect(repo.update).toHaveBeenCalledWith('game_sessions', 'gs1', { connected: false });
      expect(repo.update).toHaveBeenCalledWith('game_sessions', 'gs2', { connected: false });
    });

    it('is a no-op when the player has no active sessions', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      await service.markPlayerDisconnected('u-1');
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
