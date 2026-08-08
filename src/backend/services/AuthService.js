/**
 * src/backend/services/AuthService.js
 *
 * Authentication: verifies credentials, issues JWT access tokens and hashed
 * refresh tokens. Refresh tokens are stored as a SHA-256 hash — the raw token
 * is only ever sent to the client. Implements the service-pattern from the
 * master prompt but adapted for real backend auth (bcrypt, refresh tokens).
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { logger, securityLog } from '../logger.js';
import { UnauthorizedError, NotFoundError, ValidationError, ForbiddenError } from '../../shared/errors.js';
import { LoginSchema, ChangePasswordSchema } from '../../shared/schemas/user.schema.js';

/** SHA-256 hash of a raw token — what we persist. Raw tokens are never stored. */
function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/** Generate a cryptographically random refresh token. */
function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

/** Parse a human-readable duration ("7d", "15m") into seconds. */
function durationToSeconds(d) {
  const match = /^(\d+)\s*([smhd])$/.exec(String(d));
  if (!match) return 15 * 60; // default 15m
  const value = parseInt(match[1], 10);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  return value * unit;
}

export class AuthService {
  #repo;

  /** @param {import('../../frontend/infrastructure/IStorageRepository.js').IStorageRepository} repo */
  constructor(repo) {
    this.#repo = repo;
  }

