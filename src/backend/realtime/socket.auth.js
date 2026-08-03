/**
 * src/backend/realtime/socket.auth.js
 *
 * Socket.io handshake middleware — verifies authentication on every socket
 * connection BEFORE any event handler is allowed to fire.
 *
 * Auth strategies (tried in order):
 *   1. JWT — standard token from socket.io-client `auth: { token }`
 *   2. Admin secret — legacy admin panels pass `auth: { adminSecret }`
 *   3. Local-mode compatibility token — legacy local UI stores a lightweight
 *      base64-encoded user payload as its session token. Accept it only if it
 *      decodes to a valid user-shaped object; never accept an anonymous socket.
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
 * Accepts connections only via JWT, admin secret, or a validated local-mode
 * compatibility token. Any anonymous fallback is explicitly forbidden.
 */
export function socketAuthMiddleware(socket, next) {
	const token = socket.handshake.auth?.token || socket.handshake.query?.token;
	const adminSecret =
		socket.handshake.auth?.adminSecret || socket.handshake.query?.adminSecret;

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

	// ── Strategy 3: Local-mode compatibility token ───────────────────────────
	// Legacy local UI stores a lightweight base64-encoded user payload in the
	// session token. Accept that shape only in local mode, do not invent an
	// anonymous identity for every socket.
	if (config.isLocal && token) {
		try {
			const raw = Buffer.from(token, 'base64').toString('utf8');
			const payload = JSON.parse(raw);
			if (payload?.id && payload?.username && payload?.role) {
				socket.data.user = {
					id: payload.id,
					username: payload.username,
					role: payload.role,
					school_id: payload.school_id ?? (config.defaultSchoolId || 'local'),
				};
				return next();
			}
		} catch {
			// Malformed local compatibility token — reject below.
		}
	}

	// ── All strategies exhausted — reject ────────────────────────────────────
	next(new Error('UNAUTHORIZED: No valid token or admin secret provided'));
}
