/**
 * src/frontend/infrastructure/ApiRepository.js
 *
 * Repository implementation that talks to the Express REST API via fetch.
 * Used in SaaS mode (APP_MODE=saas). Includes automatic token refresh on 401.
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

  constructor({ baseUrl, getToken, onUnauthorized }) {
    super();
    this.#baseUrl        = (baseUrl ?? '').replace(/\/$/, '');
    this.#getToken       = getToken;
    this.#onUnauthorized = onUnauthorized ?? (() => { window.location.href = '/login'; });
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

    let res = await fetch(`${this.#baseUrl}${path}`, init);

    // Attempt token refresh once on 401
    if (res.status === 401) {
      const refreshed = await this.#tryRefresh();
      if (refreshed) {
        const newToken = this.#getToken?.();
        if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(`${this.#baseUrl}${path}`, { ...init, headers });
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
    try {
      const res = await fetch(`${this.#baseUrl}/api/v1/auth/refresh`, {
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
    const params = new URLSearchParams({ limit, offset, orderBy, direction });
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null) params.set(k, v);
    }
    if (search) params.set('search', search);
    return this.#fetch('GET', `/api/v1/${table}?${params}`);
  }

  async getById(table, id) {
    return this.#fetch('GET', `/api/v1/${table}/${id}`);
  }

  async create(table, data) {
    return this.#fetch('POST', `/api/v1/${table}`, data);
  }

  async update(table, id, data) {
    return this.#fetch('PATCH', `/api/v1/${table}/${id}`, data);
  }

  async delete(table, id) {
    return this.#fetch('DELETE', `/api/v1/${table}/${id}`);
  }

  async createMany(table, dataArray) {
    return this.#fetch('POST', `/api/v1/${table}/bulk`, { items: dataArray });
  }

  async query(queryName, params) {
    return this.#fetch('POST', `/api/v1/query/${queryName}`, params ?? {});
  }
}
