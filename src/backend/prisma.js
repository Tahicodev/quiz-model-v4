/**
 * src/backend/prisma.js
 *
 * Prisma client singleton. Reuses a single instance across the app (and across
 * HMR / --watch restarts) to avoid exhausting DB connections in development.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

prisma.$on('error', (e) => {
  logger.error({ err: e }, 'Prisma error');
});
