/**
 * src/backend/services/exam-doc/pdfRenderer.js
 *
 * Real A4 PDF (pdfkit — no Chromium, no native addon) built from the SAME
 * normalized model the HTML preview and the DOCX consume.
 *
 * Since the template refactor this file is only the CONTENT→OP-TREE layer and
 * the orchestration: it turns the document model into measured layout ops and
 * hands them to the layout engine (`layoutEngine.js`). Every geometry it used to
 * hardcode (margins, content width, note box, footer, masthead typography) is
 * now read from a frozen ENGINE CONFIG resolved by the template registry, so a
 * different template produces a different sheet without touching this code.
 * `renderExamDocumentPdf(model, { template })` keeps its public API; without a
 * template it resolves the built-in Classique config, which reproduces the
 * historical constants exactly (byte-identical output, tests unchanged).
 *
 * Standard fonts are WinAnsi-encoded: all French accents are native, any
 * character outside that set is transliterated AND reported, never silently
 * mangled. `EXAM_DOC_FONT_TTF` embeds a real Unicode font when supplied.
 */

import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { config } from '../../config.js';
import { formatPoints, toWinAnsi, resolveImage, numberBlankGaps } from './text.js';
import { examHeaderParts, examIdentityParts, examInstructions } from './headerLayout.js';
import { opHelpers, PdfLayout } from './layoutEngine.js';
import { resolveForRenderer } from './templates/index.js';

// Historical Classique page geometry, kept exported for callers/tests that read
// it. The renderer itself now takes these from the resolved template config.
export const PDF_PAGE = Object.freeze({ width: 595.28, height: 841.89 });
export const PDF_MARGIN = 42;

class PdfBuilder {
  constructor(doc, ctx, cfg) {
    this.doc = doc;
    this.ctx = ctx;
    this.cfg = cfg;
    this.ops = opHelpers(cfg);
    this.S = cfg.theme.sizes;
    this.D = cfg.theme.density;
    this.CONTENT_W = cfg.contentW;
    this.MARKER = cfg.marker;
  }

  txt(value, opts = {}) {
    return {
      t: 'text',
      value: this.ctx.encode(value),
      face: opts.face || 'regular',
      size: opts.size ?? this.S.body,
      align: opts.align || 'left',
      indent: opts.indent ?? 0,
      width: this.CONTENT_W - (opts.indent ?? 0) - (opts.rightPad ?? 0),
      lineGap: opts.lineGap ?? 2.5,
      spaceBefore: (opts.spaceBefore ?? 0) * this.D,
      spaceAfter: (opts.spaceAfter ?? 4) * this.D,
      span: opts.span,
    };
  }

  picture(ref, { maxW, maxH }) {
    const src = String(ref || '').trim();
    if (!src) return null;
    const resolved = resolveImage(src, { uploadsDir: this.ctx.uploadsDir });
    if (!resolved) {
      this.ctx.warn({
        type: 'image-skipped',
        message: `Image non intégrée (format non pris en charge ou fichier absent) : ${src.slice(0, 90)}`,
      });
      return null;
    }
    try {
      const opened = this.doc.openImage(resolved.buffer);
      const k = Math.min(maxW / opened.width, maxH / opened.height, 1);
      return { buffer: resolved.buffer, width: opened.width * k, height: opened.height * k };
    } catch (_) {
      this.ctx.warn({ type: 'image-skipped', message: `Image illisible : ${src.slice(0, 90)}` });
      return null;
    }
  }

