/**
 * tests/unit/ExamDocumentService.scoring.test.js
 *
 * Barème maths + header persistence for the exam document generator.
 *
 * The invariants that matter commercially:
 *  - the printed total is derived from the stored points, each question counted
 *    exactly once;
 *  - a paper whose points do not add up to 20 is refused, and the proposed
 *    normalization is deterministic, proportional and sums to exactly 20.00;
 *  - normalization is document-only: it needs an explicit confirmation and never
 *    writes to the exam or its questions;
 *  - the header is a merged slice of options_json, so the legacy
 *    `presetSnapshot` / `classes` blobs keep surviving.
 */

import { describe, it, expect } from 'vitest';
import {
  ExamDocumentService,
  normalizeWeights,
} from '../../src/backend/services/ExamDocumentService.js';
import { ValidationError, NotFoundError } from '../../src/shared/errors.js';
import {
  EXAM_ID,
  SCHOOL_ID,
  DEFAULT_POINTS,
  makeRepo,
  makeService,
  buildDocument,
  questionFixtures,
  EXAM_OPTIONS_JSON,
} from './helpers/examDocFixtures.js';

const sum = (list) => list.reduce((acc, n) => acc + n, 0);

describe('normalizeWeights() — largest remainder at 0.25 granularity', () => {
  it('sums to exactly 20 for awkward totals', () => {
    for (const weights of [[1, 1, 1], [3, 3, 3, 3, 3], [1, 2], [7, 5, 3, 1], [1], [13, 7]]) {
      const out = normalizeWeights(weights);
      expect(sum(out)).toBeCloseTo(20, 10);
      expect(out).toHaveLength(weights.length);
    }
  });

  it('lands on 0.25 steps only', () => {
    normalizeWeights([2, 3, 5, 9]).forEach((points) => {
      expect(Math.round(points * 4)).toBeCloseTo(points * 4, 10);
    });
  });

  it('stays proportional: bigger natural weight never prints fewer points', () => {
    const weights = [1, 2, 6];
    const out = normalizeWeights(weights);
    expect(out[2]).toBeGreaterThan(out[1]);
    expect(out[1]).toBeGreaterThan(out[0]);
  });

  it('is deterministic and order-stable for identical input', () => {
    const a = normalizeWeights([3, 1, 4, 1, 5]);
    const b = normalizeWeights([3, 1, 4, 1, 5]);
    expect(a).toEqual(b);
  });

  it('never invents points for zero-weight questions', () => {
    const out = normalizeWeights([0, 10, 10]);
    expect(out[0]).toBe(0);
    expect(sum(out)).toBeCloseTo(20, 10);
  });

  it('returns the target untouched when the weights already add up', () => {
    expect(normalizeWeights([10, 6, 4])).toEqual([10, 6, 4]);
  });
});

