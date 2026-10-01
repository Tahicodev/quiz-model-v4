/**
 * src/shared/kids-question-bridge.js
 *
 * One conversion point between the two things a teacher writes: a question (the
 * Questions tab, and the prompt behind it) and a level (a Kids Space game).
 *
 * Both describe the same thing — a prompt, some options, the right answer — so
 * for the mechanics that survive the round trip the level is written in the
 * question's own shape and converted here. The game-only mechanics (memory,
 * sorting, sequence, find_correct, bubble_pop) have no question equivalent, so
 * they keep an explicit `content_json`.
 *
 * This is the only place that knows how to move between the two. The question
 * bank, the import validator and the wizard all go through it, so a question
 * written once is playable in a quiz and in a game, and a level edited in a game
 * still reads as a question in the bank.
 */

import { QUESTION_TYPES } from './constants.js';

/** Kids mechanic -> bank question type, for mechanics that round-trip cleanly. */
export const MECHANIC_TO_QUESTION_TYPE = Object.freeze({
  multiple_choice: QUESTION_TYPES.MCQ,
  find_correct: QUESTION_TYPES.MCQ,
  word_order: QUESTION_TYPES.ORDER,
  sequence: QUESTION_TYPES.ORDER,
  matching: QUESTION_TYPES.MATCHING,
  memory: QUESTION_TYPES.MATCHING,
  drag_drop: QUESTION_TYPES.FILL_BLANK,
  sorting: QUESTION_TYPES.MATCHING,
});

/**
 * Reverse mapping, used when a bank question is pulled into an activity.
 *
 * `true-false` lands on multiple_choice on purpose: it is a question type, not
 * one of the nine mechanics (see KIDS_CORE_MECHANICS), and a level whose
 * level_type is `true_false` would be rejected on import. The game shows the two
 * answers as two options, so nothing is lost but the label.
 */
export const QUESTION_TYPE_TO_MECHANIC = Object.freeze({
  [QUESTION_TYPES.MCQ]: 'multiple_choice',
  [QUESTION_TYPES.TRUE_FALSE]: 'multiple_choice',
  [QUESTION_TYPES.ORDER]: 'word_order',
  [QUESTION_TYPES.MATCHING]: 'matching',
  [QUESTION_TYPES.FILL_BLANK]: 'drag_drop',
});

/**
 * A question of this type plays as two options, True and False, whichever
 * mechanic carries it. Kept here rather than in the mapping because it changes
 * the content, not the level_type.
 */
export const TRUE_FALSE_QUESTION_TYPES = Object.freeze([QUESTION_TYPES.TRUE_FALSE]);

/**
 * Question types a Kids level may be built from.
 *
 * The keys of the reverse mapping, not the values of the forward one: `true-false`
 * has no mechanic of its own, so it is absent from MECHANIC_TO_QUESTION_TYPE and
 * taking that mapping's values alone made true/false questions unbankable, even
 * though the Questions tab can hold one and it plays as a two-option level.
 */
export const BANKABLE_TYPES = Object.freeze(Object.keys(QUESTION_TYPE_TO_MECHANIC));

/**
 * Mechanics a plain question can carry with nothing lost, so they may be written
 * as `{ text, options, answer }` instead of a full `content_json`.
 *
 * Deliberately narrower than BANKABLE_TYPES: find_correct, memory and sorting all
 * map to a question type, but folding them into one loses the mechanic (which
 * option is the odd one out, which cards pair up), and sequence maps to `order`
 * in a way that collides with word_order. Those keep their own content.
 */
export const QUESTION_FORM_MECHANICS = Object.freeze([
  'multiple_choice',
  'matching',
  'word_order',
  'drag_drop',
]);

