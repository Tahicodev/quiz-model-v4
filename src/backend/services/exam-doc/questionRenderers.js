/**
 * src/backend/services/exam-doc/questionRenderers.js
 *
 * Paper representations for every question type the app can store.
 *
 * The student builder and the answer-key builder are deliberately separate
 * functions with separate signatures: the student branch is handed a row from
 * which `answer` / `explanation` have already been removed by
 * ExamDocumentService, so a leak would require a bug in two places at once.
 * Confidentiality is therefore a property of the data path, not of CSS.
 *
 * Types are the canonical ones produced by GradingService.normalizeQuestionType:
 *   multiple-choice, multiple-choice-multi, true-false, fill-blank,
 *   odd-one-out, draggable, matching-pairs, code
 */

import {
  normalizeQuestionType,
  decodeStoredAnswer,
  parseMatchingPairs,
} from '../GradingService.js';
import { optionLetter, seededShuffle } from './text.js';

/** Options are stored as JSON: plain strings, or `{ text, image, isImageOnly }`. */
export function parseOptionNodes(row = {}) {
  const source = Array.isArray(row.options)
    ? row.options
    : typeof row.options_json === 'string'
      ? safeJson(row.options_json)
      : Array.isArray(row.options_json)
        ? row.options_json
        : [];
  const nodes = [];
  for (const entry of Array.isArray(source) ? source : []) {
    if (entry === null || entry === undefined) continue;
    if (typeof entry === 'string' || typeof entry === 'number') {
      const text = String(entry).trim();
      if (text) nodes.push({ text, image: null });
      continue;
    }
    if (typeof entry !== 'object') continue;
    const text = String(entry.text ?? entry.label ?? entry.value ?? '').trim();
    const image = String(entry.image ?? entry.imageUrl ?? entry.src ?? '').trim() || null;
    if (!text && !image) continue;
    nodes.push({ text, image, isImageOnly: !!entry.isImageOnly });
  }
  return nodes;
}

function safeJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

const splitTokens = (raw) =>
  String(raw ?? '')
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** `____`, `__`, `…`, `( )` — however the teacher wrote them in the stem. */
function countBlanks(text) {
  const matches = String(text ?? '').match(/_{2,}|\.\.\.|…|\(\s{2,}\)|- {2,}|\[[\s]*\]/g);
  return matches ? matches.length : 0;
}

function linesForPoints(points) {
  const p = Number(points) || 1;
  return Math.max(2, Math.min(8, Math.round(p * 2)));
}

/** Case-insensitive lookup of an answer token inside the option list. */
function findOptionIndex(options, token) {
  const needle = String(token ?? '').trim().toLowerCase();
  if (!needle) return -1;
  const byText = options.findIndex(
    (o) => String(o.text ?? '').trim().toLowerCase() === needle,
  );
  if (byText >= 0) return byText;
  // Some imports store the letter ("A"/"A.") or a 0-based index instead of text.
  const letterMatch = /^([A-Za-z])\.?$/.exec(String(token ?? '').trim());
  if (letterMatch && options.length) {
    const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return idx;
  }
  const asNumber = Number(String(token ?? '').trim());
  if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber < options.length) {
    return asNumber;
  }
  return -1;
}

const TRUE_WORDS = ['true', 'vrai', 'v', 'oui', 'yes', 'a'];
const FALSE_WORDS = ['false', 'faux', 'f', 'non', 'no', 'b'];

function trueFalseLabel(answer) {
  const token = String(answer ?? '').trim().toLowerCase();
  if (!token) return null;
  if (TRUE_WORDS.includes(token)) return 'Vrai';
  if (FALSE_WORDS.includes(token)) return 'Faux';
  return String(answer).trim();
}

/**
 * Decode a stored row once and split the confidential fields off, so the
 * caller can hand the student branch a provably answer-free object.
 */
export function splitQuestion(row = {}) {
  const decoded = decodeStoredAnswer(row || {});
  const type = normalizeQuestionType(decoded);
  const effectiveType =
    type === 'multiple-choice' && decoded.allowMultipleAnswers
      ? 'multiple-choice-multi'
      : type;
  const options = parseOptionNodes(decoded);
  const confidential = {
    answer: decoded.answer ?? '',
    explanation: decoded.explanation ?? '',
    codeLanguage: decoded.codeLanguage ?? '',
    codeAnswerMode: decoded.codeAnswerMode ?? '',
    oddOneOut: !!decoded.oddOneOut,
    isDraggable: !!decoded.isDraggable,
    allowMultipleAnswers: !!decoded.allowMultipleAnswers,
  };
  const publicRow = { ...decoded };
  // Confidential fields are physically removed before the student branch ever
  // sees the row. `codeSnippet` stays: it is the program the student reads.
  delete publicRow.answer;
  delete publicRow.explanation;
  // Pre-parsed pairs feed BOTH documents: the student column is shuffled
  // (association destroyed), the key prints the real pairing.
  const pairs = parseMatchingPairs(decoded.answer ?? '');
  return { decoded, publicRow, type: effectiveType, options, confidential, pairs };
}

