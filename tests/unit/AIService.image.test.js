/**
 * tests/unit/AIService.image.test.js
 *
 * Covers the structured prompt's image-option mode:
 *   - image-capable types get { label, image-prompt } object options
 *   - non-image types keep string options
 *   - imageOptions: false restores the plain string spec
 */

import { describe, it, expect } from 'vitest';
import { AIService, isImageOnlyModel, modelCapabilityLabel, textSiblingModel } from '../../src/backend/services/AIService.js';

const loggerStub = { warn() {}, error() {} };

function build(...params) {
  const svc = new AIService({}, loggerStub);
  return svc.buildStructurePrompt(...params);
}

describe('AIService.buildStructurePrompt (image options)', () => {
  it('asks for { label, image } objects when imageOptions is on', () => {
    const prompt = build({
      topic: 'fruits',
      typeCounts: { 'multiple-choice': 2, 'true-false': 1 },
      difficulty: 'easy',
      points: 1,
      language: 'English',
    });
    expect(prompt).toContain('"options" = array of 4 OBJECTS { "label"');
    expect(prompt).toContain('IMAGE-OPTION TYPES (multiple-choice');
    expect(prompt).toContain('"image" value is a self-contained image-generation prompt');
    // The non-image type keeps its string spec.
    expect(prompt).toContain('"options" = ["true","false"]');
  });

  it('covers odd-one-out and draggable object specs', () => {
    const prompt = build({
      topic: 'general',
      typeCounts: { 'odd-one-out': 1, draggable: 1, 'multiple-choice-multi': 1 },
      difficulty: 'medium',
    });
    expect(prompt).toContain('4 OBJECTS { "label", "image" } where exactly one does not belong');
    expect(prompt).toContain('4-6 OBJECTS { "label", "image" } in the CORRECT order');
    expect(prompt).toContain('correct option LABELS joined with " | "');
  });

  it('falls back to string options when imageOptions is false', () => {
    const prompt = build({
      topic: 'fruits',
      typeCounts: { 'multiple-choice': 2 },
      difficulty: 'easy',
      imageOptions: false,
    });
    expect(prompt).toContain('"options" = array of 4 plausible strings');
    expect(prompt).not.toContain('IMAGE-OPTION TYPES');
    expect(prompt).not.toContain('{ "label"');
  });

  it('emits a copy-pasteable image example', () => {
    const prompt = build({
      topic: 'fruits',
      typeCounts: { 'multiple-choice': 1 },
      difficulty: 'easy',
    });
    expect(prompt).toContain('"label": "apple"');
    expect(prompt).toContain('"image": "studio photo of a shiny red apple');
    expect(prompt).toContain('"answer": "apple"');
  });
});

describe('AIService.isImageOnlyModel / modelCapabilityLabel', () => {
  it('flags image-generation-only models', () => {
    expect(isImageOnlyModel('gemini-2.5-flash-image')).toBe(true);
    expect(isImageOnlyModel('Gemini 2.5 Flash Image')).toBe(true);
    expect(isImageOnlyModel('google/gemini-2.5-flash-image')).toBe(true);
    expect(isImageOnlyModel('nano-banana')).toBe(true);
    expect(isImageOnlyModel('Nano Banana')).toBe(true);
    expect(isImageOnlyModel('gpt-image-1')).toBe(true);
    expect(isImageOnlyModel('dall-e-3')).toBe(true);
    expect(isImageOnlyModel('flux-pro')).toBe(true);
  });

  it('does not flag text / multimodal-chat models', () => {
    expect(isImageOnlyModel('gemini-3.1-flash-lite')).toBe(false);
    expect(isImageOnlyModel('gemini-1.5-pro')).toBe(false);
    expect(isImageOnlyModel('openai/gpt-4o-mini')).toBe(false);
    expect(isImageOnlyModel('anthropic/claude-3.5-haiku')).toBe(false);
    expect(isImageOnlyModel('')).toBe(false);
    expect(isImageOnlyModel(null)).toBe(false);
  });

  it('labels capabilities for display', () => {
    expect(modelCapabilityLabel({ provider: 'google', model_id: 'gemini-2.5-flash-image' })).toBe('image-only');
    expect(modelCapabilityLabel({ provider: 'openai', model_id: 'gpt-4o-mini' })).toBe('images-and-text');
    expect(modelCapabilityLabel({ provider: 'openrouter', model_id: 'openai/gpt-4o-mini' })).toBe('images-and-text');
    expect(modelCapabilityLabel({ provider: 'google', model_id: 'gemini-3.1-flash-lite' })).toBe('text');
  });

  it('textSiblingModel picks a per-provider text model for image-only models', () => {
    delete process.env.AI_IMAGE_QUESTION_MODEL;
    expect(textSiblingModel({ provider: 'google' })).toBe('gemini-2.5-flash');
    expect(textSiblingModel({ provider: 'openai' })).toBe('gpt-4o-mini');
    expect(textSiblingModel({ provider: 'openrouter' })).toBe('openai/gpt-4o-mini');
    expect(textSiblingModel({ provider: 'anthropic' })).toBeNull();
  });

  it('textSiblingModel honors the AI_IMAGE_QUESTION_MODEL override', () => {
    process.env.AI_IMAGE_QUESTION_MODEL = 'gemini-2.5-flash-lite';
    try {
      expect(textSiblingModel({ provider: 'google' })).toBe('gemini-2.5-flash-lite');
    } finally {
      delete process.env.AI_IMAGE_QUESTION_MODEL;
    }
  });
});