/** The question tab's own type names, plus the ids used in bulk import. */
const QUESTION_TYPE_ALIASES = Object.freeze({
  mcq: QUESTION_TYPES.MCQ,
  'multiple-choice': QUESTION_TYPES.MCQ,
  'multiple-choice-multi': QUESTION_TYPES.MCQ,
  'multiple_choice': QUESTION_TYPES.MCQ,
  'true-false': QUESTION_TYPES.TRUE_FALSE,
  true_false: QUESTION_TYPES.TRUE_FALSE,
  'fill-blank': QUESTION_TYPES.FILL_BLANK,
  'fill_blank': QUESTION_TYPES.FILL_BLANK,
  fill_blank: QUESTION_TYPES.FILL_BLANK,
  drag_drop: QUESTION_TYPES.FILL_BLANK,
  draggable: QUESTION_TYPES.FILL_BLANK,
  matching: QUESTION_TYPES.MATCHING,
  'matching-pairs': QUESTION_TYPES.MATCHING,
  order: QUESTION_TYPES.ORDER,
  ordering: QUESTION_TYPES.ORDER,
  word_order: QUESTION_TYPES.ORDER,
});

/**
 * Instructions the game shows above the question. Question.text is the question
 * itself, so reusing it here made every level read "Foo? Foo?" (see the bank
 * service's note on the same problem).
 */
const INSTRUCTIONS = Object.freeze({
  multiple_choice: { fr: 'Choisis la bonne réponse !', en: 'Choose the right answer!', ar: 'اختر الإجابة الصحيحة!' },
  true_false: { fr: 'Vrai ou faux ?', en: 'True or false?', ar: 'صح أم خطأ؟' },
  matching: { fr: 'Relie chaque élément à son partenaire !', en: 'Match each one with its pair!', ar: 'وصّل كل عنصر بما يناسبه!' },
  memory: { fr: 'Trouve les paires identiques !', en: 'Find the identical pairs!', ar: 'ابحث عن الأزواج المتشابهة!' },
  word_order: { fr: 'Remets les lettres dans le bon ordre !', en: 'Put the letters in the right order!', ar: 'رتّب الحروف بالترتيب الصحيح!' },
  sequence: { fr: 'Mets ces éléments dans l’ordre !', en: 'Put these in the right order!', ar: 'رتّب هذه العناصر بالترتيب!' },
  drag_drop: { fr: 'Glisse le bon mot dans le trou !', en: 'Drag the right word into the gap!', ar: 'اسحب الكلمة المناسبة إلى الفراغ!' },
});

const instructionFor = (mechanic, language) =>
  (INSTRUCTIONS[mechanic] || INSTRUCTIONS.multiple_choice)[language] ||
  (INSTRUCTIONS[mechanic] || INSTRUCTIONS.multiple_choice).en;

export function parseContent(contentJson) {
  if (contentJson && typeof contentJson === 'object') return contentJson;
  try {
    return JSON.parse(contentJson || '{}');
  } catch {
    return {};
  }
}

/**
 * Best-effort human label for a level, used as the question text when the
 * mechanic has no `question` field of its own.
 */
export function levelToQuestionText(content) {
  if (content.question) return String(content.question);
  if (content.instruction) return String(content.instruction);
  if (content.answer) return String(content.answer);
  if (Array.isArray(content.pairs) && content.pairs.length) {
    return content.pairs.map(p => `${p.left} → ${p.right}`).join(' / ');
  }
  if (Array.isArray(content.items) && content.items.length) {
    return content.items.map(i => i.value).join(' · ');
  }
  return 'Question';
}

/** Serialised answer key + options for the bank columns. */
export function levelToAnswerAndOptions(content) {
  if (Array.isArray(content.options)) {
    const options = content.options.map(o => (typeof o === 'string' ? o : o.value));
    let answer = content.correctId;
    if (answer && Array.isArray(content.options)) {
      const hit = content.options.find(o => o && o.id === answer);
      answer = hit ? hit.value : answer;
    }
    return { optionsJson: JSON.stringify(options), answer: answer ? String(answer) : '' };
  }
  if (Array.isArray(content.pairs)) {
    return { optionsJson: JSON.stringify(content.pairs.map(p => [p.left, p.right])), answer: JSON.stringify(content.pairs) };
  }
  if (Array.isArray(content.sequence) && Array.isArray(content.correctOrder)) {
    const byId = new Map(content.sequence.map(i => [i.id, i.value]));
    return { optionsJson: JSON.stringify(content.sequence.map(i => i.value)), answer: JSON.stringify(content.correctOrder.map(id => byId.get(id) ?? id)) };
  }
  if (Array.isArray(content.blanks) && content.blanks.length) {
    return { optionsJson: null, answer: String(content.blanks[0].answer ?? '') };
  }
  if (content.answer != null) return { optionsJson: null, answer: String(content.answer) };
  if (content.target) return { optionsJson: null, answer: String(content.target.value ?? '') };
  return { optionsJson: null, answer: '' };
}

