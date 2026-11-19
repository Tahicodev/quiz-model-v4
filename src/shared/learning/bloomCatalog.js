/**
 * src/shared/learning/bloomCatalog.js
 *
 * The Bloom revision (Anderson & Krathwohl) cognitive-process dimensions, as a
 * fixed, GLOBAL catalog: the six dimensions are identical for every school, so
 * `BloomDimension` carries no `school_id` and the ids are stable strings rather
 * than generated uuids. The catalog is seeded idempotently by
 * `LearningTaxonomyService.ensureSeeded()`; nothing else may write it.
 *
 * Labels carry en / fr / ar. The Arabic and French strings are a first pass and
 * are PENDING the native-speaker review gate recorded in docs/phase 01.md before
 * any real-school pilot.
 *
 * Bloom is a *cognitive process* dimension. It is NOT difficulty: a question can
 * be `remember` and hard, or `create` and easy. Never derive one from the other.
 */

/** @typedef {{ id: string, key: string, order_index: number, labels: object, verbs: string[], examples: string[] }} BloomDimensionSeed */

/** The canonical order is meaningful: it is the taxonomy's own progression. */
export const BLOOM_DIMENSIONS = [
  {
    id: 'remember',
    key: 'remember',
    order_index: 0,
    labels: { en: 'Remember', fr: 'Mémoriser', ar: 'يتذكّر' },
    verbs: ['define', 'list', 'name', 'recall', 'identify', 'label'],
    examples: ['Name the parts of a plant', 'State the water cycle stages'],
  },
  {
    id: 'understand',
    key: 'understand',
    order_index: 1,
    labels: { en: 'Understand', fr: 'Comprendre', ar: 'يفهم' },
    verbs: ['explain', 'describe', 'summarize', 'classify', 'compare', 'illustrate'],
    examples: ['Explain why plants need light', 'Summarize the water cycle'],
  },
  {
    id: 'apply',
    key: 'apply',
    order_index: 2,
    labels: { en: 'Apply', fr: 'Appliquer', ar: 'يطبّق' },
    verbs: ['apply', 'solve', 'use', 'demonstrate', 'compute', 'implement'],
    examples: ['Solve a two-step equation', 'Use a map scale to find a distance'],
  },
  {
    id: 'analyze',
    key: 'analyze',
    order_index: 3,
    labels: { en: 'Analyze', fr: 'Analyser', ar: 'يحلّل' },
    verbs: ['analyze', 'differentiate', 'organize', 'attribute', 'deconstruct'],
    examples: ['Compare two methods and say which is more efficient, and why'],
  },
  {
    id: 'evaluate',
    key: 'evaluate',
    order_index: 4,
    labels: { en: 'Evaluate', fr: 'Évaluer', ar: 'يقيّم' },
    verbs: ['evaluate', 'justify', 'critique', 'judge', 'argue', 'defend'],
    examples: ['Justify which of two experiments is better controlled'],
  },
  {
    id: 'create',
    key: 'create',
    order_index: 5,
    labels: { en: 'Create', fr: 'Créer', ar: 'يبتكر' },
    verbs: ['create', 'design', 'plan', 'produce', 'compose', 'formulate'],
    examples: ['Design your own experiment to test a hypothesis'],
  },
];

/** The six fixed ids, in canonical order. */
export const BLOOM_DIMENSION_IDS = BLOOM_DIMENSIONS.map((d) => d.id);

/** Turn a seed entry into the row shape `BloomDimension` stores. */
export function toBloomRow(dimension) {
  return {
    id: dimension.id,
    key: dimension.key,
    name: dimension.labels.en,
    labels_json: JSON.stringify(dimension.labels),
    description: null,
    verbs_json: JSON.stringify(dimension.verbs),
    examples_json: JSON.stringify(dimension.examples),
    order_index: dimension.order_index,
  };
}

/** Positions of the dimensions, for deterministic ordering / tie-breaks. */
export const BLOOM_ORDER = Object.freeze(
  Object.fromEntries(BLOOM_DIMENSIONS.map((d) => [d.id, d.order_index])),
);
