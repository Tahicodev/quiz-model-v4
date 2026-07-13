import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CategoryService } from '../../src/frontend/services/CategoryService.js';
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

describe('CategoryService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new CategoryService(repo);
  });

  describe('create()', () => {
    it('throws ForbiddenError for non-admin', async () => {
      await expect(service.create({ name: 'Math' }, { id: 'u-2', role: ROLES.STUDENT }))
        .rejects.toBeInstanceOf(ForbiddenError);
    });

    it('creates a root category', async () => {
      repo.create.mockResolvedValue({ id: 'c-1', name: 'Math' });
      const result = await service.create({ name: 'Math' }, ADMIN);
      expect(result.name).toBe('Math');
    });

    it('throws when parent does not exist', async () => {
      repo.getById.mockResolvedValue(null);
      await expect(service.create({ name: 'Child', parent_id: 'missing' }, ADMIN))
        .rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('getTree()', () => {
    it('builds a tree from flat list', async () => {
      repo.getAll.mockResolvedValue({
        data: [
          { id: 'r', name: 'Root', parent_id: null },
          { id: 'c', name: 'Child', parent_id: 'r' },
        ],
        total: 2,
      });
      const tree = await service.getTree();
      expect(tree).toHaveLength(1);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].name).toBe('Child');
    });

    it('handles empty list', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      const tree = await service.getTree();
      expect(tree).toHaveLength(0);
    });
  });

  describe('delete()', () => {
    it('throws if category has children', async () => {
      repo.getById.mockResolvedValue({ id: 'c-1', name: 'Parent' });
      repo.getAll.mockResolvedValue({ data: [{ id: 'c-2', parent_id: 'c-1' }], total: 1 });
      await expect(service.delete('c-1', ADMIN)).rejects.toBeInstanceOf(ValidationError);
    });

    it('deletes empty leaf category', async () => {
      repo.getById.mockResolvedValue({ id: 'c-1', name: 'Leaf' });
      repo.getAll
        .mockResolvedValueOnce({ data: [], total: 0 })  // children count
        .mockResolvedValueOnce({ data: [], total: 0 });  // questions count
      await service.delete('c-1', ADMIN);
      expect(repo.delete).toHaveBeenCalledWith('categories', 'c-1');
    });
  });
});
