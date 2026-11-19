/**
 * tests/unit/bloom-catalog-validator.test.js
 *
 * The Bloom catalog is GLOBAL and fixed: exactly the six revised-taxonomy
 * dimensions with stable ids and three locales. A seventh row, a renamed id or
 * a missing locale would silently break every criterion, filter and label
 * downstream, so the validator's job is to refuse all of those.
 *
 * Also pins the thing Phase 1 is emphatic about: Bloom is a cognitive-process
 * dimension, NOT difficulty. The catalog carries no difficulty value and none
 * is derived from it.
 */

import { describe, it, expect } from 'vitest';

import {
  BLOOM_DIMENSIONS,
  BLOOM_DIMENSION_IDS,
  BLOOM_ORDER,
  toBloomRow,
} from '../../src/shared/learning/bloomCatalog.js';
import {
  validateBloomCatalog,
  validateBloomSeed,
} from '../../src/shared/learning/bloom-catalog-validator.js';

/** The seed as the validator sees it on the DB path (labels as a JSON string). */
const seedRows = () =>
  BLOOM_DIMENSIONS.map((d) => ({
    id: d.id,
    key: d.key,
    order_index: d.order_index,
    labels_json: JSON.stringify(d.labels),
  }));

describe('validateBloomSeed', () => {
  it('accepts the shipped catalog', () => {
    expect(validateBloomSeed()).toEqual({ ok: true, errors: {} });
  });

  it('ships exactly the six dimensions in taxonomy order', () => {
    expect(BLOOM_DIMENSION_IDS).toEqual([
      'remember',
      'understand',
      'apply',
      'analyze',
      'evaluate',
      'create',
    ]);
    expect(BLOOM_DIMENSIONS.map((d) => d.order_index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('has EN/FR/AR labels for every dimension', () => {
    for (const dimension of BLOOM_DIMENSIONS) {
      for (const locale of ['en', 'fr', 'ar']) {
        expect(dimension.labels[locale], `${dimension.id}.${locale}`).toBeTruthy();
      }
    }
  });
});

describe('validateBloomCatalog', () => {
  it('rejects a non-array catalog', () => {
    const result = validateBloomCatalog(null);
    expect(result.ok).toBe(false);
    expect(result.errors.catalog).toBeDefined();
  });

  it('rejects a catalog with a missing dimension', () => {
    const rows = seedRows().slice(0, 5);
    const result = validateBloomCatalog(rows);
    expect(result.ok).toBe(false);
    expect(result.errors.catalog.join(' ')).toMatch(/Expected exactly 6/);
    expect(result.errors.catalog.join(' ')).toMatch(/Missing dimension "create"/);
  });

  it('rejects an unknown dimension id', () => {
    const rows = seedRows();
    rows[5] = { ...rows[5], id: 'synthesize' };
    const result = validateBloomCatalog(rows);
    expect(result.ok).toBe(false);
    expect(result.errors.catalog.join(' ')).toMatch(/Missing dimension "create"/);
    expect(result.errors.synthesize.join(' ')).toMatch(/Unknown Bloom id/);
  });

  it('rejects a duplicate key', () => {
    const rows = seedRows();
    rows[1] = { ...rows[1], key: 'remember' };
    const result = validateBloomCatalog(rows);
    expect(result.ok).toBe(false);
    expect(result.errors.understand.join(' ')).toMatch(/Duplicate key "remember"/);
  });

  it('rejects an out-of-range order_index', () => {
    const rows = seedRows();
    rows[0] = { ...rows[0], order_index: 6 };
    const result = validateBloomCatalog(rows);
    expect(result.ok).toBe(false);
    expect(result.errors.remember.join(' ')).toMatch(/order_index must be an integer 0–5/);
  });

  it('rejects a duplicate order_index', () => {
    const rows = seedRows();
    rows[1] = { ...rows[1], order_index: 0 };
    const result = validateBloomCatalog(rows);
    expect(result.ok).toBe(false);
    expect(result.errors.understand.join(' ')).toMatch(/Duplicate order_index 0/);
  });

  it('rejects a missing locale', () => {
    const rows = seedRows();
    const labels = { en: 'Apply', ar: 'يطبّق' }; // no fr
    rows[2] = { ...rows[2], labels_json: JSON.stringify(labels) };
    const result = validateBloomCatalog(rows);
    expect(result.ok).toBe(false);
    expect(result.errors.apply.join(' ')).toMatch(/missing the "fr" label/);
  });

  it('rejects labels_json that is not JSON', () => {
    const rows = seedRows();
    rows[2] = { ...rows[2], labels_json: '{not json' };
    const result = validateBloomCatalog(rows);
    expect(result.ok).toBe(false);
    expect(result.errors.apply.join(' ')).toMatch(/not valid JSON/);
  });

  it('accepts already-parsed labels (seed constants, not raw rows)', () => {
    const rows = BLOOM_DIMENSIONS.map((d) => ({
      id: d.id,
      key: d.key,
      order_index: d.order_index,
      labels_json: d.labels,
    }));
    expect(validateBloomCatalog(rows).ok).toBe(true);
  });
});

describe('Bloom is a cognitive dimension, not difficulty', () => {
  it('carries no difficulty field', () => {
    for (const dimension of BLOOM_DIMENSIONS) {
      expect(dimension).not.toHaveProperty('difficulty');
      expect(Object.keys(dimension).sort()).toEqual(
        ['examples', 'id', 'key', 'labels', 'order_index', 'verbs'].sort(),
      );
    }
  });

  it('maps a dimension to a DB row without inventing a difficulty', () => {
    const row = toBloomRow(BLOOM_DIMENSIONS[5]);
    expect(row).toMatchObject({ id: 'create', key: 'create', name: 'Create', order_index: 5 });
    expect(row).not.toHaveProperty('difficulty');
    expect(JSON.parse(row.labels_json)).toEqual({ en: 'Create', fr: 'Créer', ar: 'يبتكر' });
  });

  it('orders by the taxonomy progression, independent of any difficulty scale', () => {
    expect(BLOOM_ORDER).toEqual({
      remember: 0,
      understand: 1,
      apply: 2,
      analyze: 3,
      evaluate: 4,
      create: 5,
    });
  });
});