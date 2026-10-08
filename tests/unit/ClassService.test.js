import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClassService } from '../../src/frontend/services/ClassService.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../../src/shared/errors.js';
import { ROLES } from '../../src/shared/constants.js';

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

describe('ClassService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new ClassService(repo);
  });

  describe('create()', () => {
    it('throws ForbiddenError for non-admin', async () => {
      await expect(service.create({ name: 'Class A' }, { id: 'u-2', role: ROLES.STUDENT }))
        .rejects.toBeInstanceOf(ForbiddenError);
    });

    it('allows teachers to create classes (stamps their school)', async () => {
      repo.create.mockResolvedValue({ id: 'c-2', name: 'Class B', school_id: 's-1' });
      const result = await service.create(
        { name: 'Class B' },
        { id: 'u-9', role: ROLES.TEACHER, school_id: 's-1' },
      );
      expect(result.name).toBe('Class B');
      expect(repo.create).toHaveBeenCalledWith('classes', expect.objectContaining({
        name: 'Class B',
        school_id: 's-1',
      }));
    });

    it('creates a class successfully', async () => {
      repo.create.mockResolvedValue({ id: 'c-1', name: 'Class A' });
      const result = await service.create({ name: 'Class A' }, ADMIN);
      expect(result.name).toBe('Class A');
    });
  });

  describe('delete()', () => {
    it('throws if class has students', async () => {
      repo.getById.mockResolvedValue({ id: 'c-1', name: 'Class A' });
      repo.getAll.mockResolvedValue({ data: [], total: 3 }); // users.count
      await expect(service.delete('c-1', ADMIN)).rejects.toBeInstanceOf(ValidationError);
    });

    it('deletes empty class', async () => {
      repo.getById.mockResolvedValue({ id: 'c-1', name: 'Empty' });
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      await service.delete('c-1', ADMIN);
      expect(repo.delete).toHaveBeenCalledWith('classes', 'c-1');
    });
  });

  describe('getStudents()', () => {
    it('returns stripped students list', async () => {
      repo.getAll.mockResolvedValue({
        data: [
          { id: 'u-1', name: 'Alice', password: 'secret', password_hash: 'hash' },
          { id: 'u-2', name: 'Bob', password: 'secret' },
        ],
        total: 2,
      });
      const students = await service.getStudents('c-1');
      expect(students).toHaveLength(2);
      expect(students[0].password).toBeUndefined();
      expect(students[0].password_hash).toBeUndefined();
    });
  });
});
