/**
 * src/backend/services/kids/KidsAIService.js
 *
 * Dedicated AI pipeline for generating primary-school educational games:
 * 1. Analyzes learning objective & age range.
 * 2. Uses GameSelector to pick the best game mechanic (or respects teacher's choice).
 * 3. Builds pedagogical prompt tailored to primary school levels (CP-CM2).
 * 4. Calls LLM via active school AIConfig (OpenRouter / OpenAI / Anthropic / Gemini / etc.).
 * 5. Parses and self-heals JSON output, validates with Zod.
 * 6. Includes offline/mock generator when API key is unconfigured.
 */

import { GameSelector } from './GameSelector.js';
import { GameTemplateRegistry } from './GameTemplateRegistry.js';
import { validateLevelContent } from '../../../shared/schemas/kids-activity.schema.js';
import { decryptSecret } from '../AIConfigService.js';
import { prisma } from '../../prisma.js';
import { logger } from '../../logger.js';

export class KidsAIService {
  constructor(repo, log = logger) {
    this.repo = repo;
    this.logger = log;
    this.selector = new GameSelector();
  }

  /**
   * Models a teacher may pick in Game Studio. Only non-secret fields are
   * returned: the teacher needs the label and the model id to send, never the key.
   */
  async listAvailableModels(schoolId, userId) {
    const configs = await prisma.aIConfig.findMany({
      where: {
        school_id: schoolId,
        OR: [{ owner_id: userId }, { owner_id: null }],
      },
      orderBy: [{ owner_id: 'desc' }, { is_default: 'desc' }, { name: 'asc' }],
    });
    return configs.map(c => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      model_id: c.model_id,
      is_default: c.is_default,
      is_personal: c.owner_id != null,
    }));
  }

  /**
   * Main pipeline to generate a complete Kids educational activity.
   */
  async generateActivity(params, schoolId, userId) {
    const {
      subject,
      sub_topic,
      grade,
      age_min = 5,
      age_max = 12,
      difficulty = 'easy',
      count = 8,
      language = 'fr',
    } = params;

    // The teacher is told, in the wizard itself, whether the levels came from
    // the AI or from the offline pool. Previously any provider failure was
    // swallowed and generic questions were returned as if they had been
    // generated, which is how an "addition" activity ended up about spiders.
    const warnings = [];
    let source = 'ai';

    let objective = params.objective;
    if (!objective || objective.trim().length === 0) {
      objective = `Apprendre et s'entraîner sur ${sub_topic || subject} niveau ${grade}`;
    }

    // 1. Choose game template if not provided or set to 'auto'
    let selectedTemplateId = params.game_template;
    let selectedTemplate = null;

    if (!selectedTemplateId || selectedTemplateId === 'auto') {
      const best = this.selector.selectBest({
        subject,
        grade,
        age_min,
        age_max,
        objective,
        difficulty,
        count,
      });
      selectedTemplateId = best.templateId;
      selectedTemplate = best.template;
    } else {
      selectedTemplate = GameTemplateRegistry.getById(selectedTemplateId);
    }

    if (!selectedTemplate) {
      selectedTemplateId = 'multiple_choice';
      selectedTemplate = GameTemplateRegistry.getById('multiple_choice');
    }

    // Pick visual theme if empty
    const theme = params.theme || (subject === 'science' ? 'ocean' : subject === 'math' ? 'space' : 'jungle');

    // 2. Fetch the AI config the teacher chose, else the school default
    const aiConfig = await this.#getActiveAIConfig(schoolId, userId, params.model_id);

    let rawGeneratedLevels = [];
    if (!aiConfig && !process.env.AI_API_KEY) {
      this.logger.warn('No AI API key configured — using pedagogical template generator');
      source = 'fallback';
      warnings.push('No AI model is configured for your school, so Game Studio used its built-in question pool. The wording is generic, not specific to your objective.');
      rawGeneratedLevels = this.#generatePedagogicalMock(selectedTemplateId, {
        subject,
        sub_topic,
        grade,
        count,
        language,
      });
    } else {
      // 3. Prompt generation and LLM call
      const prompt = this.#buildPedagogicalPrompt(selectedTemplateId, {
        subject,
        sub_topic,
        grade,
        age_min,
        age_max,
        objective,
        difficulty,
        count,
        language,
        title: params.title,
        description: params.description,
        theme,
      });

      try {
        const responseText = await this.#callLLM(aiConfig, prompt);
        rawGeneratedLevels = this.#parseAndHealJSON(responseText);
        if (rawGeneratedLevels.length === 0) throw new Error('Model returned no JSON level array');
      } catch (err) {
        this.logger.error('Kids LLM generation failed, falling back to pedagogical generator', err);
        source = 'fallback';
        const reason = err?.message || 'unknown provider error';
        const isQuota = /429|quota|rate limit|resource_exhausted/i.test(reason);
        warnings.push(
          isQuota
            ? `The selected model could not generate levels (quota / rate limit). Game Studio used its built-in pool instead — review the text before publishing. Details: ${reason.slice(0, 200)}`
            : `The selected model could not generate levels, so Game Studio used its built-in pool instead. Details: ${reason.slice(0, 200)}`
        );
        rawGeneratedLevels = this.#generatePedagogicalMock(selectedTemplateId, {
          subject,
          sub_topic,
          grade,
          count,
          language,
        });
      }
    }

    // 4. Validate each level with Zod
    const validatedLevels = [];
    let dropped = 0;
    for (let i = 0; i < rawGeneratedLevels.length; i++) {
      const rawLevel = rawGeneratedLevels[i];
      try {
        const isNarrativeTemplate = selectedTemplate.category !== 'core';
        const coreMechanic = rawLevel.mechanic || rawLevel.baseMechanic || 'multiple_choice';
        const coreContent = rawLevel.content || rawLevel;
        const validatedCore = validateLevelContent(isNarrativeTemplate ? coreMechanic : selectedTemplateId, coreContent);
        const content = isNarrativeTemplate
          ? { ...validatedCore, mechanic: coreMechanic, worldText: rawLevel.worldText || this.#worldText(selectedTemplateId, language) }
          : validatedCore;
        validatedLevels.push({
          order_index: i,
          level_type: selectedTemplateId,
          content_json: typeof content === 'string' ? content : JSON.stringify(content),
          points: rawLevel.points || 10,
          hint: rawLevel.hint || this.#defaultText('hint', language),
          explanation: rawLevel.explanation || this.#defaultText('explanation', language),
          narrative_json: rawLevel.narrative ? JSON.stringify(rawLevel.narrative) : null,
        });
      } catch (validationErr) {
        dropped++;
        this.logger.warn(`Level #${i + 1} validation failed, skipping or fixing:`, validationErr.message);
      }
    }
    if (dropped) warnings.push(`${dropped} generated level(s) did not match the "${selectedTemplateId}" format and were replaced by built-in content.`);

    // If all failed, ensure at least mock levels
    if (validatedLevels.length === 0) {
      source = 'fallback';
      warnings.push('None of the generated levels could be validated, so Game Studio rebuilt the activity from its built-in pool.');
      const mocks = this.#generatePedagogicalMock(selectedTemplateId, {
        subject,
        sub_topic,
        grade,
        count,
        language,
      });
      mocks.forEach((m, idx) => {
        const isNarrativeTemplate = selectedTemplate.category !== 'core';
        const fallbackContent = isNarrativeTemplate
          ? { ...m.content, mechanic: 'multiple_choice', worldText: this.#worldText(selectedTemplateId, language) }
          : m.content;
        validatedLevels.push({
          order_index: idx,
          level_type: selectedTemplateId,
          content_json: JSON.stringify(fallbackContent),
          points: 10,
          hint: m.hint,
          explanation: m.explanation,
        });
      });
    }

    return {
      title: `${selectedTemplate.name} : ${sub_topic || subject} (${grade})`,
      description: this.#activityDescription(grade, objective, language),
      subject,
      sub_topic,
      grade,
      age_min,
      age_max,
      objective,
      game_template: selectedTemplateId,
      theme,
      difficulty,
      language,
      levels: validatedLevels,
      // Consumed by the Game Studio wizard: it shows the model badge and the
      // warning list above the levels so generic content is never a surprise.
      source,
      warnings,
      model: aiConfig
        ? { id: aiConfig.id, name: aiConfig.name, provider: aiConfig.provider, model_id: aiConfig.model_id }
        : { id: null, name: 'Built-in question pool', provider: 'internal', model_id: null },
    };
  }

  #worldText(templateId, language) {
    if (language === 'en') {
      return `Keep going — ${NARRATIVE_WORLD_TEXT_EN[templateId] || 'every correct answer moves your hero forward!'}`;
    }
    if (language === 'ar') {
      return `واصل! ${NARRATIVE_WORLD_TEXT[templateId] || 'كل إجابة صحيحة تقرّب بطلك من الهدف!'}`;
    }
    return NARRATIVE_WORLD_TEXT[templateId] || 'Chaque bonne réponse fait avancer ton aventure !';
  }

  #defaultText(kind, language) {
    const table = {
      fr: { hint: 'Observe bien !', explanation: 'Bravo pour ta persévérance !' },
      en: { hint: 'Look carefully!', explanation: 'Great effort — well done!' },
      ar: { hint: 'انظر جيدًا!', explanation: 'أحسنت، استمر!' },
    };
    return (table[language] || table.fr)[kind];
  }

  #activityDescription(grade, objective, language) {
    if (language === 'en') return `Fun activity matched to ${grade} level. Objective: ${objective}`;
    if (language === 'ar') return `نشاط ممتع مناسب لمستوى ${grade}. الهدف: ${objective}`;
    return `Activité ludique adaptée au niveau ${grade}. Objectif : ${objective}`;
  }

  #buildPedagogicalPrompt(templateId, p) {
    const schemasExample = {
      multiple_choice: `[
  {
    "content": {
      "instruction": "Choisis la bonne réponse !",
      "question": "Quel est le résultat de 4 + 3 ?",
      "options": [
        { "id": "opt1", "value": "6", "emoji": "🌱" },
        { "id": "opt2", "value": "7", "emoji": "⭐" },
        { "id": "opt3", "value": "8", "emoji": "🍎" }
      ],
      "correctId": "opt2"
    },
    "hint": "Tu peux compter sur tes doigts !",
    "explanation": "4 + 3 font bien 7."
  }
]`,
      word_order: `[
  {
    "content": {
      "instruction": "Remets les lettres dans le bon ordre pour former le mot.",
      "answer": "CHAT",
      "items": [
        { "id": "1", "value": "A" },
        { "id": "2", "value": "C" },
        { "id": "3", "value": "T" },
        { "id": "4", "value": "H" }
      ]
    },
    "hint": "C'est un petit animal qui miaule !",
    "explanation": "Le mot est C-H-A-T."
  }
]`,
      drag_drop: `[
  {
    "content": {
      "instruction": "Glisse le bon mot dans le trou pour compléter la phrase.",
      "template": "Le {blank} brille dans le ciel.",
      "blanks": [{ "position": 0, "answer": "soleil" }],
      "choices": [
        { "id": "c1", "value": "soleil" },
        { "id": "c2", "value": "poisson" },
        { "id": "c3", "value": "voiture" }
      ]
    },
    "hint": "Il nous éclaire pendant la journée !",
    "explanation": "C'est le soleil qui brille dans le ciel."
  }
]`,
      matching: `[
  {
    "content": {
      "instruction": "Relie chaque mot à son contraire !",
      "pairs": [
        { "id": "p1", "left": "Grand", "right": "Petit", "leftEmoji": "🐘", "rightEmoji": "🐭" },
        { "id": "p2", "left": "Chaud", "right": "Froid", "leftEmoji": "🔥", "rightEmoji": "❄️" }
      ]
    },
    "hint": "Pense aux contraires !",
    "explanation": "Le contraire de Grand est Petit."
  }
]`,
      sorting: `[
  {
    "content": {
      "instruction": "Range chaque aliment dans la bonne boîte !",
      "categories": [
        { "id": "fruits", "label": "Fruits", "emoji": "🍎" },
        { "id": "legumes", "label": "Légumes", "emoji": "🥕" }
      ],
      "items": [
        { "id": "i1", "value": "Pomme", "emoji": "🍎", "categoryId": "fruits" },
        { "id": "i2", "value": "Carotte", "emoji": "🥕", "categoryId": "legumes" },
        { "id": "i3", "value": "Banane", "emoji": "🍌", "categoryId": "fruits" }
      ]
    },
    "hint": "Les fruits poussent souvent sur les arbres.",
    "explanation": "La pomme et la banane sont des fruits."
  }
]`,
      sequence: `[
  {
    "content": {
      "instruction": "Mets les nombres dans l'ordre croissant (du plus petit au plus grand).",
      "items": [
        { "id": "n1", "value": "2" },
        { "id": "n2", "value": "5" },
        { "id": "n3", "value": "8" }
      ],
      "correctOrder": ["n1", "n2", "n3"]
    },
    "hint": "Commence par le plus petit chiffre.",
    "explanation": "2 vient avant 5, et 5 avant 8."
  }
]`,
      bubble_pop: `[
  {
    "content": {
      "instruction": "Éclate toutes les bulles contenant un nombre pair !",
      "target": { "value": "Nombres pairs", "type": "text" },
      "bubbles": [
        { "id": "b1", "value": "2", "isCorrect": true },
        { "id": "b2", "value": "3", "isCorrect": false },
        { "id": "b3", "value": "4", "isCorrect": true },
        { "id": "b4", "value": "5", "isCorrect": false }
      ]
    },
    "hint": "Les nombres pairs se terminent par 0, 2, 4, 6 ou 8.",
    "explanation": "2 et 4 sont des nombres pairs."
  }
]`,
    };

    const specificExample = schemasExample[templateId] || schemasExample.multiple_choice;
    const template = GameTemplateRegistry.getById(templateId);
    const isNarrative = !!template && template.category !== 'core';

    // The whole wizard is handed to the model as one JSON object, so nothing the
    // teacher typed can be dropped on the way to the provider: title, subject,
    // sub-topic, objective, grade, ages, difficulty, template and the exact level
    // count. The earlier French prompt template paraphrased these fields and
    // ignored `language`, which is why the model kept answering in French.
    const context = {
      role: 'primary-school educational game designer',
      output_language: LANGUAGE_NAMES[p.language] || 'French',
      learner: {
        grade: p.grade,
        age_min: p.age_min,
        age_max: p.age_max,
      },
      curriculum: {
        subject: p.subject,
        sub_topic: p.sub_topic,
        objective: p.objective,
        difficulty: p.difficulty,
        activity_title: p.title || `${template?.name || templateId} : ${p.sub_topic || p.subject}`,
        activity_description: p.description || '',
      },
      game: {
        template_id: templateId,
        template_name: template?.name || templateId,
        category: template?.category || 'core',
        is_narrative: isNarrative,
        required_mechanic: isNarrative ? 'a CORE mechanic listed in the example, returned as "mechanic"' : templateId,
        theme: p.theme || 'jungle',
        min_levels: template?.min_items ?? 1,
      },
      output: {
        level_count: p.count,
        shape: 'strict JSON array, no markdown fences, no prose',
        level_fields: ['content', 'points', 'hint', 'explanation', ...(isNarrative ? ['mechanic', 'worldText'] : [])],
      },
      rules: [
        `Write every string in ${LANGUAGE_NAMES[p.language] || 'French'}.`,
        'Vocabulary must be short, concrete and readable by a child of this grade.',
        'Content must be specifically about sub_topic and must test objective — never generic filler.',
        'Use cheerful, relevant emoji.',
        'instructions must be direct and warm.',
        'The answer key must be consistent with what a child of this age would answer.',
      ],
    };

    const examples = {};
    for (const id of Object.keys(schemasExample)) {
      if (isNarrative || id === templateId || ['multiple_choice', 'word_order', 'drag_drop', 'matching', 'sorting', 'sequence', 'bubble_pop'].includes(id)) {
        examples[id] = JSON.parse(schemasExample[id]);
      }
    }

    return `You are given the teacher's complete wizard as JSON. Design the levels from it.

=== TEACHER WIZARD CONTEXT (JSON) ===
${JSON.stringify(context, null, 2)}

=== VALID LEVEL SHAPES (JSON) ===
${JSON.stringify(examples, null, 2)}

Return STRICTLY the JSON array of ${p.count} level objects. No text before, no text after, no markdown fences.`;
  }

  async #callLLM(aiConfig, prompt) {
    if (!aiConfig) {
      // Direct call using env variables
      const provider = process.env.AI_PROVIDER || 'openai';
      const apiKey = process.env.AI_API_KEY;
      const model = process.env.AI_MODEL || 'gpt-4o-mini';

      if (!apiKey) throw new Error('No API key in env');
      return this.#callProviderApi({ provider, apiKey, model_id: model }, prompt);
    }

    const apiKey = aiConfig.api_key_enc ? decryptSecret(aiConfig.api_key_enc) : null;
    return this.#callProviderApi(
      {
        provider: aiConfig.provider,
        model_id: aiConfig.model_id,
        base_url: aiConfig.base_url,
        apiKey,
      },
      prompt
    );
  }

  async #callProviderApi({ provider, model_id, base_url, apiKey }, prompt) {
    const endpoints = {
      openrouter: 'https://openrouter.ai/api/v1/chat/completions',
      openai:     'https://api.openai.com/v1/chat/completions',
      deepseek:   'https://api.deepseek.com/v1/chat/completions',
    };

    let url = base_url || endpoints[provider] || endpoints.openai;
    const headers = { 'Content-Type': 'application/json' };
    let body;

    if (provider === 'google') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model_id)}:generateContent?key=${encodeURIComponent(apiKey || '')}`;
      body = { contents: [{ parts: [{ text: prompt }] }] };
    } else if (provider === 'anthropic') {
      url = base_url || 'https://api.anthropic.com/v1/messages';
      headers['x-api-key'] = apiKey || '';
      headers['anthropic-version'] = '2023-06-01';
      body = { model: model_id, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] };
    } else {
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      body = { model: model_id, messages: [{ role: 'user', content: prompt }], temperature: 0.7 };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`LLM provider ${provider} responded ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      if (provider === 'google') {
        return data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      }
      if (provider === 'anthropic') {
        return data?.content?.[0]?.text || '';
      }
      return data?.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timeout);
    }
  }

  #parseAndHealJSON(raw) {
    let clean = String(raw || '').trim();
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const arrayMatch = clean.match(/\[[\s\S]*\]/);
    if (arrayMatch) clean = arrayMatch[0];

    try {
      const parsed = JSON.parse(clean);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      // Regex rescue individual objects
      const objects = clean.match(/\{[\s\S]*?\}(?=\s*(?:,|\s*\]))/g) || [];
      const rescued = [];
      for (const o of objects) {
        try {
          rescued.push(JSON.parse(o));
        } catch {}
      }
      return rescued;
    }
  }

  async #getActiveAIConfig(schoolId, userId, configId) {
    // An explicit choice from the Game Studio model picker wins, but it still has
    // to belong to the caller's school (or be their personal config) and be
    // active — otherwise a teacher could aim generation at another tenant's key.
    if (configId) {
      const chosen = await prisma.aIConfig.findFirst({
        where: {
          id: configId,
          school_id: schoolId,
          OR: [{ owner_id: userId }, { owner_id: null }],
        },
      });
      if (chosen) return chosen;
      this.logger.warn(`Requested AI config ${configId} is unavailable for this school, using the school default`);
    }

    const config = await prisma.aIConfig.findFirst({
      where: {
        school_id: schoolId,
        OR: [
          { owner_id: userId },
          { owner_id: null },
        ],
      },
      orderBy: [
        { owner_id: 'desc' }, // prioritize personal
        { is_default: 'desc' },
      ],
    });
    return config;
  }

  /**
   * Offline pedagogical generator when no LLM API is available.
   *
   * Every CORE mechanic has a hand-written pool validated against
   * LEVEL_CONTENT_SCHEMAS. Adventure/immersive templates have no pool of their
   * own: they are narrative shells, so we generate real core-mechanic levels
   * and tag each one with `mechanic` + `worldText`, which the validation step
   * above then validates and wraps exactly like an LLM response.
   *
   * The pool is cycled when a teacher asks for more levels than we ship
   * offline, and the requested count is raised to the template's `min_items` so
   * the activity always clears ActivityValidator.validateForPublish().
   */
  #generatePedagogicalMock(templateId, { subject, sub_topic, grade, count = 5 }) {
    const template = GameTemplateRegistry.getById(templateId);
    const isNarrative = !!template && template.category !== 'core';
    const coreMechanic = isNarrative ? this.#pickCoreMechanic({ subject, grade, count }, templateId) : templateId;

    const pool = KIDS_CORE_POOLS[coreMechanic] || KIDS_CORE_POOLS.multiple_choice;
    const needed = Math.max(Number(count) || 1, template?.min_items ?? 1);

    const levels = [];
    for (let i = 0; i < needed; i++) {
      // Cycle the pool so short pools still satisfy min_items and large counts.
      const base = pool[i % pool.length];
      const level = {
        content: { ...base.content },
        hint: base.hint,
        explanation: base.explanation,
      };
      if (isNarrative) {
        level.mechanic = coreMechanic;
        level.worldText = NARRATIVE_WORLD_TEXT[templateId] || 'Chaque bonne réponse fait avancer ton aventure !';
      }
      levels.push(level);
    }
    return levels;
  }

  /** Best CORE mechanic to embed inside an adventure / immersive shell. */
  #pickCoreMechanic({ subject, grade, count }, templateId) {
    const preferred = NARRATIVE_CORE_MECHANIC[templateId];
    if (preferred && KIDS_CORE_POOLS[preferred]) return preferred;

    const best = this.selector.selectBest({ subject, grade, count, difficulty: 'easy' });
    const candidate = best?.templateId;
    if (candidate && KIDS_CORE_POOLS[candidate]) return candidate;
    return 'multiple_choice';
  }
}

