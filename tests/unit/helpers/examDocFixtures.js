/**
 * tests/unit/helpers/examDocFixtures.js
 *
 * One realistic exam, shared by every exam-document test: eight questions that
 * cover each stored type the app can grade, ordered by `order_index`, with a
 * natural point total of exactly 20.
 *
 * Rows are shaped exactly like `PrismaRepository.query('exam.withQuestions')`
 * returns them (question columns + the junction's `order_index` /
 * `points_override`), so the service under test sees production shapes.
 *
 * Confidential fields carry unique ZÉPHYR tokens: a test can then prove that a
 * student document contains none of them instead of trusting the renderer.
 */

import { vi } from 'vitest';
import { ExamDocumentService } from '../../../src/backend/services/ExamDocumentService.js';

export const SCHOOL_ID = 'school-doc';
export const EXAM_ID = 'exam-doc-1';
export const CREATOR_ID = 'user-doc-teacher';
export const CATEGORY_GRAMMAR = 'cat-grammar';
export const CATEGORY_SCIENCE = 'cat-science';

/** Tokens that exist only in `answer` / `explanation`. */
export const SECRET_TOKENS = [
  'ZÉPHYR-01',
  'ZÉPHYR-02',
  'ZÉPHYR-03',
  'ZÉPHYR-04',
  'ZÉPHYR-05',
  'ZÉPHYR-06',
  'ZÉPHYR-07',
  'ZÉPHYR-08',
  'ZÉPHYR-RÉPONSE-REMPLIR',
  'ZÉPHYR-RÉPONSE-CODE',
];

export const DEFAULT_POINTS = [3, 2, 2, 3, 4, 2, 2, 2]; // = 20

export function questionFixtures(points = DEFAULT_POINTS) {
  const rows = [
    {
      id: 'q-mcq',
      type: 'mcq',
      text: 'Quelle est la capitale de la France ?',
      options_json: JSON.stringify(['Paris', 'Lyon', 'Marseille', 'Lille']),
      answer: 'Paris',
      explanation: 'On attend la ville ZÉPHYR-01.',
      category_id: CATEGORY_GRAMMAR,
      media_url: null,
    },
    {
      id: 'q-tf',
      type: 'true-false',
      text: 'Un chat est un mammifère.',
      options_json: null,
      answer: 'true',
      explanation: 'Justification ZÉPHYR-02.',
      category_id: CATEGORY_SCIENCE,
      media_url: null,
    },
    {
      id: 'q-fill',
      type: 'fill-blank',
      text: 'Complète : le soleil ____ au matin et ____ le ciel.',
      options_json: null,
      answer: 'ZÉPHYR-RÉPONSE-REMPLIR, illumine',
      explanation: 'Deux verbes attendus ZÉPHYR-03.',
      category_id: CATEGORY_GRAMMAR,
      media_url: null,
    },
    {
      id: 'q-odd',
      type: 'odd',
      oddOneOut: true,
      text: 'Entourez l’intrus de la série.',
      options_json: JSON.stringify(['Pomme', 'Poire', 'Carotte', 'Banane']),
      answer: 'Carotte',
      explanation: 'L’intrus est ZÉPHYR-04.',
      category_id: CATEGORY_GRAMMAR,
      media_url: null,
    },
    {
      id: 'q-order',
      type: 'order',
      isDraggable: true,
      text: 'Placez les étapes de la matinée dans l’ordre.',
      options_json: JSON.stringify(['Boulot', 'Dodo', 'Métro']),
      answer: 'Métro, Boulot, Dodo',
      explanation: 'Ordre attendu ZÉPHYR-05.',
      category_id: CATEGORY_SCIENCE,
      media_url: null,
    },
    {
      id: 'q-match',
      type: 'match',
      text: 'Reliez chaque pays à sa capitale.',
      options_json: null,
      answer: JSON.stringify([
        { left: 'France', right: 'Paris' },
        { left: 'Italie', right: 'Rome' },
        { left: 'Espagne', right: 'Madrid' },
      ]),
      explanation: 'Associations ZÉPHYR-06.',
      category_id: CATEGORY_SCIENCE,
      media_url: null,
    },
    {
      id: 'q-code',
      type: 'code',
      text: 'Que affichera ce programme ?',
      options_json: null,
      codeSnippet: 'let n = 2;\nconsole.log(n * 3 - 1);',
      codeLanguage: 'javascript',
      codeAnswerMode: 'free-response',
      answer: '5 — ZÉPHYR-RÉPONSE-CODE',
      explanation: 'Sortie attendue ZÉPHYR-07.',
      category_id: CATEGORY_SCIENCE,
      media_url: null,
    },
    {
      id: 'q-long',
      type: 'mcq',
      text:
        'Dans la phrase « Les élèves de troisième préparent un exposé sur les volcans »,' +
        ' quel mot constitue le noyau du groupe nominal sujet ?',
      options_json: JSON.stringify(['élèves', 'troisième', 'exposé', 'volcans']),
      answer: 'élèves',
      explanation: 'Noyau ZÉPHYR-08.',
      category_id: CATEGORY_GRAMMAR,
      media_url: null,
    },
  ];
  return rows.slice(0, points.length).map((row, index) => ({
    ...row,
    points: points[index],
    order_index: index,
    points_override: null,
    time_limit_override: null,
    school_id: SCHOOL_ID,
    created_by: CREATOR_ID,
  }));
}

