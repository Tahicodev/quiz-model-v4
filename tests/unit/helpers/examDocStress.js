/**
 * tests/unit/helpers/examDocStress.js
 *
 * Fixture factories for the pagination stress suite (Step 0). Two flavours:
 *
 *  - `denseFixtures(n)`   a realistic, compact teacher paper: short-to-medium
 *    stems, 4-option QCMs, a couple of tables. This is what "my 20-question
 *    subject must fit in 3-4 pages" is measured against.
 *  - `stressFixtures(n)`  a deliberately pathological paper: very long stems,
 *    6-option QCMs with wordy choices, a wide matching table and a long ordered
 *    list. This is what reproduces the "34 pages for 20 questions" blow-up,
 *    where every over-sized keep-group used to jump to a fresh sheet and waste
 *    the rest of the previous one.
 *
 * Rows are shaped exactly like the real `exam.withQuestions` rows so the whole
 * service → renderer path is exercised, not a hand-built model.
 */

import {
  CATEGORY_GRAMMAR,
  CATEGORY_SCIENCE,
  CREATOR_ID,
  SCHOOL_ID,
} from './examDocFixtures.js';

/** ~160 chars: a normal, readable exam sentence. */
const NORMAL_STEM =
  'Dans la phrase « Les élèves de troisième préparent un exposé sur les volcans », quel mot constitue le noyau du groupe nominal sujet ?';

/** ~1500 chars: a pathological wall of text that must still paginate cleanly. */
const LONG_STEM =
  'On considère l’expérience décrite ci-dessous et l’on demandera une réponse complète, rédigée et ' +
  'entièrement justifiée. Le professeur expose un phénomène physique observable en classe, invite ' +
  'l’élève à formuler une hypothèse, à décrire le protocole expérimental permettant de la tester, à ' +
  'préciser les instruments de mesure utilisés ainsi que leurs unités, à relever les valeurs ' +
  'mesurées dans un tableau, à tracer et interpréter la courbe correspondante, à discuter les ' +
  'sources d’erreur possibles, à comparer le résultat obtenu à la valeur théorique attendue, puis à ' +
  'conclure en reliant l’observation à la loi étudiée en cours. '.repeat(4);

function optionSet(count, wordy) {
  const label = wordy
    ? [
        'Première proposition longue et détaillée, rédigée sur plusieurs mots',
        'Deuxième proposition tout aussi longue qui occupe davantage de place',
        'Troisième proposition développée avec des précisions supplémentaires',
        'Quatrième proposition qui ajoute encore de la largeur à la ligne',
        'Cinquième proposition alourdissant encore la liste des réponses',
        'Sixième proposition finale qui déborde largement de la colonne',
      ]
    : ['Paris', 'Lyon', 'Marseille', 'Lille', 'Bordeaux', 'Nantes'];
  return JSON.stringify(label.slice(0, count));
}

function baseRow(i, extra) {
  return {
    id: `q-stress-${i}`,
    order_index: i,
    points: 1,
    points_override: null,
    time_limit_override: null,
    school_id: SCHOOL_ID,
    created_by: CREATOR_ID,
    media_url: null,
    category_id: i % 2 === 0 ? CATEGORY_GRAMMAR : CATEGORY_SCIENCE,
    ...extra,
  };
}

