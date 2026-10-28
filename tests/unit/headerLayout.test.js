/**
 * tests/unit/headerLayout.test.js
 *
 * `headerLayout.js` is the single source of truth for what the paper header
 * shows and in which order; the three renderers only decide how to draw it. Two
 * behaviours live here and are locked by this file:
 *
 *   1. `showHeader` toggles the whole masthead band on/off.
 *   2. `hiddenFields` (set by the teacher from the Revue tab) hides individual
 *      elements by their field name, without inventing content for whatever is
 *      left blank.
 *
 * These are pure functions over a `{ header, meta, scoring }` model, so the
 * fixtures are built by hand — no service or renderer involved.
 */

import { describe, it, expect } from 'vitest';
import {
  examHeaderParts,
  examIdentityParts,
  examInstructions,
  teacherLabel,
} from '../../src/backend/services/exam-doc/headerLayout.js';

/** A fully populated header so every element has something to render. */
function fullHeader(extra = {}) {
  return {
    schoolName: 'Lycée Victor Hugo',
    subject: 'Informatique',
    level: '1re année',
    group: 'Groupe B',
    ministry: 'Ministère de l’Éducation',
    academy: 'Direction provinciale',
    academicYear: '2026-2027',
    sessionType: 'Session du printemps',
    term: 'Trimestre 2',
    title: 'Contrôle n°1',
    teacherName: 'Hicham Taybi',
    durationMinutes: 60,
    date: '12/03/2026',
    instructions: 'Répondez sur la copie.',
    logoUrl: '/uploads/school-logo.png',
    studentNameField: true,
    studentNumberField: true,
    showClassField: true,
    ...extra,
  };
}

function modelFor(header, meta = { document: 'student' }, scoring = { total: 20 }) {
  return { header, meta, scoring };
}

const lineText = (parts, role) => parts.find((l) => l.role === role)?.text ?? null;
const infoHas = (parts, needle) => parts.some((s) => s.includes(needle));

describe('examHeaderParts — showHeader master switch', () => {
  it('enables the band by default and when explicitly on', () => {
    expect(examHeaderParts(modelFor(fullHeader())).enabled).toBe(true);
    expect(examHeaderParts(modelFor(fullHeader({ showHeader: true }))).enabled).toBe(true);
  });

  it('disables only the band, leaving everything else intact', () => {
    const parts = examHeaderParts(modelFor(fullHeader({ showHeader: false })));
    expect(parts.enabled).toBe(false);
    // The switch is presentation-only: the title and lines are still resolved.
    expect(parts.title).toBe('CONTRÔLE N°1');
  });
});

describe('examHeaderParts — no hiddenFields shows everything', () => {
  const parts = examHeaderParts(modelFor(fullHeader()));

  it('draws the logo from logoUrl when no data URL is present', () => {
    expect(parts.logo).toBe('/uploads/school-logo.png');
  });

  it('fills the left column (school, programme, institution)', () => {
    expect(lineText(parts.left, 'school')).toBe('Lycée Victor Hugo');
    expect(lineText(parts.left, 'programme')).toContain('Informatique');
    expect(lineText(parts.left, 'programme')).toContain('1re année');
    expect(lineText(parts.left, 'institution')).toContain('Ministère de l’Éducation');
  });

  it('fills the right column (year, session)', () => {
    expect(lineText(parts.right, 'year')).toBe('Année scolaire 2026-2027');
    expect(lineText(parts.right, 'session')).toContain('Session du printemps');
    expect(lineText(parts.right, 'session')).toContain('Trimestre 2');
  });

  it('upper-cases the title and lists the info line', () => {
    expect(parts.title).toBe('CONTRÔLE N°1');
    expect(infoHas(parts.info, 'Prof. Hicham Taybi')).toBe(true);
    expect(infoHas(parts.info, 'Durée : 60 min')).toBe(true);
    expect(infoHas(parts.info, 'Date : 12/03/2026')).toBe(true);
  });

  it('only puts the barème on the answer key', () => {
    const key = examHeaderParts(modelFor(fullHeader(), { document: 'answer_key' }));
    expect(infoHas(key.info, 'Barème : 20 points')).toBe(true);
    expect(infoHas(parts.info, 'Barème')).toBe(false);
  });
});