export const SCHOOL_ROW = {
  id: SCHOOL_ID,
  name: 'Lycée Victor Hugo',
  logo_url: '/uploads/school-logo.png',
  school_year: '2025-2026',
};

export const CREATOR_ROW = { id: CREATOR_ID, name: 'Mme Aïchouche', role: 'teacher' };

export const CATEGORY_ROWS = [
  { id: CATEGORY_GRAMMAR, school_id: SCHOOL_ID, name: 'Grammaire' },
  { id: CATEGORY_SCIENCE, school_id: SCHOOL_ID, name: 'Sciences' },
];

export const CLASS_ROWS = [
  { id: 'class-3a', school_id: SCHOOL_ID, name: '3ème A' },
  { id: 'class-3b', school_id: SCHOOL_ID, name: '3ème B' },
];

/** The blob the legacy UI owns: header saving must not damage it. */
export const EXAM_OPTIONS_JSON = JSON.stringify({
  presetSnapshot: { questions: [0, 1, 2], name: 'legacy-preset' },
  classes: ['3ème A', '3ème B'],
});

/**
 * Minimal repository double: exactly the four methods ExamDocumentService uses.
 * `update` is recorded so tests can prove generation never writes.
 */
export function makeRepo({
  questions = questionFixtures(),
  optionsJson = EXAM_OPTIONS_JSON,
  examClasses = [{ id: 'ec1', exam_id: EXAM_ID, class_id: 'class-3a' }],
  examExtra = {},
} = {}) {
  const exam = {
    id: EXAM_ID,
    school_id: SCHOOL_ID,
    creator_id: CREATOR_ID,
    name: 'Devoir surveillé n°1',
    duration: 60,
    status: 'active',
    is_training: false,
    options_json: optionsJson,
    questions,
    ...examExtra,
  };
  const repo = {
    exam,
    questions,
    examClasses,
    updates: [],
    query: vi.fn(async (name) => (name === 'exam.withQuestions' ? { ...repo.exam, questions: repo.questions } : null)),
    getById: vi.fn(async (store, id) => {
      if (store === 'schools') return id === SCHOOL_ID ? SCHOOL_ROW : null;
      if (store === 'users') return id === CREATOR_ID ? CREATOR_ROW : null;
      if (store === 'exams') return { ...repo.exam, questions: undefined };
      return null;
    }),
    getAll: vi.fn(async (store, options = {}) => {
      if (store === 'categories') {
        const wanted = options.filters?.school_id;
        return { data: wanted ? CATEGORY_ROWS : [...CATEGORY_ROWS, { id: 'cat-other', school_id: 'other', name: 'Autre' }], total: 2 };
      }
      if (store === 'classes') return { data: CLASS_ROWS, total: CLASS_ROWS.length };
      if (store === 'exam_classes') {
        const wanted = options.filters?.exam_id;
        return { data: wanted === EXAM_ID ? repo.examClasses : [], total: 0 };
      }
      return { data: [], total: 0 };
    }),
    update: vi.fn(async (store, id, patch) => {
      repo.updates.push({ store, id, patch });
      if (store === 'exams') repo.exam = { ...repo.exam, ...patch };
      return repo.exam;
    }),
  };
  return repo;
}

export function makeService(options = {}) {
  const repo = makeRepo(options);
  return { repo, service: new ExamDocumentService(repo) };
}

/** Build a document model straight from the fixtures. */
export async function buildDocument(options = {}, args = {}) {
  const { service } = makeService(options);
  return service.buildExamDocument({
    examId: EXAM_ID,
    schoolId: SCHOOL_ID,
    document: args.document || 'student',
    ...args,
  });
}

/** Many questions + long stems, so a real page break has to happen. */
export function longFixtures(count = 26) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      id: `q-long-${i}`,
      type: i % 3 === 0 ? 'fill-blank' : 'mcq',
      text: `Question ${i + 1} — ${
        'Le professeur demande une réponse complète et rédigée, en justifiant chaque étape du calcul '
      }${i % 2 === 0 ? 'avec une unité correcte ____' : 'dans le cadre réservé à la réponse ?'}`,
      options_json:
        i % 3 === 0
          ? null
          : JSON.stringify(['Première proposition détaillée', 'Deuxième proposition détaillée', 'Troisième proposition']),
      answer: i % 3 === 0 ? `ZÉPHYR-LONG-${i}` : 'Première proposition détaillée',
      explanation: `Attendu ZÉPHYR-LONG-${i}`,
      category_id: i % 2 === 0 ? CATEGORY_GRAMMAR : CATEGORY_SCIENCE,
      media_url: null,
      points: 1,
      order_index: i,
      points_override: null,
      school_id: SCHOOL_ID,
    });
  }
  return rows; // 26 points → normalization is exercised by the caller
}
