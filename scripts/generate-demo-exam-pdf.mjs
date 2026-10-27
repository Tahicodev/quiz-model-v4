#!/usr/bin/env node
/**
 * scripts/generate-demo-exam-pdf.mjs
 *
 * Demo paper for the exam document generator: a realistic 20-question /
 * 20-point exam is built through the production service and rendered to PDF, so
 * what lands on disk is exactly what the teacher gets from the admin modal.
 * Nothing is written to the database — the repository is an in-memory double.
 *
 * Usage (from the project root):
 *     node scripts/generate-demo-exam-pdf.mjs
 *     node scripts/generate-demo-exam-pdf.mjs --logo "Kids assets/placeholder-scene.png"
 *     node scripts/generate-demo-exam-pdf.mjs --no-logo        # shows the fallback disc
 *     node scripts/generate-demo-exam-pdf.mjs --out C:\tmp --font C:\fonts\Lato-Regular.ttf
 *
 * Options:
 *   --out <dir>     output folder (default: demo-pdf)
 *   --logo <file>   PNG/JPEG embedded in the masthead (default: a repo asset when present)
 *   --no-logo       force the logo-less header
 *   --font <file>   embed a Unicode TTF instead of the standard PDF fonts
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { ExamDocumentService } from '../src/backend/services/ExamDocumentService.js';
import { renderExamDocumentPdf } from '../src/backend/services/exam-doc/pdfRenderer.js';

const SCHOOL_ID = 'school-demo';
const CREATOR_ID = 'user-demo-teacher';
const CATEGORY_ID = 'cat-demo-informatique';
const CLASS_ID = 'class-demo-1a';
const EXAM_ID = 'exam-demo-1';

/** Default logo candidates, tried in order, skipped with `--no-logo`. */
const LOGO_CANDIDATES = ['uploads/school-logo.png', 'Kids assets/placeholder-scene.png'];

// ─── Demo content: 20 questions, 1 point each ────────────────────────────────
const Q = (index, row) => ({
  id: `q-demo-${index}`,
  points: 1,
  order_index: index - 1,
  points_override: null,
  school_id: SCHOOL_ID,
  created_by: CREATOR_ID,
  category_id: CATEGORY_ID,
  media_url: null,
  options_json: null,
  ...row,
});

