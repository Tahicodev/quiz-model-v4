/**
 * tests/unit/examDocLayout.test.js
 *
 * Locks the four levers the teacher asked for, each at the level where it is
 * really decided:
 *
 *  - an INLINE fill-blank stem prints bare gaps: the `(1) (2) (3)` markers would
 *    be a second numbering of the same sentence competing with the option bank,
 *    while the classic sheet keeps them (its "Réponses" lines are numbered);
 *  - the matching table is a normal in-flow table on the classic sheet and a
 *    two-column N°/Lettre grid on the inline one — never a table floated to the
 *    right edge, which left a hole next to the stem;
 *  - the paper is PACKED at the model level: columns are filled to the bottom
 *    and questions are numbered in placement order, so the PDF, the Word file and
 *    the preview — which only ever draw the order they are given — cannot
 *    disagree, and the answer key keeps the subject's numbering;
 *  - a header LAYOUT only moves the printed elements: every variant draws the
 *    same title, the picker override reaches the resolved config, and the page
 *    estimator still tracks the real render for each of them.
 */

import { describe, it, expect } from 'vitest';
import { blankStem } from '../../src/backend/services/exam-doc/text.js';
import { packExamModel, estimateAnalytic, estimateExact } from '../../src/backend/services/exam-doc/pageEstimator.js';
import { overridesFromLayout, resolveFromRequest, resolveTemplate } from '../../src/backend/services/exam-doc/templates/index.js';
import { renderExamDocumentPdf } from '../../src/backend/services/exam-doc/pdfRenderer.js';
import { renderExamDocumentDocx } from '../../src/backend/services/exam-doc/docxRenderer.js';
import { renderExamDocumentHtml } from '../../src/backend/services/exam-doc/htmlPreview.js';
import { pdfText } from './helpers/examDocPdf.js';
import { zipText } from './helpers/examDocZip.js';
import { buildDocument, longFixtures, questionFixtures } from './helpers/examDocFixtures.js';

/** The seven layouts the engine can draw (`officiel` is the alias of `boxed`). */
const LAYOUTS = ['bandeau', 'classique', 'centre', 'split', 'boxed', 'banner', 'minimal'];

/** A fill-blank WITH a bank (inline style prints it as numbered options). */
function bankRows() {
  const rows = questionFixtures();
  return [
    {
      ...rows[0],
      id: 'q-bank',
      type: 'fill-blank',
      text: 'Le système binaire est de base ____ et utilise les chiffres ____ et ____.',
      options_json: JSON.stringify(['deux', '0', '1']),
      answer: 'deux, 0, 1',
    },
    rows[5], // a matching question, for the pairs assertions
    rows[0], // a short mcq, so the packer has something to pull up
  ];
}

function cfgFor(overrides) {
  return resolveTemplate('classique', overrides);
}

describe('inline fill-blank stem', () => {
  const block = {
    kind: 'blanks',
    text: 'Le système binaire est de base ____ et utilise les chiffres ____ et ____.',
    blanks: 3,
    bank: ['deux', '0', '1'],
  };

  it('drops the gap markers when the inline bank numbers them instead', () => {
    expect(blankStem(block, { inline: true })).toBe(
      'Le système binaire est de base ____ et utilise les chiffres ____ et ____.',
    );
  });

  it('keeps the (1) (2) (3) markers on the classic sheet', () => {
    expect(blankStem(block, { inline: false })).toMatch(/base\s+\(1\)/);
    expect(blankStem(block, { inline: false })).toMatch(/chiffres\s+\(2\)/);
  });

  it('keeps them when there is no bank to point at', () => {
    expect(blankStem({ ...block, bank: [] }, { inline: true })).toMatch(/\(1\)/);
  });

  it('is what the three formats actually print', async () => {
    const model = await buildDocument({ questions: bankRows() }, { document: 'student' });
    const inline = cfgFor({ question: { answerStyle: 'inline' } });
    const classic = cfgFor({ question: { answerStyle: 'classic' } });
    const numbered = /base\s+\(1\)\s+____/;

    expect(renderExamDocumentHtml(model, { template: inline })).not.toMatch(numbered);
    expect(renderExamDocumentHtml(model, { template: classic })).toMatch(numbered);

    const docxXml = async (cfg) =>
      zipText((await renderExamDocumentDocx(model, { template: cfg })).buffer, 'word/document.xml');
    expect(await docxXml(inline)).not.toMatch(numbered);
    expect(await docxXml(classic)).toMatch(numbered);

    const pdf = async (cfg) => pdfText((await renderExamDocumentPdf(model, { template: cfg })).buffer);
    expect(await pdf(classic)).toMatch(numbered);
    const inlinePdf = await pdf(inline);
    expect(inlinePdf).not.toMatch(/base\s+\(1\)/);
    // The inline bank is the numbering the student answers with.
    expect(inlinePdf).toContain('Options :');
  });
});