/** Cycle through the paper's question archetypes so a run mixes every renderer. */
function buildRows(count, { wordy }) {
  const rows = [];
  const stem = wordy ? LONG_STEM : NORMAL_STEM;
  const nOpts = wordy ? 6 : 4;
  for (let i = 0; i < count; i++) {
    switch (i % 7) {
      case 0:
        rows.push(baseRow(i, {
          type: 'mcq',
          text: stem,
          options_json: optionSet(nOpts, wordy),
          answer: wordy ? optionSet(1, wordy).slice(2, -2) : 'Paris',
          explanation: `Réponse attendue ZÉPHYR-STRESS-${i}.`,
        }));
        break;
      case 1:
        rows.push(baseRow(i, {
          type: 'true-false',
          text: wordy ? `${stem} Vrai ou faux ?` : 'Un octet est composé de huit bits.',
          options_json: null,
          answer: 'true',
          explanation: `Justification ZÉPHYR-STRESS-${i}.`,
        }));
        break;
      case 2:
        rows.push(baseRow(i, {
          type: 'fill-blank',
          text: wordy
            ? `${stem} Complétez : le processeur ____ les instructions et la mémoire de masse les ____ de façon ____. `
            : 'Complète : le soleil ____ au matin et ____ le ciel.',
          options_json: null,
          answer: 'exécute, stocke, permanente',
          explanation: `Attendu ZÉPHYR-STRESS-${i}.`,
        }));
        break;
      case 3: {
        const pairs = wordy
          ? [
              ['Le registre du processeur', 'la plus rapide des mémoires volatiles'],
              ['La mémoire cache', 'située entre le registre et la mémoire vive'],
              ['La mémoire vive', 'effaçée à l’extinction de la machine'],
              ['Le disque dur', 'mémoire de masse non volatile de grande capacité'],
              ['La clé USB', 'support amovible connecté par port série'],
              ['Le DVD', 'support optique gravé lecture seule'],
              ['La carte SD', 'support flash compact pour appareils nomades'],
              ['Le SSD', 'mémoire de masse à semi-conducteurs rapide et robuste'],
            ]
          : [['France', 'Paris'], ['Italie', 'Rome'], ['Espagne', 'Madrid']];
        rows.push(baseRow(i, {
          type: 'match',
          text: wordy ? `${stem} Reliez chaque élément de la colonne A à celui de la colonne B.` : 'Reliez chaque pays à sa capitale.',
          options_json: null,
          answer: JSON.stringify(pairs.map(([left, right]) => ({ left, right }))),
          explanation: `Associations ZÉPHYR-STRESS-${i}.`,
        }));
        break;
      }
      case 4: {
        const pool = wordy
          ? ['Première étape du protocole', 'Deuxième étape du protocole', 'Troisième étape du protocole', 'Quatrième étape du protocole', 'Cinquième étape du protocole', 'Sixième étape du protocole', 'Septième étape du protocole', 'Huitième étape du protocole']
          : ['Boulot', 'Dodo', 'Métro'];
        rows.push(baseRow(i, {
          type: 'order',
          isDraggable: true,
          text: wordy ? `${stem} Placez les étapes dans l’ordre.` : 'Placez les étapes de la matinée dans l’ordre.',
          options_json: JSON.stringify(pool),
          answer: pool.join(', '),
          explanation: `Ordre attendu ZÉPHYR-STRESS-${i}.`,
        }));
        break;
      }
      case 5:
        rows.push(baseRow(i, {
          type: 'code',
          text: wordy ? `${stem} Queaffiche ce programme ?` : 'Que affiche ce programme ?',
          options_json: null,
          codeSnippet: wordy
            ? 'function somme(n) {\n  let s = 0;\n  for (let i = 1; i <= n; i++) {\n    if (i % 2 === 0) {\n      s += i * i;\n    } else {\n      s -= 1;\n    }\n  }\n  return s;\n}\nconsole.log(somme(6));'
            : 'let n = 2;\nconsole.log(n * 3 - 1);',
          codeLanguage: 'javascript',
          codeAnswerMode: 'free-response',
          answer: `Sortie ZÉPHYR-STRESS-${i}`,
          explanation: `Sortie attendue ZÉPHYR-STRESS-${i}.`,
        }));
        break;
      default:
        rows.push(baseRow(i, {
          type: 'odd',
          oddOneOut: true,
          text: wordy ? `${stem} Entourez l’intrus.` : 'Entourez l’intrus de la série.',
          options_json: optionSet(nOpts, wordy),
          answer: wordy ? 'Sixième proposition finale qui déborde largement de la colonne' : 'Nantes',
          explanation: `Intrus ZÉPHYR-STRESS-${i}.`,
        }));
    }
  }
  return rows;
}

/** A realistic, compact paper: this is the "20 questions in 3-4 pages" subject. */
export function denseFixtures(count = 20) {
  return buildRows(count, { wordy: false });
}

/**
 * A genuinely compact paper — the shape of a real 20-question "sujet": short
 * true/false and fill items with a few brief multiple-choice questions. This is
 * what the "3 to 4 pages" success criterion is measured against.
 */
export function compactFixtures(count = 20) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    if (i % 3 === 0) {
      rows.push(baseRow(i, {
        type: 'mcq',
        text: 'Quel est le pluriel de « cheval » ?',
        options_json: JSON.stringify(['chevaux', 'chevals', 'chevaulx', 'cheveaux']),
        answer: 'chevaux',
        explanation: `Réponse ZÉPHYR-COMPACT-${i}.`,
      }));
    } else if (i % 3 === 1) {
      rows.push(baseRow(i, {
        type: 'true-false',
        text: 'La Terre est une planète.',
        options_json: null,
        answer: 'true',
        explanation: `Justification ZÉPHYR-COMPACT-${i}.`,
      }));
    } else {
      rows.push(baseRow(i, {
        type: 'fill-blank',
        text: 'Complète : 2 + 2 = ____.',
        options_json: null,
        answer: '4',
        explanation: `Attendu ZÉPHYR-COMPACT-${i}.`,
      }));
    }
  }
  return rows;
}

/**
 * Every question is a single matching table taller than one sheet. This is the
 * pathological shape that used to blow up: an over-sized keep-group was pushed
 * onto a fresh page, leaving a large near-empty gap on the previous sheet once
 * per question. The pagination fix must let these flow without orphaned gaps.
 */
export function oversizeFixtures(count = 6, rows = 40) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const pairs = Array.from({ length: rows }, (_, r) => [
      `Élément A${r + 1} de la série ${i + 1}`,
      `Élément B${r + 1} correspondant à associer`,
    ]);
    out.push(baseRow(i, {
      type: 'match',
      text: `Reliez chaque élément de la colonne A à celui de la colonne B (question ${i + 1}).`,
      options_json: null,
      answer: JSON.stringify(pairs.map(([left, right]) => ({ left, right }))),
      explanation: `Associations ZÉPHYR-OVER-${i}.`,
    }));
  }
  return out;
}

/** A pathological paper: reproduces the pagination blow-up. */
export function stressFixtures(count = 20) {
  return buildRows(count, { wordy: true });
}

/**
 * Rough lower bound on the number of pages a paper needs, used to prove the
 * engine never leaves whole near-empty sheets: a page is "near empty" when it
 * carries far less text than the ones before it.
 */
export function textLengthPerPage(pageTexts) {
  return pageTexts.map((t) => String(t || '').replace(/\s+/g, ' ').trim().length);
}
