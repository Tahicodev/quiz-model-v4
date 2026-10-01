/**
 * src/shared/kids-level-checks.js
 *
 * Validation for levels a teacher wrote themselves, on their own machine, with
 * ChatGPT / Claude / Gemini rather than through the app.
 *
 * Two layers:
 *
 *   1. The Zod schemas the server itself enforces (KidsActivityLevelCreateSchema
 *      and the per-mechanic content schema).
 *   2. Cross-references a schema cannot express: a correctId pointing at no
 *      option, a drag_drop whose blank count does not match the {blank} tokens
 *      in its template, a sequence whose correctOrder is not a permutation of
 *      its items, a memory deck with an unpaired card. All of those pass
 *      validation and then fail in front of a child.
 *
 * It lives here, free of Prisma and of the request layer, so the CLI
 * (scripts/validate-kids-levels.mjs) and the HTTP endpoint the import button
 * calls run the exact same rules. One implementation, so the two cannot drift
 * from each other or from the schemas.
 */

import { KidsActivityLevelCreateSchema, validateLevelContent } from './schemas/kids-activity.schema.js';
import { KIDS_CORE_MECHANICS, KIDS_ADVENTURE_GAMES, KIDS_IMMERSIVE_GAMES } from './constants.js';
import { normalizeLevelToGameShape } from './kids-question-bridge.js';

export const CORE_MECHANICS = Object.values(KIDS_CORE_MECHANICS);
const CORE_SET = new Set(CORE_MECHANICS);

/** The narrative shells a level can be wrapped in. */
export const NARRATIVE_TEMPLATES = [
  ...Object.values(KIDS_ADVENTURE_GAMES),
  ...Object.values(KIDS_IMMERSIVE_GAMES),
];

const NARRATIVE_SET = new Set(NARRATIVE_TEMPLATES);

/** Zod's error.message is a JSON dump; a teacher needs one line per field. */
function describeZodError(err) {
  const issues = err?.issues || [];
  if (issues.length === 0) return err.message;
  return issues
    .map(i => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return undefined; }
}

/**
 * The mechanic a level actually plays with, unwrapping a narrative shell.
 * Returns mechanic: null when the level names nothing playable.
 */
export function resolveLevelMechanic(level) {
  const content = parseMaybeJson(level?.content_json);
  if (content && typeof content === 'object' && (content.mechanic || content.baseMechanic)) {
    const mechanic = content.mechanic || content.baseMechanic;
    return { mechanic, content, wrapped: true };
  }
  return { mechanic: level?.level_type, content, wrapped: false };
}

const idsOf = (items) => new Set((items || []).map(i => i.id));

