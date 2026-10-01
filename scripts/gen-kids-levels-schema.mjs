/**
 * scripts/gen-kids-levels-schema.mjs
 *
 * Regenerates docs/kids-levels.schema.json from the Zod schemas the app actually
 * enforces, so the file a teacher points their editor at cannot drift from the
 * validator that will judge their file.
 *
 *   node scripts/gen-kids-levels-schema.mjs
 *
 * The input side of each schema is emitted, because that is what a teacher
 * writes: content_json and narrative_json accept a plain object and the app
 * stringifies it on the way in.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';

import { LEVEL_CONTENT_SCHEMAS, KidsActivityLevelCreateSchema } from '../src/shared/schemas/kids-activity.schema.js';
import { KIDS_TEMPLATES_SEED_DATA } from '../prisma/seeds/kids-game-templates.js';
import { KIDS_CORE_MECHANICS } from '../src/shared/constants.js';

const OUT_DIR = 'docs';
const OUT_FILE = path.join(OUT_DIR, 'kids-levels.schema.json');

const definitions = {};

for (const [mechanic, schema] of Object.entries(LEVEL_CONTENT_SCHEMAS)) {
  try {
    definitions[mechanic] = z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' });
  } catch (err) {
    console.error(`Could not convert ${mechanic}: ${err.message}`);
    process.exit(1);
  }
}

const levelSchema = z.toJSONSchema(KidsActivityLevelCreateSchema, { io: 'input', target: 'draft-2020-12' });

// The column is free text, but the player dispatches on it, so only these
// values do anything. Offering the list saves a silent "needs a game mechanic"
// screen in front of a child.
const levelTypes = [...new Set([
  ...Object.values(KIDS_CORE_MECHANICS),
  ...KIDS_TEMPLATES_SEED_DATA.map(t => t.id),
])].sort();

const document = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://quiz-app.local/schemas/kids-levels.schema.json',
  title: 'Kids Space levels file',
  description:
    'A file of Kids Space levels, ready to import. Either a bare array of levels or an object with a "levels" array. ' +
    'Validate before importing with: node scripts/validate-kids-levels.mjs <file>',
  type: 'object',
  required: ['levels'],
  properties: {
    levels: {
      type: 'array',
      minItems: 1,
      items: { $ref: '#/$defs/level' },
    },
  },
  $defs: {
    // A level may be written the way a question is written, with no level_type
    // and no ids. The validator converts it, so a schema that only offered the
    // game shape would flag a valid file as broken in the teacher's editor.
    flatQuestion: {
      type: 'object',
      required: ['type', 'text'],
      description:
        'A level in the Questions-tab shape. "type" says the mechanic; the game builds the level from it. true-false plays as multiple choice with True and False as the two options.',
      properties: {
        type: {
          type: 'string',
          enum: ['mcq', 'true-false', 'order', 'fill-blank', 'matching'],
          description: 'The mechanic. "true-false" is a question type, not a mechanic: there is no true_false level_type.',
        },
        text: { type: 'string', description: 'The question, or the sentence with the gap.' },
        options: {
          description: 'The choices, as plain strings; for matching, an array of [left, right] pairs. Not needed for true-false.',
          oneOf: [
            { type: 'array', items: { type: 'string' } },
            { type: 'array', items: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 } },
            { type: 'string', description: 'A bank question stores its options as a JSON string.' },
          ],
        },
        answer: {
          description: 'The correct option\'s text, or the word to rebuild for "order". May also be an id.',
          oneOf: [{ type: 'string' }, { type: 'array' }],
        },
        points: { type: 'integer', minimum: 1, maximum: 100 },
        hint: { type: 'string' },
        explanation: { type: 'string' },
        language: { type: 'string', description: 'A two-letter code. Checked against this language, not the wizard\'s.' },
      },
    },
    level: {
      ...levelSchema,
      description:
        'A level, either in the game shape (level_type plus content_json) or in the flat question shape.',
      anyOf: [
        {
          required: ['type', 'text'],
          properties: { type: { enum: ['mcq', 'true-false', 'order', 'fill-blank', 'matching'] } },
        },
        { required: ['level_type', 'content_json'] },
      ],
      properties: {
        ...levelSchema.properties,
        type: { $ref: '#/$defs/flatQuestion/properties/type' },
        text: { $ref: '#/$defs/flatQuestion/properties/text' },
        options: { $ref: '#/$defs/flatQuestion/properties/options' },
        answer: { $ref: '#/$defs/flatQuestion/properties/answer' },
        level_type: {
          ...levelSchema.properties.level_type,
          enum: levelTypes,
          description:
            'The core mechanic this level plays with, or the game template when the level is an adventure or immersive shell (then content_json must also carry "mechanic"). Not used in the flat question shape.',
        },
        content_json: {
          description:
            'The level content. Its shape depends on level_type. For an adventure or immersive template, level_type is the template and content_json must also carry a "mechanic" field naming the core mechanic used.',
          anyOf: [
            { $ref: '#/$defs/multiple_choice' },
            { $ref: '#/$defs/word_order' },
            { $ref: '#/$defs/drag_drop' },
            { $ref: '#/$defs/matching' },
            { $ref: '#/$defs/memory' },
            { $ref: '#/$defs/sorting' },
            { $ref: '#/$defs/sequence' },
            { $ref: '#/$defs/find_correct' },
            { $ref: '#/$defs/bubble_pop' },
            { type: 'string' },
          ],
        },
      },
    },
    ...definitions,
    templateMinimums: {
      description: 'Levels needed before a game can be published, per game template.',
      type: 'object',
      additionalProperties: { type: 'integer' },
      default: Object.fromEntries(KIDS_TEMPLATES_SEED_DATA.map(t => [t.id, t.min_items])),
    },
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote ${OUT_FILE} (${Object.keys(definitions).length} mechanics, ${KIDS_TEMPLATES_SEED_DATA.length} templates).`);
