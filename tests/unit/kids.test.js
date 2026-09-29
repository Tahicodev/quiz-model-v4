import { describe, it, expect, vi, afterEach } from 'vitest';
import { GameTemplateRegistry } from '../../src/backend/services/kids/GameTemplateRegistry.js';
import { GameSelector } from '../../src/backend/services/kids/GameSelector.js';
import { KidsGameSessionService } from '../../src/backend/services/kids/KidsGameSessionService.js';
import { validateLevelContent } from '../../src/shared/schemas/kids-activity.schema.js';
import { SOCKET_EVENTS } from '../../src/shared/constants.js';
import { KidsActivityService } from '../../src/backend/services/kids/KidsActivityService.js';
import { prisma } from '../../src/backend/prisma.js';

/**
 * Spies on the two Prisma lookups the ownership / tenant guards depend on, so a
 * fake session can be simulated. The real dev database is never touched here, and
 * every spy is restored after each test.
 */
function withFakeSession(session, activity = null) {
  const findSession = vi.spyOn(prisma.kidsGameSession, 'findUnique').mockResolvedValue(session);
  const findActivity = activity
    ? vi.spyOn(prisma.kidsActivity, 'findFirst').mockResolvedValue(activity)
    : null;
  return () => { findSession.mockRestore(); findActivity?.mockRestore(); };
}

