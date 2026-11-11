/**
 * src/backend/services/AIService.js
 *
 * AI-powered question generation via any OpenAI-compatible LLM API.
 * Supports configurable provider, model, and API key through environment:
 *   AI_PROVIDER=openai|anthropic|ollama
 *   AI_API_KEY=sk-...
 *   AI_MODEL=gpt-4o-mini
 *
 * Endpoint:
 *   - generateQuestions({ topic, count, type, difficulty, schoolId })
 *   - generateFromText({ text, count, type })
 */

import { config } from '../config.js';
import { logger } from '../logger.js';
import { ValidationError, AppError } from '../../shared/errors.js';
import { PrepSheetDataSchema, ExerciseDataSchema } from '../../shared/schemas/course.schema.js';
import { QUESTION_TYPES, DIFFICULTY } from '../../shared/constants.js';
import { lessonSectionLabels } from '../../shared/lessonSections.js';

const typeValues = Object.values(QUESTION_TYPES);
const diffValues = Object.values(DIFFICULTY);

/**
 * Question types whose editor modal supports image options. When one of these
 * is generated, the LLM is asked to describe each option as an image prompt;
 * ImageGenService then turns those prompts into real pictures (or the question
 * falls back to plain text options).
 */
export const IMAGE_CAPABLE_TYPES = ['multiple-choice', 'multiple-choice-multi', 'odd-one-out', 'draggable'];

// Models that ONLY produce images (Nano Banana, Google image models, GPT-image,
// DALL·E, Flux, …). They cannot write text questions — calling them on the
// chat/generate endpoint fails, so we refuse up-front with a clear message.
const IMAGE_ONLY_MODEL_HINTS = [
  'nanobanana', // Nano Banana (any spacing/dashes normalized away)
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.5-flash-image',
  'gpt-image', 'dall-e', 'dall.e',
  'imagen', 'flux', 'sdxl', 'stable-diffusion',
  'midjourney', 'edgen', 'ideogram', 'firefly', 'recraft',
];

/** Whether a model id looks like an image-generation-only model. */
export function isImageOnlyModel(modelId) {
  const m = String(modelId || '').toLowerCase().replace(/[\s_-]+/g, '');
  return IMAGE_ONLY_MODEL_HINTS.some((hint) => m.includes(String(hint).replace(/[\s_-]+/g, '')));
}

/** Friendly run-time validator — tells which model to actually pick. */
export function modelCapabilityLabel(cfg) {
  const model = String(cfg?.model_id || '');
  if (isImageOnlyModel(model)) return 'image-only';
  if (String(cfg?.provider || '').toLowerCase() === 'openai' || String(cfg?.provider || '').toLowerCase() === 'openrouter') {
    return 'images-and-text';
  }
  return 'text';
}

/**
 * When the user picks an image-generation-only model (Nano Banana, GPT-Image,
 * …), that model cannot WRITE questions — so the question TEXT is written by a
 * text-capable sibling from the same provider using the same API key, and the
 * image model is used later to render the plain option IMAGES. This is what
 * makes "images as options + question text" work for image-output models.
 */
const IMAGE_ONLY_TEXT_SIBLINGS = {
  google: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
};

/**
 * Text model that will write the questions when an image-only model is
 * selected. `AI_IMAGE_QUESTION_MODEL` overrides the per-provider default.
 * Returns null for providers we cannot pair (no reliable text model).
 */
export function textSiblingModel(config) {
  const envModel = String(process.env.AI_IMAGE_QUESTION_MODEL || '').trim();
  if (envModel) return envModel;
  const provider = String(config?.provider || '').toLowerCase();
  return IMAGE_ONLY_TEXT_SIBLINGS[provider] || null;
}

export class AIService {
  #repo;
  #logger;

  constructor(repo, loggerInstance) {
    this.#repo = repo;
    this.#logger = loggerInstance || logger;
  }

  /**
   * Generate questions via LLM about a given topic.
   * @param {object} params
   * @param {string}  params.topic
   * @param {number}  params.count     - how many questions (1-20)
   * @param {string}  params.type      - QUESTION_TYPES value
   * @param {string}  params.difficulty - DIFFICULTY value
   * @param {string}  [params.schoolId=null]
   * @returns {Promise<Array<{ text, type, answer, options_json, difficulty, explanation, points }>>}
   */
  async generateQuestions({ topic, count, type, difficulty, schoolId = null }) {
    if (!topic || !topic.trim()) throw new ValidationError({ topic: ['Topic is required'] });
    if (!count || count < 1 || count > 20) throw new ValidationError({ count: ['Count must be 1-20'] });
    if (type && !typeValues.includes(type)) throw new ValidationError({ type: [`Invalid type: ${type}`] });
    if (difficulty && difficulty !== 'mixed' && !diffValues.includes(difficulty)) throw new ValidationError({ difficulty: [`Invalid difficulty: ${difficulty}`] });

    const prompt = this.#buildPrompt({ topic, count: Math.min(count, 20), type, difficulty });
    const raw = await this.#callLLM(prompt);
    const parsed = this.#parseResponse(raw, type || 'mcq', difficulty === 'mixed' ? 'medium' : (difficulty || 'medium'));
    return parsed;
  }

