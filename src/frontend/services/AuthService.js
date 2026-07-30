/**
 * src/frontend/services/AuthService.js
 *
 * Handles authentication state and token management.
 * Stores the access token in memory ONLY — never in localStorage directly.
 * In local mode the "token" is a simple encoded user object (no real JWT).
 */

import { UnauthorizedError, ValidationError, NotFoundError } from '../../shared/errors.js';
import { LoginSchema, ChangePasswordSchema }                  from '../../shared/schemas/user.schema.js';
import { ROLES }                                              from '../../shared/constants.js';
import { disconnectSocket }                                   from '../infrastructure/socket.client.js';
import { config, apiUrl }                                     from '../config.js';

export class AuthService {
  #repo;
  /** @type {string|null} Access token stored in memory — never in storage */ #token = null;
  /** @type {object|null} Decoded user payload */                              #user  = null;

  constructor(repo) {
    this.#repo = repo;
    // On construction, try to restore session from a lightweight session flag
    this.#restoreSession();
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /**
   * Attempt login. In local mode, verifies against localStorage users.
   * In SaaS mode, delegates to API (ApiRepository handles the call).
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

    // SaaS authentication is handled by the backend so bcrypt/JWT and the
    // httpOnly refresh-token cookie remain server-side. The local repository
    // path below is retained for the offline/local deployment mode.
    if (config.mode === 'saas') {
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

    // In local mode: find user in LocalStorage and do simple password check
    // (The real bcrypt comparison happens on the backend in SaaS mode)
    const { data: users } = await this.#repo.getAll('users', {
      filters: { username: username.trim() },
    });

    const user = users[0];
    if (!user) throw new UnauthorizedError('Invalid username or password');

    // Local mode: password stored as plain or bcrypt hash
    // We accept both for backward compatibility with existing data
    const passwordMatches = await this.#checkPassword(password, user.password ?? user.password_hash ?? '');
    if (!passwordMatches) throw new UnauthorizedError('Invalid username or password');

    if (user.status === 'inactive' || user.status === 'suspended') {
      throw new UnauthorizedError('Your account is not active. Contact your administrator.');
    }

    // Update last_login
    await this.#repo.update('users', user.id, { last_login: new Date().toISOString() });

    // Build in-memory token (local mode: base64 encoded payload)
    const safeUser = this.#stripSensitive(user);
    const token    = this.#encodeToken(safeUser);

    this.#token = token;
    this.#user  = safeUser;
    this.#persistSession(safeUser);

    // Register the refresh callback for ApiRepository in SaaS mode
    window.__AUTH_REFRESH_CALLBACK__ = (newToken) => { this.#token = newToken; };

    return { user: safeUser, token };
  }

  /**
   * Logout: clear session state, disconnect socket.
   */
  async logout() {
    if (config.mode === 'saas' && this.#token) {
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
   * Change the current user's password.
   * @param {string} oldPassword
   * @param {string} newPassword
   */
  async changePassword(oldPassword, newPassword) {
    if (!this.#user) throw new UnauthorizedError();
    const parsed = ChangePasswordSchema.safeParse({ oldPassword, newPassword });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const user = await this.#repo.getById('users', this.#user.id);
    if (!user) throw new NotFoundError('User');

    const matches = await this.#checkPassword(oldPassword, user.password ?? user.password_hash ?? '');
    if (!matches) throw new ValidationError({ oldPassword: ['Current password is incorrect'] });

    await this.#repo.update('users', user.id, { password: newPassword, updated_at: new Date().toISOString() });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Simple local-mode password check (plain text for legacy data, hash prefix detection) */
  async #checkPassword(input, stored) {
    // Legacy plain-text passwords stored by old app
    if (!stored.startsWith('$2')) return input === stored;
    // If bcrypt is available (via CDN or import in SaaS), use it
    if (typeof window !== 'undefined' && window.dcodeIO?.bcrypt) {
      return window.dcodeIO.bcrypt.compareSync(input, stored);
    }
    // Fallback: plain comparison (acceptable for pure local-mode dev)
    return input === stored;
  }

  #stripSensitive(user) {
    const { password, password_hash, ...safe } = user;
    return safe;
  }

  #encodeToken(user) {
    // Local mode: base64-encode the user payload (NOT a real JWT)
    return btoa(JSON.stringify({ ...user, iat: Date.now() }));
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
      // Try new session format first
      const raw = sessionStorage.getItem('__quiz_session__');
      if (raw) {
        const { user, ts } = JSON.parse(raw);
        if (Date.now() - ts > 8 * 60 * 60 * 1000) { this.#clearSession(); return; }
        this.#user  = user;
        this.#token = this.#encodeToken(user);
        window.__AUTH_REFRESH_CALLBACK__ = (newToken) => { this.#token = newToken; };
        return;
      }

      // Fallback: detect the legacy session used by auth.js. The legacy
      // browser flow stores this in localStorage; older local builds used
      // sessionStorage, so support both during the migration window.
      const legacyRaw = sessionStorage.getItem('quizSession') || localStorage.getItem('quizSession');
      const legacySession = legacyRaw ? JSON.parse(legacyRaw) : null;
      if (legacySession) {
        if (legacySession.expiresAt && Date.now() > new Date(legacySession.expiresAt).getTime()) {
          sessionStorage.removeItem('quizSession');
          localStorage.removeItem('quizSession');
          return;
        }
        try {
          const usersJson = localStorage.getItem('quizUsers');
          const localUser = usersJson
            ? JSON.parse(usersJson).find(u => u.id === legacySession.userId)
            : null;
          const tokenUser = this.#decodeToken(legacySession.token);
          const user = localUser || {
            id: legacySession.userId,
            username: legacySession.username,
            name: legacySession.name,
            role: legacySession.role,
            school_id: tokenUser?.school_id,
          };
          if (user?.id && user?.role) {
            this.#user = this.#stripSensitive(user);
            this.#token = legacySession.token || this.#encodeToken(this.#user);
            this.#persistSession(this.#user);
            window.__AUTH_REFRESH_CALLBACK__ = (newToken) => { this.#token = newToken; };
            return;
          }
        } catch { /* legacy session could be malformed */ }
      }

      // Last-resort legacy current-user marker (some local builds persisted
      // this without a full quizSession record).
      try {
        const rawUser = localStorage.getItem('quizCurrentUser');
        if (rawUser) {
          const user = this.#stripSensitive(JSON.parse(rawUser));
          if (user?.id && user?.role) {
            this.#user = user;
            this.#token = this.#encodeToken(user);
            this.#persistSession(user);
          }
        }
      } catch { /* ignore malformed legacy state */ }
    } catch {
      this.#clearSession();
    }
  }

  #decodeToken(token) {
    if (!token || typeof token !== 'string') return null;
    try {
      const payload = token.split('.')[1];
      if (!payload) return null;
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(normalized));
    } catch { return null; }
  }
}
