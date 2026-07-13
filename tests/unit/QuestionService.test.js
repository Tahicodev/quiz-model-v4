import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestionService } from '../../src/frontend/services/QuestionService.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../src/shared/errors.js';
import { ROLES, QUESTION_TYPES, DIFFICULTY } from '../../src/shared/constants.js';

const ADMIN = { id: 'u-1', role: ROLES.ADMIN, school_id: 's-1' };
const STUDENT = { id: 'u-2', role: ROLES.STUDENT };

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

describe('QuestionService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new QuestionService(repo);
  });

  describe('create()', () => {
    it('throws ForbiddenError for non-admin', async () => {
      await expect(service.create({ type: 'mcq', text: 'Q?', answer: 'A' }, STUDENT))
        .rejects.toBeInstanceOf(ForbiddenError);
    });

    it('creates a question with valid data', async () => {
      repo.create.mockResolvedValue({ id: 'q-1', text: 'Q?', type: 'mcq' });
      const result = await service.create({ type: 'mcq', text: 'Q?', answer: 'A' }, ADMIN);
      expect(result.text).toBe('Q?');
      expect(repo.create).toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('throws if question does not exist', async () => {
      repo.getById.mockResolvedValue(null);
      await expect(service.delete('missing', ADMIN)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws if question is in an active exam', async () => {
      repo.getById.mockResolvedValue({ id: 'q-1', text: 'Q' });
      repo.getAll.mockResolvedValue({ data: [{ id: 'eq-1', exam_id: 'e-1', question_id: 'q-1' }], total: 1 });
      repo.getById.mockResolvedValueOnce({ id: 'q-1' }).mockResolvedValueOnce({ id: 'e-1', status: 'active' });
      await expect(service.delete('q-1', ADMIN)).rejects.toBeInstanceOf(ValidationError);
    });

    it('deletes a question not linked to any active exam', async () => {
      repo.getById.mockResolvedValue({ id: 'q-1', text: 'Q' });
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      await service.delete('q-1', ADMIN);
      expect(repo.delete).toHaveBeenCalledWith('questions', 'q-1');
    });
  });

  describe('getStats()', () => {
    it('returns breakdown by type and difficulty', async () => {
      repo.getAll.mockResolvedValue({
        data: [
          { id: 'q-1', type: 'mcq', difficulty: 'easy' },
          { id: 'q-2', type: 'mcq', difficulty: 'hard' },
          { id: 'q-3', type: 'true-false', difficulty: 'easy' },
        ],
        total: 3,
      });
      const stats = await service.getStats();
      expect(stats.total).toBe(3);
      expect(stats.byType.mcq).toBe(2);
      expect(stats.byDifficulty.easy).toBe(2);
      expect(stats.byDifficulty.hard).toBe(1);
    });
  });
});