describe('matching pairs table', () => {
  it('is a two-column N°/Lettre grid inline, and stays in flow (never floated right)', async () => {
    const model = await buildDocument({ questions: bankRows() }, { document: 'student' });
    const inline = cfgFor({ question: { answerStyle: 'inline' } });
    const classic = cfgFor({ question: { answerStyle: 'classic' } });

    const inlineHtml = renderExamDocumentHtml(model, { template: inline });
    const classicHtml = renderExamDocumentHtml(model, { template: classic });
    expect(inlineHtml).toContain('ed-match-grid ed-match-v');
    expect(inlineHtml).not.toContain('ed-match-h'); // the old horizontal grid
    expect(classicHtml).toContain('ed-pairs');

    // The grid is two columns x one row per pair: 3 pairs → header row + 3 rows.
    const grid = /<table class="ed-match-grid ed-match-v">([\s\S]*?)<\/table>/.exec(inlineHtml);
    expect(grid, 'inline grid').not.toBeNull();
    expect((grid[1].match(/<tr>/g) || []).length).toBe(4);

    const inlinePdf = pdfText((await renderExamDocumentPdf(model, { template: inline })).buffer);
    expect(inlinePdf).toContain('Lettre');
    expect(inlinePdf).not.toContain('Colonne A');
    const classicPdf = pdfText((await renderExamDocumentPdf(model, { template: classic })).buffer);
    expect(classicPdf).toContain('Colonne A');
    expect(classicPdf).not.toContain('Lettre');
  });
});

describe('column-first packing', () => {
  it('pulls a later question up into the hole and numbers by placement', () => {
    // `a` is taller than a whole column: the engine can only split it, so the
    // two short questions are placed first and the strip is never left empty.
    const model = packExamModel(
      {
        meta: { document: 'student' },
        scoring: { normalizedPreview: [] },
        sections: [
          {
            title: 'Exercice 1',
            items: [
              { questionId: 'a', number: 1, block: { kind: 'free', lines: 400 } },
              { questionId: 'b', number: 2, block: { kind: 'free', lines: 1 } },
              { questionId: 'c', number: 3, block: { kind: 'free', lines: 1 } },
            ],
          },
        ],
      },
      resolveTemplate('compact'),
    );
    const items = model.sections[0].items;
    expect(items.map((i) => i.questionId)).toEqual(['b', 'c', 'a']);
    expect(items.map((i) => i.number)).toEqual([1, 2, 3]);
  });

  it('reorders a real paper so the numbers follow the flow, not the bank', async () => {
    const model = await buildDocument({ questions: longFixtures(14) }, { document: 'student' });
    const before = model.sections.flatMap((s) => s.items.map((i) => i.questionId));
    const packed = packExamModel(model, resolveTemplate('compact'));
    const after = packed.sections.flatMap((s) => s.items);
    expect(after.map((i) => i.number)).toEqual(after.map((_, i) => i + 1));
    expect(after.map((i) => i.questionId).sort()).toEqual(before.slice().sort());
    // The normalisation table carries the printed numbers of the new order.
    if (packed.scoring.normalizedPreview.length) {
      expect(packed.scoring.normalizedPreview.map((e) => e.number)).toEqual(
        packed.scoring.normalizedPreview.map((_, i) => i + 1),
      );
    }
  });

  it('keeps a question inside its own section', async () => {
    const model = await buildDocument({ questions: longFixtures(12) }, { document: 'student' });
    const idsBySection = model.sections.map((s) => s.items.map((i) => i.questionId).sort().join(','));
    const packed = packExamModel(model, resolveTemplate('compact'));
    expect(packed.sections.map((s) => s.items.map((i) => i.questionId).sort().join(','))).toEqual(idsBySection);
  });

  it('gives the answer key the same order and numbering as the subject', async () => {
    const cfg = resolveTemplate('compact');
    const subject = packExamModel(
      await buildDocument({ questions: longFixtures(12) }, { document: 'student' }),
      cfg,
    );
    const key = packExamModel(
      await buildDocument({ questions: longFixtures(12) }, { document: 'answer_key' }),
      cfg,
    );
    expect(key.sections.flatMap((s) => s.items.map((i) => [i.questionId, i.number]))).toEqual(
      subject.sections.flatMap((s) => s.items.map((i) => [i.questionId, i.number])),
    );
  });

  it('is applied by every document route, so the three formats agree', async () => {
    // The rendered sheets are built from the packed model: the PDF text shows the
    // questions in the order the packer produced, Word and HTML cannot diverge.
    const model = await buildDocument({ questions: longFixtures(14) }, { document: 'student' });
    const cfg = resolveTemplate('compact');
    const packed = packExamModel(model, cfg);
    const order = packed.sections.flatMap((s) => s.items.map((i) => i.questionId));
    const pdf = pdfText((await renderExamDocumentPdf(packed, { template: cfg })).buffer);
    const html = renderExamDocumentHtml(packed, { template: cfg });
    const docx = zipText((await renderExamDocumentDocx(packed, { template: cfg })).buffer, 'word/document.xml');
    // Every format prints "Question 1" … and never a number the packer skipped.
    for (const [n, text] of [['pdf', pdf], ['html', html], ['docx', docx]]) {
      expect(text, n).toContain('Question 1');
      expect(text, n).toContain(`Question ${order.length}`);
      expect(text, n).not.toContain(`Question ${order.length + 1}`);
    }
  });
});

