/**
 * src/backend/services/exam-doc/pageEstimator.js
 *
 * Two ways to answer "how many pages will this paper be?":
 *
 *  - `estimateAnalytic(model, cfg)`  an INSTANT estimate. It never lays out or
 *    paginates a document: it measures every text run with a throwaway pdfkit
 *    face (the SAME font metrics the renderer uses), turns each question into a
 *    height, then packs those heights greedily column-by-column exactly the way
 *    the layout engine fills them. Because the per-item heights come from real
 *    metrics, the analytic count tracks the real one to within a page while
 *    costing a few milliseconds — cheap enough to run on every keystroke in the
 *    "Génération personnalisée" panel.
 *
 *  - `estimateExact(model, cfg)`  a DRY RENDER: the real pdfkit pipeline runs
 *    with `bufferPages`, we read `bufferedPageRange().count` and the last-page
 *    fill, then discard the bytes. This is the ground truth the analytic estimate
 *    is validated against (the test pins |analytic − exact| ≤ 1 page).
 *
 * Both read their geometry from the same resolved `cfg`, so they drift apart
 * only when a template changes — never between code paths.
 */

import PDFDocument from 'pdfkit';
import { renderExamDocumentPdf, measureExamLayout } from './pdfRenderer.js';
import { blankStem } from './text.js';
import { TEMPLATE_LIMITS } from '../../../shared/schemas/examTemplate.schema.js';

// Vertical glue the engine leaves around every question: the split's spaceBefore,
// the section spacing and the minimum gap before the next "Question N". It is
// measured per question, which is why a pure text-height sum alone runs low.
const QUESTION_GAP = 12;

/**
 * A measure-only pdfkit face bundle. Creating a document costs ~1 ms and it is
 * NEVER finalized, so nothing is paginated or drawn: we only call the pure
 * `heightOfString`/`widthOfString` primitives, which is exactly what the layout
 * engine's `measure()` does internally.
 */
