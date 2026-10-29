/**
 * tests/unit/examDocTemplates.test.js
 *
 * Step 2 contract: the built-in templates must all render the same content
 * without throwing, honour their page geometry, and the two-column templates
 * must actually pack more onto each sheet. Classique (the default) is checked
 * against the Step 0 targets so the added variants cannot regress the baseline.
 * `Ultra compact` is the extreme of that last point: the tightest paper the
 * template schema allows has to take a 20-question subject onto two sheets.
 */

import { describe, it, expect } from 'vitest';
import { renderExamDocumentPdf, measureExamLayout } from '../../src/backend/services/exam-doc/pdfRenderer.js';
import { renderExamDocumentHtml } from '../../src/backend/services/exam-doc/htmlPreview.js';
import { renderExamDocumentDocx } from '../../src/backend/services/exam-doc/docxRenderer.js';
import { packExamModel } from '../../src/backend/services/exam-doc/pageEstimator.js';
import { resolveTemplate, listTemplates } from '../../src/backend/services/exam-doc/templates/index.js';
import { TEMPLATE_LIMITS } from '../../src/shared/schemas/examTemplate.schema.js';
import { buildDocument, longFixtures } from './helpers/examDocFixtures.js';
import { compactFixtures, denseFixtures, oversizeFixtures } from './helpers/examDocStress.js';

async function render(rows, template, header = {}) {
  const model = await buildDocument({ questions: rows }, { document: 'student', header });
  return renderExamDocumentPdf(model, { template });
}