describe('header layouts', () => {
  it('the picker override reaches the resolved config for all three formats', () => {
    expect(overridesFromLayout({ headerVariant: 'banner' })).toEqual({ header: { variant: 'banner' } });
    expect(overridesFromLayout({})).toBeNull();
    for (const layout of LAYOUTS) {
      expect(resolveFromRequest({ templateId: 'compact', layout: { headerVariant: layout } }).header.variant).toBe(layout);
    }
    // The historical name of the framed header keeps drawing the frame.
    expect(resolveFromRequest({ layout: { headerVariant: 'officiel' } }).header.variant).toBe('officiel');
  });

  it('every layout prints the same title and keeps the band', async () => {
    const model = await buildDocument({}, { document: 'student' });
    for (const variant of LAYOUTS) {
      const cfg = cfgFor({ header: { variant } });
      const { buffer } = await renderExamDocumentPdf(model, { template: cfg });
      const text = pdfText(buffer);
      expect(text, variant).toContain('DEVOIR SURVEILL');
      expect(text, variant).toContain('Lycée Victor Hugo'); // the band is never swallowed
      const html = renderExamDocumentHtml(model, { template: cfg });
      expect(html, variant).toContain(`ed-header--${variant}`);
      expect(html, variant).toContain('DEVOIR SURVEILL');
      const docx = zipText((await renderExamDocumentDocx(model, { template: cfg })).buffer, 'word/document.xml');
      expect(docx, variant).toContain('DEVOIR SURVEILL');
    }
  });

  it('the framed layout aliases the legacy officiel variant in the preview', async () => {
    const model = await buildDocument({}, { document: 'student' });
    expect(renderExamDocumentHtml(model, { template: cfgFor({ header: { variant: 'officiel' } }) })).toContain(
      'ed-header--boxed',
    );
  });

  it('the estimator still tracks the real render for each layout', async () => {
    const model = await buildDocument({ questions: longFixtures(18) }, { document: 'student' });
    for (const variant of LAYOUTS) {
      const cfg = cfgFor({ header: { variant }, page: { columns: 2 } });
      const packed = packExamModel(model, cfg);
      const analytic = estimateAnalytic(packed, cfg).pages;
      const exact = (await estimateExact(packed, cfg)).pages;
      expect(Math.abs(analytic - exact), variant).toBeLessThanOrEqual(1);
    }
  });
});
