/**
 * tests/unit/kids-levels-schema.test.js
 *
 * The generated docs/kids-levels.schema.json is the file a teacher points their
 * editor at, so the errors it reports are the first ones they read. If it only
 * described the game shape while the validator also accepted the flat
 * Questions-tab shape, the editor would underline a valid file as broken and the
 * teacher would rewrite working levels to satisfy a schema they never asked for.
 *
 * There is no JSON Schema validator in the project, so this checks the two
 * things that would actually have gone wrong: the generated file is present and
 * parseable, and it describes both shapes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const schema = JSON.parse(readFileSync(resolve(ROOT, 'docs/kids-levels.schema.json'), 'utf8'));

describe('the editor schema describes what the validator accepts', () => {
  it('offers a level in the flat question shape', () => {
    const flat = schema.$defs.flatQuestion;
    expect(flat).toBeDefined();
    // Without these the editor would demand level_type and content_json, which a
    // portable level set does not have.
    expect(flat.required).toEqual(expect.arrayContaining(['type', 'text']));
    expect(schema.$defs.level.anyOf, 'a level must allow both shapes').toHaveLength(2);
    expect(schema.$defs.level.anyOf[0].required).toEqual(expect.arrayContaining(['type', 'text']));
    expect(schema.$defs.level.anyOf[1].required).toEqual(expect.arrayContaining(['level_type', 'content_json']));
  });

  it('offers the five question types, with no true_false level_type', () => {
    const types = schema.$defs.flatQuestion.properties.type.enum;
    expect(types.sort()).toEqual(['fill-blank', 'matching', 'mcq', 'order', 'true-false']);
    // true-false is a question type only: a level_type of true_false is rejected.
    expect(schema.$defs.level.properties.level_type.enum).not.toContain('true_false');
  });

  it('keeps the nine core mechanics and the templates as level_type values', () => {
    const levelTypes = schema.$defs.level.properties.level_type.enum;
    for (const mechanic of ['multiple_choice', 'word_order', 'drag_drop', 'matching', 'memory', 'sorting', 'sequence', 'find_correct', 'bubble_pop']) {
      expect(levelTypes, mechanic).toContain(mechanic);
    }
    expect(levelTypes).toContain('treasure_hunt');
  });

  it('still describes a content_json for every mechanic', () => {
    const refs = schema.$defs.level.properties.content_json.anyOf.map(r => r.$ref).filter(Boolean);
    expect(refs).toHaveLength(9);
    for (const ref of refs) {
      const name = ref.split('/').pop();
      expect(schema.$defs[name], `${name} must still be described`).toBeDefined();
    }
  });
});
