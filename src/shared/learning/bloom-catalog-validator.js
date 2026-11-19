/**
 * src/shared/learning/bloom-catalog-validator.js
 *
 * Pure validator for the global Bloom catalog. It guards the invariant that the
 * catalog is EXACTLY the six revised-taxonomy dimensions with stable ids — a
 * seventh row, a renamed id or a missing locale would silently break every
 * criterion, filter and label downstream.
 *
 * Pure: no repository, no I/O. Returns `{ ok, errors }`; callers decide whether
 * to throw (services convert to `ValidationError`).
 */

import { BLOOM_DIMENSIONS, BLOOM_DIMENSION_IDS } from './bloomCatalog.js';

const REQUIRED_LOCALES = ['en', 'fr', 'ar'];

/**
 * @param {object[]} rows  BloomDimension-shaped rows (as stored).
 * @returns {{ ok: boolean, errors: Record<string, string[]> }}
 */
export function validateBloomCatalog(rows) {
  const errors = {};
  const push = (key, msg) => {
    (errors[key] ||= []).push(msg);
  };

  if (!Array.isArray(rows)) {
    return { ok: false, errors: { catalog: ['Catalog must be an array'] } };
  }

  if (rows.length !== BLOOM_DIMENSION_IDS.length) {
    push('catalog', `Expected exactly ${BLOOM_DIMENSION_IDS.length} dimensions, got ${rows.length}`);
  }

  const seenIds = new Set();
  const seenKeys = new Set();
  const seenOrder = new Set();

  for (const row of rows) {
    const where = row?.id ?? '(missing id)';

    if (!BLOOM_DIMENSION_IDS.includes(row?.id)) {
      push(where, `Unknown Bloom id "${row?.id}"`);
      continue;
    }
    if (seenIds.has(row.id)) push(where, 'Duplicate id');
    seenIds.add(row.id);

    if (typeof row.key !== 'string' || !row.key.trim()) push(where, 'key is required');
    else if (seenKeys.has(row.key)) push(where, `Duplicate key "${row.key}"`);
    else seenKeys.add(row.key);

    if (!Number.isInteger(row.order_index) || row.order_index < 0 || row.order_index > 5) {
      push(where, 'order_index must be an integer 0–5');
    } else if (seenOrder.has(row.order_index)) {
      push(where, `Duplicate order_index ${row.order_index}`);
    } else {
      seenOrder.add(row.order_index);
    }

    // labels_json is stored as a JSON string; accept a parsed object too so the
    // validator works on both seed constants and raw rows.
    let labels = row.labels_json;
    if (typeof labels === 'string') {
      try {
        labels = JSON.parse(labels);
      } catch {
        push(where, 'labels_json is not valid JSON');
        continue;
      }
    }
    if (!labels || typeof labels !== 'object') {
      push(where, 'labels_json must be a locale → label object');
      continue;
    }
    for (const locale of REQUIRED_LOCALES) {
      if (typeof labels[locale] !== 'string' || !labels[locale].trim()) {
        push(where, `labels_json is missing the "${locale}" label`);
      }
    }
  }

  for (const id of BLOOM_DIMENSION_IDS) {
    if (!seenIds.has(id)) push('catalog', `Missing dimension "${id}"`);
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** Convenience for the seed path: validate the shipped constant itself. */
export function validateBloomSeed() {
  return validateBloomCatalog(BLOOM_DIMENSIONS.map((d) => ({
    id: d.id,
    key: d.key,
    order_index: d.order_index,
    labels_json: JSON.stringify(d.labels),
  })));
}