function createMeasurer(cfg) {
  const doc = new PDFDocument({
    size: cfg.page.size,
    layout: cfg.page.orientation,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  doc._readableState.flowing = true;
  doc.on('data', () => {}); // swallow the implicit first-page header bytes
  const fonts = cfg.theme.fonts;
  return {
    height(text, { name = 'regular', size = cfg.theme.sizes.body, width, lineGap = 0 } = {}) {
      doc.font(fonts[name] || fonts.regular || 'Times-Roman').fontSize(size);
      return doc.heightOfString(String(text || ''), { width: Math.max(20, width), lineGap });
    },
    end() {
      try {
        doc.end();
      } catch (_) {
        /* measuring doc never needs flushing */
      }
    },
  };
}

/** Height of one question's answer block, measured with real metrics. */
function blockHeight(measure, block, cfg, colW, isKey) {
  const S = cfg.theme.sizes;
  const D = cfg.theme.density;
  const q = cfg.question;
  const inline = !isKey && q.answerStyle === 'inline';
  const bodyLine = (t, width, lineGap = 1) => measure.height(t, { size: S.body, width, lineGap });
  switch (block.kind) {
    case 'options': {
      let h = 0;
      for (const o of block.options || []) {
        // marker + letter + text, indented 14pt, spaceAfter 2 (pdfRenderer options).
        h += bodyLine(`${o.letter}. ${o.text || '(image)'}`, colW - 14, 1) + 2;
      }
      return h * D;
    }
    case 'blanks': {
      // Numbered gap markers sit in the stem; the answer area is a "Réponses :"
      // label plus one numbered writing line per blank (mirrors pdfRenderer).
      // The confidential key prints none of that — just the instruction.
      if (isKey) return 0;
      if (inline && Array.isArray(block.bank) && block.bank.length) {
        // Inline: one instruction line + a wrapped numbered option bank. No
        // numbered writing lines (the student writes the option number in the gap).
        const bankLine = block.bank.map((w, i) => `${i + 1}. ${w}`).join('    ');
        let h = bodyLine("Complétez : dans chaque espace, écrivez le numéro de l'option qui convient.", colW, 1.5);
        h += bodyLine(`Options : ${bankLine}`, colW - 14, 1.5) + 4;
        return h * D;
      }
      const n = block.blanks || 1;
      let h = bodyLine('Réponses :', colW) + 3;
      h += n * (20 + 4);
      return h * D;
    }
    case 'sequence': {
      let h = 0;
      const pool = block.pool || [];
      if (inline) {
        // Inline: instruction + one `[ ]` box line per pool item; no numbered
        // writing lines (the box is the answer).
        h += bodyLine("Rangez : écrivez dans chaque case le numéro d'ordre correspondant (1 = premier).", colW, 1.5);
        for (const o of pool) h += bodyLine(`[ ] ${o.letter}. ${o.text || '(image)'}`, colW - 14, 1) + 2;
        return h * D;
      }
      h += bodyLine('Éléments à placer :', colW) + 2;
      for (const o of pool) h += bodyLine(`${o.letter}. ${o.text || '(image)'}`, colW - 14, 1.5) + 1;
      h += (block.slots || 1) * (20 + 4);
      return h * D;
    }
    case 'pairs': {
      const lefts = block.lefts || [];
      const rights = block.rights || [];
      const rows = Math.max(lefts.length, rights.length);
      if (inline) {
        // Inline: instruction + the two stacked lists (lefts then rights) + the
        // answer grid, always TWO ROWS x N columns (numbers, then the cells).
        let h = bodyLine('Associez : dans la grille, écrivez la lettre qui correspond à chaque numéro.', colW, 1.5);
        for (const l of lefts) h += bodyLine(`${l.n}. ${l.text}`, colW, 1) + 2;
        for (const r of rights) h += bodyLine(`${r.letter}. ${r.text}`, colW, 1) + 2;
        h += 46;
        return h * D;
      }
      // Classic: the table is now traced inside ONE column, so each cell wraps
      // against the column fractions (0.37 / 0.38 / 0.25 of colW), mirroring
      // pdfRenderer `#rowHeight`. This replaces the old full-width band model.
      const colA = colW * 0.37;
      const colB = colW * 0.38;
      let h = 18 + 0.5; // header row + first rule
      for (let i = 0; i < rows; i++) {
        const l = lefts[i];
        const r = rights[i];
        const lh = l ? measure.height(`${l.n}. ${l.text}`, { size: S.body, width: colA - 8, lineGap: 0 }) : 0;
        const rh = r ? measure.height(`${r.letter}. ${r.text}`, { size: S.body, width: colB - 8, lineGap: 0 }) : 0;
        h += Math.max(20, lh + 6, rh + 6) + 0.5;
      }
      return (h + 8) * D;
    }
    case 'code': {
      const codeLines = String(block.snippet || '').split('\n').length || 1;
      let h = codeLines * (S.small * 1.4 + 1.5) + 12;
      for (const o of block.options || []) h += bodyLine(`${o.letter}. ${o.text}`, colW - 14, 1.5) + 3;
      return h * D;
    }
    case 'free':
    default: {
      const lines = block.lines ?? q.answerLines ?? 2;
      return lines * 11 * D;
    }
  }
}

/** Height of one question item (head + stem + block + answer space), measured. */
function itemHeight(measure, item, cfg, colW, isKey) {
  const S = cfg.theme.sizes;
  const D = cfg.theme.density;
  const q = cfg.question;
  // Head group: the "Question N / pts" split line + the stem.
  let h = (measure.height('Question 0', { name: 'bold', size: S.body, width: colW * 0.6 }) + 2 + 2) * D;
  // Same stem the engine prints: `(n)` gap markers only exist on the sheet that
  // numbers its answer lines (see `blankStem`).
  const stemText = blankStem(item.block, { inline: !isKey && q.answerStyle === 'inline' });
  const stemStack = (measure.height(stemText, { size: S.body, width: colW, lineGap: 2.5 }) + 2) * D;
  h += stemStack;
  // The answer block. `blockHeight` already traces the matching table INSIDE one
  // column at the stacked widths: there is no right-float variant any more, so
  // the stem and the table simply add up.
  h += blockHeight(measure, item.block, cfg, colW, isKey);
  // Writing lines on the student sheet (mirrors the builder's writingLines()).
  if (!isKey) {
    const kind = item.block.kind;
    let lines = 0;
    if (kind === 'code') lines = item.block.lines || 0;
    else if (kind === 'free') lines = item.block.lines ?? q.answerLines ?? 2;
    h += lines * (0.6 + 2 + 9) * D; // dotted rule + spacing
  } else {
    h += 20 * D; // the answer + closing rule
  }
  return h + QUESTION_GAP;
}

/** Height of the page-1 masthead + identity + instructions band, measured. */
function headerHeight(measure, cfg) {
  const S = cfg.theme.sizes;
  const D = cfg.theme.density;
  const H = cfg.header;
  // The header LAYOUT moves the same elements around, so it costs vertical space
  // differently: `centre` stacks the band on the axis, `split` shares the title
  // row with the identity, `boxed`/`banner` add a frame or a bar, `minimal` is
  // the tightest. Mirrors the per-variant body of `#mastheadGeom`.
  const variant = H.variant === 'officiel' ? 'boxed' : H.variant || 'bandeau';
  let h = 0;
  h += H.bandMin + H.ruleGap + H.ruleT;
  h += measure.height('Titre du sujet', { name: 'headBold', size: S.title, width: cfg.contentW }) + H.titleGap;
  h += H.noteH; // identity plate / grade box row
  h += measure.height('Instructions de l’exam, consignes et barème éventuels.', { size: S.small, width: cfg.contentW, lineGap: 1.5 }) * 1.5;
  h += 24; // rules, spacing, info line
  if (variant === 'centre') h += H.bandMin * 0.9; // band lines no longer share a row
  else if (variant === 'split') h -= H.bandMin * 0.55; // identity sits BESIDE the title
  else if (variant === 'boxed') h += 22; // frame padding + inner rule
  else if (variant === 'banner') h += 16; // filled title bar padding
  else if (variant === 'minimal') h -= 14; // no rule, smaller title
  return Math.max(40, h * D);
}

/**
 * Instant analytic page count: measure every item, then pack greedily into
 * columns/pages the way the engine does. Returns `{ pages, range }` where the
 * range is a [floor, pages] bracket around packing uncertainty.
 * @param {object} model output of `ExamDocumentService#buildExamDocument`
 * @param {object} cfg resolved engine config (from `templates/index.js`)
 */
export function estimateAnalytic(model, cfg) {
  const isKey = model.meta.document === 'answer_key';
  const columns = cfg.page.columns;
  const colW = cfg.colW;
  const capacity = cfg.usableH;
  const measure = createMeasurer(cfg);
  try {
    const header = headerHeight(measure, cfg);

    const blocks = [];
    let normalArea = 0;
    let fullArea = 0;
    for (const section of model.sections) {
      if (section.title) {
        const sh = measure.height(section.title, { name: 'bold', size: cfg.theme.sizes.body, width: colW }) + 10;
        blocks.push({ h: sh, full: false });
        normalArea += sh;
      }
      for (const item of section.items) {
        const ih = itemHeight(measure, item, cfg, colW, isKey);
        // Matching-pair tables are traced inside a single column (they no longer
        // break out to a full-width band), and questions flow across columns
        // like the engine does — so every block just packs sequentially.
        blocks.push({ h: ih });
        normalArea += ih;
      }
    }

    // Engine-aware packing. A question whose body fits a column is a keep
    // unit: the engine's `ensure` moves the WHOLE group to the next column
    // when the remaining strip is too small, so the strip is wasted, not
    // back-filled. Only items taller than a column actually flow and split.
    // Mirroring that here keeps the analytic count from running optimistic.
    const runningReserve = cfg.header.fullOnFirstPage && cfg.header.compactOnFollow ? 24 : 0;
    const used = new Array(columns).fill(header);
    let pages = 1;
    let c = 0;
    const advance = () => {
      c += 1;
      if (c >= columns) {
        pages += 1;
        c = 0;
        used.fill(runningReserve);
      }
    };
    for (const { h } of blocks) {
      if (h <= capacity) {
        if (used[c] + h > capacity) advance();
        used[c] += h;
      } else {
        let rest = h;
        while (rest > 0) {
          const avail = capacity - used[c];
          if (rest <= avail) {
            used[c] += rest;
            break;
          }
          rest -= avail;
          advance();
        }
      }
    }

    const floor = Math.max(1, Math.ceil((header * columns + normalArea + fullArea) / (capacity * columns)));
    return {
      pages,
      range: [Math.min(floor, pages), pages],
      contentHeight: normalArea + fullArea,
      capacity,
      columns,
    };
  } finally {
    measure.end();
  }
}

/**
 * The heights the packer places with, as `{ headerH, runningH, sections }`.
 *
 * `measureExamLayout` asks the layout engine for the real numbers, so a
 * question is placed with exactly the height the sheet gives it. The analytic
 * model built for `estimateAnalytic` is only the fallback: it is a good guess,
 * and a good guess that runs a few points SHORT is what used to leave a hole —
 * the packer believes the question fits, the engine moves the whole block to
 * the next column, and the teacher gets an empty strip plus an extra sheet.
 *
 * Heights are always measured AS A STUDENT SHEET, which is what lets an answer
 * key carry the very same order as the subject it corrects.
 */
function packingPlan(model, cfg) {
  const columns = Math.max(1, cfg.page.columns);
  const capacity = cfg.usableH;
  const subjectView = { ...model, meta: { ...(model.meta || {}), document: 'student' } };
  try {
    const measured = measureExamLayout(subjectView, cfg);
    return {
      columns,
      capacity,
      headerH: measured.headerH,
      runningH: measured.runningH,
      sections: measured.sections,
    };
  } catch (err) {
    const measure = createMeasurer(cfg);
    try {
      const colW = cfg.colW;
      return {
        columns,
        capacity,
        headerH: headerHeight(measure, cfg),
        runningH: cfg.header.fullOnFirstPage && cfg.header.compactOnFollow ? 24 : 0,
        sections: (model.sections || []).map((section) => ({
          titleH: section.title
            ? measure.height(section.title, { name: 'bold', size: cfg.theme.sizes.body, width: colW }) + 10
            : 0,
          // No engine measure: assume the question never splits.
          items: (section.items || []).map((item) => {
            const totalH = itemHeight(measure, item, cfg, colW, false);
            return { bodyH: totalH, totalH };
          }),
        })),
      };
    } finally {
      measure.end();
    }
  }
}

/**
 * Column-first-fit packing plan: reorder the questions so the sheet fills every
 * column to the bottom before a page break, and number them in the order they
 * are placed.
 *
 * The engine flows strictly top-to-bottom, so a paper built straight from the
 * question bank leaves a hole whenever the next question is taller than the
 * strip still free at the bottom of the column — the teacher reads that as
 * wasted paper and an extra sheet. Here the same heights the engine paginates
 * with are packed differently: at every position the FIRST question of the
 * queue that still fits the strip is placed (a later, smaller one may therefore
 * jump ahead), and only when nothing fits is the column abandoned.
 *
 * The cursor mirrors the engine's own geometry, and that is what makes the holes
 * go away:
 *  - the masthead is a full-width band, so BOTH columns of page 1 start under it
 *    (starting the second column at the top of the page is what used to place a
 *    question the renderer then pushed away);
 *  - pages ≥ 2 lose only the running header, when the template stamps one;
 *  - a glued head+stem+surface group moves whole, while the writing lines under
 *    it flow on into the next column — so a question is never all-or-nothing.
 *
 * The result is written back into the model — order plus printed numbers — so
 * the PDF, the Word file and the HTML preview all render the identical paper
 * (they only ever draw the order they are given) and the estimate matches it.
 * Reordering stays INSIDE a section: a question never jumps out of its
 * « Exercice 2 · … » heading into another one.
 *
 * @param {object} model output of `ExamDocumentService#buildExamDocument`
 * @param {object} cfg resolved engine config
 * @returns {object} the same model, with `sections[].items` reordered and renumbered
 */
export function packExamModel(model, cfg) {
  const sections = model && model.sections;
  if (!Array.isArray(sections) || sections.length === 0) return model;
  const plan = packingPlan(model, cfg);
  const columns = plan.columns;
  const capacity = plan.capacity;
  // Never let a giant header starve the flow: at least this much of a column is
  // always up for sale, so the walk below cannot spin on an unusable page.
  const MIN_STRIP = 60;
  const topOf = (page) => Math.min(page === 1 ? plan.headerH : plan.runningH, capacity - MIN_STRIP);
  let page = 1;
  let col = 0;
  let used = topOf(1);
  const advance = () => {
    col += 1;
    if (col >= columns) {
      col = 0;
      page += 1;
    }
    used = topOf(page);
  };
  /** Put `h` points into the flow. An `atomic` block moves whole to the next column. */
  const place = (h, atomic) => {
    if (h <= 0) return;
    if (atomic) {
      if (used + h > capacity) advance();
      used += h;
      return;
    }
    let rest = h;
    while (rest > 0) {
      const avail = capacity - used;
      if (rest <= avail) {
        used += rest;
        return;
      }
      rest -= avail;
      used = capacity;
      advance();
    }
  };

  let number = 0;
  const flat = [];
  plan.sections.forEach((planSection, index) => {
    const section = sections[index];
    const items = section && Array.isArray(section.items) ? section.items : [];
    if (!items.length) return;
    const titleH = planSection.titleH || 0;
    if (titleH > 0) {
      if (used + titleH > capacity) advance();
      used += titleH;
    }
    const queue = items.map((item, i) => ({
      item,
      bodyH: planSection.items[i]?.bodyH ?? 0,
      totalH: planSection.items[i]?.totalH ?? 0,
    }));
    const placed = [];
    while (queue.length) {
      // The first question that fits the strip whole; failing that, the first
      // whose glued body fits (its writing lines then flow on); failing that,
      // one taller than a whole column, which the engine splits anyway.
      let idx = queue.findIndex((q) => used + q.totalH <= capacity);
      let whole = idx >= 0;
      if (idx < 0) idx = queue.findIndex((q) => used + q.bodyH <= capacity);
      if (idx < 0) idx = queue.findIndex((q) => q.bodyH > capacity - topOf(page));
      if (idx < 0) {
        advance();
        continue;
      }
      const [q] = queue.splice(idx, 1);
      number += 1;
      q.item.number = number;
      placed.push(q.item);
      flat.push(q.item);
      if (whole) {
        place(q.totalH, true);
      } else {
        place(q.bodyH, q.bodyH <= capacity - topOf(page));
        place(q.totalH - q.bodyH, false);
      }
    }
    section.items = placed;
  });
  if (model.scoring && Array.isArray(model.scoring.normalizedPreview)) {
    // The normalisation table is indexed by question, so its printed numbers
    // have to follow the new placement order.
    const byId = new Map(model.scoring.normalizedPreview.map((e) => [String(e.questionId), e]));
    const next = flat
      .map((item) => {
        const entry = byId.get(String(item.questionId));
        return entry ? { ...entry, number: item.number } : null;
      })
      .filter(Boolean);
    if (next.length) model.scoring.normalizedPreview = next;
  }
  return model;
}

/**
 * Ground-truth page count via a dry pdfkit render. The buffer is produced then
 * dropped; we only read `.pages` and `.lastPageFill`.
 * @param {object} model
 * @param {object} cfg resolved engine config
 * @param {object} [options] forwarded to the renderer (uploadsDir, fontTtf…)
 */
export async function estimateExact(model, cfg, options = {}) {
  const rendered = await renderExamDocumentPdf(model, { ...options, template: cfg });
  return {
    pages: rendered.pages,
    lastPageFill: Number((rendered.lastPageFill ?? 0).toFixed?.(3) ?? 0),
    warnings: rendered.warnings,
  };
}

/** Convenience: run both and report the divergence (estimate route + gap test). */
export async function estimatePages(model, cfg, options = {}) {
  const analytic = estimateAnalytic(model, cfg);
  const exact = await estimateExact(model, cfg, options);
  return {
    analytic: analytic.pages,
    range: analytic.range,
    exact: exact.pages,
    lastPageFill: exact.lastPageFill,
    delta: Math.abs(analytic.pages - exact.pages),
  };
}

/** Mutable working copy of a resolved engine config (density / sizes / lines). */
function cloneCfg(cfg) {
  const c = structuredClone({ ...cfg, header: cfg.header, theme: cfg.theme, question: cfg.question });
  c.theme = structuredClone(cfg.theme);
  c.question = structuredClone(cfg.question);
  return c;
}

/**
 * "Tenir en N pages": tune ONLY the safe levers, in the order the teacher set
 * (answer space → density → font, never below the 9 pt floor), re-running the
 * exact dry render after each step, until the paper fits `targetPages` or no
 * lever is left. Margins and page columns are never touched here.
 * @param {object} model
 * @param {object} cfg base resolved engine config
 * @param {number} targetPages desired maximum page count
 * @param {object} [options] renderer options (uploadsDir, fontTtf…)
 * @returns {Promise<{ fits: boolean, pages: number, template: object, levers: string[] }>}
 */
export async function fitToPages(model, cfg, targetPages, options = {}) {
  const work = cloneCfg(cfg);
  let pages = (await estimateExact(model, work, options)).pages;
  const levers = [];
  const { minFont, minDensity, maxAnswerLines } = TEMPLATE_LIMITS;
  const base = { answerLines: cfg.question.answerLines, density: cfg.theme.density, body: cfg.theme.sizes.body, small: cfg.theme.sizes.small, tiny: cfg.theme.sizes.tiny };

  let steps = 0;
  while (pages > targetPages && steps < 60) {
    steps += 1;
    // 1. Shrink the free-response space first — it is pure whitespace.
    if (work.question.answerLines > 0) {
      work.question.answerLines -= 1;
      if (!levers.includes('answerLines')) levers.push('answerLines');
    }
    // 2. Then tighten the vertical density.
    else if (work.theme.density > minDensity + 1e-6) {
      work.theme.density = Math.max(minDensity, +(work.theme.density - 0.05).toFixed(3));
      if (!levers.includes('density')) levers.push('density');
    }
    // 3. Finally step the fonts down, never past the 9 pt floor.
    else if (work.theme.sizes.body > minFont) {
      work.theme.sizes.body = Math.max(minFont, +(work.theme.sizes.body - 0.5).toFixed(2));
      work.theme.sizes.small = Math.max(minFont, +(work.theme.sizes.small - 0.5).toFixed(2));
      work.theme.sizes.tiny = Math.max(minFont, +(work.theme.sizes.tiny - 0.5).toFixed(2));
      if (!levers.includes('font')) levers.push('font');
    } else {
      break; // every lever is exhausted
    }
    pages = (await estimateExact(model, work, options)).pages;
  }

  // Express the adjustments as a template-shaped override the client can persist.
  const template = {};
  if (base.answerLines !== work.question.answerLines) {
    template.question = { answerSpace: { lines: work.question.answerLines, lineHeight: work.question.answerLineHeight } };
  }
  template.theme = {};
  if (base.density !== work.theme.density) template.theme.density = work.theme.density;
  if (base.body !== work.theme.sizes.body) {
    template.theme.sizes = { body: work.theme.sizes.body, small: work.theme.sizes.small, tiny: work.theme.sizes.tiny };
  }
  if (!Object.keys(template.theme).length) delete template.theme;

  return { fits: pages <= targetPages, pages, template, levers };
}