/**
 * Per-mechanic offline level pools. Shapes mirror the prompt examples above and
 * are enforced by LEVEL_CONTENT_SCHEMAS during generateActivity().
 */
const KIDS_CORE_POOLS = Object.freeze({
  multiple_choice: [
    {
      content: {
        instruction: 'Choisis la bonne réponse ! 🌟',
        question: 'Combien de pattes a une araignée ?',
        options: [
          { id: 'opt1', value: '6 pattes', emoji: '🐜' },
          { id: 'opt2', value: '8 pattes', emoji: '🕷️' },
          { id: 'opt3', value: '4 pattes', emoji: '🐕' },
        ],
        correctId: 'opt2',
      },
      hint: 'Les insectes en ont 6, mais l’araignée en a deux de plus !',
      explanation: 'L’araignée est un arachnide et possède 8 pattes.',
    },
    {
      content: {
        instruction: 'Trouve la solution ! 🔢',
        question: 'Combien font 5 + 5 ?',
        options: [
          { id: 'opt1', value: '9', emoji: '🎈' },
          { id: 'opt2', value: '10', emoji: '⭐' },
          { id: 'opt3', value: '11', emoji: '🚀' },
        ],
        correctId: 'opt2',
      },
      hint: 'Pense aux doigts de tes deux mains !',
      explanation: '5 + 5 = 10.',
    },
    {
      content: {
        instruction: 'Quelle saison precedes l’hiver ? ❄️',
        question: 'Quelle saison vient juste avant l’hiver ?',
        options: [
          { id: 'opt1', value: 'Le printemps', emoji: '🌷' },
          { id: 'opt2', value: 'L’été', emoji: '🏖️' },
          { id: 'opt3', value: 'L’automne', emoji: '🍂' },
        ],
        correctId: 'opt3',
      },
      hint: 'C’est la saison où les feuilles tombent des arbres.',
      explanation: 'L’automne vient avant l’hiver.',
    },
  ],

  word_order: [
    {
      content: {
        instruction: 'Remets les lettres dans le bon ordre pour écrire le mot.',
        answer: 'LION',
        items: [
          { id: '1', value: 'O' },
          { id: '2', value: 'L' },
          { id: '3', value: 'N' },
          { id: '4', value: 'I' },
        ],
      },
      hint: 'Le roi de la savane ! 🦁',
      explanation: 'L-I-O-N forme le mot LION.',
    },
    {
      content: {
        instruction: 'Remets les mots dans l’ordre pour former une phrase.',
        answer: 'Le chat dort',
        items: [
          { id: '1', value: 'dort' },
          { id: '2', value: 'Le' },
          { id: '3', value: 'chat' },
        ],
      },
      hint: 'Qui fait l’action ?',
      explanation: 'La phrase correcte est : Le chat dort.',
    },
    {
      content: {
        instruction: 'Trouve le fruit puis remets ses lettres dans l’ordre.',
        answer: 'POMME',
        items: [
          { id: '1', value: 'M' },
          { id: '2', value: 'P' },
          { id: '3', value: 'E' },
          { id: '4', value: 'O' },
          { id: '5', value: 'P' },
        ],
      },
      hint: 'Elle est rouge et pousse sur un arbre 🍎',
      explanation: 'P-O-M-M-E forme le mot POMME.',
    },
  ],

  drag_drop: [
    {
      content: {
        instruction: 'Glisse le bon mot dans le trou pour compléter la phrase.',
        template: 'Le {blank} brille dans le ciel.',
        blanks: [{ position: 0, answer: 'soleil' }],
        choices: [
          { id: 'c1', value: 'soleil' },
          { id: 'c2', value: 'poisson' },
          { id: 'c3', value: 'voiture' },
        ],
      },
      hint: 'Il nous éclaire pendant la journée !',
      explanation: 'C’est le soleil qui brille dans le ciel.',
    },
    {
      content: {
        instruction: 'Complète la phrase avec le bon animal.',
        template: 'Le {blank} miaule et dit « miaou ».',
        blanks: [{ position: 0, answer: 'chat' }],
        choices: [
          { id: 'c1', value: 'chien' },
          { id: 'c2', value: 'chat' },
          { id: 'c3', value: 'cheval' },
        ],
      },
      hint: 'Cet animal aime le lait 🐱',
      explanation: 'C’est le chat qui miaule.',
    },
    {
      content: {
        instruction: 'Choisis le nombre qui complète la phrase.',
        template: 'Il y a {blank} pommes dans le panier.',
        blanks: [{ position: 0, answer: 'trois' }],
        choices: [
          { id: 'c1', value: 'un' },
          { id: 'c2', value: 'deux' },
          { id: 'c3', value: 'trois' },
        ],
      },
      hint: 'Compte sur tes doigts 🍎',
      explanation: 'Il y a trois pommes dans le panier.',
    },
  ],

  matching: [
    {
      content: {
        instruction: 'Relie chaque mot à son contraire !',
        pairs: [
          { id: 'p1', left: 'Grand', right: 'Petit', leftEmoji: '🐘', rightEmoji: '🐭' },
          { id: 'p2', left: 'Chaud', right: 'Froid', leftEmoji: '🔥', rightEmoji: '❄️' },
          { id: 'p3', left: 'Jour', right: 'Nuit', leftEmoji: '☀️', rightEmoji: '🌙' },
        ],
      },
      hint: 'Pense aux contraires !',
      explanation: 'Grand s’oppose à petit, chaud à froid, jour à nuit.',
    },
    {
      content: {
        instruction: 'Associe chaque animal à ce qu’il mange.',
        pairs: [
          { id: 'p1', left: 'Abeille', right: 'Miel', leftEmoji: '🐝', rightEmoji: '🍯' },
          { id: 'p2', left: 'Lapin', right: 'Carotte', leftEmoji: '🐇', rightEmoji: '🥕' },
          { id: 'p3', left: 'Oiseau', right: 'Graine', leftEmoji: '🐦', rightEmoji: '🌾' },
        ],
      },
      hint: 'Qui mange des graines ?',
      explanation: 'L’oiseau mange des graines, le lapin des carottes.',
    },
    {
      content: {
        instruction: 'Relie chaque forme au nombre de côtés !',
        pairs: [
          { id: 'p1', left: 'Triangle', right: '3 côtés' },
          { id: 'p2', left: 'Carré', right: '4 côtés' },
          { id: 'p3', left: 'Cercle', right: '0 côté' },
        ],
      },
      hint: 'Compte les coins de chaque forme !',
      explanation: 'Le triangle a 3 côtés et le carré 4.',
    },
  ],

  memory: [
    {
      content: {
        instruction: 'Retrouve les paires identiques !',
        cards: [
          { id: 'c1', matchId: 'm1', value: 'Pomme', type: 'emoji', emoji: '🍎' },
          { id: 'c2', matchId: 'm1', value: 'Pomme', type: 'emoji', emoji: '🍎' },
          { id: 'c3', matchId: 'm2', value: 'Banane', type: 'emoji', emoji: '🍌' },
          { id: 'c4', matchId: 'm2', value: 'Banane', type: 'emoji', emoji: '🍌' },
        ],
      },
      hint: 'Retiens bien où sont les fruits !',
      explanation: 'Les deux 🍎 et les deux 🍌 vont ensemble.',
    },
    {
      content: {
        instruction: 'Retrouve les paires d’animaux identiques.',
        cards: [
          { id: 'c1', matchId: 'm1', value: 'Chat', type: 'emoji', emoji: '🐱' },
          { id: 'c2', matchId: 'm1', value: 'Chat', type: 'emoji', emoji: '🐱' },
          { id: 'c3', matchId: 'm2', value: 'Chien', type: 'emoji', emoji: '🐶' },
          { id: 'c4', matchId: 'm2', value: 'Chien', type: 'emoji', emoji: '🐶' },
        ],
      },
      hint: 'Deux chats et deux chiens 🐾',
      explanation: 'Il y a une paire de 🐱 et une paire de 🐶.',
    },
    {
      content: {
        instruction: 'Retrouve les paires de lettres identiques.',
        cards: [
          { id: 'c1', matchId: 'm1', value: 'A', type: 'text' },
          { id: 'c2', matchId: 'm1', value: 'A', type: 'text' },
          { id: 'c3', matchId: 'm2', value: 'B', type: 'text' },
          { id: 'c4', matchId: 'm2', value: 'B', type: 'text' },
        ],
      },
      hint: 'Ce sont des lettres de l’alphabet !',
      explanation: 'Les deux A vont ensemble, et les deux B aussi.',
    },
  ],

  sorting: [
    {
      content: {
        instruction: 'Trie les nombres pairs et les nombres impairs.',
        categories: [
          { id: 'pairs', label: 'Pairs (2, 4, 6...)', emoji: '🟢' },
          { id: 'impairs', label: 'Impairs (1, 3, 5...)', emoji: '🟡' },
        ],
        items: [
          { id: 'i1', value: '2', categoryId: 'pairs' },
          { id: 'i2', value: '3', categoryId: 'impairs' },
          { id: 'i3', value: '4', categoryId: 'pairs' },
          { id: 'i4', value: '7', categoryId: 'impairs' },
        ],
      },
      hint: 'Les nombres pairs se partagent en deux parts égales.',
      explanation: '2 et 4 sont pairs, 3 et 7 sont impairs.',
    },
    {
      content: {
        instruction: 'Range chaque fruit dans la bonne boîte.',
        categories: [
          { id: 'fruits', label: 'Fruits', emoji: '🍎' },
          { id: 'legumes', label: 'Légumes', emoji: '🥕' },
        ],
        items: [
          { id: 'i1', value: 'Pomme', categoryId: 'fruits' },
          { id: 'i2', value: 'Carotte', categoryId: 'legumes' },
          { id: 'i3', value: 'Banane', categoryId: 'fruits' },
          { id: 'i4', value: 'Poireau', categoryId: 'legumes' },
        ],
      },
      hint: 'La carotte et le poireau poussent sous terre 🥕',
      explanation: 'La pomme et la banane sont des fruits.',
    },
    {
      content: {
        instruction: 'Classe les animaux selon leur habitat.',
        categories: [
          { id: 'mer', label: 'Dans la mer', emoji: '🌊' },
          { id: 'ciel', label: 'Dans le ciel', emoji: '☁️' },
        ],
        items: [
          { id: 'i1', value: 'Poisson', categoryId: 'mer' },
          { id: 'i2', value: 'Aigle', categoryId: 'ciel' },
          { id: 'i3', value: 'Crabe', categoryId: 'mer' },
          { id: 'i4', value: 'Mouette', categoryId: 'ciel' },
        ],
      },
      hint: 'Les poissons nagent, les oiseaux volent !',
      explanation: 'Le poisson et le crabe vivent dans la mer.',
    },
  ],

  sequence: [
    {
      content: {
        instruction: 'Mets les nombres dans l’ordre croissant (du plus petit au plus grand).',
        items: [
          { id: 'n1', value: '2' },
          { id: 'n2', value: '5' },
          { id: 'n3', value: '8' },
        ],
        correctOrder: ['n1', 'n2', 'n3'],
      },
      hint: 'Commence par le plus petit chiffre.',
      explanation: '2 vient avant 5, et 5 avant 8.',
    },
    {
      content: {
        instruction: 'Remplace les flèches par des étapes dans le bon ordre.',
        items: [
          { id: 's1', value: 'Se réveiller', emoji: '⏰' },
          { id: 's2', value: 'Prendre le petit-déjeuner', emoji: '🥣' },
          { id: 's3', value: 'Aller à l’école', emoji: '🎒' },
        ],
        correctOrder: ['s1', 's2', 's3'],
      },
      hint: 'On se réveille avant de partir !',
      explanation: 'D’abord se réveiller, puis déjeuner, puis l’école.',
    },
    {
      content: {
        instruction: 'Range ces nombres du plus grand au plus petit.',
        items: [
          { id: 'n1', value: '9' },
          { id: 'n2', value: '4' },
          { id: 'n3', value: '7' },
        ],
        correctOrder: ['n1', 'n3', 'n2'],
      },
      hint: 'Cette fois on commence par le plus grand.',
      explanation: '9 > 7 > 4.',
    },
  ],

  find_correct: [
    {
      content: {
        instruction: 'Trouve le bon animal dans l’image ! 🔍',
        question: 'Quel animal miaule ?',
        items: [
          { id: 'f1', value: 'Chien', emoji: '🐶' },
          { id: 'f2', value: 'Chat', emoji: '🐱' },
          { id: 'f3', value: 'Vache', emoji: '🐮' },
        ],
        correctId: 'f2',
      },
      hint: 'On ne l’entend pas, il se voit !',
      explanation: 'Le chat 🐱 est celui qui miaule.',
    },
    {
      content: {
        instruction: 'Trouve le bon objet ! 🔍',
        question: 'Quel objet sert à écrire ?',
        items: [
          { id: 'f1', value: 'Crayon', emoji: '✏️' },
          { id: 'f2', value: 'Cuillère', emoji: '🥄' },
          { id: 'f3', value: 'Ballon', emoji: '⚽' },
        ],
        correctId: 'f1',
      },
      hint: 'Tu l’utilises sur une feuille de papier 📝',
      explanation: 'Le crayon sert à écrire.',
    },
    {
      content: {
        instruction: 'Trouve la bonne couleur ! 🌈',
        question: 'Quelle couleur est le citron ?',
        items: [
          { id: 'f1', value: 'Violet', emoji: '🟣' },
          { id: 'f2', value: 'Jaune', emoji: '🟡' },
          { id: 'f3', value: 'Bleu', emoji: '🔵' },
        ],
        correctId: 'f2',
      },
      hint: 'C’est la couleur du soleil ☀️',
      explanation: 'Le citron est jaune.',
    },
  ],

  bubble_pop: [
    {
      content: {
        instruction: 'Éclate toutes les bulles contenant un nombre pair !',
        target: { value: 'Nombres pairs', type: 'text' },
        bubbles: [
          { id: 'b1', value: '2', isCorrect: true },
          { id: 'b2', value: '3', isCorrect: false },
          { id: 'b3', value: '4', isCorrect: true },
          { id: 'b4', value: '5', isCorrect: false },
        ],
      },
      hint: 'Les nombres pairs se terminent par 0, 2, 4, 6 ou 8.',
      explanation: '2 et 4 sont des nombres pairs.',
    },
    {
      content: {
        instruction: 'Éclate seulement les bulles qui contiennent un fruit !',
        target: { value: 'Fruits', type: 'emoji' },
        bubbles: [
          { id: 'b1', value: '🍎', isCorrect: true },
          { id: 'b2', value: '🚗', isCorrect: false },
          { id: 'b3', value: '🍌', isCorrect: true },
          { id: 'b4', value: '👟', isCorrect: false },
        ],
      },
      hint: 'Les fruits poussent sur un arbre 🌳',
      explanation: 'La pomme et la banane sont des fruits.',
    },
    {
      content: {
        instruction: 'Éclate les bulles qui contiennent un animal !',
        target: { value: 'Animaux', type: 'emoji' },
        bubbles: [
          { id: 'b1', value: '🐶', isCorrect: true },
          { id: 'b2', value: '⭐', isCorrect: false },
          { id: 'b3', value: '🌸', isCorrect: false },
          { id: 'b4', value: '🐰', isCorrect: true },
        ],
      },
      hint: 'Ils bougent et vivent 🐾',
      explanation: 'Le chien et le lapin sont des animaux.',
    },
  ],
});