  /**
   * The masthead: logo (or a fallback disc), the institutional block, the title
   * and the run-through information line. Absolute-free: it is one measured op
   * that the layout engine moves as a unit. WHICH lines are printed, in which
   * order and with which wording comes from `headerLayout`, the same source the
   * Word and the preview renderers read — the three sheets cannot drift apart.
   */
  headerNode(model) {
    const cfg = this.cfg;
    const parts = examHeaderParts(model);
    const isKey = model.meta.document === 'answer_key';
    const enc = (value) => this.ctx.encode(String(value ?? ''));
    const mastheadLine = cfg.header.mastheadLine;
    const stack = (lines) =>
      lines
        .filter((line) => line.text !== '')
        .map((line) => ({ text: enc(line.text), ...mastheadLine[line.role] }));

    const ops = [];
    if (parts.enabled) {
      const logo = this.picture(parts.logo, {
        maxW: cfg.header.logoMaxW,
        maxH: cfg.header.logoMaxH * parts.logoScale,
      });
      ops.push({
        t: 'masthead',
        variant: cfg.header.variant,
        logo,
        initials: parts.initials,
        left: stack(parts.left),
        right: stack(parts.right),
        title: enc(parts.title),
        tag: enc(parts.tag),
        subtitle: enc(parts.info.join('     ·     ')),
        spaceBefore: 0,
        spaceAfter: 9,
      });
      // A compact descriptor for the running header stamped on pages ≥ 2.
      this.headerRun = { title: enc(parts.title), tag: enc(parts.tag) };
    }
    const identity = this.identityNode(model);
    if (identity) ops.push(identity);
    const instructions = examInstructions(model);
    if (instructions) ops.push(this.txt(instructions, { size: this.S.small, spaceAfter: 6 }));
    // The barème is printed on the confidential key only: on the student paper
    // the grade box is meant to stay empty.
    if (isKey) ops.push(this.txt(`Note : ${model.scoring.label}`, { face: 'bold', align: 'center', spaceAfter: 3 }));
    ops.push(this.ops.rule({ thickness: 1.4, spaceAfter: 8 }));
    return this.ops.group(ops, { label: 'header', span: true });
  }

  /**
   * Identity fields + grade box, one block: the fields are drawn as real dotted
   * rules on a light plate, and the grade gets a dedicated ~4.4 × 2 cm box. With
   * the `officiel` anonymity the plate is replaced by a candidate-number box.
   */
  identityNode(model) {
    const { rows, showNote } = examIdentityParts(model);
    if (!rows.length && !showNote) return null;
    return { t: 'identity', rows, showNote, anonymity: this.cfg.header.anonymity, spaceBefore: 2, spaceAfter: 9 };
  }