describe('examHeaderParts — hiddenFields hides individual elements', () => {
  it('hides the logo', () => {
    const parts = examHeaderParts(modelFor(fullHeader({ hiddenFields: ['logo'] })));
    expect(parts.logo).toBeNull();
  });

  it('prefers logoDataUrl over logoUrl when neither is hidden', () => {
    const parts = examHeaderParts(
      modelFor(fullHeader({ logoDataUrl: 'data:image/png;base64,AAAA' })),
    );
    expect(parts.logo).toBe('data:image/png;base64,AAAA');
  });

  it('blanks the school line', () => {
    const parts = examHeaderParts(modelFor(fullHeader({ hiddenFields: ['schoolName'] })));
    expect(lineText(parts.left, 'school')).toBe('');
  });

  it('drops only the hidden part of a joined line', () => {
    const parts = examHeaderParts(modelFor(fullHeader({ hiddenFields: ['subject'] })));
    const programme = lineText(parts.left, 'programme');
    expect(programme).not.toContain('Informatique');
    expect(programme).toContain('1re année');
    expect(programme).toContain('Groupe B');
  });

  it('blanks the whole programme line only when all three fields are hidden', () => {
    const parts = examHeaderParts(
      modelFor(fullHeader({ hiddenFields: ['subject', 'level', 'group'] })),
    );
    expect(lineText(parts.left, 'programme')).toBe('');
  });

  it('keeps the institution line while at least one of ministry/academy shows', () => {
    const hiddenMinistry = examHeaderParts(modelFor(fullHeader({ hiddenFields: ['ministry'] })));
    expect(lineText(hiddenMinistry.left, 'institution')).toBe('Direction provinciale');

    const hiddenBoth = examHeaderParts(
      modelFor(fullHeader({ hiddenFields: ['ministry', 'academy'] })),
    );
    expect(lineText(hiddenBoth.left, 'institution')).toBe('');
  });

  it('blanks the year and session lines independently', () => {
    const parts = examHeaderParts(
      modelFor(fullHeader({ hiddenFields: ['academicYear', 'sessionType', 'term'] })),
    );
    expect(lineText(parts.right, 'year')).toBe('');
    expect(lineText(parts.right, 'session')).toBe('');
  });

  it('empties the title', () => {
    const parts = examHeaderParts(modelFor(fullHeader({ hiddenFields: ['title'] })));
    expect(parts.title).toBe('');
  });

  it('removes each gated entry from the info line', () => {
    const parts = examHeaderParts(
      modelFor(fullHeader({ hiddenFields: ['teacherName', 'durationMinutes', 'date'] })),
    );
    expect(parts.info).toEqual([]);
  });

  it('hides the barème on the key when scoring is hidden', () => {
    const key = examHeaderParts(
      modelFor(fullHeader({ hiddenFields: ['scoring'] }), { document: 'answer_key' }),
    );
    expect(infoHas(key.info, 'Barème')).toBe(false);
  });
});

describe('examIdentityParts — hiddenFields', () => {
  it('shows the three identity rows and the note box by default', () => {
    const identity = examIdentityParts(modelFor(fullHeader()));
    expect(identity.showNote).toBe(true);
    const flat = identity.rows.flat();
    expect(flat).toContain('Nom & prénom :');
    expect(flat).toContain('N° :');
    expect(flat).toContain('Classe :');
  });

  it('drops the note box when noteBox is hidden', () => {
    const identity = examIdentityParts(modelFor(fullHeader({ hiddenFields: ['noteBox'] })));
    expect(identity.showNote).toBe(false);
  });

  it('hides individual identity fields', () => {
    const identity = examIdentityParts(
      modelFor(fullHeader({ hiddenFields: ['studentNameField', 'showClassField'] })),
    );
    const flat = identity.rows.flat();
    expect(flat).not.toContain('Nom & prénom :');
    expect(flat).not.toContain('Classe :');
    expect(flat).toContain('N° :');
  });

  it('returns nothing for the answer key', () => {
    const identity = examIdentityParts(modelFor(fullHeader(), { document: 'answer_key' }));
    expect(identity.rows).toEqual([]);
    expect(identity.showNote).toBe(false);
  });
});

describe('examInstructions — hiddenFields', () => {
  it('renders the instruction line for the student sheet', () => {
    const text = examInstructions(modelFor(fullHeader()));
    expect(text).toContain('Consignes :');
    expect(text).toContain('Répondez sur la copie.');
  });

  it('reframes the instruction for the answer key', () => {
    const text = examInstructions(modelFor(fullHeader(), { document: 'answer_key' }));
    expect(text).toContain('Consignes données aux élèves :');
  });

  it('returns null when the field is hidden or empty', () => {
    expect(examInstructions(modelFor(fullHeader({ hiddenFields: ['instructions'] })))).toBeNull();
    expect(examInstructions(modelFor(fullHeader({ instructions: '' })))).toBeNull();
  });
});

describe('teacherLabel', () => {
  it('adds a civility only when the name does not already carry one', () => {
    expect(teacherLabel('Hicham Taybi')).toBe('Prof. Hicham Taybi');
    expect(teacherLabel('Mme Aïchouche')).toBe('Mme Aïchouche');
    expect(teacherLabel('   ')).toBeNull();
  });
});
