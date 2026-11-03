import { describe, expect, it, vi } from 'vitest';
import { SubjectService } from '../../src/frontend/services/SubjectService.js';
import { ValidationError } from '../../src/shared/errors.js';
import { ROLES } from '../../src/shared/constants.js';

const teacher = { id: 'teacher-1', school_id: 'school-1', role: ROLES.TEACHER };

function makeRepo() {
  return {
    getAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getById: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'subject-1', name: 'Mathematics' }),
    update: vi.fn(),
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
});
