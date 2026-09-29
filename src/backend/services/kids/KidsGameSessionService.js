/**
 * src/backend/services/kids/KidsGameSessionService.js
 *
 * Tracks student gameplay progress and provides SERVER-SIDE answer validation.
 * The correct answer is NEVER sent to the student before submission.
 */

import { NotFoundError, ValidationError, ForbiddenError } from '../../../shared/errors.js';
import { prisma } from '../../prisma.js';

/**
 * A game session is private to the student who owns it. Answer submission and
 * hint lookup both take the session id from the request, so without this check
 * any authenticated user could score points into someone else's session.
 *
 * Fails closed: a missing acting user is denied rather than allowed.
 */
function assertSessionOwner(session, actingUser) {
  if (!actingUser || String(session.user_id) !== String(actingUser.id)) {
    throw new ForbiddenError('Cette session de jeu ne vous appartient pas.');
  }
}

export class KidsGameSessionService {
  /** Fields that reveal the correct answer and must never reach the browser. */
  static ANSWER_KEY_FIELDS = new Set([
    'correctId', 'correct_id', 'correctAnswer', 'correct', 'correctOrder',
    'answer', 'solution', 'targetAnswer', 'expected',
  ]);

  constructor(repo) {
    this.repo = repo;
  }

  /**
   * Strip correct answers from level content before delivering to the player.
   */
  static sanitizeLevelContentForStudent(levelType, contentJson) {
    const raw = typeof contentJson === 'string' ? JSON.parse(contentJson) : { ...contentJson };

    // Adventure and immersive levels are narrative shells around a core mechanic.
    // Keep the shell metadata but sanitize its embedded mechanic exactly as a core level.
    if (raw.mechanic || raw.baseMechanic) {
      const mechanic = raw.mechanic || raw.baseMechanic;
      const { mechanic: _mechanic, baseMechanic: _baseMechanic, ...coreContent } = raw;
      return { ...KidsGameSessionService.sanitizeLevelContentForStudent(mechanic, coreContent), mechanic };
    }

    switch (levelType) {
      case 'multiple_choice':
      case 'find_correct': {
        const { correctId, ...safe } = raw;
        return safe;
      }
      case 'word_order': {
        const { answer, ...safe } = raw;
        return safe;
      }
      case 'drag_drop': {
        const { blanks, ...safe } = raw;
        // Strip the target answer from each blank, leaving position only
        safe.blanks = (blanks || []).map(b => ({ position: b.position }));
        return safe;
      }
      case 'matching': {
        const { pairs = [], ...safe } = raw;
        // Provide separate left and right items shuffled so pairing cannot be deduced from index
        safe.leftItems = pairs.map(p => ({
          id: p.id,
          text: p.left,
          image: p.leftImage,
          emoji: p.leftEmoji,
        }));
        safe.rightItems = [...pairs]
          .sort(() => Math.random() - 0.5)
          .map(p => ({
            id: p.id,
            text: p.right,
            image: p.rightImage,
            emoji: p.rightEmoji,
          }));
        return safe;
      }
      case 'memory': {
        // Safe card set (already uses matchId or identical values)
        return KidsGameSessionService.stripAnswerKeys(raw);
      }
      case 'sorting': {
        const { items = [], categories = [], ...safe } = raw;
        safe.categories = categories;
        safe.items = items.map(item => {
          const { categoryId, ...safeItem } = item;
          return safeItem;
        });
        return safe;
      }
      case 'sequence': {
        const { correctOrder, ...safe } = raw;
        return safe;
      }
      case 'bubble_pop': {
        const { bubbles = [], target, ...safe } = raw;
        safe.target = target;
        safe.bubbles = bubbles.map(b => ({ id: b.id, value: b.value }));
        return safe;
      }
      default:
        // Fail closed. `level_type` is a free-text column, so an unrecognised value
        // (a typo, a future mechanic, an imported activity) would otherwise return
        // the stored content verbatim — including the answer key — to the browser.
        return KidsGameSessionService.stripAnswerKeys(raw);
    }
  }

