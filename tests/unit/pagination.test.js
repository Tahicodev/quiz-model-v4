/**
 * tests/unit/pagination.test.js
 *
 * `fetchAllRows` must return the COMPLETE dataset or throw — never a partial
 * dataset presented as complete. These tests drive it with a fake repository so
 * every boundary (empty, exactly one page, multi-page, final partial page,
 * inconsistent totals, mid-flight failure, a repository that cannot page) is
 * exercised deterministically and fast.
 *
 * The real-database boundary (a real page size of 1,000) is covered in
 * tests/integration/learning.dataset-completeness.test.js.
 */

import { describe, it, expect } from 'vitest';

import { fetchAllRows, DEFAULT_PAGE_SIZE } from '../../src/shared/pagination.js';

/**
 * Fake repository over an in-memory array, honouring the real contract:
 * `getAll(table, { filters, limit, offset })` → `{ data, total }`.
 *
 * @param {object[]} rows
 * @param {object} [opts]
 * @param {number} [opts.failOnCall]   throw on the Nth getAll call (1-based)
 * @param {Function} [opts.totalFor]   (callIndex, rowCount) => total
 */
function fakeRepo(rows, { failOnCall = null, totalFor = null } = {}) {
  let calls = 0;
  const repo = {
    async getAll(table, { limit, offset }) {
      calls += 1;
      if (failOnCall && calls === failOnCall) throw new Error('connection lost');
      const data = rows.slice(offset, offset + limit);
      const total = totalFor ? totalFor(calls, rows.length) : rows.length;
      return { data, total };
    },
    get calls() {
      return calls;
    },
  };
  return repo;
}

const N = (n) => Array.from({ length: n }, (_, i) => ({ id: `row-${i}` }));

describe('fetchAllRows — complete retrieval', () => {
  it('returns an empty dataset without paging further', async () => {
    const repo = fakeRepo([]);
    expect(await fetchAllRows(repo, 't', { pageSize: 4 })).toEqual([]);
    expect(repo.calls).toBe(1);
  });

  it('returns a dataset smaller than one page', async () => {
    const repo = fakeRepo(N(3));
    const rows = await fetchAllRows(repo, 't', { pageSize: 4 });
    expect(rows).toHaveLength(3);
    expect(repo.calls).toBe(1);
  });

  it('returns exactly one full page without a second probe or false truncation', async () => {
    const repo = fakeRepo(N(4));
    const rows = await fetchAllRows(repo, 't', { pageSize: 4 });
    expect(rows).toHaveLength(4);
    expect(repo.calls).toBe(1);
  });

  it('reads multiple pages and handles the final partial page', async () => {
    const repo = fakeRepo(N(10));
    const rows = await fetchAllRows(repo, 't', { pageSize: 4 });
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.id)).toEqual(N(10).map((r) => r.id));
    expect(repo.calls).toBe(3); // 4 + 4 + 2
  });

  it('keeps paging even when the page count is an exact multiple of the page size', async () => {
    const repo = fakeRepo(N(8));
    const rows = await fetchAllRows(repo, 't', { pageSize: 4 });
    expect(rows).toHaveLength(8);
    expect(repo.calls).toBe(2);
  });

  it('treats an unreported total by reading until a short page', async () => {
    // total comes back as NaN/undefined → the loop must fall back to page length
    const repo = fakeRepo(N(6), { totalFor: () => undefined });
    const rows = await fetchAllRows(repo, 't', { pageSize: 4 });
    expect(rows).toHaveLength(6);
    expect(repo.calls).toBe(2); // 4 then 2 (short → stop)
  });

  it('exposes a sane default page size', () => {
    expect(DEFAULT_PAGE_SIZE).toBe(1000);
  });
});

describe('fetchAllRows — fails loudly instead of returning partial data', () => {
  it('propagates a retrieval failure from any page', async () => {
    const repo = fakeRepo(N(10), { failOnCall: 2 });
    await expect(fetchAllRows(repo, 't', { pageSize: 4 })).rejects.toThrow('connection lost');
  });

  it('rejects when the reported total changes between pages', async () => {
    const repo = fakeRepo(N(10), { totalFor: (call) => (call === 1 ? 8 : 9) });
    await expect(fetchAllRows(repo, 't', { pageSize: 4 })).rejects.toThrow(/changed while paging/);
  });

  it('rejects when paging stops before the reported total is reached', async () => {
    // 3 rows exist but the dataset claims 10 → the empty second page must fail,
    // not look like a complete (short) result.
    const repo = fakeRepo(N(3), { totalFor: () => 10 });
    await expect(fetchAllRows(repo, 't', { pageSize: 4 })).rejects.toThrow(/incomplete/);
  });

  it('rejects when more rows are returned than the dataset reports', async () => {
    const repo = fakeRepo(N(6), { totalFor: () => 1 });
    await expect(fetchAllRows(repo, 't', { pageSize: 4 })).rejects.toThrow(/reports only 1/);
  });

  it('rejects a repository that cannot page', async () => {
    await expect(fetchAllRows({}, 't')).rejects.toThrow(/does not implement getAll/);
    await expect(fetchAllRows(null, 't')).rejects.toThrow(/does not implement getAll/);
  });

  it('rejects a non-positive or non-finite page size', async () => {
    const repo = fakeRepo(N(2));
    await expect(fetchAllRows(repo, 't', { pageSize: 0 })).rejects.toThrow(/pageSize/);
    await expect(fetchAllRows(repo, 't', { pageSize: Number.NaN })).rejects.toThrow(/pageSize/);
  });
});
