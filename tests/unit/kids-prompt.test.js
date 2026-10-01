/**
 * tests/unit/kids-prompt.test.js
 *
 * The "Copy a ready-to-paste prompt" button sends the wizard to an assistant the
 * teacher chose. If a field is missing from it, nothing errors: the assistant
 * just writes levels for the wrong age, the wrong language or the wrong topic,
 * and the teacher finds out by reading six questions that do not match what they
 * asked for. A silent omission is the failure mode this file exists to prevent.
 *
 * The prompt is one JSON object, which is the point of the rewrite: a model
 * follows a schema far more reliably than a page of prose, and a teacher can
 * paste the result straight into a checker. So these tests parse it. If the
 * prompt stops being valid JSON, that is a real defect, not a formatting nit.
 *
 * The prompt lives in a browser script loaded with a plain <script> tag, so the
 * builder is lifted out of the source and evaluated here rather than imported.
 * The markers are the function boundaries; if one moves, this fails loudly
 * instead of quietly testing nothing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(resolve(ROOT, 'kids-management.js'), 'utf8');
const at = marker => {
  const i = SRC.indexOf(marker);
  if (i < 0) throw new Error(`kids-management.js no longer contains ${JSON.stringify(marker)}; update this test's markers`);
  return i;
};

const formatTable = SRC.slice(at('const MECHANIC_FORMAT'), at('const NARRATIVE_TEMPLATES'));
const narrativeLine = SRC.slice(at('const NARRATIVE_TEMPLATES'), SRC.indexOf('\n', at('const NARRATIVE_TEMPLATES')) + 1);
const builders = SRC.slice(at('const LANGUAGE_NAMES'), at('function formatHelp(d)'));

// Stands in for the module-level template list the builders read.
const TEMPLATES = [
  { id: 'treasure_hunt', name: 'Treasure Hunt', category: 'adventure', min_items: 5 },
  { id: 'memory', name: 'Memory Game', category: 'core', min_items: 1 },
  { id: 'board_game', name: 'Board Game', category: 'immersive', min_items: 8 },
];
const THEME_NAMES = { jungle: 'Jungle & Adventure', space: 'Space & Galaxies' };

const load = new Function(
  'D', 'templates', 'fallbackTemplates', 'themeNames',
  `${formatTable}\n${narrativeLine}\n${builders}\nreturn { formatPrompt, promptContext, MECHANIC_FORMAT, DIFFICULTY_GUIDE, LANGUAGE_NAMES, COMMON_QUESTION_FORMAT, GAME_ONLY_IDS };`,
);
const build = d => load(d, TEMPLATES, TEMPLATES, THEME_NAMES);

const FULL = {
  title: 'Le trésor des verbes',
  description: 'Un jeu pour réviser la conjugaison au présent.',
  subject: 'french',
  sub_topic: 'conjugaison',
  objective: 'Conjuguer les verbes du 1er groupe au présent',
  grade: 'CP',
  age_min: 6,
  age_max: 8,
  difficulty: 'easy',
  language: 'fr',
  game_template: 'treasure_hunt',
  theme: 'jungle',
  count: 6,
  class_ids: ['a', 'b'],
};

const promptFor = d => build(d).formatPrompt(d);
const parsed = d => JSON.parse(promptFor(d));
const says = (prompt, needle) => expect(prompt, `the prompt must state: ${needle}`).toContain(needle);

describe('the prompt is one JSON object a model and a checker can both read', () => {
  it('parses as JSON, and says what it is for', () => {
    const p = parsed(FULL);
    expect(p.task).toContain("children's educational game");
    expect(p.answer.return).toContain('One JSON object and nothing else');
  });

  it('states the rules as a list, not as prose paragraphs', () => {
    const p = parsed(FULL);
    expect(Array.isArray(p.rules)).toBe(true);
    expect(p.rules.length).toBeGreaterThan(8);
    for (const rule of p.rules) expect(typeof rule).toBe('string');
  });

  it('asks for the number of levels the wizard settled on', () => {
    expect(parsed(FULL).answer.levels).toBe(6);
  });
});

describe('the context carries the whole wizard', () => {
  it('names every field the teacher filled in', () => {
    const c = parsed(FULL).context;
    for (const [field, value] of [
      ['title', 'Le trésor des verbes'],
      ['about', 'Un jeu pour réviser la conjugaison au présent.'],
      ['subject', 'french'],
      ['sub_topic', 'conjugaison'],
      ['objective', 'Conjuguer les verbes du 1er groupe au présent'],
      ['class_level', 'CP'],
      ['ages', '6 to 8'],
      ['difficulty', 'easy'],
      ['game', 'treasure_hunt'],
      ['world', 'Jungle & Adventure'],
      ['levels', 6],
      ['played_by', '2 classes of this school'],
    ]) {
      expect(c[field], `the prompt must carry the ${field} from the wizard`).toBe(value);
    }
    // The language travels twice on purpose: the code is a filter, the name is
    // what a model has to obey.
    expect(c.language).toBe('fr');
    expect(c.language_name).toBe('French');
  });

  it('marks an unfilled field instead of dropping it', () => {
    const sparse = { language: 'fr', count: 3 };
    const c = parsed(sparse).context;
    for (const field of ['title', 'about', 'subject', 'sub_topic', 'objective', 'class_level', 'ages', 'game', 'world']) {
      expect(c[field], `${field} must be marked when the teacher left it blank`).toBe('<not set>');
    }
  });

  it('infers the objective from the topic when the teacher left it blank', () => {
    const d = { subject: 'maths', sub_topic: 'additions', grade: 'CE1' };
    expect(parsed(d).context.objective).toContain('so drill "maths - additions" at CE1 level');
  });

  it('does not send class names or ids to a third-party assistant', () => {
    const d = { ...FULL, class_ids: ['3f1c-uuid', 'CM1 A'] };
    const text = promptFor(d);
    expect(text).not.toMatch(/3f1c-uuid|CM1 A/);
    // The count of classes is still there: it is audience, not identity.
    expect(parsed(d).context.played_by).toBe('2 classes of this school');
  });

  it('raises the count to what the game needs, and admits it moved', () => {
    const d = { ...FULL, game_template: 'board_game', count: 3 };
    const c = parsed(d).context;
    expect(c.levels).toBe(8);
    expect(c.levels_note).toBe('raised from 3: this game needs at least 8');
  });
});

describe('the prompt turns the wizard into usable instructions', () => {
  it('asks for the output language by name, not by code', () => {
    for (const [code, name] of [['fr', 'French'], ['en', 'English'], ['ar', 'Arabic']]) {
      const d = { ...FULL, language: code };
      expect(parsed(d).rules.join('\n')).toContain(`Write every single word in ${name}`);
    }
  });

  it('explains every difficulty instead of passing the word through', () => {
    const { DIFFICULTY_GUIDE } = build(FULL);
    for (const level of Object.keys(DIFFICULTY_GUIDE)) {
      const d = { ...FULL, difficulty: level };
      const c = parsed(d).context;
      expect(c.difficulty_means, `difficulty ${level} must carry its own guidance`).toBe(DIFFICULTY_GUIDE[level]);
    }
  });

  it('uses the ages to set the reading level, and says so when they are unknown', () => {
    const rules = parsed(FULL).rules.join('\n');
    expect(rules).toContain('The players are 6 to 8 years old');
    const d = { ...FULL, age_min: '', age_max: '' };
    expect(parsed(d).rules.join('\n')).toContain('primary school children');
  });

  it('keeps the levels distinct and ordered', () => {
    const rules = parsed(FULL).rules.join('\n');
    expect(rules).toContain('The 6 levels must be 6 different questions');
    expect(rules).toContain('level 1 is the easiest, level 6 is the hardest');
  });

  it('uses the chosen world, and keeps quiet about it when none is chosen', () => {
    const core = { ...FULL, game_template: 'memory' };
    expect(parsed(core).rules.join('\n')).toContain('The world is "Jungle & Adventure"');

    const blank = { ...core, theme: '' };
    const rules = parsed(blank).rules.join('\n');
    expect(rules).toContain('No world was chosen');
  });
});

describe('a core game is sent the one shape it can play', () => {
  // A core game plays its own mechanic and nothing else, so a level file that
  // mixes mechanics produces levels the game never shows. One shape is also what
  // keeps the prompt short enough to paste anywhere.
  it('sends a plain question for the five mechanics the Questions tab shares', () => {
    const { COMMON_QUESTION_FORMAT, MECHANIC_FORMAT } = build(FULL);
    for (const [id, def] of Object.entries(COMMON_QUESTION_FORMAT)) {
      const shape = parsed({ ...FULL, game_template: id }).level_shape;
      // The same keys the Questions tab asks for, nothing else: no level_type,
      // no content_json, no ids for the app to renumber.
      expect(Object.keys(shape).sort()).toEqual(
        ['type', 'note', 'how', ...(def.variants ? ['other_types'] : []), ...Object.keys(def.shape)].sort(),
      );
      expect(shape.type).toBe(def.type);
      expect(shape.text).toBe(def.shape.text);
      expect(shape.answer).toBe(def.shape.answer);
      if (def.shape.options) expect(shape.options).toEqual(def.shape.options);
      expect(shape.note).toBe(def.note);
      // The chosen mechanic is the only shape in the prompt.
      expect(shape.mechanics, `${id} must not ship the other mechanics`).toBeUndefined();
      if (MECHANIC_FORMAT[id]) {
        expect(JSON.stringify(shape)).not.toContain(MECHANIC_FORMAT[id].skeleton);
      }
    }
  });

  it('still produces a prompt before a game is chosen', () => {
    // The copy button is reachable before the wizard has a game, and a teacher
    // who clicks it then must not get a broken prompt.
    const d = { language: 'fr', count: 3 };
    const p = parsed(d);
    expect(p.context.game).toBe('<not set>');
    expect(p.level_shape.type).toBe('mcq');
    expect(p.level_shape.text).toBeDefined();
    expect(p.rules.join('\n')).toContain('Use the multiple_choice shape shown above');
  });

  it('says so in the note, and tells the model not to add a mechanic', () => {
    const d = { ...FULL, game_template: 'multiple_choice' };
    const p = parsed(d);
    expect(p.level_shape.how).toContain('written as a question exactly like the Questions tab');
    expect(p.rules.join('\n')).toContain('Use the multiple_choice shape shown above for every level');
  });

  it('sends the content_json shape for a mechanic with no question equivalent', () => {
    const { GAME_ONLY_IDS, MECHANIC_FORMAT } = build(FULL);
    for (const id of GAME_ONLY_IDS) {
      const d = { ...FULL, game_template: id };
      const shape = parsed(d).level_shape;
      expect(shape.how).toContain(`sets level_type to "${id}"`);
      expect(shape.example, `${id} must be spelled out field by field`).toEqual(JSON.parse(MECHANIC_FORMAT[id].skeleton));
      expect(shape.note).toBe(MECHANIC_FORMAT[id].note);
      expect(shape.text, `${id} is not a question form`).toBeUndefined();
    }
  });

  it('uses the answer type the bridge understands', () => {
    const types = ['multiple_choice', 'matching', 'drag_drop', 'word_order'];
    expect(types.map(id => parsed({ ...FULL, game_template: id }).level_shape.type))
      .toEqual(['mcq', 'matching', 'fill-blank', 'order']);
    // A multiple-choice answer is copied from the options, which is the one
    // thing an assistant gets wrong when it is not told.
    const mcq = parsed({ ...FULL, game_template: 'multiple_choice' }).level_shape;
    expect(mcq.options).toContain(mcq.answer);
  });

  it('offers a true or false question as another type of multiple choice', () => {
    // true-false is a question type, not one of the nine mechanics, so it can
    // only ever be a multiple-choice level. The prompt says so instead of
    // offering a game that does not exist.
    const mcq = parsed({ ...FULL, game_template: 'multiple_choice' }).level_shape;
    expect(mcq.other_types['true-false'].answer).toBe('false');
    expect(mcq.other_types['true-false'].note).toContain('"true" or "false"');
    expect(mcq.other_types['true-false'].options, 'a true-false question carries no options').toBeUndefined();
    for (const id of ['matching', 'drag_drop', 'word_order']) {
      expect(parsed({ ...FULL, game_template: id }).level_shape.other_types).toBeUndefined();
    }
  });

  it('keeps {blank} literal, so a gap is not interpolated away', () => {
    expect(promptFor({ ...FULL, game_template: 'drag_drop' })).toContain('{blank}');
    expect(promptFor({ ...FULL, game_template: 'drag_drop' })).not.toContain('${');
  });

  it('spells out every mechanic for an adventure shell, which nests content_json', () => {
    const { MECHANIC_FORMAT } = build(FULL);
    const p = parsed(FULL);
    // An adventure level cannot use the flat question form: its mechanic has to
    // sit inside content_json next to worldText, so each one is shown.
    for (const [id, def] of Object.entries(MECHANIC_FORMAT)) {
      expect(p.level_shape.mechanics[id].example, `the ${id} shape must be in the prompt`).toEqual(JSON.parse(def.skeleton));
      expect(p.level_shape.mechanics[id].note).toBe(def.note);
    }
    expect(p.level_shape.text).toBeUndefined();
    expect(p.rules.join('\n')).toContain('Vary the mechanic from level to level');
  });
});

describe('the prompt states the cross references that fail silently', () => {
  // These pass a shape check and then break in front of a child. They were the
  // same silent failures as the missing memory and find_correct shapes in the
  // server prompt.
  it('lists every id rule', () => {
    const rules = parsed(FULL).id_rules.join('\n');
    for (const rule of [
      'correctId must be the id of an option or an item that exists',
      'correctOrder must list every item id exactly once',
      'the item values are the letters of answer, in any order',
      'one blank per {blank} token, position starts at 0',
      'every matchId appears exactly twice',
      'every categoryId is a category you defined',
      'exactly one bubble has "isCorrect": true',
    ]) {
      says(rules, rule);
    }
  });

  it('asks for a hint and an explanation on every level', () => {
    const rules = parsed(FULL).rules.join('\n');
    expect(rules).toContain('short "hint"');
    expect(rules).toContain('"explanation" of why the answer is right');
    expect(rules).toContain('points: 10, or 15 for the last and hardest levels');
  });
});
