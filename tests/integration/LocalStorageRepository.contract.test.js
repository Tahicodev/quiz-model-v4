/**
 * tests/integration/LocalStorageRepository.contract.test.js
 *
 * Runs the repository contract suite against the LocalStorageRepository.
 * The repo reads/writes the GLOBAL `localStorage` (browser API), which vitest's
 * `node` environment does not provide — so we install an in-memory polyfill and
 * reset it between cases for isolation.
 */

import { describe, beforeEach } from 'vitest';
import { LocalStorageRepository } from '../../src/frontend/infrastructure/LocalStorageRepository.js';
import { runRepositoryContractTests } from './repository.contract.js';

/** Minimal in-memory localStorage polyfill (synchronous, JSON-string-stored). */
function createInMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
    key(i) { return [...store.keys()][i] ?? null; },
    get length() { return store.size; },
  };
}

/** Fresh LocalStorageRepository backed by a fresh in-memory store. */
function makeRepo() {
  const storage = createInMemoryStorage();
  // The repo uses the GLOBAL `localStorage` symbol, so we temporarily install
  // our per-instance polyfill on globalThis for the duration of this repo's
  // life. Each `makeRepo()` call swaps in a fresh store → full isolation.
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => storage,
  });
  return new LocalStorageRepository();
}

runRepositoryContractTests({
  repoFactory: () => Promise.resolve(makeRepo()),
  cleanup:     async () => {},
  label:       'LocalStorageRepository',
  table:       'questions',
  sample:      { text: 'Test question?', type: 'mcq', answer: 'A', school_id: 'school-test' },
  // LocalStorage's createMany blindly appends — NOT idempotent by PK. Skip the
  // duplicate-batch case here; it's covered by the Prisma runner.
  supportsIdempotentCreateMany: false,
});
