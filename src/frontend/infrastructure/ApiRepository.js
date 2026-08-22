/**
 * src/frontend/infrastructure/ApiRepository.js
 *
 * Repository implementation that talks to the Express REST API via fetch.
 * The only repository implementation in this SaaS-only build. Includes
 * automatic access-token refresh on 401 via the httpOnly refresh cookie.
 *
 * Constructor params:
 *   baseUrl        - API base URL, e.g. "http://localhost:3000"
 *   getToken       - Callback returning the current access token string (or null)
 *   onUnauthorized - Callback when token refresh fails (default: redirect to /login)
 */

import { IStorageRepository }                        from './IStorageRepository.js';
import { UnauthorizedError, AppError, NotFoundError } from '../../shared/errors.js';

export class ApiRepository extends IStorageRepository {
  #baseUrl;
  #getToken;
  #onUnauthorized;
  #refreshPromise = null;

  constructor({ baseUrl, getToken, onUnauthorized }) {
    super();
    this.#baseUrl        = (baseUrl ?? '').replace(/\/$/, '');
    this.#getToken       = getToken;
    this.#onUnauthorized = onUnauthorized ?? (() => { window.location.href = '/login'; });
  }

  #url(path) {
    const target = String(path || '');
    if (!this.#baseUrl) return target.startsWith('/') ? target : `/${target}`;
    if (target === this.#baseUrl || target.startsWith(`${this.#baseUrl}/`)) return target;
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(this.#baseUrl)) {
      const root = new URL(this.#baseUrl);
      const basePath = root.pathname.replace(/\/$/, '');
      const targetUrl = new URL(target.startsWith('/') ? target : `/${target}`, root.origin);
      targetUrl.pathname = `${basePath}${targetUrl.pathname}`.replace(/\/+/g, '/');
      return targetUrl.toString();
    }
    return `${this.#baseUrl}${target.startsWith('/') ? target : `/${target}`}`;
  }

  // ── Core fetch wrapper ───────────────────────────────────────────────────────

  async #fetch(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token   = this.#getToken?.();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const init = {
      method,
      headers,
      credentials: 'include', // sends httpOnly refresh token cookie
      ...(body !== null ? { body: JSON.stringify(body) } : {}),
    };

    let res = await fetch(this.#url(path), init);

    // Attempt token refresh once on 401
    if (res.status === 401) {
      const refreshed = await this.#tryRefresh();
      if (refreshed) {
        const newToken = this.#getToken?.();
        if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(this.#url(path), { ...init, headers });
      } else {
        this.#onUnauthorized();
        throw new UnauthorizedError('Session expired — please log in again');
      }
    }

    // Parse body (tolerate empty body on 204)
    const json = res.status !== 204
      ? await res.json().catch(() => ({}))
      : {};

    if (!res.ok) {
      if (res.status === 404) throw new NotFoundError(json.message ?? path);
      throw new AppError(json.code ?? 'API_ERROR', json.message ?? 'Request failed', res.status);
    }

    return json;
  }

  async #tryRefresh() {
    if (this.#refreshPromise) return this.#refreshPromise;
    this.#refreshPromise = (async () => {
    try {
      const res = await fetch(this.#url('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const { accessToken } = await res.json();
      // Notify the AuthService to store the new token
      window.__AUTH_REFRESH_CALLBACK__?.(accessToken);
      return true;
    } catch {
      return false;
    }
    })().finally(() => {
      this.#refreshPromise = null;
    });
    return this.#refreshPromise;
  }

  // ── IStorageRepository implementation ────────────────────────────────────────

  async getAll(table, {
    filters   = {},
    limit     = 50,
    offset    = 0,
    orderBy   = 'created_at',
    direction = 'desc',
    search    = null,
  } = {}) {
    // Results have dedicated endpoints because `/results` defaults to the
    // current user on the backend. Preserve exam/user filters when an admin
    // browses results.
    let endpoint = `/${table}`;
    if (table === 'results' && filters.exam_id) {
      endpoint = `/results/exam/${encodeURIComponent(filters.exam_id)}`;
    }

    const params = new URLSearchParams({ limit, offset, orderBy, direction });
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && !(table === 'results' && k === 'exam_id')) params.set(k, v);
    }
    if (search) params.set('search', search);
    return this.#fetch('GET', `${endpoint}?${params}`);
  }

  async getById(table, id) {
    if (table === 'exam_sessions') {
      return this.#fetch('GET', `/sessions/${encodeURIComponent(id)}`);
    }
    return this.#fetch('GET', `/${table}/${id}`);
  }

  async create(table, data) {
    if (table === 'settings') {
      return this.updateSetting(data.key, data);
    }
    return this.#fetch('POST', `/${table}`, data);
  }

  async update(table, id, data) {
    if (table === 'users' && data?.password) {
      return this.#fetch('POST', `/users/${id}/reset-password`, { newPassword: data.password });
    }
    if (table === 'settings') {
      return this.updateSetting(data?.key ?? id, data);
    }
    return this.#fetch('PATCH', `/${table}/${id}`, data);
  }

  async delete(table, id) {
    if (table === 'settings') return this.deleteSetting(id);
    return this.#fetch('DELETE', `/${table}/${id}`);
  }

  async createMany(table, dataArray) {
    return this.#fetch('POST', `/bulk/${table}`, { items: dataArray });
  }

  async query(queryName, params) {
    return this.#fetch('POST', `/query/${queryName}`, params ?? {});
  }

  // Student attempt lifecycle endpoints. These are deliberately explicit:
  // sessions are not generic CRUD resources on the API because ownership,
  // scoring, and expiry are enforced by the route/service layer.
  async startSession(examId, durationMinutes = null) {
    return this.#fetch('POST', '/sessions', {
      exam_id: examId,
      ...(durationMinutes != null ? { duration_minutes: durationMinutes } : {}),
    });
  }

  async getActiveSession(examId) {
    return this.#fetch('GET', `/sessions/active/${encodeURIComponent(examId)}`);
  }

  async saveSessionAnswer(sessionId, questionId, answer) {
    return this.#fetch('POST', `/sessions/${encodeURIComponent(sessionId)}/answer`, {
      session_id: sessionId,
      question_id: questionId,
      answer: String(answer ?? ''),
    });
  }

  async heartbeatSession(sessionId) {
    return this.#fetch('POST', `/sessions/${encodeURIComponent(sessionId)}/heartbeat`);
  }

  async submitSession(sessionId) {
    return this.#fetch('POST', `/sessions/${encodeURIComponent(sessionId)}/submit`);
  }

  async joinGame({ gameId, joinCode } = {}) {
    return this.#fetch('POST', '/games/join', {
      ...(gameId ? { game_id: gameId } : {}),
      ...(joinCode ? { join_code: String(joinCode).trim().toUpperCase() } : {}),
    });
  }

  async answerGame(gameId, questionId, answer) {
    return this.#fetch('POST', `/games/${encodeURIComponent(gameId)}/answer`, {
      game_id: gameId,
      question_id: questionId,
      answer: String(answer ?? ''),
    });
  }

  async getGameScores(gameId) {
    return this.#fetch('GET', `/games/${encodeURIComponent(gameId)}/scores`);
  }

  async registerTournament(tournamentId) {
    return this.#fetch('POST', `/tournaments/${encodeURIComponent(tournamentId)}/register`);
  }

  async getTournamentLeaderboard(tournamentId, limit = 50) {
    return this.#fetch('GET', `/tournaments/${encodeURIComponent(tournamentId)}/leaderboard?limit=${encodeURIComponent(limit)}`);
  }

  async answerTournament(tournamentId, questionId, answer) {
    return this.#fetch('POST', `/tournaments/${encodeURIComponent(tournamentId)}/answer`, {
      question_id: questionId,
      answer: String(answer ?? ''),
    });
  }

  async getExamWithQuestions(examId) {
    return this.#fetch('GET', `/exams/${encodeURIComponent(examId)}/questions`);
  }

  // Nested admin resources have explicit backend routes rather than generic
  // CRUD endpoints. These methods keep the service layer portable across
  // repository implementations.
  async addExamQuestion(examId, data) {
    return this.#fetch('POST', `/exams/${examId}/questions`, data);
  }

  async removeExamQuestion(examId, questionId) {
    return this.#fetch('DELETE', `/exams/${examId}/questions/${questionId}`);
  }

  async reorderExamQuestions(examId, questionIds) {
    return this.#fetch('PUT', `/exams/${examId}/questions/order`, { question_ids: questionIds });
  }

  async getExamClasses(examId) {
    return this.#fetch('GET', `/exams/${examId}/classes`);
  }

  async assignExamClass(examId, classId) {
    return this.#fetch('POST', `/exams/${examId}/classes`, { class_id: classId });
  }

  async removeExamClass(examId, classId) {
    return this.#fetch('DELETE', `/exams/${examId}/classes/${classId}`);
  }

  async updateSetting(key, data) {
    return this.#fetch('PATCH', `/settings/${encodeURIComponent(key)}`, {
      key,
      value: data?.value ?? '',
      ...(data?.visibility ? { visibility: data.visibility } : {}),
    });
  }

  async deleteSetting(key) {
    return this.#fetch('DELETE', `/settings/${encodeURIComponent(key)}`);
  }
}