describe('ExamDocumentService — natural scoring', () => {
  it('totals the stored points and reports a valid /20', async () => {
    const model = await buildDocument({}, { document: 'student' });
    expect(model.scoring.naturalTotal).toBe(20);
    expect(model.scoring.total).toBe(20);
    expect(model.scoring.valid20).toBe(true);
    expect(model.scoring.label).toBe('20 / 20');
    expect(model.scoring.error).toBeUndefined();
  });

  it('counts every question exactly once', async () => {
    const model = await buildDocument({}, { document: 'student' });
    expect(model.items).toHaveLength(DEFAULT_POINTS.length);
    expect(sum(model.items.map((i) => i.naturalPoints))).toBe(model.scoring.naturalTotal);
    // Same numbers on the answer key: the two documents cannot disagree.
    const key = await buildDocument({}, { document: 'answer_key' });
    expect(key.scoring.naturalTotal).toBe(model.scoring.naturalTotal);
    expect(key.items.map((i) => i.questionId)).toEqual(model.items.map((i) => i.questionId));
  });

  it('lets points_override win over the question default', async () => {
    const rows = questionFixtures();
    rows[0].points_override = 5;
    rows[1].points_override = 1;
    const model = await buildDocument({ questions: rows }, { document: 'student' });
    expect(model.items[0].points).toBe(5);
    expect(model.items[1].points).toBe(1);
    expect(model.scoring.naturalTotal).toBe(20 - DEFAULT_POINTS[0] - DEFAULT_POINTS[1] + 5 + 1);
  });

  it('treats a missing point value as 1 and an explicit 0 as 0', async () => {
    const rows = questionFixtures([null, 0, 2, 3, 4, 2, 2, 2]);
    const model = await buildDocument({ questions: rows }, { document: 'student' });
    expect(model.items[0].points).toBe(1);
    expect(model.items[1].points).toBe(0);
  });

  it('refuses a total that is not /20 and reports the delta', async () => {
    const model = await buildDocument({ questions: questionFixtures([3, 3]) }, { document: 'student' });
    expect(model.scoring.valid20).toBe(false);
    expect(model.scoring.error.code).toBe('TOTAL_NOT_20');
    expect(model.scoring.error.naturalTotal).toBe(6);
    expect(model.scoring.error.delta).toBe(14);
  });

  it('groups by real category name when asked, preserving first appearance', async () => {
    const model = await buildDocument(
      {},
      { document: 'student', header: { grouping: 'by-category' } },
    );
    expect(model.sections).toHaveLength(2);
    expect(model.sections[0].title).toBe('Exercice 1 · Grammaire');
    expect(model.sections[1].title).toBe('Exercice 2 · Sciences');
    expect(sum(model.sections.map((s) => s.subtotal))).toBe(20);
    // Every question still appears exactly once across the sections.
    const flat = model.sections.flatMap((s) => s.items.map((i) => i.questionId));
    expect(new Set(flat).size).toBe(flat.length);
  });

  it('keeps a single flat sequence by default', async () => {
    const model = await buildDocument({}, { document: 'student' });
    expect(model.sections).toHaveLength(1);
    expect(model.sections[0].title).toBeNull();
    expect(model.scoring.sections).toEqual([
      { id: 'all', title: null, subtotal: 20 },
    ]);
  });

  it('reports legacy exams whose questions were never saved', async () => {
    await expect(buildDocument({ questions: [] }, { document: 'student' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('ExamDocumentService — confirmed normalization on paper only', () => {
  it('refuses to normalize without an explicit confirmation', async () => {
    const model = await buildDocument(
      { questions: questionFixtures([1, 1, 1]) },
      { document: 'student', normalization: { mode: 'scale-to-20', confirmed: false } },
    );
    expect(model.scoring.error.code).toBe('NORMALIZATION_NOT_CONFIRMED');
    expect(model.scoring.total).toBe(3);
    expect(model.scoring.normalized).toBe(false);
    expect(model.scoring.normalizedPreview).toHaveLength(3);
  });

  it('applies the preview once confirmed and keeps the stored rows untouched', async () => {
    const rows = questionFixtures([1, 2, 6]);
    const model = await buildDocument(
      { questions: rows },
      { document: 'student', normalization: { mode: 'scale-to-20', confirmed: true } },
    );
    expect(model.scoring.error).toBeUndefined();
    expect(model.scoring.total).toBe(20);
    expect(model.scoring.normalized).toBe(true);
    expect(model.scoring.mode).toBe('scale-to-20');
    expect(sum(model.items.map((i) => i.points))).toBeCloseTo(20, 10);
    expect(model.items.map((i) => i.points)).toEqual(
      model.scoring.normalizedPreview.map((e) => e.to),
    );
    // Natural points stay visible for the teacher, and nothing was written back.
    expect(model.items.map((i) => i.naturalPoints)).toEqual([1, 2, 6]);
    expect(rows.map((r) => r.points)).toEqual([1, 2, 6]);
  });

  it('footnotes the normalized barème so the paper is honest', async () => {
    const model = await buildDocument(
      { questions: questionFixtures([1, 1, 1]) },
      { document: 'student', normalization: { mode: 'scale-to-20', confirmed: true } },
    );
    expect(model.header.scaleNote).toContain('normalisé sur 20');
    expect(model.header.totalLabel).toBe('20 / 20');
  });

  it('recomputes section subtotals after normalization', async () => {
    const model = await buildDocument(
      { questions: questionFixtures([1, 1, 1, 1]) },
      {
        document: 'student',
        header: { grouping: 'by-category' },
        normalization: { mode: 'scale-to-20', confirmed: true },
      },
    );
    expect(sum(model.sections.map((s) => s.subtotal))).toBeCloseTo(20, 10);
    expect(sum(model.scoring.sections.map((s) => s.subtotal))).toBeCloseTo(20, 10);
  });

  it('generating a document never writes to the database', async () => {
    const { repo, service } = makeService({ questions: questionFixtures([3, 3]) });
    await service.buildExamDocument({ examId: EXAM_ID, schoolId: SCHOOL_ID, document: 'answer_key' });
    await service.resolveHeader(EXAM_ID, SCHOOL_ID);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.updates).toEqual([]);
  });
});

describe('ExamDocumentService — header resolve / persist', () => {
  it('prefills from real rows only and never invents the rest', async () => {
    const { service } = makeService();
    const { header } = await service.resolveHeader(EXAM_ID, SCHOOL_ID);
    expect(header.schoolName).toBe('Lycée Victor Hugo');
    expect(header.academicYear).toBe('2025-2026');
    expect(header.logoUrl).toBe('/uploads/school-logo.png');
    expect(header.teacherName).toBe('Mme Aïchouche');
    expect(header.title).toBe('Devoir surveillé n°1');
    expect(header.durationMinutes).toBe(60);
    expect(header.level).toBe('3ème A');
    // Mixed categories => no invented subject; ministry/term/date/group stay null.
    expect(header.subject).toBeNull();
    expect(header.ministry).toBeNull();
    expect(header.academy).toBeNull();
    expect(header.term).toBeNull();
    expect(header.date).toBeNull();
    expect(header.group).toBeNull();
  });

  it('derives the subject when every question shares one category', async () => {
    const rows = questionFixtures().map((r) => ({ ...r, category_id: 'cat-grammar' }));
    const { service } = makeService({ questions: rows });
    const { header } = await service.resolveHeader(EXAM_ID, SCHOOL_ID);
    expect(header.subject).toBe('Grammaire');
  });

  it('persists only the examDocHeader slice and preserves the legacy blob', async () => {
    const { repo, service } = makeService();
    await service.saveHeader(EXAM_ID, SCHOOL_ID, { ministry: 'Ministère X', title: 'DS de remplacement' });
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update.mock.calls[0][0]).toBe('exams');
    expect(repo.update.mock.calls[0][1]).toBe(EXAM_ID);
    const written = JSON.parse(repo.update.mock.calls[0][2].options_json);
    expect(written.examDocHeader).toMatchObject({ ministry: 'Ministère X', title: 'DS de remplacement' });
    expect(written.presetSnapshot).toEqual(JSON.parse(EXAM_OPTIONS_JSON).presetSnapshot);
    expect(written.classes).toEqual(['3ème A', '3ème B']);
  });

  it('merges saved values over defaults and keeps untouched fields', async () => {
    const { service } = makeService();
    await service.saveHeader(EXAM_ID, SCHOOL_ID, { term: 'Trimestre 2' });
    const { header, saved } = await service.resolveHeader(EXAM_ID, SCHOOL_ID);
    expect(header.term).toBe('Trimestre 2');
    expect(header.schoolName).toBe('Lycée Victor Hugo');
    expect(saved.schoolName).toBeUndefined();
  });

  it('refuses oversized or unknown header input instead of trusting the client', async () => {
    const { repo, service } = makeService();
    const result = await service.saveHeader(EXAM_ID, SCHOOL_ID, {
      ministry: 'M'.repeat(400), // over the 160-char cap
      logoScale: 99, // out of the 0.2-1.5 range
      notAField: 'surprise',
    });
    // Nothing half-saved: the invalid slice is rejected as a whole...
    expect(result.header.ministry).toBeUndefined();
    expect(result.header.logoScale).toBeUndefined();
    expect(result.header.notAField).toBeUndefined();
    // ...and the legacy blob is still intact.
    const written = JSON.parse(repo.update.mock.calls[0][2].options_json);
    expect(written.presetSnapshot).toBeTruthy();
    expect(written.classes).toEqual(['3ème A', '3ème B']);
  });

  it('persists only in-range known fields for a valid header', async () => {
    const { repo, service } = makeService();
    await service.saveHeader(EXAM_ID, SCHOOL_ID, { ministry: 'Ministère X', logoScale: 1.2 });
    const written = JSON.parse(repo.update.mock.calls[0][2].options_json).examDocHeader;
    expect(written.ministry).toBe('Ministère X');
    expect(written.logoScale).toBe(1.2);
    expect(Object.keys(written).every((key) => key !== 'notAField')).toBe(true);
  });

  it('applies unsaved header edits to the model without persisting them', async () => {
    const { repo, service } = makeService();
    const model = await service.buildExamDocument({
      examId: EXAM_ID,
      schoolId: SCHOOL_ID,
      document: 'student',
      header: { title: 'Aperçu avec brouillon', grouping: 'by-category' },
    });
    expect(model.header.title).toBe('Aperçu avec brouillon');
    expect(model.sections).toHaveLength(2);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('raises NotFoundError for an exam the tenant does not have', async () => {
    const repo = makeRepo();
    repo.query.mockResolvedValue(null);
    const service = new ExamDocumentService(repo);
    await expect(service.resolveHeader('missing', SCHOOL_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
