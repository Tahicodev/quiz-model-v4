/**
 * src/backend/services/exam-doc/templates/index.js
 *
 * The template registry — the "model" layer of the generator.
 *
 * Built-in templates ship as versioned JSON next to this file; teacher-authored
 * templates are merged in from `Exam.options_json` at the service layer. This
 * module turns any template (built-in id, JSON, or a partial override) into a
 * single frozen ENGINE CONFIG that the layout engine reads, so no geometry is
 * ever hardcoded in a renderer again.
 *
 * `ENGINE_DEFAULTS` reproduces the historical "Classique" sheet to the point:
 * resolving the Classique template yields exactly the constants the renderer
 * used before the refactor, which is what lets the whole existing test suite
 * pass unchanged (byte-identical output).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ExamTemplateSchema,
  ExamTemplateOverrideSchema,
} from '../../../../shared/schemas/examTemplate.schema.js';
import { HEADER_INK } from '../headerLayout.js';

const PAGE_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  Letter: { width: 612, height: 792 },
};

/**
 * Everything the layout engine reads that a template does NOT expose (the fine
 * masthead typography, the grade-box and logo geometry, the answer markers).
 * These values are the exact constants that lived in `pdfRenderer.js` before the
 * template refactor, so the default config is a faithful clone of the old sheet.
 */
const ENGINE_DEFAULTS = Object.freeze({
  footerH: 26,
  codePad: 6,
  marker: { radio: '( )', checkbox: '[ ]' },
  header: {
    variant: 'bandeau',
    anonymity: false,
    fullOnFirstPage: true,
    // The exam title prints once, on the first sheet: teachers asked for no
    // repeated "DEVOIR SURVEILLÉ N° 1" band on page 2+, and the space it
    // reserved goes back to the questions. A template can still opt in.
    compactOnFollow: false,
    noteW: 126, // ≈ 4.4 cm grade box
    noteH: 58,
    logoMaxW: 132,
    logoMaxH: 54,
    discR: 20,
    bandMin: 52,
    ruleGap: 8,
    ruleT: 2.4,
    titleGap: 7,
    subGap: 3,
    tagSize: 9,
    rightW: 170,
  },
});

/** Masthead line typography, resolved against the theme colours. */
function mastheadLine(colors) {
  return {
    school: { face: 'headBold', size: 14, color: colors.accent, lineGap: 0.5 },
    programme: { face: 'head', size: 9.5, color: colors.muted, lineGap: 0.5, spaceBefore: 1 },
    institution: { face: 'head', size: 8, color: colors.muted, lineGap: 0 },
    year: { face: 'head', size: 9.5, color: colors.muted, align: 'right', lineGap: 0 },
    session: { face: 'head', size: 9, color: colors.muted, align: 'right', lineGap: 0 },
  };
}

