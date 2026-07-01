import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

// Use a singleton instance to avoid exhausting connections in dev
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'info' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

prisma.$on('query', (e) => {
  logger.debug(`Query: ${e.query} - Duration: ${e.duration}ms`);
});
prisma.$on('error', (e) => {
  logger.error(`Prisma Error: ${e.message}`);
});