  /**
   * Removes every field that can carry the answer, whatever the mechanic.
   * Used as a safety net so a new or misspelled level_type can never leak the key.
   */
  static stripAnswerKeys(content) {
    const safe = {};
    for (const [key, value] of Object.entries(content)) {
      if (!KidsGameSessionService.ANSWER_KEY_FIELDS.has(key)) safe[key] = value;
    }
    return safe;
  }

  /**
   * Validates student answer against stored content.
   */
  static validateAnswer(levelType, contentJson, studentAnswer) {
    const content = typeof contentJson === 'string' ? JSON.parse(contentJson) : contentJson;

    if (content.mechanic || content.baseMechanic) {
      const { mechanic, baseMechanic, ...coreContent } = content;
      return KidsGameSessionService.validateAnswer(mechanic || baseMechanic, coreContent, studentAnswer);
    }

    switch (levelType) {
      case 'multiple_choice':
      case 'find_correct': {
        // studentAnswer is the selected option ID
        const isCorrect = String(studentAnswer).trim() === String(content.correctId).trim();
        return { isCorrect, expected: content.correctId };
      }

      case 'word_order': {
        // studentAnswer can be an array of item IDs or the joined string
        let submittedText = '';
        if (Array.isArray(studentAnswer)) {
          submittedText = studentAnswer.join(' ').trim().toLowerCase();
        } else {
          submittedText = String(studentAnswer).trim().toLowerCase();
        }
        const expectedText = String(content.answer).trim().toLowerCase();
        const isCorrect = submittedText === expectedText;
        return { isCorrect, expected: content.answer };
      }

      case 'drag_drop': {
        // studentAnswer: array of { position, answer } or array of placed strings
        const blanks = content.blanks || [];
        if (!Array.isArray(studentAnswer) || studentAnswer.length !== blanks.length) {
          return { isCorrect: false };
        }
        let allMatch = true;
        blanks.forEach(b => {
          const submitted = studentAnswer.find(s => s.position === b.position);
          if (!submitted || String(submitted.answer).trim().toLowerCase() !== String(b.answer).trim().toLowerCase()) {
            allMatch = false;
          }
        });
        return { isCorrect: allMatch };
      }

      case 'matching': {
        // studentAnswer: array of { leftId, rightId }
        const pairs = content.pairs || [];
        if (!Array.isArray(studentAnswer) || studentAnswer.length !== pairs.length) {
          return { isCorrect: false };
        }
        let allMatch = true;
        studentAnswer.forEach(ans => {
          if (ans.leftId !== ans.rightId) {
            allMatch = false;
          }
        });
        return { isCorrect: allMatch };
      }

      case 'memory': {
        // studentAnswer: log of matched pairs [{ card1Id, card2Id }]
        const cards = content.cards || [];
        const cardMap = new Map(cards.map(c => [c.id, c.matchId || c.id]));
        let allMatch = true;
        if (!Array.isArray(studentAnswer) || studentAnswer.length < cards.length / 2) {
          return { isCorrect: false };
        }
        studentAnswer.forEach(({ card1Id, card2Id }) => {
          if (cardMap.get(card1Id) !== cardMap.get(card2Id)) {
            allMatch = false;
          }
        });
        return { isCorrect: allMatch };
      }

      case 'sorting': {
        // studentAnswer: array of { itemId, categoryId }
        const items = content.items || [];
        if (!Array.isArray(studentAnswer) || studentAnswer.length !== items.length) {
          return { isCorrect: false };
        }
        const itemMap = new Map(items.map(i => [i.id, i.categoryId]));
        let allMatch = true;
        studentAnswer.forEach(a => {
          if (itemMap.get(a.itemId) !== a.categoryId) {
            allMatch = false;
          }
        });
        return { isCorrect: allMatch };
      }

      case 'sequence': {
        // studentAnswer: ordered array of item IDs
        const correctOrder = content.correctOrder || [];
        if (!Array.isArray(studentAnswer) || studentAnswer.length !== correctOrder.length) {
          return { isCorrect: false };
        }
        let allMatch = true;
        for (let i = 0; i < correctOrder.length; i++) {
          if (studentAnswer[i] !== correctOrder[i]) {
            allMatch = false;
            break;
          }
        }
        return { isCorrect: allMatch };
      }

      case 'bubble_pop': {
        // studentAnswer: array of bubble IDs popped or single bubble ID
        const bubbles = content.bubbles || [];
        const correctIds = new Set(bubbles.filter(b => b.isCorrect).map(b => b.id));

        if (Array.isArray(studentAnswer)) {
          const submittedIds = new Set(studentAnswer);
          if (submittedIds.size !== correctIds.size) return { isCorrect: false };
          for (const id of submittedIds) {
            if (!correctIds.has(id)) return { isCorrect: false };
          }
          return { isCorrect: true };
        }

        // Single bubble tap
        return { isCorrect: correctIds.has(studentAnswer) };
      }

      default:
        return { isCorrect: true };
    }
  }

