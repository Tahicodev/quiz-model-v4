import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { logger } from './logger.js';
import { errorHandler } from './middleware/error.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Mount Routes here (to be added)
// import authRoutes from './routes/auth.js';
// app.use('/api/v1/auth', authRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Backend server running in ${config.nodeEnv} mode on port ${config.port}`);
});

export default app;