/** Everything a shape check cannot see. */
function checkReferences(mechanic, content, report) {
  if (!content || typeof content !== 'object') return;

  switch (mechanic) {
    case 'multiple_choice': {
      const available = idsOf(content.options);
      if (!available.has(content.correctId)) {
        report(`correctId "${content.correctId}" is not one of the option ids: ${[...available].join(', ') || 'none'}`);
      }
      break;
    }

    case 'find_correct': {
      const available = idsOf(content.items);
      if (!available.has(content.correctId)) {
        report(`correctId "${content.correctId}" is not one of the item ids: ${[...available].join(', ') || 'none'}`);
      }
      break;
    }

    case 'word_order': {
      // The items are the shuffled pieces, so their order in the file is
      // meaningless. What has to hold is that they are the same letters as the
      // answer, compared as a multiset: "A","C","T","H" is CHAT.
      const given = (content.items || []).map(i => String(i.value ?? '')).join('');
      const target = String(content.answer || '');
      if (target && given) {
        const letters = s => s.replace(/\s/g, '').toLowerCase().split('').sort().join('');
        if (letters(given) !== letters(target)) {
          report(`the pieces (${given}) are not the letters of "${content.answer}", so the word cannot be rebuilt`);
        }
      }
      break;
    }

    case 'drag_drop': {
      // The renderer numbers the {blank} (or _) tokens left to right from 0, and
      // grading matches on that number, so a mismatch is unplayable.
      const tokens = (String(content.template || '').match(/\{blank\}|_/g) || []).length;
      const blanks = content.blanks || [];
      if (tokens !== blanks.length) {
        report(`template has ${tokens} {blank} token(s) but there are ${blanks.length} blank(s); the child cannot fill what is not there`);
      }
      const seen = new Set();
      const choices = (content.choices || []).map(c => String(c.value).toLowerCase());
      for (const b of blanks) {
        if (seen.has(b.position)) report(`two blanks share position ${b.position}`);
        seen.add(b.position);
        if (typeof b.position === 'number' && b.position >= tokens) {
          report(`blank position ${b.position} is past the last {blank} token (0 to ${tokens - 1})`);
        }
        if (!choices.includes(String(b.answer).toLowerCase())) {
          report(`the answer to blank ${b.position} ("${b.answer}") is not among the choices, so it cannot be dragged in`);
        }
      }
      break;
    }

    case 'matching': {
      const seen = new Set();
      for (const pair of content.pairs || []) {
        if (seen.has(pair.id)) report(`pair id "${pair.id}" is used twice, and pairing is graded on left id === right id`);
        seen.add(pair.id);
      }
      break;
    }

    case 'memory': {
      const tally = new Map();
      for (const card of content.cards || []) tally.set(card.matchId, (tally.get(card.matchId) || 0) + 1);
      for (const [matchId, n] of tally) {
        if (n !== 2) report(`matchId "${matchId}" appears ${n} time(s); a memory card needs exactly 2`);
      }
      if (tally.size < 2) report(`only ${tally.size} pair(s) of cards; a memory game needs at least 2`);
      break;
    }

    case 'sorting': {
      const available = idsOf(content.categories);
      for (const item of content.items || []) {
        if (!available.has(item.categoryId)) {
          report(`item "${item.id}" points at categoryId "${item.categoryId}", which does not exist`);
        }
      }
      const used = new Set((content.items || []).map(i => i.categoryId));
      for (const cat of content.categories || []) {
        if (!used.has(cat.id)) report(`category "${cat.label ?? cat.id}" has no items`);
      }
      break;
    }

    case 'sequence': {
      const available = idsOf(content.items);
      const order = content.correctOrder || [];
      const seen = new Set();
      for (const id of order) {
        if (!available.has(id)) report(`correctOrder contains "${id}", which is not an item id`);
        if (seen.has(id)) report(`correctOrder repeats "${id}"`);
        seen.add(id);
      }
      for (const id of available) {
        if (!seen.has(id)) report(`correctOrder is missing item "${id}"; it must list every item exactly once`);
      }
      break;
    }

    case 'bubble_pop': {
      const correct = (content.bubbles || []).filter(b => b.isCorrect);
      if (correct.length !== 1) {
        report(`${correct.length} bubbles are marked isCorrect; exactly 1 must be, since the child pops only that one`);
      } else if (content.target && String(content.target.value).toLowerCase() !== String(correct[0].value).toLowerCase()) {
        report(`target is "${content.target.value}" but the correct bubble is "${correct[0].value}"`);
      }
      break;
    }
  }
}

/**
 * Pulls the levels array out of whatever shape the teacher handed over: a bare
 * array, `{ levels: [...] }`, or a single level object.
 *
 * A single object is the shape every per-mechanic example in the docs is written
 * as, and it is what you get after copying one example out of a chat, so it is
 * accepted instead of made a special case for the reader.
 */
export function readLevelsFile(doc) {
  if (Array.isArray(doc)) return doc;
  if (doc && typeof doc === 'object') {
    if (Array.isArray(doc.levels)) return doc.levels;
    if (typeof doc.level_type === 'string' || doc.content_json !== undefined) return [doc];
  }
  return null;
}

