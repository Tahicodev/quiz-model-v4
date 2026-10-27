/**
 * tests/unit/examDocDocx.test.js
 *
 * A .docx is a ZIP of XML parts, so the checks read the package back
 * (`helpers/examDocZip.js`) and look at what Word would actually display:
 * the document body, the header/footer parts and the embedded media.
 *
 * DOCX carries the original text untouched — no WinAnsi transliteration is
 * applied here, which is exactly what the PDF path does and why both formats
 * are offered.
 */

import { describe, it, expect } from 'vitest';
import { renderExamDocumentDocx } from '../../src/backend/services/exam-doc/docxRenderer.js';
import { ExamDocumentService } from '../../src/backend/services/ExamDocumentService.js';
import { zipData, zipNames, zipText } from './helpers/examDocZip.js';
import { makeBrokenPng, makePng, pngDataUrl } from './helpers/examDocPng.js';
import {
  EXAM_ID,
  SCHOOL_ID,
  SECRET_TOKENS,
  buildDocument,
  longFixtures,
  makeRepo,
  questionFixtures,
} from './helpers/examDocFixtures.js';

/** Real PNG bytes, produced by `helpers/examDocPng.js`, as an upload data URL. */
const LOGO_DATA_URL = pngDataUrl(makePng({ width: 8, height: 4 }));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function serviceFor(rows, buildArgs) {
  return new ExamDocumentService(makeRepo({ questions: rows })).buildExamDocument({
    examId: EXAM_ID,
    schoolId: SCHOOL_ID,
    ...buildArgs,
  });
}

async function renderDocx(model, options) {
  const { buffer, warnings } = await renderExamDocumentDocx(model, options);
  const parts = new Map(zipNames(buffer).map((name) => [name, zipText(buffer, name)]));
  return { buffer, warnings, parts, xml: parts.get('word/document.xml') || '' };
}

describe('word package', () => {
  it('is a ZIP Office Open XML package with the parts Word needs', async () => {
    const model = await buildDocument({}, { document: 'student' });
    const { buffer, parts } = await renderDocx(model);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    for (const part of [
      '[Content_Types].xml',
      'word/document.xml',
      'word/styles.xml',
      'word/header1.xml',
      'word/footer1.xml',
      'word/numbering.xml',
    ]) {
      expect(zipNames(buffer)).toContain(part);
    }
    expect(parts.get('docProps/core.xml')).toContain('Devoir surveill');
  });

  it('declares A4 page size and margins in the section properties', async () => {
    const model = await buildDocument({}, { document: 'student' });
    const { xml } = await renderDocx(model);
    // Word measures in twentieths of a point: A4 = 11906 × 16838.
    expect(xml).toContain('<w:pgSz w:w="11906" w:h="16838"');
    expect(xml).toContain('<w:pgMar');
  });

  it('uses live page fields, so the numbers follow the printed document', async () => {
    const model = await buildDocument({}, { document: 'student' });
    const { parts } = await renderDocx(model);
    const footer = parts.get('word/footer1.xml');
    expect(footer).toContain('PAGE');
    expect(footer).toContain('NUMPAGES');
    expect(footer).toContain('Devoir surveillé n°1');
  });

  it('marks the answer key as confidential in the running header', async () => {
    const model = await buildDocument({}, { document: 'answer_key' });
    const { parts } = await renderDocx(model);
    expect(parts.get('word/header1.xml')).toContain('CORRIGÉ — Devoir surveillé n°1 — confidentiel');
  });

  it('lays the paper out the same way as the PDF for a long exam', async () => {
    const model = await serviceFor(longFixtures(26), { document: 'student' });
    const { xml } = await renderDocx(model);
    expect(xml).toContain('Question 1');
    expect(xml).toContain('Question 26');
    expect(xml).toContain('Question 13');
  });
});

