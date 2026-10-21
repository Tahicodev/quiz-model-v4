/**
 * src/backend/services/GradingService.js
 *
 * Server-side grading for training / exam attempts.
 *
 * Why this exists: student browsers never receive the correct `answer` or
 * `explanation` fields (the bootstrap payload strips them so they cannot be
 * read from the cache before answering). The student workspace therefore
 * cannot grade locally nor render an answer breakdown. This service grades
 * attempts on the server — mirroring the workspace comparison semantics in
 * `student-workspace.js` (`trainingAnswersEqual`) — and backs the
 * `GET /api/v1/results/:id/corrections` endpoint, which only ever reveals
 * answers for an attempt the student already completed (the attempt row is
 * persisted, so harvesting is audit-visible to teachers).
 *
 * Pure functions only — no repo/logger dependencies — so the behavior is
 * unit-testable in isolation.
 */

const TYPE_ALIASES = {
  mcq: 'multiple-choice',
  multiple: 'multiple-choice',
  multiplechoice: 'multiple-choice',
  single: 'multiple-choice',
  multi: 'multiple-choice-multi',
  'multiple-choice-multi': 'multiple-choice-multi',
  allowmultipleanswers: 'multiple-choice-multi',
  multiselect: 'multiple-choice-multi',
  'multi-select': 'multiple-choice-multi',
  multi_select: 'multiple-choice-multi',
  'true-false': 'true-false',
  truefalse: 'true-false',
  boolean: 'true-false',
  'true-or-false': 'true-false',
  'fill-blank': 'fill-blank',
  fillblank: 'fill-blank',
  cloze: 'fill-blank',
  fill: 'fill-blank',
  draggable: 'draggable',
  'drag-drop': 'draggable',
  order: 'draggable',
  sequence: 'draggable',
  'odd-one-out': 'odd-one-out',
  odd: 'odd-one-out',
  oddoneout: 'odd-one-out',
  'matching-pairs': 'matching-pairs',
  match: 'matching-pairs',
  pairs: 'matching-pairs',
  matching: 'matching-pairs',
  code: 'code',
  programming: 'code',
  coding: 'code',
};

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Canonical question type. Mirrors `normalizeTrainingQuestionType` in the
 * student workspace (alias map + draggable / matching-pairs heuristics).
 */
export function normalizeQuestionType(question = {}) {
  const raw = normalizeKey(question?.type);
  if (TYPE_ALIASES[raw]) return TYPE_ALIASES[raw];
  if (question?.isDraggable) return 'draggable';
  const ans = String(question?.answer ?? '');
  if (ans.includes('→') || ans.includes('-->')) return 'matching-pairs';
  return 'multiple-choice';
}

