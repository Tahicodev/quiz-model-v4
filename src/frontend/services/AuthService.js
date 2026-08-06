/**
 * src/frontend/services/AuthService.js
 *
 * Handles authentication state and token management.
 *
 * SaaS-only: credentials are verified by the backend (bcrypt + JWT). This
 * service holds the access token in memory ONLY — never in localStorage —
 * and the httpOnly refresh-token cookie is rotated server-side.
 */

import { UnauthorizedError, ValidationError } from '../../shared/errors.js';
import { LoginSchema, ChangePasswordSchema }  from '../../shared/schemas/user.schema.js';
import { ROLES }                              from '../../shared/constants.js';
import { disconnectSocket }                   from '../infrastructure/socket.client.js';
import { apiUrl }                             from '../config.js';

export class AuthService {
  /** @type {string|null} Access token stored in memory — never in storage */ #token = null;
  /** @type {object|null} Decoded user payload */                              #user  = null;

  constructor() {
    // On construction, try to restore session from a lightweight session flag
    this.#restoreSession();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Attempt login via the backend API.
   *
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{user: object, token: string}>}
   */
  async login(username, password) {
    const parsed = LoginSchema.safeParse({ username, password });
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const response = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(parsed.data),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (body.fields) throw new ValidationError(body.fields);
      throw new UnauthorizedError(body.message || body.error?.message || 'Invalid username or password');
    }

    this.#token = body.accessToken || body.token || null;
    this.#user = this.#stripSensitive(body.user || body);
    this.#persistSession(this.#user);
    window.__AUTH_REFRESH_CALLBACK__ = (newToken) => { this.#token = newToken; };
    return { user: this.#user, token: this.#token };
  }

  /**
   * Logout: clear session state, disconnect socket.
   */
  async logout() {
    if (this.#token) {
      try {
        await fetch(apiUrl('/auth/logout'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.#token}` },
          credentials: 'include',
        });
      } catch { /* logout must still clear the local session */ }
    }
    this.#token = null;
    this.#user  = null;
    this.#clearSession();
    disconnectSocket();
  }

  /** @returns {string|null} Current access token */
  getToken() { return this.#token; }

  /** @returns {object|null} Current authenticated user (no password field) */
  getCurrentUser() { return this.#user; }

  /** @returns {boolean} */
  isAuthenticated() { return this.#token !== null && this.#user !== null; }

  /**
   * @param {...string} roles - ROLES constants
   * @returns {boolean}
   */
  hasRole(...roles) {
    return roles.includes(this.#user?.role);
  }

  isAdmin()   { return this.hasRole(ROLES.ADMIN, ROLES.SUPER_ADMIN); }
  isStudent() { return this.hasRole(ROLES.STUDENT); }

  /**
   * Change the current user's password. Delegates to the backend so the new
   * hash is computed server-side with bcrypt and prior refresh tokens are
   * revoked atomically.
   *
   * @param {string} oldPassword
   * @param {string} newPassword
   */
  async changePassword(oldPassword, newPassword) {
    if (!this.#user) throw new UnauthorizedError();
    const parsed = ChangePasswordSchema.safeParse({ oldPassword, newPassword });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const response = await fetch(apiUrl('/auth/change-password'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.#token}`,
      },
      credentials: 'include',
      body: JSON.stringify(parsed.data),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new ValidationError(body.fields || { _: [body.message || 'Password change failed'] });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  #stripSensitive(user) {
    if (!user) return user;
    const { password, password_hash, ...safe } = user;
    return safe;
  }

  /** Persist a lightweight session marker so page refresh restores state */
  #persistSession(user) {
    try {
      sessionStorage.setItem('__quiz_session__', JSON.stringify({ user, ts: Date.now() }));
    } catch { /* ignore quota errors */ }
  }

  #clearSession() {
    try { sessionStorage.removeItem('__quiz_session__'); } catch { /* ignore */ }
  }

  #restoreSession() {
    try {
      const raw = sessionStorage.getItem('__quiz_session__');
      if (!raw) return;
      const { user, ts } = JSON.parse(raw);
      // Session markers older than 8h are discarded — the next authenticated
      // call will redirect through the login flow.
      if (Date.now() - ts > 8 * 60 * 60 * 1000) { this.#clearSession(); return; }
      this.#user = this.#stripSensitive(user);
      // The session marker does not carry the access token (memory-only).
      // On the next protected request the ApiRepository will surface a 401,
      // which triggers a refresh-cookie rotation that repopulates the token.
      window.__AUTH_REFRESH_CALLBACK__ = (newToken) => { this.#token = newToken; };
    } catch {
      this.#clearSession();
    }
  }
}
