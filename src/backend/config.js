/**
 * src/backend/config.js
 *
 * Centralized, validated configuration. All env vars are read here — never read
 * process.env directly elsewhere in the backend. Missing required vars throw at
 * startup so the server never boots in a half-configured state.
 */

import dotenv from 'dotenv';
import { DEPLOYMENT_MODES } from '../shared/constants.js';

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

/**
 * Resolve the deployment mode.
 *
 * Precedence (first match wins):
 *   1. DEPLOYMENT_MODE — 'offline' | 'saas' ('local' is accepted as an
 *      alias of 'offline' so the older APP_MODE spelling keeps working).
 *   2. APP_MODE        — the historical key, same values.
 *   3. DB_PROVIDER     — 'postgresql' implies saas, 'sqlite' implies offline.
 *   4. default         — 'saas', the behaviour the application has always
 *      had when nothing was configured.
 *
 * An unrecognised value is a startup error: silently guessing the topology
 * of a deployment is how the wrong thing ends up exposed.
 */
function resolveDeploymentMode() {
  const raw = String(process.env.DEPLOYMENT_MODE || process.env.APP_MODE || '')
    .trim()
    .toLowerCase();

  if (raw) {
    if (raw === DEPLOYMENT_MODES.OFFLINE || raw === 'local') {
      return DEPLOYMENT_MODES.OFFLINE;
    }
    if (raw === DEPLOYMENT_MODES.SAAS) {
      return DEPLOYMENT_MODES.SAAS;
    }
    throw new Error(
      `Unknown deployment mode "${raw}". Use DEPLOYMENT_MODE=offline or DEPLOYMENT_MODE=saas.`,
    );
  }

  const provider = String(process.env.DB_PROVIDER || '').trim().toLowerCase();
  if (provider === 'postgresql' || provider === 'postgres' || provider === 'pg') {
    return DEPLOYMENT_MODES.SAAS;
  }
  if (provider === 'sqlite') {
    return DEPLOYMENT_MODES.OFFLINE;
  }
  return DEPLOYMENT_MODES.SAAS;
}

const DEPLOYMENT_MODE = resolveDeploymentMode();

// The database provider is NOT selected by an env var at runtime — Prisma
// bakes the provider into the generated client and the migration history is
// written for one provider. This check turns a cryptic Prisma error at the
// first query into a clear message at boot.
const DB_PROVIDER = String(process.env.DB_PROVIDER || 'sqlite').trim().toLowerCase();
if (DB_PROVIDER !== 'sqlite' && DB_PROVIDER !== 'postgresql') {
  throw new Error(
    `Unknown DB_PROVIDER "${DB_PROVIDER}". Supported: sqlite, postgresql.`,
  );
}
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
  // ── Deployment mode ──────────────────────────────────────────────────────
  /**
   * WHERE this installation runs. It is a topology, never a privilege:
   * `isOffline` removes no permission and `isSaaS` grants none. It selects
   * the infrastructure that may be used and the way the administration
   * surface is labelled.
   */
  deploymentMode: DEPLOYMENT_MODE,
  isOffline: DEPLOYMENT_MODE === DEPLOYMENT_MODES.OFFLINE,
  isSaaS: DEPLOYMENT_MODE === DEPLOYMENT_MODES.SAAS,

  /**
   * The legacy contract consumed by the front end (APP_CONFIG.mode). Kept so
   * the existing pages keep working: 'local' for an offline installation,
   * 'saas' for a cloud deployment.
   */
  mode: DEPLOYMENT_MODE === DEPLOYMENT_MODES.SAAS ? 'saas' : 'local',
  isLocal: DEPLOYMENT_MODE === DEPLOYMENT_MODES.OFFLINE,

  // ── Database ──────────────────────────────────────────────────────────────
  /** The provider the generated Prisma client was built for. */
  dbProvider: DB_PROVIDER,
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

  /**
   * Whether the refresh cookie may carry the `Secure` attribute.
   *
   * The attribute means "only ever send this over HTTPS". Setting it while
   * the server speaks plain HTTP makes the browser DROP the cookie — which
   * silently breaks every session on a school LAN that runs without TLS.
   *
   * So it follows the actual transport:
   *   - TLS enabled on this server            → secure
   *   - a reverse proxy terminates TLS          → set COOKIE_SECURE=true
   *   - plain HTTP on a LAN                    → not secure
   */
  cookieSecure:
    /^(1|true|yes)$/i.test(process.env.TLS_ENABLED || '') ||
    /^(1|true|yes)$/i.test(process.env.COOKIE_SECURE || ''),

  // ── TLS (optional HTTPS) ──────────────────────────────────────────────────
  // Enable with TLS_ENABLED=1 and certs generated by:
  //   node scripts/gen-https-certs.mjs   (uses bundled mkcert)
  tlsEnabled: /^(1|true|yes)$/i.test(process.env.TLS_ENABLED || ''),
  tlsCertPath: process.env.TLS_CERT_PATH || 'certs/server.crt',
  tlsKeyPath: process.env.TLS_KEY_PATH || 'certs/server.key',

  // ── Storage (user-uploaded images) ────────────────────────────────────────
  // Directory inside the app that holds uploaded option/media images. Served
  // at /uploads and shipped with the offline package so images survive the
  // LAN install (DB stores only relative URLs).
  uploadsDir: process.env.UPLOADS_DIR || 'uploads',

  // ── Exam document generator ───────────────────────────────────────────────
  // Optional path to a Unicode TTF embedded in generated PDFs. pdfkit's built-in
  // standard fonts are WinAnsi (all French accents, but no Arabic/CJK/math
  // glyphs) and transliterate anything outside it, reporting the substitution.
  // Teachers write in non-Latin scripts: point this at a font file they own.
  examDocFontTtf: process.env.EXAM_DOC_FONT_TTF || null,

  // ── Realtime ──────────────────────────────────────────────────────────────
  // Optional Redis adapter for multi-instance deployments.
  redisUrl: process.env.REDIS_URL || null,

  // ── Logging ───────────────────────────────────────────────────────────────
  logLevel: process.env.LOG_LEVEL || 'info',
});
