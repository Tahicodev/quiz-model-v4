/**
 * src/backend/services/exam-doc/headerLayout.js
 *
 * The paper header used to be written three times — once per renderer — and the
 * three copies drifted: the PDF drew a logo-left / title-centre band while Word
 * stacked every line centred and the preview had its own order again. One exam
 * therefore produced three different looking sheets.
 *
 * This module is the single source of truth for WHAT the header says and in
 * WHICH order; `pdfRenderer`, `docxRenderer` and `htmlPreview` only decide HOW
 * it is drawn on their own medium. Adding a header line, renaming a label or
 * hiding the whole band is a change made here once.
 *
 * Shape of the sheet header (the teacher hides it with the `showHeader` switch):
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ [LOGO]  NOM DE L'ÉTABLISSEMENT              Année 2026-27  │
 *   │         Informatique · 1re année            Session · Tri. │
 *   │         Ministère · Direction                              │
 *   ├════════════════════════════════════════════════════════════┤ ← accent rule
 *   │           CONTRÔLE N°1 — INFORMATION & TRAITEMENT          │
 *   │    Prof. Hicham Taybi · Durée : 60 min · Date : __/__/__   │
 *   │ ┌──────────────────────────────────┐ ┌──────────────────┐  │
 *   │ │ Nom & prénom : …………………          │ │ NOTE             │  │
 *   │ │ N° : ………       Classe : ………     │ │        ____ / 20 │  │
 *   │ └──────────────────────────────────┘ └──────────────────┘  │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Nothing is invented here: an empty field renders no line, and a date the
 * teacher did not fill stays a blank to write on paper.
 */

import { EXAM_DOC_TARGET_SCORE } from '../../../shared/schemas/examDocument.schema.js';
import { formatPoints } from './text.js';

/**
 * One accent for the whole paper, dark enough to survive a photocopier.
 * `#`-prefixed for pdfkit/CSS, bare for the Office Open XML colour attributes.
 */
export const HEADER_INK = Object.freeze({
  accent: '#1F3A5F',
  accentHex: '1F3A5F',
  muted: '#5B6472',
  mutedHex: '5B6472',
  hairline: '#C9D1D9',
  hairlineHex: 'C9D1D9',
  fieldBg: '#F6F8FA',
  fieldBgHex: 'F6F8FA',
});

/** The blank a student fills in: never a guessed date. */
export const DATE_BLANK = '____/____/______';

const SEPARATOR = '·';

/** A name that already carries a civility is printed as written. */
const CIVILITY = /^(m\s*me|m{1,2}\.|mr|melle?|mlle|monsieur|madame|prof|pr|dr)[.\s]/i;

export function teacherLabel(name) {
  const value = String(name ?? '').trim();
  if (!value) return null;
  return CIVILITY.test(value) ? value : `Prof. ${value}`;
}

/** `a · b · c`, skipping whatever is empty. */
function joinBits(bits) {
  return bits
    .map((bit) => String(bit ?? '').trim())
    .filter(Boolean)
    .join(` ${SEPARATOR} `);
}

/**
 * Everything the top of the sheet prints, in display order.
 * Individual elements are suppressed when their field name appears in
 * `header.hiddenFields` (set by the teacher via the Revue tab).
 * @returns {{
 *   enabled: boolean, band: boolean, logo: string|null, logoScale: number, initials: string,
 *   left: Array<{text: string, role: string}>, right: Array<{text: string, role: string}>,
 *   title: string, tag: string, info: string[]
 * }}
 */
