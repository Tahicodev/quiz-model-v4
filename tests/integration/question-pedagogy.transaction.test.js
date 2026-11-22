/**
 * tests/integration/question-pedagogy.transaction.test.js
 *
 * Defect A — atomic criteria replacement.
 *
 * `QuestionPedagogyService.setCriteria` / `clearCriteria` used to delete the
 * existing criteria and re-insert inside no transaction, so a failure mid-write
 * could leave a question with a partial (or empty) criteria set while its
 * cached pedagogy fields still described the old set. These tests prove the
 * replacement is now a single unit of work:
 *
 *   1. `PrismaRepository.runInTransaction` rolls REAL database writes back
 *      when the callback throws (genuine Prisma transaction, no mocks).
 *   2. A failed replacement preserves the original criteria (same identity)
 *      and leaves the derived Question fields untouched.
 *   3. A successful replacement behaves exactly as before.
 *   4. `clearCriteria` is atomic (success and failure).
 *   5. Complete deletion works past the old 200-row boundary.
 *   6. The service refuses a repository that cannot provide a transaction.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { setupTestDb, teardownTestDb } from './helpers/testDb.js';
import { PrismaRepository } from '../../src/backend/infrastructure/PrismaRepository.js';
import { QuestionPedagogyService } from '../../src/backend/services/learning/QuestionPedagogyService.js';
import { BLOOM_DIMENSIONS, toBloomRow } from '../../src/shared/learning/bloomCatalog.js';

const SCHOOL = 'school-test';
const ADMIN = 'user-test-admin';
const SUBJECT = 'pg-tx-subject';
const OBJECTIVE = 'pg-tx-objective';

const admin = { id: ADMIN, role: 'admin', school_id: SCHOOL };

let prisma;
let repo;
let svc;

/** A valid criterion for OBJECTIVE; override per test. */
const crit = (over = {}) => ({
  objective_id: OBJECTIVE,
  bloom_dimension_id: 'apply',
  criterion_key: 'main',
  weight: 1,
  ...over,
});

const countCriteria = (questionId) =>
  prisma.questionAssessmentCriterion.count({ where: { question_id: questionId } });

/**
 * A repository that delegates everything to a real `PrismaRepository` but lets a
 * test inject a failure INSIDE the transaction: `shouldFail(table, op, nth)`
 * is asked before the nth `create`/`update` on the transaction-bound repository
 * and, when it returns true, throws — which must roll the real transaction back.
 */
function failingRepo(real, shouldFail) {
  const passthrough = (r) => ({
    getAll: (table, options) => r.getAll(table, options),
    getById: (table, id) => r.getById(table, id),
    create: (table, data) => r.create(table, data),
    update: (table, id, data) => r.update(table, id, data),
    delete: (table, id) => r.delete(table, id),
    deleteMany: (table, where) => r.deleteMany(table, where),
  });

  return {
    ...passthrough(real),
    runInTransaction: (fn) =>
      real.runInTransaction((tx) => {
        const counts = new Map();
        const bump = (table, op) => {
          const key = `${table}:${op}`;
          const n = (counts.get(key) ?? 0) + 1;
          counts.set(key, n);
          return n;
        };
        const inner = {
          ...passthrough(tx),
          create: async (table, data) => {
            if (shouldFail(table, 'create', bump(table, 'create'))) {
              throw new Error('injected failure');
            }
            return tx.create(table, data);
          },
          update: async (table, id, data) => {
            if (shouldFail(table, 'update', bump(table, 'update'))) {
              throw new Error('injected failure');
            }
            return tx.update(table, id, data);
          },
        };
        return fn(inner);
      }),
  };
}

/** Direct, validator-free seeding so a question can hold >200 criteria. */
async function seedCriteria(questionId, n) {
  await prisma.questionAssessmentCriterion.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      school_id: SCHOOL,
      question_id: questionId,
      objective_id: OBJECTIVE,
      bloom_dimension_id: 'apply',
      criterion_key: `bulk-${i}`,
      weight: 1,
      source: 'manual',
      review_status: 'approved',
    })),
  });
}

