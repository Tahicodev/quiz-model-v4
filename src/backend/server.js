import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler } from './middleware/error.js';

const app = express();

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
    },
  },
}));

app.use(cors({ origin: config.corsOrigin, credentials: true }));
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

// ── Rate limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMITED', message: 'Too many requests' },
});
app.use('/api/', apiLimiter);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: config.mode });
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

app.use('/api/v1/auth', authRoutes);
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

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found' });
});

// ── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ── Cleanup Jobs ─────────────────────────────────────────────────────────────
import { prisma } from './prisma.js';
import { createContainer } from './container.js';

// Initialize container to instantiate services
createContainer();
const { sessionSvc } = createContainer();

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

// ── Server startup ───────────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  logger.info({ port: config.port, mode: config.mode }, 'Backend server started');
});

// ── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');
  await prisma.$disconnect();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