/**
 * Check a whole levels file.
 *
 * @param {object|Array} input parsed JSON: a bare array, `{ levels: [...] }`, or one level
 * @param {{ minItems?: number, templateId?: string, language?: string }} [options]
 * @returns {{ ok: boolean, count: number, problems: Array<{ index: number|null, label: string, message: string }> }}
 */
export function validateLevelsFile(input, options = {}) {
  const { minItems, templateId, language = 'en' } = options;
  const problems = [];
  const add = (index, message) => problems.push({
    index,
    label: index === null ? 'activity' : `level #${index + 1}`,
    message,
  });

  const levels = readLevelsFile(input);
  if (!levels) {
    add(null, 'Expected a JSON array of levels, an object with a "levels" array, or a single level.');
    return { ok: false, count: 0, problems };
  }
  if (levels.length === 0) {
    add(null, 'The file has no levels.');
    return { ok: false, count: 0, problems };
  }

  levels.forEach((raw, index) => {
    // A level may arrive as a question from the Questions tab ({ text, options,
    // answer }) instead of a content_json. It is converted first, so everything
    // below checks the shape the game will actually play.
    const level = normalizeLevelToGameShape(raw, { language });
    const parsed = KidsActivityLevelCreateSchema.safeParse(level);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        add(index, `${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
    }

    // The level's own fields and its content are reported independently. A wrong
    // points value must not hide "correctId points at no option", or the teacher
    // fixes one problem per round trip.
    const source = parsed.success ? parsed.data : level;
    const { mechanic, content, wrapped } = resolveLevelMechanic(source);

    if (!CORE_SET.has(mechanic)) {
      if (wrapped) {
        add(index, `content_json.mechanic is "${mechanic}", which is not a core mechanic. Allowed: ${CORE_MECHANICS.join(', ')}`);
      } else if (NARRATIVE_SET.has(source.level_type)) {
        add(index, `"${source.level_type}" is an adventure or immersive shell, not a question. Keep level_type as the template and add a "mechanic" field (${CORE_MECHANICS.join(', ')}) inside content_json, alongside its normal content.`);
      } else if (source.level_type !== undefined) {
        add(index, `level_type "${source.level_type}" is neither a core mechanic (${CORE_MECHANICS.join(', ')}) nor a game template (${NARRATIVE_TEMPLATES.join(', ')}).`);
      }
      return;
    }

    try {
      validateLevelContent(mechanic, content);
    } catch (err) {
      add(index, `content_json does not match "${mechanic}": ${describeZodError(err)}`);
    }

    // Checked even when the shape was wrong: "2 {blank} tokens but 1 blank" is
    // more use than the count error that hid it.
    checkReferences(mechanic, content, message => add(index, message));
  });

  if (Number.isInteger(minItems) && levels.length < minItems) {
    add(null, templateId
      ? `The "${templateId}" game needs at least ${minItems} levels to be published, and this file has ${levels.length}.`
      : `This game needs at least ${minItems} levels to be published, and this file has ${levels.length}.`);
  }

  return { ok: problems.length === 0, count: levels.length, problems };
}

/**
 * Turn validated file levels into the shape the wizard and the save endpoint
 * expect: content parsed into an object, positions filled in, and nothing else
 * carried over from the file.
 *
 * Runs through the same bridge the validator used, so a level written as a
 * question and a level written as content_json come out identical.
 */
export function normalizeImportedLevels(levels, { language = 'en' } = {}) {
  return levels.map((raw, index) => {
    const level = normalizeLevelToGameShape(raw, { language });
    const content = parseMaybeJson(level.content_json);
    const narrative = parseMaybeJson(level.narrative_json);
    return {
      ...(level.id ? { id: level.id } : {}),
      level_type: level.level_type,
      content_json: content && typeof content === 'object' ? content : level.content_json,
      order_index: Number.isInteger(level.order_index) ? level.order_index : index,
      points: level.points ?? 10,
      hint: level.hint ?? null,
      explanation: level.explanation ?? null,
      media_url: level.media_url ?? null,
      narrative_json: narrative && typeof narrative === 'object' ? narrative : null,
    };
  });
}
