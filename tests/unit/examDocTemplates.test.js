/**
 * tests/unit/examDocTemplates.test.js
 *
 * Step 2 contract: the five built-in templates must all render the same content
 * without throwing, honour their page geometry, and the two-column templates
 * must actually pack more onto each sheet. Classique (the default) is checked
 * against the Step 0 targets so the added variants cannot regress the baseline.
 */

import { describe, it, expect } from 'vitest';
import { renderExamDocumentPdf } from '../../src/backend/services/exam-doc/pdfRenderer.js';
import { resolveTemplate, listTemplates } from '../../src/backend/services/exam-doc/templates/index.js';
import { buildDocument } from './helpers/examDocFixtures.js';
import { compactFixtures, denseFixtures, oversizeFixtures } from './helpers/examDocStress.js';

async function render(rows, template, header = {}) {
  const model = await buildDocument({ questions: rows }, { document: 'student', header });
  return renderExamDocumentPdf(model, { template });
}

describe('built-in templates render the same content', () => {
  const ids = listTemplates().map((t) => t.id);

  it('ships the five planned templates', () => {
    expect(ids.sort()).toEqual(['classique', 'college', 'compact', 'moderne', 'officiel']);
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