beforeAll(async () => {
  ({ prisma } = await setupTestDb());

  // The Bloom catalog is seeded at boot in production; the test DB has the
  // table but no rows, so seed it here (same shape the service writes).
  await prisma.bloomDimension.createMany({
    data: BLOOM_DIMENSIONS.map(toBloomRow),
  });

  await prisma.subject.create({
    data: { id: SUBJECT, school_id: SCHOOL, created_by: ADMIN, name: 'PG TX Subject' },
  });
  await prisma.learningObjective.create({
    data: {
      id: OBJECTIVE,
      school_id: SCHOOL,
      subject_id: SUBJECT,
      code: 'PG-TX-1',
      statement: 'Transaction probe objective',
      status: 'active',
      created_by: ADMIN,
    },
  });

  const question = (id) =>
    prisma.question.create({
      data: {
        id,
        school_id: SCHOOL,
        type: 'mcq',
        text: `Question ${id}`,
        options_json: '["a","b"]',
        answer: 'a',
        created_by: ADMIN,
      },
    });
  for (const id of [
    'pg-q-replace',
    'pg-q-fail',
    'pg-q-clear-ok',
    'pg-q-clear-fail',
    'pg-q-many-clear',
    'pg-q-many-replace',
    'pg-q-refuse',
  ]) {
    await question(id);
  }

  repo = new PrismaRepository(prisma);
  svc = new QuestionPedagogyService(repo, { auditSvc: null });
});

afterAll(async () => {
  await teardownTestDb();
});

// ─── 1. Genuine Prisma rollback ─────────────────────────────────────────────

