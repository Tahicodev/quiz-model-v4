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
 *    two-row grid (numbers, then the empty writing cells) on the inline one —
 *    never a table floated to the right edge, which left a hole next to the stem;
 *  - the paper is PACKED at the model level: columns are filled to the bottom
 *    and questions are numbered in placement order, so the PDF, the Word file and
 *    the preview — which only ever draw the order they are given — cannot
 *    disagree, and the answer key keeps the subject's numbering;
 *  - a header LAYOUT only moves the printed elements: every variant draws the
 *    same title, the picker override reaches the resolved config, and the page
 *    estimator still tracks the real render for each of them;
 *  - the Word file is a real mirror of that pagination: it takes the template
 *    margins and columns, and a two-column sheet keeps its masthead across the
 *    page (a full-width section, then a continuous break into the columns).
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
  it('is a two-row grid (numbers over empty writing cells) inline, and stays in flow', async () => {
    const model = await buildDocument({ questions: bankRows() }, { document: 'student' });
    const inline = cfgFor({ question: { answerStyle: 'inline' } });
    const classic = cfgFor({ question: { answerStyle: 'classic' } });

    const inlineHtml = renderExamDocumentHtml(model, { template: inline });
    const classicHtml = renderExamDocumentHtml(model, { template: classic });
    expect(inlineHtml).toContain('ed-match-grid ed-match-h');
    expect(inlineHtml).not.toContain('ed-match-v'); // the old N°/Lettre column grid
    expect(classicHtml).toContain('ed-pairs');

    // TWO rows whatever the number of pairs: 3 pairs → one row of numbers and one
    // row of three empty cells, never one row per pair.
    const grid = /<table class="ed-match-grid ed-match-h">([\s\S]*?)<\/table>/.exec(inlineHtml);
    expect(grid, 'inline grid').not.toBeNull();
    expect((grid[1].match(/<tr/g) || []).length).toBe(2);
    expect((grid[1].match(/<td/g) || []).length).toBe(6);
    expect(grid[1]).toContain('<tr class="ed-match-num"><td>1</td><td>2</td><td>3</td></tr>');

    const inlinePdf = pdfText((await renderExamDocumentPdf(model, { template: inline })).buffer);
    expect(inlinePdf).toContain('123'); // the numbers row, side by side
    expect(inlinePdf).not.toContain('Colonne A');
    const classicPdf = pdfText((await renderExamDocumentPdf(model, { template: classic })).buffer);
    expect(classicPdf).toContain('Colonne A');
    expect(classicPdf).not.toContain('123');

    // Word mirrors the same shape: single-character cells 1 / 2 / 3 in the
    // numbers row (the writing row under them is empty), no column table.
    const docxXml = zipText((await renderExamDocumentDocx(model, { template: inline })).buffer, 'word/document.xml');
    for (const n of [1, 2, 3]) {
      expect(docxXml, `docx grid number ${n}`).toMatch(new RegExp(`<w:t[^>]*>${n}</w:t>`));
    }
    expect(docxXml).not.toContain('Colonne A');
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

describe('Word mirrors the columned paper', () => {
  /** The `<w:sectPr>` blocks of the exported sheet, in document order. */
  async function sections(model, cfg) {
    const xml = zipText((await renderExamDocumentDocx(model, { template: cfg })).buffer, 'word/document.xml');
    return { xml, sects: xml.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) || [] };
  }

  it('keeps the masthead across the page, above the two columns', async () => {
    const model = await buildDocument({}, { document: 'student' });
    // A one-column paper stays the historical single section.
    const one = await sections(model, resolveTemplate('classique'));
    expect(one.sects).toHaveLength(1);
    expect(one.sects[0]).not.toContain('<w:cols');

    // Two columns split the sheet in two: the header group owns the full page
    // width and the break is continuous, so the masthead is neither squeezed
    // into the left column nor pushed onto a sheet of its own.
    const two = await sections(model, resolveTemplate('ultra'));
    expect(two.sects).toHaveLength(2);
    expect(two.sects[0]).toContain('<w:type w:val="continuous"');
    expect(two.sects[0]).toMatch(/<w:cols w:num="1"/);
    expect(two.sects[1]).toMatch(/<w:cols[^/]*w:num="2"/);
    // The title is printed before the break, i.e. in the full-width group.
    expect(two.xml.indexOf('DEVOIR SURVEILL')).toBeGreaterThan(-1);
    expect(two.xml.indexOf('DEVOIR SURVEILL')).toBeLessThan(two.xml.indexOf('<w:sectPr'));
  });

  it('reserves the footer strip the engine reserves, so the band never sits on a question', async () => {
    const model = await buildDocument({}, { document: 'student' });
    for (const id of ['classique', 'ultra']) {
      const cfg = resolveTemplate(id);
      const { sects } = await sections(model, cfg);
      const bottom = Number(/w:pgMar [^/]*w:bottom="(\d+)"/.exec(sects[sects.length - 1])[1]);
      expect(bottom, id).toBe(Math.round((cfg.margin.bottom + cfg.footerH) * 20));
    }
  });
});
