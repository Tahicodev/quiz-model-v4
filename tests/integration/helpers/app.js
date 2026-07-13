/**
 * tests/integration/helpers/app.js
 *
 * Builds a test-optimized Express app using the same routes from server.js
 * but with rate limiting disabled (so tests don't hit 300 req/min limits)
 * and without starting any server or socket.io bootstrap.
 *
 * Import this in integration tests instead of `../../src/backend/server.js`
 * which starts listening as a side effect.
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from '../../../src/backend/config.js';
import { errorHandler } from '../../../src/backend/middleware/error.js';

// Routes (same as server.js)
import authRoutes from '../../../src/backend/routes/auth.routes.js';
import usersRoutes from '../../../src/backend/routes/users.routes.js';
import classesRoutes from '../../../src/backend/routes/classes.routes.js';
import categoriesRoutes from '../../../src/backend/routes/categories.routes.js';
import questionsRoutes from '../../../src/backend/routes/questions.routes.js';
import examsRoutes from '../../../src/backend/routes/exams.routes.js';
import resultsRoutes from '../../../src/backend/routes/results.routes.js';
import gamesRoutes from '../../../src/backend/routes/games.routes.js';
import tournamentsRoutes from '../../../src/backend/routes/tournaments.routes.js';
import sessionsRoutes from '../../../src/backend/routes/sessions.routes.js';
import settingsRoutes from '../../../src/backend/routes/settings.routes.js';
import migrateRoutes from '../../../src/backend/routes/migrate.routes.js';

// Container (needed for route handlers)
import { createContainer } from '../../../src/backend/container.js';

// Ensure container is initialized
const container = createContainer();

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: config.mode });
});

// ── API Routes (identical mounts to server.js) ────────────────────────────────
app.use('/api/v1/auth',        authRoutes);
app.use('/api/v1/users',       usersRoutes);
app.use('/api/v1/classes',     classesRoutes);
app.use('/api/v1/categories',  categoriesRoutes);
app.use('/api/v1/questions',   questionsRoutes);
app.use('/api/v1/exams',       examsRoutes);
app.use('/api/v1/results',     resultsRoutes);
app.use('/api/v1/games',       gamesRoutes);
app.use('/api/v1/tournaments', tournamentsRoutes);
app.use('/api/v1/sessions',    sessionsRoutes);
app.use('/api/v1/settings',    settingsRoutes);
app.use('/api/v1/migrate',     migrateRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
