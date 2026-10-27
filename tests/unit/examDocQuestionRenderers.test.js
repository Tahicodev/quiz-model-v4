/**
 * tests/unit/examDocQuestionRenderers.test.js
 *
 * Paper shapes for every stored question type, plus the honest failure modes:
 * a missing answer is flagged, never guessed; an unknown type degrades to a
 * free-response block and says so.
 */

import { describe, it, expect } from 'vitest';
import {
  splitQuestion,
  buildStudentContent,
  buildAnswerKeyContent,
  keyFeedbackLines,
  parseOptionNodes,
} from '../../src/backend/services/exam-doc/questionRenderers.js';
import { optionLetter } from '../../src/backend/services/exam-doc/text.js';

const CANONICAL_TYPES = [
  'multiple-choice',
  'multiple-choice-multi',
  'true-false',
  'fill-blank',
  'odd-one-out',
  'draggable',
  'matching-pairs',
  'code',
];

const OPTIONS = ['Paris', 'Lyon', 'Marseille', 'Lille'];

function rowFixture(overrides = {}) {
  return {
    id: 'q-1',
    type: 'mcq',
    text: 'Quelle est la capitale de la France ?',
    options_json: JSON.stringify(OPTIONS),
    answer: 'Paris',
    explanation: 'C’est la plus grande ville.',
    ...overrides,
  };
}

/** Student + key content for one stored row. */
function render(row) {
  const split = splitQuestion(row);
  return {
    split,
    student: buildStudentContent({
      type: split.type,
      options: split.options,
      row: split.publicRow,
      pairs: split.pairs,
      points: 2,
    }),
    key: buildAnswerKeyContent({
      type: split.type,
      options: split.options,
      confidential: split.confidential,
      questionId: String(row.id),
      text: split.publicRow.text,
      pairs: split.pairs,
    }),
  };
}

describe('type coverage', () => {
  it('renders a student block and an answer-key block for every supported type', () => {
    for (const type of CANONICAL_TYPES) {
      const row = rowFixture({
        id: `q-${type}`,
        type,
        // Draggable / multi / odd-one-out / code are stored with flags or meta.
        allowMultipleAnswers: type === 'multiple-choice-multi',
        isDraggable: type === 'draggable',
        oddOneOut: type === 'odd-one-out',
        answer:
          type === 'matching-pairs'
            ? JSON.stringify([{ left: 'France', right: 'Paris' }])
            : type === 'multiple-choice-multi'
              ? 'multi::Paris|Marseille'
              : type === 'draggable'
                ? 'Paris, Lyon, Marseille'
                : type === 'fill-blank'
                  ? 'Paris'
                  : 'Paris',
        codeSnippet: type === 'code' ? 'console.log(1 + 1);' : undefined,
      });
      const { split, student, key } = render(row);
      expect(CANONICAL_TYPES).toContain(split.type);
      expect(student.block).toBeTruthy();
      expect(student.block.kind).not.toBe('free');
      expect(student.block.text).toBe(row.text);
      expect(key.answer).toBeTruthy();
      expect(Array.isArray(key.answer.entries)).toBe(true);
      expect(student.warnings).toEqual([]);
      expect(key.warnings.filter((w) => w.type === 'missing-answer')).toEqual([]);
    }
  });

  it('falls back to a free-response block and warns for an unknown type', () => {
    const { split, student, key } = render(rowFixture({ type: 'hyperwave', answer: 'oui' }));
    expect(split.type).toBe('multiple-choice'); // unknown types decode to the default
    const unknown = buildStudentContent({
      type: 'hyperwave',
      options: [],
      row: { id: 'q-x', text: 'Question inconnue' },
    });
    expect(unknown.block.kind).toBe('free');
    expect(unknown.warnings[0].type).toBe('unsupported-type');
    expect(unknown.block.lines).toBeGreaterThanOrEqual(2);
    const keyUnknown = buildAnswerKeyContent({
      type: 'hyperwave',
      options: [],
      confidential: { answer: ' attends ' },
      questionId: 'q-x',
    });
    expect(keyUnknown.answer.entries).toEqual(['attends']); // trimmed for print
  });

  it('carries the media reference to the paper without downloading it', () => {
    const { student } = render(rowFixture({ media_url: '/uploads/chart.png' }));
    expect(student.block.media).toBe('/uploads/chart.png');
  });
});