  /**
   * Start or resume a session for a student.
   */
  async startOrResume(activityId, userId, schoolId, { isEducator = false } = {}) {
    // Tenant isolation: the activity id alone must never be enough. Without the
    // school filter a student in one school could start (and read the content of)
    // an activity belonging to another school by guessing its UUID.
    const activity = await prisma.kidsActivity.findFirst({
      where: { id: activityId, school_id: schoolId },
      include: {
        levels: { orderBy: { order_index: 'asc' } },
      },
    });
    if (!activity) throw new NotFoundError('Activité Kids');

    // Students may only play published activities. Educators may open a draft in
    // order to preview it before publishing.
    if (activity.status !== 'published' && !isEducator) {
      throw new ForbiddenError('Cette activité n’est pas encore publiée.');
    }

    const totalPossible = activity.levels.reduce((acc, l) => acc + l.points, 0);

    let session = await prisma.kidsGameSession.findUnique({
      where: { activity_id_user_id: { activity_id: activityId, user_id: userId } },
    });

    if (!session) {
      session = await prisma.kidsGameSession.create({
        data: {
          activity_id: activityId,
          user_id: userId,
          school_id: schoolId,
          total_possible: totalPossible,
          current_level: 0,
        },
      });

      // Increment activity play count
      await prisma.kidsActivity.update({
        where: { id: activityId },
        data: { play_count: { increment: 1 } },
      });
    }

    const currentLevel = activity.levels[session.current_level] || null;
    const sanitizedCurrentLevel = currentLevel
      ? {
          id: currentLevel.id,
          order_index: currentLevel.order_index,
          level_type: currentLevel.level_type,
          points: currentLevel.points,
          hint: currentLevel.hint,
          media_url: currentLevel.media_url,
          narrative: currentLevel.narrative_json ? JSON.parse(currentLevel.narrative_json) : null,
          content: KidsGameSessionService.sanitizeLevelContentForStudent(currentLevel.level_type, currentLevel.content_json),
        }
      : null;

    return {
      session,
      activity: {
        id: activity.id,
        title: activity.title,
        description: activity.description,
        subject: activity.subject,
        grade: activity.grade,
        age_min: activity.age_min,
        age_max: activity.age_max,
        game_template: activity.game_template,
        theme: activity.theme,
        totalLevels: activity.levels.length,
      },
      currentLevel: sanitizedCurrentLevel,
    };
  }

