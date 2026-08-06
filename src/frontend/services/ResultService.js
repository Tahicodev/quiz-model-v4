/**
 * src/frontend/services/ResultService.js
 */

import { NotFoundError }                            from '../../shared/errors.js';
import { RESULT_MODE }                              from '../../shared/constants.js';

export class ResultService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  /**
   * Create a result from a completed session.
   * Calculates score, earned_points, passed.
   */
  async createFromSession(session) {
    const exam = await this.#repo.query('exam.withQuestions', { examId: session.exam_id });
    if (!exam) throw new NotFoundError('Exam');

    const answers      = JSON.parse(session.answers_json || '{}');
    const questions    = exam.questions ?? [];
    let earnedPoints   = 0;
    let totalPoints    = 0;

    for (const q of questions) {
      const pts     = q.points_override ?? q.points ?? 1;
      totalPoints  += pts;
      const userAns = answers[q.id];
      if (userAns !== undefined && String(userAns).trim().toLowerCase() === String(q.answer).trim().toLowerCase()) {
        earnedPoints += pts;
      }
    }

    const score        = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passingScore = exam.passing_score ?? 50;
    const passed       = score >= passingScore;

    // Count prior attempts
    const { total: attemptCount } = await this.#repo.getAll('results', {
      filters: { exam_id: session.exam_id, user_id: session.user_id },
    });

    const timeSpent = session.started_at
      ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)
      : null;

    return this.#repo.create('results', {
      exam_id:        session.exam_id,
      user_id:        session.user_id,
      school_id:      session.school_id,
      score,
      total_points:   totalPoints,
      earned_points:  earnedPoints,
      time_spent:     timeSpent,
      answers_json:   session.answers_json,
      mode:           RESULT_MODE.EXAM,
      passed,
      attempt_number: attemptCount + 1,
      date_taken:     new Date().toISOString(),
    });
  }

  async getByUser(userId, pagination = {}) {
    return this.#repo.getAll('results', {
      filters:   {
        user_id: userId,
        ...(pagination.schoolId ? { school_id: pagination.schoolId } : {}),
      },
      limit:     pagination.limit   ?? 50,
      offset:    pagination.offset  ?? 0,
      orderBy:   'date_taken',
      direction: 'desc',
    });
  }

  async getByExam(examId, pagination = {}) {
    return this.#repo.getAll('results', {
      filters:   {
        exam_id: examId,
        ...(pagination.schoolId ? { school_id: pagination.schoolId } : {}),
      },
      limit:     pagination.limit   ?? 50,
      offset:    pagination.offset  ?? 0,
      orderBy:   'date_taken',
      direction: 'desc',
    });
  }

  async getById(id) {
    const result = await this.#repo.getById('results', id);
    if (!result) throw new NotFoundError('Result');
    return result;
  }

  async getStatsByExam(examId, schoolId = null) {
    const { data } = await this.#repo.getAll('results', {
      filters: { exam_id: examId, ...(schoolId ? { school_id: schoolId } : {}) },
      limit: 9999,
    });
    if (data.length === 0) return { avg: 0, min: 0, max: 0, passRate: 0, total: 0 };
    const scores = data.map(r => r.score);
    return {
      total:    data.length,
      avg:      Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      min:      Math.min(...scores),
      max:      Math.max(...scores),
      passRate: Math.round((data.filter(r => r.passed).length / data.length) * 100),
    };
  }

  async getStatsByUser(userId, schoolId = null) {
    const { data } = await this.#repo.getAll('results', {
      filters: { user_id: userId, ...(schoolId ? { school_id: schoolId } : {}) },
      limit: 9999,
    });
    if (data.length === 0) return { avg: 0, totalExams: 0, passRate: 0 };
    const scores = data.map(r => r.score);
    return {
      totalExams: data.length,
      avg:        Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      passRate:   Math.round((data.filter(r => r.passed).length / data.length) * 100),
    };
  }
}
