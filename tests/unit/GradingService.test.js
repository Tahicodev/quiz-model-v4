/**
 * tests/unit/GradingService.test.js
 *
 * Server-side grading must mirror the student workspace comparison
 * semantics (`trainingAnswersEqual` in student-workspace.js) for every
 * question type, including the `multi::` / `meta::` persistence encodings.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeQuestionType,
  decodeStoredAnswer,
  parseMatchingPairs,
  isAnswerCorrect,
  gradeAttempt,
  grade20,
  isPassingGrade20,
} from '../../src/backend/services/GradingService.js';

describe('normalizeQuestionType', () => {
  it('maps aliases to canonical types', () => {
    expect(normalizeQuestionType({ type: 'mcq' })).toBe('multiple-choice');
    expect(normalizeQuestionType({ type: 'multi-select' })).toBe('multiple-choice-multi');
    expect(normalizeQuestionType({ type: 'boolean' })).toBe('true-false');
    expect(normalizeQuestionType({ type: 'cloze' })).toBe('fill-blank');
    expect(normalizeQuestionType({ type: 'order' })).toBe('draggable');
    expect(normalizeQuestionType({ type: 'odd' })).toBe('odd-one-out');
    expect(normalizeQuestionType({ type: 'match' })).toBe('matching-pairs');
  });

  it('applies the draggable / matching-pairs heuristics', () => {
    expect(normalizeQuestionType({ type: 'unknown', isDraggable: true })).toBe('draggable');
    expect(normalizeQuestionType({ type: 'unknown', answer: 'A-->1|B-->2' })).toBe('matching-pairs');
    expect(normalizeQuestionType({ type: 'unknown', answer: 'A→1' })).toBe('matching-pairs');
  });

  it('defaults to multiple-choice', () => {
    expect(normalizeQuestionType({})).toBe('multiple-choice');
    expect(normalizeQuestionType({ type: 'whatever' })).toBe('multiple-choice');
  });
});

describe('decodeStoredAnswer', () => {
  it('decodes multi:: prefixed answers', () => {
    const out = decodeStoredAnswer({ id: '1', answer: 'multi::A|C' });
    expect(out.answer).toBe('A,C');
    expect(out.allowMultipleAnswers).toBe(true);
  });

  it('decodes meta:: payloads (draggable flag)', () => {
    const meta = Buffer.from(JSON.stringify({ drag: true })).toString('base64');
    const out = decodeStoredAnswer({ id: '1', answer: `meta::${meta}::B,A,C` });
    expect(out.answer).toBe('B,A,C');
    expect(out.isDraggable).toBe(true);
  });

  it('decodes meta:: code payloads', () => {
    const meta = Buffer.from(
      JSON.stringify({ code: { snippet: 'print(1)', language: 'python', mode: 'fill-blank' } }),
    ).toString('base64');
    const out = decodeStoredAnswer({ id: '1', answer: `meta::${meta}::42` });
    expect(out.answer).toBe('42');
    expect(out.type).toBe('code');
    expect(out.codeLanguage).toBe('python');
    expect(out.codeAnswerMode).toBe('fill-blank');
  });

  it('leaves undecodable meta:: prefixes intact', () => {
    const out = decodeStoredAnswer({ id: '1', answer: 'meta::x::42' });
    expect(out.answer).toBe('meta::x::42');
  });

  it('leaves plain answers untouched', () => {
    const q = { id: '1', answer: 'Paris' };
    expect(decodeStoredAnswer(q).answer).toBe('Paris');
  });
});

describe('parseMatchingPairs', () => {
  it('parses --> and → formats', () => {
    expect(parseMatchingPairs('A-->1|B-->2')).toEqual([
      { left: 'A', right: '1' },
      { left: 'B', right: '2' },
    ]);
    expect(parseMatchingPairs('A→1|B→2')).toEqual([
      { left: 'A', right: '1' },
      { left: 'B', right: '2' },
    ]);
  });

  it('parses JSON arrays', () => {
    expect(parseMatchingPairs('["A", "1", "B", "2"]')).toEqual([
      { left: 'A', right: '1' },
      { left: 'B', right: '2' },
    ]);
  });

  it('returns [] for unparsable input', () => {
    expect(parseMatchingPairs('')).toEqual([]);
    expect(parseMatchingPairs(null)).toEqual([]);
    expect(parseMatchingPairs('no separator here')).toEqual([]);
  });
});

describe('isAnswerCorrect', () => {
  it('grades single-answer types case-insensitively', () => {
    expect(isAnswerCorrect('Paris', 'paris', 'multiple-choice')).toBe(true);
    expect(isAnswerCorrect('London', 'Paris', 'multiple-choice')).toBe(false);
    expect(isAnswerCorrect('Vrai', 'vrai', 'true-false')).toBe(true);
    expect(isAnswerCorrect('shark', 'Shark', 'odd-one-out')).toBe(true);
  });

  it('treats empty user answers as misses', () => {
    expect(isAnswerCorrect('', 'Paris', 'multiple-choice')).toBe(false);
    expect(isAnswerCorrect(null, 'Paris', 'multiple-choice')).toBe(false);
  });

  it('grades multi-select as sets across separators', () => {
    expect(isAnswerCorrect('A|C', 'A,C', 'multiple-choice-multi')).toBe(true);
    expect(isAnswerCorrect('C, A', 'A,C', 'multiple-choice-multi')).toBe(true);
    expect(isAnswerCorrect('A', 'A,C', 'multiple-choice-multi')).toBe(false);
    expect(isAnswerCorrect('A,B', 'A,C', 'multiple-choice-multi')).toBe(false);
    expect(isAnswerCorrect('multi::A|C', 'A,C', 'multiple-choice-multi')).toBe(true);
  });

  it('grades ordering exactly', () => {
    expect(isAnswerCorrect('A,B,C', 'A,B,C', 'draggable')).toBe(true);
    expect(isAnswerCorrect('A,C,B', 'A,B,C', 'draggable')).toBe(false);
    expect(isAnswerCorrect('A,B', 'A,B,C', 'draggable')).toBe(false);
  });

  it('grades matching pairs across arrow spellings', () => {
    expect(isAnswerCorrect('A→1|B→2', 'A-->1|B-->2', 'matching-pairs')).toBe(true);
    expect(isAnswerCorrect('B→2|A→1', 'A-->1|B-->2', 'matching-pairs')).toBe(true);
    expect(isAnswerCorrect('A→2|B→1', 'A-->1|B-->2', 'matching-pairs')).toBe(false);
    expect(isAnswerCorrect('A→1', 'A-->1|B-->2', 'matching-pairs')).toBe(false);
  });

  it('grades fill-blank per blank id', () => {
    expect(isAnswerCorrect('1:cat|2:dog', '1:cat|2:dog', 'fill-blank')).toBe(true);
    expect(isAnswerCorrect('1:Cat|2:dog', '1:cat|2:dog', 'fill-blank')).toBe(true);
    expect(isAnswerCorrect('1:cat', '1:cat|2:dog', 'fill-blank')).toBe(false);
    expect(isAnswerCorrect('1:dog|2:cat', '1:cat|2:dog', 'fill-blank')).toBe(false);
  });
});

describe('gradeAttempt', () => {
  const bank = [
    { id: 'q1', type: 'multiple-choice', text: 'Capital?', options_json: '["A","B"]', answer: 'A', explanation: 'Because.', points: 2 },
    { id: 'q2', type: 'true-false', text: 'Sky blue?', answer: 'True' },
    { id: 'q3', type: 'multiple-choice', text: 'Pick two', answer: 'multi::A|C' },
  ];

  it('grades every question and counts the score', () => {
    const { score, total, items } = gradeAttempt(bank, { q1: 'A', q2: 'False', q3: 'A|C' });
    expect(total).toBe(3);
    expect(score).toBe(2);
    expect(items[0]).toMatchObject({ questionId: 'q1', correct: true, correctAnswer: 'A', explanation: 'Because.', points: 2 });
    expect(items[1]).toMatchObject({ questionId: 'q2', correct: false, userAnswer: 'False' });
    // multi:: rows grade as multi-select after decoding
    expect(items[2].type).toBe('multiple-choice-multi');
    expect(items[2].correct).toBe(true);
  });

  it('marks unanswered questions incorrect', () => {
    const { score } = gradeAttempt(bank, {});
    expect(score).toBe(0);
  });

  it('skips unknown question ids in the answers map', () => {
    const { total } = gradeAttempt(bank, { q1: 'A', nope: 'x' });
    expect(total).toBe(3);
  });
});

describe('grade20', () => {
  it('normalizes to a /20 scale and thresholds passing at 10 or more', () => {
    expect(grade20(3, 5)).toBe(12);
    expect(grade20(0, 5)).toBe(0);
    expect(grade20(5, 5)).toBe(20);
    expect(grade20(0, 0)).toBe(0);
    expect(isPassingGrade20(12)).toBe(true);
    expect(isPassingGrade20(10)).toBe(true);
    expect(isPassingGrade20(9.99)).toBe(false);
  });
});