  /**
   * Submit an answer for the current level.
   */
  async submitAnswer(sessionId, levelId, studentAnswer, timeMs = 0, attempts = 1, actingUser) {
    const session = await prisma.kidsGameSession.findUnique({
      where: { id: sessionId },
      include: {
        activity: {
          include: { levels: { orderBy: { order_index: 'asc' } } },
        },
      },
    });
    if (!session) throw new NotFoundError('Session de jeu');
    assertSessionOwner(session, actingUser);

    const level = session.activity.levels.find(l => l.id === levelId);
    if (!level) throw new NotFoundError('Niveau');

    const { isCorrect } = KidsGameSessionService.validateAnswer(
      level.level_type,
      level.content_json,
      studentAnswer
    );

    const answers = JSON.parse(session.answers_json || '[]');
    answers.push({
      levelId,
      answer: studentAnswer,
      correct: isCorrect,
      timeMs,
      attempts,
    });

    let newStreak = isCorrect ? session.streak + 1 : 0;
    let bestStreak = Math.max(session.best_streak, newStreak);
    let earnedPoints = isCorrect ? level.points : 0;

    // Small bonus for streak >= 3
    if (isCorrect && newStreak >= 3) {
      earnedPoints += Math.round(level.points * 0.2);
    }

    const newScore = session.score + earnedPoints;
    const isLastLevel = session.current_level >= session.activity.levels.length - 1;
    const nextLevelIndex = isLastLevel ? session.current_level : session.current_level + 1;
    const completed = isLastLevel;

    // Calculate stars (0 to 3) based on percentage of correct levels
    let stars = session.stars;
    if (completed) {
      const correctCount = answers.filter(a => a.correct).length;
      const totalLevels = session.activity.levels.length;
      const ratio = correctCount / totalLevels;
      if (ratio >= 0.9) stars = 3;
      else if (ratio >= 0.6) stars = 2;
      else if (ratio >= 0.3) stars = 1;
      else stars = 0;
    }

    const updatedSession = await prisma.kidsGameSession.update({
      where: { id: sessionId },
      data: {
        score: newScore,
        streak: newStreak,
        best_streak: bestStreak,
        current_level: nextLevelIndex,
        completed,
        stars,
        completed_at: completed ? new Date() : null,
        answers_json: JSON.stringify(answers),
        time_spent: { increment: Math.round(timeMs / 1000) },
      },
    });

    const nextLevel = (!completed && session.activity.levels[nextLevelIndex])
      ? {
          id: session.activity.levels[nextLevelIndex].id,
          order_index: session.activity.levels[nextLevelIndex].order_index,
          level_type: session.activity.levels[nextLevelIndex].level_type,
          points: session.activity.levels[nextLevelIndex].points,
          hint: session.activity.levels[nextLevelIndex].hint,
          media_url: session.activity.levels[nextLevelIndex].media_url,
          narrative: session.activity.levels[nextLevelIndex].narrative_json
            ? JSON.parse(session.activity.levels[nextLevelIndex].narrative_json)
            : null,
          content: KidsGameSessionService.sanitizeLevelContentForStudent(
            session.activity.levels[nextLevelIndex].level_type,
            session.activity.levels[nextLevelIndex].content_json
          ),
        }
      : null;

    return {
      correct: isCorrect,
      earnedPoints,
      newScore,
      streak: newStreak,
      stars,
      completed,
      explanation: level.explanation,
      nextLevel,
      session: updatedSession,
    };
  }

  /**
   * Request hint for current level.
   */
  async requestHint(sessionId, levelId, actingUser) {
    const session = await prisma.kidsGameSession.findUnique({
      where: { id: sessionId },
      include: {
        activity: {
          include: { levels: true },
        },
      },
    });
    if (!session) throw new NotFoundError('Session de jeu');
    assertSessionOwner(session, actingUser);

    const level = session.activity.levels.find(l => l.id === levelId);
    if (!level) throw new NotFoundError('Niveau');

    return {
      hint: level.hint || 'Regarde attentivement les indices proposés !',
    };
  }

  /**
   * Get progress for a student on an activity.
   */
  async getProgress(activityId, userId) {
    const session = await prisma.kidsGameSession.findUnique({
      where: { activity_id_user_id: { activity_id: activityId, user_id: userId } },
    });
    if (!session) throw new NotFoundError('Progression');
    return session;
  }

  /**
   * Teacher view: all student results for a given activity.
   */
  async getActivityResults(activityId, schoolId) {
    const activity = await prisma.kidsActivity.findFirst({
      where: { id: activityId, school_id: schoolId },
    });
    if (!activity) throw new NotFoundError('Activité Kids');

    const sessions = await prisma.kidsGameSession.findMany({
      where: { activity_id: activityId, school_id: schoolId },
      include: {
        user: { select: { id: true, name: true, username: true, numero: true } },
      },
      orderBy: { score: 'desc' },
    });

    return {
      activity: {
        id: activity.id,
        title: activity.title,
        game_template: activity.game_template,
        subject: activity.subject,
      },
      sessions: sessions.map(s => ({
        id: s.id,
        user: s.user,
        score: s.score,
        stars: s.stars,
        streak: s.best_streak,
        completed: s.completed,
        started_at: s.started_at,
        completed_at: s.completed_at,
        time_spent: s.time_spent,
        answers: JSON.parse(s.answers_json || '[]'),
      })),
    };
  }