  blockOps(item, isKey = false) {
    const cfg = this.cfg;
    const block = item.block;
    const SMALL = this.S.small;
    const BODY = this.S.body;
    const CONTENT_W = this.CONTENT_W;
    // The width the pairs table is traced at. In one column this equals the
    // full content width (so the Classique sheet is byte-identical); in two
    // columns it is a SINGLE column, so a matching table stays inside one
    // column instead of breaking out to a full-width band that wastes the rest
    // of the page and forces an early page break.
    const TW = this.cfg.colW;
    const { image, cells } = this.ops;
    const ops = [];
    const inline = this.cfg.question.answerStyle === 'inline';
    // In the inline style the three interactive types carry their own tailored
    // instruction, so the generic one is suppressed for them.
    const inlineTailored = inline && (block.kind === 'pairs' || block.kind === 'sequence'
      || (block.kind === 'blanks' && Array.isArray(block.bank) && block.bank.length));
    if (block.instruction && !inlineTailored) {
      ops.push(this.txt(block.instruction, { size: SMALL, face: 'italic', spaceAfter: 2 }));
    }

    switch (block.kind) {
      case 'options': {
        const marker = cfg.marker[block.marker] || cfg.marker.checkbox;
        for (const option of block.options) {
          ops.push(
            this.txt(`${marker} ${option.letter}. ${option.text || '(image)'}`, {
              indent: 14,
              spaceAfter: 2,
              lineGap: 1,
            }),
          );
          const pic = this.picture(option.image, { maxW: 120, maxH: 62 });
          if (pic) ops.push(image(pic, { maxW: 120, indent: 24, spaceBefore: 0, spaceAfter: 5 }));
        }
        break;
      }
      case 'blanks': {
        // On the paper the gap is only a numbered marker in the sentence; the
        // student writes the answer on the matching numbered line of this
        // "Réponses" block instead of on the blank itself. The confidential key
        // leaves the writing out — its answers are already listed, numbered.
        if (isKey) break;
        if (inline && Array.isArray(block.bank) && block.bank.length) {
          // Inline: a numbered option bank; the student writes the option number
          // directly in each `(n)` gap of the sentence (no separate answer lines).
          ops.push(this.txt("Complétez : dans chaque espace, écrivez le numéro de l'option qui convient.", { size: SMALL, face: 'italic', spaceAfter: 3 }));
          ops.push(this.txt('Options :', { size: SMALL, face: 'bold', spaceBefore: 1, spaceAfter: 2 }));
          const bankLine = block.bank.map((w, i) => `(${i + 1})\u00a0${w}`).join('\u00a0\u00a0\u00a0');
          ops.push(this.txt(bankLine, { size: SMALL, indent: 14, spaceAfter: 4, lineGap: 1.5 }));
          break;
        }
        for (let i = 1; i <= (block.blanks || 1); i++) {
          if (i === 1) ops.push(this.txt('Réponses :', { size: SMALL, face: 'bold', spaceBefore: 1, spaceAfter: 3 }));
          ops.push(
            cells(
              [
                { text: this.ctx.encode(`${i}.`), width: 20, height: 20, border: 'none', size: BODY },
                { text: '', width: 210, height: 20, border: 'bottom' },
              ],
              { spaceBefore: 1, spaceAfter: 3 },
            ),
          );
        }
        break;
      }
      case 'sequence': {
        // Inline: every option carries a box to write the rank; no numbered
        // writing lines underneath (the answer is the number in the box).
        if (inline) {
          ops.push(this.txt("Rangez : écrivez dans chaque case le numéro d'ordre correspondant (1 = premier).", { size: SMALL, face: 'italic', spaceAfter: 2 }));
          for (const option of block.pool) {
            ops.push(this.txt(`[    ]\u00a0\u00a0${option.letter}. ${option.text || '(image)'}`, { indent: 14, spaceAfter: option.image ? 3 : 2, lineGap: 1.5 }));
            const pic = this.picture(option.image, { maxW: 100, maxH: 55 });
            if (pic) ops.push(image(pic, { maxW: 100, indent: 28, spaceBefore: 0, spaceAfter: 4 }));
          }
          break;
        }
        // One element per line: glued into a single paragraph, "A. … B. … C. …"
        // is unreadable and the student cannot tell where an item stops.
        if (block.pool.length) {
          ops.push(this.txt('Éléments à placer :', { size: SMALL, spaceAfter: 2 }));
          for (const option of block.pool) {
            ops.push(
              this.txt(`${option.letter}. ${option.text || '(image)'}`, {
                indent: 14,
                size: SMALL,
                spaceAfter: option.image ? 2 : 1,
                lineGap: 1.5,
              }),
            );
          }
        }
        for (const option of block.pool) {
          const pic = this.picture(option.image, { maxW: 100, maxH: 55 });
          if (pic) ops.push(image(pic, { maxW: 100, spaceBefore: 0, spaceAfter: 4 }));
        }
        for (let i = 1; i <= (block.slots || 1); i++) {
          ops.push(
            cells(
              [
                { text: this.ctx.encode(`${i}.`), width: 20, height: 20, border: 'none', size: BODY },
                { text: '', width: 210, height: 20, border: 'bottom' },
              ],
              { spaceBefore: 1, spaceAfter: 3 },
            ),
          );
        }
        break;
      }
      case 'pairs': {
        // Inline: the two lists are printed one after the other (no table, no
        // headers), then a small answer grid records the pairs. The grid is
        // horizontal (numbers across the top) when every column clears ~34pt, so
        // few items read compactly; otherwise a vertical N°/Lettre table for
        // long or numerous items.
        if (inline) {
          ops.push(this.txt('Associez : dans la grille, écrivez la lettre qui correspond à chaque numéro.', { size: SMALL, face: 'italic', spaceAfter: 4 }));
          for (const left of block.lefts) ops.push(this.txt(`${left.n}. ${left.text}`, { size: SMALL, spaceAfter: 1, lineGap: 1 }));
          for (const right of (block.rights || [])) ops.push(this.txt(`${right.letter}. ${right.text}`, { size: SMALL, spaceAfter: 1, lineGap: 1 }));
          const count = Math.max(block.lefts.length, (block.rights || []).length);
          const hd = (t, w, align) => ({ text: this.ctx.encode(t), width: w, height: 16, border: 'box', face: 'bold', size: SMALL, align });
          const cellv = (t, w, align) => ({ text: this.ctx.encode(t), width: w, height: 22, border: 'box', size: SMALL, align });
          const rows = [];
          if (count > 0 && TW / count >= 34) {
            for (let i = 0; i < count; i++) rows.push(hd(`${i + 1}`, TW / count, 'center'));
            for (let i = 0; i < count; i++) rows.push(cellv('', TW / count, 'center'));
          } else {
            const numW = 44;
            const ansW = TW - numW;
            rows.push(hd('N°', numW, 'center'), hd('Lettre', ansW, 'center'));
            for (let i = 0; i < count; i++) rows.push(cellv(`${i + 1}`, numW, 'center'), cellv('', ansW, 'center'));
          }
          ops.push(cells(rows, { spaceBefore: 6, spaceAfter: 6 }));
          break;
        }
        // Two content columns plus a narrow answer column, traced INSIDE a single
        // layout column (TW): without a place to write the letter the table asks
        // for a connection the student has nowhere to note down. Heights leave
        // room for a hand-drawn link or a letter.
        const colA = TW * 0.37;
        const colB = TW * 0.38;
        const colR = TW * 0.25;
        const head = (label, width, align) => ({
          text: this.ctx.encode(label),
          width,
          height: 18,
          border: 'box',
          face: 'bold',
          size: SMALL,
          align,
        });
        const rows = [head('Colonne A', colA), head('Colonne B', colB), head('Réponse', colR, 'center')];
        const n = Math.max(block.lefts.length, (block.rights || []).length);
        const cell = (text, width, opts = {}) => ({
          text: this.ctx.encode(text),
          width,
          height: 20,
          border: 'box',
          size: BODY,
          ...opts,
        });
        for (let i = 0; i < n; i++) {
          const left = block.lefts[i];
          const right = block.rights[i];
          rows.push(cell(left ? `${left.n}. ${left.text}` : '', colA));
          rows.push(cell(right ? `${right.letter}. ${right.text}` : '', colB));
          // The answer cell stays empty on purpose: it is where the student
          // writes the letter, and the row already lines up with column A.
          rows.push(cell('', colR));
        }
        ops.push(cells(rows, { spaceAfter: 6 }));
        break;
      }
      case 'code':
        if (block.snippet) {
          ops.push({
            t: 'code',
            value: this.ctx.encode(block.snippet),
            face: 'mono',
            size: SMALL,
            indent: 0,
            width: CONTENT_W,
            lineGap: 1.5,
            spaceBefore: 3,
            spaceAfter: 6,
          });
        }
        for (const option of block.options || []) {
          ops.push(this.txt(`${this.MARKER.radio} ${option.letter}. ${option.text}`, { indent: 14, spaceAfter: 3, lineGap: 1.5 }));
        }
        break;
      default:
        break;
    }
    return ops;
  }

