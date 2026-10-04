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

export class KidsGameService {
  #repo;

  constructor(repo) {
    this.#repo = repo;
  }

  // ─── Teacher/Admin CRUD ───

  async list(filters = {}, pagination = {}) {
    const parsed = KidsGameFilterSchema.safeParse({ ...filters, ...pagination });
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);
    const { limit, offset, orderBy, direction, search, ...rest } = parsed.data;
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

    const updated = await this.#repo.update('kidsGames', id, parsed.data);
    return { ...updated, questions_json: parseJson(updated.questions_json, []), config_json: parseJson(updated.config_json, {}) };
  }

  async delete(id, currentUser) {
    const existing = await this.getById(id, currentUser.school_id);
    this.#requireOwnerOrAdmin(existing, currentUser);

    const { data: sessions } = await this.#repo.getAll('kidsGameSessions', { filters: { game_id: id } });
    for (const session of sessions) {
      await this.#repo.delete('kidsGameSessions', session.id);
    }

    await this.#repo.delete('kidsGames', id);
  }

  // ─── Publish / PIN ───

  async publish(id, currentUser) {
    const existing = await this.getById(id, currentUser.school_id);
    this.#requireOwnerOrAdmin(existing, currentUser);

    if (existing.status === 'published') {
      return existing;
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

    return { ...updated, questions_json: parseJson(updated.questions_json, []), config_json: parseJson(updated.config_json, {}) };
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
      player_name: parsed.data.player_name,
      avatar: parsed.data.avatar ?? null,
      score: 0,
      stars: 0,
      answers_json: '[]',
      completed: false,
    });

    return { session, game, totalPoints };
  }

  async submitAnswers(sessionId, data, totalPoints) {
    const parsed = KidsSessionCompleteSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors);

    const session = await this.#repo.getById('kidsGameSessions', sessionId);
    if (!session) throw new NotFoundError('Session');
    if (session.completed) throw new ValidationError({ status: ['Session already completed'] });

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

    const stars = calculateStars(score, totalPoints);

    await this.#repo.update('kidsGameSessions', sessionId, {
      score,
      stars,
      answers_json: JSON.stringify(detailedAnswers),
      completed: true,
    });

    await this.#repo.update('kidsGames', game.id, {
      play_count: (Number(game.play_count) || 0) + 1,
    });

    return {
      score,
      stars,
      totalPoints,
      percent: totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0,
      answers: detailedAnswers,
    };
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
}