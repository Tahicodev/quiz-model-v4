/**
 * tests/unit/examDocPaging.test.js
 *
 * Step 0 of the template refactor: the pagination contract.
 *
 *  - A compact 20-question subject must fit in 3-4 sheets (the success
 *    criterion the teacher set).
 *  - A medium and a pathological paper must never explode into a page-per-
 *    question blow-up.
 *  - A paper built from questions that are individually TALLER than one sheet
 *    must flow continuously: the old engine pushed each over-sized keep-group
 *    onto a fresh page, leaving a near-empty gap on the previous sheet once per
 *    question. "No near-empty sheet" is therefore the direct regression test
 *    for the 34-page bug.
 */

import { describe, it, expect } from 'vitest';
import { renderExamDocumentPdf } from '../../src/backend/services/exam-doc/pdfRenderer.js';
import { buildDocument } from './helpers/examDocFixtures.js';
import {
  compactFixtures,
  denseFixtures,
  oversizeFixtures,
  stressFixtures,
  textLengthPerPage,
} from './helpers/examDocStress.js';
import { pdfPageTexts } from './helpers/examDocPdf.js';

async function renderStudent(rows, header = {}) {
  const model = await buildDocument({ questions: rows }, { document: 'student', header });
  return renderExamDocumentPdf(model);
}

/** All sheets except the last must carry a fair share of the fullest sheet. */
function assertNoNearEmptyPages(buffer, floor = 0.4) {
  const perPage = textLengthPerPage(pdfPageTexts(buffer));
  const fullest = Math.max(...perPage, 1);
  const body = perPage.slice(0, -1);
  for (const len of body) {
    expect(len, 'near-empty page detected: ' + JSON.stringify(perPage)).toBeGreaterThanOrEqual(fullest * floor);
  }
}

describe('PDF pagination — measurement (documents the current behaviour)', () => {
  it('logs page counts for every paper shape', async () => {
    const compact = await renderStudent(compactFixtures(20));
    const dense = await renderStudent(denseFixtures(20));
    const stress = await renderStudent(stressFixtures(20));
    const over = await renderStudent(oversizeFixtures(6, 40));
    // eslint-disable-next-line no-console
    console.log(
      '[paging] compact20=%d dense20=%d stress20=%d oversize6=%d',
      compact.pages,
      dense.pages,
      stress.pages,
      over.pages,
    );
    // eslint-disable-next-line no-console
    console.log('[paging] oversize chars/page =', JSON.stringify(textLengthPerPage(pdfPageTexts(over.buffer))));
    expect(compact.pages).toBeGreaterThan(0);
  });
});

describe('PDF pagination — targets (Step 0 success criteria)', () => {
  it('fits a compact 20-question subject in 3-4 pages', async () => {
    const { pages } = await renderStudent(compactFixtures(20));
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(pages).toBeLessThanOrEqual(4);
  });

  it('keeps a medium 20-question paper to at most 5 pages', async () => {
    const { pages } = await renderStudent(denseFixtures(20));
    expect(pages).toBeLessThanOrEqual(5);
  });

  it('does not blow a pathological 20-question paper past 12 pages', async () => {
    const { pages } = await renderStudent(stressFixtures(20));
    expect(pages).toBeLessThanOrEqual(12);
  });

  it('lets over-sized questions flow without a near-empty sheet', async () => {
    const { buffer, pages } = await renderStudent(oversizeFixtures(6, 40));
    // Six tables of 40 wrapped rows genuinely span ~two sheets each; the point
    // is not the raw count but that the flow fills every sheet. The old engine
    // jumped each over-sized group to a fresh page, so each boundary sheet was
    // left with a handful of orphaned rows. The near-empty check below is the
    // regression guard for the 34-page bug.
    expect(pages).toBeLessThanOrEqual(13);
    assertNoNearEmptyPages(buffer, 0.55);
  });

  it('never leaves a near-empty sheet on the compact paper', async () => {
    const { buffer } = await renderStudent(compactFixtures(20));
    assertNoNearEmptyPages(buffer, 0.4);
  });
});
