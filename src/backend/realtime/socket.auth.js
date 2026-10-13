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
import { getContainer } from '../container.js';

/**
 * Socket.io handshake middleware.
 * Accepts connections only via a valid JWT.
 *
 * If the client also presents `auth.deviceId` and that device is blocked for
 * the school, the handshake is refused outright (hard block) — the register
 * handler enforces the same rule for clients that only send the id later.
 */
export async function socketAuthMiddleware(socket, next) {
	const token = socket.handshake.auth?.token || socket.handshake.query?.token;

	// ── JWT ──────────────────────────────────────────────────────────────────
	if (token) {
		try {
			const payload = jwt.verify(token, config.jwtSecret);
			socket.data.user = payload;

			const deviceId = String(socket.handshake.auth?.deviceId || '').trim();
			if (deviceId && payload?.school_id) {
				try {
					const { deviceSvc } = getContainer();
					if (await deviceSvc.isBlocked(payload.school_id, deviceId)) {
						return next(
							new Error('DEVICE_BLOCKED: This device has been blocked by a teacher.'),
						);
					}
				} catch {
					// DB/container unavailable — fall back to the register-time check.
				}
			}

			return next();
		} catch {
			// fall through to the reject below
		}
	}

	// ── No valid token — reject ───────────────────────────────────────────────
	next(new Error('UNAUTHORIZED: No valid token provided'));
}
