/**
 * src/backend/realtime/socket.auth.js
 *
 * Socket.io handshake middleware — verifies authentication on every socket
 * connection BEFORE any event handler is allowed to fire.
 *
 * Auth strategies (tried in order):
 *   1. JWT — standard token from socket.io-client `auth: { token }`
 *   2. Admin secret — legacy admin panels pass `auth: { adminSecret }`
 *
 * Anonymous / unsigned tokens are never accepted: SaaS traffic is multi-tenant
 * and a forged identity would let a client see another school's rooms.
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
 * Accepts connections only via JWT or the admin pairing secret.
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
	// School scope comes from the handshake payload if provided; otherwise the
	// connection is limited to the default tenant used for the admin console.
	if (adminSecret && _adminSecret && adminSecret === _adminSecret) {
		socket.data.user = {
			id: 'admin-secret-auth',
			username: 'admin',
			role: 'admin',
			school_id: socket.handshake.auth?.school_id || socket.handshake.query?.school_id || null,
		};
		return next();
	}

	// ── All strategies exhausted — reject ────────────────────────────────────
	next(new Error('UNAUTHORIZED: No valid token or admin secret provided'));
}
