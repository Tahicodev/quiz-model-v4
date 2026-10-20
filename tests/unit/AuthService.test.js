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

  describe('single active session', () => {
    const liveToken = (overrides = {}) => ({
      id: 'rt-live',
      user_id: 'u-1',
      revoked: false,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      // Minted inside the current process run — tokens from before the
      // process booted (BOOT_EPOCH in AuthService) are never live, so a
      // backdated row here would (correctly) not block the login.
      created_at: new Date().toISOString(),
      ...overrides,
    });

    // users lookup -> user row; refresh_tokens lookup -> configured rows.
    function mockLoginStores(user, tokens) {
      repo.getAll.mockImplementation(async (table) => {
        if (table === 'users') return { data: [user], total: 1 };
        if (table === 'refresh_tokens') return { data: tokens, total: tokens.length };
        return { data: [], total: 0 };
      });
      repo.update.mockImplementation(async () => ({}));
      repo.create.mockImplementation(async (_, data) => ({ id: 'rt-new', ...data }));
    }

    it('blocks a second login while a live session exists (409 SESSION_ACTIVE)', async () => {
      const { SessionConflictError } = await import('../../src/shared/errors.js');
      mockLoginStores(makeUser(), [liveToken()]);
      const err = await service
        .login('teacher', 'correct-password', { ip: '127.0.0.1' })
        .catch((e) => e);
      expect(err).toBeInstanceOf(SessionConflictError);
      expect(err.code).toBe('SESSION_ACTIVE');
      expect(err.statusCode).toBe(409);
      // Mint-then-arbitrate: the blocked attempt minted once, then rolled
      // its own mint back so no live row piles up to block later logins.
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.update).toHaveBeenCalledWith('refresh_tokens', 'rt-new', {
        revoked: true,
      });
    });

    it('concurrent double logins converge to a single live session', async () => {
      const store = [];
      let seq = 0;
      repo.getAll.mockImplementation(async (table, opts) => {
        if (table === 'users') return { data: [makeUser()], total: 1 };
        if (table === 'refresh_tokens') {
          const f = opts?.filters || {};
          const rows = store.filter(
            (t) =>
              (!f.user_id || t.user_id === f.user_id) &&
              (f.revoked === undefined || t.revoked === f.revoked),
          );
          return { data: rows, total: rows.length };
        }
        return { data: [], total: 0 };
      });
      repo.create.mockImplementation(async (_, data) => {
        seq += 1;
        const row = {
          id: `rt-${seq}`,
          created_at: new Date().toISOString(),
          ...data,
        };
        store.push(row);
        return row;
      });
      repo.update.mockImplementation(async (_, id, patch) => {
        const row = store.find((t) => t.id === id);
        if (row) Object.assign(row, patch);
        return row;
      });

      const attempts = await Promise.allSettled([
        service.login('teacher', 'correct-password', { ip: '127.0.0.1' }),
        service.login('teacher', 'correct-password', { ip: '127.0.0.1' }),
      ]);
      const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
      // At most one winner; never two live sessions.
      expect(fulfilled.length).toBeLessThanOrEqual(1);
      const live = store.filter((t) => !t.revoked);
      expect(live.length).toBeLessThanOrEqual(1);
      // And a follow-up login still works (nothing stuck).
      const retry = await service.login('teacher', 'correct-password', {
        ip: '127.0.0.1',
        force: true,
      });
      expect(typeof retry.accessToken).toBe('string');
      expect(store.filter((t) => !t.revoked)).toHaveLength(1);
    });

    it('force login takes over and revokes the previous session', async () => {
      mockLoginStores(makeUser(), [liveToken({ id: 'rt-old' })]);
      const result = await service.login('teacher', 'correct-password', {
        ip: '127.0.0.1',
        force: true,
      });
      expect(typeof result.accessToken).toBe('string');
      expect(repo.update).toHaveBeenCalledWith('refresh_tokens', 'rt-old', {
        revoked: true,
      });
    });

    it('allows login when the previous token expired', async () => {
      mockLoginStores(makeUser(), [
        liveToken({ expires_at: new Date(Date.now() - 1000).toISOString() }),
      ]);
      const result = await service.login('teacher', 'correct-password', {
        ip: '127.0.0.1',
      });
      expect(typeof result.accessToken).toBe('string');
    });

    it('allows login when the previous token aged out (closed tab)', async () => {
      mockLoginStores(makeUser(), [
        liveToken({ created_at: new Date(Date.now() - 60 * 60_000).toISOString() }),
      ]);
      const result = await service.login('teacher', 'correct-password', {
        ip: '127.0.0.1',
      });
      expect(typeof result.accessToken).toBe('string');
    });

    it('stamps the access token with the session id', async () => {
      const jwt = (await import('jsonwebtoken')).default;
      const { config } = await import('../../src/backend/config.js');
      mockLoginStores(makeUser(), []);
      const result = await service.login('teacher', 'correct-password', {
        ip: '127.0.0.1',
      });
      const payload = jwt.verify(result.accessToken, config.jwtSecret);
      expect(payload.sid).toBe('rt-new');
    });

    it('refresh carries the new sid and converges coexisting sessions', async () => {
      const jwt = (await import('jsonwebtoken')).default;
      const { config } = await import('../../src/backend/config.js');
      const user = makeUser();
      repo.getAll.mockImplementation(async (table) => {
        if (table === 'refresh_tokens') {
          return {
            data: [
              { id: 'rt-1', user_id: 'u-1', revoked: false, expires_at: '2099-01-01' },
              { id: 'rt-stale-sibling', user_id: 'u-1', revoked: false, expires_at: '2099-01-01' },
            ],
            total: 2,
          };
        }
        return { data: [], total: 0 };
      });
      repo.getById.mockResolvedValue(user);
      repo.update.mockResolvedValue({});
      repo.create.mockImplementation(async (_, data) => ({ id: 'rt-2', ...data }));
      const result = await service.refresh('good-token');
      const payload = jwt.verify(result.accessToken, config.jwtSecret);
      expect(payload.sid).toBe('rt-2');
      expect(repo.update).toHaveBeenCalledWith('refresh_tokens', 'rt-stale-sibling', {
        revoked: true,
      });
    });

    it('sessionStatus reports active / superseded / revoked', async () => {      const now = Date.now();
      const fresh = (id, ageMin) => ({
        id,
        user_id: 'u-1',
        revoked: false,
        expires_at: new Date(now + 3600_000).toISOString(),
        created_at: new Date(now - ageMin * 60_000).toISOString(),
      });
      // Newest token is someone else's -> superseded.
      repo.getAll.mockResolvedValue({
        data: [fresh('rt-newer', 1), fresh('rt-mine', 5)],
        total: 2,
      });
      await expect(service.sessionStatus('u-1', 'rt-mine')).resolves.toEqual({
        active: false,
        reason: 'superseded',
      });
      // Mine is newest -> active.
      repo.getAll.mockResolvedValue({ data: [fresh('rt-mine', 1)], total: 1 });
      await expect(service.sessionStatus('u-1', 'rt-mine')).resolves.toEqual({
        active: true,
      });
      // Mine gone -> revoked.
      repo.getAll.mockResolvedValue({ data: [fresh('rt-newer', 1)], total: 1 });
      await expect(service.sessionStatus('u-1', 'rt-mine')).resolves.toEqual({
        active: false,
        reason: 'revoked',
      });
      // Legacy token without sid -> fail-open active.
      await expect(service.sessionStatus('u-1', null)).resolves.toEqual({
        active: true,
        current: false,
      });
    });
  });

  describe('admin session inspection', () => {
    it('listSessions exposes metadata but never token hashes', async () => {
      repo.getAll.mockResolvedValue({
        data: [
          {
            id: 'rt-1',
            user_id: 'u-1',
            token_hash: 'secret-hash',
            revoked: false,
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
            created_at: new Date().toISOString(),
            user_agent: 'Chrome',
            ip_address: '1.2.3.4',
          },
          {
            id: 'rt-0',
            user_id: 'u-1',
            token_hash: 'old-hash',
            revoked: true,
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
            created_at: new Date(Date.now() - 3600_000).toISOString(),
          },
        ],
        total: 2,
      });
      const rows = await service.listSessions('u-1');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        id: 'rt-1',
        created_at: expect.any(String),
        expires_at: expect.any(String),
        revoked: false,
        live: true,
        user_agent: 'Chrome',
        ip_address: '1.2.3.4',
      });
      expect(rows[0]).not.toHaveProperty('token_hash');
      expect(rows[1].live).toBe(false);
    });

    it('revokeUserSessions revokes everything and returns the count', async () => {
      repo.getAll.mockResolvedValue({
        data: [{ id: 'rt-1' }, { id: 'rt-2' }],
        total: 2,
      });
      await expect(service.revokeUserSessions('u-1')).resolves.toEqual({
        revoked: 2,
      });
      expect(repo.update).toHaveBeenCalledWith('refresh_tokens', 'rt-1', {
        revoked: true,
      });
      expect(repo.update).toHaveBeenCalledWith('refresh_tokens', 'rt-2', {
        revoked: true,
      });
    });
  });
});