describe('Kids Space - Foundation & Core Logic', () => {
  it('loads all 20 game templates in GameTemplateRegistry', () => {
    const templates = GameTemplateRegistry.getAll();
    expect(templates.length).toBe(20);
    const mc = GameTemplateRegistry.getById('multiple_choice');
    expect(mc).toBeDefined();
    expect(mc.category).toBe('core');
    expect(mc.name).toBe('Choix Multiple');
  });

  it('GameSelector scores and recommends the best game template', () => {
    const selector = new GameSelector();
    const result = selector.selectBest({
      subject: 'french',
      grade: 'CP',
      age_min: 5,
      age_max: 7,
      objective: 'remettre les lettres dans le bon ordre pour former un mot',
      count: 5,
    });
    expect(result).toBeDefined();
    expect(result.templateId).toBe('word_order');
  });

  it('validates level content schema for MULTIPLE_CHOICE', () => {
    const validMC = {
      instruction: 'Choisis la bonne réponse',
      question: 'Combien font 3 + 2 ?',
      options: [
        { id: 'opt1', value: '4' },
        { id: 'opt2', value: '5' },
        { id: 'opt3', value: '6' },
      ],
      correctId: 'opt2',
    };
    const validated = validateLevelContent('multiple_choice', validMC);
    expect(validated.correctId).toBe('opt2');

    // Invalid (missing options)
    expect(() => validateLevelContent('multiple_choice', { instruction: 'X', question: 'Y', options: [] })).toThrow();
  });

  it('sanitizes student content so correctId and answers are never leaked', () => {
    const mcContent = {
      instruction: 'Trouve le chat',
      question: 'Quel animal miaule ?',
      options: [
        { id: '1', value: 'Chien' },
        { id: '2', value: 'Chat' },
      ],
      correctId: '2',
    };
    const sanitized = KidsGameSessionService.sanitizeLevelContentForStudent('multiple_choice', mcContent);
    expect(sanitized.correctId).toBeUndefined();
    expect(sanitized.options.length).toBe(2);

    const wordOrderContent = {
      instruction: 'Remets en ordre',
      answer: 'CHAT',
      items: [{ id: '1', value: 'C' }, { id: '2', value: 'H' }, { id: '3', value: 'A' }, { id: '4', value: 'T' }],
    };
    const sanitizedWO = KidsGameSessionService.sanitizeLevelContentForStudent('word_order', wordOrderContent);
    expect(sanitizedWO.answer).toBeUndefined();
    expect(sanitizedWO.items.length).toBe(4);
  });

  it('keeps an adventure shell while sanitizing its embedded core mechanic', () => {
    const content = {
      mechanic: 'multiple_choice', worldText: 'Trouve le coffre !', instruction: 'Choisis', question: '2 + 2 ?',
      options: [{ id: 'a', value: '3' }, { id: 'b', value: '4' }], correctId: 'b',
    };
    const safe = KidsGameSessionService.sanitizeLevelContentForStudent('treasure_hunt', content);
    expect(safe.mechanic).toBe('multiple_choice');
    expect(safe.worldText).toBe('Trouve le coffre !');
    expect(safe.correctId).toBeUndefined();
    expect(KidsGameSessionService.validateAnswer('treasure_hunt', content, 'b').isCorrect).toBe(true);
  });

  it('validates student answers server-side for multiple mechanics', () => {
    // 1. Multiple Choice
    const mcResult1 = KidsGameSessionService.validateAnswer('multiple_choice', { correctId: 'opt2' }, 'opt2');
    expect(mcResult1.isCorrect).toBe(true);
    const mcResult2 = KidsGameSessionService.validateAnswer('multiple_choice', { correctId: 'opt2' }, 'opt1');
    expect(mcResult2.isCorrect).toBe(false);

    // 2. Word Order
    const woContent = { answer: 'LE CHAT' };
    const woResult1 = KidsGameSessionService.validateAnswer('word_order', woContent, ['LE', 'CHAT']);
    expect(woResult1.isCorrect).toBe(true);
    const woResult2 = KidsGameSessionService.validateAnswer('word_order', woContent, 'LE CHAT');
    expect(woResult2.isCorrect).toBe(true);
    const woResult3 = KidsGameSessionService.validateAnswer('word_order', woContent, ['CHAT', 'LE']);
    expect(woResult3.isCorrect).toBe(false);

    // 3. Sequence
    const seqContent = { correctOrder: ['step1', 'step2', 'step3'] };
    const seqResult1 = KidsGameSessionService.validateAnswer('sequence', seqContent, ['step1', 'step2', 'step3']);
    expect(seqResult1.isCorrect).toBe(true);
    const seqResult2 = KidsGameSessionService.validateAnswer('sequence', seqContent, ['step2', 'step1', 'step3']);
    expect(seqResult2.isCorrect).toBe(false);

    // 4. Sorting
    const sortContent = {
      items: [
        { id: 'apple', categoryId: 'fruits' },
        { id: 'carrot', categoryId: 'vegetables' },
      ],
    };
    const sortResult1 = KidsGameSessionService.validateAnswer('sorting', sortContent, [
      { itemId: 'apple', categoryId: 'fruits' },
      { itemId: 'carrot', categoryId: 'vegetables' },
    ]);
    expect(sortResult1.isCorrect).toBe(true);
    const sortResult2 = KidsGameSessionService.validateAnswer('sorting', sortContent, [
      { itemId: 'apple', categoryId: 'vegetables' },
      { itemId: 'carrot', categoryId: 'fruits' },
    ]);
    expect(sortResult2.isCorrect).toBe(false);

    // 5. Bubble Pop
    const bubbleContent = {
      bubbles: [
        { id: 'b1', value: '2', isCorrect: true },
        { id: 'b2', value: '3', isCorrect: false },
        { id: 'b3', value: '4', isCorrect: true },
      ],
    };
    expect(KidsGameSessionService.validateAnswer('bubble_pop', bubbleContent, 'b1').isCorrect).toBe(true);
    expect(KidsGameSessionService.validateAnswer('bubble_pop', bubbleContent, 'b2').isCorrect).toBe(false);
  });

  it('generates 6-character uppercase alphanumeric join codes', () => {
    const code = KidsActivityService.generateJoinCode();
    expect(code).toBeDefined();
    expect(code.length).toBe(6);
    expect(/^[A-Z0-9]{6}$/.test(code)).toBe(true);
  });

  it('KidsAIService generates activity with valid levels structure', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const activity = await aiSvc.generateActivity({
      subject: 'french',
      sub_topic: 'Les animaux de la forêt',
      grade: 'CP',
      count: 2,
    }, 'dummy-school', 'dummy-user');

    expect(activity).toBeDefined();
    expect(activity.title).toContain('animaux');
    expect(activity.levels.length).toBeGreaterThanOrEqual(1);
    expect(activity.levels[0].level_type).toBeDefined();
    expect(typeof activity.levels[0].content_json).toBe('string');
  });

  it('wraps AI adventure content around a validated core mechanic', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const activity = await aiSvc.generateActivity({ subject: 'science', sub_topic: 'animaux', grade: 'CP', game_template: 'treasure_hunt', count: 1 }, 'school', 'user');
    const content = JSON.parse(activity.levels[0].content_json);
    expect(activity.levels[0].level_type).toBe('treasure_hunt');
    expect(content.mechanic).toBe('multiple_choice');
  });

  it('offline generator produces publishable content for EVERY game template', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const { ActivityValidator } = await import('../../src/backend/services/kids/ActivityValidator.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });

    // Regression guard: the offline generator used to fall back to
    // multiple_choice content for any template without its own mock set, so 5 of
    // the 20 templates generated unplayable levels that failed publish
    // validation (HTTP 422) with no feedback in the teacher wizard.
    for (const template of GameTemplateRegistry.getAll()) {
      const activity = await aiSvc.generateActivity(
        { subject: 'science', sub_topic: 'les animaux', grade: 'CP', game_template: template.id, count: 2 },
        'school', 'user',
      );
      expect(activity.levels.length, `${template.id} level count`).toBeGreaterThanOrEqual(template.min_items);
      expect(() => ActivityValidator.validateForPublish({ activity, levels: activity.levels }),
        `${template.id} must pass publish validation`).not.toThrow();
    }
  });

  it('keeps the pre-Kids exam and tournament socket events in SOCKET_EVENTS', () => {
    // Regression guard: adding the KIDS_* events accidentally removed these
    // two, which silently broke exam keep-alive and tournament leave.
    expect(SOCKET_EVENTS.SESSION_HEARTBEAT).toBe('session:heartbeat');
    expect(SOCKET_EVENTS.TOURNAMENT_LEAVE).toBe('tournament:leave');
  });

  // ── Game Studio: honest AI reporting, model choice, question bank ──────────

  it('reports the generation source and a warning when the model is unusable', async () => {
    // Regression guard: a provider 429 was swallowed and the offline pool was
    // returned as if the model had written it, which is how an "addition"
    // activity ended up asking about spider legs.
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });

    const findConfig = vi.spyOn(prisma.aIConfig, 'findFirst').mockResolvedValue({
      id: 'cfg-1', name: 'Gemini Test', provider: 'google', model_id: 'gemini-test',
      base_url: null, api_key_enc: 'x',
    });
    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 429,
      text: async () => JSON.stringify({ error: { code: 429, message: 'quota exceeded' } }),
    });
    try {
      const activity = await aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 2, language: 'en' },
        'school-1', 'user-1',
      );
      expect(activity.source).toBe('fallback');
      expect(activity.warnings.length).toBeGreaterThan(0);
      expect(activity.warnings.join(' ')).toMatch(/quota|rate limit/i);
      expect(activity.model.name).toBe('Gemini Test');
      expect(activity.levels.length).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('reports source "ai" when the provider answers', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const payload = JSON.stringify([{ content: { instruction: 'Pick one!', question: '2 + 2 = ?', options: [{ id: 'a', value: '4' }, { id: 'b', value: '5' }], correctId: 'a' }, hint: 'h', explanation: 'e' }]);

    const findConfig = vi.spyOn(prisma.aIConfig, 'findFirst').mockResolvedValue({
      id: 'cfg-1', name: 'Gemini Test', provider: 'google', model_id: 'gemini-test',
      base_url: null, api_key_enc: 'x',
    });
    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: payload }] } }] }),
    });
    try {
      const activity = await aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 1, language: 'en' },
        'school-1', 'user-1',
      );
      expect(activity.source).toBe('ai');
      expect(activity.warnings).toHaveLength(0);
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('sends the whole wizard to the model as JSON, including the output language', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const findConfig = vi.spyOn(prisma.aIConfig, 'findFirst').mockResolvedValue({
      id: 'cfg-1', name: 'Gemini Test', provider: 'google', model_id: 'gemini-test',
      base_url: null, api_key_enc: 'x',
    });
    let sentPrompt = '';
    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init) => {
      sentPrompt = JSON.parse(init.body).contents[0].parts[0].text;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }) };
    });
    try {
      await aiSvc.generateActivity({
        subject: 'science', sub_topic: 'the water cycle', grade: 'CE1',
        age_min: 7, age_max: 9, objective: 'Name the three states of water',
        difficulty: 'medium', count: 3, language: 'en', theme: 'ocean',
        title: 'Water adventure', game_template: 'multiple_choice',
      }, 'school-1', 'user-1');
      const context = JSON.parse(sentPrompt.split('=== TEACHER WIZARD CONTEXT (JSON) ===')[1].split('=== VALID LEVEL SHAPES')[0]);
      expect(context.output_language).toBe('English');
      expect(context.curriculum.sub_topic).toBe('the water cycle');
      expect(context.curriculum.objective).toBe('Name the three states of water');
      expect(context.curriculum.activity_title).toBe('Water adventure');
      expect(context.learner.grade).toBe('CE1');
      expect(context.game.theme).toBe('ocean');
      expect(context.output.level_count).toBe(3);
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('never exposes a key when listing Game Studio models', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const findMany = vi.spyOn(prisma.aIConfig, 'findMany').mockResolvedValue([
      { id: 'c1', name: 'Gemini', provider: 'google', model_id: 'gemini-3.1-flash-lite', is_default: true, owner_id: null, api_key_enc: 'SECRET' },
    ]);
    try {
      const models = await aiSvc.listAvailableModels('school-1', 'user-1');
      expect(models).toHaveLength(1);
      expect(models[0].model_id).toBe('gemini-3.1-flash-lite');
      expect(models[0]).not.toHaveProperty('api_key_enc');
      expect(JSON.stringify(models)).not.toContain('SECRET');
    } finally { findMany.mockRestore(); }
  });

  it('refuses a model belonging to another school and falls back to the default', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const findFirst = vi.spyOn(prisma.aIConfig, 'findFirst')
      .mockResolvedValueOnce(null)   // requested config: not in this school
      .mockResolvedValueOnce({ id: 'school-default', name: 'Default', provider: 'google', model_id: 'd', base_url: null, api_key_enc: 'x' });
    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }) });
    try {
      const activity = await aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 1, model_id: 'someone-elses-config' },
        'school-1', 'user-1',
      );
      expect(activity.model.id).toBe('school-default');
    } finally {
      globalThis.fetch = globalFetch;
      findFirst.mockRestore();
    }
  });

  it('rebuilds a playable level from a bank question without repeating the question as its instruction', async () => {
    const { KidsQuestionBankService } = await import('../../src/backend/services/kids/KidsQuestionBankService.js');
    const bank = new KidsQuestionBankService();
    const question = {
      id: 'q1', type: 'mcq', text: 'Combien font 5 + 5 ?',
      options_json: JSON.stringify(['9', '10', '11']), answer: '10',
      explanation: '5 + 5 = 10', points: 10,
    };
    const content = bank.questionToLevelContent(question, 'multiple_choice');
    expect(content.instruction).toBe('Choose the right answer!');
    expect(content.question).toBe('Combien font 5 + 5 ?');
    expect(content.instruction).not.toBe(content.question);
    expect(content.options.map(o => o.value)).toEqual(['9', '10', '11']);
    expect(content.correctId).toBe('opt2');
  });

  it('wraps a bank question into the core mechanic of a narrative shell', async () => {
    const { KidsQuestionBankService } = await import('../../src/backend/services/kids/KidsQuestionBankService.js');
    const bank = new KidsQuestionBankService();
    const question = {
      id: 'q1', type: 'mcq', text: 'Qui miaule ?',
      options_json: JSON.stringify(['Chien', 'Chat']), answer: 'Chat', points: 10,
    };
    // A treasure_hunt level keeps mechanic + worldText and embeds a core quiz.
    const content = { ...bank.questionToLevelContent(question, 'multiple_choice'), mechanic: 'multiple_choice' };
    expect(content.mechanic).toBe('multiple_choice');
    expect(() => validateLevelContent('multiple_choice', content)).not.toThrow();
  });

  it('refuses to attach a bank question from another school', async () => {
    const { KidsQuestionBankService } = await import('../../src/backend/services/kids/KidsQuestionBankService.js');
    const bank = new KidsQuestionBankService();
    const findActivity = vi.spyOn(prisma.kidsActivity, 'findFirst')
      .mockResolvedValue({ id: 'act-1', school_id: 'school-B', game_template: 'multiple_choice' });
    const findQuestion = vi.spyOn(prisma.question, 'findFirst').mockResolvedValue(null);
    try {
      await expect(bank.addQuestionToActivity({ activityId: 'act-1', questionId: 'q-foreign', schoolId: 'school-B' }))
        .rejects.toThrow(/not found|introuvable/i);
    } finally { findActivity.mockRestore(); findQuestion.mockRestore(); }
  });

  it('keeps level ids and question links stable when an activity is re-saved', async () => {
    // Regression guard: update() used to delete every level and recreate it, so
    // ids changed on each save and the question_id link to the bank was lost.
    const existing = [{ id: 'lvl-1', order_index: 0, level_type: 'multiple_choice', content_json: '{}', points: 10 }];
    const run = async (svc) => {
      const tx = {
        kidsActivity: { update: vi.fn(), findUnique: vi.fn(async () => ({ id: 'act-1', difficulty: 'easy' })) },
        kidsActivityLevel: {
          findMany: vi.fn(async () => existing),
          update: vi.fn(async ({ where }) => ({ ...existing[0], ...where })),
          create: vi.fn(async ({ data }) => ({ id: 'created-1', ...data })),
          delete: vi.fn(),
        },
        question: { create: vi.fn(async () => ({ id: 'q-1' })), update: vi.fn() },
        category: { findFirst: vi.fn(async () => ({ id: 'cat-1' })), create: vi.fn() },
      };
      const spy = vi.spyOn(prisma, '$transaction').mockImplementation(fn => fn(tx));
      const levelSpy = vi.spyOn(prisma.kidsActivityLevel, 'findMany').mockResolvedValue(existing);
      const existsSpy = vi.spyOn(prisma.kidsActivity, 'findFirst').mockResolvedValue({ id: 'act-1' });
      try {
        await svc.update('act-1', {
          title: 'T', subject: 'math', sub_topic: 'addition', grade: 'CP',
          game_template: 'multiple_choice',
          levels: [{ id: 'lvl-1', order_index: 0, level_type: 'multiple_choice', content_json: '{}', points: 10 }],
        }, 'school-1');
      } finally { spy.mockRestore(); levelSpy.mockRestore(); existsSpy.mockRestore(); }
      return tx;
    };
    const svc = new KidsActivityService(null);
    const tx = await run(svc);
    // The known level is updated in place, never deleted and recreated.
    expect(tx.kidsActivityLevel.delete).not.toHaveBeenCalled();
    expect(tx.kidsActivityLevel.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'lvl-1' } }));
  });

  it('reports a per-level success breakdown, with null instead of 0% when unplayed', async () => {
    const { KidsGameSessionService } = await import('../../src/backend/services/kids/KidsGameSessionService.js');
    const svc = new KidsGameSessionService();
    const findActivity = vi.spyOn(prisma.kidsActivity, 'findFirst').mockResolvedValue({ id: 'a1', school_id: 's1', title: 'T', game_template: 'multiple_choice', subject: 'math' });
    const findSessions = vi.spyOn(prisma.kidsGameSession, 'findMany').mockResolvedValue([]);
    const findLevels = vi.spyOn(prisma.kidsActivityLevel, 'findMany').mockResolvedValue([
      { id: 'l1', order_index: 0, level_type: 'multiple_choice', points: 10 },
      { id: 'l2', order_index: 1, level_type: 'word_order', points: 10 },
    ]);
    try {
      const a = await svc.getActivityAnalytics('a1', 's1');
      expect(a.levels).toHaveLength(2);
      expect(a.levels[0].success_rate).toBeNull();
      expect(a.hardest_level).toBeNull();
      expect(a.accuracy_rate).toBe(0);
    } finally { findActivity.mockRestore(); findSessions.mockRestore(); findLevels.mockRestore(); }
  });

  it('aggregates the hardest level from real answer data', async () => {
    const { KidsGameSessionService } = await import('../../src/backend/services/kids/KidsGameSessionService.js');
    const svc = new KidsGameSessionService();
    const findActivity = vi.spyOn(prisma.kidsActivity, 'findFirst').mockResolvedValue({ id: 'a1', school_id: 's1', title: 'T', game_template: 'multiple_choice', subject: 'math' });
    const findSessions = vi.spyOn(prisma.kidsGameSession, 'findMany').mockResolvedValue([
      { id: 's1', user: { id: 'u1', name: 'Ana' }, score: 30, stars: 2, best_streak: 3, completed: true, started_at: new Date(), completed_at: new Date(), time_spent: 120,
        answers_json: JSON.stringify([{ levelId: 'l1', correct: true, timeMs: 4000, attempts: 1 }, { levelId: 'l2', correct: false, timeMs: 9000, attempts: 3 }]) },
    ]);
    const findLevels = vi.spyOn(prisma.kidsActivityLevel, 'findMany').mockResolvedValue([
      { id: 'l1', order_index: 0, level_type: 'multiple_choice', points: 10 },
      { id: 'l2', order_index: 1, level_type: 'word_order', points: 10 },
    ]);
    try {
      const a = await svc.getActivityAnalytics('a1', 's1');
      expect(a.accuracy_rate).toBe(50);
      expect(a.levels[0].success_rate).toBe(100);
      expect(a.levels[1].success_rate).toBe(0);
      expect(a.levels[1].average_attempts).toBe(3);
      expect(a.hardest_level.id).toBe('l2');
      expect(a.total_answers).toBe(2);
    } finally { findActivity.mockRestore(); findSessions.mockRestore(); findLevels.mockRestore(); }
  });

  it('refuses to score an answer into another student session', async () => {
    // Regression guard: the session id arrives from the request body, so without
    // an ownership check any logged-in student could add points to a classmate.
    // A real existing session is simulated, otherwise the lookup would 404 first
    // and the ownership guard would never be exercised.
    const restore = withFakeSession({ id: 'sess-1', user_id: 'owner', activity: { levels: [] } });
    try {
      const svc = new KidsGameSessionService();
      await expect(svc.submitAnswer('sess-1', 'lvl-1', 'x', 0, 1, { id: 'attacker' }))
        .rejects.toThrow(/does not belong|appartient/i);
    } finally { restore(); }
  });

  it('refuses to return a hint for another student session', async () => {
    const restore = withFakeSession({ id: 'sess-1', user_id: 'owner', activity: { levels: [] } });
    try {
      const svc = new KidsGameSessionService();
      await expect(svc.requestHint('sess-1', 'lvl-1', { id: 'attacker' }))
        .rejects.toThrow(/does not belong|appartient/i);
    } finally { restore(); }
  });

  it('lets the owning student through to the answer logic', async () => {
    // Proves the previous two tests fail on ownership, not on a missing level.
    const restore = withFakeSession({ id: 'sess-1', user_id: 'owner', activity: { levels: [] } });
    try {
      const svc = new KidsGameSessionService();
      await expect(svc.requestHint('sess-1', 'lvl-1', { id: 'owner' }))
        .rejects.not.toThrow(/does not belong|appartient/i);
    } finally { restore(); }
  });

  it('strips the answer key even for an unrecognised level_type', () => {
    // `level_type` is a free-text column, so an unknown value must not fall through
    // to "return the stored content" and ship correctId to the browser.
    const content = { question: '2+2 ?', options: [{ id: 'a', text: '3' }], correctId: 'a' };
    for (const type of ['multiple_choice', 'mcq', 'a_mechanic_that_does_not_exist']) {
      const safe = KidsGameSessionService.sanitizeLevelContentForStudent(type, content);
      expect(safe, `${type} must not expose correctId`).not.toHaveProperty('correctId');
      expect(safe.question, `${type} must still deliver the question`).toBe('2+2 ?');
    }
  });

  it('still delivers the question and options after sanitising', () => {
    const safe = KidsGameSessionService.sanitizeLevelContentForStudent('multiple_choice', {
      question: 'Capitale de la France ?',
      options: [{ id: 'a', text: 'Paris' }, { id: 'b', text: 'Lyon' }],
      correctId: 'a',
    });
    expect(safe.options).toHaveLength(2);
    expect(safe.options[0].text).toBe('Paris');
  });

  it('grades a correct answer server-side', () => {
    const v = KidsGameSessionService.validateAnswer('multiple_choice',
      { options: [{ id: 'a', text: '3' }, { id: 'b', text: '4' }], correctId: 'b' }, 'b');
    expect(v.isCorrect).toBe(true);
    expect(KidsGameSessionService.validateAnswer('multiple_choice',
      { options: [{ id: 'a', text: '3' }], correctId: 'b' }, 'a').isCorrect).toBe(false);
  });

  it('rejects a gameplay start for an activity outside the caller school', async () => {
    // Tenant isolation: the activity id alone must never be sufficient.
    const restore = withFakeSession(null, null);
    try {
      const svc = new KidsGameSessionService();
      await expect(svc.startOrResume('other-schools-activity-id', 'student-1', 'school-A'))
        .rejects.toThrow(/not found|introuvable|Activité/i);
    } finally { restore(); }
  });

  it('stops a student from starting an unpublished activity', async () => {
    // A draft is teacher-only until published; preview is allowed, play is not.
    const restore = withFakeSession(null, { status: 'draft', levels: [] });
    try {
      const svc = new KidsGameSessionService();
      await expect(svc.startOrResume('draft-id', 'student-1', 'school-A', { isEducator: false }))
        .rejects.toThrow(/not yet published|pas encore publiée/i);
    } finally { restore(); }
  });

  it('labels each activity with its school so admins can tell them apart', async () => {
    // Admins reach Game Studio through the shared Games tab, so the activity
    // list has to name the school each activity belongs to. It must stay scoped
    // to one school: the include is for labelling, not for cross-tenant reads.
    const findMany = vi.spyOn(prisma.kidsActivity, 'findMany').mockResolvedValue([]);
    const count = vi.spyOn(prisma.kidsActivity, 'count').mockResolvedValue(0);
    try {
      const svc = new KidsActivityService();
      await svc.list({}, 'school-A');
      const [query] = findMany.mock.calls[0];
      expect(query.where).toEqual({ school_id: 'school-A' });
      expect(query.include.school.select).toEqual({
        id: true,
        name: true,
        school_type: true,
      });
    } finally { findMany.mockRestore(); count.mockRestore(); }
  });
});
