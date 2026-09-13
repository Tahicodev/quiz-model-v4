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
import { ValidationError } from '../../shared/errors.js';
import { QUESTION_TYPES, DIFFICULTY } from '../../shared/constants.js';

const typeValues = Object.values(QUESTION_TYPES);
const diffValues = Object.values(DIFFICULTY);

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
    if (difficulty && !diffValues.includes(difficulty)) throw new ValidationError({ difficulty: [`Invalid difficulty: ${difficulty}`] });

    const prompt = this.#buildPrompt({ topic, count: Math.min(count, 20), type, difficulty });
    const raw = await this.#callLLM(prompt);
    const parsed = this.#parseResponse(raw, type || 'mcq', difficulty || 'medium');
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
  buildStructurePrompt({ topic, typeCounts = {}, difficulty = 'medium', points = 1, language = 'English' }) {
    const typeSpecs = {
      'multiple-choice': '"options" = array of 4 plausible strings; "answer" = the exact correct option string',
      'multiple-choice-multi': '"options" = array of 4-6 strings; "answer" = correct options joined with " | " (pipe-separated)',
      'true-false': '"options" = ["true","false"]; "answer" = "true" or "false"',
      'odd-one-out': '"options" = array of 4 strings where exactly one does not belong; "answer" = the odd one',
      'draggable': '"options" = array of 4-6 strings in the CORRECT order; "answer" = the same strings joined with "," (comma-separated, correct order)',
      'matching-pairs': '"options" = array of "left-->right" pair strings; "answer" = the pairs joined with "|" (e.g. "A-->1|B-->2")',
      'fill-blank': '"question" contains "[[1]]", "[[2]]"… placeholders; "options" = array of the correct words for each blank; "answer" = the words joined with "|" in blank order',
      'code': '"question" contains the code snippet; "answer" = the expected output/value; optional "language" and "answerMode" ("text"|"options")',
    };

    const requested = Object.entries(typeCounts || {})
      .filter(([, n]) => Number(n) > 0)
      .map(([t, n]) => `- ${n} × ${t}${typeSpecs[t] ? ` — ${typeSpecs[t]}` : ''}`);

    if (!requested.length) {
      requested.push(`- 5 × multiple-choice — ${typeSpecs['multiple-choice']}`);
    }

    const total = Object.values(typeCounts || {}).reduce((s, n) => s + Number(n || 0), 0) || 5;

    return `You are a quiz-question generator for a school quiz app. Generate questions about the topic below.

TOPIC / SOURCE MATERIAL:
"""${String(topic || '').slice(0, 8000)}"""

REQUIRED QUESTIONS (exact counts):
${requested.join('\n')}

RULES:
- Difficulty: ${difficulty}. Points per question: ${points}. Language: ${language}.
- Each question object MUST use EXACTLY these keys:
  { "question": string, "type": one of ["multiple-choice","multiple-choice-multi","true-false","odd-one-out","draggable","matching-pairs","fill-blank","code"], "options": string[], "answer": string, "explanation": string, "difficulty": "${difficulty}", "points": ${points} }
- The "answer" MUST be copy-pasteable from the "options" array (except fill-blank / code).
- No numbering, no markdown, no commentary — respond with ONE valid JSON array of question objects and NOTHING else.

Example output:
[
  {
    "question": "What is the result of 12 × 12?",
    "type": "multiple-choice",
    "options": ["124", "144", "156", "132"],
    "answer": "144",
    "explanation": "12 × 12 = 144.",
    "difficulty": "${difficulty}",
    "points": ${points}
  }
]`;
  }

  /**
   * Generate questions using an explicit provider config (from AIConfig rows
   * or a teacher's custom entry). Returns legacy-shape question objects.
   */
  async generateWithProvider(config, params) {
    if (!config?.model_id) throw new ValidationError({ model_id: ['No model selected'] });
    const prompt = this.buildStructurePrompt(params);
    const raw = await this.#callProvider(config, prompt);
    const questions = this.#parseStructuredQuestions(raw);
    return questions;
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

    return rows.map((row) => {
      const rawType = String(row.type || 'multiple-choice').trim().toLowerCase();
      const type = TYPE_ALIASES[rawType] || 'multiple-choice';
      let options = row.options;
      if (typeof options === 'string') {
        options = options.split(',').map((s) => s.trim()).filter(Boolean);
      }
      return {
        question: String(row.question || row.text || '').trim(),
        type,
        options: Array.isArray(options) ? options.map((o) => (typeof o === 'object' ? String(o.text || o.value || '') : String(o))) : [],
        answer: String(row.answer || '').trim(),
        explanation: String(row.explanation || '').trim() || '',
        difficulty: ['easy', 'medium', 'hard'].includes(String(row.difficulty).toLowerCase())
          ? String(row.difficulty).toLowerCase()
          : 'medium',
        points: Number(row.points) > 0 ? Math.min(Number(row.points), 100) : 1,
        language: row.language || undefined,
        answerMode: row.answerMode || undefined,
        codeSnippet: row.codeSnippet || undefined,
      };
    }).filter((q) => q.question && q.answer);
  }
}
