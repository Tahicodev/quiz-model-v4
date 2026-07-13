/**
 * tests/unit/AuthService.test.js
 *
 * Unit tests for AuthService (backend) with a mocked repository, grounded in the
 * direct imports and real signatures in src/backend/services/AuthService.js:
 *   - constructor(repo)
 *   - login(username, password, { ip, userAgent }) — bcrypt compare, JWT sign
 *   - refresh(rawRefreshToken) — hash lookup, rotation, new token
 *   - logout(rawRefreshToken) — revoke token
 *
 * The mock repo simulates user lookup and refresh-token storage. We generate
 * a real bcrypt hash in beforeAll so the compare path is exercised authentically.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { AuthService } from '../../src/backend/services/AuthService.js';
import { UnauthorizedError, ValidationError } from '../../src/shared/errors.js';

// A real bcrypt hash so the compare path reflects production timing complexity.
let PASSWORD_HASH;

beforeAll(async () => {
  PASSWORD_HASH = await bcrypt.hash('correct-password', 4); // low rounds for test speed
  if (PASSWORD_HASH.startsWith('$2b$')) PASSWORD_HASH = '$2a$' + PASSWORD_HASH.slice(4);
});

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

function makeUser(overrides = {}) {
  return {
    id: 'u-1', username: 'teacher', role: 'admin', school_id: 's-1',
    status: 'active', name: 'Teacher',
    password_hash: PASSWORD_HASH,
    created_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AuthService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new AuthService(repo);
  });

  describe('login()', () => {
    it('returns user + tokens on valid credentials', async () => {
      const user = makeUser();
      repo.getAll.mockResolvedValue({ data: [user], total: 1 });
      repo.update.mockImplementation(async (_, id, data) => ({ ...user, ...data }));

      const result = await service.login('teacher', 'correct-password', { ip: '127.0.0.1' });
      expect(result.user).toBeDefined();
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      // Sensitive fields stripped
      expect(result.user.password_hash).toBeUndefined();
      // last_login updated
      expect(repo.update).toHaveBeenCalledWith('users', 'u-1', expect.objectContaining({ last_login: expect.any(String) }));
    });

    it('throws UnauthorizedError for unknown username', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      await expect(service.login('nobody', 'pw')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('throws UnauthorizedError on wrong password (timing-safe)', async () => {
      repo.getAll.mockResolvedValue({ data: [makeUser()], total: 1 });
      await expect(service.login('teacher', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('throws ForbiddenError when the user account is inactive', async () => {
      const { ForbiddenError } = await import('../../src/shared/errors.js');
      repo.getAll.mockResolvedValue({ data: [makeUser({ status: 'inactive' })], total: 1 });
      await expect(service.login('teacher', 'correct-password')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ValidationError on invalid input (empty fields)', async () => {
      await expect(service.login('', '')).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('refresh()', () => {
    it('throws UnauthorizedError when token does not exist', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      await expect(service.refresh('invalid-token')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('throws UnauthorizedError when the stored token is revoked', async () => {
      repo.getAll.mockResolvedValue({
        data: [{ id: 'rt-1', user_id: 'u-1', revoked: true, expires_at: '2099-01-01' }],
        total: 1,
      });
      await expect(service.refresh('some-token')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('throws UnauthorizedError when the stored token is expired', async () => {
      repo.getAll.mockResolvedValue({
        data: [{ id: 'rt-1', user_id: 'u-1', revoked: false, expires_at: '2020-01-01' }],
        total: 1,
      });
      await expect(service.refresh('stale-token')).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('returns a new access token + rotated refresh token for a valid, unexpired token', async () => {
      const user = makeUser();
      repo.getAll.mockResolvedValueOnce({
        data: [{ id: 'rt-1', user_id: 'u-1', revoked: false, expires_at: '2099-01-01' }],
        total: 1,
      });
      repo.getById.mockResolvedValue(user);
      repo.update.mockResolvedValue({});
      repo.create.mockImplementation(async (_, data) => ({ id: 'rt-2', ...data }));

      const result = await service.refresh('good-token');
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String)); // rotated
      // The consumed token is revoked:
      expect(repo.update).toHaveBeenCalledWith('refresh_tokens', 'rt-1', { revoked: true });
    });
  });

  describe('logout()', () => {
    it('silently succeeds when no token is passed (no-op)', async () => {
      await expect(service.logout()).resolves.toBeUndefined();
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('revokes the matching refresh token', async () => {
      repo.getAll.mockResolvedValue({ data: [{ id: 'rt-1' }], total: 1 });
      await service.logout('some-token');
      expect(repo.update).toHaveBeenCalledWith('refresh_tokens', 'rt-1', { revoked: true });
    });
  });
});
