/**
 * tests/unit/kids-question-bridge.test.js
 *
 * The bridge is the one place a question becomes a playable level, and it is
 * used by three callers that must agree: the import validator, the copy-paste
 * file, and the question bank. When two of them disagree, a level imports in one
 * place and is rejected in another, or plays with the wrong content.
 *
 * These tests pin the behaviour a level depends on: the Questions-tab shape is
 * accepted, a level comes back out as a question, and nothing is invented when
 * the question is too thin to build a mechanic.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeLevelToGameShape,
  questionToLevelContent,
  levelToQuestion,
  resolveLevelMechanic,
  isQuestionForm,
  blankLevelContent,
  BANKABLE_TYPES,
  QUESTION_FORM_MECHANICS,
} from '../../src/shared/kids-question-bridge.js';
import { validateLevelsFile } from '../../src/shared/kids-level-checks.js';

const fr = { language: 'fr' };

describe('a level written as a question becomes playable content', () => {
  it('builds a multiple-choice level, keeping the answer as the chosen option', () => {
    const level = normalizeLevelToGameShape({
      text: 'Combien font 4 + 3 ?', options: ['6', '7', '8'], answer: '7',
    }, fr);
    expect(level.level_type).toBe('multiple_choice');
    expect(level.content_json.question).toBe('Combien font 4 + 3 ?');
    expect(level.content_json.options.map(o => o.value)).toEqual(['6', '7', '8']);
    // The ids are the app's, not the model's to keep in step.
    expect(level.content_json.correctId).toBe('opt2');
    expect(level.content_json.instruction).toBe('Choisis la bonne réponse !');
  });

  it('reads the Questions-tab type, so the same words name the mechanic', () => {
    expect(resolveLevelMechanic({ type: 'mcq' })).toBe('multiple_choice');
    expect(resolveLevelMechanic({ type: 'order' })).toBe('word_order');
    expect(resolveLevelMechanic({ type: 'fill-blank' })).toBe('drag_drop');
    expect(resolveLevelMechanic({ type: 'matching' })).toBe('matching');
    // true-false is a question type, not one of the nine mechanics: it plays as
    // a multiple choice, because that is the only mechanic that shows options.
    expect(resolveLevelMechanic({ type: 'true-false' })).toBe('multiple_choice');
  });

  it('shows a true or false question as its two options', () => {
    const level = normalizeLevelToGameShape({
      type: 'true-false', text: 'Le chat peut voler.', answer: 'false',
    }, fr);
    expect(level.level_type).toBe('multiple_choice');
    expect(level.content_json.options.map(o => o.value)).toEqual(['True', 'False']);
    expect(level.content_json.correctId).toBe('tf2');
  });

  it('turns matching pairs into pairs, not into options', () => {
    const level = normalizeLevelToGameShape({
      type: 'matching', text: 'Relie', options: [['chat', 'miaou'], ['chien', 'ouah']],
    }, fr);
    expect(level.level_type).toBe('matching');
    expect(level.content_json.pairs).toEqual([
      { id: 'p1', left: 'chat', right: 'miaou' },
      { id: 'p2', left: 'chien', right: 'ouah' },
    ]);
  });

  it('splits an answer word into the letters to drag', () => {
    const level = normalizeLevelToGameShape({ type: 'order', text: 'Le mot', answer: 'CHAT' }, fr);
    expect(level.level_type).toBe('word_order');
    expect(level.content_json.answer).toBe('CHAT');
    expect(level.content_json.items.map(i => i.value).join('')).toBe('CHAT');
  });

  it('turns a gap and an answer into a template, a blank and choices', () => {
    const level = normalizeLevelToGameShape({
      type: 'fill-blank', text: 'Le ___ brille.', answer: 'soleil', options: ['soleil', 'lune'],
    }, fr);
    expect(level.level_type).toBe('drag_drop');
    expect(level.content_json.template).toBe('Le {blank} brille.');
    expect(level.content_json.blanks).toEqual([{ position: 3, answer: 'soleil' }]);
    expect(level.content_json.choices.map(c => c.value)).toEqual(['soleil', 'lune']);
  });

  it('writes the rest of the level the wizard asked for onto the conversion', () => {
    const level = normalizeLevelToGameShape({
      text: 'Combien font 4 + 3 ?', options: ['7', '8'], answer: '7',
      points: 15, hint: 'Compte sur tes doigts', explanation: '4 + 3 font 7',
    }, fr);
    expect(level.points).toBe(15);
    expect(level.hint).toBe('Compte sur tes doigts');
    expect(level.explanation).toBe('4 + 3 font 7');
  });
});

describe('a level already written as content_json is left alone', () => {
  it('passes a content level through untouched', () => {
    const content = {
      instruction: 'Trie !',
      categories: [{ id: 'c1', label: 'Mer' }],
      items: [{ id: 'i1', value: 'poisson', categoryId: 'c1' }],
    };
    const level = normalizeLevelToGameShape({ level_type: 'sorting', content_json: content }, fr);
    expect(level.level_type).toBe('sorting');
    expect(level.content_json).toEqual(content);
  });

  it('keeps a level that states a mechanic, even if it also has a text field', () => {
    // A matching level's instruction must not be mistaken for a question, which
    // would throw away its pairs.
    const content = { instruction: 'Relie', pairs: [{ id: 'p1', left: 'a', right: 'b' }] };
    const level = normalizeLevelToGameShape({ level_type: 'matching', content_json: content }, fr);
    expect(level.content_json).toEqual(content);
  });

  it('leaves a game-only mechanic alone, since no question stands in for it', () => {
    for (const mechanic of ['memory', 'sorting', 'sequence', 'find_correct', 'bubble_pop']) {
      expect(QUESTION_FORM_MECHANICS, `${mechanic} has no question form`).not.toContain(mechanic);
    }
  });
});

describe('a level goes back out as a question', () => {
  it('reads a multiple-choice level as a question with its options', () => {
    const level = normalizeLevelToGameShape({
      text: 'Combien font 4 + 3 ?', options: ['6', '7'], answer: '7', explanation: 'e', points: 15,
    }, fr);
    const q = levelToQuestion(level);
    expect(q.type).toBe('mcq');
    expect(q.text).toBe('Combien font 4 + 3 ?');
    expect(q.options).toEqual(['6', '7']);
    expect(q.answer).toBe('7');
    expect(q.points).toBe(15);
  });

  it('reads a true or false level back as a true-false question', () => {
    const level = normalizeLevelToGameShape({ type: 'true-false', text: 'x', answer: 'true' }, fr);
    const q = levelToQuestion(level);
    expect(q.type).toBe('true-false');
    expect(q.answer).toBe('true');
    expect(q.options, 'a true-false question carries no options list').toBeNull();
  });

  it('round-trips a question without changing what it asks', () => {
    for (const question of [
      { text: 'Combien font 4 + 3 ?', options: ['6', '7', '8'], answer: '7' },
      { type: 'true-false', text: 'Le chat peut voler.', answer: 'false' },
      { type: 'order', text: 'Le mot', answer: 'CHAT' },
    ]) {
      const back = levelToQuestion(normalizeLevelToGameShape(question, fr));
      expect(back.answer).toBe(question.answer);
      expect(back.type).toBe(question.type || 'mcq');
      // word_order is the one mechanic whose content has nowhere to keep the
      // question text, so it comes back as the instruction the game shows. The
      // answer, which is what the bank holds, survives.
      if (question.type === 'order') {
        expect(back.text).toBe('Remets les lettres dans le bon ordre !');
      } else {
        expect(back.text).toBe(question.text);
      }
    }
  });
});

describe('a bank row is read the same way as a pasted question', () => {
  // The bank keeps its options as a JSON string, so a converter that only
  // accepted an array would quietly drop every pulled-in question.
  it('reads options_json as the option list', () => {
    const content = questionToLevelContent(
      { text: 'Combien font 4 + 3 ?', options_json: '["7","8"]', answer: '7' },
      'multiple_choice',
    );
    expect(content.options.map(o => o.value)).toEqual(['7', '8']);
    expect(content.correctId).toBe('opt1');
  });

  it('reads pairs and a serialised order out of the answer column', () => {
    expect(questionToLevelContent(
      { text: 'Relie', options_json: '[["chat","miaou"],["chien","ouah"]]', answer: 'x' },
      'matching',
    ).pairs).toHaveLength(2);

    const order = questionToLevelContent({ text: 'Ordonne', options_json: null, answer: '["A","C"]' }, 'word_order');
    expect(order.items.map(i => i.value)).toEqual(['A', 'C']);
    expect(order.answer).toBe('A C');
  });

  it('doubles the pairs into a memory deck', () => {
    const content = questionToLevelContent(
      { text: 'Paires', options_json: '[["Chien","Ouah"],["Chat","Miaou"]]', answer: 'x' },
      'memory',
    );
    expect(content.cards).toHaveLength(4);
    // A pair is two cards sharing one matchId, and each matchId twice.
    for (const matchId of new Set(content.cards.map(c => c.matchId))) {
      expect(content.cards.filter(c => c.matchId === matchId)).toHaveLength(2);
    }
  });

  it('says no instead of inventing content it does not have', () => {
    // A multiple-choice question with no options cannot become a level, and a
    // guessed option would be shown to a child as if it were the teacher's.
    expect(questionToLevelContent({ text: 'x', answer: 'y' }, 'multiple_choice')).toBeNull();
    expect(questionToLevelContent({ text: 'x', options: [['a', 'b']] }, 'matching')).toBeNull();
  });

it('keeps a true/false question bankable even though it has no mechanic', () => {
  // The Questions tab holds true/false, and it plays as a two-option level, so
  // dropping it from this list stopped a real question being used in an activity.
  expect(BANKABLE_TYPES).toContain('true-false');
  expect(BANKABLE_TYPES).toContain('mcq');
});
});

describe('an empty level is empty, not a made-up question', () => {
  // Ids are the app's own scaffolding, not words anyone would mistake for a
  // question, so they are the one string a blank level may carry.
  const ID_KEYS = new Set(['id', 'correctId', 'matchId', 'categoryId']);
  const STRUCTURAL = new Set(['{blank}']);
  const everyWord = (value, key = '', out = []) => {
    if (typeof value === 'string' && !ID_KEYS.has(key)) out.push(value);
    else if (Array.isArray(value)) value.forEach(v => everyWord(v, key, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) everyWord(v, k, out);
    }
    return out;
  };

  it('starts a mechanic with nothing written in it', () => {
    for (const mechanic of ['multiple_choice', 'matching', 'word_order', 'drag_drop', 'memory', 'sorting', 'sequence', 'find_correct', 'bubble_pop']) {
      const words = everyWord(blankLevelContent(mechanic)).filter(s => s.trim() !== '' && !STRUCTURAL.has(s));
      // The rows a mechanic needs to type into are there; the words in them are not.
      expect(words, `${mechanic} must start with no text`).toEqual([]);
    }
  });

  it('never leaves a placeholder string a teacher could ship by accident', () => {
    for (const mechanic of ['multiple_choice', 'matching', 'word_order', 'drag_drop', 'memory']) {
      const text = JSON.stringify(blankLevelContent(mechanic));
      expect(text, `${mechanic} must not ship placeholder copy`).not.toMatch(/Question to customise|Option A|Option B|TODO|Choose the right answer/);
    }
  });
});

describe('the import check accepts what the Questions tab writes', () => {
  it('passes a file of plain questions', () => {
    const result = validateLevelsFile([
      { text: 'Combien font 4 + 3 ?', options: ['6', '7'], answer: '7' },
      { type: 'true-false', text: 'Le chat peut voler.', answer: 'false' },
      { type: 'matching', text: 'Relie', options: [['chat', 'miaou'], ['chien', 'ouah']] },
    ], fr);
    expect(result.problems.map(p => p.message)).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(3);
  });

  it('still reports a level whose answer is not one of its options', () => {
    const result = validateLevelsFile([
      { text: 'q', options: ['a', 'b'], answer: 'zz' },
    ], fr);
    expect(result.ok).toBe(false);
    expect(result.problems[0].message).toMatch(/correctId|answer/);
  });

  it('tells a level_type that is neither a mechanic nor a game apart from a bad question', () => {
    const result = validateLevelsFile([{ level_type: 'not_a_game', content_json: {} }], fr);
    expect(result.ok).toBe(false);
    expect(result.problems[0].message).toMatch(/not_a_game/);
  });
});

describe('a level is recognised as a question only when it is one', () => {
  it('needs text and something to answer with', () => {
    expect(isQuestionForm({ text: 'q', answer: 'a' })).toBe(true);
    expect(isQuestionForm({ text: 'q', options: ['a'] })).toBe(true);
    expect(isQuestionForm({ level_type: 'matching', content_json: { instruction: 'i' } })).toBe(false);
    expect(isQuestionForm({ level_type: 'memory', content_json: { cards: [] } })).toBe(false);
    expect(isQuestionForm({ level_type: 'word_order', content_json: { answer: 'CHAT' } })).toBe(false);
    expect(isQuestionForm(null)).toBe(false);
  });
});
