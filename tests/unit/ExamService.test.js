/**
 * tests/unit/ExamService.test.js
 *
 * Unit tests for ExamService with a mocked repository (spec §23 unit pattern),
 * grounded in the REAL signatures in src/frontend/services/ExamService.js:
 *   - constructor(repo)                       (no logger)
 *   - publish(examId, currentUser)            (not publish(id, userId, schoolId))
 *   - publish validates via exam_questions count, not a generic questions getAll
 *
 * Covers: not-found, wrong-status, no-questions, success, and the admin gate.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExamService } from '../../src/frontend/services/ExamService.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../src/shared/errors.js';
import { ROLES, EXAM_STATUS } from '../../src/shared/constants.js';

const ADMIN = { id: 'u-1', role: ROLES.ADMIN, school_id: 's-1' };

function makeRepo(overrides = {}) {
  return {
    getAll:     vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getById:    vi.fn().mockResolvedValue(null),
    create:     vi.fn(),
    update:     vi.fn(),
    delete:     vi.fn(),
    query:      vi.fn(),
    createMany: vi.fn(),
    ...overrides,
  };
}

describe('ExamService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new ExamService(repo);
  });

  describe('publish()', () => {
    it('throws NotFoundError when the exam does not exist', async () => {
      repo.getById.mockResolvedValue(null);
      await expect(service.publish('missing', ADMIN)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws ForbiddenError when the caller is not an admin', async () => {
      repo.getById.mockResolvedValue({ id: 'e1', school_id: 's-1', status: EXAM_STATUS.DRAFT });
      await expect(service.publish('e1', { id: 'u-2', role: ROLES.STUDENT, school_id: 's-1' }))
        .rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ValidationError when the exam is not in draft status', async () => {
      repo.getById.mockResolvedValue({ id: 'e1', school_id: 's-1', status: EXAM_STATUS.ACTIVE });
      await expect(service.publish('e1', ADMIN)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when the exam has no questions', async () => {
      repo.getById.mockResolvedValue({ id: 'e1', school_id: 's-1', status: EXAM_STATUS.DRAFT });
      repo.getAll.mockResolvedValue({ data: [], total: 0 }); // exam_questions count
      await expect(service.publish('e1', ADMIN)).rejects.toBeInstanceOf(ValidationError);
    });

    it('publishes (sets status=active) when the exam has at least one question', async () => {
      repo.getById.mockResolvedValue({ id: 'e1', school_id: 's-1', status: EXAM_STATUS.DRAFT });
      repo.getAll.mockResolvedValue({ data: [{ id: 'eq1' }], total: 1 });
      repo.update.mockResolvedValue({ id: 'e1', status: EXAM_STATUS.ACTIVE });

      const result = await service.publish('e1', ADMIN);
      expect(result.status).toBe(EXAM_STATUS.ACTIVE);
      expect(repo.update).toHaveBeenCalledWith('exams', 'e1', { status: EXAM_STATUS.ACTIVE });
    });
  });

  describe('delete()', () => {
    it('throws ValidationError when the exam already has results', async () => {
      repo.getById.mockResolvedValue({ id: 'e1', school_id: 's-1', status: EXAM_STATUS.DRAFT });
      // First getAll call → results count > 0
      repo.getAll.mockResolvedValue({ data: [{ id: 'r1' }], total: 1 });
      await expect(service.delete('e1', ADMIN)).rejects.toBeInstanceOf(ValidationError);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
