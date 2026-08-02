/**
 * tests/integration/helpers/testDb.js
 *
 * Shared helper for integration tests that need a real database.
 * Bootstraps an isolated SQLite test DB (prisma/test.db, gitignored),
 * applies migrations, and seeds a minimal school + admin user for auth flows.
 *
 * Usage:
 *   import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
 *
 *   beforeAll(async () => {
 *     const { prisma } = await setupTestDb();
 *     // use prisma in tests
 *   });
 *   afterAll(async () => {
 *     await teardownTestDb();
 *   });
 */

import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcrypt';

import crypto from 'node:crypto';

const ROOT = process.cwd();
const DB_TOKEN = crypto.randomBytes(4).toString('hex'); // unique per setup call
const TEST_DB_PATH = path.join(ROOT, 'prisma', `test-${DB_TOKEN}.db`);
const TEST_DB_URL  = `file:${TEST_DB_PATH.replace(/\\/g, '/')}`;
const SCHEMA_PATH  = path.join(ROOT, 'prisma', 'schema.prisma');
const PRISMA_BIN   = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');

/** @type {import('@prisma/client').PrismaClient|null} */
let prisma = null;

/**
 * Bring up the test DB. Call in `beforeAll`.
 * @returns {Promise<{ prisma: import('@prisma/client').PrismaClient }>}
 */
export async function setupTestDb() {
  process.env.DATABASE_URL = TEST_DB_URL;

  // Prisma's SQLite migrate engine does not create a missing absolute-path
  // database file on this platform. Create the empty file first so the
  // migration runner can initialize it normally.
  writeFileSync(TEST_DB_PATH, '');

  // Apply migrations to the fresh test DB
  execFileSync(process.execPath, [PRISMA_BIN, 'migrate', 'deploy', '--schema', SCHEMA_PATH], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });

  prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

  // Seed a minimal school + admin user for auth flows
  await prisma.school.upsert({
    where: { id: 'school-test' },
    update: { name: 'Test School', slug: 'test-school' },
    create: { id: 'school-test', name: 'Test School', slug: 'test-school' },
  });

  const passwordHash = await bcrypt.hash('admin123', 4);
  // Fix bcrypt prefix (node 24 uses $2b$, Prisma expects $2b$ fine on sqlite)
  await prisma.user.upsert({
    where: { id: 'user-test-admin' },
    update: { name: 'Admin', username: 'admin', password_hash: passwordHash, role: 'admin', school_id: 'school-test' },
    create: { id: 'user-test-admin', name: 'Admin', username: 'admin', password_hash: passwordHash, role: 'admin', school_id: 'school-test', status: 'active' },
  });

  return { prisma };
}

/**
 * Tear down the test DB. Call in `afterAll`.
 */
export async function teardownTestDb() {
  if (prisma) await prisma.$disconnect();
  for (const p of [TEST_DB_PATH, `${TEST_DB_PATH}-journal`]) {
    try { rmSync(p); } catch { /* already gone */ }
  }
}

export { TEST_DB_URL, TEST_DB_PATH };