describe('built-in templates render the same content', () => {
  const ids = listTemplates().map((t) => t.id);

  it('ships the six planned templates', () => {
    expect(ids.sort()).toEqual(['classique', 'college', 'compact', 'moderne', 'officiel', 'ultra']);
  });

  for (const id of ids) {
    it(`renders a 20-question ${id} subject with no crash and a positive page count`, async () => {
      const { pages, buffer, warnings } = await render(compactFixtures(20), resolveTemplate(id));
      expect(buffer.length).toBeGreaterThan(1000);
      expect(pages).toBeGreaterThanOrEqual(1);
      expect(warnings.filter((w) => w.type === 'font-fallback')).toHaveLength(0);
    });
  }

  it('produces a PDF for the answer key of every template', async () => {
    for (const { id } of listTemplates()) {
      const model = await buildDocument({ questions: denseFixtures(10) }, { document: 'answer_key' });
      const { pages, buffer } = await renderExamDocumentPdf(model, { template: resolveTemplate(id) });
      expect(buffer.length).toBeGreaterThan(1000);
      expect(pages).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('two-column flow packs more per sheet', () => {
  it('the compact template (2 columns) beats Classique (1 column) on page count', async () => {
    const oneCol = await render(compactFixtures(20), resolveTemplate('classique'));
    const compact = await render(compactFixtures(20), resolveTemplate('compact'));
    expect(oneCol.pages).toBeGreaterThanOrEqual(compact.pages);
    // 20 compact questions: 3-4 pages in one column, 2-3 in two.
    expect(oneCol.pages).toBeLessThanOrEqual(4);
    expect(compact.pages).toBeGreaterThanOrEqual(2);
    expect(compact.pages).toBeLessThanOrEqual(3);
  });

  it('honours a two-column override on the Classique theme', async () => {
    const { pages } = await render(compactFixtures(20), resolveTemplate('classique', { page: { columns: 2 } }));
    expect(pages).toBeLessThanOrEqual(3);
  });

  it('spans a full-width matching table without crashing in two columns', async () => {
    // Two matching tables, each taller than a whole sheet, exercise the `span`
    // break-out and the row-level page flow inside a full-width band.
    const { pages, buffer } = await render(oversizeFixtures(2, 40), resolveTemplate('compact'));
    expect(buffer.length).toBeGreaterThan(1000);
    expect(pages).toBeGreaterThanOrEqual(2);
  });

  it('packs a short full-width table inline instead of flushing a whole page', async () => {
    // A handful of compact questions around one small matching table must not
    // cost an extra sheet per table: the band is drawn inline in the first
    // column, so the two-column sheet stays at or below the one-column count.
    const oneCol = await render(denseFixtures(10), resolveTemplate('classique'));
    const twoCol = await render(denseFixtures(10), resolveTemplate('compact'));
    expect(twoCol.pages).toBeLessThanOrEqual(oneCol.pages);
  });
});

describe('Ultra compact is the tightest paper', () => {
  it('sits at every floor the template schema exposes', () => {
    const cfg = resolveTemplate('ultra');
    expect(cfg.page.columns).toBe(2);
    expect(cfg.theme.density).toBe(TEMPLATE_LIMITS.minDensity);
    expect(cfg.theme.sizes.body).toBeGreaterThan(TEMPLATE_LIMITS.minFont);
    expect(cfg.margin.top).toBe(TEMPLATE_LIMITS.minMargin);
    expect(cfg.question.answerStyle).toBe('inline');
    // The one-line header keeps no running band on page 2: the space is questions'.
    expect(cfg.header.variant).toBe('minimal');
    expect(cfg.header.compactOnFollow).toBe(false);
  });

  it('takes a 20-question subject onto two sheets, fewer than every other model', async () => {
    const ultra = await render(compactFixtures(20), resolveTemplate('ultra'));
    expect(ultra.pages).toBe(2);
    for (const id of ['classique', 'moderne', 'college', 'officiel']) {
      const other = await render(compactFixtures(20), resolveTemplate(id));
      expect(other.pages).toBeGreaterThanOrEqual(ultra.pages);
    }
    // Even a wordier 20-question paper still fits two sheets.
    const dense = await render(denseFixtures(20), resolveTemplate('ultra'));
    expect(dense.pages).toBe(2);
  });

  it('is still two pages in the Word and the preview pipeline (same model)', async () => {
    const cfg = resolveTemplate('ultra');
    const model = packExamModel(
      await buildDocument({ questions: compactFixtures(20) }, { document: 'student' }),
      cfg,
    );
    const html = renderExamDocumentHtml(model, { template: cfg });
    // 20 questions, each printed exactly once, in the packed order.
    expect((html.match(/class="ed-question"/g) || []).length).toBe(20);
    expect(html).toContain('Question 20');
    const docx = await renderExamDocumentDocx(model, { template: cfg });
    expect(docx.buffer.length).toBeGreaterThan(1000);
  });

  it('leaves no strip at the foot of a column that a later question could fill', async () => {
    // The hole the teacher saw. Heights come from the engine's own `measure`
    // now, so this replay of the packed order is the pagination itself: every
    // column that gives up space must give up LESS than the smallest question
    // still waiting behind it — otherwise that question could have come up here.
    const cfg = resolveTemplate('ultra');
    const model = packExamModel(
      await buildDocument({ questions: longFixtures(20) }, { document: 'student' }),
      cfg,
    );
    const measured = measureExamLayout(model, cfg);
    const items = measured.sections.flatMap((s) => s.items);
    const capacity = cfg.usableH;
    const columns = cfg.page.columns;
    let page = 1;
    let col = 0;
    let used = measured.headerH;
    const holes = [];
    items.forEach((item, i) => {
      if (used + item.totalH > capacity) {
        holes.push({ free: capacity - used, smallestWaiting: Math.min(...items.slice(i).map((q) => q.totalH)) });
        col += 1;
        if (col >= columns) {
          col = 0;
          page += 1;
        }
        used = page === 1 ? measured.headerH : measured.runningH;
      }
      used += item.totalH;
    });
    expect(holes.length, 'the paper must span more than one column').toBeGreaterThan(0);
    for (const hole of holes) {
      expect(hole.free).toBeLessThan(hole.smallestWaiting);
    }
  });
});
