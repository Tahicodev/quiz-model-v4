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

// SaaS is the only supported runtime mode.
const MODE = 'saas';
const jwtSecret = requireEnv(
  'JWT_SECRET',
  'JWT_SECRET is required. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
);

// Enforce a strong signing secret — SaaS traffic is multi-tenant, so a weak
// secret is a cross-tenant forgery risk.
if (jwtSecret.length < 64) {
  throw new Error('JWT_SECRET must be at least 64 characters.');
}

export const config = Object.freeze({
  // ── Mode ──────────────────────────────────────────────────────────────────
  // Retained as a frozen constant so existing log lines / health checks keep a
  // stable shape. The application no longer branches on this value.
  mode: MODE,
  isSaaS: true,
  isLocal: false,

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
  // Optional Redis adapter for multi-instance deployments.
  redisUrl: process.env.REDIS_URL || null,

  // ── Logging ───────────────────────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || 'info',
});