const DEMO_QUESTIONS = [
  Q(1, {
    type: 'mcq',
    text: 'Parmi les éléments suivants, lequel NE fait PAS partie des types de données numériques ?',
    options_json: JSON.stringify(['Le texte', 'Le nombre', 'L’image', 'L’odeur']),
    answer: 'L’odeur',
    explanation: 'Une donnée numérique est textuelle, numérique, image ou son.',
  }),
  Q(2, {
    type: 'true-false',
    text: 'Un octet est composé de 8 bits.',
    answer: 'true',
    explanation: 'Vrai : 1 octet = 8 bits.',
  }),
  Q(3, {
    type: 'mcq',
    allowMultipleAnswers: true,
    text: 'Cochez toutes les unités qui servent à mesurer une capacité de stockage.',
    options_json: JSON.stringify(['Le kilo-octet (Ko)', 'Le mégaoctet (Mo)', 'Le hertz (Hz)', 'le gigaoctet (Go)']),
    answer: 'Le kilo-octet (Ko),Le mégaoctet (Mo),le gigaoctet (Go)',
    explanation: 'Le hertz mesure une fréquence, pas une capacité.',
  }),
  Q(4, {
    type: 'fill-blank',
    text: 'Complétez : le processeur ____ les instructions et la mémoire de masse les ____ de façon ____.',
    options_json: null,
    answer: 'traite, conserve, permanente',
    explanation: 'Trois attendus : traite / conserve / permanente.',
  }),
  Q(5, {
    type: 'match',
    text: 'Reliez chaque périphérique à sa famille.',
    answer: JSON.stringify([
      { left: 'Le clavier', right: 'Périphérique d’entrée' },
      { left: 'L’imprimante', right: 'Périphérique de sortie' },
      { left: 'La clé USB', right: 'Périphérique de stockage' },
      { left: 'L’écran tactile', right: 'Entrée et sortie' },
    ]),
    explanation: 'Associations attendues telles que fournies.',
  }),
  Q(6, {
    type: 'order',
    isDraggable: true,
    text: 'Placez les étapes de la conversion de 13 en binaire dans l’ordre correct.',
    options_json: JSON.stringify([
      'Écrire les restes lus du dernier au premier',
      'Diviser 13 par 2 et écrire le quotient (6)',
      'Diviser le quotient obtenu par 2, et ainsi de suite jusqu’à obtenir 0',
      'Reporter le premier reste obtenu à droite',
    ]),
    answer: 'Diviser 13 par 2 et écrire le quotient (6),Diviser le quotient obtenu par 2, et ainsi de suite jusqu’à obtenir 0,Reporter le premier reste obtenu à droite,Écrire les restes lus du dernier au premier',
    explanation: '13 → 1101.',
  }),
  Q(7, {
    type: 'mcq',
    text: 'Quel composant exécute les instructions d’un programme ?',
    options_json: JSON.stringify(['La mémoire morte', 'Le processeur', 'Le disque dur', 'La carte réseau']),
    answer: 'Le processeur',
    explanation: 'Le processeur (CPU) traite les instructions.',
  }),
  Q(8, {
    type: 'true-false',
    text: 'Un système d’exploitation est un logiciel.',
    answer: 'true',
    explanation: 'Vrai : c’est le logiciel de base de la machine.',
  }),
  Q(9, {
    type: 'code',
    text: 'Que vaut la valeur affichée par ce programme ?',
    codeSnippet: 'let bits = 16;\nlet octets = bits / 8;\nconsole.log(octets);',
    codeLanguage: 'javascript',
    codeAnswerMode: 'free-response',
    answer: '2',
    explanation: '16 bits = 2 octets.',
  }),
  Q(10, {
    type: 'odd',
    oddOneOut: true,
    text: 'Entourez l’intrus de la série.',
    options_json: JSON.stringify(['Tableur', 'Traitement de texte', 'Navigateur', 'Imprimante']),
    answer: 'Imprimante',
    explanation: 'Trois logiciels, un matériel.',
  }),
  Q(11, {
    type: 'match',
    text: 'Reliez chaque extension de fichier au type de document qu’elle désigne.',
    answer: JSON.stringify([
      { left: '.pdf', right: 'Document figé' },
      { left: '.mp3', right: 'Son' },
      { left: '.png', right: 'Image' },
      { left: '.xlsx', right: 'Tableur' },
    ]),
    explanation: 'Associations attendues telles que fournies.',
  }),
  Q(12, {
    type: 'order',
    isDraggable: true,
    text: 'Placez les étapes de la mise sous tension d’un ordinateur dans l’ordre.',
    options_json: JSON.stringify([
      'Le système d’exploitation se charge',
      'Appui sur le bouton d’alimentation',
      'Le programme de démarrage teste le matériel',
      'L’écran de connexion apparaît',
    ]),
    answer: 'Appui sur le bouton d’alimentation,Le programme de démarrage teste le matériel,Le système d’exploitation se charge,L’écran de connexion apparaît',
    explanation: 'Ordre de démarrage classique.',
  }),
  Q(13, {
    type: 'mcq',
    text: 'Que devient le contenu de la mémoire vive quand la machine est éteinte ?',
    options_json: JSON.stringify(['Il est conservé', 'Il est effacé', 'Il est copié sur le disque', 'Il est compressé']),
    answer: 'Il est effacé',
    explanation: 'La mémoire vive est volatile.',
  }),
  Q(14, {
    type: 'true-false',
    text: 'Un fichier téléchargé ne peut jamais contenir de logiciel malveillant.',
    answer: 'false',
    explanation: 'Faux : un téléchargement peut être infecté.',
  }),
  Q(15, {
    type: 'fill-blank',
    text: 'Complétez : 1 kilooctet contient environ ____ octets et 1 mégaoctet contient environ ____ kilooctets.',
    answer: '1000,1000',
    explanation: 'Deux attendus : 1000 et 1000.',
  }),
  Q(16, {
    type: 'mcq',
    text: 'Comment appelle-t-on le plus petit point d’image d’un écran ?',
    options_json: JSON.stringify(['Un pixel', 'Un octet', 'Un bit', 'Un pixel-gris']),
    answer: 'Un pixel',
    explanation: 'Le pixel est le point élémentaire.',
  }),
  Q(17, {
    type: 'match',
    text: 'Reliez chaque grandeur à sa valeur.',
    answer: JSON.stringify([
      { left: '1 bit', right: '0 ou 1' },
      { left: '1 octet', right: '8 bits' },
      { left: '1 kilo-octet', right: '1024 octets' },
      { left: '1 méga-octet', right: '1024 kilo-octets' },
    ]),
    explanation: 'Associations attendues telles que fournies.',
  }),
  Q(18, {
    type: 'order',
    isDraggable: true,
    text: 'Placez ces mémoires de la plus rapide à la plus lente.',
    options_json: JSON.stringify(['Le registre du processeur', 'La mémoire cache', 'La mémoire vive', 'Le disque dur']),
    answer: 'Le registre du processeur,La mémoire cache,La mémoire vive,Le disque dur',
    explanation: 'Hiérarchie mémoire classique.',
  }),
  Q(19, {
    type: 'code',
    text: 'Que affiche ce programme ?',
    codeSnippet: 'let note = 17.5;\nif (note >= 10) {\n  console.log("Admis");\n} else {\n  console.log("Ajourné");\n}',
    codeLanguage: 'javascript',
    codeAnswerMode: 'free-response',
    answer: 'Admis',
    explanation: '17,5 ≥ 10.',
  }),
  Q(20, {
    type: 'fill-blank',
    text: 'Complétez : le système binaire utilise ____ symboles, le système décimal en utilise ____ et le système hexadécimal en utilise ____.',
    answer: '2,10,16',
    explanation: 'Attendus : 2 / 10 / 16.',
  }),
];

