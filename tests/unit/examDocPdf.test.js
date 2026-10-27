/**
 * tests/unit/examDocPdf.test.js
 *
 * The PDF is what a teacher puts on the photocopier, so the assertions are made
 * on the produced file: its magic bytes, its page geometry, and the text a
 * reader will actually see (recovered from the compressed content streams by
 * `helpers/examDocPdf.js`).
 *
 * It also locks the footer regression: stamping "Page i / n" writes BELOW the
 * text area, and without an explicit box height pdfkit turns every footer into
 * a new blank page — the file then declares more pages than the renderer
 * reported.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  renderExamDocumentPdf,
  PDF_PAGE,
  PDF_MARGIN,
} from '../../src/backend/services/exam-doc/pdfRenderer.js';
import { toWinAnsi } from '../../src/backend/services/exam-doc/text.js';
import { ExamDocumentService } from '../../src/backend/services/ExamDocumentService.js';
import { pdfPageCount, pdfPageTexts, pdfText } from './helpers/examDocPdf.js';
import { makeBrokenPng, makePng, pngDataUrl } from './helpers/examDocPng.js';
import {
  CATEGORY_GRAMMAR,
  CATEGORY_SCIENCE,
  CREATOR_ID,
  EXAM_ID,
  SCHOOL_ID,
  SECRET_TOKENS,
  buildDocument,
  longFixtures,
  makeRepo,
  questionFixtures,
} from './helpers/examDocFixtures.js';

const A4_MEDIA_BOX = '/MediaBox [0 0 ' + PDF_PAGE.width + ' ' + PDF_PAGE.height + ']';
/** Real PNG bytes, produced by `helpers/examDocPng.js`, as an upload data URL. */
const LOGO_DATA_URL = pngDataUrl(makePng({ width: 8, height: 4 }));

function serviceFor(rows, buildArgs) {
  return new ExamDocumentService(makeRepo({ questions: rows })).buildExamDocument({
    examId: EXAM_ID,
    schoolId: SCHOOL_ID,
    ...buildArgs,
  });
}

describe('pdf file shape', () => {
  it('is a real PDF document, not an HTML printout', async () => {
    const model = await buildDocument({}, { document: 'student' });
    const { buffer } = await renderExamDocumentPdf(model);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.toString('latin1')).toContain('%%EOF');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('uses A4 portrait with the declared margin on every page', async () => {
    const model = await buildDocument({}, { document: 'student' });
    const { buffer, pages } = await renderExamDocumentPdf(model);
    const raw = buffer.toString('latin1');
    expect(PDF_PAGE).toMatchObject({ width: 595.28, height: 841.89 });
    expect(PDF_MARGIN).toBe(42);
    const boxes = raw.match(/\/MediaBox \[[^\]]*\]/g) || [];
    expect(boxes.length).toBeGreaterThanOrEqual(pages);
    for (const box of boxes) expect(box).toBe(A4_MEDIA_BOX);
  });

  it('reports exactly as many pages as the file declares (footer stamping must not add pages)', async () => {
    for (const document of ['student', 'answer_key']) {
      const model = await buildDocument({}, { document });
      const { pages, buffer } = await renderExamDocumentPdf(model);
      expect(pages).toBeGreaterThan(1);
      expect(pdfPageCount(buffer)).toBe(pages);
    }
  });

  it('breaks a long exam over several pages', async () => {
    const model = await serviceFor(longFixtures(26), { document: 'student' });
    const { pages, buffer } = await renderExamDocumentPdf(model);
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pdfPageCount(buffer)).toBe(pages);
  });
});

