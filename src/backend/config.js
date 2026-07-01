/**
 * src/backend/config.js
 *
 * Centralized, validated configuration. All env vars are read here — never read
 * process.env directly elsewhere in the backend. Missing required vars throw at
 * startup so the server never boots in a half-configured state.
 */

import dotenv from 'dotenv';

// Load .env in non-production environments.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * @param {string} key          Environment variable name
 * @param {string} [message]    Custom error message
 * @returns {string}
 */
function requireEnv(key, message) {
  const value = process.env[key];
  if (!value || !value.trim()) {
    throw new Error(message ?? `Missing required environment variable: ${key}`);
  }
  return value.trim();
}

/**
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
function parseIntOrDefault(key, fallback) {
  const raw = process.env[key];
  const parsed = raw != null ? parseInt(raw, 10) : fallback;
  return Number.isNaN(parsed) ? fallback : parsed;
}

const mode = (process.env.APP_MODE || 'local').toLowerCase();
const jwtSecret = requireEnv(
  'JWT_SECRET',
  'JWT_SECRET is required. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
);

// Enforce a strong secret in SaaS mode; warn (but allow) a short one in local mode.
if (mode === 'saas' && jwtSecret.length < 64) {
  throw new Error('JWT_SECRET must be at least 64 characters in SaaS mode.');
}

export const config = Object.freeze({
  // ── Mode ──────────────────────────────────────────────────────────────────
  mode, // 'local' | 'saas'
  isSaaS: mode === 'saas',
  isLocal: mode !== 'saas',

  // ── Database ──────────────────────────────────────────────────────────────
  // provider is informational (Prisma reads its own env); kept here for logging.
  dbProvider: (process.env.DB_PROVIDER || 'sqlite').toLowerCase(),
  databaseUrl: requireEnv('DATABASE_URL', 'DATABASE_URL is required.'),

  // ── Auth ──────────────────────────────────────────────────────────────────
  jwtSecret,
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  bcryptRounds: parseIntOrDefault('BCRYPT_ROUNDS', 12),

  // ── Server ────────────────────────────────────────────────────────────────
  port: parseIntOrDefault('PORT', 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // ── Realtime ──────────────────────────────────────────────────────────────
  // Redis adapter for SaaS multi-instance; null in local mode.
  redisUrl: process.env.REDIS_URL || null,

  // ── Logging ───────────────────────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || 'info',

  // ── Tenant ────────────────────────────────────────────────────────────────
  // The single school id used in local mode (seeding + queries).
  defaultSchoolId: process.env.DEFAULT_SCHOOL_ID || 'local',
});