export function examHeaderParts(model) {
  const { header, meta, scoring } = model;
  const isKey = meta.document === 'answer_key';
  const school = String(header.schoolName || meta.examName || 'Examen').trim();
  const line = (text, role) => ({ text: String(text ?? '').trim(), role });
  const hidden = new Set(Array.isArray(header.hiddenFields) ? header.hiddenFields : []);
  const isHidden = (field) => hidden.has(field);
  const allHidden = (...fields) => fields.every((f) => isHidden(f));

  return {
    // `showHeader` is a presentation switch only: it never touches the answers,
    // the barème or the identity fields below it.
    enabled: header.showHeader !== false,
    // `showMastheadBand` is the finer switch: only the top band (logo, school,
    // academic year, side lines) disappears — the title and the information
    // line (Prof. · Durée · Date) stay printed by default.
    band: header.showMastheadBand !== false,
    logo: isHidden('logo') ? null : (header.logoDataUrl || header.logoUrl || null),
    logoScale: Number(header.logoScale) || 1,
    initials: school.slice(0, 1).toUpperCase(),
    left: [
      isHidden('schoolName') ? line('', 'school') : line(school, 'school'),
      allHidden('subject', 'level', 'group')
        ? line('', 'programme')
        : line(joinBits([
            isHidden('subject') ? null : header.subject,
            isHidden('level') ? null : header.level,
            isHidden('group') ? null : header.group,
          ]), 'programme'),
      allHidden('ministry', 'academy')
        ? line('', 'institution')
        : line(joinBits([
            isHidden('ministry') ? null : header.ministry,
            isHidden('academy') ? null : header.academy,
          ]), 'institution'),
    ],
    right: [
      isHidden('academicYear')
        ? line('', 'year')
        : line(header.academicYear ? `Année scolaire ${header.academicYear}` : '', 'year'),
      allHidden('sessionType', 'term')
        ? line('', 'session')
        : line(joinBits([
            isHidden('sessionType') ? null : header.sessionType,
            isHidden('term') ? null : header.term,
          ]), 'session'),
    ],
    // The title is the one line every format prints in capitals: doing the
    // casing here (instead of per renderer) keeps PDF, Word and preview showing
    // the same characters, and an accented title stays correctly accented.
    title: isHidden('title')
      ? ''
      : String(header.title || meta.examName || 'Examen').trim().toUpperCase(),
    tag: isKey ? 'CORRIGÉ — document enseignant, ne pas distribuer' : '',
    info: [
      isHidden('teacherName') ? null : teacherLabel(header.teacherName),
      isHidden('durationMinutes') || !header.durationMinutes
        ? null
        : `Durée : ${header.durationMinutes} min`,
      // A date the teacher did not fill stays a blank to write on paper.
      isHidden('date')
        ? null
        : `Date : ${String(header.date ?? '').trim() || DATE_BLANK}`,
      isKey && !isHidden('scoring') ? `Barème : ${formatPoints(scoring.total)} points` : null,
    ].filter(Boolean),
  };
}

/**
 * The fill-in area under the title: identity fields on a light plate, grade in a
 * dedicated box. Rows are laid out so the name gets a whole line (it needs the
 * room) and the short fields share the next one.
 */
export function examIdentityParts(model) {
  if (model.meta.document !== 'student') return { rows: [], showNote: false };
  const { header } = model;
  const hidden = new Set(Array.isArray(header.hiddenFields) ? header.hiddenFields : []);
  const fields = [];
  if (header.studentNameField !== false && !hidden.has('studentNameField')) fields.push('Nom & prénom :');
  if (header.studentNumberField !== false && !hidden.has('studentNumberField')) fields.push('N° :');
  if (header.showClassField !== false && !hidden.has('showClassField')) fields.push('Classe :');
  return {
    rows: fields.length >= 3 ? [[fields[0]], fields.slice(1)] : fields.length ? [fields] : [],
    showNote: !hidden.has('noteBox'),
    noteLabel: 'NOTE',
    noteSuffix: `/ ${EXAM_DOC_TARGET_SCORE}`,
  };
}

/** The instruction line, worded for the audience holding the sheet. */
export function examInstructions(model) {
  const hidden = new Set(Array.isArray(model.header.hiddenFields) ? model.header.hiddenFields : []);
  if (hidden.has('instructions')) return null;
  const text = String(model.header.instructions ?? '').trim();
  if (!text) return null;
  return model.meta.document === 'answer_key'
    ? `Consignes données aux élèves : ${text}`
    : `Consignes : ${text}`;
}

export { SEPARATOR };
