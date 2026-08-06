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
}