describe('text printed on the paper', () => {
  let student;
  let key;
  let studentText;
  let keyText;

  beforeAll(async () => {
    student = await buildDocument({}, { document: 'student', header: { grouping: 'by-category' } });
    key = await buildDocument({}, { document: 'answer_key', header: { grouping: 'by-category' } });
    studentText = pdfText((await renderExamDocumentPdf(student)).buffer);
    keyText = pdfText((await renderExamDocumentPdf(key)).buffer);
  });

  it('shows the question numbering, the stems and the answer boxes', () => {
    expect(studentText).toContain('Question 1');
    expect(studentText).toContain('Question 8');
    expect(studentText).toContain('Quelle est la capitale de la France ?');
    expect(studentText).toContain('( ) A. Paris'); // radio marker spelled in ASCII
    expect(studentText).toContain('[ ]'); // checkbox marker for multi answers
    expect(studentText).toContain('Reliez chaque pays à sa capitale.');
  });

  it('keeps French accents and typographic signs as written', () => {
    expect(studentText).toContain('Lycée Victor Hugo');
    expect(studentText).toContain('Devoir surveillé n°1');
    expect(studentText).toContain('Un chat est un mammifère.');
    expect(studentText).toContain('quel mot constitue le noyau du groupe nominal sujet ?');
    expect(studentText).toContain('Entourez l’intrus de la série.'); // U+2019 is WinAnsi
  });

  it('prints the barème without giving the grade away on the subject', () => {
    expect(studentText).not.toContain('Note : 20 / 20'); // the answer stays off the student paper
    expect(studentText).toContain('NOTE'); // empty grade box instead
    expect(studentText).toContain('/ 20');
    expect(studentText).toContain('3 pts');
    expect(studentText).toContain('Barème : 20 points');
    expect(keyText).toContain('Total : 20 / 20');
    expect(studentText).toContain('Grammaire');
    expect(studentText).toContain('Sciences');
  });

  it('prints the header information the teacher can fill on paper', () => {
    // School, level, year, teacher, duration: the institutional block must be
    // readable, and an unfilled date has to stay a blank to write on.
    expect(studentText).toContain('Lycée Victor Hugo');
    expect(studentText).toContain('3ème A');
    expect(studentText).toContain('Année scolaire 2025-2026');
    expect(studentText).toContain('Enseignant : Mme Aïchouche');
    expect(studentText).toContain('Durée : 60 min');
    expect(studentText).toContain('Date : ____/____/______');
    expect(studentText).toContain('Nom & prénom :');
  });

  it('stamps a numbered footer on every page and closes the paper', async () => {
    const { buffer, pages } = await renderExamDocumentPdf(student);
    const text = pdfText(buffer);
    for (let i = 1; i <= pages; i += 1) {
      expect(text).toContain('Page ' + i + ' / ' + pages);
    }
    expect(text).toContain('— Fin du sujet —');
    expect(keyText).toContain('— Fin du corrigé —');
    expect(keyText).toContain('CORRIGÉ — Devoir surveillé n°1 — confidentiel');
  });

  it('never puts an answer or an explanation on the student paper', () => {
    for (const token of SECRET_TOKENS) {
      expect(studentText).not.toContain(token);
      expect(keyText).toContain(token);
    }
    // 'Paris' is a printed option on the subject; what must never appear is the
    // pairing itself, and the arrow has no WinAnsi glyph, so the key shows the
    // reported ASCII spelling — never a mangled box.
    expect(studentText).not.toContain('France ->');
    expect(studentText).not.toContain('Italie ->');
    expect(keyText).toContain('France -> Paris');
    expect(keyText).toContain('Italie -> Rome');
  });
});

describe('normalization is visible on paper', () => {
  it('prints the 20-point barème and says it was adjusted for printing', async () => {
    const rows = questionFixtures([4, 4, 4, 4, 4, 4, 4, 4]); // 32 points naturally
    const model = await serviceFor(rows, {
      document: 'student',
      normalization: { mode: 'scale-to-20', confirmed: true },
    });
    expect(model.scoring.normalized).toBe(true);
    expect(model.items.map((item) => item.points)).toEqual([2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5]);
    const text = pdfText((await renderExamDocumentPdf(model)).buffer);
    expect(text).toContain('Barème : 20 points');
    expect(text).not.toContain('Note : 20 / 20');
    expect(text).toContain('normalisé sur 20');
    expect(text).toContain('2,5 pts'); // French decimal sign on paper
  });
});

describe('page breaks', () => {
  /** Two long stems and a 12-row matching table: the table cannot avoid the bottom limit. */
  function pairHeavyFixtures() {
    const stem = (n) =>
      `Question ${n} — ` +
      'Dans un texte de plusieurs paragraphes, l’élève doit retrouver les notions étudiées, les ' +
      'définir avec ses propres mots et illustrer chaque définition par un exemple personnel. '.repeat(2);
    const pairs = Array.from({ length: 12 }, (_, i) => ({ left: `Ville ${i + 1}`, right: `Pays ${i + 1}` }));
    return [
      { id: 'q-torn-a', type: 'mcq', text: stem(1), options_json: JSON.stringify(['Un', 'Deux', 'Trois']), answer: 'Un', explanation: 'ZÉPHYR-TORN-A', category_id: CATEGORY_GRAMMAR },
      { id: 'q-torn-b', type: 'mcq', text: stem(2), options_json: JSON.stringify(['Quatre', 'Cinq']), answer: 'Cinq', explanation: 'ZÉPHYR-TORN-B', category_id: CATEGORY_SCIENCE },
      { id: 'q-torn-c', type: 'match', text: 'Reliez chaque ville à son pays.', options_json: null, answer: JSON.stringify(pairs), explanation: 'ZÉPHYR-TORN-C', category_id: CATEGORY_SCIENCE },
    ].map((row, index) => ({
      ...row,
      points: [4, 8, 8][index],
      order_index: index,
      points_override: null,
      school_id: SCHOOL_ID,
      created_by: CREATOR_ID,
      media_url: null,
    }));
  }

  it('keeps a table on one sheet instead of tearing it across pages', async () => {
    // Regression: an unguarded row drew its frame below the bottom limit and
    // pdfkit then started a page per `text()` call — a 12-row table became 12
    // pages, and the footer reported "Page 30 / 34".
    const model = await serviceFor(pairHeavyFixtures(), { document: 'student' });
    const { pages, buffer } = await renderExamDocumentPdf(model);
    const perPage = pdfPageTexts(buffer);
    expect(pdfPageCount(buffer)).toBe(pages);
    expect(pages).toBeLessThanOrEqual(perPage.length + 1);
    expect(pages).toBeLessThanOrEqual(3);

    const tablePage = perPage.findIndex((text) => text.includes('Colonne A'));
    expect(tablePage).toBeGreaterThanOrEqual(0);
    // The heading, the instruction and every row live with the table.
    expect(perPage[tablePage]).toContain('Question 3');
    expect(perPage[tablePage]).toContain('Reliez chaque ville à son pays.');
    expect(perPage[tablePage]).toContain('Ville 12');
    expect(perPage[tablePage]).toContain('Pays 12');
    // Page numbering counts the sheets that really exist.
    expect(perPage[tablePage]).toContain(`Page ${tablePage + 1} / ${pages}`);
  });

  it('never splits the masthead from the identity fields', async () => {
    const model = await serviceFor(questionFixtures(), { document: 'student' });
    const { buffer } = await renderExamDocumentPdf(model);
    const first = pdfPageTexts(buffer)[0];
    expect(first).toContain('Lycée Victor Hugo');
    expect(first).toContain('NOTE');
    expect(first).toContain('Nom & prénom :');
    expect(first).toContain('Question 1');
  });
});