  writingLines(item) {
    const block = item.block;
    switch (block.kind) {
      case 'options':
      case 'blanks':
      case 'sequence':
      case 'pairs':
        return 0;
      case 'code':
        return block.lines || 0;
      default:
        return block.lines || this.cfg.question.answerLines;
    }
  }

  answerKeyOps(item) {
    const SMALL = this.S.small;
    const { rule } = this.ops;
    const parts = [this.txt('Réponse', { face: 'bold', size: SMALL, spaceBefore: 5, spaceAfter: 2 })];
    const entries = item.answer?.entries || [];
    if (entries.length) {
      for (const entry of entries) {
        parts.push(this.txt(entry, { indent: 14, spaceAfter: 2, lineGap: 1.5 }));
      }
    } else {
      parts.push(this.txt("À compléter par l’enseignant", { indent: 14, size: SMALL, face: 'italic', spaceAfter: 2 }));
    }
    for (const fb of item.feedback || []) {
      parts.push(this.txt(`${fb.label} : ${fb.text}`, { size: SMALL, spaceBefore: 2, spaceAfter: 2 }));
    }
    if (item.answer?.missing) {
      parts.push(this.txt('Réponse manquante — à vérifier avant distribution.', { size: SMALL, face: 'italic', spaceAfter: 2 }));
    }
    // `separators: 'none'` (e.g. Moderne) drops the thin rule closing the answer.
    if (this.cfg.question.separators !== 'none') {
      parts.push(rule({ thickness: 0.5, spaceBefore: 5, spaceAfter: 8 }));
    }
    return parts;
  }