describe('document body', () => {
  it('prints the question stems, the options and the answer boxes', async () => {
    const model = await buildDocument({}, { document: 'student' });
    const { xml } = await renderDocx(model);
    expect(xml).toContain('Quelle est la capitale de la France ?');
    expect(xml).toContain('○ A.'); // radio marker keeps the real glyph in Word
    expect(xml).toContain('B.');
    expect(xml).toContain('Paris');
    expect(xml).toContain('Barème : 20 points'); // the subject states the barème, not a grade
    expect(xml).not.toContain('Note : 20 / 20');
    expect(xml).toContain('— Fin du sujet —');
  });

  it('prints the sections, the subtotals and the per-question points', async () => {
    const model = await buildDocument({}, { document: 'student', header: { grouping: 'by-category' } });
    const { xml } = await renderDocx(model);
    expect(xml).toContain('Grammaire');
    expect(xml).toContain('Sciences');
    expect(xml).toContain('(10 pts)'); // each category sums to half the barème
    expect(xml).toContain('3 pts'); // first question weight
  });

  it('keeps the confidential strings out of the student body and shows them in the key', async () => {
    const studentDoc = await renderDocx(await buildDocument({}, { document: 'student' }));
    const keyDoc = await renderDocx(await buildDocument({}, { document: 'answer_key' }));
    for (const token of SECRET_TOKENS) {
      expect(studentDoc.xml).not.toContain(token);
      expect(keyDoc.xml).toContain(token);
    }
    expect(studentDoc.xml).not.toContain('France →');
    expect(keyDoc.xml).toContain('France → Paris');
    expect(keyDoc.xml).toContain('Retour attendu');
    // The fixtures carry a real answer for every question: no placeholder may
    // leak into a finished answer key.
    expect(keyDoc.xml).not.toContain('À compléter par l’enseignant');
  });

  it('writes characters untouched that the PDF has to transliterate', async () => {
    const rows = questionFixtures();
    rows[0].text = 'Calculez π × r² avec r ≤ 5.';
    const model = await serviceFor(rows, { document: 'student' });
    const { xml, warnings } = await renderDocx(model);
    expect(xml).toContain('π');
    expect(xml).toContain('≤');
    expect(xml).toContain('²');
    expect(warnings.filter((w) => w.type === 'unicode-substitution')).toEqual([]);
  });

  it('shows the adjusted barème when normalization was confirmed', async () => {
    const rows = questionFixtures([4, 4, 4, 4, 4, 4, 4, 4]);
    const model = await serviceFor(rows, {
      document: 'student',
      normalization: { mode: 'scale-to-20', confirmed: true },
    });
    const { xml } = await renderDocx(model);
    expect(xml).toContain('Barème : 20 points');
    expect(xml).toContain('2,5 pts');
    expect(xml).toContain('normalisé sur 20');
  });
});

describe('images inside the Word file', () => {
  it('embeds an uploaded logo as a media part', async () => {
    const model = await buildDocument({}, {
      document: 'student',
      header: { logoDataUrl: LOGO_DATA_URL },
    });
    const { buffer, warnings, parts } = await renderDocx(model);
    const media = zipNames(buffer).filter((name) => /\.(png|jpe?g)$/i.test(name));
    expect(media.length).toBeGreaterThan(0);
    expect(warnings.filter((w) => w.type === 'image-skipped')).toEqual([]);
    // The stored bytes are the image itself, not a placeholder.
    expect(zipData(buffer, media[0]).subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(parts.get('word/document.xml')).toContain('<w:drawing>');
  });

  it('skips a corrupt upload with a warning instead of producing a broken file', async () => {
    const model = await buildDocument({}, {
      document: 'student',
      header: { logoDataUrl: pngDataUrl(makeBrokenPng()) },
    });
    const { buffer, xml, warnings } = await renderDocx(model);
    expect(warnings.some((w) => w.type === 'image-skipped')).toBe(true);
    expect(xml).not.toContain('<w:drawing>');
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
  });

  it('skips a missing picture with a warning instead of breaking the file', async () => {
    const rows = questionFixtures();
    rows[0].media_url = '/uploads/gone.png';
    const model = await serviceFor(rows, { document: 'student' });
    const { xml, warnings } = await renderDocx(model, { uploadsDir: './does-not-exist' });
    expect(warnings.some((w) => w.type === 'image-skipped')).toBe(true);
    expect(xml).toContain('Quelle est la capitale de la France ?');
  });
});
