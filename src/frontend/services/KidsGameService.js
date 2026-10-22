/**
 * src/frontend/services/KidsGameService.js
 * Manages Kids Games (teacher-created, PIN-based games for primary/preschool).
 * Reuses the existing Question schema — no new question types.
 */

import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../../shared/errors.js';
import {
  KidsGameCreateSchema,
  KidsGameUpdateSchema,
  KidsGameFilterSchema,
  KidsSessionCreateSchema,
  KidsSessionCompleteSchema,
  KidQuestLevelsSchema,
} from '../../shared/schemas/kids-game.schema.js';

function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function generatePin() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0, O, 1, I
  let pin = '';
  for (let i = 0; i < 4; i++) {
    pin += chars[Math.floor(Math.random() * chars.length)];
  }
  return pin;
}

function calculateStars(score, totalPoints) {
  if (totalPoints === 0) return 0;
  const percent = (score / totalPoints) * 100;
  if (percent >= 90) return 3;
  if (percent >= 70) return 2;
  if (percent >= 50) return 1;
  return 0;
}

/**
 * Canonical kid question types (plan §1). The Question table stores DB types
 * (`mcq`, `order`, …) with `meta::`/`multi::` answer prefixes, so every entry
 * point normalizes rows into this canonical shape before storing/comparing.
 */
const KID_TYPE_ALIASES = {
  'mcq': 'multiple-choice',
  'multiple-choice-multi': 'multiple-choice',
  'matching-pairs': 'matching',
  'order': 'draggable',
};

function stripAnswerPrefix(raw) {
  let s = String(raw ?? '').trim();
  if (s.startsWith('multi::')) return { answer: s.slice('multi::'.length), multi: true };
  if (s.startsWith('meta::')) {
    const parts = s.split('::');
    if (parts.length >= 3) {
      try {
        const meta = JSON.parse(decodeURIComponent(escape(atob(parts[1]))));
        return { answer: parts.slice(2).join('::'), meta };
      } catch { return { answer: parts.slice(2).join('::'), meta: {} }; }
    }
  }
  return { answer: s, meta: null };
}