/** A level, read as a question row the Questions tab would recognise. */
export function levelToQuestion(level) {
  const content = parseContent(level.content_json);
  const { optionsJson, answer } = levelToAnswerAndOptions(content);
  const options = optionsJson ? safeParse(optionsJson) : null;
  // A level whose two options are exactly True and False came from a true/false
  // question, so it goes back to the bank as one instead of as a two-choice
  // multiple choice with the options spelled out.
  const isTrueFalse = Array.isArray(options)
    && options.length === 2
    && options.map(o => String(o).trim().toLowerCase()).sort().join(',') === 'false,true';
  return {
    type: (isTrueFalse && level.level_type === 'multiple_choice')
      ? QUESTION_TYPES.TRUE_FALSE
      : (MECHANIC_TO_QUESTION_TYPE[level.level_type] || null),
    text: levelToQuestionText(content),
    options: isTrueFalse ? null : options,
    answer: isTrueFalse
      ? (String(answer).trim().toLowerCase() === 'true' ? 'true' : 'false')
      : answer,
    explanation: level.explanation ?? null,
    points: level.points ?? 10,
  };
}

function safeParse(json) {
  try { return JSON.parse(json); } catch { return null; }
}

/**
 * The mechanic a level should play as. `level_type` wins when it is a mechanic we
 * know; otherwise the question's own `type` decides, so a file written by the
 * Questions tab prompt imports without the teacher restating anything.
 */
export function resolveLevelMechanic(level) {
  const declared = level?.level_type;
  if (declared && MECHANIC_TO_QUESTION_TYPE[declared]) return declared;
  const type = QUESTION_TYPE_ALIASES[String(level?.type || level?.question_type || '').toLowerCase()];
  return (type && QUESTION_TYPE_TO_MECHANIC[type]) || 'multiple_choice';
}

/**
 * True when a level is written as a plain question (`text` + `options`/`answer`)
 * rather than as a full `content_json`.
 */
export function isQuestionForm(level) {
  if (!level || typeof level !== 'object') return false;
  const text = level.text ?? level.question;
  if (typeof text !== 'string' || !text.trim()) return false;
  return Array.isArray(level.options) || level.answer != null || level.choices != null;
}

/**
 * Rebuilds a playable content object from a question written in the Questions
 * tab's shape. Returns null when the question does not carry enough to build the
 * mechanic, so the caller can say so instead of inventing content.
 */
