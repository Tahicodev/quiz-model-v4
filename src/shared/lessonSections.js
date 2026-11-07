/**
 * src/shared/lessonSections.js
 * Canonical lesson-section vocabulary + highlight extraction.
 *
 * A generated lesson body is Markdown with a stable skeleton (Introduction,
 * Objectives, Key concepts, Definition, Explanation, Examples, Common
 * mistakes, Check yourself). The AI prompt localizes those headings, while
 * the student chapter page needs the Objectives / Key concepts of every
 * lesson regardless of the language the course was generated in.
 *
 * Keeping the label table and the parser here gives the backend prompt
 * builder and the frontend reader one source of truth. Identifiers are
 * deliberately English ("objectives", "key_concepts") — only the rendered
 * headings are localized.
 */

/** Ordered skeleton indexes — the order the lesson-content prompt requests. */
export const SECTION_INDEX = Object.freeze({
  introduction: 0,
  objectives: 1,
  keyConcepts: 2,
  definition: 3,
  explanation: 4,
  examples: 5,
  mistakes: 6,
  check: 7,
});

export const LESSON_SECTION_LABELS = Object.freeze({
  french: ['Introduction', 'Objectifs', 'Concepts clés', 'Définition', 'Explication', 'Exemples', 'Erreurs fréquentes', 'Vérifiez vos acquis'],
  français: ['Introduction', 'Objectifs', 'Concepts clés', 'Définition', 'Explication', 'Exemples', 'Erreurs fréquentes', 'Vérifiez vos acquis'],
  english: ['Introduction', 'Objectives', 'Key concepts', 'Definition', 'Explanation', 'Examples', 'Common mistakes', 'Check yourself'],
  spanish: ['Introducción', 'Objetivos', 'Conceptos clave', 'Definición', 'Explicación', 'Ejemplos', 'Errores frecuentes', 'Comprueba lo aprendido'],
  español: ['Introducción', 'Objetivos', 'Conceptos clave', 'Definición', 'Explicación', 'Ejemplos', 'Errores frecuentes', 'Comprueba lo aprendido'],
  portuguese: ['Introdução', 'Objetivos', 'Conceitos-chave', 'Definição', 'Explicação', 'Exemplos', 'Erros comuns', 'Teste seus conhecimentos'],
  german: ['Einleitung', 'Lernziele', 'Kernbegriffe', 'Definition', 'Erklärung', 'Beispiele', 'Häufige Fehler', 'Überprüfe dein Wissen'],
  italian: ['Introduzione', 'Obiettivi', 'Concetti chiave', 'Definizione', 'Spiegazione', 'Esempi', 'Errori comuni', 'Verifica'],
  dutch: ['Inleiding', 'Leerdoelen', 'Kernbegrippen', 'Definitie', 'Uitleg', 'Voorbeelden', 'Veelgemaakte fouten', 'Test jezelf'],
  turkish: ['Giriş', 'Kazanımlar', 'Temel kavramlar', 'Tanım', 'Açıklama', 'Örnekler', 'Sık yapılan hatalar', 'Kendini dene'],
  arabic: ['مقدمة', 'الأهداف', 'المفاهيم الأساسية', 'التعريف', 'الشرح', 'أمثلة', 'أخطاء شائعة', 'تحقق من تعلمك'],
});

const DEFAULT_LANGUAGE = 'english';

/** Localized heading skeleton for one language (English when unknown). */
export function lessonSectionLabels(language = 'French') {
  const lang = String(language || '').toLowerCase();
  return LESSON_SECTION_LABELS[lang] || LESSON_SECTION_LABELS[DEFAULT_LANGUAGE];
}

/**
 * Normalize a heading for matching: strip Markdown noise, a trailing colon
 * and case/whitespace differences. "  ## **Objectifs :**  " → "objectifs".
 */
function normalizeHeading(text) {
  return String(text || '')
    .replace(/[`*_~#]/g, '')
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Teachers (and older course versions) sometimes use a longer variant of the
// two headings we extract. Match those too so the chapter panel stays useful.
const EXTRA_ALIASES = {
  objectives: [
    'objectifs pédagogiques',
    "objectifs d'apprentissage",
    'objectifs spécifiques',
    'objectives pedagogiques',
    'learning objectives',
    'learning outcomes',
    'learning goals',
  ],
  keyConcepts: [
    'notions clés',
    'notions cles',
    'notions essentielles',
    'concepts fondamentaux',
    'core concepts',
    'key ideas',
  ],
};

const OBJECTIVE_HEADINGS = new Set(EXTRA_ALIASES.objectives.map(normalizeHeading));
const KEY_CONCEPT_HEADINGS = new Set(EXTRA_ALIASES.keyConcepts.map(normalizeHeading));
for (const labels of Object.values(LESSON_SECTION_LABELS)) {
  OBJECTIVE_HEADINGS.add(normalizeHeading(labels[SECTION_INDEX.objectives]));
  KEY_CONCEPT_HEADINGS.add(normalizeHeading(labels[SECTION_INDEX.keyConcepts]));
}

const BULLET = /^\s*(?:[-*+•]|\d+[.)])\s+/;
const HEADING = /^\s*#{1,6}\s+(.+?)\s*$/;

function cleanItem(line) {
  return String(line || '')
    .replace(BULLET, '')
    .replace(/[`*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract the Objectives and Key concepts items from one lesson body.
 * Matches headings in any known language, so a French course read with an
 * English UI still contributes its highlights to the chapter panel.
 *
 * Returns `{ objectives: string[], keyConcepts: string[] }` — arrays are
 * de-duplicated and keep document order.
 */
export function extractLessonHighlights(markdown) {
  const result = { objectives: [], keyConcepts: [] };
  let bucket = null;
  let buffer = [];

  const flush = () => {
    if (!bucket || !buffer.length) {
      buffer = [];
      return;
    }
    const bullets = buffer.filter((line) => BULLET.test(line));
    let source = bullets;
    if (!source.length) {
      // No list markers: fall back to paragraphs separated by blank lines.
      source = [];
      let paragraph = [];
      for (const line of buffer) {
        if (!line.trim()) {
          if (paragraph.length) {
            source.push(paragraph.join(' '));
            paragraph = [];
          }
        } else {
          paragraph.push(line.trim());
        }
      }
      if (paragraph.length) source.push(paragraph.join(' '));
    }
    for (const raw of source) {
      const item = cleanItem(raw);
      if (item && !result[bucket].includes(item)) result[bucket].push(item);
    }
    buffer = [];
  };

  for (const line of String(markdown || '').replace(/\r\n/g, '\n').split('\n')) {
    const heading = line.match(HEADING);
    if (heading) {
      flush();
      const key = normalizeHeading(heading[1]);
      bucket = OBJECTIVE_HEADINGS.has(key)
        ? 'objectives'
        : KEY_CONCEPT_HEADINGS.has(key)
          ? 'keyConcepts'
          : null;
      continue;
    }
    if (bucket) buffer.push(line);
  }
  flush();
  return result;
}