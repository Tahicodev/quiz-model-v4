/**
 * src/backend/realtime/socket.auth.js
 *
 * Socket.io handshake middleware — verifies the JWT on every socket connection
 * BEFORE any event handler is allowed to fire. This enforces the spec's
 * "JWT on every socket" non-negotiable rule (Section 11).
 *
 * Token sources (in priority order):
 *   1. socket.handshake.auth.token   — set by socket.io-client `auth: { token }`
 *   2. socket.handshake.query.token  — fallback for clients that can't set headers
 *
 * On failure we reject the handshake with `new Error('UNAUTHORIZED: ...')`
 * so the client's `connect_error` handler fires — we never call `next()` with
 * an unauthenticated socket.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    return next(new Error('UNAUTHORIZED: No token provided'));
  }

  try {
    // Payload shape: { id, username, role, school_id, iat, exp }
    const payload = jwt.verify(token, config.jwtSecret);
    socket.data.user = payload;
    next();
  } catch {
    next(new Error('UNAUTHORIZED: Invalid or expired token'));
  }
}
