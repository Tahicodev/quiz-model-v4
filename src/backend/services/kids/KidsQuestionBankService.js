/**
 * src/backend/services/kids/KidsQuestionBankService.js
 *
 * Connects Game Studio to the shared question bank that already backs the
 * Questions and Categories tabs. Two directions:
 *
 *  1. Outbound (activity -> bank): every generated level is mirrored into a real
 *     `Question` row inside a `Category`, and the level keeps a `question_id`.
 *     The level still stores its own content_json, so an activity keeps playing
 *     even if the bank question is later edited or deleted.
 *
 *  2. Inbound (bank -> activity): a teacher picks a bank question and it is
 *     added as a level, converted back into the mechanic the activity uses.
 *
 * Only mechanics that survive a round trip are offered in the picker. The exotic
 * game mechanics (memory, bubble_pop, treasure_hunt, …) stay activity-local,
 * because flattening them into Question.text/options_json/answer would silently
 * destroy the very data the engine needs to play them.
 */

import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { QUESTION_TYPES } from '../../../shared/constants.js';
import { prisma } from '../../prisma.js';

/** Kids mechanic -> bank question type, for mechanics that round-trip cleanly. */
const MECHANIC_TO_QUESTION_TYPE = Object.freeze({
  multiple_choice: QUESTION_TYPES.MCQ,
  find_correct: QUESTION_TYPES.MCQ,
  true_false: QUESTION_TYPES.TRUE_FALSE,
  word_order: QUESTION_TYPES.ORDER,
  sequence: QUESTION_TYPES.ORDER,
  matching: QUESTION_TYPES.MATCHING,
  memory: QUESTION_TYPES.MATCHING,
  drag_drop: QUESTION_TYPES.FILL_BLANK,
  sorting: QUESTION_TYPES.MATCHING,
});

/** Reverse mapping, used when a bank question is pulled into an activity. */
const QUESTION_TYPE_TO_MECHANIC = Object.freeze({
  [QUESTION_TYPES.MCQ]: 'multiple_choice',
  [QUESTION_TYPES.TRUE_FALSE]: 'true_false',
  [QUESTION_TYPES.ORDER]: 'word_order',
  [QUESTION_TYPES.MATCHING]: 'matching',
  [QUESTION_TYPES.FILL_BLANK]: 'drag_drop',
});

export const BANKABLE_TYPES = Object.freeze(Object.values(MECHANIC_TO_QUESTION_TYPE));

