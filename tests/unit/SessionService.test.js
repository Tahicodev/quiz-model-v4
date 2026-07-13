import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionService } from '../../src/frontend/services/SessionService.js';
import { NotFoundError, ValidationError } from '../../src/shared/errors.js';
import { SESSION_STATUS } from '../../src/shared/constants.js';

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

function makeResultSvc(overrides = {}) {
  return { createFromSession: vi.fn().mockResolvedValue({ id: 'r-1', score: 85 }), ...overrides };
}

describe('SessionService', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new SessionService(repo);
  });

  describe('createSession()', () => {
    it('creates a session even without validating exam existence (validation in route)', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      repo.create.mockImplementation((table, data) => ({ id: 'sess-1', ...data }));
      const session = await service.createSession({ examId: 'any-id', userId: 'u-1', durationMinutes: 60 });
      expect(session.status).toBe(SESSION_STATUS.ACTIVE);
      expect(repo.create).toHaveBeenCalled();
    });

    it('returns existing session if already active (idempotent)', async () => {
      repo.getAll.mockResolvedValue({ data: [{ id: 'sess-1', status: SESSION_STATUS.ACTIVE }], total: 1 });
      const session = await service.createSession({ examId: 'e-1', userId: 'u-1' });
      expect(session.id).toBe('sess-1');
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('saveAnswer()', () => {
    it('appends answer to active session', async () => {
      repo.getById.mockResolvedValue({ id: 'sess-1', status: SESSION_STATUS.ACTIVE, answers_json: '{}', expires_at: new Date(Date.now() + 3600000).toISOString() });
      repo.update.mockImplementation((t, id, d) => ({ id, ...d }));
      await service.saveAnswer({ sessionId: 'sess-1', questionId: 'q-1', answer: 'Paris' });
      expect(repo.update).toHaveBeenCalledWith(
        'exam_sessions', 'sess-1',
        expect.objectContaining({ answers_json: expect.stringContaining('q-1') })
      );
    });

    it('throws for completed session', async () => {
      repo.getById.mockResolvedValue({ id: 'sess-1', status: SESSION_STATUS.COMPLETED });
      await expect(service.saveAnswer({ sessionId: 'sess-1', questionId: 'q-1', answer: 'A' })).rejects.toBeInstanceOf(Error);
    });
  });

  describe('completeSession()', () => {
    it('marks session as completed via resultService', async () => {
      const resultSvc = makeResultSvc();
      repo.getById.mockResolvedValue({ id: 'sess-1', status: SESSION_STATUS.ACTIVE, answers_json: '{}', started_at: new Date().toISOString() });
      const result = await service.completeSession('sess-1', resultSvc);
      expect(result.score).toBe(85);
      expect(repo.update).toHaveBeenCalledWith('exam_sessions', 'sess-1', expect.objectContaining({ status: SESSION_STATUS.COMPLETED }));
    });
  });

  describe('getActiveSession()', () => {
    it('returns active session for user+exam', async () => {
      repo.getAll.mockResolvedValue({ data: [{ id: 'sess-1', status: SESSION_STATUS.ACTIVE }], total: 1 });
      const sess = await service.getActiveSession('e-1', 'u-1');
      expect(sess.id).toBe('sess-1');
    });

    it('returns null when no active session', async () => {
      repo.getAll.mockResolvedValue({ data: [], total: 0 });
      const sess = await service.getActiveSession('e-1', 'u-1');
      expect(sess).toBeNull();
    });
  });

  describe('cleanupExpiredSessions()', () => {
    it('marks expired sessions', async () => {
      repo.query.mockResolvedValue([{ id: 'sess-1' }, { id: 'sess-2' }]);
      const count = await service.cleanupExpiredSessions();
      expect(count).toBe(2);
      expect(repo.update).toHaveBeenCalledTimes(2);
    });
  });
});
