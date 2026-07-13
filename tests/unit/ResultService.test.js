import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResultService } from '../../src/frontend/services/ResultService.js';
import { NotFoundError } from '../../src/shared/errors.js';

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

describe('ResultService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new ResultService(repo);
  });

  describe('getById()', () => {
    it('throws NotFoundError when missing', async () => {
      repo.getById.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns the result when found', async () => {
      repo.getById.mockResolvedValue({ id: 'r-1', score: 85 });
      const r = await service.getById('r-1');
      expect(r.score).toBe(85);
    });
  });

  describe('getByExam()', () => {
    it('returns results for a given exam', async () => {
      repo.getAll.mockResolvedValue({ data: [{ id: 'r-1', exam_id: 'e-1', score: 75 }], total: 1 });
      const res = await service.getByExam('e-1', { limit: 10 });
      expect(res.data).toHaveLength(1);
      expect(repo.getAll).toHaveBeenCalledWith('results', expect.objectContaining({ filters: { exam_id: 'e-1' } }));
    });
  });

  describe('getStatsByExam()', () => {
    it('returns zero stats when no results', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      const stats = await service.getStatsByExam('e-1');
      expect(stats.total).toBe(0);
      expect(stats.avg).toBe(0);
    });

    it('calculates aggregate stats', async () => {
      repo.getAll.mockResolvedValue({
        data: [
          { score: 80, passed: true },
          { score: 60, passed: true },
          { score: 40, passed: false },
        ],
        total: 3,
      });
      const stats = await service.getStatsByExam('e-1');
      expect(stats.total).toBe(3);
      expect(stats.avg).toBe(60);
      expect(stats.passRate).toBeCloseTo(66.67, 0);
    });
  });

  describe('createFromSession()', () => {
    it('calculates score from session answers', async () => {
      const session = {
        exam_id: 'e-1',
        user_id: 'u-1',
        answers_json: JSON.stringify({ 'q-1': 'Paris', 'q-2': 'Mars' }),
        started_at: new Date().toISOString(),
      };
      const exam = {
        id: 'e-1',
        passing_score: 50,
        questions: [
          { id: 'q-1', answer: 'Paris', points: 1 },
          { id: 'q-2', answer: 'Venus', points: 2 },
        ],
      };
      repo.query.mockResolvedValue(exam);
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      repo.create.mockImplementation((table, data) => ({ id: 'r-new', ...data }));

      const result = await service.createFromSession(session);
      expect(result.score).toBe(33); // 1 out of 3 points
      expect(result.passed).toBe(false);
      expect(repo.create).toHaveBeenCalledWith('results', expect.objectContaining({ exam_id: 'e-1', user_id: 'u-1' }));
    });
  });
});