function parseContent(contentJson) {
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
function levelToText(content) {
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
function levelToAnswerAndOptions(content) {
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

export class KidsQuestionBankService {
  /**
   * Mirrors one level into the bank. Returns the created/updated Question id, or
   * null when the mechanic cannot be represented (the level still saves fine).
   *
   * `db` must be the same client the caller wrote the level with. Rows created
   * inside an interactive transaction are invisible to the global client, so
   * looking the level up through `prisma` would always miss.
   */
  async mirrorLevel(level, { schoolId, categoryId, activity, points, difficulty, db = prisma }) {
    const content = parseContent(level.content_json);
    const type = MECHANIC_TO_QUESTION_TYPE[level.level_type];
    if (!type) return null;

    const { optionsJson, answer } = levelToAnswerAndOptions(content);
    const text = levelToText(content);
    if (!answer) return null;

    // Tagging with the sub-topic lets the pool picker filter by topic later.
    const tags = [activity?.subject, activity?.sub_topic, activity?.grade, level.level_type]
      .filter(Boolean)
      .map(String)
      .join(',');

    // Reuse an existing row when the level is already linked, so regenerating or
    // re-saving an activity updates the bank question instead of duplicating it.
    let linkedQuestionId = level.question_id || null;
    if (level.id && !linkedQuestionId) {
      const existing = await db.kidsActivityLevel.findUnique({
        where: { id: level.id },
        select: { question_id: true },
      });
      linkedQuestionId = existing?.question_id || null;
    }

    if (linkedQuestionId) {
      await db.question.update({
        where: { id: linkedQuestionId },
        data: {
          text,
          type,
          options_json: optionsJson,
          answer,
          explanation: level.explanation ?? null,
          points: level.points ?? points ?? 10,
          difficulty: difficulty || 'easy',
          tags,
        },
      });
      return linkedQuestionId;
    }

    const question = await db.question.create({
      data: {
        school_id: schoolId,
        category_id: categoryId || null,
        type,
        text,
        options_json: optionsJson,
        answer,
        explanation: level.explanation ?? null,
        points: level.points ?? points ?? 10,
        difficulty: difficulty || 'easy',
        tags,
        media_url: level.media_url ?? null,
      },
    });
    return question.id;
  }

  /**
   * Finds or creates the Category that groups an activity's questions, named
   * after the activity so teachers recognise it in the Categories tab.
   */
  async ensureCategory(activity, schoolId, db = prisma) {
    const name = `Game Studio · ${activity.title}`.slice(0, 120);
    const existing = await db.category.findFirst({ where: { school_id: schoolId, name } });
    if (existing) return existing.id;
    const created = await db.category.create({
      data: { school_id: schoolId, name, icon: '🎮', color: '#6366f1' },
    });
    return created.id;
  }

  /**
   * Mirrors a list of levels and stamps question_id back onto the level rows.
   * `db` lets the caller share its transaction with the activity write.
   */
  async mirrorLevels({ levels, activity, schoolId, difficulty, db = prisma }) {
    if (!levels?.length) return [];
    const categoryId = await this.ensureCategory(activity, schoolId, db);
    const ids = [];
    for (const level of levels) {
      const questionId = await this.mirrorLevel(level, { schoolId, categoryId, activity, difficulty, db });
      if (questionId) {
        ids.push({ levelId: level.id, questionId });
        if (level.id) {
          await db.kidsActivityLevel.update({ where: { id: level.id }, data: { question_id: questionId } });
        }
      }
    }
    return ids;
  }

  /** Categories that already hold Game Studio questions, for the pool picker. */
  async listCategories(schoolId) {
    return prisma.category.findMany({
      where: { school_id: schoolId, questions: { some: {} } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, icon: true, color: true, _count: { select: { questions: true } } },
    });
  }

  /**
   * Bank questions a Game Studio activity can reuse, narrowed to the types that
   * convert back into a playable level.
   */
  async listQuestions(schoolId, { categoryId, type, search, limit = 60 } = {}) {
    const where = {
      school_id: schoolId,
      type: { in: type ? [type] : BANKABLE_TYPES },
    };
    if (categoryId) where.category_id = categoryId;
    if (search) where.text = { contains: search };

    return prisma.question.findMany({
      where,
      orderBy: { updated_at: 'desc' },
      take: Math.min(Number(limit) || 60, 200),
      include: { category: { select: { id: true, name: true } } },
    });
  }

  /**
   * Rebuilds a playable level payload from a bank question, for the mechanic the
   * target activity actually uses (narrative shells get a core mechanic inside).
   */
  questionToLevelContent(question, mechanic) {
    const options = (() => {
      if (!question.options_json) return [];
      try {
        return JSON.parse(question.options_json);
      } catch {
        return [];
      }
    })();

    // Question.text is the question itself, so the instruction has to come from
    // the mechanic — reusing the text for both made every level read "Foo? Foo?".
    // Game Studio is an English workspace, so the scaffold copy is English.
    const INSTRUCTIONS = {
      matching: 'Match each one with its pair!',
      memory: 'Find the identical pairs!',
      word_order: 'Put the words in the right order!',
      sequence: 'Put these in the right order!',
      drag_drop: 'Drag the right word into the gap!',
      true_false: 'True or false?',
      multiple_choice: 'Choose the right answer!',
    };
    const instruction = INSTRUCTIONS[mechanic] || INSTRUCTIONS.multiple_choice;

    if (mechanic === 'matching' || mechanic === 'memory') {
      let pairs = options;
      if (!Array.isArray(pairs) || !pairs.length || typeof pairs[0] !== 'object') {
        try { pairs = JSON.parse(question.answer); } catch { pairs = []; }
      }
      if (!Array.isArray(pairs) || !pairs.length) return null;
      if (mechanic === 'memory') {
        const cards = [];
        pairs.forEach((p, i) => {
          cards.push({ id: `c${i}a`, matchId: `m${i}`, value: p[0] ?? p.left, type: 'text' });
          cards.push({ id: `c${i}b`, matchId: `m${i}`, value: p[0] ?? p.left, type: 'text' });
        });
        return { instruction: instruction, cards };
      }
      return {
        instruction: instruction,
        pairs: pairs.map((p, i) => ({ id: `p${i + 1}`, left: p[0] ?? p.left, right: p[1] ?? p.right })),
      };
    }

    if (mechanic === 'word_order' || mechanic === 'sequence') {
      let answer = question.answer;
      try { answer = JSON.parse(question.answer); } catch { /* plain string */ }
      const values = Array.isArray(answer) ? answer : String(answer ?? '').split(/\s+/).filter(Boolean);
      if (!values.length) return null;
      return {
        instruction: instruction,
        question: question.text,
        answer: Array.isArray(answer) ? undefined : String(question.answer),
        items: values.map((v, i) => ({ id: `n${i + 1}`, value: String(v) })),
        correctOrder: values.map((_, i) => `n${i + 1}`),
      };
    }

    if (mechanic === 'drag_drop') {
      const answer = question.answer || '';
      return {
        instruction: instruction,
        question: question.text,
        template: `${answer} {blank}`,
        blanks: [{ position: 0, answer }],
        choices: options.length ? options : [answer],
      };
    }

    if (mechanic === 'true_false') {
      return {
        instruction: instruction,
        question: question.text,
        options: [
          { id: 'tf1', value: 'True', emoji: '✅' },
          { id: 'tf2', value: 'False', emoji: '❌' },
        ],
        correctId: String(question.answer).toLowerCase() === 'true' ? 'tf1' : 'tf2',
      };
    }

    // multiple_choice (also the fallback for any bank type)
    if (!options.length) return null;
    const correctIndex = options.findIndex(o => String(o) === String(question.answer));
    return {
      instruction: instruction,
      question: question.text,
      options: options.map((o, i) => ({ id: `opt${i + 1}`, value: String(o) })),
      correctId: `opt${correctIndex >= 0 ? correctIndex + 1 : 1}`,
    };
  }

  /**
   * Adds a bank question to an activity as a new level and links it.
   */
  async addQuestionToActivity({ activityId, questionId, schoolId }) {
    const activity = await prisma.kidsActivity.findFirst({
      where: { id: activityId, school_id: schoolId },
    });
    if (!activity) throw new NotFoundError('Activity');

    const question = await prisma.question.findFirst({ where: { id: questionId, school_id: schoolId } });
    if (!question) throw new NotFoundError('Question');
    if (!BANKABLE_TYPES.includes(question.type)) {
      throw new ValidationError('This question type cannot be used in Game Studio.', {
        type: ['Unsupported question type for a game level'],
      });
    }

    // A narrative shell keeps its own mechanic inside content.mechanic, so the
    // level_type stays the template and the payload holds the core mechanic.
    const isNarrative = activity.game_template && !['multiple_choice', 'word_order', 'drag_drop', 'matching', 'memory', 'sorting', 'sequence', 'find_correct', 'bubble_pop', 'true_false'].includes(activity.game_template);
    const coreMechanic = QUESTION_TYPE_TO_MECHANIC[question.type] || 'multiple_choice';
    const mechanic = isNarrative ? coreMechanic : (activity.game_template === 'find_correct' ? 'multiple_choice' : activity.game_template);

    const content = this.questionToLevelContent(question, mechanic);
    if (!content) {
      throw new ValidationError('This question does not have enough data to build a playable level.', {
        type: ['Question has no options or answer data'],
      });
    }
    if (isNarrative) content.mechanic = coreMechanic;

    const last = await prisma.kidsActivityLevel.findFirst({
      where: { activity_id: activityId },
      orderBy: { order_index: 'desc' },
      select: { order_index: true },
    });

    const level = await prisma.kidsActivityLevel.create({
      data: {
        activity_id: activityId,
        order_index: (last?.order_index ?? -1) + 1,
        level_type: activity.game_template,
        content_json: JSON.stringify(content),
        points: question.points ?? 10,
        explanation: question.explanation ?? null,
        media_url: question.media_url ?? null,
        question_id: question.id,
      },
    });
    return level;
  }
}