describe('glyph fallback and images', () => {
  it('transliterates characters outside WinAnsi and reports them', async () => {
    const rows = questionFixtures();
    rows[0].text = 'Calculez π × r² avec r ≤ 5, puis reliez A → B.';
    const model = await serviceFor(rows, { document: 'student' });
    const { warnings, buffer } = await renderExamDocumentPdf(model);
    const substitution = warnings.filter((w) => w.type === 'unicode-substitution');
    expect(substitution).toHaveLength(1); // aggregated, not one per occurrence
    expect(substitution[0].message).toContain('π');
    expect(substitution[0].message).toContain('≤');
    const text = pdfText(buffer);
    expect(text).toContain('pi');
    expect(text).toContain('<=');
    expect(text).not.toContain('≤');
    // Characters that WinAnsi does have are untouched.
    expect(text).toContain('Calculez');
  });

  it('toWinAnsi keeps the French set and spells out the rest', () => {
    const accented = toWinAnsi('À la bibliothèque de l’École, « élève œ » — 20°');
    expect(accented.text).toBe('À la bibliothèque de l’École, « élève œ » — 20°');
    expect(accented.substitutions).toEqual([]);

    const math = toWinAnsi('a ≤ b ≠ c √d π');
    expect(math.text).toBe('a <= b != c sqrtd pi');
    expect(math.substitutions.sort()).toEqual(['≠', '≤', '√', 'π'].sort());

    const unknown = toWinAnsi('书');
    expect(unknown.text).toBe('?');
    expect(unknown.substitutions).toEqual(['书']);
  });

  it('skips a missing logo with a warning instead of failing the paper', async () => {
    const model = await buildDocument({}, {
      document: 'student',
      header: { logoUrl: '/uploads/not-there.png', logoDataUrl: null },
    });
    const { warnings, buffer, pages } = await renderExamDocumentPdf(model, { uploadsDir: './does-not-exist' });
    expect(warnings.some((w) => w.type === 'image-skipped')).toBe(true);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages).toBeGreaterThan(1);
  });

  it('embeds a real image instead of dropping it', async () => {
    const model = await buildDocument({}, {
      document: 'student',
      header: { logoDataUrl: LOGO_DATA_URL },
    });
    const { warnings, buffer } = await renderExamDocumentPdf(model);
    expect(warnings.filter((w) => w.type === 'image-skipped')).toEqual([]);
    expect(buffer.toString('latin1')).toContain('/Subtype /Image');
    expect(pdfPageCount(buffer)).toBeGreaterThan(0);
  });

  it('skips a corrupt upload with a warning instead of hanging the export', async () => {
    // pdfkit inflates images asynchronously: without the pre-check in
    // `resolveImage`, undecodable bytes escape every try/catch and the request
    // never answers. The paper must still be produced.
    const model = await buildDocument({}, {
      document: 'student',
      header: { logoDataUrl: pngDataUrl(makeBrokenPng()) },
    });
    const { warnings, buffer } = await renderExamDocumentPdf(model);
    expect(warnings.some((w) => w.type === 'image-skipped')).toBe(true);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('falls back to standard fonts when EXAM_DOC_FONT_TTF points at an unreadable file', async () => {
    const model = await buildDocument({}, { document: 'student' });
    // An existing file that is not a font: registration is attempted and fails
    // loudly, the paper is still produced with the standard faces.
    const { warnings, buffer } = await renderExamDocumentPdf(model, { fontTtf: './package.json' });
    expect(warnings.some((w) => w.type === 'font-fallback')).toBe(true);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