function decodeBase64Json(encoded) {
  try {
    return JSON.parse(Buffer.from(String(encoded), 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Restore the real answer + flags from the persistence encoding used by the
 * write paths (`multi::a|b` for multi-select, `meta::<base64>::<answer>` for
 * draggable / odd-one-out / code metadata). Mirrors the bootstrap
 * `decodeQuestionMetadata` so grading sees the original shape.
 */
export function decodeStoredAnswer(question = {}) {
  const rawAnswer = String(question.answer ?? '');

  if (rawAnswer.startsWith('multi::')) {
    const tokens = rawAnswer
      .slice('multi::'.length)
      .split('|')
      .map((t) => t.trim())
      .filter(Boolean);
    return {
      ...question,
      allowMultipleAnswers: true,
      answer: tokens.join(','),
    };
  }

  if (rawAnswer.startsWith('meta::')) {
    const rest = rawAnswer.slice('meta::'.length);
    const separatorIndex = rest.indexOf('::');
    if (separatorIndex > 0) {
      const meta = decodeBase64Json(rest.slice(0, separatorIndex));
      const payload = rest.slice(separatorIndex + 2);
      if (meta) {
        const decoded = { ...question, answer: payload };
        if (meta.multi) decoded.allowMultipleAnswers = true;
        if (meta.drag) decoded.isDraggable = true;
        if (meta.odd) decoded.oddOneOut = true;
        if (meta.matchShuffle === false) decoded.shufflePairs = false;
        if (meta.code) {
          decoded.codeSnippet = meta.code.snippet || '';
          decoded.codeLanguage = meta.code.language || 'javascript';
          decoded.codeAnswerMode = meta.code.mode || 'multiple-choice';
          decoded.type = 'code';
        }
        return decoded;
      }
    }
  }

  return question;
}

function stripMultiPrefix(raw) {
  const s = String(raw ?? '').trim();
  return s.startsWith('multi::') ? s.slice('multi::'.length) : s;
}

function splitMultiAnswer(raw) {
  return String(raw ?? '')
    .split(/[|,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const PAIR_ARROW = /(?:-->|->|=>|→|::|=|:)/;

/**
 * Parse a matching-pairs answer into [{ left, right }]. Accepts the stored
 * admin formats (`A-->B|C-->D`, `A→B|…`) and the workspace submission format
 * (`A→B|…`), plus JSON arrays / objects for robustness. Bounded on purpose:
 * exotic free-text layouts stay a client display concern — grading only
 * needs the canonical shapes.
 */
export function parseMatchingPairs(value) {
  const collected = [];
  const collect = (candidate, depth = 0) => {
    if (candidate === null || candidate === undefined || depth > 4) return;
    if (Array.isArray(candidate)) {
      const before = collected.length;
      candidate.forEach((entry) => collect(entry, depth + 1));
      // Flat alternating array: ["left1", "right1", "left2", "right2"].
      if (
        collected.length === before &&
        candidate.length >= 2 &&
        candidate.length % 2 === 0 &&
        candidate.every((e) => typeof e === 'string' || typeof e === 'number')
      ) {
        for (let i = 0; i < candidate.length; i += 2) {
          const left = String(candidate[i] ?? '').trim();
          const right = String(candidate[i + 1] ?? '').trim();
          if (left && right) collected.push({ left, right });
        }
      }
      return;
    }
    if (candidate && typeof candidate === 'object') {
      const left = candidate.left ?? candidate.key ?? candidate.term;
      const right = candidate.right ?? candidate.value ?? candidate.definition;
      if (left && right) {
        collected.push({ left: String(left).trim(), right: String(right).trim() });
        return;
      }
      for (const key of ['pairs', 'matches', 'options', 'items', 'data']) {
        if (candidate[key] !== undefined) collect(candidate[key], depth + 1);
      }
      return;
    }
    let raw = String(candidate ?? '').trim();
    if (!raw) return;
    raw = raw.replace(/^meta::[A-Za-z0-9+/=]+::/, '').trim();
    if (!raw) return;
    if ((raw.startsWith('[') && raw.endsWith(']')) || (raw.startsWith('{') && raw.endsWith('}'))) {
      try {
        collect(JSON.parse(raw), depth + 1);
        return;
      } catch (_) {}
    }
    raw
      .split(/[\n|;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .forEach((token) => {
        const sep = token.search(PAIR_ARROW);
        if (sep < 0) return;
        const arrow = token.match(PAIR_ARROW)[0];
        const left = token.slice(0, sep).trim();
        const right = token.slice(sep + arrow.length).trim();
        if (left && right) collected.push({ left, right });
      });
  };
  collect(value);
  return collected.filter((p) => p.left && p.right);
}

/**
 * Mirrors `trainingAnswersEqual` in student-workspace.js. Returns false for
 * empty user answers (skipped questions are misses, never matches).
 */
export function isAnswerCorrect(userAnswer, correctAnswer, qType) {
  let u = String(userAnswer ?? '').trim();
  let c = String(correctAnswer ?? '').trim();
  if (!u) return false;
  if (qType === 'multiple-choice-multi') {
    u = stripMultiPrefix(u);
    c = stripMultiPrefix(c);
  }
  switch (qType) {
    case 'multiple-choice':
    case 'true-false':
    case 'odd-one-out':
    case 'code':
      return u.toLowerCase() === c.toLowerCase();
    case 'multiple-choice-multi': {
      const userSet = new Set(splitMultiAnswer(u));
      const correctSet = new Set(splitMultiAnswer(c));
      if (!userSet.size || userSet.size !== correctSet.size) return false;
      for (const v of userSet) {
        if (!correctSet.has(v)) return false;
      }
      return true;
    }
    case 'draggable': {
      const userOrder = u.split(',').map((s) => s.trim().toLowerCase());
      const correctOrder = c.split(',').map((s) => s.trim().toLowerCase());
      if (!userOrder.length || userOrder.length !== correctOrder.length) return false;
      return userOrder.join('|') === correctOrder.join('|');
    }
    case 'matching-pairs': {
      const toMap = (entries) => {
        const map = new Map();
        (entries || []).forEach((p) => {
          const left = String(p?.left ?? '').trim().toLowerCase();
          const right = String(p?.right ?? '').trim().toLowerCase();
          if (left && right) map.set(left, right);
        });
        return map;
      };
      const userMap = toMap(parseMatchingPairs(u));
      const correctMap = toMap(parseMatchingPairs(c));
      if (!correctMap.size) return false;
      if (userMap.size !== correctMap.size) return false;
      for (const [k, v] of correctMap) {
        if (userMap.get(k) !== v) return false;
      }
      return true;
    }
    case 'fill-blank': {
      const toMap = (s) => {
        const map = new Map();
        String(s || '')
          .split('|')
          .forEach((p) => {
            if (p.includes(':')) {
              const idx = p.indexOf(':');
              map.set(p.slice(0, idx).trim(), p.slice(idx + 1).trim().toLowerCase());
            }
          });
        return map;
      };
      const userMap = toMap(u);
      const correctMap = toMap(c);
      if (!correctMap.size) return false;
      if (userMap.size !== correctMap.size) return false;
      for (const [k, v] of correctMap) {
        if ((userMap.get(k) || '').toLowerCase() !== String(v).toLowerCase()) return false;
      }
      return true;
    }
    default:
      return u.toLowerCase() === c.toLowerCase();
  }
}

/** /20 grade, mirroring the workspace `grade20` helper. */
export function grade20(score, totalQuestions) {
  const total = Math.max(0, Number(totalQuestions) || 0);
  const correct = Math.max(0, Number(score) || 0);
  if (total <= 0) return 0;
  return Math.round(Math.min(20, (correct / total) * 20) * 100) / 100;
}

export function isPassingGrade20(grade) {
  return Number(grade) >= 10;
}

function parseOptions(optionsJson, fallback) {
  if (Array.isArray(fallback) && fallback.length) {
    return fallback.map((o) => (o && typeof o === 'object' ? o.text ?? o.label ?? '' : o));
  }
  if (optionsJson == null || optionsJson === '') return [];
  if (Array.isArray(optionsJson)) return optionsJson;
  try {
    const parsed = JSON.parse(optionsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Grade a whole attempt.
 * @param {Array} questions - full question rows (with `answer`).
 * @param {Object} answersMap - { questionId: userAnswerString }.
 * @returns {{ score, total, items }} where each item carries the display
 *   fields the corrections view needs.
 */
export function gradeAttempt(questions = [], answersMap = {}) {
  const items = (Array.isArray(questions) ? questions : []).map((row) => {
    const decoded = decodeStoredAnswer(row || {});
    const qType = normalizeQuestionType(decoded);
    // A decoded multi flag upgrades the type the same way the workspace
    // alias map does (allowMultipleAnswers rows grade as multi-select).
    const effectiveType =
      qType === 'multiple-choice' && decoded.allowMultipleAnswers
        ? 'multiple-choice-multi'
        : qType;
    const questionId = String(decoded.id ?? decoded.questionId ?? '');
    const userAnswer = answersMap?.[questionId] ?? answersMap?.[String(decoded.id)] ?? '';
    const correctAnswer = String(decoded.answer ?? '');
    return {
      questionId,
      type: effectiveType,
      question: decoded.question || decoded.text || '',
      options: parseOptions(decoded.options_json, decoded.options),
      userAnswer: String(userAnswer ?? ''),
      correctAnswer,
      correct: isAnswerCorrect(userAnswer, correctAnswer, effectiveType),
      explanation: decoded.explanation || '',
      points: Number(decoded.points) || 1,
    };
  });
  const score = items.filter((i) => i.correct).length;
  return { score, total: items.length, items };
}
