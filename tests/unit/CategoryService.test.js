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

    it('surfaces cycle-trapped rows instead of dropping them', async () => {
      repo.getAll.mockResolvedValue({
        data: [
          { id: 'r', name: 'Root', parent_id: null },
          { id: 'a', name: 'A', parent_id: 'b' },
          { id: 'b', name: 'B', parent_id: 'a' },
        ],
        total: 3,
      });
      const tree = await service.getTree();
      const ids = tree.map((c) => c.id).sort();
      expect(ids).toEqual(['a', 'b', 'r']);
    });
  });

  describe('update() — hierarchy guards', () => {
    const MATH = '11111111-1111-4111-8111-111111111111';
    const ADDITION = '22222222-2222-4222-8222-222222222222';
    const SCIENCE = '33333333-3333-4333-8333-333333333333';

    it('rejects moving a category inside one of its own subcategories', async () => {
      // Math -> Addition; moving Math under Addition would cycle.
      repo.getById.mockImplementation(async (table, id) => {
        if (table !== 'categories') return null;
        if (id === MATH) return { id: MATH, name: 'Math', parent_id: null };
        if (id === ADDITION) return { id: ADDITION, name: 'Addition', parent_id: MATH };
        return null;
      });
      await expect(service.update(MATH, { parent_id: ADDITION }, ADMIN))
        .rejects.toBeInstanceOf(ValidationError);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('allows moving a category under an unrelated parent', async () => {
      repo.getById.mockImplementation(async (table, id) => {
        if (table !== 'categories') return null;
        if (id === MATH) return { id: MATH, name: 'Math', parent_id: null };
        if (id === SCIENCE) return { id: SCIENCE, name: 'Science', parent_id: null };
        return null;
      });
      repo.update.mockResolvedValue({ id: MATH, parent_id: SCIENCE });
      await service.update(MATH, { parent_id: SCIENCE }, ADMIN);
      expect(repo.update).toHaveBeenCalledWith('categories', MATH, { parent_id: SCIENCE });
    });

    it('allows clearing the parent (top-level)', async () => {
      repo.getById.mockResolvedValue({ id: ADDITION, name: 'Addition', parent_id: MATH });
      repo.update.mockResolvedValue({ id: ADDITION, parent_id: null });
      await service.update(ADDITION, { parent_id: null }, ADMIN);
      expect(repo.update).toHaveBeenCalledWith('categories', ADDITION, { parent_id: null });
    });
  });

  describe('delete()', () => {    it('throws if category has children', async () => {
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