describe('option-based types', () => {
  it('letters every option from A and marks single vs multiple choice', () => {
    const single = render(rowFixture());
    expect(single.split.type).toBe('multiple-choice');
    expect(single.student.block.marker).toBe('radio');
    expect(single.student.block.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(single.student.block.options.map((o) => o.text)).toEqual(OPTIONS);

    const multi = render(rowFixture({ answer: 'multi::Paris|Marseille' }));
    expect(multi.split.type).toBe('multiple-choice-multi');
    expect(multi.student.block.marker).toBe('checkbox');
    expect(multi.key.answer.letters).toEqual(['A', 'C']);
    expect(multi.key.answer.entries).toEqual(['A. Paris', 'C. Marseille']);
  });

  it('never prints which option is correct on the student paper', () => {
    const { student } = render(rowFixture());
    for (const option of student.block.options) {
      expect('isCorrect' in option).toBe(false);
      expect('correct' in option).toBe(false);
      expect('answer' in option).toBe(false);
    }
    expect(JSON.stringify(student.block)).not.toContain('isCorrect');
  });

  it('handles long option lists and very long stems', () => {
    const many = OPTIONS.concat(Array.from({ length: 20 }, (_, i) => `Option ${i + 1}`));
    const { student } = render(rowFixture({ options_json: JSON.stringify(many) }));
    expect(student.block.options).toHaveLength(24);
    expect(student.block.options[23].letter).toBe('X');

    const longText = 'Réponse rédigée. '.repeat(400);
    const longRow = render(rowFixture({ text: longText, type: 'fill-blank', options_json: null }));
    // Stems are trimmed (paper never starts or ends with stray whitespace).
    expect(longRow.student.block.text).toBe(longText.trim());
    expect(longRow.student.block.text).toHaveLength(longText.trim().length);
  });

  it('keeps image options and image-only options printable', () => {
    const { student } = render(
      rowFixture({
        options_json: JSON.stringify([
          { text: 'schéma A', image: '/uploads/a.png' },
          { text: '', image: '/uploads/b.png', isImageOnly: true },
        ]),
      }),
    );
    expect(student.block.options[0]).toMatchObject({ letter: 'A', text: 'schéma A', image: '/uploads/a.png' });
    expect(student.block.options[1]).toMatchObject({ letter: 'B', image: '/uploads/b.png' });
    expect(student.block.options[1].isImageOnly).toBe(true);
  });

  it('parses plain strings, objects and broken JSON alike', () => {
    expect(parseOptionNodes({ options_json: 'not json' })).toEqual([]);
    expect(parseOptionNodes({ options: ['', '  B  ', null, 3] })).toEqual([
      { text: 'B', image: null },
      { text: '3', image: null },
    ]);
  });

  it('answers can be stored as text, letter or index', () => {
    for (const answer of ['Marseille', 'C', 'C.', 2]) {
      const { key } = render(rowFixture({ answer: String(answer) }));
      expect(key.answer.letters).toEqual(['C']);
      expect(key.answer.entries[0]).toBe('C. Marseille');
    }
  });
});

describe('true / false', () => {
  it('prints Vrai and Faux as two boxes and resolves either spelling', () => {
    const { student, key } = render(rowFixture({ type: 'true-false', options_json: null, answer: 'true' }));
    expect(student.block.options.map((o) => o.text)).toEqual(['Vrai', 'Faux']);
    expect(key.answer.entries).toEqual(['Vrai']);

    expect(render(rowFixture({ type: 'true-false', options_json: null, answer: 'faux' })).key.answer.entries).toEqual([
      'Faux',
    ]);
    expect(render(rowFixture({ type: 'true-false', options_json: null, answer: 'non' })).key.answer.entries).toEqual([
      'Faux',
    ]);
    expect(render(rowFixture({ type: 'true-false', options_json: null, answer: 'oui' })).key.answer.entries).toEqual([
      'Vrai',
    ]);
  });

  it('leaves an unset true/false answer blank and warns', () => {
    const { key } = render(rowFixture({ type: 'true-false', options_json: null, answer: '' }));
    expect(key.answer.entries).toEqual([]);
    expect(key.answer.missing).toBe(true);
    expect(key.warnings[0]).toMatchObject({ type: 'missing-answer', questionId: 'q-1' });
  });
});

describe('fill in the blanks', () => {
  it('counts the blanks the teacher wrote in the stem', () => {
    const cases = [
      ['Le soleil ____ et ____ .', 2],
      ['Un mot __ manque … un autre (  )', 3],
      ['Rien à compléter', 1],
    ];
    for (const [text, expected] of cases) {
      const { student } = render(rowFixture({ type: 'fill-blank', text, options_json: null }));
      expect(student.block.kind).toBe('blanks');
      expect(student.block.blanks).toBe(expected);
    }
  });

  it('lists accepted alternatives per blank in the key', () => {
    const { key } = render(
      rowFixture({ type: 'fill-blank', text: 'Deux trous ____ ____', options_json: null, answer: 'lève, illumine' }),
    );
    expect(key.answer.kind).toBe('blanks');
    expect(key.answer.entries).toEqual(['1. lève', '2. illumine']);
  });
});

describe('ordering (draggable)', () => {
  it('gives the student a pool plus empty numbered slots', () => {
    const { student } = render(
      rowFixture({ type: 'order', isDraggable: true, answer: 'Métro, Boulot, Dodo', options_json: JSON.stringify(['Boulot', 'Dodo', 'Métro']) }),
    );
    expect(student.block.kind).toBe('sequence');
    expect(student.block.slots).toBe(3);
    // The printed pool is the stored list; the expected order is not on it.
    expect(student.block.pool.map((o) => o.text)).toEqual(['Boulot', 'Dodo', 'Métro']);
    expect(student.block.pool.map((o) => o.letter)).toEqual(['A', 'B', 'C']);
  });

  it('numbers the expected sequence in the key', () => {
    const { key } = render(
      rowFixture({ type: 'order', isDraggable: true, answer: 'Métro, Boulot, Dodo' }),
    );
    expect(key.answer.kind).toBe('sequence');
    expect(key.answer.entries).toEqual(['1. Métro', '2. Boulot', '3. Dodo']);
  });
});

describe('matching pairs', () => {
  const pairsRow = rowFixture({
    type: 'match',
    options_json: null,
    answer: JSON.stringify([
      { left: 'France', right: 'Paris' },
      { left: 'Italie', right: 'Rome' },
      { left: 'Espagne', right: 'Madrid' },
      { left: 'Maroc', right: 'Rabat' },
    ]),
  });

  it('prints two columns and keeps the real pairing off the student paper', () => {
    const { student } = render(pairsRow);
    expect(student.block.kind).toBe('pairs');
    expect(student.block.lefts.map((l) => l.text)).toEqual(['France', 'Italie', 'Espagne', 'Maroc']);
    expect(student.block.rights.map((r) => r.text).sort()).toEqual(['Madrid', 'Paris', 'Rabat', 'Rome']);
    // Column letters follow the printed position, so they carry no information.
    expect(student.block.rights.map((r) => r.letter)).toEqual(['A', 'B', 'C', 'D']);
    // Nothing on the student sheet links a left entry to its right partner.
    expect(JSON.stringify(student.block)).not.toContain('→');
    expect(JSON.stringify(student.block)).not.toContain('"left"');
  });

  it('shuffling is deterministic for the same question id', () => {
    const first = render(pairsRow).student.block.rights.map((r) => r.text);
    const second = render(pairsRow).student.block.rights.map((r) => r.text);
    expect(first).toEqual(second);
  });

  it('the key prints every left → right association', () => {
    const { key } = render(pairsRow);
    expect(key.answer.kind).toBe('pairs');
    expect(key.answer.entries).toEqual([
      'France → Paris',
      'Italie → Rome',
      'Espagne → Madrid',
      'Maroc → Rabat',
    ]);
  });

  it('an unreadable pairing is flagged, not guessed', () => {
    const { key } = render(rowFixture({ type: 'match', options_json: null, answer: 'rien de structuré' }));
    expect(key.answer.entries).toEqual([]);
    expect(key.answer.missing).toBe(true);
    expect(key.warnings[0].type).toBe('missing-answer');
  });
});

describe('code questions', () => {
  const codeRow = rowFixture({
    type: 'code',
    options_json: null,
    codeSnippet: 'let n = 2;\nconsole.log(n * 3 - 1);',
    codeLanguage: 'javascript',
    codeAnswerMode: 'free-response',
    answer: '5',
  });

  it('gives the student the program to read plus writing space', () => {
    const { student } = render(codeRow);
    expect(student.block.kind).toBe('code');
    expect(student.block.snippet).toBe('let n = 2;\nconsole.log(n * 3 - 1);');
    expect(student.block.language).toBe('javascript');
    expect(student.block.options).toBeNull();
    expect(student.block.lines).toBeGreaterThanOrEqual(2);
  });

  it('prints the expected output and the answer mode in the key', () => {
    const { key } = render(codeRow);
    expect(key.answer.kind).toBe('code');
    expect(key.answer.entries).toContain('Mode de réponse : free-response');
    expect(key.answer.entries).toContain('5');
  });

  it('a code question with options keeps them for the student', () => {
    const { student } = render(rowFixture({ type: 'code', codeSnippet: 'console.log(2);', answer: 'A' }));
    expect(student.block.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(student.block.lines).toBe(0);
  });
});

describe('answer-key feedback', () => {
  it('reuses the stored explanation as the expected feedback line', () => {
    expect(keyFeedbackLines({ explanation: '  Attendu : verbe « se lever ».  ' })).toEqual([
      { label: 'Retour attendu', text: 'Attendu : verbe « se lever ».' },
    ]);
  });

  it('stays empty when the teacher wrote no explanation', () => {
    expect(keyFeedbackLines({ explanation: '   ' })).toEqual([]);
    expect(keyFeedbackLines({})).toEqual([]);
  });
});

describe('option letters', () => {
  it('labels beyond Z keep counting sensibly instead of breaking', () => {
    expect(optionLetter(0)).toBe('A');
    expect(optionLetter(25)).toBe('Z');
    expect(optionLetter(26)).toBe('AA');
  });
});

describe('confidential fields are stripped before the student branch runs', () => {
  it('publicRow has no answer or explanation to read', () => {
    const { split } = render(rowFixture());
    expect('answer' in split.publicRow).toBe(false);
    expect('explanation' in split.publicRow).toBe(false);
    expect(split.confidential.answer).toBe('Paris');
    expect(split.publicRow.codeSnippet).toBeUndefined();
  });

  it('a code snippet stays public because the student must read it', () => {
    const { split } = render(
      rowFixture({ type: 'code', codeSnippet: 'console.log(7);', options_json: null }),
    );
    expect(split.publicRow.codeSnippet).toBe('console.log(7);');
  });
});
