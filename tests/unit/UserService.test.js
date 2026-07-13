import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from '../../src/frontend/services/UserService.js';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../../src/shared/errors.js';
import { ROLES } from '../../src/shared/constants.js';

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

describe('UserService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new UserService(repo);
  });

  describe('create()', () => {
    it('throws ForbiddenError when caller is not admin', async () => {
      await expect(service.create({ username: 'test', password: '123456', name: 'Test' }, STUDENT))
        .rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ConflictError when username is taken', async () => {
      repo.getAll.mockResolvedValue({ data: [{ id: 'existing' }], total: 1 });
      await expect(service.create({ username: 'dupe', password: '123456', name: 'Test' }, ADMIN))
        .rejects.toBeInstanceOf(ConflictError);
    });

    it('creates a user successfully', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      repo.create.mockResolvedValue({ id: 'u-new', username: 'newuser', name: 'New', role: 'student' });
      const result = await service.create({ username: 'newuser', password: '123456', name: 'New' }, ADMIN);
      expect(result.username).toBe('newuser');
      expect(repo.create).toHaveBeenCalled();
    });
  });

  describe('delete()', () => {
    it('throws when deleting own account', async () => {
      await expect(service.delete(ADMIN.id, ADMIN)).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws NotFoundError when user does not exist', async () => {
      repo.getById.mockResolvedValue(null);
      await expect(service.delete('missing', ADMIN)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws when deleting the only admin', async () => {
      repo.getById.mockResolvedValue({ id: 'other-admin', role: ROLES.ADMIN });
      repo.getAll.mockResolvedValue({ data: [{ id: 'other-admin', role: ROLES.ADMIN }], total: 1 });
      await expect(service.delete('other-admin', ADMIN)).rejects.toBeInstanceOf(ValidationError);
    });

    it('deletes a user successfully', async () => {
      repo.getById.mockResolvedValue({ id: 'u-3', role: ROLES.STUDENT });
      await expect(service.delete('u-3', ADMIN)).resolves.not.toThrow();
      expect(repo.delete).toHaveBeenCalledWith('users', 'u-3');
    });
  });

  describe('resetPassword()', () => {
    it('rejects short passwords', async () => {
      repo.getById.mockResolvedValue({ id: 'u-3' });
      await expect(service.resetPassword('u-3', 'abc', ADMIN)).rejects.toBeInstanceOf(ValidationError);
    });

    it('updates password for valid requests', async () => {
      repo.getById.mockResolvedValue({ id: 'u-3' });
      await service.resetPassword('u-3', 'newpass123', ADMIN);
      expect(repo.update).toHaveBeenCalledWith('users', 'u-3', expect.objectContaining({ password: 'newpass123' }));
    });
  });
});
