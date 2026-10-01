/**
 * tests/unit/kids-content-editor.test.js
 *
 * "+ Add empty level" used to insert a question, two options and a story line
 * that the teacher never wrote, in the voice of the app. A teacher who added a
 * few levels and moved on published those sentences to a child, and nothing
 * anywhere said they were placeholders. That is the failure this file exists to
 * prevent: a level that is not empty must be empty, and it must then be
 * fillable, because an empty level nobody can edit is a dead end.
 *
 * The editor lives in a browser script loaded with a plain <script> tag, so it
 * is lifted out of the source and evaluated here, the same way the prompt tests
 * do it. The blank level is also defined in src/shared/kids-question-bridge.js
 * for the server, so the two are compared directly: if they ever disagree, a
 * level added in the wizard would look nothing like one added through the API.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { blankLevelContent } from '../../src/shared/kids-question-bridge.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(resolve(ROOT, 'kids-management.js'), 'utf8');
const at = marker => {
  const i = SRC.indexOf(marker);
  if (i < 0) throw new Error(`kids-management.js no longer contains ${JSON.stringify(marker)}; update this test's markers`);
  return i;
};

// levelContent, levelSummary and templateName only: the slice must not run on
// into the review, or it re-declares MECHANIC_FORMAT and blankContent below.
const helpers = SRC.slice(at('function levelContent(level)'), at('  // Step 6 is the review'));
const table = SRC.slice(at('const MECHANIC_FORMAT'), at('const NARRATIVE_TEMPLATES'));
const narrativeLine = SRC.slice(at('const NARRATIVE_TEMPLATES'), SRC.indexOf('\n', at('const NARRATIVE_TEMPLATES')) + 1);
const editor = SRC.slice(at('function blankContent(mechanic)'), at('  // Previously this POSTed a copy'));
const importer = SRC.slice(at('  function importedLanguage(parsed)'), at('  async function checkImport()'));
// The review and preflight helpers, which sit below the review marker.
const reviewHelpers = SRC.slice(at('function levelContentStrict(level)'), at('  function preflight(w, d)'));

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let renders = 0;
let alerted = null;

// Every mechanic the wizard can offer, with the game category each one has.
const TEMPLATES = [
  { id: 'multiple_choice', category: 'core', min_items: 1 },
  { id: 'matching', category: 'core', min_items: 1 },
  { id: 'memory', category: 'core', min_items: 1 },
  { id: 'sorting', category: 'core', min_items: 1 },
  { id: 'sequence', category: 'core', min_items: 1 },
  { id: 'find_correct', category: 'core', min_items: 1 },
  { id: 'bubble_pop', category: 'core', min_items: 1 },
  { id: 'drag_drop', category: 'core', min_items: 1 },
  { id: 'word_order', category: 'core', min_items: 1 },
  { id: 'treasure_hunt', category: 'adventure', min_items: 5 },
];
const CORE = TEMPLATES.filter(t => t.category === 'core').map(t => t.id);

const load = new Function(
  'esc', 'alert', 'render', 'templates',
  `${helpers}\n${table}\n${narrativeLine}\n${editor}\n${importer}\n${reviewHelpers}
   const state = { wizard: null, editingLevel: null };
   return { blankContent, contentFields, editContent, levelMechanic, levelSummary, addLevel, importedLanguage, reviewWorldText, hasPlayableContent, state };`,
);
const studio = load(esc, m => { alerted = m; }, () => { renders += 1; }, TEMPLATES);

const open = levels => {
  studio.state.wizard = { data: { game_template: levels.game_template || 'multiple_choice' }, generated: levels.levels };
  return levels.levels;
};

// Every string a child could see, with the machine's own ids left out: an id is
// not something the teacher typed, and an id proves nothing either way.
const words = (value, out = []) => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => words(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'id' || k === 'position' || k === 'correctId' || k === 'mechanic' || k === 'baseMechanic') continue;
      words(v, out);
    }
  }
  return out;
};

describe('a level added by hand starts empty', () => {
  it('matches the blank level the server uses, for every mechanic', () => {
    // Two definitions of "blank" is one too many: a teacher would see one shape
    // in the wizard and get another through the API.
    for (const mechanic of [...CORE, 'find_correct']) {
      expect(studio.blankContent(mechanic), `${mechanic} must match the shared blank level`)
        .toEqual(blankLevelContent(mechanic));
    }
  });

  it('writes no text the teacher did not type', () => {
    for (const mechanic of [...CORE, 'find_correct']) {
      const written = words(studio.blankContent(mechanic)).filter(s => s.trim() && s !== '{blank}');
      expect(written, `${mechanic} must not invent any text`).toEqual([]);
    }
  });

  it('never leaves the sentences the old placeholder used', () => {
    const everything = JSON.stringify(CORE.map(m => studio.blankContent(m)));
    expect(everything).not.toMatch(/Question to customise|Option A|Option B|Help the hero|Every correct answer moves you closer/);
  });

  it('adds an empty level for the chosen game and opens it for writing', () => {
    for (const game_template of CORE) {
      open({ game_template, levels: [] });
      studio.addLevel();
      const added = studio.state.wizard.generated[0];
      expect(added.level_type, `${game_template} level must belong to the game`).toBe(game_template);
      expect(added.content_json).toEqual(studio.blankContent(game_template));
      expect(added.points).toBe(10);
      // Open it, or the teacher has an empty row and no idea what to do with it.
      expect(studio.state.editingLevel).toBe(0);
    }
  });

  it('names the mechanic a narrative game wraps', () => {
    open({ game_template: 'treasure_hunt', levels: [] });
    studio.addLevel();
    // A shell cannot play a bare mechanic, so it says which one it wraps and
    // still invents no words of its own.
    const [added] = studio.state.wizard.generated;
    expect(added.content_json.mechanic).toBe('multiple_choice');
    expect(added.content_json.worldText).toBe('');
  });
});

describe('a level added by hand can be filled in', () => {
  const questionLevel = () => [{
    level_type: 'multiple_choice',
    content_json: { instruction: '', question: '', options: [{ id: 'opt1', value: '' }, { id: 'opt2', value: '' }], correctId: 'opt1' },
    points: 10,
  }];

  it('keeps the answer on the row it was on when the options are retyped', () => {
    const levels = open({ levels: questionLevel() });
    const content = levels[0].content_json;
    content.correctId = 'opt2';
    studio.editContent(0, 'options', 'six\nseven\neight');
    // The answer was the second row, so it stays the second row: retyping an
    // option must not quietly move the answer to a different one.
    expect(levels[0].content_json.options.map(o => o.value)).toEqual(['six', 'seven', 'eight']);
    expect(levels[0].content_json.correctId).toBe('opt2');
  });

  it('writes the question, the instruction and the answer', () => {
    const levels = open({ levels: questionLevel() });
    studio.editContent(0, 'question', 'Combien font 4 + 3 ?');
    studio.editContent(0, 'options', '6\n7');
    studio.editContent(0, 'correctId', 'opt2');
    expect(levels[0].content_json).toMatchObject({
      question: 'Combien font 4 + 3 ?',
      options: [{ id: 'opt1', value: '6' }, { id: 'opt2', value: '7' }],
      correctId: 'opt2',
    });
  });

  it('builds the pieces to drag from the word, so the level is playable', () => {
    const levels = open({ levels: [{ level_type: 'word_order', content_json: studio.blankContent('word_order') }] });
    studio.editContent(0, 'answer', 'CHAT');
    expect(levels[0].content_json.answer).toBe('CHAT');
    expect(levels[0].content_json.items.map(i => i.value).join('')).toBe('CHAT');
  });

  it('keeps the two matching columns in step', () => {
    const levels = open({ levels: [{ level_type: 'matching', content_json: studio.blankContent('matching') }] });
    studio.editContent(0, 'pairs_left', 'Chat\nChien');
    studio.editContent(0, 'pairs_right', 'Miaou\nOuah');
    expect(levels[0].content_json.pairs).toEqual([
      { id: 'p1', left: 'Chat', right: 'Miaou' },
      { id: 'p2', left: 'Chien', right: 'Ouah' },
    ]);
  });

  it('keeps the gap and its answer together', () => {
    const levels = open({ levels: [{ level_type: 'drag_drop', content_json: studio.blankContent('drag_drop') }] });
    studio.editContent(0, 'template', 'Le {blank} brille.');
    studio.editContent(0, 'blank', 'soleil');
    studio.editContent(0, 'choices', 'soleil\nlune');
    const c = levels[0].content_json;
    expect(c.template).toBe('Le {blank} brille.');
    expect(c.blanks).toEqual([{ position: 0, answer: 'soleil' }]);
    expect(c.choices.map(x => x.value)).toEqual(['soleil', 'lune']);
  });

  it('says what is wrong with a JSON level instead of losing it', () => {
    alerted = null;
    const levels = open({ levels: [{ level_type: 'sorting', content_json: studio.blankContent('sorting') }] });
    studio.editContent(0, 'json', '{ not json');
    // A half-applied edit would leave the teacher with a level they never wrote.
    expect(alerted, 'an unparsable box must say so').toMatch(/not valid JSON/);
    expect(levels[0].content_json).toEqual(studio.blankContent('sorting'));
  });

  it('applies a JSON level that does parse', () => {
    alerted = null;
    const levels = open({ levels: [{ level_type: 'sorting', content_json: studio.blankContent('sorting') }] });
    studio.editContent(0, 'json', '{"instruction":"Trie","categories":[],"items":[]}');
    expect(alerted).toBeNull();
    expect(levels[0].content_json.instruction).toBe('Trie');
  });

  it('swaps the shape when a shell wraps a different mechanic, keeping the story', () => {
    const levels = open({ levels: [{ level_type: 'treasure_hunt', content_json: { ...studio.blankContent('multiple_choice'), mechanic: 'multiple_choice', worldText: 'Le héros ouvre la porte.' } }] });
    studio.editContent(0, 'mechanic', 'matching');
    const c = levels[0].content_json;
    // The words carry over; the old mechanic's options do not, or the level
    // would keep its multiple-choice shape under the new mechanic's fields.
    expect(c.mechanic).toBe('matching');
    expect(c.worldText).toBe('Le héros ouvre la porte.');
    expect(c.options).toBeUndefined();
    expect(c.pairs).toEqual([{ id: 'p1', left: '', right: '' }, { id: 'p2', left: '', right: '' }]);
  });
});

describe('the editor shows the fields the mechanic actually uses', () => {
  const level = mechanic => [{ level_type: mechanic, content_json: studio.blankContent(mechanic) }];

  it('asks for options and which one is right for multiple choice', () => {
    open({ levels: level('multiple_choice') });
    const html = studio.contentFields(0, 'multiple_choice');
    expect(html).toContain('Correct answer');
    expect(html).toContain('<textarea');
    expect(html).not.toContain('JSON');
  });

  it('asks for the two matching columns, not a JSON blob', () => {
    open({ levels: level('matching') });
    const html = studio.contentFields(0, 'matching');
    expect(html).toContain('Left column');
    expect(html).toContain('Right column');
    expect(html).not.toContain('Content (JSON)');
  });

  it('asks for the gap, not the ids the mechanic needs', () => {
    open({ levels: level('drag_drop') });
    const html = studio.contentFields(0, 'drag_drop');
    expect(html).toContain('{blank}');
    expect(html).toContain('Word that fills the gap');
  });

  it('falls back to JSON for a mechanic with no simple form, and keeps the ids visible', () => {
    for (const mechanic of ['memory', 'sorting', 'sequence', 'find_correct', 'bubble_pop']) {
      open({ levels: level(mechanic) });
      const html = studio.contentFields(0, mechanic);
      expect(html, `${mechanic} must be editable`).toContain('Content (JSON)');
      // A note about the ids, because a JSON box that loses them breaks the level.
      expect(html, `${mechanic} must warn about ids`).toMatch(/correctId|ids/);
    }
  });

  it('offers the mechanic and the story line for a narrative shell', () => {
    open({ levels: [{ level_type: 'treasure_hunt', content_json: { ...studio.blankContent('multiple_choice'), mechanic: 'multiple_choice', worldText: '' } }] });
    const html = studio.contentFields(0, 'multiple_choice');
    expect(html).toContain('Mechanic');
    expect(html).toContain('Story line');
    // The wrapped mechanic still gets its own fields: a shell is not a reason to
    // fall back to JSON for a mechanic that has a simple form.
    expect(html).toContain('Question');
    expect(html).not.toContain('Content (JSON)');
  });

  it('shows the shell fields and JSON when the shell wraps a mechanic with no form', () => {
    open({ levels: [{ level_type: 'treasure_hunt', content_json: { ...studio.blankContent('memory'), mechanic: 'memory', worldText: '' } }] });
    const html = studio.contentFields(0, 'memory');
    expect(html).toContain('Mechanic');
    expect(html).toContain('Story line');
    expect(html).toContain('Content (JSON)');
  });

  it('reads the mechanic a shell wraps, not the shell', () => {
    const [l] = open({ levels: [{ level_type: 'treasure_hunt', content_json: { mechanic: 'matching', pairs: [] } }] });
    expect(studio.levelMechanic(l)).toBe('matching');
    expect(studio.levelMechanic({ level_type: 'sorting', content_json: {} })).toBe('sorting');
  });
});

describe('a level on the review row shows the question, not the mechanic', () => {
  const shell = mechanic => ({
    level_type: 'treasure_hunt',
    content_json: { mechanic, worldText: 'Le coffre s\'ouvre !', ...studio.blankContent(mechanic) },
  });

  it('shows the question of a level wrapped in an adventure', () => {
    // This is what a teacher was shown instead: "mechanic: multiple_choice",
    // which says nothing about the words their child would be asked to read.
    const l = shell('multiple_choice');
    l.content_json.question = 'Quelle clé ouvre ce coffre ?';
    expect(studio.levelSummary(l)).toBe('Quelle clé ouvre ce coffre ?');
  });

  it('shows something readable for every mechanic a shell can wrap', () => {
    const l = shell('matching');
    l.content_json.pairs = [{ left: 'Chien', right: 'Ouah' }, { left: 'Chat', right: 'Miaou' }];
    expect(studio.levelSummary(l)).toBe('2 pairs to match');

    const word = shell('word_order');
    word.content_json.answer = 'CHAT';
    expect(studio.levelSummary(word)).toBe('CHAT');

    const gap = shell('drag_drop');
    gap.content_json.template = 'Le {blank} brille.';
    expect(studio.levelSummary(gap)).toBe('Le {blank} brille.');
  });

  it('never answers with the name of the mechanic', () => {
    // The whole point: a row reading "mechanic: multiple_choice" told the
    // teacher about the plumbing instead of the content.
    for (const mechanic of CORE) {
      const l = shell(mechanic);
      const shown = studio.levelSummary(l);
      expect(shown, `${mechanic} must not show its mechanic name`).not.toMatch(/mechanic/i);
      expect(shown, `${mechanic} must not show a raw id`).not.toBe(mechanic);
    }
  });

  it('says an unwritten level is waiting for a question', () => {
    // Not "no content": that reads as a broken level, and the teacher would not
    // know that the next thing to do is write one.
    expect(studio.levelSummary({ level_type: 'multiple_choice', content_json: studio.blankContent('multiple_choice') }))
      .toMatch(/Empty/);
  });

  it('describes a level from a content_json sent as a string', () => {
    // A saved level comes back as a string; the row must still read correctly.
    const l = { level_type: 'multiple_choice', content_json: JSON.stringify({ question: 'Combien font 2 + 2 ?', options: [] }) };
    expect(studio.levelSummary(l)).toBe('Combien font 2 + 2 ?');
  });

  it('shows the story line from inside content_json', () => {
    // The story line was read from the level row, where it never lives, so a
    // level that had one showed the question alone and the adventure went
    // missing from review.
    const wrapped = { level_type: 'treasure_hunt', content_json: { mechanic: 'multiple_choice', worldText: 'Le coffre s’ouvre sur la plage.', question: 'Quelle clé ouvre ce coffre ?', options: ['La dorée'], answer: 0 } };
    expect(studio.reviewWorldText(wrapped)).toBe('Le coffre s’ouvre sur la plage.');
    expect(studio.reviewWorldText({ level_type: 'treasure_hunt', content_json: JSON.stringify({ worldText: 'Idem.' }) })).toBe('Idem.');
  });

  it('shows no story line for a level that has none, rather than guessing', () => {
    expect(studio.reviewWorldText({ level_type: 'multiple_choice', content_json: { question: 'Oui ?', options: [], answer: 0 } })).toBe('');
    expect(studio.reviewWorldText({ level_type: 'multiple_choice' })).toBe('');
  });
});

describe('a level is playable whatever the mechanic calls its content', () => {
  it('accepts a picture level, which keeps it in template and choices', () => {
    // preflight only knew question/items/cards/sequence/bubbles/leftItems/
    // categories, so every find_correct level was reported as having nothing to
    // play, even though it worked.
    expect(studio.hasPlayableContent({ question: 'Which one?', template: 'find-the-dog', choices: ['a dog', 'a cat'], answer: 0 })).toBe(true);
    expect(studio.hasPlayableContent({ question: 'Which one?', template: 'find-the-dog' })).toBe(true);
  });

  it('accepts the shapes the other mechanics use', () => {
    expect(studio.hasPlayableContent({ question: '2+2 ?', options: ['4', '5'], answer: 0 })).toBe(true);
    expect(studio.hasPlayableContent({ items: [{ id: 'a', value: 'C' }] })).toBe(true);
    expect(studio.hasPlayableContent({ categories: [{ name: 'Animaux' }] })).toBe(true);
    expect(studio.hasPlayableContent({ pairs: [{ left: 'a', right: 'b' }] })).toBe(true);
    expect(studio.hasPlayableContent({ question: 'Remplis', answer: 'chat' })).toBe(true);
    expect(studio.hasPlayableContent({ instruction: 'Range-les', sequence: [{ id: 's1', value: 'un' }] })).toBe(true);
  });

  it('rejects a level with nothing in it, or with only empty scaffolding', () => {
    expect(studio.hasPlayableContent({})).toBe(false);
    expect(studio.hasPlayableContent({ options: [], answer: 0 })).toBe(false);
    expect(studio.hasPlayableContent({ question: '   ', options: [] })).toBe(false);
    expect(studio.hasPlayableContent({ items: [] })).toBe(false);
    expect(studio.hasPlayableContent({ pairs: {} })).toBe(false);
    expect(studio.hasPlayableContent(null)).toBe(false);
  });
});

describe('an imported file is checked in its own language', () => {
  const check = (parsed, wizardLanguage) => {
    studio.state.wizard = { data: { language: wizardLanguage || 'en' } };
    return studio.importedLanguage(parsed);
  };

  it('follows the file, not the wizard', () => {
    // A level set pasted from a French class while the wizard is in English is
    // the normal case, and checking it against English rules rejects good levels.
    expect(check([{ language: 'fr', content: {} }], 'en')).toBe('fr');
    expect(check({ levels: [{ content_json: { language: 'es' } }] }, 'en')).toBe('es');
  });

  it('falls back to the wizard when the file does not say', () => {
    expect(check([{ content: { question: 'Bonjour' } }], 'en')).toBe('en');
    expect(check([{ content: { question: 'Bonjour' } }], 'fr')).toBe('fr');
    expect(check([], 'fr')).toBe('fr');
    expect(check({ levels: [] }, 'en')).toBe('en');
  });

  it('does not guess when the file contradicts itself', () => {
    // Two languages mean the file is mixed, and picking either one would check
    // half of it against the wrong rules.
    expect(check([{ language: 'fr' }, { language: 'en' }], 'en')).toBe('en');
  });

  it('ignores a language that is not a language', () => {
    expect(check([{ language: 'English' }], 'fr')).toBe('fr');
    expect(check([{ language: 42 }], 'fr')).toBe('fr');
  });
});
