/**
 * tests/integration/repository.contract.js
 *
 * Repository contract test — runs the SAME suite against EVERY implementation
 * of IStorageRepository so the LocalStorageRepository and the PrismaRepository
 * are proven to behave identically. (Spec §23 + §25 line 3077.)
 *
 * Each runner provides:
 *   - repoFactory: async () => repo   fresh, isolated instance per `beforeEach`
 *   - cleanup:     async () => void   called after the suite to drop the backing store
 *   - beforeEachCleanup: async (repo) => void  optional; called before each case
 *                   to clear the backing store the cases share (e.g. the DB),
 *                   since two repos backed by the SAME store would otherwise
 *                   see each other's rows. LocalStorage uses a fresh in-memory
 *                   store per repo so needs none; Prisma shares one DB and
 *                   deletes its rows here.
 *   - table+sample: a schema-conformant sample record with a unique field so
 *                   filtering + pagination assertions are meaningful
 *   - supportsIdempotentCreateMany: boolean — the Prisma one (skipDuplicates:true)
 *                   dedupes by PK and so createMany-ing the same batch twice yields
 *                   N rows; the LocalStorage impl blindly appends and is NOT
 *                   idempotent, so the duplicate-assertion case is gated on this.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { NotFoundError } from '../../src/shared/errors.js';

/**
 * @param {object} opts
 * @param {() => Promise<import('../../src/frontend/infrastructure/IStorageRepository.js').IStorageRepository>} opts.repoFactory
 * @param {() => Promise<void>} [opts.cleanup]
 * @param {(repo: import('../../src/frontend/infrastructure/IStorageRepository.js').IStorageRepository) => Promise<void>} [opts.beforeEachCleanup]
 * @param {string} opts.label
 * @param {string} opts.table
 * @param {object} opts.sample              schema-conformant record; must include a unique-ish field for filter/pagination cases
 * @param {(i:number)=>object} [opts.mutator] returns a per-iteration sample variant for pagination (defaults to overriding a `text`/`key` field)
 * @param {boolean} [opts.supportsIdempotentCreateMany=false]
 */
export function runRepositoryContractTests({
  repoFactory, cleanup, beforeEachCleanup, label, table, sample, mutator,
  supportsIdempotentCreateMany = false,
}) {
  describe(`[Contract] ${label}`, () => {
    let repo;

    beforeEach(async () => {
      repo = await repoFactory();
      // Clear the backing store before each case so cases don't leak state.
      // (LocalStorage uses a fresh in-memory store per repo so this is a no-op;
      // Prisma shares one DB and deletes its rows here.)
      if (beforeEachCleanup) await beforeEachCleanup(repo);
    });

    afterAll(async () => {
      if (cleanup) await cleanup();
    });

    const variant = (i) =>
      mutator
        ? mutator(i)
        : { ...sample, ...(sample.text !== undefined && { text: `Q${i}` }),
            ...(sample.key !== undefined && { key: `key-${i}` }) };

    it('create() returns a record with id and timestamps', async () => {
      const r = await repo.create(table, sample);
      expect(r.id).toBeTruthy();
      expect(r.created_at).toBeDefined();
      expect(r.updated_at).toBeDefined();
    });

    it('getById() returns the created record', async () => {
      const c = await repo.create(table, sample);
      const f = await repo.getById(table, c.id);
      expect(f?.id).toBe(c.id);
    });

    it('getById() returns null for a nonexistent id', async () => {
      expect(await repo.getById(table, 'no-such-id')).toBeNull();
    });

    it('getAll() always returns { data: Array, total: number }', async () => {
      const r = await repo.getAll(table);
      expect(r).toMatchObject({ data: expect.any(Array), total: expect.any(Number) });
    });

    it('getAll() paginates correctly', async () => {
      for (let i = 0; i < 5; i++) await repo.create(table, variant(i));
      const page1 = await repo.getAll(table, { limit: 2, offset: 0 });
      const page2 = await repo.getAll(table, { limit: 2, offset: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBeGreaterThanOrEqual(5);
      expect(page2.data[0]?.id).not.toBe(page1.data[0]?.id);
    });

    it('getAll() filters by a field value', async () => {
      await repo.create(table, { ...sample, type: 'mcq' });
      await repo.create(table, { ...sample, type: 'true-false' });
      const result = await repo.getAll(table, { filters: { type: 'mcq' } });
      expect(result.data.every((r) => r.type === 'mcq')).toBe(true);
    });

    it('update() modifies specified fields and preserves the rest', async () => {
      const c = await repo.create(table, sample);
      const u = await repo.update(table, c.id, { ...(sample.text !== undefined && { text: 'Updated text' }),
        ...(sample.key !== undefined && { key: 'updated-key' }) });
      if (sample.text !== undefined) expect(u.text).toBe('Updated text');
      if (sample.key !== undefined) expect(u.key).toBe('updated-key');
      // Unchanged fields preserved
      expect(u.type).toBe(sample.type);
    });

    it('update() throws NotFoundError for an unknown id', async () => {
      await expect(repo.update(table, 'no-such-id', { text: 'X' })).rejects.toBeInstanceOf(NotFoundError);
    });

    it('delete() removes the record', async () => {
      const c = await repo.create(table, sample);
      await repo.delete(table, c.id);
      expect(await repo.getById(table, c.id)).toBeNull();
    });

    it('delete() throws NotFoundError for an unknown id', async () => {
      await expect(repo.delete(table, 'no-such-id')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('createMany() inserts a batch', async () => {
      const batch = [variant(0), variant(1), variant(2)];
      const result = await repo.createMany(table, batch);
      const inserted = typeof result?.count === 'number' ? result.count : (Array.isArray(result) ? result.length : 0);
      expect(inserted).toBeGreaterThanOrEqual(3);
      const { total } = await repo.getAll(table);
      expect(total).toBeGreaterThanOrEqual(3);
    });

    it('createMany() is idempotent on a duplicate batch (skipDuplicates semantics)', { skip: !supportsIdempotentCreateMany }, async () => {
      const batch = [
        { ...variant(0), id: 'dup-1' },
        { ...variant(1), id: 'dup-2' },
      ];
      const first  = await repo.createMany(table, batch);
      const second = await repo.createMany(table, batch); // exact same ids
      const firstCount  = typeof first?.count === 'number' ? first.count : (Array.isArray(first) ? first.length : 0);
      const secondCount = typeof second?.count === 'number' ? second.count : (Array.isArray(second) ? second.length : 0);
      expect(firstCount).toBe(2);
      expect(secondCount).toBe(0); // all duplicates skipped — idempotent
      const { total } = await repo.getAll(table);
      expect(total).toBe(2); // no new rows from the second run
    });
  });
}
