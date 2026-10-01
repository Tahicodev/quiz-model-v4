/**
 * src/backend/services/kids/KidsAIService.js
 *
 * Dedicated AI pipeline for generating primary-school educational games:
 * 1. Analyzes learning objective & age range.
 * 2. Uses GameSelector to pick the best game mechanic (or respects teacher's choice).
 * 3. Builds pedagogical prompt tailored to primary school levels (CP-CM2).
 * 4. Calls LLM via active school AIConfig (OpenRouter / OpenAI / Anthropic / Gemini / etc.).
 * 5. Parses and self-heals JSON output, validates with Zod.
 * 6. Never substitutes built-in content: if the model cannot be used, the
 *    request fails and the teacher is told why, so nothing generic is ever
 *    presented as if the model had written it.
 */

import { GameSelector } from './GameSelector.js';
import { GameTemplateRegistry } from './GameTemplateRegistry.js';
import { validateLevelContent } from '../../../shared/schemas/kids-activity.schema.js';
import { isQuestionForm, normalizeLevelToGameShape, resolveLevelMechanic, parseContent } from '../../../shared/kids-question-bridge.js';
import { decryptSecret } from '../AIConfigService.js';
import { AppError } from '../../../shared/errors.js';
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
    // Image, audio and embedding models cannot answer with a JSON level array,
    // so offering them in the picker would only produce a generation error.
    return configs.filter(c => KidsAIService.#isTextModel(c)).map(c => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      model_id: c.model_id,
      is_default: c.is_default,
      is_personal: c.owner_id != null,
    }));
  }

  /**
   * Main pipeline to generate a Kids educational activity.
   *
   * The teacher reviews the result before saving, so a request can be scoped:
   * `keepLevels` are levels the teacher already approved and must survive
   * untouched, and only `regenerateCount` fresh levels are asked of the model.
   * A level the model returns in the wrong shape is reported and dropped rather
   * than quietly replaced with generic content.
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

    // Levels the teacher kept from a previous round trip through this wizard.
    const keepLevels = Array.isArray(params.keep_levels) ? params.keep_levels : [];
    // `count` is the number of slots the activity must end up with, so a
    // selective regeneration only asks the model for the shortfall.
    const requestedCount = Math.max(1, Number(count) || 8);
    const shortfall = Math.max(1, requestedCount - keepLevels.length);
    const generateCount = keepLevels.length ? shortfall : requestedCount;

    // 1. Choose game template if not provided or set to 'auto'
    let selectedTemplateId = params.game_template;
    let selectedTemplate = null;

    if (!selectedTemplateId || selectedTemplateId === 'auto') {
      const best = this.selector.selectBest({
        subject,
        grade,
        age_min,
        age_max,
        objective: params.objective,
        difficulty,
        count: requestedCount,
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

    if (!aiConfig && !process.env.AI_API_KEY) {
      throw new AppError(
        'AI_NOT_CONFIGURED',
        'No AI model is configured for your school. Ask an administrator to add one in AI settings, then try again.',
        503,
      );
    }

    // 3. Prompt generation and LLM call
    let objective = params.objective;
    if (!objective || objective.trim().length === 0) {
      objective = `Apprendre et s'entraîner sur ${sub_topic || subject} niveau ${grade}`;
    }
    const prompt = this.#buildPedagogicalPrompt(selectedTemplateId, {
      subject,
      sub_topic,
      grade,
      age_min,
      age_max,
      objective,
      difficulty,
      count: generateCount,
      language,
      title: params.title,
      description: params.description,
      theme,
    });

    let rawGeneratedLevels;
    try {
      const responseText = await this.#callLLM(aiConfig, prompt);
      rawGeneratedLevels = this.#parseAndHealJSON(responseText);
      if (rawGeneratedLevels.length === 0) throw new Error('Model returned no JSON level array');
    } catch (err) {
      this.logger.error('Kids LLM generation failed', err);
      const reason = err?.message || 'unknown provider error';
      const isQuota = /429|quota|rate limit|resource_exhausted/i.test(reason);
      throw new AppError(
        isQuota ? 'AI_QUOTA_EXCEEDED' : 'AI_GENERATION_FAILED',
        isQuota
          ? `The selected model is out of quota or rate limited, so no levels were generated. Details: ${reason.slice(0, 200)}`
          : `The selected model could not generate levels. Details: ${reason.slice(0, 200)}`,
        502,
      );
    }

    // 4. Validate each level with Zod. A level in the wrong shape is dropped and
    //    reported: the teacher decides whether to regenerate it.
    const isNarrativeTemplate = selectedTemplate.category !== 'core';
    const generated = [];
    const rejected = [];
    for (let i = 0; i < rawGeneratedLevels.length; i++) {
      const rawLevel = rawGeneratedLevels[i];
      try {
        const coreMechanic = rawLevel.mechanic || rawLevel.baseMechanic || 'multiple_choice';
        // A core game is asked for as a question in the Questions-tab shape, and
        // the shared bridge builds the playable content from it. A model that
        // still wraps its answer in "content" is read exactly as before, so a
        // level that used to import keeps importing.
        const flat = isQuestionForm(rawLevel);
        const shaped = flat
          ? normalizeLevelToGameShape(
            { ...rawLevel, level_type: isNarrativeTemplate ? (rawLevel.level_type || selectedTemplateId) : selectedTemplateId },
            { language },
          )
          : null;
        const mechanicUsed = flat
          ? resolveLevelMechanic(shaped)
          : (isNarrativeTemplate ? coreMechanic : selectedTemplateId);
        const content = flat ? parseContent(shaped.content_json) : (rawLevel.content || rawLevel);
        const validatedCore = validateLevelContent(mechanicUsed, content);
        const finalContent = isNarrativeTemplate
          ? { ...validatedCore, mechanic: mechanicUsed, worldText: rawLevel.worldText || this.#worldText(selectedTemplateId, language) }
          : validatedCore;
        generated.push({
          level_type: selectedTemplateId,
          content_json: typeof finalContent === 'string' ? finalContent : JSON.stringify(finalContent),
          points: rawLevel.points || 10,
          hint: rawLevel.hint || this.#defaultText('hint', language),
          explanation: rawLevel.explanation || this.#defaultText('explanation', language),
          narrative_json: rawLevel.narrative ? JSON.stringify(rawLevel.narrative) : null,
        });
      } catch (validationErr) {
        rejected.push({ index: i, reason: validationErr.message });
        this.logger.warn(`Level #${i + 1} validation failed, dropping it:`, validationErr.message);
      }
    }

    if (generated.length === 0) {
      throw new AppError(
        'AI_LEVELS_INVALID',
        `The model returned ${rejected.length} level(s) but none matched the "${selectedTemplateId}" format, so nothing was generated. Try "Regenerate all", or pick levels from the question bank instead.`,
        502,
      );
    }

    // Kept levels come first so their order and saved ids survive.
    const kept = keepLevels.map(l => ({
      id: l.id,
      level_type: l.level_type || selectedTemplateId,
      content_json: typeof l.content_json === 'string' ? l.content_json : JSON.stringify(l.content_json || {}),
      points: l.points ?? 10,
      hint: l.hint ?? null,
      explanation: l.explanation ?? null,
      media_url: l.media_url ?? null,
      question_id: l.question_id ?? null,
    }));
    const levels = [...kept, ...generated].map((l, i) => ({ ...l, order_index: i }));

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
      levels,
      // The wizard shows which levels came from the model and which came back
      // malformed, so a single level can be regenerated on its own.
      source: 'ai',
      rejected_levels: rejected,
      generated_count: generated.length,
      kept_count: kept.length,
      model: aiConfig
        ? { id: aiConfig.id, name: aiConfig.name, provider: aiConfig.provider, model_id: aiConfig.model_id }
        : { id: null, name: 'School default model', provider: 'internal', model_id: null },
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
    // A mechanic that the Questions tab also has is asked for in that tab's
    // shape, so one prompt produces questions that are the same thing whether
    // they come from here, from a teacher's own assistant, or from the bank.
    // The shared bridge turns the answer into playable content.
    const questionExamples = {
      multiple_choice: `[
  {
    "type": "mcq",
    "text": "Quel est le résultat de 4 + 3 ?",
    "options": ["6", "7", "8"],
    "answer": "7",
    "hint": "Tu peux compter sur tes doigts !",
    "explanation": "4 + 3 font bien 7."
  }
]`,
      word_order: `[
  {
    "type": "order",
    "text": "Remets les lettres dans le bon ordre pour former le mot.",
    "answer": "CHAT",
    "hint": "C'est un petit animal qui miaule !",
    "explanation": "Le mot est C-H-A-T."
  }
]`,
      drag_drop: `[
  {
    "type": "fill-blank",
    "text": "Le ___ brille dans le ciel.",
    "options": ["soleil", "poisson"],
    "answer": "soleil",
    "hint": "Regarde ce qui éclaire la Terre.",
    "explanation": "C'est le soleil qui brille."
  }
]`,
      matching: `[
  {
    "type": "matching",
    "text": "Relie chaque animal à son cri.",
    "options": [["Chien", "Ouah"], ["Chat", "Miaou"]],
    "hint": "Écoute bien chaque cri.",
    "explanation": "Le chien fait ouah et le chat miaou."
  }
]`,
    };

    // Multiple choice may also be asked as true/false. It is a question type, not
    // a tenth mechanic, so it arrives as the same shape with a different "type"
    // and no options: the game shows the two answers as two options.
    const questionVariants = {
      multiple_choice: [
        {
          note: 'A level may also be asked as true/false. Keep every other field the same, change "type" to "true-false" and "answer" to "true" or "false", and leave out "options": the game shows the two answers as two options.',
          level: { type: 'true-false', text: 'Le soleil est une étoile.', answer: 'true', hint: 'Pense à ce qui illumine le jour.', explanation: 'Oui, le soleil est une étoile.' },
        },
      ],
    };

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
      memory: `[
  {
    "content": {
      "instruction": "Retouve les deux cartes qui vont ensemble !",
      "cards": [
        { "id": "c1", "matchId": "m1", "value": "Chien", "emoji": "🐶", "type": "emoji" },
        { "id": "c2", "matchId": "m2", "value": "Chiot", "emoji": "🐕", "type": "emoji" },
        { "id": "c3", "matchId": "m1", "value": "Chien", "emoji": "🐩", "type": "emoji" },
        { "id": "c4", "matchId": "m2", "value": "Chiot", "emoji": "🐕", "type": "emoji" }
      ]
    },
    "hint": "Cherche les cartes qui montrent le même animal.",
    "explanation": "c1 et c3 vont ensemble, c2 et c4 aussi."
  }
]`,
      find_correct: `[
  {
    "content": {
      "instruction": "Trouve la seule image qui est bien un animal !",
      "question": "Laquelle de ces images est un animal de la ferme ?",
      "emoji": "🚜",
      "items": [
        { "id": "i1", "value": "La vache", "emoji": "🐄" },
        { "id": "i2", "value": "La voiture", "emoji": "🚗" },
        { "id": "i3", "value": "Le pain", "emoji": "🍞" }
      ],
      "correctId": "i1"
    },
    "hint": "Un animal de la ferme habite à la ferme.",
    "explanation": "La vache est un animal de la ferme."
  }
]`,
    };

    const specificExample = schemasExample[templateId] || schemasExample.multiple_choice;
    const template = GameTemplateRegistry.getById(templateId);
    const isNarrative = !!template && template.category !== 'core';
    // A core game plays one mechanic and nothing else, so it is sent that one
    // shape. An adventure shell wraps a mechanic per level, so it is sent them
    // all and each level names its own "mechanic".
    const questionForm = !isNarrative && !!questionExamples[templateId];
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
        written_as: questionForm
          ? 'a question in the Questions-tab shape, as in the example: the game builds the level from it'
          : (isNarrative ? 'a content object nested in "content"' : 'a content object nested in "content"'),
      },
      output: {
        level_count: p.count,
        shape: 'strict JSON array, no markdown fences, no prose',
        level_fields: questionForm
          // The Questions-tab shape: no level_type, no content_json, no ids.
          ? ['type', 'text', 'options', 'answer', 'points', 'hint', 'explanation']
          : ['content', 'points', 'hint', 'explanation', ...(isNarrative ? ['mechanic', 'worldText'] : [])],
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

    // A core game plays one mechanic and nothing else, so it is sent that one
    // shape. An adventure shell wraps a mechanic per level, so it is sent them
    // all and each level names its own "mechanic".
    const examples = {};
    if (questionForm) {
      examples[templateId] = JSON.parse(questionExamples[templateId]);
      if (questionVariants[templateId]) examples[`${templateId} — other forms`] = questionVariants[templateId];
    } else {
      for (const id of Object.keys(schemasExample)) {
        if (isNarrative || id === templateId) {
          examples[id] = JSON.parse(schemasExample[id]);
        }
      }
      // The shape for the template that was actually requested is always sent,
      // even if a future template is missing from the list above: without it the
      // model has nothing to copy and its levels get rejected as malformed.
      if (examples[templateId] === undefined) {
        examples[templateId] = JSON.parse(specificExample);
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
      if (chosen) {
        if (!KidsAIService.#isTextModel(chosen)) {
          throw new AppError(
            'AI_MODEL_NOT_TEXT',
            `"${chosen.name}" cannot write text levels. Pick a chat or completion model in AI settings.`,
            400,
          );
        }
        return chosen;
      }
      this.logger.warn(`Requested AI config ${configId} is unavailable for this school, using the school default`);
    }

    // Personal config first, then the school default, then whatever else is
    // configured: AIConfig has no is_active column and local installs often have
    // no row flagged is_default, so picking "any" keeps generation working.
    const candidates = await prisma.aIConfig.findMany({
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
        { name: 'asc' },
      ],
    });
    const usable = candidates.find(c => KidsAIService.#isTextModel(c));
    if (!usable && candidates.length > 0) {
      throw new AppError(
        'AI_NOT_CONFIGURED',
        'The AI models configured for your school cannot write text levels. Add a chat or completion model in AI settings.',
        503,
      );
    }
    return usable || null;
  }

  /**
   * `AIConfig` stores no capability flag, so the model id is the only signal
   * available. These families answer with pixels, audio or vectors rather than a
   * JSON level array, and a request sent to one comes back empty.
   */
  static #isTextModel(config) {
    const id = String(config?.model_id || '').toLowerCase();
    if (!id) return false;
    return !/(^|[-_/])(image|imagen|vision|tts|stt|whisper|embedding|embed|moderation|audio|video|rerank|ocr|search)([-_/]|$)/.test(id)
      && !id.startsWith('text-embedding')
      && !id.includes('image-generation');
  }

}

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