  questionNode(item, model) {
    const cfg = this.cfg;
    const isKey = model.meta.document === 'answer_key';
    const CONTENT_W = this.CONTENT_W;
    const { image, rule, group } = this.ops;
    // The title, the stem and any illustration are a keep-unit: even when a
    // question is too tall to fit on one sheet and has to flow, these must not
    // be torn apart — an orphaned "Question 7" at the foot of a page with its
    // text on the next sheet is unreadable.
    const head = [];
    const showPoints = cfg.question.pointBadge !== false;
    head.push({
      t: 'split',
      left: this.ctx.encode(`Question ${item.number}`),
      right: showPoints
        ? this.ctx.encode(`${formatPoints(item.points)} pt${Number(item.points) === 1 ? '' : 's'}`)
        : '',
      face: 'bold',
      size: cfg.theme.sizes.body,
      spaceBefore: 2,
      spaceAfter: 2,
    });
    head.push(this.txt(item.block.kind === 'blanks' ? numberBlankGaps(item.block.text).text || '(énoncé vide)' : item.block.text || '(énoncé vide)', { spaceAfter: 2 }));

    const media = this.picture(item.block.media, { maxW: CONTENT_W * 0.7, maxH: 190 });
    if (media) head.push(image(media, { maxW: CONTENT_W * 0.7, spaceAfter: 5 }));

    const ops = [group(head, { keep: true, label: `question ${item.number} head` })];
    ops.push(...this.blockOps(item, isKey));

    if (!isKey) {
      const lines = this.writingLines(item);
      for (let i = 0; i < lines; i++) {
        ops.push(
          rule({
            style: 'dotted',
            thickness: 0.6,
            spaceBefore: 2,
            spaceAfter: i === lines - 1 ? 6 : 10,
          }),
        );
      }
    } else {
      ops.push(group(this.answerKeyOps(item), { label: 'key' }));
    }
    return group(ops, { label: `question ${item.number}` });
  }

  sectionNode(section, model) {
    const { group } = this.ops;
    const ops = [];
    if (section.title) {
      ops.push(
        this.txt(`${section.title}   (${formatPoints(section.subtotal)} pts)`, {
          face: 'bold',
          spaceBefore: 6,
          spaceAfter: 4,
        }),
      );
    }
    for (const item of section.items) ops.push(this.questionNode(item, model));
    return group(ops, { keep: false, label: 'section' });
  }

  warningsNode(model) {
    if (model.meta.document !== 'answer_key' || !model.warnings.length) return null;
    const SMALL = this.S.small;
    const { group } = this.ops;
    const ops = [this.txt('Points à revoir', { face: 'bold', size: SMALL, spaceBefore: 8, spaceAfter: 2 })];
    for (const w of model.warnings) {
      ops.push(this.txt(`- ${w.message || w.type}`, { size: SMALL, indent: 10, spaceAfter: 1, lineGap: 1 }));
    }
    return group(ops, { label: 'warnings' });
  }

  footerNode(model) {
    // Only the normalization disclosure is printed at the bottom; the barème
    // total and the "Fin du sujet" closing were removed at the teacher's request.
    const { rule, group } = this.ops;
    const ops = [];
    if (model.header.scaleNote) {
      ops.push(rule({ thickness: 0.5, spaceBefore: 6, spaceAfter: 4 }));
      ops.push(this.txt(model.header.scaleNote, { size: this.S.tiny, face: 'italic', align: 'center', spaceAfter: 4 }));
    }
    return ops.length ? group(ops, { label: 'footer' }) : null;
  }

  build(model) {
    // The identity fields belong to the header keep-group: splitting them off
    // would let a page break land between the title block and the name box.
    const nodes = [this.headerNode(model)];
    for (const section of model.sections) nodes.push(this.sectionNode(section, model));
    const warnings = this.warningsNode(model);
    if (warnings) nodes.push(warnings);
    const footer = this.footerNode(model);
    if (footer) nodes.push(footer);
    return nodes;
  }
}