describe('PrismaRepository.runInTransaction (real database)', () => {
  it('rolls real writes back when the callback throws', async () => {
    const key = 'tx.rollback.probe';

    await expect(
      repo.runInTransaction(async (tx) => {
        await tx.create('settings', { school_id: SCHOOL, key, value: 'rolled' });
        // Visible inside the transaction…
        const inside = await tx.getAll('settings', { filters: { school_id: SCHOOL, key } });
        expect(inside.data).toHaveLength(1);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    // …and gone once it rolls back.
    expect(await prisma.setting.count({ where: { school_id: SCHOOL, key } })).toBe(0);
  });

  it('commits writes when the callback resolves', async () => {
    const key = 'tx.commit.probe';

    const result = await repo.runInTransaction(async (tx) => {
      await tx.create('settings', { school_id: SCHOOL, key, value: 'committed' });
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(await prisma.setting.count({ where: { school_id: SCHOOL, key } })).toBe(1);
  });
});

// ─── 2/3. setCriteria ───────────────────────────────────────────────────────

describe('QuestionPedagogyService.setCriteria — atomic replacement', () => {
  it('replaces the whole set and re-derives the caches (unchanged behaviour)', async () => {
    const res = await svc.setCriteria(admin, 'pg-q-replace', [
      crit({ bloom_dimension_id: 'apply', criterion_key: 'a', weight: 0.5 }),
      crit({ bloom_dimension_id: 'analyze', criterion_key: 'b', weight: 0.5 }),
    ]);

    expect(res.criteria).toHaveLength(2);
    expect(res.question.pedagogy_status).toBe('classified');
    // Tie on weight → lowest taxonomy order wins: apply (2) before analyze (3).
    expect(res.question.primary_bloom_dimension_id).toBe('apply');
    expect(await countCriteria('pg-q-replace')).toBe(2);

    // A second replacement fully swaps the set (no leftovers).
    const again = await svc.setCriteria(admin, 'pg-q-replace', [
      crit({ bloom_dimension_id: 'evaluate', criterion_key: 'only', weight: 1 }),
    ]);
    expect(again.criteria).toHaveLength(1);
    expect(again.question.primary_bloom_dimension_id).toBe('evaluate');
    expect(await countCriteria('pg-q-replace')).toBe(1);
  });

  it('preserves the original criteria and derived fields when a replacement fails', async () => {
    const base = await svc.setCriteria(admin, 'pg-q-fail', [
      crit({ bloom_dimension_id: 'evaluate', criterion_key: 'base', weight: 1 }),
    ]);
    expect(base.question.pedagogy_status).toBe('classified');
    expect(base.question.primary_bloom_dimension_id).toBe('evaluate');
    const baseRows = await prisma.questionAssessmentCriterion.findMany({
      where: { question_id: 'pg-q-fail' },
    });
    expect(baseRows).toHaveLength(1);

    // Fail on the SECOND insert, i.e. after the delete and the first insert.
    const failing = new QuestionPedagogyService(
      failingRepo(repo, (table, op, nth) =>
        table === 'question_assessment_criteria' && op === 'create' && nth === 2),
      { auditSvc: null },
    );

    await expect(
      failing.setCriteria(admin, 'pg-q-fail', [
        crit({ bloom_dimension_id: 'remember', criterion_key: 'x', weight: 0.5 }),
        crit({ bloom_dimension_id: 'create', criterion_key: 'y', weight: 0.5 }),
      ]),
    ).rejects.toThrow('injected failure');

    // The delete rolled back: the ORIGINAL row survives, with its identity.
    const afterRows = await prisma.questionAssessmentCriterion.findMany({
      where: { question_id: 'pg-q-fail' },
    });
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0].id).toBe(baseRows[0].id);
    expect(afterRows[0].bloom_dimension_id).toBe('evaluate');

    // Derived Question fields untouched.
    const afterQuestion = await prisma.question.findUnique({ where: { id: 'pg-q-fail' } });
    expect(afterQuestion.pedagogy_status).toBe('classified');
    expect(afterQuestion.primary_bloom_dimension_id).toBe('evaluate');
  });
});

// ─── 4. clearCriteria ───────────────────────────────────────────────────────

describe('QuestionPedagogyService.clearCriteria — atomic', () => {
  it('clears criteria and resets the derived fields on success', async () => {
    await svc.setCriteria(admin, 'pg-q-clear-ok', [crit({ bloom_dimension_id: 'understand' })]);

    const res = await svc.clearCriteria(admin, 'pg-q-clear-ok');

    expect(res.criteria).toEqual([]);
    expect(res.question.pedagogy_status).toBe('unclassified');
    expect(res.question.primary_bloom_dimension_id).toBeNull();
    expect(await countCriteria('pg-q-clear-ok')).toBe(0);
  });

  it('preserves criteria and derived fields when clearing fails', async () => {
    await svc.setCriteria(admin, 'pg-q-clear-fail', [
      crit({ bloom_dimension_id: 'understand', criterion_key: 'keep', weight: 1 }),
    ]);
    const before = await prisma.questionAssessmentCriterion.findMany({
      where: { question_id: 'pg-q-clear-fail' },
    });
    expect(before).toHaveLength(1);

    // Fail the cache update — after the deletes have already run inside the tx.
    const failing = new QuestionPedagogyService(
      failingRepo(repo, (table, op, nth) => table === 'questions' && op === 'update' && nth === 1),
      { auditSvc: null },
    );

    await expect(failing.clearCriteria(admin, 'pg-q-clear-fail')).rejects.toThrow('injected failure');

    const after = await prisma.questionAssessmentCriterion.findMany({
      where: { question_id: 'pg-q-clear-fail' },
    });
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);

    const question = await prisma.question.findUnique({ where: { id: 'pg-q-clear-fail' } });
    expect(question.pedagogy_status).toBe('classified');
    expect(question.primary_bloom_dimension_id).toBe('understand');
  });
});

// ─── 5. Complete deletion past the old 200-row boundary ─────────────────────

describe('complete criteria deletion (no page-size boundary)', () => {
  it('clears a question holding more than 200 criteria', async () => {
    await seedCriteria('pg-q-many-clear', 201);
    expect(await countCriteria('pg-q-many-clear')).toBe(201);

    await svc.clearCriteria(admin, 'pg-q-many-clear');

    expect(await countCriteria('pg-q-many-clear')).toBe(0);
    const question = await prisma.question.findUnique({ where: { id: 'pg-q-many-clear' } });
    expect(question.pedagogy_status).toBe('unclassified');
  });

  it('replaces a set of more than 200 criteria completely', async () => {
    await seedCriteria('pg-q-many-replace', 201);
    expect(await countCriteria('pg-q-many-replace')).toBe(201);

    const res = await svc.setCriteria(admin, 'pg-q-many-replace', [
      crit({ bloom_dimension_id: 'apply', criterion_key: 'only', weight: 1 }),
    ]);

    expect(res.question.pedagogy_status).toBe('classified');
    expect(await countCriteria('pg-q-many-replace')).toBe(1);
  });
});

// ─── 6. No silent non-transactional fallback ────────────────────────────────

describe('QuestionPedagogyService transaction requirement', () => {
  it('refuses a repository without runInTransaction and writes nothing', async () => {
    await svc.setCriteria(admin, 'pg-q-refuse', [crit({ bloom_dimension_id: 'remember' })]);
    expect(await countCriteria('pg-q-refuse')).toBe(1);

    const bare = {
      getAll: (...a) => repo.getAll(...a),
      getById: (...a) => repo.getById(...a),
      create: (...a) => repo.create(...a),
      update: (...a) => repo.update(...a),
      delete: (...a) => repo.delete(...a),
      deleteMany: (...a) => repo.deleteMany(...a),
    };
    const svcBare = new QuestionPedagogyService(bare, { auditSvc: null });

    await expect(svcBare.clearCriteria(admin, 'pg-q-refuse')).rejects.toThrow(/runInTransaction/);
    // Nothing was deleted.
    expect(await countCriteria('pg-q-refuse')).toBe(1);
  });
});
