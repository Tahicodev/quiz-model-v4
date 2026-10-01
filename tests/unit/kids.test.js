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

/**
 * There is no built-in question pool any more, so every AI test has to stand in
 * for the provider. The shapes below are the ones KidsAIService documents in its
 * prompt, so a mocked level survives the same Zod check a real one would.
 */
const MECHANIC_SAMPLES = {
  multiple_choice: {
    instruction: 'Choisis la bonne réponse !',
    question: 'Quel est le résultat de 4 + 3 ?',
    options: [{ id: 'opt1', value: '6' }, { id: 'opt2', value: '7' }],
    correctId: 'opt2',
  },
  word_order: {
    instruction: 'Remets les lettres dans le bon ordre.',
    answer: 'CHAT',
    items: [{ id: '1', value: 'A' }, { id: '2', value: 'C' }, { id: '3', value: 'T' }, { id: '4', value: 'H' }],
  },
  drag_drop: {
    instruction: 'Glisse le bon mot dans le trou.',
    template: 'Le {blank} brille dans le ciel.',
    blanks: [{ position: 0, answer: 'soleil' }],
    choices: [{ id: 'c1', value: 'soleil' }, { id: 'c2', value: 'voiture' }],
  },
  matching: {
    instruction: 'Relie chaque mot à son contraire !',
    pairs: [
      { id: 'p1', left: 'Grand', right: 'Petit' },
      { id: 'p2', left: 'Chaud', right: 'Froid' },
    ],
  },
  memory: {
    instruction: 'Retouve les deux cartes qui vont ensemble !',
    cards: [
      { id: 'c1', matchId: 'm1', value: 'Chien', emoji: '🐶', type: 'emoji' },
      { id: 'c2', matchId: 'm2', value: 'Chiot', emoji: '🐕', type: 'emoji' },
      { id: 'c3', matchId: 'm1', value: 'Chien', emoji: '🐩', type: 'emoji' },
      { id: 'c4', matchId: 'm2', value: 'Chiot', emoji: '🐕', type: 'emoji' },
    ],
  },
  sorting: {
    instruction: 'Range chaque aliment dans la bonne boîte !',
    categories: [{ id: 'fruits', label: 'Fruits', emoji: '🍎' }, { id: 'legumes', label: 'Légumes', emoji: '🥕' }],
    items: [
      { id: 'i1', value: 'Pomme', categoryId: 'fruits' },
      { id: 'i2', value: 'Carotte', categoryId: 'legumes' },
      { id: 'i3', value: 'Banane', categoryId: 'fruits' },
    ],
  },
  sequence: {
    instruction: "Mets les nombres dans l'ordre croissant.",
    items: [{ id: 'n1', value: '2' }, { id: 'n2', value: '5' }, { id: 'n3', value: '8' }],
    correctOrder: ['n1', 'n2', 'n3'],
  },
  find_correct: {
    instruction: 'Trouve la seule bonne image !',
    question: 'Laquelle est un animal de la ferme ?',
    items: [
      { id: 'i1', value: 'La vache', emoji: '🐄' },
      { id: 'i2', value: 'La voiture', emoji: '🚗' },
      { id: 'i3', value: 'Le pain', emoji: '🍞' },
    ],
    correctId: 'i1',
  },
  bubble_pop: {
    instruction: 'Éclate toutes les bulles paires !',
    target: { value: 'Nombres pairs', type: 'text' },
    bubbles: [
      { id: 'b1', value: '2', isCorrect: true },
      { id: 'b2', value: '3', isCorrect: false },
      { id: 'b3', value: '4', isCorrect: true },
      { id: 'b4', value: '5', isCorrect: false },
    ],
  },
};

const CORE_MECHANICS = Object.keys(MECHANIC_SAMPLES);

/**
 * Returns a Google-shaped response holding `count` playable levels. When a
 * mechanic is given, every level uses that mechanic; otherwise one level is
 * produced per core mechanic (cycling) so any template gets a valid answer.
 */
function mockGeminiLevels(count = 1, mechanic = null) {
  const levels = Array.from({ length: count }, (_, i) => {
    const used = mechanic || CORE_MECHANICS[i % CORE_MECHANICS.length];
    return { mechanic: used, content: structuredClone(MECHANIC_SAMPLES[used]) };
  });
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(levels) }] } }] }),
  });
}

