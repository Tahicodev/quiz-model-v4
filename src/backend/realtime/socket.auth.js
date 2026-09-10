/**
 * src/backend/realtime/socket.auth.js
 *
 * Socket.io handshake middleware — verifies authentication on every socket
 * connection BEFORE any event handler is allowed to fire.
 *
 * Auth strategy: JWT — standard token from socket.io-client `auth: { token }`.
 * Staff roles (admin/teacher/super_admin) are granted the legacy admin relay
 * surface by legacy-sync.bridge.js; students get the client surface.
 *
 * Anonymous / unsigned tokens are never accepted: SaaS traffic is multi-tenant
 * and a forged identity would let a client see another school's rooms.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Socket.io handshake middleware.
 * Accepts connections only via a valid JWT.
 */
export function socketAuthMiddleware(socket, next) {
	const token = socket.handshake.auth?.token || socket.handshake.query?.token;

	// ── JWT ──────────────────────────────────────────────────────────────────
	if (token) {
		try {
			const payload = jwt.verify(token, config.jwtSecret);
			socket.data.user = payload;
			return next();
		} catch {
			// fall through to the reject below
		}
	}

	// ── No valid token — reject ───────────────────────────────────────────────
	next(new Error('UNAUTHORIZED: No valid token provided'));
}
