/**
 * src/backend/services/kids/KidsActivityService.js
 *
 * Domain service managing Kids Activities, Levels, and Dashboard.
 */

import crypto from 'crypto';
import { NotFoundError, ConflictError, ValidationError } from '../../../shared/errors.js';
import { ActivityValidator } from './ActivityValidator.js';
import { prisma } from '../../prisma.js';
import { KidsQuestionBankService } from './KidsQuestionBankService.js';

export class KidsActivityService {
  constructor(repo) {
    this.repo = repo;
    this.bank = new KidsQuestionBankService();
  }

  /** Generate random uppercase 6-char code */
  static generateJoinCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return code;
  }

  /**
   * The AI generate endpoint returns extra reporting fields (source, warnings,
   * model) and the wizard sends its whole data object back on save. Only real
   * columns are forwarded, otherwise Prisma rejects the whole request with
   * "Unknown argument".
   */
  static #activityColumns(data) {
    const allowed = [
      'title', 'description', 'subject', 'sub_topic', 'grade', 'age_min', 'age_max',
      'objective', 'game_template', 'theme', 'difficulty', 'language',
      'settings_json', 'rewards_json', 'progression_json', 'estimated_duration',
    ];
    const out = {};
    for (const key of allowed) if (data[key] !== undefined) out[key] = data[key];
    return out;
  }

  /**
   * Normalises an incoming level into the columns KidsActivityLevel expects.
   */
  static #levelRow(lvl, index, activityId) {
    return {
      activity_id: activityId,
      order_index: lvl.order_index ?? index,
      level_type: lvl.level_type,
      content_json: typeof lvl.content_json === 'string' ? lvl.content_json : JSON.stringify(lvl.content_json),
      points: lvl.points ?? 10,
      hint: lvl.hint ?? null,
      explanation: lvl.explanation ?? null,
      media_url: lvl.media_url ?? null,
      narrative_json: lvl.narrative_json ? (typeof lvl.narrative_json === 'string' ? lvl.narrative_json : JSON.stringify(lvl.narrative_json)) : null,
    };
  }

  /**
   * Replaces the class assignment list chosen in the wizard's Audience step.
   * Class ids are validated against the same school, so an activity can never be
   * pointed at another school's class. An empty list is meaningful and kept: it
   * means the game is open to the whole school.
   */
  async #syncClasses(tx, activityId, classIds, schoolId) {
    if (!Array.isArray(classIds)) return;
    const unique = [...new Set(classIds.filter(Boolean))];
    await tx.kidsActivityClass.deleteMany({ where: { activity_id: activityId } });
    if (!unique.length) return;
    const owned = await tx.class.findMany({
      where: { id: { in: unique }, school_id: schoolId },
      select: { id: true },
    });
    // Silently skipping an unknown id would save the activity with a different
    // audience than the teacher picked and tell them it worked, so this fails.
    const found = new Set(owned.map(c => c.id));
    const rejected = unique.filter(id => !found.has(id));
    if (rejected.length) {
      throw new ValidationError({
        class_ids: [`Ces classes n'appartiennent pas à votre école: ${rejected.join(', ')}`],
      });
    }
    for (const cls of owned) {
      await tx.kidsActivityClass.create({ data: { activity_id: activityId, class_id: cls.id } });
    }
  }

  async create(data, schoolId, creatorId) {
    const { levels = [] } = data;
    const activityData = KidsActivityService.#activityColumns(data);

    return prisma.$transaction(async (tx) => {
      const activity = await tx.kidsActivity.create({
        data: {
          ...activityData,
          school_id: schoolId,
          creator_id: creatorId,
          status: 'draft',
        },
      });

      if (levels.length > 0) {
        for (let i = 0; i < levels.length; i++) {
          await tx.kidsActivityLevel.create({ data: KidsActivityService.#levelRow(levels[i], i, activity.id) });
        }
        // Generated levels also enter the shared bank, so Kids Space and the
        // Questions tab stay in sync instead of diverging. The rows are re-read
        // because mirrorLevel() needs the level id to stamp question_id back.
        await this.bank.mirrorLevels({
          levels: await tx.kidsActivityLevel.findMany({ where: { activity_id: activity.id }, orderBy: { order_index: 'asc' } }),
          activity,
          schoolId,
          difficulty: activity.difficulty,
          db: tx,
        });
      }

      await this.#syncClasses(tx, activity.id, data.class_ids, schoolId);

      return tx.kidsActivity.findUnique({
        where: { id: activity.id },
        include: {
          levels: { orderBy: { order_index: 'asc' } },
          classes: { include: { class: { select: { id: true, name: true } } } },
        },
      });
    });
  }

  async update(id, data, schoolId) {
    const existing = await prisma.kidsActivity.findFirst({
      where: { id, school_id: schoolId },
    });
    if (!existing) throw new NotFoundError('Activité Kids');

    const { levels } = data;
    const activityData = KidsActivityService.#activityColumns(data);
    return prisma.$transaction(async (tx) => {
      await tx.kidsActivity.update({ where: { id }, data: activityData });

      if (Array.isArray(levels)) {
        // Reconcile instead of delete-all + recreate: wiping the table gave every
        // level a new id on each save, which broke the "saved" badge, the reorder
        // endpoints and the question_id link to the bank.
        const current = await tx.kidsActivityLevel.findMany({ where: { activity_id: id } });
        const currentById = new Map(current.map(l => [l.id, l]));
        const keptIds = new Set(levels.map(l => l.id).filter(Boolean));

        for (const stale of current) {
          if (!keptIds.has(stale.id)) {
            await tx.kidsActivityLevel.delete({ where: { id: stale.id } });
          }
        }

        for (let i = 0; i < levels.length; i++) {
          const lvl = levels[i];
          const row = KidsActivityService.#levelRow(lvl, i, id);
          if (lvl.id && currentById.has(lvl.id)) {
            await tx.kidsActivityLevel.update({ where: { id: lvl.id }, data: row });
          } else {
            await tx.kidsActivityLevel.create({ data: row });
          }
        }

        const refreshed = await tx.kidsActivity.findUnique({ where: { id } });
        await this.bank.mirrorLevels({
          levels: await tx.kidsActivityLevel.findMany({ where: { activity_id: id }, orderBy: { order_index: 'asc' } }),
          activity: refreshed,
          schoolId,
          difficulty: refreshed?.difficulty,
          db: tx,
        });
      }

      await this.#syncClasses(tx, id, data.class_ids, schoolId);

      return tx.kidsActivity.findUnique({
        where: { id },
        include: {
          levels: { orderBy: { order_index: 'asc' } },
          classes: { include: { class: { select: { id: true, name: true } } } },
        },
      });
    });
  }

  async delete(id, schoolId) {
    const existing = await prisma.kidsActivity.findFirst({
      where: { id, school_id: schoolId },
    });
    if (!existing) throw new NotFoundError('Activité Kids');

    await prisma.kidsActivity.delete({ where: { id } });
    return { success: true };
  }

  async getById(id, schoolId) {
    const query = { id };
    if (schoolId) query.school_id = schoolId;

    const activity = await prisma.kidsActivity.findFirst({
      where: query,
      include: {
        creator: { select: { id: true, name: true, username: true } },
        levels: { orderBy: { order_index: 'asc' } },
        classes: { include: { class: { select: { id: true, name: true } } } },
      },
    });
    if (!activity) throw new NotFoundError('Activité Kids');
    return activity;
  }

  /**
   * Published activities the given student is meant to play: the ones assigned
   * to their class in the wizard's Audience step, plus any published activity in
   * the school that is open to everyone (no class assigned). Scoped to the
   * student's own school, and a student can never reach a draft this way.
   */
  async listForStudent(userId, schoolId) {
    if (!userId || !schoolId) return [];
    const user = await prisma.user.findFirst({
      where: { id: userId, school_id: schoolId },
      select: { class_id: true },
    });
    if (!user) throw new NotFoundError('Utilisateur');

    return prisma.kidsActivity.findMany({
      where: {
        school_id: schoolId,
        status: 'published',
        OR: [{ classes: { some: { class_id: user.class_id ?? '__none__' } } }, { classes: { none: {} } }],
      },
      select: {
        id: true,
        title: true,
        description: true,
        subject: true,
        sub_topic: true,
        grade: true,
        theme: true,
        join_code: true,
        estimated_duration: true,
        _count: { select: { levels: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getByJoinCode(joinCode) {
    const code = (joinCode || '').trim().toUpperCase();
    const activity = await prisma.kidsActivity.findUnique({
      where: { join_code: code },
      include: {
        levels: { orderBy: { order_index: 'asc' } },
      },
    });
    if (!activity || activity.status !== 'published') {
      throw new NotFoundError('Code d’activité invalide ou non disponible');
    }
    return activity;
  }

  async list(filters, schoolId) {
    const {
      subject,
      sub_topic,
      grade,
      age_min,
      age_max,
      language,
      game_template,
      theme,
      difficulty,
      status,
      search,
      is_favorite,
      class_id,
      creator_id,
      limit = 50,
      offset = 0,
      orderBy = 'created_at',
      direction = 'desc',
    } = filters;

    const where = { school_id: schoolId };
    if (subject) where.subject = subject;
    // sub_topic is typed free text in the wizard, so an exact match would hide
    // "Les animaux" from a search for "animaux".
    if (sub_topic) where.sub_topic = { contains: sub_topic };
    if (grade) where.grade = grade;
    if (language) where.language = language;
    if (game_template) where.game_template = game_template;
    if (theme) where.theme = theme;
    if (difficulty) where.difficulty = difficulty;
    if (status) where.status = status;
    if (creator_id) where.creator_id = creator_id;
    if (is_favorite !== undefined) where.is_favorite = is_favorite;
    // Age is matched as an overlap rather than containment: a game for 5-8 year
    // olds belongs in the results of someone looking at 7-10.
    if (age_min !== undefined || age_max !== undefined) {
      where.AND = [
        age_max !== undefined ? { age_min: { lte: age_max } } : null,
        age_min !== undefined ? { age_max: { gte: age_min } } : null,
      ].filter(Boolean);
    }
    // "unassigned" is how the wizard's class filter asks for the games that were
    // left open to the whole school.
    if (class_id === 'unassigned') where.classes = { none: {} };
    else if (class_id) where.classes = { some: { class_id } };

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { sub_topic: { contains: search } },
        { objective: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.kidsActivity.findMany({
        where,
        include: {
          creator: { select: { id: true, name: true } },
          // Admins reach Kids Space through the shared Games tab, so the card
          // shows which school an activity came from.
          school: { select: { id: true, name: true, school_type: true } },
          classes: { include: { class: { select: { id: true, name: true } } } },
          _count: { select: { levels: true, sessions: true } },
        },
        orderBy: { [orderBy]: direction },
        skip: offset,
        take: limit,
      }),
      prisma.kidsActivity.count({ where }),
    ]);

    return { items, total, limit, offset };
  }

  /**
   * The values that actually exist in this school's games, so the filter bar
   * offers real choices instead of a hardcoded list that drifts out of date as
   * soon as a teacher types a new sub-topic. Archived games are included: an
   * admin looking for an old game is exactly who needs to find them.
   */
  async listFacets(schoolId) {
    const where = { school_id: schoolId };
    const group = (field) =>
      prisma.kidsActivity.groupBy({ by: [field], where, _count: { _all: true } })
        .then(rows => rows.map(r => ({ value: r[field], count: r._count._all })));

    const [subjects, subTopics, grades, languages, themes, difficulties, templates, statuses, ageRange, creators] = await Promise.all([
      group('subject'),
      group('sub_topic'),
      group('grade'),
      group('language'),
      group('theme'),
      group('difficulty'),
      group('game_template'),
      group('status'),
      prisma.kidsActivity.aggregate({ where, _min: { age_min: true }, _max: { age_max: true } }),
      // Games whose author row is gone carry a null creator_id. That is not a
      // teacher, so it is dropped from the dropdown: offered as a blank option it
      // would read as "no filter" while looking like a real choice.
      prisma.kidsActivity.groupBy({ by: ['creator_id'], where, _count: { _all: true } })
        .then(async rows => {
          const present = rows.filter(r => r.creator_id);
          const ids = present.map(r => r.creator_id);
          const people = ids.length
            ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
            : [];
          const names = new Map(people.map(p => [p.id, p.name]));
          return present.map(r => ({
            value: r.creator_id,
            // A deleted user still leaves games behind, so the games stay
            // filterable under a placeholder name rather than disappearing.
            name: names.get(r.creator_id) || 'Unknown teacher',
            count: r._count._all,
          }));
        }),
    ]);

    const sortByCount = (rows) => rows.sort((a, b) => b.count - a.count
      || String(a.value).localeCompare(String(b.value)));
    const nullsLast = (rows) => rows.filter(r => r.value !== null).sort((a, b) => a.value.localeCompare(b.value));

    return {
      subjects: sortByCount(subjects),
      sub_topics: nullsLast(subTopics),
      grades: nullsLast(grades),
      languages: nullsLast(languages),
      themes: sortByCount(themes),
      difficulties: nullsLast(difficulties),
      game_templates: sortByCount(templates),
      statuses: nullsLast(statuses),
      creators: sortByCount(creators),
      age: { min: ageRange._min.age_min ?? 3, max: ageRange._max.age_max ?? 15 },
    };
  }

  async publish(id, schoolId) {
    const activity = await this.getById(id, schoolId);

    // Validate levels
    ActivityValidator.validateForPublish({ activity, levels: activity.levels });

    // Generate unique join code if not already present
    let joinCode = activity.join_code;
    if (!joinCode) {
      let unique = false;
      while (!unique) {
        const candidate = KidsActivityService.generateJoinCode();
        const exists = await prisma.kidsActivity.findUnique({ where: { join_code: candidate } });
        if (!exists) {
          joinCode = candidate;
          unique = true;
        }
      }
    }

    return prisma.kidsActivity.update({
      where: { id },
      data: {
        status: 'published',
        join_code: joinCode,
      },
      include: {
        levels: { orderBy: { order_index: 'asc' } },
      },
    });
  }

  async archive(id, schoolId) {
    await this.getById(id, schoolId);
    return prisma.kidsActivity.update({
      where: { id },
      data: { status: 'archived' },
    });
  }

  async toggleFavorite(id, schoolId) {
    const activity = await this.getById(id, schoolId);
    return prisma.kidsActivity.update({
      where: { id },
      data: { is_favorite: !activity.is_favorite },
    });
  }

  async changeGameTemplate(id, newTemplate, schoolId) {
    await this.getById(id, schoolId);
    return prisma.kidsActivity.update({
      where: { id },
      data: { game_template: newTemplate },
      include: {
        levels: { orderBy: { order_index: 'asc' } },
      },
    });
  }

  async duplicate(id, schoolId, creatorId) {
    const original = await this.getById(id, schoolId);

    return prisma.$transaction(async (tx) => {
      const copy = await tx.kidsActivity.create({
        data: {
          school_id: schoolId,
          creator_id: creatorId,
          title: `${original.title} (Copie)`,
          description: original.description,
          subject: original.subject,
          sub_topic: original.sub_topic,
          grade: original.grade,
          age_min: original.age_min,
          age_max: original.age_max,
          objective: original.objective,
          game_template: original.game_template,
          theme: original.theme,
          difficulty: original.difficulty,
          status: 'draft',
          language: original.language,
          settings_json: original.settings_json,
          rewards_json: original.rewards_json,
          progression_json: original.progression_json,
          estimated_duration: original.estimated_duration,
        },
      });

      for (const lvl of original.levels) {
        await tx.kidsActivityLevel.create({
          data: {
            activity_id: copy.id,
            order_index: lvl.order_index,
            level_type: lvl.level_type,
            content_json: lvl.content_json,
            points: lvl.points,
            hint: lvl.hint,
            explanation: lvl.explanation,
            media_url: lvl.media_url,
            narrative_json: lvl.narrative_json,
            // Keep pointing at the SAME bank question: a duplicate is a new
            // activity reusing existing questions, not a second copy of them.
            question_id: lvl.question_id,
          },
        });
      }

      return tx.kidsActivity.findUnique({
        where: { id: copy.id },
        include: { levels: { orderBy: { order_index: 'asc' } } },
      });
    });
  }

  // ── Level Operations ────────────────────────────────────────────────────────

  async addLevel(activityId, levelData, schoolId) {
    const activity = await this.getById(activityId, schoolId);
    const count = await prisma.kidsActivityLevel.count({ where: { activity_id: activityId } });

    const level = await prisma.kidsActivityLevel.create({
      data: {
        activity_id:    activityId,
        order_index:    levelData.order_index ?? count,
        level_type:     levelData.level_type,
        content_json:   typeof levelData.content_json === 'string' ? levelData.content_json : JSON.stringify(levelData.content_json),
        points:         levelData.points ?? 10,
        hint:           levelData.hint ?? null,
        explanation:    levelData.explanation ?? null,
        media_url:      levelData.media_url ?? null,
        narrative_json: levelData.narrative_json ? (typeof levelData.narrative_json === 'string' ? levelData.narrative_json : JSON.stringify(levelData.narrative_json)) : null,
      },
    });

    // A level added by hand is still a question worth keeping: put it in the
    // bank so the teacher can reuse it in the next activity.
    const [linked] = await this.bank.mirrorLevels({ levels: [level], activity, schoolId, difficulty: activity.difficulty });
    return linked ? prisma.kidsActivityLevel.findUnique({ where: { id: level.id } }) : level;
  }

  async updateLevel(levelId, levelData, schoolId) {
    const level = await prisma.kidsActivityLevel.findUnique({
      where: { id: levelId },
      include: { activity: true },
    });
    if (!level || level.activity.school_id !== schoolId) {
      throw new NotFoundError('Niveau d’activité');
    }

    const data = { ...levelData };
    if (data.content_json && typeof data.content_json !== 'string') {
      data.content_json = JSON.stringify(data.content_json);
    }
    if (data.narrative_json && typeof data.narrative_json !== 'string') {
      data.narrative_json = JSON.stringify(data.narrative_json);
    }
    // question_id is server-owned: it may only be cleared, never re-pointed from
    // the client, so a level cannot be silently retied to someone else's question.
    delete data.question_id;

    const updated = await prisma.kidsActivityLevel.update({
      where: { id: levelId },
      data,
    });

    if (data.content_json) {
      await this.bank.mirrorLevels({ levels: [updated], activity: level.activity, schoolId, difficulty: level.activity.difficulty });
      return prisma.kidsActivityLevel.findUnique({ where: { id: levelId } });
    }
    return updated;
  }

  async removeLevel(levelId, schoolId) {
    const level = await prisma.kidsActivityLevel.findUnique({
      where: { id: levelId },
      include: { activity: true },
    });
    if (!level || level.activity.school_id !== schoolId) {
      throw new NotFoundError('Niveau d’activité');
    }

    await prisma.kidsActivityLevel.delete({ where: { id: levelId } });
    return { success: true };
  }

  async reorderLevels(activityId, orderedIds, schoolId) {
    await this.getById(activityId, schoolId);

    return prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.kidsActivityLevel.update({
          where: { id },
          data: { order_index: index },
        })
      )
    );
  }

  // ── Dashboard Metrics ───────────────────────────────────────────────────────

  async getDashboard(schoolId, creatorId) {
    const where = { school_id: schoolId };
    if (creatorId) where.creator_id = creatorId;

    const [totalActivities, publishedCount, draftCount, favoriteCount, recentActivities, totalPlays] = await Promise.all([
      prisma.kidsActivity.count({ where }),
      prisma.kidsActivity.count({ where: { ...where, status: 'published' } }),
      prisma.kidsActivity.count({ where: { ...where, status: 'draft' } }),
      prisma.kidsActivity.count({ where: { ...where, is_favorite: true } }),
      prisma.kidsActivity.findMany({
        where,
        take: 6,
        orderBy: { updated_at: 'desc' },
        include: {
          _count: { select: { levels: true, sessions: true } },
        },
      }),
      prisma.kidsActivity.aggregate({
        where,
        _sum: { play_count: true },
      }),
    ]);

    return {
      stats: {
        totalActivities,
        publishedCount,
        draftCount,
        favoriteCount,
        totalPlays: totalPlays._sum.play_count || 0,
      },
      recentActivities,
    };
  }
}