  /**
   * Teacher live monitor: one compact row per student session.
   * Unlike getActivityResults this is polled on open and then kept fresh by the
   * `player:joined` / `kids:progress` / `player:left` socket events, so it must
   * stay cheap and must never include the students' raw answers.
   */
  async listLiveSessions(activityId, schoolId) {
    const activity = await prisma.kidsActivity.findFirst({
      where: { id: activityId, school_id: schoolId },
      select: { id: true, title: true, game_template: true, theme: true, status: true, _count: { select: { levels: true } } },
    });
    if (!activity) throw new NotFoundError('Activité Kids');

    const sessions = await prisma.kidsGameSession.findMany({
      where: { activity_id: activityId, school_id: schoolId },
      include: { user: { select: { id: true, name: true, username: true, numero: true } } },
      orderBy: [{ completed: 'asc' }, { score: 'desc' }, { started_at: 'asc' }],
    });

    return {
      activity: {
        id: activity.id,
        title: activity.title,
        game_template: activity.game_template,
        theme: activity.theme,
        status: activity.status,
        total_levels: activity._count.levels,
      },
      playing: sessions.filter(s => !s.completed).length,
      completed: sessions.filter(s => s.completed).length,
      sessions: sessions.map(s => ({
        userId: s.user_id,
        name: s.user.name || s.user.username,
        numero: s.user.numero,
        score: s.score,
        total_possible: s.total_possible,
        level: s.current_level,
        stars: s.stars,
        streak: s.best_streak,
        completed: s.completed,
        started_at: s.started_at,
        completed_at: s.completed_at,
      })),
    };
  }

  /** Aggregated classroom report, deliberately derived from persisted sessions only. */
  async getActivityAnalytics(activityId, schoolId) {
    const report = await this.getActivityResults(activityId, schoolId);
    const sessions = report.sessions;
    const attempted = sessions.length;
    const completed = sessions.filter(s => s.completed).length;
    const answers = sessions.flatMap(s => s.answers || []);
    const correct = answers.filter(a => a.correct).length;

    // Per-level breakdown: which steps the class actually struggled with. The
    // teacher report shows this as a bar chart instead of raw JSON, so the
    // backend has to aggregate per level rather than hand back raw answers.
    const levels = await prisma.kidsActivityLevel.findMany({
      where: { activity_id: activityId },
      orderBy: { order_index: 'asc' },
      select: { id: true, order_index: true, level_type: true, points: true },
    });
    const perLevel = levels.map(l => {
      const levelAnswers = answers.filter(a => a.levelId === l.id);
      const right = levelAnswers.filter(a => a.correct).length;
      return {
        id: l.id,
        order_index: l.order_index,
        level_type: l.level_type,
        points: l.points,
        attempts: levelAnswers.length,
        correct: right,
        success_rate: levelAnswers.length ? Math.round((right / levelAnswers.length) * 100) : null,
        average_time_ms: levelAnswers.length
          ? Math.round(levelAnswers.reduce((sum, a) => sum + (a.timeMs || 0), 0) / levelAnswers.length)
          : null,
        average_attempts: levelAnswers.length
          ? Math.round((levelAnswers.reduce((sum, a) => sum + (a.attempts || 1), 0) / levelAnswers.length) * 10) / 10
          : null,
      };
    });

    const stars = sessions.reduce((sum, s) => sum + (s.stars || 0), 0);
    const hardest = perLevel
      .filter(l => l.attempts > 0)
      .sort((a, b) => a.success_rate - b.success_rate)[0] || null;

    return {
      ...report.activity,
      attempted,
      completed,
      completion_rate: attempted ? Math.round((completed / attempted) * 100) : 0,
      accuracy_rate: answers.length ? Math.round((correct / answers.length) * 100) : 0,
      average_score: attempted ? Math.round(sessions.reduce((sum, s) => sum + s.score, 0) / attempted) : 0,
      average_time_seconds: attempted ? Math.round(sessions.reduce((sum, s) => sum + s.time_spent, 0) / attempted) : 0,
      best_streak: Math.max(0, ...sessions.map(s => s.streak || 0)),
      total_stars: stars,
      total_answers: answers.length,
      // null when nobody played yet, so the UI can show "no data" instead of 0%
      hardest_level: hardest,
      levels: perLevel,
    };
  }
}