// ─── Student paper ───────────────────────────────────────────────────────────
/**
 * Printable content for the student paper.
 * @param {object} args
 * @param {string} args.type        canonical type from `splitQuestion`
 * @param {Array}  args.options     option nodes (no answer flags on them)
 * @param {object} args.row         answer-stripped row from `publicRow`
 * @param {Array}  args.pairs       matching-pair items (shuffled below)
 * @param {number} args.points      effective points for the writing space
 * @returns {{ block: object, warnings: object[] }}
 */
export function buildStudentContent({ type, options, row, pairs = [], points = 1 }) {
  const text = String(row.text ?? row.question ?? '').trim();
  const media = String(row.media_url ?? '').trim();
  const base = { text, media: media || null, image: null };

  switch (type) {
    case 'multiple-choice':
      return {
        block: {
          ...base,
          kind: 'options',
          marker: 'radio',
          instruction: "Cochez la bonne réponse.",
          options: options.map((o, i) => ({ letter: optionLetter(i), ...o })),
        },
        warnings: [],
      };
    case 'multiple-choice-multi':
      return {
        block: {
          ...base,
          kind: 'options',
          marker: 'checkbox',
          instruction: 'Cochez une ou plusieurs réponses.',
          options: options.map((o, i) => ({ letter: optionLetter(i), ...o })),
        },
        warnings: [],
      };
    case 'odd-one-out':
      return {
        block: {
          ...base,
          kind: 'options',
          marker: 'radio',
          instruction: 'Entourez l’intrus.',
          options: options.map((o, i) => ({ letter: optionLetter(i), ...o })),
        },
        warnings: [],
      };
    case 'true-false':
      return {
        block: {
          ...base,
          kind: 'options',
          marker: 'checkbox',
          instruction: 'Cochez Vrai ou Faux.',
          options: [
            { letter: 'A', text: 'Vrai', image: null },
            { letter: 'B', text: 'Faux', image: null },
          ],
        },
        warnings: [],
      };
    case 'fill-blank': {
      const blanks = countBlanks(text) || 1;
      return {
        block: {
          ...base,
          kind: 'blanks',
          instruction: 'Complétez les espaces.',
          blanks,
          lines: 1,
        },
        warnings: [],
      };
    }
    case 'draggable': {
      // The stored option list is the pool the student reorders.
      const pool = options.map((o, i) => ({ letter: optionLetter(i), ...o }));
      return {
        block: {
          ...base,
          kind: 'sequence',
          instruction: 'Placez les éléments dans l’ordre correct.',
          pool,
          slots: pool.length || 1,
        },
        warnings: [],
      };
    }
    case 'matching-pairs': {
      // Two columns only: the right-hand list is deterministically shuffled,
      // so the printed sheet carries the same material the interactive game
      // shows without ever exposing which item belongs to which.
      const lefts = pairs.map((p, i) => ({ n: i + 1, text: p.left }));
      const shuffled = seededShuffle(
        pairs.map((p) => ({ text: p.right })),
        String(row.id ?? text),
      );
      // Labels follow the printed position, never the stored pairing, so the
      // column letters carry no information about the answer.
      const rights = shuffled.map((r, i) => ({ letter: optionLetter(i), text: r.text }));
      return {
        block: {
          ...base,
          kind: 'pairs',
          instruction: 'Reliez chaque élément de la colonne A à celui de la colonne B.',
          lefts,
          rights,
          answerSpace: true,
        },
        warnings: [],
      };
    }
    case 'code': {
      const snippet = String(row.codeSnippet ?? '').trim();
      return {
        block: {
          ...base,
          kind: 'code',
          instruction: 'Lisez le code puis répondez.',
          language: String(row.codeLanguage ?? 'javascript'),
          snippet: snippet || null,
          options: options.length
            ? options.map((o, i) => ({ letter: optionLetter(i), ...o }))
            : null,
          lines: snippet && !options.length ? linesForPoints(points) : 0,
        },
        warnings: [],
      };
    }
    default:
      return {
        block: {
          ...base,
          kind: 'free',
          instruction: null,
          lines: linesForPoints(points),
        },
        warnings: [{ type: 'unsupported-type', questionId: row.id, message: `Type « ${type} » inconnu — rendu comme question ouverte.` }],
      };
  }
}

