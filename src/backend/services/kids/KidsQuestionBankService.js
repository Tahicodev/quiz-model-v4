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
import { prisma } from '../../prisma.js';
import {
  MECHANIC_TO_QUESTION_TYPE,
  QUESTION_TYPE_TO_MECHANIC,
  BANKABLE_TYPES,
  parseContent,
  levelToQuestionText,
  levelToAnswerAndOptions,
  questionToLevelContent,
} from '../../../shared/kids-question-bridge.js';

export { BANKABLE_TYPES };

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
    const text = levelToQuestionText(content);
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
   * Delegates to the shared bridge so a question converted here and the same
   * question imported into a game produce the same content.
   */
  questionToLevelContent(question, mechanic) {
    return questionToLevelContent(question, mechanic, { language: 'en' });
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
