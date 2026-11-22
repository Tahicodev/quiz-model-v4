/**
 * tests/unit/ResultService.session-mode.contract.test.js
 *
 * CONTRACT TEST — do not "fix" a failure here by relaxing the assertion.
 *
 * `ResultService.createFromSession` writes `mode: RESULT_MODE.EXAM` for EVERY
 * completed session, including a session started from a training exam. This is
 * a deliberate, documented behaviour that the adaptive-learning classification
 * rules in `docs/ADAPTIVE_LEARNING_ARCHITECTURE.md` §E.2.1 (rule 4/rule 5) work
 * around: `Result.mode` alone must NEVER be trusted to distinguish a formal exam
 * from a training exam.
 *
 * If this test fails, the write at `src/frontend/services/ResultService.js:56`
 * changed. Before changing the assertion, revisit §E.2.1 classification, the
 * `Exam.is_training` join, and decision D13 in `docs/PHASE0_DECISION_REGISTER.md`,
 * because the trust model for summative evidence assumes this behaviour.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResultService } from '../../src/frontend/services/ResultService.js';
import { RESULT_MODE } from '../../src/shared/constants.js';

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

describe('ResultService.createFromSession — mode contract', () => {
  let service, repo;

  beforeEach(() => {
    repo = makeRepo();
    service = new ResultService(repo);
    repo.create.mockImplementation((table, data) => ({ id: 'r-new', ...data }));
  });

  it('RESULT_MODE.EXAM is the constant the session path is contractual on', () => {
    // Pins the shared constant itself; a rename would silently change the
    // stored mode value even if the write site were untouched.
    expect(RESULT_MODE.EXAM).toBe('exam');
  });

  it('writes mode="exam" for a formal exam session', async () => {
    repo.query.mockResolvedValue({
      id: 'e-1',
      passing_score: 50,
      is_training: false,
      questions: [{ id: 'q-1', answer: 'Paris', points: 1 }],
    });

    await service.createFromSession({
      exam_id: 'e-1',
      user_id: 'u-1',
      school_id: 'sch-1',
      answers_json: JSON.stringify({ 'q-1': 'Paris' }),
      started_at: new Date().toISOString(),
    });

    const [, payload] = repo.create.mock.calls[0];
    expect(payload.mode).toBe('exam');
  });

  it('writes mode="exam" for a TRAINING exam session (documented behaviour)', async () => {
    // The session object carries no is_training flag; createFromSession cannot
    // (and must not) vary mode on it. Even when the joined exam is a training
    // exam, the stored mode is still 'exam'.
    repo.query.mockResolvedValue({
      id: 'e-train',
      passing_score: 50,
      is_training: true,
      questions: [{ id: 'q-1', answer: 'Paris', points: 1 }],
    });

    await service.createFromSession({
      exam_id: 'e-train',
      user_id: 'u-1',
      school_id: 'sch-1',
      answers_json: JSON.stringify({ 'q-1': 'Paris' }),
      started_at: new Date().toISOString(),
    });

    const [, payload] = repo.create.mock.calls[0];
    expect(payload.mode).toBe('exam');
    // Proves the mode write is unconditional and independent of any session field.
    expect(payload.mode).toBe(RESULT_MODE.EXAM);
  });

  it('does not derive mode from any field present on the session', async () => {
    repo.query.mockResolvedValue({
      id: 'e-1',
      passing_score: 50,
      questions: [{ id: 'q-1', answer: 'Paris', points: 1 }],
    });

    // A hostile/legacy caller tries to smuggle a different mode through the
    // session object; createFromSession must ignore it.
    await service.createFromSession({
      exam_id: 'e-1',
      user_id: 'u-1',
      school_id: 'sch-1',
      mode: 'training',
      is_training: true,
      answers_json: JSON.stringify({ 'q-1': 'Paris' }),
      started_at: new Date().toISOString(),
    });

    const [, payload] = repo.create.mock.calls[0];
    expect(payload.mode).toBe('exam');
  });
});