/** World narration per adventure / immersive shell. */
const NARRATIVE_WORLD_TEXT = Object.freeze({
  treasure_hunt:   'Tu suis la carte jusqu’au coffre du trésor !',
  obstacle_run:     'Saute les obstacles pour atteindre la ligne d’arrivée !',
  board_game:       'Lance les dés et avance sur le plateau !',
  puzzle:           'Assemble les morceaux pour ouvrir la porte du mystère !',
  build_construct:  'Construis la tour avec les blocs scattered !',
  whack_tap:        'Frappe vite les cibles qui apparaissent !',
  animal_rescue:    'Aide les animaux à retrouver leur habitat !',
  space_adventure:  'Pilote ta fusée à travers les planètes !',
  cooking:          'Suis la recette pour préparer un bon plat !',
  escape_room:      'Résous les énigmes pour t’échapper !',
  farm_garden:      'Plante les graines et fais pousser ton jardin !',
});

/**
 * Which core mechanic each narrative shell wraps offline. Keeps the 11 shells
 * from all collapsing onto the same underlying quiz when no LLM is configured;
 * an LLM response still wins because it supplies its own `mechanic` field.
 */
const NARRATIVE_CORE_MECHANIC = Object.freeze({
  treasure_hunt:   'multiple_choice',
  obstacle_run:     'sequence',
  board_game:       'sorting',
  puzzle:           'matching',
  build_construct:  'drag_drop',
  whack_tap:        'bubble_pop',
  animal_rescue:    'find_correct',
  space_adventure:  'word_order',
  cooking:          'sorting',
  escape_room:      'matching',
  farm_garden:      'memory',
});

/**
 * English narration for the same shells, used when a Game Studio activity is
 * created in English. Kept next to the French table so the two stay in sync.
 */
const NARRATIVE_WORLD_TEXT_EN = Object.freeze({
  treasure_hunt:   'Follow the map to the treasure chest!',
  obstacle_run:     'Jump the obstacles to reach the finish line!',
  board_game:       'Roll the dice and move around the board!',
  puzzle:           'Fit the pieces together to open the mystery door!',
  build_construct:  'Build the tower with the blocks!',
  whack_tap:        'Tap the targets quickly as they appear!',
  animal_rescue:    'Help the animals find their habitat!',
  space_adventure:  'Fly your rocket past the planets!',
  cooking:          'Follow the recipe to cook a tasty dish!',
  escape_room:      'Solve the puzzles to escape!',
  farm_garden:      'Plant the seeds and grow your garden!',
});

/** Human-readable output language for the JSON prompt sent to the model. */
const LANGUAGE_NAMES = Object.freeze({
  fr: 'French',
  en: 'English',
  ar: 'Arabic',
});

