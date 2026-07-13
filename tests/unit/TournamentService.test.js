import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TournamentService } from '../../src/frontend/services/TournamentService.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../src/shared/errors.js';
import { ROLES, TOURNAMENT_STATUS } from '../../src/shared/constants.js';

const ADMIN = { id: 'u-1', role: ROLES.ADMIN, school_id: 's-1' };

function makeRepo(overrides = {}) {
  return {
    getAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: vi.fn(),
    createMany: vi.fn(),
    ...overrides,
  };
}

function makeGameSvc(overrides = {}) {
  return { getScores: vi.fn().mockResolvedValue([]), ...overrides };
}

describe('TournamentService', () => {
  let service, repo, gameSvc;

  beforeEach(() => {
    repo = makeRepo();
    gameSvc = makeGameSvc();
    service = new TournamentService(repo, gameSvc);
  });

  describe('create()', () => {
    it('throws ForbiddenError for non-admin', async () => {
      await expect(service.create({ name: 'Tourney' }, { id: 'u-2', role: ROLES.STUDENT }))
        .rejects.toBeInstanceOf(ForbiddenError);
    });

    it('creates a draft tournament', async () => {
      repo.create.mockResolvedValue({ id: 't-1', name: 'Tourney', status: 'draft' });
      const result = await service.create({ name: 'Tourney', game_ids: [] }, ADMIN);
      expect(result.status).toBe('draft');
    });
  });

  describe('open()', () => {
    it('sets status to open', async () => {
      repo.getById.mockResolvedValue({ id: 't-1', status: TOURNAMENT_STATUS.DRAFT });
      repo.update.mockResolvedValue({ id: 't-1', status: TOURNAMENT_STATUS.OPEN });
      const result = await service.open('t-1', ADMIN);
      expect(result.status).toBe(TOURNAMENT_STATUS.OPEN);
    });

    it('throws if tournament is already active', async () => {
      repo.getById.mockResolvedValue({ id: 't-1', status: TOURNAMENT_STATUS.ACTIVE });
      await expect(service.open('t-1', ADMIN)).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('register()', () => {
    it('registers a user for an open tournament', async () => {
      repo.getById.mockResolvedValue({ id: 't-1', status: TOURNAMENT_STATUS.OPEN, school_id: 's-1' });
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      repo.create.mockResolvedValue({ id: 'e-1', user_id: 'u-3', tournament_id: 't-1' });
      const entry = await service.register('t-1', 'u-3');
      expect(repo.create).toHaveBeenCalled();
    });
  });

  describe('recordAnswer()', () => {
    it('scores a correct answer', async () => {
      repo.getById
        .mockResolvedValueOnce({ id: 't-1', status: TOURNAMENT_STATUS.ACTIVE })
        .mockResolvedValueOnce({ id: 'q-1', answer: 'Paris', points: 2 });
      repo.getAll.mockResolvedValue({ data: [{ id: 'e-1', score: 5, answers_json: '{}' }], total: 1 });
      repo.update.mockResolvedValue({});

      const result = await service.recordAnswer({ tournamentId: 't-1', userId: 'u-3', questionId: 'q-1', answer: 'Paris' });
      expect(result.correct).toBe(true);
      expect(result.points).toBe(2);
    });
  });

  describe('getLeaderboard()', () => {
    it('returns ranked entries', async () => {
      repo.query.mockResolvedValue([
        { id: 'e-1', score: 10, user: { name: 'Alice' } },
        { id: 'e-2', score: 5, user: { name: 'Bob' } },
      ]);
      const leaderboard = await service.getLeaderboard('t-1');
      expect(leaderboard).toHaveLength(2);
      expect(leaderboard[0].user.name).toBe('Alice');
    });
  });

  describe('finish()', () => {
    it('finalizes tournament and updates ranks', async () => {
      repo.getById.mockResolvedValue({ id: 't-1', status: TOURNAMENT_STATUS.ACTIVE });
      repo.query.mockResolvedValue([
        { id: 'e-1', score: 10 },
        { id: 'e-2', score: 5 },
      ]);
      await service.finish('t-1', ADMIN);
      expect(repo.update).toHaveBeenCalledWith('tournament_entries', 'e-1', expect.objectContaining({ rank: 1 }));
      expect(repo.update).toHaveBeenCalledWith('tournament_entries', 'e-2', expect.objectContaining({ rank: 2 }));
      expect(repo.update).toHaveBeenCalledWith('tournaments', 't-1', expect.objectContaining({ status: TOURNAMENT_STATUS.FINISHED }));
    });
  });

  describe('delete()', () => {
    it('throws when tournament not found', async () => {
      repo.getById.mockResolvedValue(null);
      await expect(service.delete('missing', ADMIN)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('deletes draft tournament', async () => {
      repo.getById.mockResolvedValue({ id: 't-1', status: TOURNAMENT_STATUS.DRAFT });
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      await service.delete('t-1', ADMIN);
      expect(repo.delete).toHaveBeenCalledWith('tournaments', 't-1');
    });
  });
});
