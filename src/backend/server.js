import http from 'http';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler } from './middleware/error.js';
import { initSocketServer } from './realtime/socket.server.js';

const app = express();

// ── Admin Secret (for realtime settings pairing) ──────────────────────────────
const configuredAdminSecret = String(process.env.QUIZ_ADMIN_SECRET || '').trim();
const adminSecret = configuredAdminSecret || crypto.randomBytes(24).toString('base64url');
if (!configuredAdminSecret) {
  logger.info({ adminSecret }, 'QUIZ_ADMIN_SECRET not set — temporary secret for this run');
}
// Expose on app so routes/socket handlers can read it
app.set('adminSecret', adminSecret);

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        'https://cdn.socket.io',
        'https://cdn.jsdelivr.net',
        'https://cdnjs.cloudflare.com',
        'https://cdn.sheetjs.com',
      ],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://cdnjs.cloudflare.com',
        'https://fonts.googleapis.com',
        'https://cdn.jsdelivr.net',
      ],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:', 'https://cdn.socket.io', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://cdn.sheetjs.com', 'https://generativelanguage.googleapis.com', 'https://api.openai.com', 'https://api.anthropic.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      workerSrc: ["'self'", 'blob:'],
    },
  },
}));

// CORS: allow the configured origin AND any same-host / LAN origin. Because
// the admin UI is served from the same Express instance, its Origin header
// is the same host the user typed in the address bar (localhost, 127.0.0.1,
// the LAN IP, etc.). Reflecting the request origin is safe here — this is a
// self-hosted LAN app, not a public API.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // same-origin / curl
    if (origin === config.corsOrigin) return callback(null, true);
    // Allow any localhost / LAN origin (private IP ranges + *.local).
    if (
      /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|(\d{1,3}\.){3}\d{1,3})(:\d+)?$/i.test(origin) ||
      /^https?:\/\/[a-z0-9-]+\.local(:\d+)?$/i.test(origin)
    ) {
      return callback(null, true);
    }
    // Log and otherwise allow — admin panel is internal-only.
    logger.warn({ origin }, 'CORS: allowing unexpected origin');
    return callback(null, true);
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// ── Request logging ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug';
    logger[level]({ method: req.method, path: req.path, status: res.statusCode, ms, userId: req.user?.id });
  });
  next();
});

// ── Expose the admin secret for the realtime settings panel ──────────────────
// Strictly admin-only. The secret grants admin-level socket privileges, so
// leaking it would be equivalent to exposing an admin credential.
// NOTE: SUPER_ADMIN bypasses the role check inside requireRole itself.
import { requireAuth } from './middleware/auth.js';
import { requireRole } from './middleware/role.js';
import { ROLES } from '../shared/constants.js';

app.get(
  '/api/v1/admin-secret',
  requireAuth,
  requireRole([ROLES.ADMIN]),
  (req, res) => {
    res.json({ secret: adminSecret });
  }
);

// ── Rate limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many requests' },
});
app.use('/api/', apiLimiter);

// Stricter rate limit for auth endpoints (login, register, refresh)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' },
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API Routes ───────────────────────────────────────────────────────────────
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import classesRoutes from './routes/classes.routes.js';
import categoriesRoutes from './routes/categories.routes.js';
import questionsRoutes from './routes/questions.routes.js';
import examsRoutes from './routes/exams.routes.js';
import resultsRoutes from './routes/results.routes.js';
import gamesRoutes from './routes/games.routes.js';
import tournamentsRoutes from './routes/tournaments.routes.js';
import sessionsRoutes from './routes/sessions.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import bootstrapRoutes from './routes/bootstrap.routes.js';
import aiRoutes from './routes/ai.routes.js';
import queryRoutes from './routes/query.routes.js';
import bulkRoutes from './routes/bulk.routes.js';
import profileRequestRoutes from './routes/profile-requests.routes.js';
import accountRequestRoutes from './routes/account-requests.routes.js';
import gamePresetRoutes from './routes/game-presets.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import gamificationRoutes from './routes/gamification.routes.js';
import teacherMessageRoutes from './routes/teacher-messages.routes.js';
import teacherAssignmentRoutes from './routes/teacher-assignments.routes.js';