function resolveFaces(doc, ctx, cfg) {
  const ttf = ctx.fontTtf;
  if (ttf && existsSync(ttf)) {
    try {
      doc.registerFont('ed-custom', ttf);
      // `registerFont` only stores the path: fontkit reads and parses the file
      // on first use. Probing it here keeps a broken EXAM_DOC_FONT_TTF inside
      // this try/catch — otherwise the export dies in the middle of the layout
      // instead of falling back to the standard faces.
      doc.font('ed-custom');
      // One face supplied → one face used. Weight differences are honest: no
      // synthetic bolding, so nothing looks bolder than the file really is.
      return {
        regular: 'ed-custom',
        bold: 'ed-custom',
        italic: 'ed-custom',
        mono: 'ed-custom',
        head: 'ed-custom',
        headBold: 'ed-custom',
      };
    } catch (_) {
      ctx.warn({
        type: 'font-fallback',
        message: `Police EXAM_DOC_FONT_TTF illisible (${ttf}) : polices standard utilisées.`,
      });
    }
  }
  // No embedded font: use the typefaces the template's theme asks for, mapped to
  // pdfkit's 14 standard faces (WinAnsi). The Classique theme selects Times for
  // the body and Helvetica for the masthead, so header and body still read as
  // two registers without an embedded TTF.
  const f = cfg.theme.fonts;
  return {
    regular: f.regular,
    bold: f.bold,
    italic: f.italic,
    mono: f.mono,
    head: f.head,
    headBold: f.headBold,
  };
}

/**
 * @param {object} model output of `ExamDocumentService#buildExamDocument`
 * @param {object} [options] { uploadsDir, fontTtf, template, templateOverrides }
 * @returns {Promise<{ buffer: Buffer, warnings: object[], pages: number }>}
 */
export async function renderExamDocumentPdf(model, options = {}) {
  const cfg = resolveForRenderer(options);
  const warnings = [];
  const seen = new Set();
  const substituted = new Set();
  const ctx = {
    uploadsDir: options.uploadsDir || config.uploadsDir,
    fontTtf: options.fontTtf ?? config.examDocFontTtf ?? null,
    encode(value) {
      return value; // replaced below once the doc (and its font mode) exists
    },
    warn(entry) {
      const key = `${entry.type}:${entry.message || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      warnings.push(entry);
    },
  };

  const doc = new PDFDocument({
    size: cfg.page.size,
    layout: cfg.page.orientation,
    margins: {
      top: cfg.margin.top,
      right: cfg.margin.right,
      bottom: cfg.margin.bottom + cfg.footerH,
      left: cfg.margin.left,
    },
    bufferPages: true,
    info: {
      Title: `${model.meta.document === 'answer_key' ? 'Corrigé' : 'Sujet'} — ${model.meta.examName}`,
      Author: model.header.teacherName || 'Quiz App',
      Subject: model.header.subject || model.meta.examName,
      Keywords: model.header.academicYear || '',
      Creator: 'Quiz App — exam document generator',
    },
  });

  const faces = resolveFaces(doc, ctx, cfg);
  if (faces.regular === 'ed-custom') {
    // Embedded Unicode font: the original characters are kept untouched.
    ctx.encode = (value) => String(value ?? '');
  } else {
    ctx.encode = (value) => {
      const { text: out, substitutions } = toWinAnsi(value);
      for (const ch of substitutions) substituted.add(ch);
      return out;
    };
  }

  const builder = new PdfBuilder(doc, ctx, cfg);
  const nodes = builder.build(model);
  const layout = new PdfLayout(doc, faces, cfg);
  layout.render(nodes);
  const pages = doc.bufferedPageRange().count;
  const lastPageFill = layout.lastPageFill();
  layout.stampRunningHeaders(builder.headerRun);
  layout.stampFooters(model, pages);
  doc.flushPages();

  if (substituted.size) {
    ctx.warn({
      type: 'unicode-substitution',
      message:
        `Certains caractères ne sont pas disponibles dans l’encodage PDF standard et ont été remplacés : ${[...substituted].join(' ')}. ` +
        'Exportez en Word ou fournissez EXAM_DOC_FONT_TTF pour les conserver.',
    });
  }

  const buffer = await new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });

  return { buffer, warnings, pages, lastPageFill };
}