export function questionToLevelContent(question, mechanic, { language = 'en', instruction } = {}) {
  // A bank row keeps its options as a JSON string; a pasted question has them as
  // an array. Both arrive here, so both are accepted.
  const options = Array.isArray(question.options)
    ? question.options
    : (safeParse(question.options_json) || []);
  const text = String(question.text ?? question.question ?? '');
  const answer = question.answer == null ? '' : String(question.answer);
  const lead = instruction || instructionFor(mechanic, language);

  // A true/false question is played as two options whichever mechanic the game
  // uses, because the mechanic only knows how to show a list of options.
  const type = String(question.type || question.question_type || '').toLowerCase();
  if (mechanic === 'multiple_choice' && TRUE_FALSE_QUESTION_TYPES.includes(QUESTION_TYPE_ALIASES[type])) {
    return {
      instruction: instruction || instructionFor('true_false', language),
      question: text,
      options: [
        { id: 'tf1', value: 'True', emoji: '✅' },
        { id: 'tf2', value: 'False', emoji: '❌' },
      ],
      correctId: answer.trim().toLowerCase() === 'true' ? 'tf1' : 'tf2',
    };
  }

  if (mechanic === 'matching' || mechanic === 'memory') {
    // Pairs come from the options when they are there, otherwise from a
    // serialised answer, which is how the bank stores a matching question.
    let pairs = options;
    if (!Array.isArray(pairs) || !pairs.length || typeof pairs[0] !== 'object') {
      pairs = safeParse(answer) || [];
    }
    if (!Array.isArray(pairs) || pairs.length < 2) return null;
    const normalised = pairs
      .map((p, i) => (Array.isArray(p)
        ? { id: `p${i + 1}`, left: p[0], right: p[1] }
        : { id: p.id || `p${i + 1}`, left: p.left ?? p.value, right: p.right ?? p.match }))
      .map(p => ({ ...p, left: String(p.left ?? ''), right: String(p.right ?? '') }));

    if (mechanic === 'memory') {
      // A memory deck is the pairs, doubled: two cards share a matchId.
      const cards = [];
      normalised.forEach((p, i) => {
        cards.push({ id: `c${i}a`, matchId: `m${i}`, value: p.left, type: 'text' });
        cards.push({ id: `c${i}b`, matchId: `m${i}`, value: p.left, type: 'text' });
      });
      return { instruction: lead, cards };
    }
    return { instruction: lead, pairs: normalised };
  }

  if (mechanic === 'word_order' || mechanic === 'sequence') {
    // The answer may list the pieces in order as a serialised array, or be the
    // finished word whose letters are the pieces. The options, when present,
    // are the pieces themselves.
    const parsedAnswer = safeParse(answer);
    const listed = Array.isArray(parsedAnswer) ? parsedAnswer : null;
    const pieces = (listed || options).map(o => (typeof o === 'string' ? o : o?.value))
      .filter(v => v != null && String(v) !== '');

    if (mechanic === 'word_order') {
      if (listed) {
        if (listed.length < 2) return null;
        const items = listed.map((v, i) => ({ id: `n${i + 1}`, value: String(v) }));
        return { instruction: lead, answer: items.map(i => i.value).join(' '), items };
      }
      if (pieces.length >= 2) {
        const items = pieces.map((v, i) => ({ id: `n${i + 1}`, value: String(v) }));
        return { instruction: lead, answer: items.map(i => i.value).join(' '), items };
      }
      // Otherwise the answer is the finished word and its letters are the pieces.
      const letters = [...String(answer).replace(/\s/g, '')];
      if (letters.length < 2) return null;
      return {
        instruction: lead,
        answer,
        items: letters.map((v, i) => ({ id: `n${i + 1}`, value: v })),
      };
    }

    // sequence: the answer is the order, so it has to say what the order is.
    if (pieces.length < 2) return null;
    // When the pieces are also listed as options, they may be in any order, so
    // the answer's order is mapped back onto the ids the level will show.
    const shuffled = options.length >= 2 && listed;
    const items = (shuffled ? options : (listed || pieces))
      .map(o => (typeof o === 'string' ? o : o?.value))
      .map((v, i) => ({ id: `n${i + 1}`, value: String(v) }));
    const idByValue = new Map(items.map(i => [i.value, i.id]));
    const correctOrder = listed
      ? listed.map(v => idByValue.get(String(v))).filter(Boolean)
      : items.map(i => i.id);
    if (correctOrder.length !== items.length) return null;
    return { instruction: lead, question: text, items, correctOrder };
  }

  if (mechanic === 'drag_drop') {
    // The question carries the gap as ___; the answer is what belongs in it.
    const gap = text.match(/_{3,}|\{blank\}/i);
    if (!answer) return null;
    const choices = options.map(o => (typeof o === 'string' ? o : o?.value)).filter(v => v != null && String(v) !== '');
    return {
      instruction: lead,
      question: text,
      template: gap ? text.replace(/_{3,}|\{blank\}/i, '{blank}') : `${answer} {blank}`,
      blanks: [{ position: gap ? gap.index : 0, answer }],
      choices: choices.length >= 2 ? choices.map((v, i) => ({ id: `c${i + 1}`, value: String(v) })) : [answer],
    };
  }

  // multiple_choice, and the fallback for anything unrecognised.
  if (options.length < 2) return null;
  const built = options.map((o, i) => ({
    id: (o && typeof o === 'object' && o.id) || `opt${i + 1}`,
    value: String(o && typeof o === 'object' ? o.value ?? o.label ?? '' : o),
  }));
  // Left as the literal answer when nothing matches, so the cross-reference check
  // reports "the answer is not one of the options" instead of quietly passing.
  const hit = built.find(o => o.value === answer);
  return { instruction: lead, question: text, options: built, correctId: hit ? hit.id : answer };
}