function optionsToLabels(optionsJson) {
  const parsed = parseJson(optionsJson, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(o => {
    if (typeof o === 'string') return o;
    if (o && typeof o === 'object') return String(o.text ?? o.label ?? o.value ?? '');
    return String(o ?? '');
  }).filter(Boolean);
}

/** Convert any Question-row shape (DB or legacy) into the canonical kid shape. */
export function normalizeKidQuestion(raw) {
  const q = { ...(raw || {}) };
  const stripped = stripAnswerPrefix(q.answer);
  let type = String(q.type || 'multiple-choice').trim();
  type = KID_TYPE_ALIASES[type] || type;
  const meta = stripped.meta || {};
  if (meta.multi) q.allowMultipleAnswers = true;
  if (meta.odd) type = 'odd-one-out';
  if ((meta.drag || q.isDraggable) && type === 'multiple-choice') type = 'draggable';
  let codeAnswerMode = q.codeAnswerMode || q.code_answer_mode;
  if (meta.code) {
    type = 'code';
    codeAnswerMode = codeAnswerMode || meta.code.mode || 'multiple-choice';
    if (meta.code.snippet && !q.codeSnippet) q.codeSnippet = meta.code.snippet;
    if (meta.code.language && !q.codeLanguage) q.codeLanguage = meta.code.language;
  }
  // Canonicalize pipe-joined answers (multi-select AND matching-pairs AI
  // output) to the comma-joined form the answer checker compares.
  let answer = stripped.answer;
  const wantsCommas = (q.allowMultipleAnswers || meta.multi || type === 'matching')
    && answer.includes('|') && !answer.includes(',');
  if (wantsCommas) {
    answer = answer.split('|').map(s => s.trim()).filter(Boolean).join(',');
  }
  const labels = optionsToLabels(q.options_json ?? q.options);
  return {
    id: q.id || q.question_id || `kidq-${Math.random().toString(36).slice(2, 10)}`,
    type,
    text: q.text ?? q.question ?? q.title ?? '',
    options_json: JSON.stringify(labels),
    answer,
    explanation: q.explanation ?? q.instruction ?? null,
    points: Number(q.points) || 1,
    difficulty: q.difficulty || 'easy',
    media_url: q.media_url ?? q.mediaUrl ?? q.image ?? null,
    allowMultipleAnswers: Boolean(q.allowMultipleAnswers || meta.multi),
    codeAnswerMode: codeAnswerMode || null,
    codeSnippet: q.codeSnippet || null,
    codeLanguage: q.codeLanguage || null,
  };
}

function splitTokens(raw) {
  return String(raw ?? '').split(/[|,;]/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

const KIDS_CATEGORY_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'];

/** Stable per-name color so auto categories render a visible badge. */
function kidsCategoryColor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return KIDS_CATEGORY_COLORS[h % KIDS_CATEGORY_COLORS.length];
}

function b64encodeUnicode(str) {
  const bytes = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  if (typeof btoa === 'function') return btoa(bytes);
  // Node fallback (this module also runs server-side).
  return Buffer.from(str, 'utf8').toString('base64');
}

/**
 * Canonical kid question → Question-table row (DB vocabulary), mirroring
 * the api-client.js write mapper: mcq/order + meta::/multi:: answer encoding.
 * Tags always carry `kids` and `kids:<gameId>` so copies stay traceable.
 */
export function toBankQuestion(kidQ, { schoolId, teacherId, categoryId, gameId }) {
  const labels = optionsToLabels(kidQ.options_json ?? kidQ.options);
  let type = 'mcq';
  let answer = String(kidQ.answer ?? '').trim();
  const meta = {};
  switch (kidQ.type) {
    case 'multiple-choice':
      type = 'mcq';
      if (kidQ.allowMultipleAnswers) {
        const toks = answer.split(',').map(s => s.trim()).filter(Boolean);
        answer = 'multi::' + toks.join('|');
      }
      break;
    case 'true-false': type = 'true-false'; break;
    case 'odd-one-out': type = 'mcq'; meta.odd = true; break;
    case 'matching': type = 'matching'; break;
    case 'draggable': type = 'order'; meta.drag = true; break;
    case 'fill-blank': type = 'fill-blank'; break;
    case 'code':
      type = 'mcq';
      meta.code = {
        snippet: String(kidQ.codeSnippet || ''),
        language: String(kidQ.codeLanguage || 'javascript'),
        mode: String(kidQ.codeAnswerMode || 'multiple-choice'),
      };
      break;
    default: type = 'mcq';
  }
  if (Object.keys(meta).length) {
    answer = 'meta::' + b64encodeUnicode(JSON.stringify(meta)) + '::' + answer;
  }
  const media = kidQ.media_url ?? null;
  return {
    school_id: schoolId,
    category_id: categoryId,
    type,
    text: String(kidQ.text ?? '').slice(0, 2000),
    options_json: JSON.stringify(labels),
    answer,
    explanation: kidQ.explanation != null ? String(kidQ.explanation).slice(0, 2000) : null,
    points: Math.min(100, Math.max(1, Number(kidQ.points) || 1)),
    difficulty: ['easy', 'medium', 'hard'].includes(kidQ.difficulty) ? kidQ.difficulty : 'easy',
    tags: `kids,kids:${gameId}`,
    media_url: media && String(media).trim() ? String(media) : null,
    created_by: teacherId,
  };
}

function checkAnswer(question, given) {
  const type = KID_TYPE_ALIASES[question.type] || question.type;
  const answer = String(question.answer ?? '').trim();

  switch (type) {
    case 'multiple-choice':
    case 'multiple-choice-multi': {
      if (question.allowMultipleAnswers) {
        const givenArr = splitTokens(given).sort();
        const answerArr = splitTokens(answer).sort();
        return givenArr.length > 0 && JSON.stringify(givenArr) === JSON.stringify(answerArr);
      }
      return String(given).trim().toLowerCase() === answer.toLowerCase();
    }

    case 'true-false':
      return String(given).trim().toLowerCase() === answer.toLowerCase();

    case 'odd-one-out':
      return String(given).trim().toLowerCase() === answer.toLowerCase();

    case 'matching':
    case 'matching-pairs': {
      const givenPairs = String(given).split(',').map(s => s.trim()).filter(Boolean).sort();
      const answerPairs = answer.split(',').map(s => s.trim()).filter(Boolean).sort();
      return JSON.stringify(givenPairs) === JSON.stringify(answerPairs);
    }

    case 'draggable':
    case 'order':
      return String(given).trim() === answer;

    case 'fill-blank':
      return String(given).trim().toLowerCase() === answer.toLowerCase();

    case 'code': {
      const codeMode = question.codeAnswerMode;
      if (codeMode === 'multiple-choice') {
        return String(given).trim() === answer;
      }
      if (codeMode === 'fill-blank') {
        return String(given).trim().toLowerCase() === answer.toLowerCase();
      }
      if (codeMode === 'matching') {
        const givenPairs = String(given).split(',').map(s => s.trim()).filter(Boolean).sort();
        const answerPairs = answer.split(',').map(s => s.trim()).filter(Boolean).sort();
        return JSON.stringify(givenPairs) === JSON.stringify(answerPairs);
      }
      if (codeMode === 'draggable') {
        return String(given).trim() === answer;
      }
      if (codeMode === 'odd-one-out') {
        return String(given).trim() === answer;
      }
      return String(given).trim().toLowerCase() === answer.toLowerCase();
    }

    default:
      return String(given).trim().toLowerCase() === answer.toLowerCase();
  }
}

/**
 * Math Quest: server-side mirror of the client quest core's planLevels.
 * Normalizes the teacher's config_json.levels into
 * [{index, id, name, questionIds, thresholdStars}] and returns null when the
 * config does not carry a valid level partition — the caller then treats the
 * whole game as one implicit 'default' level (backward compatibility).
 * client/server agreement note: the client core requires the same level shape
 * (stable non-empty `id` strings + explicit question lists), so both sides
 * either agree on the plan or agree on the fallback.
 */
export function questLevels(config, questions) {
  const list = Array.isArray(questions) ? questions : [];
  const byId = new Set(list.map(q => String(q?.id)));
  const raw = config && Array.isArray(config.levels) ? config.levels : null;
  const valid = Array.isArray(raw) && raw.length > 0 && raw.length <= 12 &&
    raw.every(l => l && typeof l === 'object' &&
      typeof l.id === 'string' && l.id.trim() !== '' && l.id.length <= 80 &&
      typeof l.name === 'string' && l.name.trim() !== '' &&
      Array.isArray(l.questions) && l.questions.length > 0 &&
      l.questions.every(id => byId.has(String(id))));
  if (valid) {
    const seen = new Set();
    const seenIds = new Set();
    let total = 0;
    for (const l of raw) {
      // level ids key the KidQuestProgress unique triple — they must be unique
      if (seenIds.has(String(l.id))) { valid = false; break; }
      seenIds.add(String(l.id));
      for (const id of l.questions) {
        const key = String(id);
        if (seen.has(key)) { valid = false; break; }
        seen.add(key); total++;
      }
      if (!valid) break;
    }
    if (valid && total !== list.length) valid = false;
  }
  if (!valid) return null;
  return raw.map((l, i) => ({
    index: i,
    id: l.id.trim().slice(0, 80),
    name: String(l.name).trim(),
    questionIds: l.questions.map(id => String(id)),
    thresholdStars: (Number.isInteger(l.pass_stars) && l.pass_stars >= 1 && l.pass_stars <= 3) ? l.pass_stars : 1,
  }));
}

/** The implicit single level every Math Quest game falls back to. */
function defaultQuestLevel(questions) {
  const list = Array.isArray(questions) ? questions : [];
  return [{
    index: 0,
    id: 'default',
    name: 'Level 1',
    questionIds: list.map(q => String(q.id)),
    thresholdStars: 1,
  }];
}

export class KidsGameService {
  #repo;

  constructor(repo) {
    this.#repo = repo;
  }

  // ─── Teacher/Admin CRUD ───

  async list(filters = {}, pagination = {}) {
    // `teacher_id` is server-derived (route-enforced teacher scope / admin
    // author filter), not client input — validate the rest, then re-attach.
    const { teacher_id = undefined, ...restFilters } = filters;
    const parsed = KidsGameFilterSchema.safeParse({ ...restFilters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
    if (teacher_id !== undefined) rest.teacher_id = teacher_id;
    return this.#repo.getAll('kidsGames', { filters: rest, limit, offset, orderBy, direction, search });
  }

  async getById(id, schoolId = null) {
    const game = await this.#repo.getById('kidsGames', id);
    if (!game || (schoolId && game.school_id !== schoolId)) throw new NotFoundError('KidsGame');
    return {
      ...game,
      questions_json: parseJson(game.questions_json, []),
      config_json: parseJson(game.config_json, {}),
    };
  }

  async create(data, currentUser) {
    this.#requireTeacher(currentUser);
    const parsed = KidsGameCreateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const rawQuestions = parseJson(parsed.data.questions_json, []);
    if (!rawQuestions.length) {
      throw new ValidationError({ questions_json: ['At least one question is required'] });
    }
    // Normalize every question (DB shape → canonical kid shape) so stored
    // snapshots and answer-checking always agree, whatever the source.
    const questions = rawQuestions.map((q) => {
      const nq = normalizeKidQuestion(q);
      if (!nq.type || !nq.text || !nq.answer) {
        throw new ValidationError({ questions_json: ['Each question must have type, text, and answer'] });
      }
      return nq;
    });

    // Math Quest: when the teacher ships a level plan, validate it against
    // BOTH the strict level schema and the actual question snapshot — the
    // plan and the config must stay a partition of the same question ids.
    const config = parseJson(parsed.data.config_json, {});
    this.#validateQuestLevels(parsed.data.game_type, config, questions);

    const created = await this.#repo.create('kidsGames', {
      ...parsed.data,
      questions_json: JSON.stringify(questions),
      config_json: parsed.data.config_json ? JSON.stringify(parseJson(parsed.data.config_json, {})) : null,
      school_id: currentUser.school_id,
      teacher_id: currentUser.id,
      status: 'draft',
      play_count: 0,
    });

    return { ...created, questions_json: questions, config_json: parseJson(created.config_json, {}) };
  }

  async update(id, data, currentUser) {
    const existing = await this.getById(id, currentUser.school_id);
    this.#requireOwnerOrAdmin(existing, currentUser);

    const parsed = KidsGameUpdateSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    if (parsed.data.questions_json) {
      const rawQuestions = parseJson(parsed.data.questions_json, []);
      if (!rawQuestions.length) {
        throw new ValidationError({ questions_json: ['At least one question is required'] });
      }
      const questions = rawQuestions.map((q) => {
        const nq = normalizeKidQuestion(q);
        if (!nq.type || !nq.text || !nq.answer) {
          throw new ValidationError({ questions_json: ['Each question must have type, text, and answer'] });
        }
        return nq;
      });
      parsed.data.questions_json = JSON.stringify(questions);
    }

    if (parsed.data.config_json !== undefined) {
      parsed.data.config_json = parsed.data.config_json
        ? JSON.stringify(parseJson(parsed.data.config_json, {}))
        : null;
    }

    // Math Quest level plans: validate against the effective game type (the
    // PATCH may carry a new game_type, or only a config for an existing one).
    const resolvedType = parsed.data.game_type || existing.game_type;
    if (parsed.data.config_json !== undefined) {
      const questions = parseJson(parsed.data.questions_json ?? existing.questions_json, []);
      this.#validateQuestLevels(resolvedType, parsed.data.config_json ? parseJson(parsed.data.config_json, {}) : {}, questions);
    }

    const updated = await this.#repo.update('kidsGames', id, parsed.data);
    const result = { ...updated, questions_json: parseJson(updated.questions_json, []), config_json: parseJson(updated.config_json, {}) };
    // Keep published bank copies in sync when a live game is edited.
    if (result.status === 'published') {
      try { await this.#syncBank(result, currentUser); } catch (_) { /* bank sync is best-effort */ }
    }
    return result;
  }

  async delete(id, currentUser) {
    const existing = await this.getById(id, currentUser.school_id);
    this.#requireOwnerOrAdmin(existing, currentUser);

    const { data: sessions } = await this.#repo.getAll('kidsGameSessions', { filters: { game_id: id } });
    for (const session of sessions) {
      await this.#repo.delete('kidsGameSessions', session.id);
    }

    await this.#removeBankCopies(existing, true);
    await this.#repo.delete('kidsGames', id);
  }

  // ─── Bank sync: published games file their question copies under a
  // subject category (`Kids · <subject>`, shared by all of a teacher's games
  // in that subject), so games surface in the Category and Question tabs
  // with teacher attribution (created_by). Copies carry a `kids:<gameId>`
  // tag so each game's set stays individually replaceable/removable.

  #bankTag(gameId) {
    return `kids:${gameId}`;
  }

  #bankCategoryName(game) {
    const subject = String(game.subject || '').trim() || 'General';
    return `Kids · ${subject}`.slice(0, 100);
  }

  async #ensureBankCategory(game, schoolId, teacherId) {
    // A linked category is only reusable while it still matches the game's
    // subject — categories are shared, so they are never renamed (a rename
    // would relabel other games' questions too).
    if (game.category_id) {
      try {
        const current = await this.#repo.getById('categories', game.category_id);
        if (current && current.school_id === schoolId && current.name === this.#bankCategoryName(game)) {
          if (!current.color) {
            try { await this.#repo.update('categories', current.id, { color: kidsCategoryColor(current.name) }); } catch (_) { /* cosmetic */ }
          }
          return current.id;
        }
      } catch { /* gone or moved on — resolve below */ }
    }
    const base = this.#bankCategoryName(game);
    for (let i = 0; i < 25; i++) {
      const candidate = (i === 0 ? base : `${base.slice(0, 94)} (${i + 1})`).slice(0, 100);
      const { data } = await this.#repo.getAll('categories', {
        filters: { school_id: schoolId, name: candidate },
        limit: 1,
      });
      if (!data?.length) {
        const created = await this.#repo.create('categories', {
          school_id: schoolId,
          name: candidate,
          color: kidsCategoryColor(candidate),
          created_by: teacherId,
        });
        return created.id;
      }
      // Same teacher's own subject bucket: reuse it — every game's copies
      // are tagged per game, and pruning only ever removes empty buckets.
      // Backfill a color on older colorless buckets so the bank badge renders.
      if (data[0].created_by === teacherId) {
        if (!data[0].color) {
          try { await this.#repo.update('categories', data[0].id, { color: kidsCategoryColor(data[0].name) }); } catch (_) { /* cosmetic */ }
        }
        return data[0].id;
      }
    }
    throw new ConflictError('Could not allocate a bank category for this game');
  }

  /** Delete an auto (`Kids · …`) category, but only when fully empty. */
  async #pruneCategoryIfEmpty(categoryId) {
    if (!categoryId) return;
    try {
      const cat = await this.#repo.getById('categories', categoryId);
      if (!cat || !String(cat.name || '').startsWith('Kids · ')) return;
      const { total } = await this.#repo.getAll('questions', {
        filters: { category_id: categoryId },
        limit: 1,
      });
      if (!total) await this.#repo.delete('categories', categoryId);
    } catch { /* in use or gone — leave it */ }
  }

  async #removeBankCopies(game, pruneCategory = false) {
    if (!game.category_id) return;
    const tag = this.#bankTag(game.id);
    const { data: rows } = await this.#repo.getAll('questions', {
      filters: { category_id: game.category_id },
      limit: 1000,
    });
    for (const row of rows || []) {
      const tags = String(row.tags || '').split(',').map(s => s.trim());
      if (tags.includes(tag)) {
        try { await this.#repo.delete('questions', row.id); } catch (_) { /* already gone */ }
      }
    }
    // Prune the old subject bucket only when the whole game is deleted
    // (never during a re-sync — the fresh copies are inserted right after).
    if (!pruneCategory) return;
    await this.#pruneCategoryIfEmpty(game.category_id);
  }

  async #syncBank(game, currentUser) {
    const schoolId = currentUser?.school_id ?? game.school_id;
    const teacherId = currentUser?.id ?? game.teacher_id;
    if (!schoolId || !teacherId) return;
    const oldCategoryId = game.category_id || null;
    const categoryId = await this.#ensureBankCategory(game, schoolId, teacherId);
    if (oldCategoryId && oldCategoryId !== categoryId) {
      // Game moved to another subject: drop its copies from the old bucket.
      await this.#removeBankCopies({ ...game, category_id: oldCategoryId });
      await this.#pruneCategoryIfEmpty(oldCategoryId);
    }
    if (game.category_id !== categoryId) {
      await this.#repo.update('kidsGames', game.id, { category_id: categoryId });
      game.category_id = categoryId;
    }
    await this.#removeBankCopies({ ...game, category_id: categoryId });
    const questions = Array.isArray(game.questions_json) ? game.questions_json : parseJson(game.questions_json, []);
    for (const q of questions) {
      await this.#repo.create('questions', toBankQuestion(q, {
        schoolId, teacherId, categoryId, gameId: game.id,
      }));
    }
  }

  // ─── Publish / PIN ───

  async publish(id, currentUser) {
    const existing = await this.getById(id, currentUser.school_id);
    this.#requireOwnerOrAdmin(existing, currentUser);

    if (existing.status === 'published') {
      // Backfill bank copies for games published before bank sync existed.
      try { await this.#syncBank(existing, currentUser); } catch (_) { /* best-effort */ }
      return this.getById(id, currentUser.school_id);
    }

    let pin;
    for (let attempt = 0; attempt < 10; attempt++) {
      pin = generatePin();
      const { data } = await this.#repo.getAll('kidsGames', { filters: { pin }, limit: 1 });
      if (!data?.length) break;
    }

    if (!pin) throw new ConflictError('Could not generate unique PIN');

    const updated = await this.#repo.update('kidsGames', id, {
      status: 'published',
      pin,
    });

    const result = { ...updated, questions_json: parseJson(updated.questions_json, []), config_json: parseJson(updated.config_json, {}) };
    // Publishing pushes a category + tagged question copies into the bank
    // (Category / Question tabs). Best-effort: the PIN flow must not fail.
    try { await this.#syncBank(result, currentUser); } catch (_) { /* best-effort */ }
    return this.getById(id, currentUser.school_id);
  }

  async archive(id, currentUser) {
    const existing = await this.getById(id, currentUser.school_id);
    this.#requireOwnerOrAdmin(existing, currentUser);

    const updated = await this.#repo.update('kidsGames', id, { status: 'archived' });
    return { ...updated, questions_json: parseJson(updated.questions_json, []), config_json: parseJson(updated.config_json, {}) };
  }

  // ─── Public Kid Player Endpoints ───

  async getByPin(pin) {
    const { data } = await this.#repo.getAll('kidsGames', { filters: { pin: pin.toUpperCase(), status: 'published' }, limit: 1 });
    const game = data[0];
    if (!game) throw new NotFoundError('Game not found or not published');

    return {
      id: game.id,
      school_id: game.school_id,
      name: game.name,
      game_type: game.game_type,
      theme: game.theme,
      grade: game.grade,
      subject: game.subject,
      questions: parseJson(game.questions_json, []).map((q, idx) => {
        const nq = normalizeKidQuestion(q);
        return { ...nq, index: idx };
      },),
      config: parseJson(game.config_json, {}),
    };
  }

  async startSession(pin, playerData) {
    const parsed = KidsSessionCreateSchema.safeParse(playerData);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const game = await this.getByPin(pin);
    const questions = game.questions;
    const totalPoints = questions.reduce((sum, q) => sum + (q.points || 1), 0);

    const session = await this.#repo.create('kidsGameSessions', {
      game_id: game.id,
      school_id: game.school_id,
      player_name: parsed.data.player_name,
      avatar: parsed.data.avatar ?? null,
      score: 0,
      stars: 0,
      answers_json: '[]',
      completed: false,
    });

    return { session, game, totalPoints };
  }

  /**
   * Logged-in play (students in session, teacher preview): the session is
   * linked to the user so results, leaderboards and gamification treat it
   * like any other game. Optional tournament_id joins an open tournament
   * and registers the entry.
   */
  async startUserSession(gameId, user, { player_name, avatar, tournament_id } = {}) {
    if (!user || !user.id) throw new ForbiddenError();
    const game = await this.getById(gameId, user.school_id);
    if (!game || game.status !== 'published') throw new ValidationError({ status: ['Game is not published'] });

    let tournamentId = null;
    if (tournament_id) {
      const t = await this.#repo.getById('tournaments', tournament_id);
      if (!t || (user.school_id && t.school_id !== user.school_id)) throw new NotFoundError('Tournament');
      if (!['open', 'active'].includes(t.status)) {
        throw new ValidationError({ tournament_id: ['Tournament is not open'] });
      }
      if (t.kids_game_id && t.kids_game_id !== game.id) {
        throw new ValidationError({ tournament_id: ['This tournament is linked to another game'] });
      }
      tournamentId = t.id;
      try {
        const { data: existing } = await this.#repo.getAll('tournament_entries', {
          filters: { tournament_id: t.id, user_id: user.id },
          limit: 1,
        });
        if (!existing?.length) {
          await this.#repo.create('tournament_entries', {
            tournament_id: t.id,
            user_id: user.id,
            school_id: game.school_id,
            score: 0,
            completed: false,
            registered_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        if (e?.code !== 'CONFLICT') throw e;
      }
    }

    const session = await this.#repo.create('kidsGameSessions', {
      game_id: game.id,
      user_id: user.id,
      school_id: game.school_id,
      tournament_id: tournamentId,
      player_name: String(player_name || user.name || 'Player').slice(0, 50),
      avatar: avatar ?? null,
      score: 0,
      stars: 0,
      answers_json: '[]',
      completed: false,
    });

    const pub = await this.getByPin(game.pin);
    const totalPoints = pub.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    return { session, game: pub, totalPoints };
  }

  /** Published games for players (primaire students): meta only, no answers. */
  async listPublished(schoolId, { search = '', limit = 20, offset = 0, teacherId = null } = {}) {
    const { data, total } = await this.#repo.getAll('kidsGames', {
      filters: {
        school_id: schoolId,
        status: 'published',
        // Teachers previewing browse only their own games; students and
        // admins see every published game in the school.
        ...(teacherId ? { teacher_id: teacherId } : {}),
      },
      limit: Math.min(Math.max(Number(limit) || 20, 1), 100),
      offset: Math.max(Number(offset) || 0, 0),
      orderBy: 'created_at',
      direction: 'desc',
      search: search || null,
    });
      return {
        data: data.map((g) => {
          // Class assignment lives in config_json (same convention as the
          // regular games' settings_json.classIds). Surfaced so staff
          // pickers and student clients can enforce teacher-controlled
          // visibility without extra round trips.
          const config = parseJson(g.config_json, {});
          const classIds = Array.isArray(config?.classIds)
            ? config.classIds.map((id) => String(id || '').trim()).filter(Boolean)
            : [];
          return {
            id: g.id,
            name: g.name,
            description: g.description,
            game_type: g.game_type,
            theme: g.theme,
            grade: g.grade,
            subject: g.subject,
            pin: g.pin,
            play_count: g.play_count,
            question_count: parseJson(g.questions_json, []).length,
            updated_at: g.updated_at,
            classIds,
            // Author attribution for student teacher-scoping (see
            // GET /kids/browse). No answers or management fields here.
            teacher_id: g.teacher_id || null,
          };
        }),
        total,
      };
  }

  async submitAnswers(sessionId, data, totalPoints, opts = {}) {
    const parsed = KidsSessionCompleteSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const session = await this.#repo.getById('kidsGameSessions', sessionId);
    if (!session) throw new NotFoundError('Session');
    if (session.completed) throw new ValidationError({ status: ['Session already completed'] });
    // A user-linked session can only be completed by its owner.
    if (session.user_id && opts.userId && session.user_id !== opts.userId) {
      throw new ForbiddenError();
    }

    const game = await this.getById(session.game_id);
    const questions = parseJson(game.questions_json, []);
    const questionMap = new Map(questions.map(q => [q.id, q]));

    const answers = parseJson(parsed.data.answers_json, []);
    let score = 0;
    const detailedAnswers = [];

    for (const ans of answers) {
      const question = questionMap.get(ans.question_id);
      if (!question) continue;

      const isCorrect = checkAnswer(question, ans.given);
      const points = isCorrect ? (Number(question.points) || 1) : 0;
      score += points;

      detailedAnswers.push({
        question_id: ans.question_id,
        given: ans.given,
        correct: isCorrect,
        time_ms: ans.time_ms ?? 0,
      });
    }

    // ── Math Quest: scope this run to the adventure level the answers
    // belong to. The level is derived from the answered question ids first
    // (never trusted from the client); the optional client-supplied level_id
    // hint is honoured only after validating the answers really fit inside
    // it. Non-quest games and runs that cover the whole game either hit the
    // implicit 'default' level or stay whole-game — both preserve the
    // original platform behaviour for every other game type.
    const plan = this.#questPlanFor(game, questions);
    const answeredIds = answers.map(a => String(a.question_id));
    const answeredSet = new Set(answeredIds);
    let level = plan.find(
      (lv) => lv.questionIds.length === answeredSet.size &&
        lv.questionIds.every(id => answeredSet.has(id)),
    ) || null;
    if (!level && parsed.data.level_id) {
      const hinted = plan.find(lv => lv.id === parsed.data.level_id);
      if (hinted && answeredSet.size > 0 && answeredIds.every(id => hinted.questionIds.includes(id))) {
        level = hinted;
      }
    }
    // Denominator for stars: the level's own points for a level-scoped run
    // (a 3-question level with 2 correct is 67%, not 2/10 of the whole map).
    let scopedPoints;
    if (level) {
      const allowed = new Set(level.questionIds);
      scopedPoints = questions
        .filter(q => allowed.has(String(q.id)))
        .reduce((sum, q) => sum + (Number(q.points) || 1), 0);
    } else {
      scopedPoints = totalPoints;
    }
    const stars = calculateStars(score, scopedPoints);

    // Unlock-chain is enforced SERVER-side: a user-linked run does not earn
    // persistent progress for a level whose previous levels were never
    // passed (the planned/id-scoped grading itself still stands).
    if (session.user_id && level) {
      const unlockable = await this.#levelUnlockable(level, plan, game.id, session.user_id);
      if (!unlockable) level = null;
    }

    await this.#repo.update('kidsGameSessions', sessionId, {
      score,
      stars,
      answers_json: JSON.stringify(detailedAnswers),
      completed: true,
    });

    await this.#repo.update('kidsGames', game.id, {
      play_count: (Number(game.play_count) || 0) + 1,
    });

    // Math Quest progress: normalized level + user-linked run → ratchet the
    // student's best stars for that level (MAX upsert; games with the
    // fallback config attribute whole-game runs to the 'default' level).
    // Rewards live ONLY here — client stars are never trusted. Progress must
    // never break the play flow (best-effort like result recording).
    if (session.user_id && level) {
      try {
        await this.#ratchetQuestProgress({ game, session, levelId: level.id, stars });
      } catch { /* progress recording is best-effort */ }
    }

    // Unified results: every completion (anonymous PIN included) is recorded
    // like any other game so dashboards, history and tournaments all see it.
    let resultId = null;
    try {
      const record = await this.#recordResult({ session, game, detailedAnswers, score, stars, totalPoints });
      resultId = record?.id ?? null;
    } catch { /* results must never break the play flow */ }

    return {
      score,
      stars,
      totalPoints,
      percent: totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0,
      answers: detailedAnswers,
      result_id: resultId,
      // Math Quest extras (null for plain kids games): which level the run
      // belonged to and the level-scoped denominator behind `stars`.
      quest: level ? {
        level_id: level.id,
        level_name: level.name,
        level_total_points: scopedPoints,
      } : null,
    };
  }

  /**
   * Write the standard Result row for a kids completion, accumulate
   * tournament entries, and award EXP to logged-in players — the same
   * treatment normal games get.
   */
  async #recordResult({ session, game, detailedAnswers, score, stars, totalPoints }) {
    const percent = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const timeMs = detailedAnswers.reduce((s, a) => s + (Number(a.time_ms) || 0), 0);
    const mode = session.tournament_id ? 'tournament' : 'game';

    let attempt = 1;
    try {
      const idFilter = session.user_id ? { user_id: session.user_id } : { player_name: session.player_name };
      const { data: prior } = await this.#repo.getAll('kidsGameSessions', {
        filters: { game_id: game.id, completed: true, ...idFilter },
        limit: 1000,
      });
      attempt = (prior || []).filter((s) => s.id !== session.id).length + 1;
    } catch { /* default attempt 1 */ }

    const row = await this.#repo.create('results', {
      school_id: game.school_id,
      exam_id: null,
      user_id: session.user_id || null,
      score: percent,
      total_points: totalPoints,
      earned_points: score,
      time_spent: Math.round(timeMs / 1000),
      answers_json: JSON.stringify({
        mode,
        source: 'kids-game',
        kidsGameId: game.id,
        gameName: game.name,
        gameType: game.game_type,
        playerName: session.player_name,
        avatar: session.avatar || null,
        pin: game.pin || null,
        tournamentId: session.tournament_id || null,
        totalPoints,
        percent,
        stars,
        answers: detailedAnswers,
      }),
      mode,
      passed: percent >= 50,
      attempt_number: attempt,
    });

    // Tournament accumulation (entries are per-user by design).
    if (session.tournament_id && session.user_id) {
      try {
        const { data: entries } = await this.#repo.getAll('tournament_entries', {
          filters: { tournament_id: session.tournament_id, user_id: session.user_id },
          limit: 1,
        });
        const entry = entries?.[0];
        if (entry) {
          await this.#repo.update('tournament_entries', entry.id, {
            score: Number(entry.score || 0) + score,
          });
        }
      } catch { /* leaderboard stays as-is */ }
    }

    // EXP for logged-in players (mirrors the student-workspace scoring).
    if (session.user_id) {
      try { await this.#awardExp(game.school_id, session.user_id, detailedAnswers); } catch { /* ignore */ }
    }
    return row;
  }

  async #awardExp(schoolId, userId, detailedAnswers) {
    const correct = detailedAnswers.filter((a) => a.correct).length;
    if (!correct) return;
    let rate = 10;
    try {
      const model = this.#repo.modelFor ? this.#repo.modelFor('gamification') : null;
      const cfg = model ? await model.findUnique({ where: { school_id: schoolId } }) : null;
      if (cfg && Number(cfg.exp_per_correct) > 0) rate = Number(cfg.exp_per_correct);
    } catch { /* default rate */ }
    const user = await this.#repo.getById('users', userId);
    if (!user) return;
    let gam = {};
    try {
      gam = JSON.parse(user.gamification_json || '{}');
      if (!gam || typeof gam !== 'object') gam = {};
    } catch { gam = {}; }
    gam.exp = (Number(gam.exp) || 0) + correct * rate;
    await this.#repo.update('users', userId, { gamification_json: JSON.stringify(gam) });
  }

  // ─── Sessions / Results ───

  async getSessions(gameId, currentUser) {
    const game = await this.getById(gameId, currentUser.school_id);
    this.#requireOwnerOrAdmin(game, currentUser);

    const { data } = await this.#repo.getAll('kidsGameSessions', {
      filters: { game_id: gameId },
      orderBy: 'created_at',
      direction: 'desc',
      limit: 500,
    });

    return data.map(s => ({
      ...s,
      answers_json: parseJson(s.answers_json, []),
    }));
  }

  // ─── AI Generation Helper ───

  static getQuestionTypeForGame(gameType) {
    const map = {
      'bubble-pop': 'multiple-choice',
      'star-collector': 'multiple-choice',
      'leap-frog': 'true-false',
      'sort-it-out': 'odd-one-out',
      'pair-party': 'matching',
      'build-a-tower': 'draggable',
      'magic-words': 'fill-blank',
      'code-explorer': 'code',
      'math-quest': 'multiple-choice',
    };
    return map[gameType] || 'multiple-choice';
  }

  static getAIConfigForGame(gameType) {
    const config = {};
    if (gameType === 'star-collector') config.allowMultipleAnswers = true;
    return config;
  }

  #requireTeacher(user) {
    if (!user || !['admin', 'teacher', 'super_admin'].includes(user.role)) {
      throw new ForbiddenError();
    }
  }

  #requireOwnerOrAdmin(game, user) {
    if (user.role === 'admin' || user.role === 'super_admin') return;
    if (game.teacher_id === user.id) return;
    throw new ForbiddenError();
  }

  /**
   * Math Quest: validate an optional config_json.levels plan — the football
   * schema AND the question partition must both agree, or the create/update
   * is rejected. Absent levels are valid (the game falls back to one level).
   */
  #validateQuestLevels(gameType, config, questions) {
    if (String(gameType) !== 'math-quest') return;
    const levels = config && config.levels;
    if (levels == null) return;
    if (!Array.isArray(levels)) {
      throw new ValidationError({ config_json: ['levels must be a list of levels'] });
    }
    const parsed = KidQuestLevelsSchema.safeParse(levels);
    if (!parsed.success) {
      throw new ValidationError({ config_json: ['Each level needs an id, a title, and 1-30 question ids (1-12 levels, pass_stars 1-3)'] });
    }
    const ids = new Set(questions.map(q => String(q.id)));
    const seen = new Set();
    const seenIds = new Set();
    for (const level of levels) {
      if (seenIds.has(String(level.id))) {
        throw new ValidationError({ config_json: [`The level id "${level.id}" is used more than once`] });
      }
      seenIds.add(String(level.id));
      for (const qid of level.questions) {
        if (!ids.has(String(qid))) {
          throw new ValidationError({ config_json: [`Level "${level.name}" references an unknown question id`] });
        }
        if (seen.has(String(qid))) {
          throw new ValidationError({ config_json: [`Each question can be used by only one level ("${level.name}")`] });
        }
        seen.add(String(qid));
      }
    }
    if (seen.size !== questions.length) {
      throw new ValidationError({ config_json: ['Every question must be assigned to one level'] });
    }
  }

  /** Normalized quest plan for a game (validated config or the fallback). */
  #questPlanFor(game, questions) {
    const plan = questLevels(parseJson(game.config_json, {}), questions);
    return plan || defaultQuestLevel(questions);
  }

  /**
   * Unlock-chain gate read at submit time: levels after position 0 only
   * count when every earlier level has best stars >= its pass threshold.
   * Mirrors questProgress's chain so recorded progress can never skip ids.
   */
  async #levelUnlockable(level, plan, gameId, userId) {
    if (!level || level.index === 0) return true;
    const { data: rows } = await this.#repo.getAll('kidsQuestProgress', {
      filters: { game_id: gameId, user_id: userId },
      limit: 50,
    });
    const best = {};
    for (const row of rows || []) {
      const cur = Number(row.best_stars) || 0;
      best[row.level_id] = Math.max(best[row.level_id] ?? 0, cur);
    }
    for (const lv of plan) {
      if (lv.index >= level.index) break;
      if ((best[lv.id] ?? 0) < lv.thresholdStars) return false;
    }
    return true;
  }

  /**
   * Publish a verified level result to KidQuestProgress (MAX-ratchet).
   * Rows are keyed (game, user, level) via the unique triple, so repeated
   * submissions can never duplicate; best_stars only ever moves upward.
   * Replays with a lower score keep the best verified result.
   */
  async #ratchetQuestProgress({ game, session, levelId, stars }) {
    const st = Math.max(0, Math.min(3, Number(stars) || 0));
    const delegate = this.#repo.modelFor('kidsQuestProgress');
    const key = { game_id: game.id, user_id: session.user_id, level_id: levelId };
    const school = session.school_id || game.school_id;
    // 1) Row exists with a best that already covers this run → count only.
    const same = await delegate.updateMany({
      where: { ...key, best_stars: { gte: st } },
      data: { play_count: { increment: 1 } },
    });
    if (same.count > 0) return;
    // 2) Row exists with a worse best → ratchet the best up and count.
    const low = await delegate.updateMany({
      where: { ...key, best_stars: { lt: st } },
      data: { best_stars: { set: st }, play_count: { increment: 1 } },
    });
    if (low.count > 0) return;
    // 3) No row yet → create (a concurrent creator trips the unique guard).
    try {
      await delegate.create({ data: { school_id: school, ...key, best_stars: st, play_count: 1 } });
    } catch (err) {
      if (err?.code !== 'P2002') throw err;
      const row = await delegate.findUnique({ where: { game_id_user_id_level_id: key } });
      if (!row) throw err;
      if ((Number(row.best_stars) || 0) < st) {
        await delegate.update({ where: { id: row.id }, data: { best_stars: { set: st } } });
      }
      await delegate.updateMany({ where: { id: row.id }, data: { play_count: { increment: 1 } } });
    }
  }

  /**
   * Quest progress for one student + one game: normalized levels with the
   * student's best server-verified stars and the deterministic unlock chain
   * computed server-side (level i+1 unlocks only when level i's best stars
   * reach its configured pass threshold; the first level is always open).
   */
  async questProgress(gameId, user) {
    if (!user || !user.id) throw new ForbiddenError();
    const game = await this.getById(gameId, user.school_id);
    if (!game || game.status !== 'published') throw new NotFoundError('Game not found or not published');
    const questions = parseJson(game.questions_json, []);
    const plan = this.#questPlanFor(game, questions);
    const { data: rows } = await this.#repo.getAll('kidsQuestProgress', {
      filters: { game_id: game.id, user_id: user.id },
      limit: 50,
    });
    const best = {};
    for (const row of rows || []) {
      const cur = Number(row.best_stars) || 0;
      best[row.level_id] = Math.max(best[row.level_id] ?? 0, cur);
    }
    let prevPassed = true;
    const levels = plan.map((lv) => {
      const unlocked = prevPassed;
      const passed = (best[lv.id] ?? 0) >= lv.thresholdStars;
      prevPassed = prevPassed && passed;
      return {
        index: lv.index,
        id: lv.id,
        name: lv.name,
        question_count: lv.questionIds.length,
        pass_stars: lv.thresholdStars,
        best_stars: best[lv.id] ?? null,
        passed,
        unlocked,
      };
    });
    return { game_id: game.id, levels };
  }
}