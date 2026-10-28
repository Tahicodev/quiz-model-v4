/**
 * tests/unit/examTemplate.test.js
 *
 * Step 1 contract: the template layer must resolve the built-in "Classique"
 * template to EXACTLY the geometry the renderer hardcoded before the refactor
 * (that is what keeps the whole exam-doc suite byte-identical), honour partial
 * overrides, refuse out-of-bounds values, and let a route pass one resolved
 * config to all three renderers.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveTemplate,
  defaultTemplateConfig,
  resolveForRenderer,
  listTemplates,
} from '../../src/backend/services/exam-doc/templates/index.js';
import {
  safeParseExamTemplate,
  safeParseTemplateOverride,
  TEMPLATE_LIMITS,
} from '../../src/shared/schemas/examTemplate.schema.js';

describe('exam template registry', () => {
  it('resolves Classique to the historical renderer geometry (parity)', () => {
    const cfg = defaultTemplateConfig();
    expect(cfg.id).toBe('classique');
    expect(cfg.pageW).toBeCloseTo(595.28, 2);
    expect(cfg.pageH).toBeCloseTo(841.89, 2);
    expect(cfg.margin.top).toBe(42);
    expect(cfg.contentW).toBeCloseTo(511.28, 2); // pageW - 42*2
    expect(cfg.footerH).toBe(26);
    expect(cfg.usableH).toBeCloseTo(731.89, 2); // pageH - 42*2 - 26
    expect(cfg.theme.sizes).toMatchObject({ body: 12, small: 10, tiny: 9, title: 15 });
    expect(cfg.theme.colors).toMatchObject({
      accent: '#1F3A5F',
      muted: '#5B6472',
      hairline: '#C9D1D9',
      fieldBg: '#F6F8FA',
    });
    expect(cfg.header.noteW).toBe(126);
    expect(cfg.header.noteH).toBe(58);
    expect(cfg.marker).toEqual({ radio: '( )', checkbox: '[ ]' });
  });

  it('resolveTemplate(id) equals the default config', () => {
    expect(resolveTemplate('classique')).toEqual(defaultTemplateConfig());
  });

  it('flattens answerSpace and derives a two-column content width', () => {
    const cfg = resolveTemplate('classique', {
      page: { columns: 2 },
      question: { answerSpace: { lines: 4 } },
    });
    expect(cfg.page.columns).toBe(2);
    expect(cfg.colW).toBeCloseTo((cfg.contentW - cfg.page.gutter) / 2, 2);
    expect(cfg.question.answerLines).toBe(4);
  });

  it('resolveForRenderer passes an already-resolved config through', () => {
    const cfg = defaultTemplateConfig();
    expect(resolveForRenderer({ template: cfg })).toBe(cfg);
    expect(resolveForRenderer({})).toEqual(cfg);
  });

  it('lists the built-in templates for the picker cards', () => {
    const ids = listTemplates().map((t) => t.id);
    expect(ids).toContain('classique');
  });
});

describe('exam template schema bounds', () => {
  it('accepts the Classique template', () => {
    const res = safeParseExamTemplate({
      id: 'classique',
      name: 'Classique',
      theme: { sizes: { body: 12 }, density: 1 },
    });
    expect(res.success).toBe(true);
  });

  it('refuses a font below the floor and an out-of-range margin', () => {
    const smallFont = safeParseExamTemplate({
      id: 'x',
      name: 'X',
      theme: { sizes: { body: TEMPLATE_LIMITS.minFont - 1 } },
    });
    expect(smallFont.success).toBe(false);

    const wideMargin = safeParseExamTemplate({
      id: 'x',
      name: 'X',
      page: { margin: { top: TEMPLATE_LIMITS.maxMargin + 1 } },
    });
    expect(wideMargin.success).toBe(false);
  });

  it('treats a column count other than 1 or 2 as invalid in an override', () => {
    const res = safeParseTemplateOverride({ page: { columns: 3 } });
    expect(res.success).toBe(false);
  });
});
