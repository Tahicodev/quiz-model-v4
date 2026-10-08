import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KidsChampionshipService } from '../../src/backend/services/KidsChampionshipService.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../src/shared/errors.js';
import { ROLES } from '../../src/shared/constants.js';

const ADMIN = { id: 'u-admin', role: ROLES.ADMIN, school_id: 's-1' };
const TEACHER = { id: 'u-t', role: ROLES.TEACHER, school_id: 's-1' };
const OTHER_TEACHER = { id: 'u-t2', role: ROLES.TEACHER, school_id: 's-1' };
const STUDENT = { id: 'u-s', role: ROLES.STUDENT, school_id: 's-1' };

function makeChampionship(overrides = {}) {
  return {
    id: 'c-1',
    school_id: 's-1',
    creator_id: TEACHER.id,
    name: 'Lions Cup',
    emoji: '🦁',
    description: 'Play and win!',
    code: 'LION',
    status: 'active',
    game_ids: JSON.stringify(['g-1', 'g-2']),
    created_at: '2026-10-06T00:00:00.000Z',
    ...overrides,
  };
}

function makeRepo(overrides = {}) {
  return {
    getAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'c-new' }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

const PUBLISHED_GAMES = { data: [{ id: 'g-1', status: 'published' }, { id: 'g-2', status: 'published' }], total: 2 };

describe('KidsChampionshipService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new KidsChampionshipService(repo);
  });

  describe('create()', () => {
    it('validates published games and stores an active championship with a 4-char code', async () => {
      repo.getAll.mockImplementation(async (table, opts = {}) => {
        if (table === 'kidsGames') return PUBLISHED_GAMES;
        if (table === 'kidsChampionships' && opts.filters?.code) return { data: [], total: 0 };
        return { data: [], total: 0 };
      });
      repo.create.mockResolvedValue(makeChampionship({ id: 'c-2', creator_id: TEACHER.id }));

      const result = await service.create(TEACHER, {
        name: 'Lions Cup',
        emoji: '🦁',
        description: 'Play and win!',
        game_ids: ['g-1', 'g-2'],
      });

      expect(repo.create).toHaveBeenCalledWith('kidsChampionships', expect.objectContaining({
        school_id: 's-1',
        creator_id: TEACHER.id,
        status: 'active',
        name: 'Lions Cup',
        emoji: '🦁',
      }));
      const args = repo.create.mock.calls[0][1];
      expect(JSON.parse(args.game_ids)).toEqual(['g-1', 'g-2']);
      expect(args.code).toMatch(/^[A-Z2-9]{4}$/);
    });

    it('rejects an empty game list', async () => {
      await expect(service.create(TEACHER, { name: 'X', game_ids: [] }))
        .rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects games that are not published', async () => {
      repo.getAll.mockImplementation(async (table) => {
        // Real repo filters status=published — the draft g-9 must not appear.
        if (table === 'kidsGames') {
          return { data: [{ id: 'g-1', status: 'published' }], total: 1 };
        }
        return { data: [], total: 0 };
      });
      await expect(service.create(TEACHER, { name: 'X', game_ids: ['g-9'] }))
        .rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('update()', () => {
    it('lets the owning teacher rename + reopen (status active|finished)', async () => {
      repo.getById.mockResolvedValue(makeChampionship({ status: 'finished' }));
      await service.update('c-1', { status: 'active' }, TEACHER);
      expect(repo.update).toHaveBeenCalledWith('kidsChampionships', 'c-1', { status: 'active' });
    });

    it('forbids a teacher editing someone else\u2019s championship', async () => {
      repo.getById.mockResolvedValue(makeChampionship({ creator_id: TEACHER.id }));
      await expect(service.update('c-1', { status: 'active' }, OTHER_TEACHER))
        .rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects reverting to an unpublished game when updating challenges', async () => {
      repo.getById.mockResolvedValue(makeChampionship());
      repo.getAll.mockImplementation(async (table) => {
        if (table === 'kidsGames') return { data: [{ id: 'g-2', status: 'published' }], total: 1 };
        return { data: [], total: 0 };
      });
      await expect(service.update('c-1', { game_ids: ['g-1'] }, TEACHER))
        .rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('delete() + getManaged()', () => {
    it('deletes a championship the owning teacher manages', async () => {
      repo.getById.mockResolvedValue(makeChampionship());
      await service.delete('c-1', TEACHER);
      expect(repo.delete).toHaveBeenCalledWith('kidsChampionships', 'c-1');
    });

    it('forbids a student from managing', async () => {
      repo.getById.mockResolvedValue(makeChampionship());
      await expect(service.getManaged('c-1', STUDENT)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('returns managed details with parsed games + player stats', async () => {
      repo.getById.mockResolvedValue(makeChampionship());
      repo.getAll.mockImplementation(async (table) => {
        if (table === 'kidsChampionshipScores') {
          return {
            data: [
              { id: 's1', player_name: 'Zino', game_id: 'g-1', points: 80 },
              { id: 's2', player_name: 'Aya', game_id: 'g-2', points: 90 },
              { id: 's3', player_name: 'Aya', game_id: 'g-1', points: 70 },
            ],
            total: 3,
          };
        }
        return { data: [], total: 0 };
      });
      const managed = await service.getManaged('c-1', TEACHER);
      expect(managed.game_ids).toEqual(['g-1', 'g-2']);
      expect(managed.players).toBe(2);
      expect(managed.scores).toBe(3);
    });
  });

  describe('getPublicByCode()', () => {
    it('rejects a malformed code', async () => {
      await expect(service.getPublicByCode('ab12', ADMIN)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns lobby payload with challenges only for the chosen game ids', async () => {
      repo.getById.mockResolvedValue(makeChampionship());
      repo.getAll.mockImplementation(async (table, opts = {}) => {
        if (table === 'kidsChampionships') {
          return opts.filters?.code === 'LION'
            ? { data: [makeChampionship()], total: 1 }
            : { data: [], total: 0 };
        }
        if (table === 'kidsGames') {
          return {
            data: [
              { id: 'g-1', name: 'Star Collector', game_type: 'star-collector', pin: 'AAAA', status: 'published', questions_json: '[{},{}]' },
              { id: 'g-2', name: 'Bubble Pop', game_type: 'bubble-pop', pin: 'BBBB', status: 'published', questions_json: '[{}]' },
              { id: 'g-9', name: 'Other', game_type: 'leap-frog', pin: 'CCCC', status: 'published', questions_json: '[]' },
            ],
            total: 3,
          };
        }
        return { data: [], total: 0 };
      });

      const payload = await service.getPublicByCode('LION', 'Aya');
      expect(payload.championship.code).toBe('LION');
      expect(payload.challenges.map((c) => c.id)).toEqual(['g-1', 'g-2']);
      expect(payload.player.player_name).toBe('Aya');
      expect(payload.player.players).toBeGreaterThanOrEqual(0);
    });
  });

  describe('recordScore()', () => {
    const session = {
      id: 'ses-1',
      school_id: 's-1',
      game_id: 'g-1',
      player_name: 'Aya',
      avatar: '🐼',
    };

    it('never records for an unknown championship', async () => {
      repo.getById.mockResolvedValue(null);
      const result = await service.recordScore({ championshipId: 'nope', session, score: 8, stars: 2, totalPoints: 10 });
      expect(result.recorded).toBe(false);
      expect(result.reason).toBe('not_found');
    });

    it('never records against a finished championship', async () => {
      repo.getById.mockResolvedValue(makeChampionship({ status: 'finished' }));
      const result = await service.recordScore({ championshipId: 'c-1', session, score: 8, stars: 2, totalPoints: 10 });
      expect(result.recorded).toBe(false);
      expect(result.reason).toBe('not_active');
    });

    it('ignores games outside the challenge list', async () => {
      repo.getById.mockResolvedValue(makeChampionship());
      const result = await service.recordScore({
        championshipId: 'c-1',
        session: { ...session, game_id: 'g-9' },
        score: 8, stars: 2, totalPoints: 10,
      });
      expect(result.recorded).toBe(false);
      expect(result.reason).toBe('not_a_challenge');
    });

    it('records the first run at score-percent points (100 max)', async () => {
      repo.getById.mockResolvedValue(makeChampionship());
      repo.getAll.mockImplementation(async (table, opts = {}) => {
        if (table === 'kidsGameSessions') return { data: [], total: 0 };
        if (table === 'kidsGames') return PUBLISHED_GAMES;
        return { data: [], total: 0 };
      });
      repo.create.mockResolvedValue({ id: 'new-row' });

      const result = await service.recordScore({ championshipId: 'c-1', session, score: 7, stars: 2, totalPoints: 10 });
      expect(result.recorded).toBe(true);
      expect(result.improved).toBe(true);
      expect(result.points).toBe(70);
      expect(repo.create).toHaveBeenCalledWith('kidsChampionshipScores', expect.objectContaining({
        championship_id: 'c-1',
        school_id: 's-1',
        player_name: 'Aya',
        game_id: 'g-1',
        points: 70,
      }));
    });

    it('keeps the best run and reports improved only when it beats it', async () => {
      repo.getById.mockResolvedValue(makeChampionship());
      repo.getAll.mockImplementation(async (table, opts = {}) => {
        if (table === 'kidsChampionshipScores') {
          if (opts.filters?.player_name === 'Aya') {
            return {
              data: [{ id: 'row-1', player_name: 'Aya', game_id: 'g-1', points: 90, score: 9, stars: 3 }],
              total: 1,
            };
          }
          return { data: [], total: 0 };
        }
        if (table === 'kidsGames') return PUBLISHED_GAMES;
        return { data: [], total: 0 };
      });

      const worse = await service.recordScore({ championshipId: 'c-1', session, score: 6, stars: 1, totalPoints: 10 });
      expect(worse.improved).toBe(false);
      expect(repo.update).not.toHaveBeenCalled();

      const better = await service.recordScore({ championshipId: 'c-1', session, score: 10, stars: 3, totalPoints: 10 });
      expect(better.improved).toBe(true);
      expect(repo.update).toHaveBeenCalledWith('kidsChampionshipScores', 'row-1', expect.objectContaining({
        points: 100, score: 10, stars: 3,
      }));
    });
  });

  describe('getLeaderboard()', () => {
    it('ranks by points desc, then stars, then games played, then name', async () => {
      repo.getById.mockResolvedValue(makeChampionship());
      repo.getAll.mockResolvedValue({
        data: [
          { player_name: 'Zed', game_id: 'g-1', points: 90, stars: 3, avatar: '🦊', played_at: '2026-10-06T01:00:00Z' },
          { player_name: 'Bob', game_id: 'g-1', points: 90, stars: 3, avatar: '🐸', played_at: '2026-10-06T00:30:00Z' },
          { player_name: 'Alice', game_id: 'g-2', points: 100, stars: 3, avatar: '🐼', played_at: '2026-10-06T00:00:00Z' },
          { player_name: 'Ana', game_id: 'g-2', points: 90, stars: 2, avatar: '🦁', played_at: '2026-10-06T00:00:00Z' },
        ],
        total: 4,
      });

      const board = await service.getLeaderboard('c-1', { limit: 50 });
      expect(board.map((e) => e.player_name)).toEqual(['Alice', 'Bob', 'Zed', 'Ana']);
      expect(board.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
      expect(board[0].games_played).toBe(1);
    });
  });
});