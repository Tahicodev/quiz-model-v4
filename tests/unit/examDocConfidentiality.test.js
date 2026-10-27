/**
 * tests/unit/examDocConfidentiality.test.js
 *
 * The commercial promise of the whole feature: a student paper can never carry
 * the answer key, not even by accident.
 *
 * Confidentiality here is a property of the DATA PATH, not of CSS:
 *  - the student model has no `answer` / `feedback` field to leak;
 *  - the student HTML omits every confidential token;
 *  - the generated Word package for the student omits them too (its XML is read
 *    back and searched, so a leak in the file itself would fail this test);
 *  - the answer key does contain them, proving the search would notice.
 */

import { describe, it, expect } from 'vitest';
import { renderExamDocumentHtml, renderPrintablePage } from '../../src/backend/services/exam-doc/htmlPreview.js';
import { renderExamDocumentDocx } from '../../src/backend/services/exam-doc/docxRenderer.js';
import { zipText, zipNames } from './helpers/examDocZip.js';
import {
  SECRET_TOKENS,
  buildDocument,
  questionFixtures,
  makeRepo,
  EXAM_ID,
  SCHOOL_ID,
} from './helpers/examDocFixtures.js';
import { ExamDocumentService } from '../../src/backend/services/ExamDocumentService.js';

const GROUPING = { grouping: 'by-category' };

async function bothDocuments(header = GROUPING) {
  const student = await buildDocument({}, { document: 'student', header });
  const key = await buildDocument({}, { document: 'answer_key', header });
  return { student, key };
}

describe('student model', () => {
  it('carries no answer or feedback field on any item', async () => {
    const { student } = await bothDocuments();
    expect(student.items.length).toBeGreaterThan(0);
    for (const item of student.items) {
      expect('answer' in item).toBe(false);
      expect('feedback' in item).toBe(false);
      expect('explanation' in item).toBe(false);
    }
    expect(student.confidentiality.includesAnswers).toBe(false);
    expect(student.confidentiality.strippedForStudent).toEqual(['answer', 'explanation']);
  });

  it('never serializes a confidential token', async () => {
    const { student } = await bothDocuments();
    const json = JSON.stringify(student);
    for (const token of SECRET_TOKENS) {
      expect(json).not.toContain(token);
    }
    // The pairing itself is the secret for matching questions.
    expect(json).not.toContain('France → Paris');
    expect(json).not.toContain('Retour attendu');
  });

  it('keeps the second accepted fill-in alternative off the student paper', async () => {
    const { student } = await bothDocuments();
    const html = renderExamDocumentHtml(student);
    expect(html).not.toContain('illumine');
    expect(html).toContain('____'); // blanks stay blanks
  });
});

describe('student HTML', () => {
  it('omits every confidential token while the key shows all of them', async () => {
    const { student, key } = await bothDocuments();
    const studentHtml = renderExamDocumentHtml(student);
    const keyHtml = renderExamDocumentHtml(key);
    for (const token of SECRET_TOKENS) {
      expect(studentHtml).not.toContain(token);
      expect(keyHtml).toContain(token);
    }
    expect(studentHtml).not.toContain('Retour attendu');
    expect(keyHtml).toContain('Retour attendu');
    expect(studentHtml).not.toContain('→');
    expect(keyHtml).toContain('France → Paris');
  });

  it('labels the key as confidential and the subject as student-facing', async () => {
    const { student, key } = await bothDocuments();
    expect(renderExamDocumentHtml(student)).toContain('ed-paper--student');
    expect(renderExamDocumentHtml(key)).toContain('ed-paper--answer_key');
    const page = renderPrintablePage(key, 'body{}');
    expect(page).toContain('<style');
    expect(page).toContain('ed-print-body');
  });

  it('escapes question text so a stem cannot inject markup', async () => {
    const rows = questionFixtures();
    rows[0].text = '<script>alert(1)</script> & « accents »';
    const model = await buildDocument({ questions: rows }, { document: 'student' });
    const html = renderExamDocumentHtml(model);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('generated Word file', () => {
  it('has no confidential string inside the student package', async () => {
    const model = await buildDocument({}, { document: 'student', header: GROUPING });
    const { buffer } = await renderExamDocumentDocx(model);
    expect(zipNames(buffer)).toContain('word/document.xml');
    const xml = zipText(buffer, 'word/document.xml');
    for (const token of SECRET_TOKENS) {
      expect(xml).not.toContain(token);
    }
    expect(xml).not.toContain('Retour attendu');
    expect(xml).toContain('Quelle est la capitale de la France ?');
  });

  it('does contain them in the answer-key package', async () => {
    const model = await buildDocument({}, { document: 'answer_key', header: GROUPING });
    const { buffer } = await renderExamDocumentDocx(model);
    const xml = zipText(buffer, 'word/document.xml');
    for (const token of SECRET_TOKENS) {
      expect(xml).toContain(token);
    }
    expect(xml).toContain('Retour attendu');
  });
});

describe('service boundary', () => {
  it('only reads the confidential fields when the answer key is requested', async () => {
    const repo = makeRepo({ questions: questionFixtures() });
    const service = new ExamDocumentService(repo);
    const student = await service.buildExamDocument({
      examId: EXAM_ID,
      schoolId: SCHOOL_ID,
      document: 'student',
    });
    // Same source rows, so a leak would be a data-path bug, not a config one.
    expect(student.items.every((item) => !('answer' in item))).toBe(true);
    expect(repo.query).toHaveBeenCalledWith('exam.withQuestions', {
      examId: String(EXAM_ID),
      schoolId: String(SCHOOL_ID),
    });
    // The stored rows were not mutated to build the document.
    expect(repo.questions[0].answer).toBe('Paris');
    expect(repo.questions[0].explanation).toContain('ZÉPHYR-01');
  });

  it('flags a question whose answer is missing instead of inventing one', async () => {
    const rows = questionFixtures();
    rows[0].answer = '';
    rows[2].answer = '';
    const key = await buildDocument({ questions: rows }, { document: 'answer_key' });
    const missing = key.warnings.filter((w) => w.type === 'missing-answer');
    expect(missing.map((w) => w.questionId).sort()).toEqual(['q-fill', 'q-mcq']);
    expect(key.items[0].answer.missing).toBe(true);
    expect(key.items[0].answer.entries).toEqual([]);
    const html = renderExamDocumentHtml(key);
    expect(html).toContain('À compléter par l’enseignant');
  });
});