/**
 * Brings any accepted level shape into the one the games read: content_json as an
 * object, level_type resolved to a mechanic we can play.
 *
 * Accepts, in order of preference: a full content_json, the Questions tab shape
 * ({ text, options, answer }), or a content_json sent as a string.
 */
export function normalizeLevelToGameShape(level, { language = 'en', instruction } = {}) {
  if (!level || typeof level !== 'object') return level;

  const existing = parseContent(level.content_json);
  if (Object.keys(existing).length) {
    return { ...level, content_json: existing };
  }

  if (!isQuestionForm(level)) {
    return { ...level, content_json: existing };
  }

    const mechanic = resolveLevelMechanic(level);
    const content = questionToLevelContent(
      {
        text: level.text ?? level.question,
        // The Questions-tab type travels with the text, because it is what says
        // which mechanic to build: a true-false question becomes two options.
        type: level.type || level.question_type,
        options: Array.isArray(level.options) ? level.options : (Array.isArray(level.choices) ? level.choices : []),
        answer: level.answer,
      },
      mechanic,
      { language, instruction },
    );

  if (!content) {
    // Nothing usable: hand the text back so the teacher can see what arrived
    // rather than meeting a level with no question on it.
    return {
      ...level,
      level_type: level.level_type || mechanic,
      content_json: { ...existing, instruction: instruction || instructionFor(mechanic, language), question: String(level.text ?? level.question ?? '') },
    };
  }

  const out = { ...level, level_type: mechanic, content_json: content };
  if (out.explanation == null && level.explanation != null) out.explanation = level.explanation;
  return out;
}

/**
 * An empty level for "add one by hand": the right keys for the mechanic, with
 * nothing filled in.
 *
 * There used to be a placeholder question here ("Question to customise", "Option
 * A", "Choose the right answer!"). It looked like content, it was unrelated to
 * the topic, and it was saved into real activities.
 */
export function blankLevelContent(mechanic) {
  // The rows a mechanic needs are there to type into, but every value in them is
  // empty: a blank level must never carry text a teacher did not write.
  switch (mechanic) {
    case 'matching':
      return { instruction: '', pairs: [{ id: 'p1', left: '', right: '' }, { id: 'p2', left: '', right: '' }] };
    case 'word_order':
      return { instruction: '', answer: '', items: [{ id: 'n1', value: '' }, { id: 'n2', value: '' }] };
    case 'drag_drop':
      return { instruction: '', template: '{blank}', blanks: [{ position: 0, answer: '' }], choices: [{ id: 'c1', value: '' }, { id: 'c2', value: '' }] };
    case 'memory':
      return { instruction: '', cards: [] };
    case 'sorting':
      return { instruction: '', categories: [], items: [] };
    case 'sequence':
      return { instruction: '', items: [], correctOrder: [] };
    case 'find_correct':
      return { instruction: '', question: '', items: [], correctId: '' };
    case 'bubble_pop':
      return { instruction: '', bubbles: [], target: { value: '' } };
    case 'multiple_choice':
    default:
      return { instruction: '', question: '', options: [{ id: 'opt1', value: '' }, { id: 'opt2', value: '' }], correctId: 'opt1' };
  }
}
