import { describe, expect, it, vi } from 'vitest';
import { SubjectService } from '../../src/frontend/services/SubjectService.js';
import { NotFoundError, ValidationError } from '../../src/shared/errors.js';
import { ROLES } from '../../src/shared/constants.js';

const teacher = { id: 'teacher-1', school_id: 'school-1', role: ROLES.TEACHER };
const admin = { id: 'admin-1', school_id: 'school-1', role: ROLES.ADMIN };

function makeRepo() {
  return {
    getAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getById: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'subject-1', name: 'Mathematics' }),
    update: vi.fn(),
    delete: vi.fn().mockResolvedValue({}),
  };
}

describe('SubjectService', () => {
  it('creates a subject owned by the teacher and school', async () => {
    const repo = makeRepo();
    const service = new SubjectService(repo);

    await service.create({ name: ' Mathematics ' }, teacher);

    expect(repo.create).toHaveBeenCalledWith('subjects', {
      name: 'Mathematics',
      school_id: teacher.school_id,
      created_by: teacher.id,
    });
  });

  it('rejects duplicate subject names case-insensitively for the same teacher', async () => {
    const repo = makeRepo();
    repo.getAll.mockResolvedValue({
      data: [{ id: 'subject-existing', name: 'Mathematics' }],
      total: 1,
    });
    const service = new SubjectService(repo);

    await expect(service.create({ name: 'mathematics' }, teacher))
      .rejects.toBeInstanceOf(ValidationError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('prevents a teacher from using another teacher’s subject', async () => {
    const repo = makeRepo();
    repo.getById.mockResolvedValue({
      id: 'subject-other',
      school_id: teacher.school_id,
      created_by: 'teacher-2',
      name: 'Science',
    });
    const service = new SubjectService(repo);

    await expect(service.assertCanUse('subject-other', teacher))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  describe('delete()', () => {
    const SUBJECT = 'subject-1';
    const OWNED = { id: SUBJECT, school_id: 'school-1', created_by: 'teacher-1', name: 'Mathematics' };

    function forestRepo() {
      const repo = makeRepo();
      repo.getById.mockResolvedValue(OWNED);
      repo.getAll.mockImplementation(async (table) => {
        if (table === 'categories') {
          return {
            data: [
              { id: 'cat-root', subject_id: SUBJECT, parent_id: null },
              // A legacy child without subject_id, reachable from the root.
              { id: 'cat-child', subject_id: null, parent_id: 'cat-root' },
              { id: 'cat-other', subject_id: 'subject-2', parent_id: null },
            ],
            total: 3,
          };
        }
        if (table === 'questions') {
          return {
            data: [
              { id: 'q-root', category_id: 'cat-root' },
              { id: 'q-child', category_id: 'cat-child' },
              { id: 'q-other', category_id: 'cat-other' },
            ],
            total: 3,
          };
        }
        if (table === 'courses') {
          return {
            data: [
              { id: 'course-branch', category_id: 'cat-root', subject_id: null },
              { id: 'course-subject', category_id: null, subject_id: SUBJECT },
              { id: 'course-unrelated', category_id: 'cat-other', subject_id: 'subject-2' },
            ],
            total: 3,
          };
        }
        return { data: [], total: 0 };
      });
      return repo;
    }

    it('removes the category forest, its courses and the subject row', async () => {
      const repo = forestRepo();
      const service = new SubjectService(repo);

      const outcome = await service.delete(SUBJECT, teacher);

      expect(outcome).toEqual({ categoriesRemoved: 2, coursesRemoved: 2 });
      const deletedCategories = repo.delete.mock.calls.filter((c) => c[0] === 'categories').map((c) => c[1]);
      expect(deletedCategories.sort()).toEqual(['cat-child', 'cat-root']);
      const deletedCourses = repo.delete.mock.calls.filter((c) => c[0] === 'courses').map((c) => c[1]);
      expect(deletedCourses.sort()).toEqual(['course-branch', 'course-subject']);
      expect(repo.delete).toHaveBeenCalledWith('subjects', SUBJECT);
      // Questions detach to Uncategorized, they are never deleted.
      expect(repo.update).toHaveBeenCalledWith('questions', 'q-root', { category_id: null });
      expect(repo.update).toHaveBeenCalledWith('questions', 'q-child', { category_id: null });
      expect(repo.update).not.toHaveBeenCalledWith('questions', 'q-other', { category_id: null });
      expect(repo.delete.mock.calls.filter((c) => c[0] === 'questions')).toHaveLength(0);
    });

    it('enforces teacher ownership on delete', async () => {
      const repo = forestRepo();
      repo.getById.mockResolvedValue({ ...OWNED, created_by: 'teacher-2' });
      const service = new SubjectService(repo);

      await expect(service.delete(SUBJECT, teacher)).rejects.toMatchObject({ statusCode: 403 });
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('rejects a subject from another school and non-managers', async () => {
      const repo = forestRepo();
      repo.getById.mockResolvedValue({ ...OWNED, school_id: 'school-2' });
      const service = new SubjectService(repo);
      await expect(service.delete(SUBJECT, teacher)).rejects.toBeInstanceOf(NotFoundError);

      const student = { id: 'stu-1', school_id: 'school-1', role: ROLES.STUDENT };
      const repo2 = forestRepo();
      await expect(new SubjectService(repo2).delete(SUBJECT, student)).rejects.toMatchObject({ statusCode: 403 });
      expect(repo2.delete).not.toHaveBeenCalled();
    });

    it('lets an admin delete any subject in their school', async () => {
      const repo = forestRepo();
      repo.getById.mockResolvedValue({ ...OWNED, created_by: 'teacher-2' });
      const service = new SubjectService(repo);

      const outcome = await service.delete(SUBJECT, admin);
      expect(outcome.coursesRemoved).toBe(2);
      expect(repo.delete).toHaveBeenCalledWith('subjects', SUBJECT);
    });
  });
});
