/**
 * src/frontend/services/SessionService.js
 * Manages active exam sessions (in-progress attempts).
 */

import { NotFoundError, SessionError }   from '../../shared/errors.js';
import { SESSION_STATUS }                from '../../shared/constants.js';

export class SessionService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async createSession({ examId, userId, durationMinutes }) {
    // Enforce one active session per user per exam
    const { data: existing } = await this.#repo.getAll('exam_sessions', {
      filters: { exam_id: examId, user_id: userId, status: SESSION_STATUS.ACTIVE },
    });
    if (existing.length > 0) return existing[0]; // student may have refreshed

    const expiresAt = durationMinutes
      ? new Date(Date.now() + durationMinutes * 60_000)
      : new Date(Date.now() + 24 * 60 * 60_000); // 24h default

    return this.#repo.create('exam_sessions', {
      exam_id:                examId,
      user_id:                userId,
      status:                 SESSION_STATUS.ACTIVE,
      answers_json:           '{}',
      current_question_index: 0,
      expires_at:             expiresAt.toISOString(),
      last_heartbeat:         new Date().toISOString(),
      started_at:             new Date().toISOString(),
    });
  }

  async saveAnswer({ sessionId, questionId, answer }) {
    const session = await this.#repo.getById('exam_sessions', sessionId);
    if (!session) throw new NotFoundError('ExamSession');
    if (session.status !== SESSION_STATUS.ACTIVE) throw new SessionError('Session is not active');
    if (new Date(session.expires_at) < new Date())  throw new SessionError('Session has expired');

    const answers = JSON.parse(session.answers_json || '{}');
    answers[questionId] = answer;

    return this.#repo.update('exam_sessions', sessionId, {
      answers_json:   JSON.stringify(answers),
      last_heartbeat: new Date().toISOString(),
    });
  }

  async heartbeat(sessionId) {
    const session = await this.#repo.getById('exam_sessions', sessionId);
    if (!session || session.status !== SESSION_STATUS.ACTIVE) return;
    await this.#repo.update('exam_sessions', sessionId, {
      last_heartbeat: new Date().toISOString(),
    });
  }

  async completeSession(sessionId, resultService) {
    const session = await this.#repo.getById('exam_sessions', sessionId);
    if (!session) throw new NotFoundError('ExamSession');

    const result = await resultService.createFromSession(session);
    await this.#repo.update('exam_sessions', sessionId, {
      status:       SESSION_STATUS.COMPLETED,
      completed_at: new Date().toISOString(),
    });
    return result;
  }

  async getActiveSession(examId, userId) {
    const { data } = await this.#repo.getAll('exam_sessions', {
      filters: { exam_id: examId, user_id: userId, status: SESSION_STATUS.ACTIVE },
    });
    return data[0] ?? null;
  }

  /** Called by periodic cleanup (browser setInterval or backend cron) */
  async cleanupExpiredSessions() {
    const expired = await this.#repo.query('session.expiredSessions', { before: new Date() });
    for (const session of expired) {
      await this.#repo.update('exam_sessions', session.id, { status: SESSION_STATUS.EXPIRED });
    }
    return expired.length;
  }
}