function loadBuiltIn(name) {
  const url = new URL(`./${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
}

// `ultra` is the tightest paper the schema allows (24 pt margins, 2 columns,
// 0.7 density, 9.5 pt body, no per-question rules, inline answers): a 20-question
// subject of short items is meant to land on two sheets.
const BUILT_IN_NAMES = ['classique', 'moderne', 'compact', 'ultra', 'officiel', 'college'];
const BUILT_IN = new Map();
for (const name of BUILT_IN_NAMES) {
  const tpl = ExamTemplateSchema.parse(loadBuiltIn(name));
  BUILT_IN.set(tpl.id, tpl);
}

const deepMerge = (base, patch) => {
  if (patch === undefined) return base;
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return patch;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? deepMerge(base[key] ?? {}, value)
        : value;
  }
  return out;
};

/**
 * Turn a template (built-in id, a JSON template, or `null`) plus an optional
 * partial override into the frozen config the engine consumes.
 * @param {string|object|null} template
 * @param {object} [overrides] partial template-shaped override (columns, density…)
 */
export function resolveTemplate(template = null, overrides = null) {
  let base;
  if (typeof template === 'string') {
    base = BUILT_IN.get(template) || BUILT_IN.get('classique');
  } else if (template && typeof template === 'object' && template.page && template.theme) {
    // Already a full template object (e.g. a persisted custom template).
    base = ExamTemplateSchema.parse(template);
  } else if (template && typeof template === 'object' && (template.page || template.theme || template.header || template.question || template.footer)) {
    // A PARTIAL custom template: "Save my template" snapshots only the levers
    // the teacher touched plus the `baseId` of the look they were saved from.
    // Replaying it onto that base is what keeps a Compact sheet from silently
    // turning into Classique the moment it is stored and reloaded.
    const partial = { ...template };
    const baseId = typeof partial.baseId === 'string' ? partial.baseId : null;
    delete partial.baseId;
    const parent = BUILT_IN.get(baseId || '');
    base = ExamTemplateSchema.parse(deepMerge(parent || BUILT_IN.get('classique'), partial));
  } else {
    base = BUILT_IN.get('classique');
  }

  if (overrides) {
    const parsed = ExamTemplateOverrideSchema.parse(overrides);
    base = deepMerge(base, parsed);
  }

  const margin = { top: 42, right: 42, bottom: 42, left: 42, ...(base.page?.margin || {}) };
  const sizeKey = base.page?.size || 'A4';
  const portrait = PAGE_SIZES[sizeKey] || PAGE_SIZES.A4;
  const landscape = base.page?.orientation === 'landscape';
  const pageW = landscape ? portrait.height : portrait.width;
  const pageH = landscape ? portrait.width : portrait.height;
  const columns = base.page?.columns || 1;
  const gutter = base.page?.gutter ?? 18;
  const footerH = ENGINE_DEFAULTS.footerH;

  const colors = {
    accent: HEADER_INK.accent,
    muted: HEADER_INK.muted,
    hairline: HEADER_INK.hairline,
    fieldBg: HEADER_INK.fieldBg,
    ...(base.theme?.colors || {}),
  };
  const sizes = { body: 12, small: 10, tiny: 9, title: 15, ...(base.theme?.sizes || {}) };
  const fonts = {
    regular: 'Times-Roman',
    bold: 'Times-Bold',
    italic: 'Times-Italic',
    mono: 'Courier',
    head: 'Helvetica',
    headBold: 'Helvetica-Bold',
    ...(base.theme?.fonts || {}),
  };
  const density = base.theme?.density ?? 1.0;
  const contentW = pageW - margin.left - margin.right;
  const colW = columns === 2 ? (contentW - gutter) / 2 : contentW;

  const header = { ...ENGINE_DEFAULTS.header, ...(base.header || {}) };
  const question = {
    pointBadge: true,
    vectorBoxes: true,
    separators: 'rule',
    answerLines: 2,
    answerLineHeight: 14,
    keepTogether: 'block',
    answerStyle: 'classic',
    ...(base.question || {}),
    ...(base.question?.answerSpace || {}),
  };
  // answerSpace is nested in the public shape; flatten it onto `question`.
  if (base.question?.answerSpace) {
    question.answerLines = base.question.answerSpace.lines ?? question.answerLines;
    question.answerLineHeight = base.question.answerSpace.lineHeight ?? question.answerLineHeight;
  }

  return Object.freeze({
    isEngine: true,
    id: base.id || 'classique',
    name: base.name || 'Classique',
    schemaVersion: base.schemaVersion || 1,
    page: {
      size: sizeKey,
      orientation: base.page?.orientation || 'portrait',
      margin,
      columns,
      gutter,
      ruleBetween: !!base.page?.rule?.between,
    },
    pageW,
    pageH,
    margin,
    contentW,
    colW,
    usableH: pageH - margin.top - margin.bottom - footerH,
    footerH,
    codePad: ENGINE_DEFAULTS.codePad,
    marker: ENGINE_DEFAULTS.marker,
    theme: { fonts, sizes, colors, density },
    header: { ...header, mastheadLine: mastheadLine(colors), titleSize: sizes.title },
    footer: {
      variant: 'title+number',
      total: true,
      encouragement: 'Bon courage !',
      ...(base.footer || {}),
    },
    question,
  });
}

/** The default (Classique) config — what the renderers use when none is given. */
export function defaultTemplateConfig() {
  return resolveTemplate('classique');
}

/**
 * Renderer-facing resolver: pass through an already-resolved engine config (so
 * a route can resolve once and hand the SAME config to PDF, Word and HTML) or
 * build one from a template id / JSON plus overrides.
 * @param {{ template?: string|object, templateOverrides?: object }} options
 */
export function resolveForRenderer(options = {}) {
  const t = options.template;
  if (t && t.isEngine) return t;
  return resolveTemplate(t ?? 'classique', options.templateOverrides ?? null);
}

/**
 * Turn the "Génération personnalisée" layout controls (columns / density /
 * answer lines / header layout) into a template-shaped override the registry can
 * merge. Keys left null are ignored so the base template's own value wins.
 * @param {{ columns?: number, density?: number, answerLines?: number, headerVariant?: string }} layout
 */
export function overridesFromLayout(layout = {}) {
  if (!layout) return null;
  const out = {};
  if (layout.columns != null) out.page = { columns: layout.columns };
  if (layout.density != null) out.theme = { density: layout.density };
  if (layout.answerLines != null || layout.answerStyle != null) {
    out.question = {};
    if (layout.answerLines != null) out.question.answerSpace = { lines: layout.answerLines };
    if (layout.answerStyle != null) out.question.answerStyle = layout.answerStyle;
  }
  // The header picker overrides the template's own layout: the teacher chooses
  // WHERE the printed elements go independently of the paper they started from.
  if (layout.headerVariant != null) out.header = { variant: layout.headerVariant };
  return Object.keys(out).length ? out : null;
}

/**
 * Resolve straight from a request body: `{ templateId, layout }`. Resolves once
 * so PDF, Word and HTML all read the identical frozen config.
 */
export function resolveFromRequest({ templateId, layout } = {}) {
  return resolveTemplate(templateId || 'classique', overridesFromLayout(layout));
}

/**
 * Merge the live layout controls and an explicit partial override (the "Tenir en
 * N pages" result) into one override object, layout winning on shared keys.
 * Returns null when nothing is overridden so the base template stays intact.
 */
export function requestOverrides({ layout, templateOverrides } = {}) {
  const merged = deepMerge(templateOverrides ?? {}, overridesFromLayout(layout) ?? {});
  return Object.keys(merged).length ? merged : null;
}

export function getTemplate(id) {
  return BUILT_IN.get(id) || null;
}

/** Public metadata for the "Génération personnalisée" cards. */
export function listTemplates() {
  return [...BUILT_IN.values()].map((tpl) => ({
    id: tpl.id,
    name: tpl.name,
    columns: tpl.page?.columns ?? 1,
    headerVariant: tpl.header?.variant ?? 'bandeau',
    footerVariant: tpl.footer?.variant ?? 'title+number',
    density: tpl.theme?.density ?? 1,
    // The picker has to show the answer style the paper will really use: a
    // template can ship `answerStyle: 'inline'` (Ultra compact does), and the
    // "Compact inline answers" checkbox is the teacher's override of it.
    answerStyle: tpl.question?.answerStyle ?? 'classic',
  }));
}

export { BUILT_IN as BUILT_IN_TEMPLATES };
