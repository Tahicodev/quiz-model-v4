/**
 * src/backend/prisma.js
 *
 * Prisma client singleton. Reuses a single instance across the app (and across
 * HMR / --watch restarts) to avoid exhausting DB connections in development.
 */

import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

const globalForPrisma = globalThis;

/**
 * Build the PrismaClient. Always uses the current DATABASE_URL, regardless of
 * whether a cached instance exists with a different URL. This ensures tests
 * that change DATABASE_URL before importing this module get a fresh client
 * pointing at the correct DB, while production still reuses the singleton
 * (since DATABASE_URL never changes once the process starts).
 */
function createClient() {
  return new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });
}

// In test mode we always create a fresh client (the env URL may differ per
// test file). In non-test mode we cache globally for HMR / --watch.
export const prisma =
  process.env.NODE_ENV === 'test'
    ? createClient()
    : globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  globalForPrisma.prisma = prisma;
}

prisma.$on('error', (e) => {
  logger.error({ err: e }, 'Prisma error');
});
