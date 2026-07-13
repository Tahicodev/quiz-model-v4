/**
 * src/frontend/infrastructure/CacheDecorator.js
 *
 * Wraps any IStorageRepository with an in-memory TTL cache for getAll() calls.
 * Write operations (create / update / delete) automatically invalidate the
 * relevant table's cache entries.
 *
 * Usage:
 *   const repo = new CacheDecorator(new LocalStorageRepository(), 30_000);
 */

import { IStorageRepository } from './IStorageRepository.js';

export class CacheDecorator extends IStorageRepository {
  /** @type {IStorageRepository} */ #inner;
  /** @type {Map<string, {data: any, ts: number}>} */ #cache = new Map();
  /** @type {number} TTL in milliseconds */ #ttl;

  /**
   * @param {IStorageRepository} inner   - The wrapped repository
   * @param {number}             ttlMs   - Cache TTL in milliseconds (default 30 s)
   */
  constructor(inner, ttlMs = 30_000) {
    super();
    this.#inner = inner;
    this.#ttl   = ttlMs;
  }

  // ── Cache key helpers ───────────────────────────────────────────────────────

  #cacheKey(table, opts) {
    return `${table}::${JSON.stringify(opts)}`;
  }

  /**
   * Invalidate ALL cached entries for a given table.
   * Called after every write operation.
   */
  #invalidate(table) {
    const prefix = `${table}::`;
    for (const key of this.#cache.keys()) {
      if (key.startsWith(prefix)) this.#cache.delete(key);
    }
  }

  // ── IStorageRepository implementation ────────────────────────────────────────

  async getAll(table, opts = {}) {
    const key    = this.#cacheKey(table, opts);
    const cached = this.#cache.get(key);

    if (cached && Date.now() - cached.ts < this.#ttl) {
      return cached.data;
    }

    const result = await this.#inner.getAll(table, opts);
    this.#cache.set(key, { data: result, ts: Date.now() });
    return result;
  }

  async getById(table, id) {
    return this.#inner.getById(table, id);
  }

  async create(table, data) {
    const record = await this.#inner.create(table, data);
    this.#invalidate(table);
    return record;
  }

  async update(table, id, data) {
    const record = await this.#inner.update(table, id, data);
    this.#invalidate(table);
    return record;
  }

  async delete(table, id) {
    await this.#inner.delete(table, id);
    this.#invalidate(table);
  }

  async createMany(table, dataArray) {
    const records = await this.#inner.createMany(table, dataArray);
    this.#invalidate(table);
    return records;
  }

  async query(queryName, params) {
    return this.#inner.query(queryName, params);
  }

  /** Manually clear all cached entries (e.g. on logout). */
  clearAll() {
    this.#cache.clear();
  }
}
