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
import { UnauthorizedError, NotFoundError, ValidationError, ForbiddenError, SessionConflictError } from '../../shared/errors.js';
import { LoginSchema, ChangePasswordSchema } from '../../shared/schemas/user.schema.js';
import { ROLES } from '../../shared/constants.js';

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

/** A refresh token counts as a *live* session while it is younger than this.
 * Rotation keeps a genuinely-open tab's token fresh (access TTL is 15m, so
 * live tabs rotate well inside the window); a closed tab's last token ages
 * out and stops blocking new logins. */

// Boot epoch: anything minted BEFORE this process start belongs to a
// previous run. Those tokens remain VALID for refresh() so open tabs keep
// their session across a server restart (no surprise mid-session logouts),
// but they never count as LIVE — otherwise a killed server would leave
// "This account is already signed in on another device" walls for logins
// whose sessions died with the old process.
const BOOT_EPOCH_MS = Date.now();

function sessionActiveWindowMs() {
  const minutes = Number(process.env.SESSION_ACTIVE_WINDOW_MINUTES || 30);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 30) * 60_000;
}

/** Non-revoked refresh-token rows for a user (any portal — one user, one session). */
async function liveRefreshTokens(repo, userId) {
  const { data: tokens } = await repo.getAll('refresh_tokens', {
    filters: { user_id: userId, revoked: false },
    limit: 1000,
  });
  return tokens || [];
}

function isTokenLive(token, nowMs) {
  if (!token) return false;
  if (new Date(token.expires_at).getTime() <= nowMs) return false;
  const createdAt = new Date(token.created_at).getTime();
  // Rows without a timestamp never count as live (never block a login on
  // bad data); only their expiry/revocation still applies elsewhere.
  if (!Number.isFinite(createdAt)) return false;
  // Pre-boot rows belong to a previous run: valid for refresh, but not a
  // live gate for new logins (sessions died with the old process).
  if (createdAt < BOOT_EPOCH_MS) return false;
  return nowMs - createdAt < sessionActiveWindowMs();
}

/**
 * Shared liveness check (exported for the school-wide live-sessions
 * listing, which applies the same "would this token block a login" rule).
 */
export function isRefreshTokenLive(token, nowMs = Date.now()) {
  return isTokenLive(token, nowMs);
}