/**
 * Points KidsAIService at one usable model. The school default is resolved with
 * `findMany` so non-text models can be skipped, so that is what is mocked here.
 */
function mockSchoolModel(overrides = {}) {
  return vi.spyOn(prisma.aIConfig, 'findMany').mockResolvedValue([{
    id: 'cfg-1', name: 'Gemini Test', provider: 'google', model_id: 'gemini-test',
    base_url: null, api_key_enc: 'x', owner_id: null, is_default: true, ...overrides,
  }]);
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
    const findConfig = mockSchoolModel();
    const globalFetch = globalThis.fetch;
    globalThis.fetch = mockGeminiLevels(2, 'multiple_choice');
    try {
      const activity = await aiSvc.generateActivity({
        subject: 'french',
        sub_topic: 'Les animaux de la forêt',
        grade: 'CP',
        count: 2,
        game_template: 'multiple_choice',
      }, 'dummy-school', 'dummy-user');

      expect(activity).toBeDefined();
      expect(activity.title).toContain('animaux');
      expect(activity.levels.length).toBe(2);
      expect(activity.levels[0].level_type).toBeDefined();
      expect(typeof activity.levels[0].content_json).toBe('string');
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('wraps AI adventure content around a validated core mechanic', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const findConfig = mockSchoolModel();
    const globalFetch = globalThis.fetch;
    globalThis.fetch = mockGeminiLevels(1);
    try {
      const activity = await aiSvc.generateActivity({ subject: 'science', sub_topic: 'animaux', grade: 'CP', game_template: 'treasure_hunt', count: 1 }, 'school', 'user');
      const content = JSON.parse(activity.levels[0].content_json);
      expect(activity.levels[0].level_type).toBe('treasure_hunt');
      expect(content.mechanic).toBe('multiple_choice');
      // The core mechanic content must still be playable on its own.
      expect(() => validateLevelContent('multiple_choice', content)).not.toThrow();
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('produces publishable content for EVERY game template', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const { ActivityValidator } = await import('../../src/backend/services/kids/ActivityValidator.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const findConfig = mockSchoolModel();
    const globalFetch = globalThis.fetch;

    // Regression guard: the offline generator used to fall back to
    // multiple_choice content for any template without its own mock set, so 5 of
    // the 20 templates generated unplayable levels that failed publish
    // validation (HTTP 422) with no feedback in the teacher wizard. A model that
    // returns one usable level per slot must satisfy every template's own
    // minimum, so the wizard can never be handed a thin activity.
    try {
      for (const template of GameTemplateRegistry.getAll()) {
        const needed = Math.max(2, template.min_items);
        // A core template must come back in its own mechanic; an adventure
        // template wraps one of them.
        const mechanic = template.category === 'core' ? template.id : 'multiple_choice';
        globalThis.fetch = mockGeminiLevels(needed, mechanic);
        const activity = await aiSvc.generateActivity(
          { subject: 'science', sub_topic: 'les animaux', grade: 'CP', game_template: template.id, count: needed },
          'school', 'user',
        );
        expect(activity.levels.length, `${template.id} level count`).toBeGreaterThanOrEqual(template.min_items);
        expect(activity.rejected_levels, `${template.id} rejected levels`).toHaveLength(0);
        expect(() => ActivityValidator.validateForPublish({ activity, levels: activity.levels }),
          `${template.id} must pass publish validation`).not.toThrow();
      }
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('keeps the pre-Kids exam and tournament socket events in SOCKET_EVENTS', () => {
    // Regression guard: adding the KIDS_* events accidentally removed these
    // two, which silently broke exam keep-alive and tournament leave.
    expect(SOCKET_EVENTS.SESSION_HEARTBEAT).toBe('session:heartbeat');
    expect(SOCKET_EVENTS.TOURNAMENT_LEAVE).toBe('tournament:leave');
  });

  // ── Kids Space: honest AI reporting, model choice, question bank ──────────

  it('fails loudly instead of substituting built-in questions when the model is unusable', async () => {
    // Regression guard: a provider 429 was swallowed and the offline pool was
    // returned as if the model had written it, which is how an "addition"
    // activity ended up asking about spider legs. There is no built-in pool any
    // more, so a quota error has to reach the teacher.
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const { AppError } = await import('../../src/shared/errors.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });

    const findConfig = mockSchoolModel();
    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 429,
      text: async () => JSON.stringify({ error: { code: 429, message: 'quota exceeded' } }),
    });
    try {
      await expect(aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 2, language: 'en' },
        'school-1', 'user-1',
      )).rejects.toBeInstanceOf(AppError);
      // No request may be made against a key that is not configured either.
      const callsBefore = globalThis.fetch.mock.calls.length;
      expect(callsBefore).toBe(1);
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('reports the rejected levels instead of padding the list with generic ones', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });

    const findConfig = mockSchoolModel();
    const globalFetch = globalThis.fetch;
    // One playable level and one with no answers at all.
    const payload = JSON.stringify([
      { mechanic: 'multiple_choice', content: { instruction: 'Pick one!', question: '2 + 2 = ?', options: [{ id: 'a', value: '4' }, { id: 'b', value: '5' }], correctId: 'a' } },
      { mechanic: 'multiple_choice', content: { instruction: 'Pick one!', question: 'broken' } },
    ]);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: payload }] } }] }),
    });
    try {
      const activity = await aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 2, language: 'en', game_template: 'multiple_choice' },
        'school-1', 'user-1',
      );
      expect(activity.source).toBe('ai');
      expect(activity.levels).toHaveLength(1);
      expect(activity.rejected_levels).toHaveLength(1);
      expect(activity.rejected_levels[0].index).toBe(1);
      expect(activity.generated_count).toBe(1);
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('keeps the levels the teacher asked to keep and only writes the shortfall', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });

    const findConfig = mockSchoolModel();
    const globalFetch = globalThis.fetch;
    const fresh = JSON.stringify([
      { mechanic: 'multiple_choice', content: { instruction: 'Pick one!', question: '3 + 3 = ?', options: [{ id: 'a', value: '6' }, { id: 'b', value: '7' }], correctId: 'a' } },
    ]);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: fresh }] } }] }),
    });
    try {
      const keptLevel = {
        level_type: 'multiple_choice',
        content_json: JSON.stringify({ instruction: 'Pick one!', question: '1 + 1 = ?', options: [{ id: 'a', value: '2' }], correctId: 'a' }),
        points: 10,
      };
      const activity = await aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 2, language: 'en', game_template: 'multiple_choice', keep_levels: [keptLevel] },
        'school-1', 'user-1',
      );
      expect(activity.kept_count).toBe(1);
      expect(activity.generated_count).toBe(1);
      // Kept level first, freshly written one second, so the wizard can put the
      // replacement back in the slot the teacher chose.
      expect(activity.levels).toHaveLength(2);
      expect(activity.levels[0].content_json).toContain('1 + 1');
      expect(activity.levels[1].content_json).toContain('3 + 3');
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('asks the model only for the shortfall when the teacher regenerates 2 of 5 levels', async () => {
    // Regression guard: `count` is the size the activity must end up with. The
    // wizard used to send the number of slots being refilled (2) instead of the
    // total (5), so the server computed a shortfall of 2 - 3 = -1 and wrote a
    // single level, leaving the second dropped slot empty with no explanation.
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const findConfig = mockSchoolModel();
    const globalFetch = globalThis.fetch;
    globalThis.fetch = mockGeminiLevels(2, 'multiple_choice');
    try {
      const kept = ['a', 'b', 'c'].map((id, i) => ({
        level_type: 'multiple_choice',
        content_json: JSON.stringify({ instruction: 'Garde-moi', question: `kept ${i}`, options: [{ id: 'x', value: '1' }], correctId: 'x' }),
        points: 10,
      }));
      const activity = await aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 5, game_template: 'multiple_choice', keep_levels: kept },
        'school-1', 'user-1',
      );
      expect(activity.kept_count).toBe(3);
      expect(activity.generated_count).toBe(2);
      expect(activity.levels).toHaveLength(5);
      // The prompt has to ask for two levels, not one.
      const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
      expect(body.contents[0].parts[0].text).toContain('level_count": 2');
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('reports source "ai" when the provider answers', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const payload = JSON.stringify([{ content: { instruction: 'Pick one!', question: '2 + 2 = ?', options: [{ id: 'a', value: '4' }, { id: 'b', value: '5' }], correctId: 'a' }, hint: 'h', explanation: 'e' }]);

    const findConfig = mockSchoolModel();
    const globalFetch = globalThis.fetch;
    globalThis.fetch = mockGeminiLevels(1);
    try {
      const activity = await aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 1, language: 'en' },
        'school-1', 'user-1',
      );
      expect(activity.source).toBe('ai');
      expect(activity.rejected_levels).toHaveLength(0);
    } finally {
      globalThis.fetch = globalFetch;
      findConfig.mockRestore();
    }
  });

  it('sends the whole wizard to the model as JSON, including the output language', async () => {
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const findConfig = mockSchoolModel();
    let sentPrompt = '';
    const globalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, init) => {
      sentPrompt = JSON.parse(init.body).contents[0].parts[0].text;
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify([{ mechanic: 'multiple_choice', content: { instruction: 'Pick one!', question: '2 + 2 = ?', options: [{ id: 'a', value: '4' }, { id: 'b', value: '5' }], correctId: 'a' } }]) }] } }] }) };
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

  it('passes the title and description the teacher typed through validation', async () => {
    // Regression guard: the generate schema dropped `title`/`description` as
    // unknown keys, so the prompt only ever saw a title the service invented from
    // the template name, no matter what the teacher wrote in step 1.
    const { KidsAIGenerateSchema } = await import('../../src/shared/schemas/kids-activity.schema.js');
    const parsed = KidsAIGenerateSchema.parse({
      title: 'Le cycle de l’eau',
      description: 'Nommer les trois états de l’eau.',
      subject: 'science', sub_topic: 'the water cycle', grade: 'CE1', count: 3,
    });
    expect(parsed.title).toBe('Le cycle de l’eau');
    expect(parsed.description).toBe('Nommer les trois états de l’eau.');
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
    const findFirst = vi.spyOn(prisma.aIConfig, 'findFirst').mockResolvedValue(null); // requested config: not in this school
    const findMany = vi.spyOn(prisma.aIConfig, 'findMany').mockResolvedValue([
      { id: 'school-default', name: 'Default', provider: 'google', model_id: 'd', base_url: null, api_key_enc: 'x', owner_id: null, is_default: true },
    ]);
    const globalFetch = globalThis.fetch;
    globalThis.fetch = mockGeminiLevels(1, 'multiple_choice');
    try {
      const activity = await aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 1, game_template: 'multiple_choice', model_id: 'someone-elses-config' },
        'school-1', 'user-1',
      );
      expect(activity.model.id).toBe('school-default');
    } finally {
      globalThis.fetch = globalFetch;
      findFirst.mockRestore();
      findMany.mockRestore();
    }
  });

  it('never sends a level request to an image or embedding model', async () => {
    // Regression guard: a school with only image/embedding models configured used
    // to pick one at random and the teacher got an empty generation with no idea
    // why. The picker hides them, the default skips them, and an explicit pick
    // is refused with a message that says what to do.
    const { KidsAIService } = await import('../../src/backend/services/kids/KidsAIService.js');
    const { AppError } = await import('../../src/shared/errors.js');
    const aiSvc = new KidsAIService(null, { warn: () => {}, error: () => {}, info: () => {} });
    const image = { id: 'img', name: 'Image Maker', provider: 'google', model_id: 'gemini-2.5-flash-image', base_url: null, api_key_enc: 'x' };
    const embed = { id: 'emb', name: 'Embedder', provider: 'openai', model_id: 'text-embedding-3-small', base_url: null, api_key_enc: 'x' };
    const text = { id: 'txt', name: 'Chatty', provider: 'google', model_id: 'gemini-3.1-flash-lite', base_url: null, api_key_enc: 'x', owner_id: null, is_default: false };
    const globalFetch = globalThis.fetch;

    const findMany = vi.spyOn(prisma.aIConfig, 'findMany').mockResolvedValue([image, embed, text]);
    const findFirst = vi.spyOn(prisma.aIConfig, 'findFirst').mockResolvedValue(image);
    globalThis.fetch = mockGeminiLevels(1, 'multiple_choice');
    try {
      // The picker only offers models that can answer.
      const offered = await aiSvc.listAvailableModels('school-1', 'user-1');
      expect(offered.map(m => m.id)).toEqual(['txt']);

      // The default skips them even when they are the only rows present.
      findMany.mockResolvedValue([image, embed]);
      globalThis.fetch = vi.fn();
      await expect(aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 1, game_template: 'multiple_choice' },
        'school-1', 'user-1',
      )).rejects.toBeInstanceOf(AppError);
      expect(globalThis.fetch).not.toHaveBeenCalled();

      // An explicit pick of an image model is refused, not silently accepted.
      findMany.mockResolvedValue([image, embed, text]);
      await expect(aiSvc.generateActivity(
        { subject: 'math', sub_topic: 'addition', grade: 'CP', count: 1, game_template: 'multiple_choice', model_id: 'img' },
        'school-1', 'user-1',
      )).rejects.toBeInstanceOf(AppError);
    } finally {
      globalThis.fetch = globalFetch;
      findMany.mockRestore();
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

  it('assigns the chosen classes, refuses another school\'s, and treats none as open to all', async () => {
    // The Audience step writes the audience straight into who can play, so a
    // class id that is not in the school must fail loudly: saving the activity
    // with a silently different audience is worse than an error.
    const makeTx = (owned) => ({
      kidsActivity: { update: vi.fn(async () => ({ id: 'act-1' })), findUnique: vi.fn(async () => ({ id: 'act-1', difficulty: 'easy' })) },
      kidsActivityLevel: { findMany: vi.fn(async () => []), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      kidsActivityClass: {
        deleteMany: vi.fn(),
        create: vi.fn(async ({ data }) => data),
      },
      class: { findMany: vi.fn(async () => owned) },
    });
    const run = async (classIds, owned) => {
      const tx = makeTx(owned);
      const spy = vi.spyOn(prisma, '$transaction').mockImplementation(fn => fn(tx));
      const levelSpy = vi.spyOn(prisma.kidsActivityLevel, 'findMany').mockResolvedValue([]);
      const existsSpy = vi.spyOn(prisma.kidsActivity, 'findFirst').mockResolvedValue({ id: 'act-1' });
      try {
        await new KidsActivityService(null).update('act-1', {
          title: 'T', subject: 'math', sub_topic: 'addition', grade: 'CP',
          game_template: 'multiple_choice', class_ids: classIds,
        }, 'school-1');
        return { tx, error: null };
      } catch (e) {
        return { tx, error: e };
      } finally { spy.mockRestore(); levelSpy.mockRestore(); existsSpy.mockRestore(); }
    };

    // Two classes from this school are linked.
    const ok = await run(['c1', 'c2'], [{ id: 'c1' }, { id: 'c2' }]);
    expect(ok.error).toBeNull();
    expect(ok.tx.kidsActivityClass.create).toHaveBeenCalledTimes(2);
    expect(ok.tx.class.findMany.mock.calls[0][0].where.school_id).toBe('school-1');

    // Nothing ticked means the whole school, which is a real state and must not
    // be mistaken for "no audience configured".
    const open = await run([], []);
    expect(open.error).toBeNull();
    expect(open.tx.kidsActivityClass.deleteMany).toHaveBeenCalled();
    expect(open.tx.kidsActivityClass.create).not.toHaveBeenCalled();

    // A class from another school is rejected instead of quietly skipped.
    const cross = await run(['c1', 'c-foreign'], [{ id: 'c1' }]);
    expect(cross.error).toBeTruthy();
    expect(cross.error.fields.class_ids[0]).toContain('c-foreign');
    expect(cross.tx.kidsActivityClass.create).not.toHaveBeenCalled();
  });

  it('filters the activity list by every field the filter bar offers', async () => {
    // Regression guard: the bar used to be cosmetic — only subject, grade,
    // template, theme, status, search, favourite and class reached the query.
    // Sub-topic, age, language, difficulty and author were sent by the UI and
    // then dropped, so the list looked filtered and was not.
    const findMany = vi.spyOn(prisma.kidsActivity, 'findMany').mockResolvedValue([]);
    const count = vi.spyOn(prisma.kidsActivity, 'count').mockResolvedValue(0);
    try {
      const svc = new KidsActivityService();
      await svc.list({
        subject: 'math',
        sub_topic: 'animaux',
        grade: 'CP',
        age_min: 7,
        age_max: 10,
        language: 'fr',
        theme: 'ocean',
        difficulty: 'medium',
        game_template: 'treasure_hunt',
        status: 'published',
        creator_id: 'teacher-9',
        class_id: 'class-2',
        is_favorite: true,
      }, 'school-A');
      const [query] = findMany.mock.calls[0];
      const w = query.where;
      expect(w.school_id).toBe('school-A');
      expect(w.subject).toBe('math');
      // Free text the teacher typed, so it cannot be an exact match.
      expect(w.sub_topic).toEqual({ contains: 'animaux' });
      expect(w.grade).toBe('CP');
      expect(w.language).toBe('fr');
      expect(w.theme).toBe('ocean');
      expect(w.difficulty).toBe('medium');
      expect(w.game_template).toBe('treasure_hunt');
      expect(w.status).toBe('published');
      expect(w.creator_id).toBe('teacher-9');
      expect(w.classes).toEqual({ some: { class_id: 'class-2' } });
      expect(w.is_favorite).toBe(true);
      // Age is an overlap: a game for 5-8 shows up when looking at 7-10.
      expect(w.AND).toEqual([{ age_min: { lte: 10 } }, { age_max: { gte: 7 } }]);
    } finally { findMany.mockRestore(); count.mockRestore(); }
  });

  it('leaves out the filters the teacher did not set', async () => {
    const findMany = vi.spyOn(prisma.kidsActivity, 'findMany').mockResolvedValue([]);
    const count = vi.spyOn(prisma.kidsActivity, 'count').mockResolvedValue(0);
    try {
      const svc = new KidsActivityService();
      await svc.list({ subject: 'science' }, 'school-A');
      const w = findMany.mock.calls[0][0].where;
      // An empty AND array would be an invalid Prisma query.
      expect(w.AND).toBeUndefined();
      expect(w.creator_id).toBeUndefined();
      expect(w.sub_topic).toBeUndefined();
      expect(w.difficulty).toBeUndefined();
      expect(w.is_favorite).toBeUndefined();
    } finally { findMany.mockRestore(); count.mockRestore(); }
  });

  it('never lets the author filter reach another school', async () => {
    // An admin filters by teacher, but the school scope is applied separately
    // and unconditionally: knowing a teacher's id must not surface their games
    // somewhere else.
    const { KidsActivityFilterSchema } = await import('../../src/shared/schemas/kids-activity.schema.js');
    const parsed = KidsActivityFilterSchema.parse({ creator_id: 'teacher-from-another-school', subject: 'math' });
    expect(parsed.creator_id).toBe('teacher-from-another-school');
    const findMany = vi.spyOn(prisma.kidsActivity, 'findMany').mockResolvedValue([]);
    const count = vi.spyOn(prisma.kidsActivity, 'count').mockResolvedValue(0);
    try {
      await new KidsActivityService().list(parsed, 'school-A');
      expect(findMany.mock.calls[0][0].where.school_id).toBe('school-A');
    } finally { findMany.mockRestore(); count.mockRestore(); }
  });

  it('reads is_favorite=false as false, not as "every non-empty string is true"', async () => {
    const { KidsActivityFilterSchema } = await import('../../src/shared/schemas/kids-activity.schema.js');
    expect(KidsActivityFilterSchema.parse({ is_favorite: 'false' }).is_favorite).toBe(false);
    expect(KidsActivityFilterSchema.parse({ is_favorite: 'true' }).is_favorite).toBe(true);
    expect(KidsActivityFilterSchema.parse({ is_favorite: '0' }).is_favorite).toBe(false);
  });

  it('offers only the filter values that exist, and names the teachers', async () => {
    // The dropdowns are built from this school's own games, so a sub-topic typed
    // by hand is selectable and a teacher can be picked by name.
    const groupBy = vi.spyOn(prisma.kidsActivity, 'groupBy').mockImplementation(async ({ by }) => {
      if (by[0] === 'sub_topic') return [{ sub_topic: 'Les animaux', _count: { _all: 2 } }, { sub_topic: 'Addition', _count: { _all: 1 } }];
      if (by[0] === 'creator_id') return [{ creator_id: 't1', _count: { _all: 3 } }, { creator_id: 't2', _count: { _all: 1 } }];
      return [{ [by[0]]: 'x', _count: { _all: 1 } }];
    });
    const aggregate = vi.spyOn(prisma.kidsActivity, 'aggregate').mockResolvedValue({ _min: { age_min: 5 }, _max: { age_max: 12 } });
    const user = vi.spyOn(prisma.user, 'findMany').mockResolvedValue([{ id: 't1', name: 'Mme Ada' }]);
    try {
      const fx = await new KidsActivityService().listFacets('school-A');
      expect(fx.sub_topics.map(s => s.value)).toEqual(['Addition', 'Les animaux']);
      // t2's user row is gone, so the games are still listed under a placeholder
      // instead of vanishing from the teacher dropdown.
      expect(fx.creators).toEqual([
        { value: 't1', name: 'Mme Ada', count: 3 },
        { value: 't2', name: 'Unknown teacher', count: 1 },
      ]);
      expect(fx.age).toEqual({ min: 5, max: 12 });
      expect(groupBy.mock.calls[0][0].where).toEqual({ school_id: 'school-A' });
    } finally { groupBy.mockRestore(); aggregate.mockRestore(); user.mockRestore(); }
  });

  it('reports a per-level success breakdown, with null instead of 0% when unplayed', async () => {    const { KidsGameSessionService } = await import('../../src/backend/services/kids/KidsGameSessionService.js');
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

  it('lists only published games given to the student class, or left open to the school', async () => {
    // The student welcome screen lists these, so the filter is the tenant guard:
    // another school's games, a draft, and a game given to a different class must
    // all stay out, while a class-assigned game and a school-wide one come back.
    const findUser = vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({ class_id: 'class-1' });
    const findMany = vi.spyOn(prisma.kidsActivity, 'findMany').mockResolvedValue([
      { id: 'a1', title: 'For my class', join_code: 'ABC123', _count: { levels: 5 } },
      { id: 'a2', title: 'Whole school', join_code: 'DEF456', _count: { levels: 3 } },
    ]);
    try {
      const svc = new KidsActivityService();
      const items = await svc.listForStudent('student-1', 'school-1');
      expect(items).toHaveLength(2);

      const [query] = findMany.mock.calls[0];
      expect(query.where.school_id).toBe('school-1');
      expect(query.where.status).toBe('published');
      // Same class, or no class at all (open to the whole school).
      expect(query.where.OR).toEqual([
        { classes: { some: { class_id: 'class-1' } } },
        { classes: { none: {} } },
      ]);
      // The player needs the join code to start, and a level count to show.
      expect(query.select.join_code).toBe(true);
      expect(query.select._count).toEqual({ select: { levels: true } });
    } finally { findUser.mockRestore(); findMany.mockRestore(); }
  });

  it('does not list another student\'s games when the caller has no class', async () => {
    // A student with `class_id: null` must not match the `__none__` sentinel and
    // pull in the games assigned to some other class.
    const findUser = vi.spyOn(prisma.user, 'findFirst').mockResolvedValue({ class_id: null });
    const findMany = vi.spyOn(prisma.kidsActivity, 'findMany').mockResolvedValue([]);
    try {
      const svc = new KidsActivityService();
      await svc.listForStudent('student-1', 'school-1');
      const [query] = findMany.mock.calls[0];
      expect(query.where.OR[0]).toEqual({ classes: { some: { class_id: '__none__' } } });
    } finally { findUser.mockRestore(); findMany.mockRestore(); }
  });

  it('refuses to list games for a student who is not in the school', async () => {
    const findUser = vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);
    const findMany = vi.spyOn(prisma.kidsActivity, 'findMany').mockResolvedValue([]);
    try {
      const svc = new KidsActivityService();
      await expect(svc.listForStudent('outsider', 'school-1')).rejects.toBeTruthy();
      expect(findMany).not.toHaveBeenCalled();
    } finally { findUser.mockRestore(); findMany.mockRestore(); }
  });
});