  /**
   * Authenticate and issue tokens.
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>}
   */
  async login(username, password, { ip = null, userAgent = null } = {}) {
    const parsed = LoginSchema.safeParse({ username, password });
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    const { data: users } = await this.#repo.getAll('users', {
      filters: { username: username.trim() },
    });
    const user = users[0];
    if (!user) {
      securityLog('login_failure', { username, reason: 'unknown_user', ip });
      throw new UnauthorizedError('Invalid username or password');
    }

    if (user.status !== 'active') {
      securityLog('login_failure', { userId: user.id, reason: `status:${user.status}`, ip });
      throw new ForbiddenError('Your account is not active. Contact your administrator.');
    }

    // Support three hash generations:
    //   1. bcrypt ($2a$/$2b$/...)                                  — proper SaaS
    //   2. legacy "simple-<signed-int>" from auth.js simpleHash    — local-only
    //   3. legacy SHA-256 hex (64 lower-hex chars)                 — older local
    // Whenever a non-bcrypt hash matches, immediately re-hash with bcrypt and
    // persist, so the user's next login goes through the fast path.
    let matches = false;
    let shouldMigrate = false;
    const stored = String(user.password_hash || '');

    if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
      matches = await bcrypt.compare(password, stored);
    } else if (stored.startsWith('simple-')) {
      // Mirror auth.js simpleHash: djb2-style 32-bit with sign.
      let h = 0;
      const s = String(password || '');
      for (let i = 0; i < s.length; i++) {
        h = (h << 5) - h + s.charCodeAt(i);
        h |= 0;
      }
      matches = `simple-${h}` === stored;
      shouldMigrate = matches;
    } else if (/^[0-9a-f]{64}$/i.test(stored)) {
      // SHA-256 hex of the plaintext (auth.js hashPassword fallback).
      const hex = crypto.createHash('sha256').update(String(password || ''), 'utf8').digest('hex');
      matches = hex === stored.toLowerCase();
      shouldMigrate = matches;
    } else {
      // Unknown scheme — do not authenticate.
      matches = false;
    }

    if (!matches) {
      securityLog('login_failure', { userId: user.id, reason: 'bad_password', ip });
      throw new UnauthorizedError('Invalid username or password');
    }

    // Migrate weak hashes to bcrypt transparently so future logins use the
    // standard verifier and so the DB drifts toward a single hash scheme.
    if (shouldMigrate) {
      try {
        const newHash = await bcrypt.hash(password, config.bcryptRounds);
        await this.#repo.update('users', user.id, { password_hash: newHash });
        securityLog('password_hash_migrated', { userId: user.id, from: stored.startsWith('simple-') ? 'simple' : 'sha256' });
      } catch (migrateErr) {
        // Migration failure must not block a valid login.
        logger.warn({ err: migrateErr, userId: user.id }, 'Password hash migration failed — continuing');
      }
    }

    // Update last login
    await this.#repo.update('users', user.id, { last_login: new Date().toISOString() });

    const safeUser = this.#stripSensitive(user);
    const accessToken = this.#signAccess(safeUser);
    const refreshToken = await this.#issueRefresh(user.id, { ip, userAgent });

    securityLog('login_success', { userId: user.id, ip });
    return { user: safeUser, accessToken, refreshToken };
  }

  /**
   * Issue a new access token from a valid refresh token.
   * @param {string} rawRefreshToken
   * @returns {Promise<{ accessToken: string }>}
   */
  async refresh(rawRefreshToken) {
    if (!rawRefreshToken) throw new UnauthorizedError('Missing refresh token');

    const tokenHash = hashToken(rawRefreshToken);
    const { data: tokens } = await this.#repo.getAll('refresh_tokens', {
      filters: { token_hash: tokenHash },
    });
    const stored = tokens[0];

    if (!stored) throw new UnauthorizedError('Invalid refresh token');
    if (stored.revoked) throw new UnauthorizedError('Refresh token revoked');
    if (new Date(stored.expires_at) < new Date()) {
      throw new UnauthorizedError('Refresh token expired');
    }

    const user = await this.#repo.getById('users', stored.user_id);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User no longer active');
    }

    // Rotate: revoke the consumed token and issue a fresh one.
    await this.#repo.update('refresh_tokens', stored.id, { revoked: true });
    const newRefresh = await this.#issueRefresh(user.id, {});

    const accessToken = this.#signAccess(this.#stripSensitive(user));
    return { accessToken, refreshToken: newRefresh };
  }

  /**
   * Revoke a refresh token (logout). Silently succeeds if not found.
   * @param {string} rawRefreshToken
   */
  async logout(rawRefreshToken) {
    if (!rawRefreshToken) return;
    const tokenHash = hashToken(rawRefreshToken);
    const { data: tokens } = await this.#repo.getAll('refresh_tokens', {
      filters: { token_hash: tokenHash },
    });
    if (tokens[0]) {
      await this.#repo.update('refresh_tokens', tokens[0].id, { revoked: true });
    }
  }

  /**
   * Change the current user's password.
   */
  async changePassword(userId, oldPassword, newPassword) {
    const parsed = ChangePasswordSchema.safeParse({ oldPassword, newPassword });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const user = await this.#repo.getById('users', userId);
    if (!user) throw new NotFoundError('User');

    const matches = await bcrypt.compare(oldPassword, user.password_hash);
    if (!matches) throw new ValidationError({ oldPassword: ['Current password is incorrect'] });

    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await this.#repo.update('users', userId, { password_hash: passwordHash });

    // Revoke all existing refresh tokens — force re-login everywhere.
    const { data: tokens } = await this.#repo.getAll('refresh_tokens', {
      filters: { user_id: userId, revoked: false },
    });
    for (const t of tokens) {
      await this.#repo.update('refresh_tokens', t.id, { revoked: true });
    }

    logger.info({ userId }, 'Password changed; all sessions revoked');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  #signAccess(user) {
    return jwt.sign(
      { id: user.id, username: user.username, role: user.role, school_id: user.school_id },
      config.jwtSecret,
      { expiresIn: config.jwtAccessExpires }
    );
  }

  async #issueRefresh(userId, { ip, userAgent }) {
    const raw = generateRefreshToken();
    const expiresAt = new Date(Date.now() + durationToSeconds(config.jwtRefreshExpires) * 1000);

    await this.#repo.create('refresh_tokens', {
      user_id: userId,
      token_hash: hashToken(raw),
      expires_at: expiresAt.toISOString(),
      revoked: false,
      user_agent: userAgent || null,
      ip_address: ip || null,
    });
    return raw;
  }

  #stripSensitive(user) {
    const { password_hash, ...safe } = user;
    return safe;
  }
}
