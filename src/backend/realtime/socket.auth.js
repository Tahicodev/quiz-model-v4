/**
 * src/backend/realtime/socket.auth.js
 *
 * Socket.io handshake middleware — verifies authentication on every socket
 * connection BEFORE any event handler is allowed to fire.
 *
 * Auth strategies (tried in order):
 *   1. JWT — standard token from socket.io-client `auth: { token }`
 *   2. Admin secret — legacy admin panels pass `auth: { adminSecret }`
 *   3. Local mode — no-auth fallback (same behaviour as the old server.js)
 *
 * In local mode any connection is accepted at the handshake level; the
 * `identify` event handler enforces the admin secret for privileged
 * operations. In SaaS mode the JWT is mandatory.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/** @type {string|null} */
let _adminSecret = null;

/**
 * Set the admin secret used for legacy admin panel authentication.
 * Called once at server startup.
 * @param {string|null} secret
 */
export function setAdminSecret(secret) {
  _adminSecret = secret;
}

/**
 * Socket.io handshake middleware.
 * Accepts connections via JWT, admin secret, or (local mode only) no auth.
 */
export function socketAuthMiddleware(socket, next) {
  const token       = socket.handshake.auth?.token || socket.handshake.query?.token;
  const adminSecret = socket.handshake.auth?.adminSecret || socket.handshake.query?.adminSecret;

  // ── Strategy 1: JWT ──────────────────────────────────────────────────────
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      socket.data.user = payload;
      return next();
    } catch {
      // JWT invalid/expired — fall through to next strategy
    }
  }

  // ── Strategy 2: Admin secret (legacy admin panels) ───────────────────────
  if (adminSecret && _adminSecret && adminSecret === _adminSecret) {
    socket.data.user = {
      id: 'admin-secret-auth',
      username: 'admin',
      role: 'admin',
      school_id: config.defaultSchoolId || 'local',
    };
    return next();
  }

  // ── Strategy 3: Local mode — no-auth fallback ────────────────────────────
  // The old server.js accepted all connections; the identify event handler
  // enforced the admin secret for admin-level operations. Match that behaviour
  // so legacy admin/student pages can connect without a real JWT.
  if (config.isLocal) {
    socket.data.user = {
      id: 'anonymous',
      username: 'anonymous',
      role: 'client',
      school_id: config.defaultSchoolId || 'local',
    };
    return next();
  }

  // ── All strategies exhausted — reject ────────────────────────────────────
  next(new Error('UNAUTHORIZED: No valid token or admin secret provided'));
}
