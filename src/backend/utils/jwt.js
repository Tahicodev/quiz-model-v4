/**
 * src/backend/utils/jwt.js
 *
 * Standalone JWT signing helper. AuthService owns the full login flow
 * (access + refresh rotation), but tests and scripts sometimes need to mint
 * a token for an existing user without going through login. This util signs
 * the same payload shape requireAuth expects: { id, username, role,
 * school_id, iat, exp }.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Sign an access token for the given user payload.
 * @param {{ id: string, username?: string, role: string, school_id: string,
 *           class_id?: string|null, name?: string|null, numero?: string|null }} user
 * @returns {string} signed JWT (access-token expiry from config)
 */
export function signJwt(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username ?? null,
      role: user.role,
      school_id: user.school_id,
      class_id: user.class_id ?? null,
      name: user.name ?? null,
      numero: user.numero ?? null,
    },
    config.jwtSecret,
    { expiresIn: config.jwtAccessExpires },
  );
}

/**
 * Verify a token (same rules as requireAuth) and return its payload.
 * Returns null for invalid/expired tokens instead of throwing, so callers
 * can treat a bad token as "no session" rather than an exception.
 * @param {string} token
 * @returns {object|null}
 */
export function verifyJwt(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (_) {
    return null;
  }
}