// ─── Teacher answer key ──────────────────────────────────────────────────────
/**
 * Correct answers + expected responses for the confidential document.
 * Never invents content: an empty/unknown answer is flagged for review.
 * @returns {{ answer: object, warnings: object[] }}
 */
export function buildAnswerKeyContent({ type, options, confidential, questionId, text = '', pairs = [] }) {
  const warnings = [];
  const raw = String(confidential.answer ?? '').trim();
  const explanation = String(confidential.explanation ?? '').trim();

  const flagMissing = (message) => {
    warnings.push({ type: 'missing-answer', questionId, message });
  };

  switch (type) {
    case 'multiple-choice':
    case 'odd-one-out': {
      if (!raw) {
        flagMissing('Aucune réponse enregistrée.');
        return { answer: { kind: 'text', entries: [], missing: true }, warnings };
      }
      const idx = findOptionIndex(options, raw);
      const entry = idx >= 0 ? `${optionLetter(idx)}. ${options[idx].text || '(image)'}` : raw;
      return {
        answer: { kind: 'option', entries: [entry], letters: idx >= 0 ? [optionLetter(idx)] : [] },
        warnings,
      };
    }
    case 'multiple-choice-multi': {
      const tokens = splitTokens(raw);
      if (!tokens.length) {
        flagMissing('Aucune réponse enregistrée.');
        return { answer: { kind: 'text', entries: [], missing: true }, warnings };
      }
      const entries = [];
      const letters = [];
      for (const token of tokens) {
        const idx = findOptionIndex(options, token);
        if (idx >= 0) {
          letters.push(optionLetter(idx));
          entries.push(`${optionLetter(idx)}. ${options[idx].text || '(image)'}`);
        } else {
          entries.push(token);
        }
      }
      return { answer: { kind: 'option', entries, letters }, warnings };
    }
    case 'true-false': {
      const label = trueFalseLabel(raw);
      if (!label) flagMissing('Aucune réponse enregistrée.');
      return {
        answer: { kind: 'text', entries: label ? [label] : [], missing: !label },
        warnings,
      };
    }
    case 'fill-blank': {
      const alternatives = splitTokens(raw);
      if (!alternatives.length) flagMissing('Aucune réponse attendue définie.');
      const blankCount = countBlanks(text) || Math.max(1, alternatives.length);
      return {
        answer: {
          kind: 'blanks',
          blanks: blankCount,
          entries: alternatives.map((a, i) => `${i + 1}. ${a}`),
          missing: !alternatives.length,
        },
        warnings,
      };
    }
    case 'draggable': {
      const tokens = splitTokens(raw);
      if (!tokens.length) flagMissing('Aucun ordre enregistré.');
      return {
        answer: {
          kind: 'sequence',
          entries: tokens.map((t, i) => `${i + 1}. ${t}`),
          missing: !tokens.length,
        },
        warnings,
      };
    }
    case 'matching-pairs': {
      const keyPairs = pairs.length ? pairs : parseMatchingPairs(raw);
      if (!keyPairs.length) flagMissing('Aucune association enregistrée.');
      return {
        answer: {
          kind: 'pairs',
          entries: keyPairs.map((p) => `${p.left} → ${p.right}`),
          pairs: keyPairs,
          missing: !keyPairs.length,
        },
        warnings,
      };
    }
    case 'code': {
      if (!raw) flagMissing('Aucune réponse attendue définie.');
      const entries = [];
      if (confidential.codeAnswerMode) {
        entries.push(`Mode de réponse : ${confidential.codeAnswerMode}`);
      }
      entries.push(...(raw ? [raw] : []));
      return { answer: { kind: 'code', entries, missing: !raw }, warnings };
    }
    default: {
      if (!raw) flagMissing('Aucune réponse attendue définie.');
      return {
        answer: { kind: 'text', entries: raw ? [raw] : [], missing: !raw },
        warnings,
      };
    }
  }
}

/** Expected-response feedback line for the answer key (never the student paper). */
export function keyFeedbackLines(confidential = {}) {
  const explanation = String(confidential.explanation ?? '').trim();
  return explanation ? [{ label: 'Retour attendu', text: explanation }] : [];
}