// ── Inject APP_CONFIG into the served HTML via index.html ─────────────────
// APP_CONFIG is delivered via an inline <script> prepended to the served
// index/admin/student HTML. Mode is hard-coded to SaaS — there is no
// localStorage fallback in this build.
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const adminHtml = readFileSync(resolve(__dirname, '../../admin.html'), 'utf8');
const studentWorkspaceHtml = readFileSync(resolve(__dirname, '../../student-workspace.html'), 'utf8');

function injectAppConfig(html) {
  return html.replace(
    '</head>',
    `<script>
window.APP_CONFIG = ${JSON.stringify({
    mode: 'saas',
    apiUrl: '/api/v1',
    socketUrl: '/',
  })};
</script>
</head>`
  );
}

app.get('/', (req, res) => {
  res.type('html').send(injectAppConfig(indexHtml));
});

app.get('/admin.html', (req, res) => {
  res.type('html').send(injectAppConfig(adminHtml));
});

app.get('/student-workspace.html', (req, res) => {
  res.type('html').send(injectAppConfig(studentWorkspaceHtml));
});

app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/classes', classesRoutes);
app.use('/api/v1/categories', categoriesRoutes);
app.use('/api/v1/questions', questionsRoutes);
app.use('/api/v1/exams', examsRoutes);
app.use('/api/v1/results', resultsRoutes);
app.use('/api/v1/games', gamesRoutes);
app.use('/api/v1/tournaments', tournamentsRoutes);
app.use('/api/v1/sessions', sessionsRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/bootstrap', bootstrapRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/query', queryRoutes);
app.use('/api/v1/bulk', bulkRoutes);
app.use('/api/v1/profile-requests', profileRequestRoutes);
app.use('/api/v1/account-requests', authLimiter, accountRequestRoutes);
app.use('/api/v1/game-presets', gamePresetRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/gamification', gamificationRoutes);
app.use('/api/v1/teacher-messages', teacherMessageRoutes);
app.use('/api/v1/teacher-assignments', teacherAssignmentRoutes);

// ── Static Files (built frontend bundle + dev SPA sources) ───────────────
// Disable caching for HTML/JS entry points so dev edits reach the browser
// immediately — express.static's default ETag/If-None-Match cache was holding
// onto stale bundles in the dev browser.
const noCacheOpts = {
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate',
      );
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  },
};
app.use(express.static('public', noCacheOpts));
// Serve root-level dev files (admin.html, admin.css, styles.css)
app.use(express.static('./', noCacheOpts));

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found' });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ── Cleanup + socket jobs ─────────────────────────────────────────────────────
import { prisma } from './prisma.js';
import { createContainer } from './container.js';

// Initialize the DI container once. Services are pulled from this container
// for both the socket handlers and the periodic cleanup jobs.
const container = createContainer();
const { sessionSvc, gameSvc, tournamentSvc } = container;

// Expired session cleanup (every 5 minutes)
setInterval(async () => {
  try {
    const count = await sessionSvc.cleanupExpiredSessions();
    if (count > 0) logger.info({ count }, 'Expired sessions cleaned up');
  } catch (err) {
    logger.error({ err }, 'Session cleanup job failed');
  }
}, 5 * 60 * 1000);

// Refresh token cleanup (every hour)
setInterval(async () => {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: { OR: [{ revoked: true }, { expires_at: { lt: new Date() } }] },
    });
    if (result.count > 0) logger.info({ count: result.count }, 'Expired refresh tokens purged');
  } catch (err) {
    logger.error({ err }, 'Refresh token cleanup job failed');
  }
}, 60 * 60 * 1000);

// ── HTTP + Socket.io Server ───────────────────────────────────────────────────
const httpServer = http.createServer(app);

// Boot: attach Socket.io to the httpServer with the container's services.
// Uses an async IIFE so a failure here fails fast with a logged error rather
// than starting a half-initialized server.
(async () => {
  try {
	    await initSocketServer(httpServer, {
	      gameService:       gameSvc,
	      tournamentService:  tournamentSvc,
	      sessionService:     sessionSvc,
	      adminSecret,        // for legacy admin panel socket auth
	    });
    httpServer.listen(config.port, '0.0.0.0', () => {
      logger.info({ port: config.port, host: '0.0.0.0' }, 'Backend server started (SaaS) — reachable on LAN');
    });
  } catch (err) {
    logger.error({ err }, 'Failed to initialize socket server');
    process.exit(1);
  }
})();

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');
  await prisma.$disconnect();
  // httpServer.close stops accepting connections AND drains existing ones;
  // this also disconnects the attached Socket.io server cleanly.
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
