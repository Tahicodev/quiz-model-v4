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

  describe('update() class assignment sync', () => {
    const TEACHER = { id: 't-1', role: ROLES.TEACHER, school_id: 's-1' };
    const CLASS_A = '11111111-1111-4111-8111-111111111111';
    const CLASS_B = '22222222-2222-4222-8222-222222222222';

    function repoWithLinks(existingLinks = []) {
      return makeRepo({
        getById: vi.fn(async (table, id) => {
          if (table === 'exams' && id === 'e1') {
            return { id: 'e1', school_id: 's-1', status: EXAM_STATUS.ACTIVE };
          }
          if (table === 'classes' && [CLASS_A, CLASS_B].includes(id)) {
            return { id, school_id: 's-1', name: 'Class' };
          }
          return null;
        }),
        getAll: vi.fn(async (table, query) => {
          if (table === 'exam_classes') {
            return { data: existingLinks, total: existingLinks.length };
          }
          if (table === 'settings') {
            return {
              data: [
                { value: JSON.stringify({ 't-1': [CLASS_A] }) },
              ],
              total: 1,
            };
          }
          return { data: [], total: 0 };
        }),
        create: vi.fn(async (table, row) => ({ id: 'link-1', ...row })),
        update: vi.fn(async (table, id, patch) => ({ id, ...patch })),
        delete: vi.fn(async () => ({})),
      });
    }

    it('persists class links on update (admin)', async () => {
      repo = repoWithLinks([]);
      service = new ExamService(repo);
      await service.update('e1', { name: 'E', classes: [CLASS_A, CLASS_B] }, ADMIN);
      expect(repo.create).toHaveBeenCalledWith(
        'exam_classes',
        expect.objectContaining({ exam_id: 'e1', class_id: CLASS_A }),
      );
      expect(repo.create).toHaveBeenCalledWith(
        'exam_classes',
        expect.objectContaining({ exam_id: 'e1', class_id: CLASS_B }),
      );
    });

    it('removes links that are no longer assigned', async () => {
      const stale = { id: 'link-old', exam_id: 'e1', class_id: CLASS_B };
      repo = repoWithLinks([stale]);
      service = new ExamService(repo);
      await service.update('e1', { name: 'E', classes: [] }, ADMIN);
      expect(repo.delete).toHaveBeenCalledWith('exam_classes', 'link-old');
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('restricts teachers to their own classes', async () => {
      repo = repoWithLinks([]);
      service = new ExamService(repo);
      await service.update('e1', { name: 'E', classes: [CLASS_A, CLASS_B] }, TEACHER);
      expect(repo.create).toHaveBeenCalledWith(
        'exam_classes',
        expect.objectContaining({ exam_id: 'e1', class_id: CLASS_A }),
      );
      const createdClassIds = repo.create.mock.calls.map((c) => c[1]?.class_id);
      expect(createdClassIds).not.toContain(CLASS_B);
    });

    it('drops unknown class ids instead of hiding the exam', async () => {
      repo = repoWithLinks([]);
      service = new ExamService(repo);
      await service.update(
        'e1',
        { name: 'E', classes: ['33333333-3333-4333-8333-333333333333'] },
        ADMIN,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
  });
});
