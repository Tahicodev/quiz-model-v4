/**
 * tests/unit/ImageGenService.test.js
 *
 * Exercises the strict image-option generation policy:
 *   - only OpenAI / OpenRouter providers produce real images
 *   - anything else (or missing key, or a failed option) falls back to
 *     clean text options — never placeholders
 *   - files land in uploads/ with the manual editor's option shape
 *     ({ text: "image-N", image: "/uploads/…", isImageOnly: true })
 *   - failed questions leave no orphan files behind
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ImageGenService } from '../../src/backend/services/ImageGenService.js';
import { AIService } from '../../src/backend/services/AIService.js';

const draftSingle = {
  question: 'Which fruit is red?',
  type: 'multiple-choice',
  explanation: 'x',
  difficulty: 'easy',
  points: 1,
  imageMode: true,
  options: [
    { label: 'apple', image: 'red apple photo' },
    { label: 'banana', image: 'banana photo' },
    { label: 'cherry', image: 'cherry photo' },
    { label: 'kiwi', image: 'kiwi photo' },
  ],
  answer: 'cherry',
};

const draftMulti = {
  ...draftSingle,
  type: 'multiple-choice-multi',
  answer: 'apple|kiwi',
  options: draftSingle.options,
};

const draftDraggable = {
  ...draftSingle,
  type: 'draggable',
  answer: '4,3,2,1', // model answered by 1-based position, reversed
  options: draftSingle.options,
};

function makeDrafts(...variants) {
  return variants.map((d) => d.imageMode ? d : { ...d, imageMode: true });
}

describe('ImageGenService', () => {
  let dir;
  let svc;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'quiz-img-'));
    svc = new ImageGenService({ uploadsDir: dir });
  });

  afterEach(() => {
    delete process.env.AI_IMAGE_FAKE;
    delete process.env.AI_IMAGE_MAX_TOTAL;
    delete process.env.AI_IMAGE_CONCURRENCY;
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  describe('render() with fake provider images', () => {
    it('renders real PNG files and image-option shape for openai', async () => {
      process.env.AI_IMAGE_FAKE = '1';
      const { questions, note } = await svc.render({
        config: { provider: 'openai', model_id: 'gpt-5-mini', api_key: 'sk-test' },
        questions: makeDrafts(draftSingle),
      });

      const q = questions[0];
      expect(q.imageMode).toBe(true);
      expect(q.options).toHaveLength(4);
      q.options.forEach((o, i) => {
        expect(o.text).toBe(`image-${i + 1}`);
        expect(o.isImageOnly).toBe(true);
        expect(o.image).toMatch(/^\/uploads\/[a-f0-9]+\.png$/);
      });
      expect(q.answer).toBe('image-3'); // cherry was option 3
      expect(readdirSync(dir)).toHaveLength(4);
      expect(readdirSync(dir).every((f) => existsSync(join(dir, f)))).toBe(true);
      expect(note).toContain('Auto-generated 4 option image(s)');
    });

    it('supports openrouter too', async () => {
      process.env.AI_IMAGE_FAKE = '1';
      const { questions } = await svc.render({
        config: { provider: 'openrouter', model_id: 'openai/gpt-image-1', api_key: 'sk-test' },
        questions: makeDrafts(draftSingle),
      });
      expect(questions[0].options[0].image).toMatch(/\.png$/);
    });

    it('renders option images for a google image-only model (Nano Banana)', async () => {
      process.env.AI_IMAGE_FAKE = '1';
      const { questions, note } = await svc.render({
        config: { provider: 'google', model_id: 'gemini-2.5-flash-image', api_key: 'k' },
        questions: makeDrafts(draftSingle),
      });
      expect(questions[0].imageMode).toBe(true);
      expect(questions[0].options[0].image).toMatch(/^\/uploads\/[a-f0-9]+\.png$/);
      expect(questions[0].answer).toBe('image-3'); // cherry was option 3
      expect(note).toContain('gemini-2.5-flash-image (google)');
    });

    it('supports the manual image builder draft (Option N labels, single truthful question)', async () => {
      // Shape produced by the Images-style builder: the teacher types the
      // question, describes each picture, and marks one option as correct.
      process.env.AI_IMAGE_FAKE = '1';
      const draft = {
        type: 'multiple-choice',
        question: 'Which image shows a wireless router?',
        difficulty: 'medium',
        points: 2,
        explanation: '',
        imageMode: true,
        options: [
          { label: 'Option 1', image: 'a white router with three antennas' },
          { label: 'Option 2', image: 'a coffee mug on a desk' },
          { label: 'Option 3', image: 'a laptop with a mouse' },
          { label: 'Option 4', image: 'a phone charging cable' },
        ],
        answer: 'Option 1',
      };
      const { questions } = await svc.render({
        config: { provider: 'openai', model_id: 'gpt-image-1', api_key: 'sk-test' },
        questions: [draft],
      });

      const q = questions[0];
      expect(q.imageMode).toBe(true);
      expect(q.question).toBe('Which image shows a wireless router?');
      expect(q.points).toBe(2);
      expect(q.options.map((o) => o.text)).toEqual(['image-1', 'image-2', 'image-3', 'image-4']);
      expect(q.answer).toBe('image-1'); // "Option 1" was marked correct
      expect(q.options[0].image).toMatch(/^\/uploads\/[a-f0-9]+\.png$/);
      expect(readdirSync(dir)).toHaveLength(4);
    });

    it('uses the original image model when AIService auto-paired an image-only model', async () => {
      process.env.AI_IMAGE_FAKE = '1';
      const { questions, note } = await svc.render({
        config: { provider: 'google', model_id: 'gemini-2.5-flash', _imageOnlyOriginalModel: 'gemini-2.5-flash-image', api_key: 'k' },
        questions: makeDrafts(draftSingle),
      });
      expect(questions[0].imageMode).toBe(true);
      expect(note).toContain('gemini-2.5-flash-image (google)');
    });

    it('falls back to text for a google TEXT model (not image-only)', async () => {
      const { questions, note } = await svc.render({
        config: { provider: 'google', model_id: 'gemini-3.1-flash-lite', api_key: 'k' },
        questions: makeDrafts(draftSingle),
      });
      expect(questions[0].imageMode).toBe(false);
      expect(questions[0].options).toEqual(['apple', 'banana', 'cherry', 'kiwi']);
      expect(note).toContain('cannot generate images');
    });

    it('maps multi-answer labels to image tokens with "|" separator', async () => {
      process.env.AI_IMAGE_FAKE = '1';
      const { questions } = await svc.render({
        config: { provider: 'openai', model_id: 'gpt-5-mini', api_key: 'sk-test' },
        questions: makeDrafts(draftMulti),
      });
      expect(questions[0].answer).toBe('image-1|image-4'); // apple|kiwi
    });

    it('maps draggable positional answer onto ordered image tokens', async () => {
      process.env.AI_IMAGE_FAKE = '1';
      const { questions } = await svc.render({
        config: { provider: 'openai', model_id: 'gpt-5-mini', api_key: 'sk-test' },
        questions: makeDrafts(draftDraggable),
      });
      expect(questions[0].answer).toBe('image-4,image-3,image-2,image-1');
    });

    it('respects the AI_IMAGE_MAX_TOTAL budget and downgrades the rest', async () => {
      process.env.AI_IMAGE_FAKE = '1';
      process.env.AI_IMAGE_MAX_TOTAL = '4'; // exactly one 4-option question fits
      const { questions, note } = await svc.render({
        config: { provider: 'openai', model_id: 'gpt-5-mini', api_key: 'sk-test' },
        questions: makeDrafts(draftSingle, draftMulti),
      });

      expect(questions).toHaveLength(2);
      expect(questions[0].imageMode).toBe(true); // first question rendered
      expect(questions[1].imageMode).toBe(false); // second fell back to text
      expect(questions[1].options).toEqual(['apple', 'banana', 'cherry', 'kiwi']);
      expect(questions[1].answer).toBe('apple|kiwi');
      expect(readdirSync(dir)).toHaveLength(4); // no orphans
      expect(note).toContain('1 image question(s) fell back');
    });
  });

  describe('strict text fallback (no placeholders)', () => {
    it('downgrades image drafts to text for non-image providers', async () => {
      const { questions, note } = await svc.render({
        config: { provider: 'anthropic', model_id: 'claude', api_key: 'k' },
        questions: makeDrafts(draftSingle),
      });
      expect(questions[0].imageMode).toBe(false);
      expect(questions[0].options).toEqual(['apple', 'banana', 'cherry', 'kiwi']);
      expect(questions[0].answer).toBe('cherry');
      expect(readdirSync(dir)).toHaveLength(0);
      expect(note).toContain('cannot generate images');
    });

    it('downgrades when the provider config has no API key', async () => {
      const { questions } = await svc.render({
        config: { provider: 'openai', model_id: 'gpt-5-mini', api_key: '' },
        questions: makeDrafts(draftSingle),
      });
      expect(questions[0].imageMode).toBe(false);
      expect(questions[0].options).toEqual(['apple', 'banana', 'cherry', 'kiwi']);
    });

    it('passes text questions through untouched and notes text-only output', async () => {
      const textQ = { ...draftSingle, imageMode: false, options: ['a', 'b', 'c', 'd'], answer: 'a' };
      const { questions, note } = await svc.render({
        config: { provider: 'openai', model_id: 'gpt-5-mini', api_key: 'k' },
        questions: [textQ],
      });
      expect(questions[0]).toEqual(textQ);
      expect(note).toContain('text-only questions');
    });

    it('downgrades the question and leaves zero files when an option fails', async () => {
      // Real (non-fake) path with a provider whose calls throw.
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('quota exceeded');
        }),
      );
      const { questions } = await svc.render({
        config: { provider: 'openai', model_id: 'gpt-5-mini', api_key: 'sk-test' },
        questions: makeDrafts(draftSingle),
      });
      expect(questions[0].imageMode).toBe(false);
      expect(questions[0].options).toEqual(['apple', 'banana', 'cherry', 'kiwi']);
      expect(questions[0].answer).toBe('cherry');
      expect(readdirSync(dir)).toHaveLength(0);
    });
  });

  describe('end-to-end with the structured generator', () => {
    const loggerStub = { warn() {}, error() {} };

    it('turns an LLM { label, image } response into saved image questions', async () => {
      process.env.AI_IMAGE_FAKE = '1';
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify([{
                    question: 'Which is a red fruit?',
                    type: 'multiple-choice',
                    options: [
                      { label: 'apple', image: 'red apple photo' },
                      { label: 'banana', image: 'yellow banana photo' },
                      { label: 'cherry', image: 'red cherries photo' },
                      { label: 'kiwi', image: 'green kiwi photo' },
                    ],
                    answer: 'apple',
                    explanation: 'Apples are red.',
                    difficulty: 'easy',
                    points: 1,
                  }]),
                },
              },
            ],
          }),
        })),
      );

      const aiSvc = new AIService({}, loggerStub);
      const drafts = await aiSvc.generateWithProvider(
        { provider: 'openai', model_id: 'gpt-5-mini', api_key: 'sk-test' },
        { topic: 'fruits', typeCounts: { 'multiple-choice': 1 }, difficulty: 'easy', points: 1, language: 'English' },
      );

      expect(drafts).toHaveLength(1);
      expect(drafts[0].imageMode).toBe(true);
      expect(drafts[0].options.map((o) => o.label)).toEqual(['apple', 'banana', 'cherry', 'kiwi']);
      expect(drafts[0].options[0].image).toBe('red apple photo');

      const { questions } = await svc.render({
        config: { provider: 'openai', model_id: 'gpt-5-mini', api_key: 'sk-test' },
        questions: drafts,
      });
      expect(questions[0].options[0].image).toMatch(/^\/uploads\/[a-f0-9]+\.png$/);
      expect(questions[0].answer).toBe('image-1');
      expect(readdirSync(dir)).toHaveLength(4);
    });

    it('keeps plain string options as text when the model ignores image mode', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify([{
                    question: 'What is 2+2?',
                    type: 'multiple-choice',
                    options: ['3', '4', '5', '6'],
                    answer: '4',
                    difficulty: 'easy',
                    points: 1,
                  }]),
                },
              },
            ],
          }),
        })),
      );

      const aiSvc = new AIService({}, loggerStub);
      const drafts = await aiSvc.generateWithProvider(
        { provider: 'openai', model_id: 'gpt-5-mini', api_key: 'sk-test' },
        { topic: 'math', typeCounts: { 'multiple-choice': 1 }, difficulty: 'easy', points: 1, language: 'English' },
      );
      expect(drafts[0].imageMode).toBeUndefined();
      expect(drafts[0].options).toEqual(['3', '4', '5', '6']);
    });
  });
});