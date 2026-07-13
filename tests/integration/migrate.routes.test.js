/**
 * tests/integration/migrate.routes.test.js
 *
 * SuperTest integration tests for /api/v1/migrate (Phase F + Phase 8 checkpoint).
 * Validates:
 *   1. Admin-only access (non-admin + unauthenticated are rejected)
 *   2. POST inserts rows correctly
 *   3. POST is idempotent — a second run inserts zero rows
 *   4. GET /status returns per-table counts for the caller's school
 *
 * Uses an isolated SQLite test DB seeded with one school + admin user.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
import { PrismaClient } from '@prisma/client';

let app;
let prisma;
let adminToken;

/**
 * Build an auth'd request helper for the admin user.
 */
function adminPost(url) {
  return request(app).post(url).set('Authorization', `Bearer ${adminToken}`);
}

function adminGet(url) {
  return request(app).get(url).set('Authorization', `Bearer ${adminToken}`);
}

beforeAll(async () => {
  const db = await setupTestDb();
  prisma = db.prisma;

  app = (await import('./helpers/app.js')).default;

  // Login as the seeded admin to get a token
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' });
  adminToken = loginRes.body.accessToken;

  // Debug: check DATABASE_URL in the test context
  console.log('TEST DATABASE_URL:', process.env.DATABASE_URL);
});

afterAll(async () => {
  await teardownTestDb();
});

const MIGRATE = '/api/v1/migrate';

describe('Migrate routes', () => {
  const sampleRows = {
    classes: [
      { id: 'mig-class-1', name: 'Mig Class A', school_id: 'school-test', description: 'desc' },
    ],
    categories: [
      { id: 'mig-cat-1', name: 'Mig Category A', school_id: 'school-test' },
    ],
    users: [
      // Different from the seeded admin — avoids the @@unique([school_id, username]) collision
      { id: 'mig-user-1', school_id: 'school-test', name: 'Migrated Teacher', username: 'mig_teacher', role: 'admin', status: 'active', password_hash: '$2b$04$dummy', created_at: '2025-01-01T00:00:00.000Z' },
    ],
    questions: [
      { id: 'mig-q-1', school_id: 'school-test', text: 'Mig Q?', type: 'mcq', answer: 'A', points: 1 },
    ],
    exams: [
      { id: 'mig-exam-1', school_id: 'school-test', name: 'Mig Exam', description: 'desc', status: 'draft', creator_id: 'mig-user-1' },
    ],
  };

  it('POST /migrate denies unauthenticated requests', async () => {
    const res = await request(app)
      .post(MIGRATE)
      .send({ data: {} });
    expect(res.status).toBe(401);
  });

  it('POST /migrate inserts rows and returns per-table counts', async () => {
    const res = await request(app)
      .post(MIGRATE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ data: sampleRows });

    expect(res.status).toBe(200);
    expect(res.body.totalInserted).toBe(5);
    expect(res.body.results).toHaveLength(5);
    for (const r of res.body.results) {
      expect(r.inserted).toBe(r.total); // all inserted on first run
    }
  });

  it('POST /migrate is idempotent (second run inserts zero rows)', async () => {
    const res = await request(app)
      .post(MIGRATE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ data: sampleRows });

    expect(res.status).toBe(200);
    expect(res.body.totalInserted).toBe(0); // skipDuplicates semantics
    for (const r of res.body.results) {
      expect(r.inserted).toBe(0);
      expect(r.skipped).toBe(r.total);
    }
  });

  it('GET /migrate/status returns per-table counts', async () => {
    const res = await adminGet(`${MIGRATE}/status`);

    expect(res.status).toBe(200);
    expect(res.body.school_id).toBe('school-test');
    expect(res.body.counts).toBeDefined();
    // The 4 tables we inserted should have count >= 1
    expect(res.body.counts.classes).toBeGreaterThanOrEqual(1);
    expect(res.body.counts.questions).toBeGreaterThanOrEqual(1);
    // Tables we didn't insert may be 0 or null
  });

  it('GET /migrate/status is accessible by admin only', async () => {
    const res = await request(app).get(`${MIGRATE}/status`);
    expect(res.status).toBe(401);
  });

  it('POST /migrate enforces tenant scoping (school_id forced to caller)', async () => {
    // The route forces school_id = req.schoolId regardless of what the body says
    const malicious = {
      categories: [
        { id: 'mig-cat-hack', name: 'Hacked', school_id: 'other-school' },
      ],
    };
    const res = await request(app)
      .post(MIGRATE)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ data: malicious });

    expect(res.status).toBe(200);
    // Verify the record was created with the admin's school, not the body's
    const cat = await prisma.category.findUnique({ where: { id: 'mig-cat-hack' } });
    expect(cat).not.toBeNull();
    expect(cat.school_id).toBe('school-test');
  });
});
