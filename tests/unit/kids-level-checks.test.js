/**
 * tests/unit/kids-level-checks.test.js
 *
 * The shared rules behind three surfaces: the "Import a levels file" button in
 * the wizard, the offline validator script, and the copy-a-paste prompt. They
 * only stay trustworthy if they are the same code, which is what this covers.
 *
 * Two bugs this file exists to keep fixed:
 *   - word_order items are the shuffled pieces, so their order in the file cannot
 *     be compared to the answer; only the letters can. Comparing them in file
 *     order rejected the doc's own CHAT example.
 *   - a level that failed its own fields check (points: 900) used to skip its
 *     content checks, so the real problem ("correctId points at no option") was
 *     hidden behind a score mistake.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { validateLevelsFile, normalizeImportedLevels, readLevelsFile } from '../../src/shared/kids-level-checks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const mc = (extra = {}) => ({
  level_type: 'multiple_choice',
  content_json: {
    instruction: 'Choisis !',
    question: 'Combien font 2 + 2 ?',
    options: [{ id: 'a', value: '3' }, { id: 'b', value: '4' }],
    correctId: 'b',
  },
  ...extra,
});

const problemsOf = doc => validateLevelsFile(doc, {}).problems.map(p => p.message).join(' | ');

describe('readLevelsFile', () => {
  it('takes the three shapes a teacher actually pastes', () => {
    expect(readLevelsFile([mc()])).toHaveLength(1);
    expect(readLevelsFile({ levels: [mc()] })).toHaveLength(1);
    // One example copied out of a chat arrives on its own.
    expect(readLevelsFile(mc())).toHaveLength(1);
  });

  it('rejects an object that is neither', () => {
    expect(readLevelsFile({ questions: [] })).toBeNull();
    expect(readLevelsFile(null)).toBeNull();
    expect(readLevelsFile('nope')).toBeNull();
  });
});

describe('validateLevelsFile: shapes', () => {
  it('accepts a bare array, the wrapper, and a single level', () => {
    for (const doc of [[mc()], { levels: [mc()] }, mc()]) {
      expect(validateLevelsFile(doc, {}).ok).toBe(true);
    }
  });

  it('names the problem instead of crashing on an empty file', () => {
    const { ok, problems } = validateLevelsFile({ levels: [] }, {});
    expect(ok).toBe(false);
    expect(problems[0].message).toMatch(/no levels/);
  });

  it('reports every level at once, not just the first', () => {
    const { problems } = validateLevelsFile([mc(), mc({ points: 900 }), mc({ hint: 'x'.repeat(400) })], {});
    expect(problems.map(p => p.label)).toContain('level #2');
    expect(problems.map(p => p.label)).toContain('level #3');
  });
});

describe('validateLevelsFile: cross references', () => {
  it('accepts word_order pieces in any order, since they are shuffled', () => {
    const level = {
      level_type: 'word_order',
      content_json: { instruction: 'Ordonne', answer: 'CHAT', items: [{ id: '1', value: 'A' }, { id: '2', value: 'C' }, { id: '3', value: 'T' }, { id: '4', value: 'H' }] },
    };
    expect(validateLevelsFile([level], {}).ok).toBe(true);
  });

  it('accepts case and space differences in word_order', () => {
    // Grading drops spaces and ignores case, so a two-word answer needs a piece
    // for every letter, and the letters may come in any order or casing.
    const level = {
      level_type: 'word_order',
      content_json: { instruction: 'Ordonne', answer: 'le Chat', items: [{ id: '1', value: 'c' }, { id: '2', value: 'H' }, { id: '3', value: 'a' }, { id: '4', value: 't' }, { id: '5', value: 'L' }, { id: '6', value: 'E' }] },
    };
    expect(validateLevelsFile([level], {}).ok).toBe(true);
  });

  it('rejects word_order pieces that cannot spell the answer', () => {
    const level = {
      level_type: 'word_order',
      content_json: { instruction: 'Ordonne', answer: 'CHAT', items: [{ id: '1', value: 'A' }, { id: '2', value: 'C' }, { id: '3', value: 'T' }, { id: '4', value: 'X' }] },
    };
    expect(problemsOf([level])).toMatch(/are not the letters of "CHAT"/);
  });

  it('rejects a correctId that names no option', () => {
    const bad = mc({ content_json: { ...mc().content_json, correctId: 'zz' } });
    expect(problemsOf([bad])).toMatch(/correctId "zz" is not one of the option ids/);
  });

  it('rejects a memory deck with an unpaired card', () => {
    const level = {
      level_type: 'memory',
      content_json: {
        instruction: 'Trouve les paires',
        cards: [{ id: 'c1', matchId: 'm1', value: '🐱' }, { id: 'c2', matchId: 'm1', value: 'Chat' }, { id: 'c3', matchId: 'm2', value: '🐶' }, { id: 'c4', matchId: 'm3', value: 'Chien' }],
      },
    };
    expect(problemsOf([level])).toMatch(/matchId "m2" appears 1 time/);
  });

  it('rejects a sequence that drops an item', () => {
    const level = {
      level_type: 'sequence',
      content_json: { instruction: 'Ordonne', items: [{ id: 'n1', value: '1' }, { id: 'n2', value: '2' }], correctOrder: ['n1'] },
    };
    expect(problemsOf([level])).toMatch(/missing item "n2"/);
  });

  it('rejects drag_drop whose blank count contradicts its {blank} tokens', () => {
    const level = {
      level_type: 'drag_drop',
      content_json: {
        instruction: 'Choisis : Le {blank} est {blank}.',
        choices: [{ id: 'w1', value: 'soleil', target: 0 }, { id: 'w2', value: 'lune', target: 1 }],
        blanks: [{ id: 'b1', value: '{blank}' }],
      },
    };
    expect(problemsOf([level])).toMatch(/1 blank\(s\)/);
  });

  it('rejects sorting that points at a category that does not exist', () => {
    const level = {
      level_type: 'sorting',
      content_json: {
        instruction: 'Trie',
        categories: [{ id: 'c1', label: 'Fruits' }],
        items: [{ id: 'i1', value: 'Pomme', categoryId: 'c9' }],
      },
    };
    expect(problemsOf([level])).toMatch(/categoryId "c9", which does not exist/);
  });
});

describe('validateLevelsFile: narrative shells', () => {
  const shell = mechanic => ({ level_type: 'treasure_hunt', content_json: { mechanic, ...mc().content_json } });

  it('accepts a template that names a core mechanic inside content_json', () => {
    expect(validateLevelsFile([shell('multiple_choice')], {}).ok).toBe(true);
  });

  it('explains a template used without a mechanic, naming the real field', () => {
    const bare = { level_type: 'treasure_hunt', content_json: mc().content_json };
    expect(problemsOf([bare])).toMatch(/add a "mechanic" field/);
  });

  it('rejects a mechanic name that is not a core mechanic', () => {
    expect(problemsOf([shell('treasure_hunt')])).toMatch(/not a core mechanic/);
  });

  it('rejects a level_type that is neither a mechanic nor a template', () => {
    const bogus = { level_type: 'hangman', content_json: mc().content_json };
    expect(problemsOf([bogus])).toMatch(/neither a core mechanic/);
  });
});

describe('validateLevelsFile: independent reporting', () => {
  it('still checks the content when the level own fields are wrong', () => {
    // A wrong score must not hide the answer that points at nothing.
    const bad = mc({ points: 900, content_json: { ...mc().content_json, correctId: 'nope' } });
    const messages = problemsOf([bad]);
    expect(messages).toMatch(/points/);
    expect(messages).toMatch(/correctId "nope"/);
  });

  it('still checks cross references when the content shape is wrong', () => {
    const level = {
      level_type: 'drag_drop',
      content_json: { instruction: 'Le {blank} est {blank}.', choices: [{ id: 'w1', value: 'soleil', target: 0 }], blanks: [{ id: 'b1', value: '{blank}' }] },
    };
    const messages = problemsOf([level]);
    expect(messages).toMatch(/does not match "drag_drop"/);
    expect(messages).toMatch(/cannot be dragged in/);
  });
});

describe('validateLevelsFile: publishable minimum', () => {
  const five = Array.from({ length: 5 }, () => mc());

  it('enforces the minimum a template needs, and says which template', () => {
    const { ok, problems } = validateLevelsFile({ levels: [mc()] }, { minItems: 5, templateId: 'treasure_hunt' });
    expect(ok).toBe(false);
    expect(problems[0].message).toMatch(/at least 5 levels/);
    expect(problems[0].message).toMatch(/treasure_hunt/);
  });

  it('passes once there are enough, even if the file is in the odd shape', () => {
    expect(validateLevelsFile(five, { minItems: 5, templateId: 'treasure_hunt' }).ok).toBe(true);
  });

  it('skips the check when no template was chosen', () => {
    expect(validateLevelsFile([mc()], {}).ok).toBe(true);
  });
});

describe('normalizeImportedLevels', () => {
  it('hands the wizard levels that are already in save shape', () => {
    const out = normalizeImportedLevels([mc(), mc()]);
    expect(out).toHaveLength(2);
    expect(out[0].order_index).toBe(0);
    expect(out[1].order_index).toBe(1);
    expect(out[0].points).toBe(10);
    expect(typeof out[0].content_json).toBe('object');
  });

  it('parses content_json sent as a string, as a saved level arrives', () => {
    const out = normalizeImportedLevels([{ ...mc(), content_json: JSON.stringify(mc().content_json) }]);
    expect(out[0].content_json.correctId).toBe('b');
  });

  it('keeps a field that was explicitly set instead of defaulting over it', () => {
    const out = normalizeImportedLevels([mc({ points: 25, hint: 'Réfléchis bien' })]);
    expect(out[0].points).toBe(25);
    expect(out[0].hint).toBe('Réfléchis bien');
  });
});

describe('scripts/validate-kids-levels.mjs', () => {
  // The command a teacher runs on their own machine, so it is spawned for real.
  // Its --template parsing regressed once already: the flag was filtered out of
  // argv and then located by the index it had in the unfiltered array, which
  // silently skipped the minimum-level check and reported a short file as fine.
  const run = (args, input) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [resolve(ROOT, 'scripts/validate-kids-levels.mjs'), ...args], { input, encoding: 'utf8' }) };
    } catch (err) {
      return { code: err.status, out: `${err.stdout || ''}${err.stderr || ''}` };
    }
  };

  it('says ok for a valid file and exits 0', () => {
    const r = run([], JSON.stringify({ levels: [mc()] }));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/1 level\(s\) valid/);
  });

  it('fails with a non-zero exit and lists the problems', () => {
    const r = run([], JSON.stringify({ levels: [mc({ points: 900 })] }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/level #1/);
    expect(r.out).toMatch(/points/);
  });

  it('rejects text that is not JSON before looking at anything else', () => {
    const r = run([], 'not json at all');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/not valid JSON/);
  });

  it('accepts a file with a byte order mark', () => {
    const r = run([], `\uFEFF${JSON.stringify({ levels: [mc()] })}`);
    expect(r.code).toBe(0);
  });

  it('applies the template minimum, with the flag before or after the file', () => {
    const short = JSON.stringify({ levels: [mc()] });
    expect(run(['--template', 'treasure_hunt'], short).out).toMatch(/at least 5 levels/);
    const r = run(['--template', 'treasure_hunt'], short);
    expect(r.code).toBe(1);
    // A file with no template argument must not be held to a minimum.
    expect(run([], short).code).toBe(0);
  });

  it('rejects an unknown template instead of ignoring it', () => {
    const r = run(['--template', 'not_a_template'], JSON.stringify({ levels: [mc()] }));
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Unknown template/);
  });
});

describe('the documented examples are the ones the importer accepts', () => {  // The prompt and the doc are what a teacher actually copies from. If they drift
  // from the rules, the teacher hits an error on a file the docs told them to
  // send, so they are checked like any other file.
  const md = readFileSync(resolve(ROOT, 'docs/KIDS_LEVELS_IMPORT.md'), 'utf8');
  const blocks = [...md.matchAll(/```json\r?\n([\s\S]*?)```/g)].map(m => m[1]);
  const real = blocks.filter(b => !b.includes('"..."'));

  it('finds the examples for all nine mechanics plus a narrative shell', () => {
    expect(real.length).toBeGreaterThanOrEqual(10);
  });

  it.each(real.map((b, i) => [i + 1, b]))('doc example %i validates', (_n, block) => {
    const { ok, problems } = validateLevelsFile(JSON.parse(block), {});
    expect(problems.map(p => `${p.label}: ${p.message}`).join('\n')).toBe('');
    expect(ok).toBe(true);
  });
});