  /**
   * Extract questions from a provided text block.
   * @param {object} params
   * @param {string}  params.text   - source text to extract questions from
   * @param {number}  params.count
   * @param {string}  params.type
   * @returns {Promise<Array>}
   */
  async generateFromText({ text, count, type }) {
    if (!text || !text.trim()) throw new ValidationError({ text: ['Source text is required'] });
    if (!count || count < 1 || count > 20) throw new ValidationError({ count: ['Count must be 1-20'] });

    const prompt = `Based on the following text, generate ${count} ${type || 'mcq'} questions with answers.

TEXT:
"""${text.slice(0, 4000)}"""

Respond ONLY with a valid JSON array. Each object:
{ "text": "question text", "answer": "correct answer", "options": ["opt1","opt2","opt3","opt4"] (for MCQ), "explanation": "brief explanation" }`;
    const raw = await this.#callLLM(prompt);
    const parsed = this.#parseResponse(raw, type || 'mcq', 'medium');
    return parsed;
  }

  // ── Private ──────────────────────────────────────────────────────────────

  #buildPrompt({ topic, count, type, difficulty }) {
    const typeDesc = type || 'multiple choice (mcq)';
    const diffDesc = difficulty || 'medium difficulty';
    return `Generate ${count} ${typeDesc} questions about "${topic}" at ${diffDesc} difficulty.
Each question MUST have:
- "text": the question
- "answer": the correct answer
- "options": array of possible answers (for MCQ/true-false)
- "explanation": brief explanation of the correct answer

Respond ONLY with a valid JSON array. Example for MCQ:
[{ "text": "What is 2+2?", "answer": "4", "options": ["3","4","5","6"], "explanation": "Basic arithmetic" }]`;
  }

  async #callLLM(prompt) {
    const provider = process.env.AI_PROVIDER || 'openai';
    const apiKey = process.env.AI_API_KEY;
    const model = process.env.AI_MODEL || 'gpt-4o-mini';

    if (!apiKey && provider !== 'ollama') {
      this.#logger.warn('AI_API_KEY not set — returning mock questions');
      return this.#mockResponse(prompt);
    }

    const url = this.#getEndpoint(provider);
    const body = this.#getRequestBody(provider, model, prompt);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`LLM API error (${res.status}): ${errText.slice(0, 200)}`);
      }
      const data = await res.json();
      return this.#extractContent(provider, data);
    } catch (err) {
      this.#logger.error('LLM API call failed', err);
      this.#logger.warn('Falling back to mock questions');
      return this.#mockResponse(prompt);
    }
  }

  #getEndpoint(provider) {
    switch (provider) {
      case 'anthropic': return 'https://api.anthropic.com/v1/messages';
      case 'ollama': return process.env.AI_OLLAMA_URL || 'http://localhost:11434/api/generate';
      case 'openai':
      default: return 'https://api.openai.com/v1/chat/completions';
    }
  }

  #getRequestBody(provider, model, prompt) {
    switch (provider) {
      case 'anthropic':
        return { model: model || 'claude-3-haiku-20240307', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] };
      case 'ollama':
        return { model: model || 'llama3', prompt, stream: false };
      case 'openai':
      default:
        return { model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 2000 };
    }
  }

  #extractContent(provider, data) {
    switch (provider) {
      case 'anthropic': return data.content?.[0]?.text || '';
      case 'ollama': return data.response || '';
      case 'openai':
      default: return data.choices?.[0]?.message?.content || '';
    }
  }

  #parseResponse(raw, defaultType, defaultDifficulty) {
    // Try to extract JSON from the response (handle markdown wrapping)
    let jsonStr = raw.trim();
    const jsonMatch = jsonStr.match(/\[\s*\{.*\}\s*\]/s);
    if (jsonMatch) jsonStr = jsonMatch[0];

    try {
      const questions = JSON.parse(jsonStr);
      if (!Array.isArray(questions)) throw new Error('Not an array');
      return questions.map((q, i) => ({
        text: q.text || `Question ${i + 1}`,
        type: defaultType,
        answer: q.answer || '',
        options_json: q.options ? JSON.stringify(q.options) : null,
        difficulty: defaultDifficulty,
        explanation: q.explanation || null,
        points: q.points || 1,
        tags: q.tags || null,
      }));
    } catch (err) {
      this.#logger.error('Failed to parse LLM response', { raw: raw.slice(0, 200), error: err.message });
      return this.#mockResponse(defaultType, defaultDifficulty);
    }
  }

  #mockResponse(type, difficulty, count = 3) {
    const mockQuestions = [
      { text: `What is the capital of France?`, answer: 'Paris', options: ['London','Paris','Berlin','Madrid'] },
      { text: `Which planet is known as the Red Planet?`, answer: 'Mars', options: ['Venus','Mars','Jupiter','Saturn'] },
      { text: `What is 2 + 2?`, answer: '4', options: ['3','4','5','6'] },
      { text: `Who wrote Romeo and Juliet?`, answer: 'William Shakespeare', options: ['Charles Dickens','William Shakespeare','Jane Austen','Mark Twain'] },
      { text: `What is the chemical symbol for water?`, answer: 'H2O', options: ['CO2','H2O','NaCl','O2'] },
    ];
    return mockQuestions.slice(0, Math.min(count || 3, 5)).map(q => ({
      text: q.text,
      type: type || 'mcq',
      answer: q.answer,
      options_json: JSON.stringify(q.options),
      difficulty: difficulty || 'medium',
      explanation: null,
      points: 1,
      tags: null,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Structured generation with explicit provider configs (AIConfig / custom).
  // This is the surface used by the Settings → AI Generation UI: generation
  // runs SERVER-SIDE with the stored (encrypted) key, so keys never reach
  // any browser and provider calls are not blocked by the app's CSP.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build the full structured prompt for the app's question types — the exact
   * format importSelectedAIQuestions() / normalizeImportedAIQuestion() accept,
   * so generated output imports with zero manual fixing. Also served verbatim
   * by POST /api/v1/ai/prompt for keyless users to paste into ChatGPT/Claude.
   *
   * Supported legacy type ids (the admin UI vocabulary):
   *   multiple-choice, multiple-choice-multi, true-false, odd-one-out,
   *   draggable, matching-pairs, fill-blank, code
   */
  buildStructurePrompt({ topic, typeCounts = {}, difficulty = 'medium', points = 1, language = 'English', imageOptions = true }) {
    const typeSpecs = {
      'multiple-choice': '"options" = array of 4 plausible strings; "answer" = the exact correct option string',
      'multiple-choice-multi': '"options" = array of 4-6 strings; "answer" = correct options joined with " | " (pipe-separated)',
      'true-false': '"options" = ["true","false"]; "answer" = "true" or "false"',
      'odd-one-out': '"options" = array of 4 strings where exactly one does not belong; "answer" = the odd one',
      'draggable': '"options" = array of 4-6 strings in the CORRECT order; "answer" = the same strings joined with "," (comma-separated, correct order)',
      'matching-pairs': '"options" = array of "left-->right" pair strings; "answer" = the pairs joined with "|" (e.g. "A-->1|B-->2")',
      'fill-blank': '"question" contains "___" (three underscores) for each blank; "options" = a word bank with the correct words plus 1-2 plausible distractors; "answer" = "1:word|2:word" where the numbers match the blanks left to right',
      'code': '"question" contains the code snippet; "answer" = the expected output/value; optional "language" and "answerMode" ("text"|"options")',
    };

    // Image-option specs for the question types whose editor supports pictures.
    // The LLM cannot paint, so each option is described as a generation prompt;
    // the server turns those prompts into real images (ImageGenService).
    const imageTypeSpecs = {
      'multiple-choice': '"options" = array of 4 OBJECTS { "label": "short unique keyword naming the option", "image": "detailed image-generation prompt uniquely depicting that option" }; "answer" = the LABEL of the correct option',
      'multiple-choice-multi': '"options" = array of 4-6 OBJECTS { "label", "image" }; "answer" = correct option LABELS joined with " | " (pipe-separated)',
      'odd-one-out': '"options" = array of 4 OBJECTS { "label", "image" } where exactly one does not belong; "answer" = the LABEL of the odd one',
      'draggable': '"options" = array of 4-6 OBJECTS { "label", "image" } in the CORRECT order; "answer" = the LABELS in correct order joined with "," (comma-separated)',
    };

    const IMAGE_SET = new Set(IMAGE_CAPABLE_TYPES);
    const typeSpec = (t) =>
      imageOptions && IMAGE_SET.has(t) ? imageTypeSpecs[t] : typeSpecs[t];

    const requested = Object.entries(typeCounts || {})
      .filter(([, n]) => Number(n) > 0)
      .map(([t, n]) => `- ${n} × ${t}${typeSpec(t) ? ` — ${typeSpec(t)}` : ''}`);

    if (!requested.length) {
      requested.push(`- 5 × multiple-choice — ${typeSpec('multiple-choice')}`);
    }

    const isMixed = difficulty === 'mixed';
    const diffLabel = isMixed
      ? 'Mixed — produce a balanced spread of easy, medium and hard questions'
      : difficulty;
    const diffField = isMixed
      ? '"difficulty": one of ["easy","medium","hard"] chosen per question (spread a balanced mix)'
      : `"difficulty": "${difficulty}"`;

    const imageRules = imageOptions
      ? `
- IMAGE-OPTION TYPES (${IMAGE_CAPABLE_TYPES.join(', ')}): "options" must be OBJECTS of the form { "label", "image" }. The "label" is a short UNIQUE keyword naming the option (the "answer" MUST be built from labels). The "image" value is a self-contained image-generation prompt for that option's picture — describe content, composition, style (photo, illustration, icon…), aspect ratio and a plain background; it must NOT contain readable text, letters, digits, watermarks or the answer itself. Each option's image must look clearly different from the others.
- Every "label" must be unique within its question.`
      : '';
    const optionsShape = imageOptions
      ? '"options": array (plain strings for text types, or { "label", "image" } objects for image-option types)'
      : '"options": string[]';
    const answerRule = imageOptions
      ? 'The "answer" MUST be copy-pasteable from the "options" array (exact label for image-option questions; except fill-blank / code).'
      : 'The "answer" MUST be copy-pasteable from the "options" array (except fill-blank / code).';
    const imageExample = imageOptions
      ? `

Example output (IMAGE options — only for ${IMAGE_CAPABLE_TYPES.join(', ')}):
[
  {
    "question": "Which fruit is red?",
    "type": "multiple-choice",
    "options": [
      { "label": "apple", "image": "studio photo of a shiny red apple on a plain white background, centered, no text" },
      { "label": "banana", "image": "studio photo of a yellow banana on a plain white background, centered, no text" },
      { "label": "cherry", "image": "studio photo of two bright red cherries on a plain white background, centered, no text" },
      { "label": "kiwi", "image": "studio photo of a sliced green kiwi on a plain white background, centered, no text" }
    ],
    "answer": "apple",
    "explanation": "The apple is the only red fruit.",
    "difficulty": "${isMixed ? 'easy' : difficulty}",
    "points": ${points}
  }
]`
      : '';

    return `You are a quiz-question generator for a school quiz app. Generate questions about the topic below.

TOPIC / SOURCE MATERIAL:
"""${String(topic || '').slice(0, 8000)}"""

REQUIRED QUESTIONS (exact counts):
${requested.join('\n')}

RULES:
- Difficulty: ${diffLabel}. Points per question: ${points}. Language: ${language}.
- Each question object MUST use EXACTLY these keys:
  { "question": string, "type": one of ["multiple-choice","multiple-choice-multi","true-false","odd-one-out","draggable","matching-pairs","fill-blank","code"], ${optionsShape}, "answer": string, "explanation": string, ${diffField}, "points": ${points} }
- ${answerRule}${imageRules}
- No numbering, no markdown, no commentary — respond with ONE valid JSON array of question objects and NOTHING else.

Example output (text options):
[
  {
    "question": "What is the result of 12 × 12?",
    "type": "multiple-choice",
    "options": ["124", "144", "156", "132"],
    "answer": "144",
    "explanation": "12 × 12 = 144.",
    "difficulty": "${isMixed ? 'medium' : difficulty}",
    "points": ${points}
  }
]${imageExample}`;
  }

  /**
   * Generate questions using an explicit provider config (from AIConfig rows
   * or a teacher's custom entry). Returns legacy-shape question objects.
   */
  async generateWithProvider(config, params) {
    if (!config?.model_id) throw new ValidationError({ model_id: ['No model selected'] });
    // Image-generation-only models (Nano Banana, GPT-Image, …) cannot write
    // text questions. Pair them with a text-capable sibling from the same
    // provider/key: the sibling writes the question text, the image model
    // renders the option pictures. The original image model is carried on the
    // config so ImageGenService later generates the option images with it.
    if (isImageOnlyModel(config.model_id)) {
      const sibling = textSiblingModel(config);
      if (!sibling) {
        throw new AppError(
          'AI_MODEL_UNSUPPORTED',
          `"${config.model_id}" is an image-generation-only model and provider "${config.provider || '?'}" has no text-capable sibling to write the questions with. Pick a text-capable model.`,
          422,
        );
      }
      config._imageOnlyOriginalModel = config.model_id;
      this.#logger.info('Image-only model auto-paired with a text sibling', {
        imageModel: config._imageOnlyOriginalModel,
        textModel: sibling,
        provider: config.provider,
      });
      config.model_id = sibling;
    }
    const prompt = this.buildStructurePrompt(params);
    const raw = await this.#callProvider(config, prompt);
    const questions = this.#parseStructuredQuestions(raw);
    return questions;
  }

  /**
   * Generate a course outline (lesson skeleton) from a teacher's category
   * branch. `plan` is the server-derived list of leaf categories with
   * questions: [{ categoryId, path, questionCount }]. One lesson per row,
   * in the given order; the model only writes title + summary and must
   * echo categoryId back.
   */
  async generateCourseOutline({ config, courseName, language = 'French', plan = [] }) {
    if (!config?.model_id) throw new ValidationError({ model_id: ['No model selected'] });
    if (!Array.isArray(plan) || plan.length === 0) {
      throw new ValidationError({ categoryId: ['This branch has no lessons to build from — add subcategories/axes with questions first.'] });
    }
    const prompt = this.#buildCourseOutlinePrompt({ courseName, language, plan });
    const raw = await this.#callProvider(config, prompt);
    const rows = this.#parseJsonArray(raw);
    // Trust the server-side plan for the category mapping: match by echoed
    // categoryId first, then fall back to positional order. A hallucinated
    // id must never point a lesson at a foreign category.
    const byId = new Map(plan.map((p) => [String(p.categoryId), p]));
    const lessonByCategory = new Map();
    rows.slice(0, plan.length).forEach((row, idx) => {
      const planned = byId.has(String(row.categoryId))
        ? byId.get(String(row.categoryId))
        : plan[idx];
      const title = String(row.title || '').trim();
      if (!title || !planned || lessonByCategory.has(String(planned.categoryId))) return;
      lessonByCategory.set(String(planned.categoryId), {
        title: title.slice(0, 300),
        summary: String(row.summary || '').trim().slice(0, 2000) || null,
        categoryId: String(planned.categoryId),
      });
    });
    const lessons = plan
      .map((planned) => lessonByCategory.get(String(planned.categoryId)))
      .filter(Boolean)
      .map((lesson, order_index) => ({ ...lesson, order_index }));
    if (!lessons.length) {
      throw new ValidationError({ response: ['The model did not return a parseable course outline — try again or pick a stronger model.'] });
    }
    return lessons;
  }

  /**
   * Generate the markdown body of one lesson from its category path and a
   * digest of the questions already filed there, so the taught content
   * matches what the student will be asked in practice.
   */
  async generateLessonContent({ config, language = 'French', lesson, categoryPath, questionDigest = [], includeQuestions = true }) {
    if (!config?.model_id) throw new ValidationError({ model_id: ['No model selected'] });
    const prompt = this.buildLessonContentPrompt({ language, lesson, categoryPath, questionDigest, includeQuestions });
    const raw = await this.#callProvider(config, prompt);
    const content = String(raw || '').trim()
      // Strip fences some models wrap markdown in despite instructions.
      .replace(/^```(?:markdown|md)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    if (!content) {
      throw new ValidationError({ response: ['The model returned no lesson content — try again.'] });
    }
    return content.slice(0, 50000);
  }

  #buildCourseOutlinePrompt({ courseName, language, plan }) {
    const lines = plan.map((p, i) =>
      `${i + 1}. categoryId: "${p.categoryId}" | path: "${p.path}" | existing questions: ${p.questionCount}`);
    return `You are a course designer for a school platform. Build the lesson outline of the course "${courseName}" from its module/chapter plan below. Each plan row becomes EXACTLY ONE lesson, in the same order.

MODULE / CHAPTER PLAN (one row = one lesson):
${lines.join('\n')}

RULES:
1. Respond with ONE valid JSON array and NOTHING else (no markdown fences, no commentary).
2. Each object: { "categoryId": string (copied EXACTLY from the plan row), "title": string, "summary": string }.
3. Titles are short lesson names; summaries are 1-3 sentences telling what the lesson covers.
4. Language: ${language}.
5. Array length must equal the plan length (${plan.length}).

Example:
[{ "categoryId": "abc", "title": "Introduction", "summary": "Ce cours presente..." }]`;
  }

  // Lesson-section headings rendered into the document by courseDocumentRenderer
  // are inserted verbatim, so we localize them here. The renderer never
  // depends on the English label — it treats every `##` as a generic
  // subheading — but the reader expects a French course to read "Objectifs",
  // not "Objectives". The table lives in src/shared/lessonSections.js so the
  // student chapter page can extract the same headings.
  buildLessonContentPrompt({ language = 'French', lesson, categoryPath, questionDigest = [], includeQuestions = true }) {
    const digest = questionDigest.length
      ? `QUESTIONS THE STUDENTS WILL PRACTICE AFTER THIS LESSON (your content must teach what these ask):\n${questionDigest.slice(0, 30).map((t) => `- ${t}`).join('\n')}`
      : '';
    const [
      secIntro,
      secObjectives,
      secKeyConcepts,
      secDefinition,
      secExplanation,
      secExamples,
      secMistakes,
      secCheck,
    ] = lessonSectionLabels(language);
    const withCheck = includeQuestions && questionDigest.length;
    const sections = [
      `## ${secIntro}`,
      `## ${secObjectives}`,
      `## ${secKeyConcepts}`,
      `## ${secDefinition}`,
      `## ${secExplanation}`,
      `## ${secExamples}`,
      `## ${secMistakes}`,
      ...(withCheck ? [`## ${secCheck}`] : []),
    ].join('\n   ');
    return `You are a teacher writing the body of ONE lesson inside a larger course. The document renderer will place this lesson under its own unnumbered module/chapter heading, so write ONLY the lesson body — no wrapper title, no breadcrumb, no metadata block.

TARGET LANGUAGE: ${language}. ALL output (headings, prose, examples, list items) must be in ${language}. Never leave a section heading in English.

COURSE: ${lesson.course_name || ''}
LESSON TITLE (already shown as the heading by the renderer — do NOT repeat it): ${lesson.title}
LESSON SUMMARY: ${lesson.summary || '(none)'}
QUIZ CATEGORY PATH (context only — do NOT reprint it in the body): ${categoryPath}
${digest}

RULES:
1. Output clean Markdown body content only. No HTML, no code fences (\`\`\`), no JSON, no commentary before or after.
2. Do NOT hand-number sections or paragraphs (no "1.", "I.", "a)" before a heading). The app applies the document numeration template; anything you write on top of it will duplicate.
3. Do NOT repeat the lesson title as the first line, and do NOT add a document heading like "Course material", "Leçon", "Lesson" or a category breadcrumb — the renderer already shows those.
4. Do NOT restate the title inside a section (never write something like "## Définition — Information en informatique : L'information en informatique désigne..."). Assume the reader just read the title; open directly with the substance.
5. Use exactly these top-level sections, in this order, and translate them verbatim into ${language} if they are not already in that language:
   ${sections}
6. Put real teaching content under each heading. Paragraphs, bullet lists, inline \`code\`, and short worked examples only. No answer keys, no "réponses" list.
7. "${secIntro}" is 2-3 sentences that connect the lesson to what came before and announce what the student will be able to do. "${secObjectives}" is 2-4 short bullet items using observable verbs (identifier, appliquer, analyser...). "${secKeyConcepts}" is a compact definition list of the vocabulary the practice questions will use. Keep introduction, objectives and key concepts tight — they must fit on the same page as the chapter heading.
8. "${secDefinition}" defines the lesson's central term precisely in 1-2 short paragraphs; "${secExplanation}" develops the mechanism step by step; "${secExamples}" gives at least two concrete worked examples; "${secMistakes}" lists 2-3 pitfalls and how to avoid each.
9. Teach what is assessed: your explanation must cover every fact, term or operation the practice-question digest below expects. Do not invent facts outside the topic.
10. Keep the body roughly 400-700 words. Prefer density over decoration.${withCheck
      ? `\n11. Under "${secCheck}", invite the student to run the attached practice questions without revealing any answer (one or two sentences is enough).`
      : `\n11. Do NOT add a "${secCheck}" section: no practice questions are attached to this lesson.`} `;
  }

  /** Repair-and-parse a JSON array of objects from raw model output. */
  #parseJsonArray(raw) {
    let text = String(raw || '').trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '');
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) text = arrayMatch[0];
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.filter((o) => o && typeof o === 'object');
      if (Array.isArray(parsed?.lessons)) return parsed.lessons;
    } catch {
      const blocks = text.match(/\{[^{}]*\}/g) || [];
      const rows = blocks.map((b) => { try { return JSON.parse(b); } catch { return null; } }).filter(Boolean);
      if (rows.length) return rows;
    }
    throw new ValidationError({ response: ['The model did not return parseable JSON — try again or pick a stronger model.'] });
  }

  /** Extract one JSON object from raw model output (fences, prose around it). */
  #parseJsonObject(raw) {
    let text = String(raw || '').trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) text = text.slice(start, end + 1);
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ValidationError({ response: ['Expected a single JSON object.'] });
    }
    return parsed;
  }

  /**
   * Generate the pedagogical preparation sheet of one lesson: the model first
   * plans the session split, then writes one detailed sheet per session. The
   * tolerant PrepSheetDataSchema normalizes the JSON; the Session Distribution
   * table is recomputed server-side from `sessions` (never trusted from AI).
   */
  async generateLessonPrepSheet({ config, language = 'French', sessionMinutes = 55, lesson, categoryPath = '' }) {
    if (!config?.model_id) throw new ValidationError({ model_id: ['No model selected'] });
    const prompt = this.buildLessonPrepSheetPrompt({ language, sessionMinutes, lesson, categoryPath });
    let lastError = null;
    // One retry: models occasionally emit one stray comma or unescaped quote.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await this.#callProvider(config, prompt);
      try {
        const parsed = PrepSheetDataSchema.parse(this.#parseJsonObject(raw));
        parsed.lessonTitle = String(lesson?.title || parsed.lessonTitle || '').slice(0, 300);
        parsed.language = language;
        parsed.sessionMinutes = sessionMinutes;
        parsed.generatedAt = new Date().toISOString();
        parsed.sessions = parsed.sessions.map((s, i) => ({ ...s, index: s.index || i + 1 }));
        return parsed;
      } catch (err) {
        lastError = err;
        logger?.warn?.({ err: err?.message }, 'prep-sheet: model returned unparseable JSON, retrying');
      }
    }
    throw new AppError(
      'AI_PROVIDER_ERROR',
      'The model did not return a valid preparation sheet JSON after two attempts — try again or pick a stronger model.',
      502,
    );
  }

  buildLessonPrepSheetPrompt({ language = 'French', sessionMinutes = 55, lesson, categoryPath = '' }) {
    const content = String(lesson?.content || '').slice(0, 24000);
    return `You are an expert in pedagogy, instructional design, and educational planning. From the lesson material below, produce a professional, practical LESSON PREPARATION SHEET that guides the teacher step by step through the teaching session(s).

LESSON TITLE: ${lesson?.title || ''}
LESSON SUMMARY: ${lesson?.summary || '(none)'}
POSITION IN THE COURSE STRUCTURE: ${categoryPath || '(none)'}
LESSON CONTENT (Markdown, the source material — preserve its academic accuracy, do not invent facts beyond it):
"""
${content || '(no written content — plan from the title and summary only, and mark uncertain fields "À compléter")'}
"""

STEP 1 — SESSION PLANNING. Analyze the whole material and decide how many teaching sessions of ${sessionMinutes} minutes are needed. One session per coherent, teachable chunk; do not force everything into one session and do not fragment unnecessarily. The total of every session's "estimatedMinutes" must equal (number of sessions x ${sessionMinutes}).

STEP 2 — ONE PREPARATION SHEET PER SESSION. Each sheet must cover: general information (module/chapter = course structure path, lesson title, type: introduction/apprentissage/pratique/révision/évaluation), a general objective and measurable specific objectives using action verbs, prerequisites, the lesson content in a logical teaching sequence (key concepts each with a heading and a body of definitions, explanations, examples), a DETAILED LESSON PLAN whose rows are chronological stages (introduction et motivation, rappel des prérequis, presentation des objectifs, découverte et explication, exemples et démonstration, activité pratique ou exercices, correction et discussion, synthèse et évaluation) with realistic durations that sum to the session length, and for EVERY row the three distinct dimensions: what the teacher does (teacherRole), what the students do (studentRole), and the expected learning outcome (expectedOutcome) — concrete actions and questions, never generic descriptions. Then: teaching methods, required materials, assessment tasks with evaluation criteria and expected answers, the key points students must remember, and homework when relevant. Each session builds logically on the previous one.

OUTPUT FORMAT — reply with ONE valid JSON object and NOTHING else (no markdown fences, no commentary):
{
  "sessions": [
    {
      "index": 1,
      "title": "short session title",
      "estimatedMinutes": ${sessionMinutes},
      "contentSummary": "what this session covers",
      "generalObjective": "what students achieve by the end",
      "specificObjectives": ["verifiable outcome with an action verb", ...],
      "prerequisites": ["knowledge or skill", ...],
      "keyConcepts": [{ "heading": "concept name", "body": "definition, explanation, examples" }, ...],
      "planRows": [{ "stage": "Introduction et motivation", "duration": "8 min", "activities": "content / activities", "teacherRole": "explains, asks, guides...", "studentRole": "observe, answer, practice...", "resources": "board, textbook page...", "expectedOutcome": "what students can do after" }, ...],
      "methods": ["démonstration, questionnement, travail en groupe...", ...],
      "materials": ["teaching materials", ...],
      "assessment": [{ "task": "short verification activity", "criteria": "how it is judged", "expectedAnswer": "" }, ...],
      "keyPoints": ["essential point to remember", ...],
      "homework": ["follow-up exercise", ...]
    }, ...
  ]
}

RULES:
1. Language of every value: ${language}. Keep standard JSON (double quotes, no trailing commas, no comments).
2. Never invent information missing from the material: use an empty string "" or "À compléter" instead.
3. planRows durations are strings like "10 min"; they must sum to that session's estimatedMinutes.
4. No "sessions" field with fewer than 1 entry; typical chapters need 2-6 sessions.
5. Do not wrap values in objects where arrays are expected; lists of strings stay plain strings (one idea per entry).`;
  }

  /**
   * Generate one practice EXERCISE for a lesson: a realistic situation the
   * student must solve by applying the lesson knowledge, shipped with a full
   * worked correction. Distinct from questions — no options, no grading: the
   * model returns the situation, the given data, the tasks and the solution,
   * normalized by the tolerant ExerciseDataSchema.
   */
  async generateLessonExercise({ config, language = 'French', difficulty = 'medium', lesson, categoryPath = '' }) {
    if (!config?.model_id) throw new ValidationError({ model_id: ['No model selected'] });
    const prompt = this.buildLessonExercisePrompt({ language, difficulty, lesson, categoryPath });
    let lastError = null;
    // One retry: models occasionally emit one stray comma or unescaped quote.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await this.#callProvider(config, prompt);
      try {
        const parsed = ExerciseDataSchema.parse(this.#parseJsonObject(raw));
        parsed.title = String(parsed.title || lesson?.title || 'Exercice').slice(0, 300);
        parsed.language = language;
        parsed.difficulty = difficulty;
        parsed.generatedAt = new Date().toISOString();
        return parsed;
      } catch (err) {
        lastError = err;
        logger?.warn?.({ err: err?.message }, 'exercise: model returned unparseable JSON, retrying');
      }
    }
    throw new AppError(
      'AI_PROVIDER_ERROR',
      'The model did not return a valid exercise JSON after two attempts — try again or pick a stronger model.',
      502,
    );
  }

  buildLessonExercisePrompt({ language = 'French', difficulty = 'medium', lesson, categoryPath = '' }) {
    const content = String(lesson?.content || '').slice(0, 24000);
    return `You are an expert teacher and assessment designer. Write ONE practice EXERCISE (a situation-problem) that lets a student apply the knowledge taught in the lesson below.

LESSON TITLE: ${lesson?.title || ''}
LESSON SUMMARY: ${lesson?.summary || '(none)'}
POSITION IN THE COURSE STRUCTURE: ${categoryPath || '(none)'}
DIFFICULTY: ${difficulty}
LESSON CONTENT (Markdown — the source of the knowledge to apply, do not invent facts beyond it):
"""
${content || '(no written content — build the exercise from the title and summary only)'}
"""

WHAT AN EXERCISE IS (critical): it is a SITUATION-PROBLEM, not a quiz question.
- Frame a realistic, meaningful scenario (school, family, shop, sports, science lab, community, ...) in which the student must use the lesson's knowledge and reasoning to solve a concrete problem.
- The student applies what they learned; the answer must NOT be a definition or a memorised fact.
- Provide every figure the student needs inside "givenData" — the student never needs an external document.
- Then ask 2 to 4 graded tasks that build up (understand -> apply -> justify), in order.
- Always give the complete correction: the reasoning steps in order, then the final answer.

OUTPUT FORMAT — reply with ONE valid JSON object and NOTHING else (no markdown fences, no commentary):
{
  "title": "short exercise title",
  "situation": "the realistic situation / scenario, 3-6 sentences, ending with the problem to solve",
  "givenData": ["a value, statement or constraint the student is given", ...],
  "tasks": [{ "prompt": "what the student must do (question or instruction)", "points": 2 }, ...],
  "solutionSteps": ["step 1 of the reasoning, with the intermediate result", ...],
  "finalAnswer": "the final result, clearly stated",
  "keyCompetencies": ["competency the student practises", ...]
}

RULES:
1. Language of every value: ${language}. Keep standard JSON (double quotes, no trailing commas, no comments).
2. Never invent knowledge missing from the material; invent only plausible DATA for the situation (numbers, names, units), never fake lesson facts.
3. 2 to 4 tasks; "points" is a small positive integer; solutionSteps must actually solve every task.
4. Keep every list entry a plain string (one idea per entry); only "tasks" holds objects.`;
  }

  /** Server-side provider call with per-provider request shapes + timeout. */
  async #callProvider(config, prompt) {
    const { provider, model_id: model, base_url: baseUrl, api_key: apiKey } = config;
    let url;
    let headers = { 'Content-Type': 'application/json' };
    let body;

    if (provider === 'anthropic') {
      url = baseUrl || 'https://api.anthropic.com/v1/messages';
      headers = { ...headers, 'x-api-key': apiKey || '', 'anthropic-version': '2023-06-01' };
      body = { model, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] };
    } else if (provider === 'google') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey || '')}`;
      body = { contents: [{ parts: [{ text: prompt }] }] };
    } else if (provider === 'custom') {
      if (!baseUrl) throw new ValidationError({ base_url: ['Base URL is required for custom providers'] });
      url = baseUrl;
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      body = { model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4000 };
    } else {
      // openrouter / openai / deepseek — all OpenAI-compatible
      const endpoints = {
        openrouter: 'https://openrouter.ai/api/v1/chat/completions',
        openai: 'https://api.openai.com/v1/chat/completions',
        deepseek: 'https://api.deepseek.com/v1/chat/completions',
      };
      url = baseUrl || endpoints[provider] || endpoints.openai;
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      body = { model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4000 };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Provider ${provider} responded ${res.status}: ${errText.slice(0, 300)}`);
      }
      const data = await res.json();
      if (provider === 'google') {
        return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      }
      if (provider === 'anthropic') {
        return data?.content?.[0]?.text || '';
      }
      return data?.choices?.[0]?.message?.content || '';
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Repair-and-parse the model output into legacy question shape. Tolerates
   * markdown fences, prose wrappers, and truncated arrays.
   */
  #parseStructuredQuestions(raw) {
    let text = String(raw || '').trim();

    // Strip markdown fences and leading prose.
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) text = arrayMatch[0];

    let rows = null;
    try {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : null;
    } catch {
      // Rescue mode: pull out individual {...} blocks.
      const blocks = text.match(/\{[^{}]*\}/g) || [];
      rows = blocks
        .map((b) => { try { return JSON.parse(b); } catch { return null; } })
        .filter((o) => o && (o.question || o.text));
    }

    if (!rows || !rows.length) {
      throw new ValidationError({ response: ['The model did not return parseable questions — try again or pick a stronger model.'] });
    }

    // Legacy type aliases → canonical UI ids.
    const TYPE_ALIASES = {
      mcq: 'multiple-choice', multiple_choice: 'multiple-choice',
      'multiple-choice': 'multiple-choice',
      'multiple-choice-multi': 'multiple-choice-multi', multi: 'multiple-choice-multi',
      'true-false': 'true-false', truefalse: 'true-false', boolean: 'true-false',
      'odd-one-out': 'odd-one-out', oddoneout: 'odd-one-out',
      'draggable': 'draggable', order: 'draggable', ordering: 'draggable',
      'matching-pairs': 'matching-pairs', matching: 'matching-pairs', match: 'matching-pairs',
      'fill-blank': 'fill-blank', fillblank: 'fill-blank', cloze: 'fill-blank',
      'code': 'code',
    };

    const IMAGE_SET = new Set(IMAGE_CAPABLE_TYPES);

    return rows.map((row) => {
      const rawType = String(row.type || 'multiple-choice').trim().toLowerCase();
      const type = TYPE_ALIASES[rawType] || 'multiple-choice';
      let options = row.options;
      if (typeof options === 'string') {
        options = options.split(',').map((s) => s.trim()).filter(Boolean);
      }
      let question = String(row.question || row.text || '').trim();
      let answer = String(row.answer || '').trim();

      // Image-option draft detection: for image-capable types the model was
      // asked for { label, image } objects where "image" is a generation
      // prompt. A question only becomes an image draft when EVERY option is a
      // well-formed object (label + prompt); otherwise it degrades to text.
      let imageDraft = null;
      if (IMAGE_SET.has(type) && Array.isArray(options) && options.length) {
        const objects = options.map((o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : null));
        const allObjects = objects.every(Boolean);
        const parsed = allObjects
          ? objects.map((o, idx) => ({
              label: String(o.label || o.text || o.name || o.value || '').trim(),
              prompt: String(o.image || o.imagePrompt || o.prompt || '').trim(),
              index: idx,
            }))
          : [];
        const allComplete = parsed.length === options.length && parsed.every((p) => p.label && p.prompt);
        if (allComplete) {
          imageDraft = parsed.map((p) => ({ label: p.label, image: p.prompt }));
          answer = this.#mapAnswerLabels(answer, imageDraft.map((o) => o.label), type);
        } else if (allObjects && parsed.every((p) => p.label)) {
          // Object-style options with no prompts → keep as plain text labels.
          options = parsed.map((p) => p.label);
        } else {
          options = options.map((o) =>
            typeof o === 'object' ? String(o.text || o.label || o.value || '') : String(o),
          );
        }
      }

      if (!imageDraft && type === 'fill-blank') {
        // Match the manual editor's structure: "___" blanks in the text and
        // a numbered "1:word|2:word" answer. Repair [[1]] / {{1}} / [blank]
        // placeholders and unnumbered word lists a model may still emit.
        question = question.replace(/\[\[\d+\]\]|\{\{\d+\}\}|\[blank\]/gi, '___');
        if (!/^\s*\d+\s*:/.test(answer)) {
          const parts = answer.split('|').map((s) => s.trim()).filter(Boolean);
          const words = parts.length > 1
            ? parts
            : answer.split(',').map((s) => s.trim()).filter(Boolean);
          answer = words.map((word, i) => `${i + 1}:${word}`).join('|');
        }
      }
      return {
        question,
        type,
        options: imageDraft
          ? imageDraft
          : Array.isArray(options)
            ? options.map((o) => (typeof o === 'object' ? String(o.text || o.value || '') : String(o)))
            : [],
        answer,
        explanation: String(row.explanation || '').trim() || '',
        difficulty: ['easy', 'medium', 'hard'].includes(String(row.difficulty).toLowerCase())
          ? String(row.difficulty).toLowerCase()
          : 'medium',
        points: Number(row.points) > 0 ? Math.min(Number(row.points), 100) : 1,
        language: row.language || undefined,
        answerMode: row.answerMode || undefined,
        codeSnippet: row.codeSnippet || undefined,
        ...(imageDraft ? { imageMode: true } : {}),
      };
    }).filter((q) => q.question && q.answer);
  }

  /**
   * Remap a model's answer onto option LABELS for an image draft. Accepts the
   * label itself, 1-based positions, letters and 0-based indices.
   */
  #mapAnswerLabels(answerRaw, labels, type) {
    const raw = String(answerRaw || '').trim();
    if (!raw) return raw;
    const mapToken = (token) => {
      const t = String(token || '').trim();
      const exact = labels.find((l) => l.toLowerCase() === t.toLowerCase());
      if (exact) return exact;
      const numeric = Number.parseInt(t, 10);
      if (Number.isFinite(numeric) && String(numeric) === t && numeric >= 1 && numeric <= labels.length) {
        return labels[numeric - 1];
      }
      const letter = t.match(/^([a-h])$/i);
      if (letter) {
        const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < labels.length) return labels[idx];
      }
      if (Number.isFinite(numeric) && String(numeric) === t && numeric >= 0 && numeric < labels.length) {
        return labels[numeric];
      }
      return t;
    };
    const tokens = type === 'draggable' ? raw.split(',') : raw.split(/[,|]/);
    const mapped = tokens.map(mapToken).filter(Boolean);
    if (type === 'draggable') return mapped.join(',');
    if (type === 'multiple-choice-multi') return mapped.join('|');
    return mapped[0] || raw;
  }
}