export class AuthService {
  #repo;
  #lastIp = null;

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
  async login(username, password, { ip = null, userAgent = null, schoolSlug = null, schoolId = null, force = false } = {}) {
    const parsed = LoginSchema.safeParse({ username, password });
    if (!parsed.success) {
      throw new ValidationError(parsed.error.flatten().fieldErrors);
    }

    // Tenant scoping: usernames are only unique per school, so resolving a
    // login by username alone is ambiguous the moment two schools share an
    // "admin". Prefer an explicit tenant (slug or id); otherwise fall back to
    // the deployment's default school. Username-only lookup remains as a last
    // resort for single-tenant installs that never set DEFAULT_SCHOOL_ID.
    const trimmedUsername = String(username ?? '').trim();
    let resolvedSchoolId = schoolId || null;
    if (!resolvedSchoolId && schoolSlug) {
      const { data: schools } = await this.#repo.getAll('schools', {
        filters: { slug: String(schoolSlug).trim() },
        limit: 1,
      });
      resolvedSchoolId = schools[0]?.id || null;
    }
    if (!resolvedSchoolId) resolvedSchoolId = process.env.DEFAULT_SCHOOL_ID || null;

    const userFilters = { username: trimmedUsername };
    if (resolvedSchoolId) userFilters.school_id = resolvedSchoolId;

    let { data: users } = await this.#repo.getAll('users', {
      filters: userFilters,
      limit: 1,
    });
    // The deployment default is a hint, not a tenant the caller chose: if it
    // points at a school that does not hold this username (multi-school
    // installs, DEFAULT_SCHOOL_ID left over from .env), fall back to the
    // username-only lookup instead of rejecting a valid login outright.
    if (!users.length && resolvedSchoolId && !schoolId && !schoolSlug) {
      ({ data: users } = await this.#repo.getAll('users', {
        filters: { username: trimmedUsername },
        limit: 1,
      }));
    }
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

    // ── Single active session ──────────────────────────────────────────
    // One user, one live session across every portal/tab/device. Mint first,
    // then arbitrate: concurrent logins (double-clicks, racing tabs) converge
    // instead of both slipping past a check-then-mint race with two live
    // sessions. A blocked attempt rolls back its own mint so failed logins
    // never pile up live rows that would block every future login.
    // Without `force`, a live session elsewhere rejects this login (409);
    // with it, every other token is revoked and the previous tab is ended
    // server-side (it learns via /auth/session or its next failed refresh).
    const issued = await this.#issueRefresh(user.id, { ip, userAgent });
    const others = (await liveRefreshTokens(this.#repo, user.id)).filter(
      (t) => t && t.id !== issued.id,
    );
    const nowMs = Date.now();
    const liveOthers = others.filter((t) => isTokenLive(t, nowMs));
    if (liveOthers.length && force !== true) {
      try {
        if (issued.id) {
          await this.#repo.update('refresh_tokens', issued.id, { revoked: true });
        }
      } catch (rollbackErr) {
        logger.warn({ err: rollbackErr, userId: user.id }, 'Blocked login: own token rollback failed');
      }
      securityLog('login_blocked_active_session', { userId: user.id, ip });
      throw new SessionConflictError();
    }
    for (const t of others) {
      if (!t?.id) continue;
      try {
        await this.#repo.update('refresh_tokens', t.id, { revoked: true });
      } catch (revokeErr) {
        logger.warn({ err: revokeErr, userId: user.id }, 'Single-session takeover: revoke failed');
      }
    }

    const safeUser = this.#stripSensitive(user);
    const accessToken = this.#signAccess(safeUser, { sid: issued.id });

    securityLog('login_success', { userId: user.id, ip });
    return { user: safeUser, accessToken, refreshToken: issued.raw };
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
    const issued = await this.#issueRefresh(user.id, {});

    // Single-session convergence: if two sessions somehow coexist (e.g. one
    // predates this feature), the one that refreshes first ends the other.
    try {
      const { data: siblings } = await this.#repo.getAll('refresh_tokens', {
        filters: { user_id: user.id, revoked: false },
        limit: 1000,
      });
      for (const t of siblings || []) {
        if (t?.id && t.id !== issued.id) {
          await this.#repo.update('refresh_tokens', t.id, { revoked: true });
        }
      }
    } catch (convergeErr) {
      logger.warn({ err: convergeErr, userId: user.id }, 'Refresh single-session convergence failed');
    }

    const accessToken = this.#signAccess(this.#stripSensitive(user), { sid: issued.id });
    return { accessToken, refreshToken: issued.raw };
  }

  /**
   * Is this tab's session still the live one? The access token carries the
   * id (`sid`) of the refresh token minted at login/last rotation. If a
   * NEWER live token exists for the user, another tab/device took over and
   * this session has ended. Tokens without a sid (predating this feature)
   * fail open — rotation mints them a sid within one access-TTL window.
   * @returns {Promise<{ active: boolean, reason?: string }>}
   */
  async sessionStatus(userId, sid) {
    if (!userId) throw new UnauthorizedError();
    if (!sid) return { active: true, current: false };
    const { data: tokens } = await this.#repo.getAll('refresh_tokens', {
      filters: { user_id: userId, revoked: false },
      orderBy: 'created_at',
      direction: 'desc',
      limit: 100,
    });
    const nowMs = Date.now();
    const live = (tokens || []).filter((t) => t && new Date(t.expires_at).getTime() > nowMs);
    const mine = live.find((t) => String(t.id) === String(sid));
    if (!mine) return { active: false, reason: 'revoked' };
    const newest = live[0];
    if (newest && String(newest.id) !== String(sid)) {
      return { active: false, reason: 'superseded' };
    }
    return { active: true };
  }

  /**
   * List a user's refresh-token sessions for admin inspection. Token hashes
   * are never exposed — only metadata plus whether each row counts as live.
   */
  async listSessions(userId) {
    const { data: tokens } = await this.#repo.getAll('refresh_tokens', {
      filters: { user_id: userId },
      orderBy: 'created_at',
      direction: 'desc',
      limit: 100,
    });
    const nowMs = Date.now();
    return (tokens || []).map((t) => ({
      id: t.id,
      created_at: t.created_at,
      expires_at: t.expires_at,
      revoked: !!t.revoked,
      live: !t.revoked && isTokenLive(t, nowMs),
      user_agent: t.user_agent || null,
      ip_address: t.ip_address || null,
    }));
  }

  /**
   * School-wide blocking sessions: every user of the school holding at
   * least one LIVE refresh token (i.e. a login elsewhere would be rejected
   * as "already signed in"). Powers the admin rescue view for stuck
   * accounts — without it, an admin cannot discover WHO is blocked.
   * Token hashes are never exposed.
   * @returns {Promise<Array<{ user, sessions, blocking }>>}
   */
  async listLiveSessions(schoolId) {
    const { data: users } = await this.#repo.getAll('users', {
      filters: { school_id: schoolId },
      limit: 100000,
    });
    const byId = new Map((users || []).map((u) => [String(u.id), u]));
    const { data: tokens } = await this.#repo.getAll('refresh_tokens', {
      filters: { revoked: false },
      limit: 5000,
    });
    const nowMs = Date.now();
    const grouped = new Map();
    for (const t of tokens || []) {
      if (!t?.user_id || !isTokenLive(t, nowMs)) continue;
      const user = byId.get(String(t.user_id));
      // Tenant-scoped: tokens whose user is outside this school (moved or
      // stale rows) never surface in another school's admin view.
      if (!user || String(user.school_id) !== String(schoolId)) continue;
      if (!grouped.has(user.id)) grouped.set(user.id, { user, sessions: [] });
      grouped.get(user.id).sessions.push({
        id: t.id,
        created_at: t.created_at,
        expires_at: t.expires_at,
        live: true,
        user_agent: t.user_agent || null,
        ip_address: t.ip_address || null,
      });
    }
    return [...grouped.values()]
      .map(({ user, sessions }) => {
        const { password_hash, ...safe } = user;
        sessions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return { user: safe, sessions, blocking: true };
      })
      .sort((a, b) => new Date(b.sessions[0].created_at) - new Date(a.sessions[0].created_at));
  }

  /**
   * Revoke every live session of a user (admin unstick: ends all their
   * tabs/devices so the next login succeeds). Returns the revoked count.
   */
  async revokeUserSessions(userId) {
    const { data: tokens } = await this.#repo.getAll('refresh_tokens', {
      filters: { user_id: userId, revoked: false },
      limit: 1000,
    });
    let revoked = 0;
    for (const t of tokens || []) {
      if (!t?.id) continue;
      try {
        await this.#repo.update('refresh_tokens', t.id, { revoked: true });
        revoked += 1;
      } catch (revokeErr) {
        logger.warn({ err: revokeErr, userId }, 'Admin session revoke failed');
      }
    }
    securityLog('admin_revoked_sessions', { userId, revoked });
    return { revoked };
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

  // ── Recovery-code password reset (server-side, cross-device) ────────────────
  // The recovery code hash lives in a SYSTEM-visibility Setting row
  // (`system.recovery_code_hash`) so no settings GET can ever return it.
  // Verify mints a short-lived recovery ticket JWT; reset consumes it.

  /**
   * Admin sets/updates the school's recovery code. The raw code only ever
   * travels inside an authenticated admin session (same trust level as a
   * password change); only its bcrypt hash is persisted, in a SYSTEM-visibility
   * settings row that no settings GET can return.
   * @param {{ schoolId: string, code: string, actor?: object }} input
   */
  async setRecoveryCode(schoolId, code, actor = null) {
    if (!code || typeof code !== 'string' || code.trim().length < 4) {
      throw new ValidationError({ code: ['Recovery code must be at least 4 characters'] });
    }
    const hash = await bcrypt.hash(code.trim(), config.bcryptRounds);
    const { data: rows } = await this.#repo.getAll('settings', {
      filters: { school_id: schoolId, key: 'system.recovery_code_hash' },
      limit: 1,
    });
    if (rows[0]) {
      await this.#repo.update('settings', rows[0].id, {
        value: hash,
        visibility: 'system',
      });
    } else {
      await this.#repo.create('settings', {
        school_id: schoolId,
        key: 'system.recovery_code_hash',
        value: hash,
        visibility: 'system',
      });
    }
    securityLog('recovery_code_set', { schoolId, actorId: actor?.id ?? null });
    logger.info({ schoolId, actorId: actor?.id ?? null }, 'Recovery code set');
    return { set: true };
  }

  /**
   * Verify a recovery code and mint a 15-minute recovery ticket.
   * @returns {Promise<{ ticket: string, schoolId: string }>}
   */
  async verifyRecoveryCode(schoolId, code, { ip = null } = {}) {
    this.#lastIp = ip;
    if (!code || typeof code !== 'string') {
      throw new ValidationError({ code: ['Recovery code is required'] });
    }
    const hash = await this.#getSystemSetting(schoolId, 'system.recovery_code_hash');
    if (!hash) {
      throw new ForbiddenError('No recovery code has been set up for this school');
    }
    const matches = await bcrypt.compare(String(code).trim(), hash);
    if (!matches) {
      securityLog('recovery_code_failure', { schoolId, reason: 'bad_code', ip: this.#lastIp });
      throw new UnauthorizedError('Invalid recovery code');
    }

    const ticket = jwt.sign(
      { type: 'recovery', schoolId },
      config.jwtSecret,
      { expiresIn: '15m' },
    );
    securityLog('recovery_code_verified', { schoolId });
    return { ticket, schoolId };
  }

  /**
   * Reset an admin's password with a recovery ticket.
   * @param {{ ticket: string, username: string, newPassword: string, schoolId?: string }} input
   */
  async resetPasswordWithTicket({ ticket, username, newPassword, schoolId }) {
    let payload;
    try {
      payload = jwt.verify(String(ticket || ''), config.jwtSecret);
    } catch {
      throw new UnauthorizedError('Recovery ticket is invalid or expired');
    }
    if (payload.type !== 'recovery' || !payload.schoolId) {
      throw new UnauthorizedError('Recovery ticket is invalid or expired');
    }
    // The ticket is bound to one school — never reset a user of another tenant.
    const targetSchoolId = payload.schoolId;

    if (!username || typeof username !== 'string' || !newPassword || newPassword.length < 6) {
      throw new ValidationError({
        ...(username ? {} : { username: ['Username is required'] }),
        ...(newPassword && newPassword.length < 6 ? { newPassword: ['Minimum 6 characters'] } : {}),
      });
    }

    const { data: users } = await this.#repo.getAll('users', {
      filters: { school_id: targetSchoolId, username: String(username).trim() },
    });
    const user = users[0];
    if (!user) {
      securityLog('recovery_reset_failure', { schoolId: targetSchoolId, username, reason: 'unknown_user' });
      throw new UnauthorizedError('Invalid username or password reset failed');
    }
    // Only admins can be recovered through the dashboard recovery flow — a
    // recovery code that unlocks student accounts would be an escalation path.
    if (![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
      securityLog('recovery_reset_failure', { schoolId: targetSchoolId, userId: user.id, reason: 'not_admin' });
      throw new ForbiddenError('Recovery can only reset administrator accounts');
    }

    const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await this.#repo.update('users', user.id, { password_hash: passwordHash });

    // Revoke every refresh token — the account is assumed compromised.
    const { data: tokens } = await this.#repo.getAll('refresh_tokens', {
      filters: { user_id: user.id, revoked: false },
    });
    for (const t of tokens) {
      await this.#repo.update('refresh_tokens', t.id, { revoked: true });
    }

    securityLog('recovery_reset_success', { schoolId: targetSchoolId, userId: user.id });
    logger.info({ userId: user.id, schoolId: targetSchoolId }, 'Password reset via recovery code');
    return { username: user.username, schoolId: targetSchoolId };
  }

  async #getSystemSetting(schoolId, key) {
    const { data: rows } = await this.#repo.getAll('settings', {
      filters: { school_id: schoolId, key },
      limit: 1,
    });
    return rows[0]?.value || null;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  #signAccess(user, extra = {}) {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        school_id: user.school_id,
        class_id: user.class_id ?? null,
        name: user.name ?? null,
        numero: user.numero ?? null,
        // Session id: the refresh-token row minted with this access token.
        // Lets /auth/session tell whether a newer login superseded us.
        ...(extra.sid ? { sid: extra.sid } : {}),
      },
      config.jwtSecret,
      { expiresIn: config.jwtAccessExpires }
    );
  }

  async #issueRefresh(userId, { ip, userAgent }) {
    const raw = generateRefreshToken();
    const expiresAt = new Date(Date.now() + durationToSeconds(config.jwtRefreshExpires) * 1000);

    const created = await this.#repo.create('refresh_tokens', {
      user_id: userId,
      token_hash: hashToken(raw),
      expires_at: expiresAt.toISOString(),
      revoked: false,
      user_agent: userAgent || null,
      ip_address: ip || null,
    });
    return { raw, id: created?.id ?? null };
  }

  #stripSensitive(user) {
    const { password_hash, ...safe } = user;
    return safe;
  }
}