// ─── Header shown on the demo paper ──────────────────────────────────────────
const DEMO_HEADER = {
  ministry: 'Ministère de l’Éducation nationale',
  academy: 'Direction provinciale',
  schoolName: 'École Alphonse Allais',
  academicYear: '2026-2027',
  title: 'Contrôle n°1 — Information et traitement',
  subject: 'Informatique',
  teacherName: 'Hicham Taybi',
  level: '1re année',
  group: 'Groupe B',
  sessionType: 'Session du printemps',
  term: 'Trimestre 2',
  date: null, // deliberately unfilled: the paper gets a date to write on
  durationMinutes: 60,
  instructions:
    'Répondez directement sur la feuille. Aucun document autorisé. Une seule réponse correcte par question, sauf mention contraire.',
  grouping: 'none',
  studentNameField: true,
  studentNumberField: true,
  showClassField: true,
};

// ─── In-memory repository double (same shapes as the real queries) ───────────
function makeRepo() {
  const exam = {
    id: EXAM_ID,
    school_id: SCHOOL_ID,
    creator_id: CREATOR_ID,
    name: 'Contrôle n°1 — Informatique',
    duration: DEMO_HEADER.durationMinutes,
    status: 'active',
    is_training: false,
    options_json: JSON.stringify({ presetSnapshot: { questions: [], name: 'demo' } }),
    questions: DEMO_QUESTIONS,
  };
  return {
    query: async (name) => (name === 'exam.withQuestions' ? exam : null),
    getById: async (store, id) => {
      if (store === 'schools' && id === SCHOOL_ID) {
        return { id: SCHOOL_ID, name: DEMO_HEADER.schoolName, logo_url: null, school_year: DEMO_HEADER.academicYear };
      }
      if (store === 'users' && id === CREATOR_ID) return { id: CREATOR_ID, name: DEMO_HEADER.teacherName, role: 'teacher' };
      if (store === 'exams') return { ...exam, questions: undefined };
      return null;
    },
    getAll: async (store) => {
      if (store === 'categories') {
        return { data: [{ id: CATEGORY_ID, school_id: SCHOOL_ID, name: DEMO_HEADER.subject }], total: 1 };
      }
      if (store === 'classes') return { data: [{ id: CLASS_ID, school_id: SCHOOL_ID, name: DEMO_HEADER.level }], total: 1 };
      if (store === 'exam_classes') {
        return { data: [{ id: 'link-1', exam_id: EXAM_ID, class_id: CLASS_ID }], total: 1 };
      }
      return { data: [], total: 0 };
    },
    update: async () => {
      throw new Error('Le générateur ne doit jamais écrire en base.');
    },
  };
}

function logoDataUrl(explicit, disabled) {
  if (disabled) return null;
  const candidates = explicit ? [explicit] : LOGO_CANDIDATES;
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const ext = extname(file).toLowerCase();
    if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') continue; // pdfkit reads these two only
    const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
  }
  return null; // no readable file → the header falls back to the initial disc
}

function parseArgs(argv) {
  const out = { out: 'demo-pdf', logo: null, noLogo: false, font: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--logo') out.logo = argv[++i];
    else if (arg === '--no-logo') out.noLogo = true;
    else if (arg === '--out') out.out = argv[++i];
    else if (arg === '--font') out.font = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
    return;
  }

  const logo = logoDataUrl(args.logo, args.noLogo);
  const service = new ExamDocumentService(makeRepo());
  const header = { ...DEMO_HEADER, ...(logo ? { logoDataUrl: logo } : {}) };
  const options = { uploadsDir: 'uploads', ...(args.font ? { fontTtf: args.font } : {}) };

  mkdirSync(args.out, { recursive: true });
  console.log(logo ? `Logo intégré : ${logo.slice(0, 24)}…` : 'Logo : aucun fichier lisible → pastille avec l’initiale.');

  for (const document of ['student', 'answer_key']) {
    const model = await service.buildExamDocument({
      examId: EXAM_ID,
      schoolId: SCHOOL_ID,
      document,
      header,
      normalization: { mode: 'as-is', confirmed: false },
    });
    if (model.scoring.error) {
      console.error(`Barème non conforme (${model.scoring.error.message}) — la démo n’est pas produite.`);
      process.exitCode = 1;
      return;
    }
    const { buffer, pages, warnings } = await renderExamDocumentPdf(model, options);
    const file = resolve(args.out, document === 'student' ? 'sujet-exam-demo.pdf' : 'corrige-exam-demo.pdf');
    writeFileSync(file, buffer);
    console.log(`${document === 'student' ? 'Sujet    ' : 'Corrigé  '} : ${pages} page(s), ${buffer.length} octets → ${file}`);
    for (const w of warnings) console.log(`   alerte [${w.type}] ${w.message}`);
  }
}

main().catch((err) => {
  console.error('Génération impossible :', err);
  process.exitCode = 1;
});
