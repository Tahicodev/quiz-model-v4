/**
 * src/backend/services/exam-doc/pdfRenderer.js
 *
 * Real A4 PDF (pdfkit — no Chromium, no native addon) built from the SAME
 * normalized model the HTML preview and the DOCX consume.
 *
 * Layout rules that matter for a printable exam:
 *  - A4 portrait 595.28×841.89pt, 42pt margins.
 *  - Each question is measured before it is drawn (`heightOfString`), so a
 *    question heading is never separated from its content by a page break.
 *  - Standard fonts are WinAnsi-encoded: all French accents are native, any
 *    character outside that set is transliterated AND reported, never silently
 *    mangled. `EXAM_DOC_FONT_TTF` embeds a real Unicode font when supplied.
 *  - "Page i / n" is stamped afterwards through `bufferedPageRange()`.
 *  - Black ink only — no colour-coded answers, so a grayscale photocopy stays
 *    readable and the answer key carries no visual "cheat" cue.
 */

import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { config } from '../../config.js';
import { EXAM_DOC_TARGET_SCORE } from '../../../shared/schemas/examDocument.schema.js';
import { formatPoints, toWinAnsi, resolveImage } from './text.js';

export const PDF_PAGE = Object.freeze({ width: 595.28, height: 841.89 });
export const PDF_MARGIN = 42;
const FOOTER_H = 26;
const CONTENT_W = PDF_PAGE.width - PDF_MARGIN * 2;
const USABLE_H = PDF_PAGE.height - PDF_MARGIN * 2 - FOOTER_H;

const BODY = 12;
const SMALL = 10;
const TINY = 9;

// pdfkit's standard fonts have no box/circle glyphs: the answer markers are
// printed in their ASCII spelling, which is what teachers expect on paper.
const MARKER = { radio: '( )', checkbox: '[ ]' };
const CODE_PAD = 6;

// ─── Op constructors (declarative layout tree) ───────────────────────────────
const space = (h) => ({ t: 'space', h });
const rule = (opts = {}) => ({
  t: 'rule',
  style: opts.style || 'solid',
  width: opts.width ?? CONTENT_W,
  thickness: opts.thickness ?? 0.8,
  spaceBefore: opts.spaceBefore ?? 3,
  spaceAfter: opts.spaceAfter ?? 6,
});
const image = (pic, opts = {}) => ({
  t: 'image',
  pic,
  maxW: opts.maxW ?? CONTENT_W,
  align: opts.align || 'left',
  indent: opts.indent ?? 0,
  spaceBefore: opts.spaceBefore ?? 4,
  spaceAfter: opts.spaceAfter ?? 6,
});
const cells = (rowList, opts = {}) => ({
  t: 'cells',
  rows: rowList,
  spaceBefore: opts.spaceBefore ?? 4,
  spaceAfter: opts.spaceAfter ?? 8,
});
const group = (ops, opts = {}) => ({ t: 'group', keep: opts.keep !== false, label: opts.label || '', ops });

class PdfBuilder {
  constructor(doc, ctx) {
    this.doc = doc;
    this.ctx = ctx;
  }

  txt(value, opts = {}) {
    return {
      t: 'text',
      value: this.ctx.encode(value),
      face: opts.face || 'regular',
      size: opts.size ?? BODY,
      align: opts.align || 'left',
      indent: opts.indent ?? 0,
      width: CONTENT_W - (opts.indent ?? 0) - (opts.rightPad ?? 0),
      lineGap: opts.lineGap ?? 2.5,
      spaceBefore: opts.spaceBefore ?? 0,
      spaceAfter: opts.spaceAfter ?? 4,
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

  headerNode(model) {
    const { header } = model;
    const ops = [];
    const push = (value, opts) => {
      if (value === null || value === undefined || String(value).trim() === '') return;
      ops.push(this.txt(String(value), opts));
    };

    push(header.ministry, { size: SMALL, align: 'center', spaceAfter: 1 });
    push(header.academy, { size: SMALL, align: 'center', spaceAfter: 5 });

    const scale = Number(header.logoScale) || 1;
    const logo = this.picture(header.logoDataUrl || header.logoUrl, { maxW: 170, maxH: 50 * scale });
    if (logo) ops.push(image(logo, { maxW: 170, align: 'center', spaceAfter: 5 }));

    push(header.schoolName, { face: 'bold', size: 13, align: 'center', spaceAfter: 1 });
    push(header.academicYear, { size: SMALL, align: 'center', spaceAfter: 7 });
    push(header.title || 'Examen', { face: 'bold', size: 15, align: 'center', spaceAfter: 5 });

    const meta = [
      ['Matière', header.subject],
      ['Enseignant', header.teacherName],
      ['Niveau / Classe', header.level],
      ['Groupe', header.group],
      ['Session', header.sessionType],
      ['Trimestre', header.term],
      ['Date', header.date],
      header.durationMinutes ? ['Durée', `${header.durationMinutes} min`] : null,
    ]
      .filter(Boolean)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .map(([label, value]) => `${label} : ${value}`);
    if (meta.length) ops.push(this.txt(meta.join('     '), { size: SMALL, align: 'center', spaceAfter: 5 }));

    ops.push(this.txt(`Note : ${model.scoring.label}`, { face: 'bold', align: 'center', spaceAfter: 3 }));
    ops.push(rule({ thickness: 1.4, spaceAfter: 9 }));
    return group(ops, { label: 'header' });
  }

  identityNode(model) {
    if (model.meta.document !== 'student') return null;
    const { header } = model;
    const row = [];
    if (header.studentNameField !== false) row.push({ label: 'Nom & prénom :', width: CONTENT_W * 0.37 });
    if (header.studentNumberField !== false) row.push({ label: 'N° :', width: CONTENT_W * 0.17 });
    if (header.showClassField !== false) row.push({ label: 'Classe :', width: CONTENT_W * 0.2 });
    row.push({ label: `Note :  / ${EXAM_DOC_TARGET_SCORE}`, width: CONTENT_W * 0.26 });
    const ops = [
      cells(
        row.map((cell) => ({
          text: this.ctx.encode(cell.label),
          width: cell.width,
          height: 22,
          border: 'bottom',
          size: SMALL,
        })),
        { spaceBefore: 2, spaceAfter: 10 },
      ),
    ];
    if (header.instructions) {
      ops.push(this.txt(`Consignes : ${header.instructions}`, { size: SMALL, spaceAfter: 8 }));
    }
    return group(ops, { label: 'identity' });
  }

  blockOps(item) {
    const block = item.block;
    const ops = [];
    if (block.instruction) {
      ops.push(this.txt(block.instruction, { size: SMALL, face: 'italic', spaceAfter: 3 }));
    }

    switch (block.kind) {
      case 'options': {
        const marker = MARKER[block.marker] || MARKER.checkbox;
        for (const option of block.options) {
          ops.push(
            this.txt(`${marker} ${option.letter}. ${option.text || '(image)'}`, {
              indent: 14,
              spaceAfter: option.image ? 2 : 3,
              lineGap: 1.5,
            }),
          );
          const pic = this.picture(option.image, { maxW: 120, maxH: 62 });
          if (pic) ops.push(image(pic, { maxW: 120, indent: 24, spaceBefore: 0, spaceAfter: 5 }));
        }
        break;
      }
      case 'blanks':
        for (let i = 0; i < (block.blanks || 1); i++) {
          ops.push(
            cells([{ text: '', width: 220, height: 20, border: 'bottom' }], {
              spaceBefore: 2,
              spaceAfter: 4,
            }),
          );
        }
        break;
      case 'sequence': {
        const pool = block.pool.map((o) => `${o.letter}. ${o.text || '(image)'}`).join('     ');
        if (pool) ops.push(this.txt(`Éléments à placer : ${pool}`, { size: SMALL, spaceAfter: 5 }));
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
        const half = CONTENT_W / 2;
        const rows = [
          { text: this.ctx.encode('Colonne A'), width: half, height: 18, border: 'box', face: 'bold', size: SMALL },
          { text: this.ctx.encode('Colonne B'), width: half, height: 18, border: 'box', face: 'bold', size: SMALL },
        ];
        const n = Math.max(block.lefts.length, (block.rights || []).length);
        for (let i = 0; i < n; i++) {
          const left = block.lefts[i];
          const right = block.rights[i];
          rows.push({
            text: this.ctx.encode(left ? `${left.n}. ${left.text}` : ''),
            width: half,
            height: 16,
            border: 'box',
          });
          rows.push({
            text: this.ctx.encode(right ? `${right.letter}. ${right.text}` : ''),
            width: half,
            height: 16,
            border: 'box',
          });
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
          ops.push(this.txt(`${MARKER.radio} ${option.letter}. ${option.text}`, { indent: 14, spaceAfter: 3, lineGap: 1.5 }));
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
        return block.lines || 2;
    }
  }

  answerKeyOps(item) {
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
    parts.push(rule({ thickness: 0.5, spaceBefore: 5, spaceAfter: 8 }));
    return parts;
  }

  questionNode(item, model) {
    const isKey = model.meta.document === 'answer_key';
    const ops = [];
    ops.push({
      t: 'split',
      left: this.ctx.encode(`Question ${item.number}`),
      right: this.ctx.encode(`${formatPoints(item.points)} pt${Number(item.points) === 1 ? '' : 's'}`),
      face: 'bold',
      size: BODY,
      spaceBefore: 3,
      spaceAfter: 3,
    });
    ops.push(this.txt(item.block.text || '(énoncé vide)', { spaceAfter: 3 }));

    const media = this.picture(item.block.media, { maxW: CONTENT_W * 0.7, maxH: 190 });
    if (media) ops.push(image(media, { maxW: CONTENT_W * 0.7, spaceAfter: 5 }));

    ops.push(...this.blockOps(item));

    if (!isKey) {
      const lines = this.writingLines(item);
      for (let i = 0; i < lines; i++) {
        ops.push(
          rule({
            style: 'dotted',
            thickness: 0.6,
            spaceBefore: 2,
            spaceAfter: i === lines - 1 ? 8 : 14,
          }),
        );
      }
    } else {
      ops.push(group(this.answerKeyOps(item), { label: 'key' }));
    }
    return group(ops, { label: `question ${item.number}` });
  }

  sectionNode(section, model) {
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
    const ops = [this.txt('Points à revoir', { face: 'bold', size: SMALL, spaceBefore: 8, spaceAfter: 2 })];
    for (const w of model.warnings) {
      ops.push(this.txt(`- ${w.message || w.type}`, { size: SMALL, indent: 10, spaceAfter: 1, lineGap: 1 }));
    }
    return group(ops, { label: 'warnings' });
  }

  footerNode(model) {
    const ops = [rule({ thickness: 0.8, spaceBefore: 6, spaceAfter: 5 })];
    ops.push(this.txt(`Total : ${model.scoring.label}`, { face: 'bold', align: 'right', spaceAfter: 3 }));
    if (model.header.scaleNote) {
      ops.push(this.txt(model.header.scaleNote, { size: TINY, face: 'italic', align: 'center', spaceAfter: 4 }));
    }
    ops.push(
      this.txt(model.meta.document === 'answer_key' ? '— Fin du corrigé —' : '— Fin du sujet —', {
        size: SMALL,
        align: 'center',
        spaceAfter: 0,
      }),
    );
    return group(ops, { label: 'footer' });
  }

  build(model) {
    const nodes = [this.headerNode(model)];
    const identity = this.identityNode(model);
    if (identity) nodes.push(identity);
    for (const section of model.sections) nodes.push(this.sectionNode(section, model));
    const warnings = this.warningsNode(model);
    if (warnings) nodes.push(warnings);
    nodes.push(this.footerNode(model));
    return nodes;
  }
}

/** Layout engine: measures a keep-group, then breaks the page before it. */
class PdfLayout {
  constructor(doc, faces) {
    this.doc = doc;
    this.faces = faces;
    this.y = PDF_MARGIN;
    this.pageBottom = PDF_PAGE.height - PDF_MARGIN - FOOTER_H;
  }

  face(name, size) {
    this.doc.font(this.faces[name] || this.faces.regular).fontSize(size ?? BODY);
  }

  newPage() {
    this.doc.addPage();
    this.y = PDF_MARGIN;
  }

  ensure(height) {
    if (this.y + height > this.pageBottom && this.y > PDF_MARGIN) this.newPage();
  }

  measure(op) {
    const doc = this.doc;
    switch (op.t) {
      case 'space':
        return op.h;
      case 'rule':
        return op.spaceBefore + op.thickness + op.spaceAfter;
      case 'image':
        return op.spaceBefore + op.pic.height + op.spaceAfter;
      case 'text':
      case 'code': {
        this.face(op.face, op.size);
        const lines = doc.heightOfString(op.value, { width: op.width, lineGap: op.lineGap });
        return op.spaceBefore + lines + (op.t === 'code' ? CODE_PAD * 2 : 0) + op.spaceAfter;
      }
      case 'split': {
        this.face(op.face, op.size);
        const h = Math.max(
          doc.heightOfString(op.left, { width: CONTENT_W * 0.6, lineGap: 0 }),
          doc.heightOfString(op.right, { width: CONTENT_W * 0.35, lineGap: 0 }),
        );
        return op.spaceBefore + h + op.spaceAfter;
      }
      case 'cells':
        return op.spaceBefore + this.#measureRows(op.rows) + op.spaceAfter;
      case 'group':
        return op.ops.reduce((acc, child) => acc + this.measure(child), 0);
      default:
        return 0;
    }
  }

  #rowChunks(rows) {
    // `cells` receives a flat list of cells; they are chunked into visual rows
    // by cumulative width so a wide table can still wrap.
    const chunks = [];
    let current = [];
    let used = 0;
    for (const cell of rows) {
      const w = cell.width || 0;
      if (current.length && used + w > CONTENT_W + 1) {
        chunks.push(current);
        current = [];
        used = 0;
      }
      current.push(cell);
      used += w;
    }
    if (current.length) chunks.push(current);
    return chunks;
  }

  #measureRows(rows) {
    return this.#rowChunks(rows).reduce((acc, row) => acc + this.#rowHeight(row), 0);
  }

  #rowHeight(row) {
    let h = 0;
    for (const cell of row) {
      this.face(cell.face, cell.size);
      const textH = cell.text ? this.doc.heightOfString(cell.text, { width: cell.width - 8, lineGap: 0 }) : 0;
      h = Math.max(h, cell.height || 16, textH + 6);
    }
    return h;
  }

  draw(op) {
    const doc = this.doc;
    switch (op.t) {
      case 'space':
        this.y += op.h;
        break;
      case 'rule': {
        this.y += op.spaceBefore;
        const x = PDF_MARGIN;
        doc.lineWidth(op.thickness).strokeColor('#000000');
        if (op.style === 'dotted') doc.dash(1.5, { spaceWidth: 3 });
        doc.moveTo(x, this.y).lineTo(x + Math.min(op.width, CONTENT_W), this.y).stroke();
        if (op.style === 'dotted') doc.undash();
        this.y += op.thickness + op.spaceAfter;
        break;
      }
      case 'image': {
        this.y += op.spaceBefore;
        const w = Math.min(op.pic.width, op.maxW);
        const h = op.pic.height * (w / op.pic.width);
        const x = op.align === 'center' ? PDF_MARGIN + (CONTENT_W - w) / 2 : PDF_MARGIN + op.indent;
        doc.image(op.pic.buffer, x, this.y, { width: w, height: h });
        this.y += h + op.spaceAfter;
        break;
      }
      case 'text':
      case 'code': {
        this.y += op.spaceBefore;
        this.face(op.face, op.size);
        doc.fillColor('#000000');
        const x = PDF_MARGIN + op.indent;
        const boxH = doc.heightOfString(op.value, { width: op.width, lineGap: op.lineGap });
        if (op.t === 'code') {
          doc.lineWidth(0.6).strokeColor('#000000').rect(x, this.y - 2, op.width, boxH + CODE_PAD * 2 - 2).stroke();
        }
        doc.text(op.value, x, this.y + (op.t === 'code' ? CODE_PAD - 2 : 0), {
          width: op.width,
          lineGap: op.lineGap,
          align: op.align,
        });
        this.y = doc.y + (op.t === 'code' ? CODE_PAD - 2 : 0) + op.spaceAfter;
        break;
      }
      case 'split': {
        this.y += op.spaceBefore;
        this.face(op.face, op.size);
        doc.fillColor('#000000');
        doc.text(op.left, PDF_MARGIN, this.y, { width: CONTENT_W * 0.6, lineGap: 0 });
        doc.text(op.right, PDF_MARGIN + CONTENT_W * 0.4, this.y, {
          width: CONTENT_W * 0.6,
          align: 'right',
          lineGap: 0,
        });
        this.y = Math.max(doc.y, this.y + BODY * 1.2) + op.spaceAfter;
        break;
      }
      case 'cells': {
        this.y += op.spaceBefore;
        for (const row of this.#rowChunks(op.rows)) {
          const h = this.#rowHeight(row);
          let x = PDF_MARGIN;
          for (const cell of row) {
            doc.lineWidth(0.6).strokeColor('#000000');
            if (cell.border === 'box') {
              doc.rect(x, this.y, cell.width, h).stroke();
            } else if (cell.border === 'bottom') {
              doc.moveTo(x + 2, this.y + h).lineTo(x + cell.width - 2, this.y + h).stroke();
            }
            if (cell.text) {
              this.face(cell.face, cell.size);
              doc.fillColor('#000000').text(cell.text, x + 4, this.y + 3, { width: cell.width - 8, lineGap: 0 });
            }
            x += cell.width;
          }
          this.y += h + 0.5;
        }
        this.y += op.spaceAfter;
        break;
      }
      case 'group':
        for (const child of op.ops) this.draw(child);
        break;
      default:
        break;
    }
  }

  render(nodes) {
    for (const node of nodes) {
      if (node.t === 'group' && node.keep) {
        const h = this.measure(node);
        if (h <= USABLE_H) this.ensure(h);
        else if (this.y > PDF_MARGIN + 4) this.newPage();
      }
      this.draw(node);
    }
  }

  stampFooters(model, pages) {
    const range = this.doc.bufferedPageRange();
    // Footers are written BELOW the text area, so the page margin would make
    // pdfkit treat them as an overflow and append a blank page for each. An
    // explicit box height tells the text engine to stop instead of continuing.
    const boxHeight = FOOTER_H - 8;
    for (let i = 0; i < range.count; i++) {
      this.doc.switchToPage(range.start + i);
      const y = PDF_PAGE.height - PDF_MARGIN + 8;
      this.face('regular', TINY);
      this.doc.fillColor('#000000');
      const label =
        model.meta.document === 'answer_key'
          ? `CORRIGÉ — ${model.meta.examName} — confidentiel`
          : model.meta.examName;
      this.doc.text(label, PDF_MARGIN, y, {
        width: CONTENT_W * 0.6,
        height: boxHeight,
        lineGap: 0,
        ellipsis: true,
      });
      this.doc.text(`Page ${i + 1} / ${pages}`, PDF_MARGIN + CONTENT_W * 0.4, y, {
        width: CONTENT_W * 0.6,
        height: boxHeight,
        align: 'right',
        lineGap: 0,
      });
    }
  }
}

function resolveFaces(doc, ctx) {
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
      return { regular: 'ed-custom', bold: 'ed-custom', italic: 'ed-custom', mono: 'ed-custom' };
    } catch (_) {
      ctx.warn({
        type: 'font-fallback',
        message: `Police EXAM_DOC_FONT_TTF illisible (${ttf}) : polices standard utilisées.`,
      });
    }
  }
  return { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', mono: 'Courier' };
}

/**
 * @param {object} model output of `ExamDocumentService#buildExamDocument`
 * @param {object} [options] { uploadsDir, fontTtf }
 * @returns {Promise<{ buffer: Buffer, warnings: object[], pages: number }>}
 */
export async function renderExamDocumentPdf(model, options = {}) {
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
    size: 'A4',
    layout: 'portrait',
    margins: {
      top: PDF_MARGIN,
      right: PDF_MARGIN,
      bottom: PDF_MARGIN + FOOTER_H,
      left: PDF_MARGIN,
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

  const faces = resolveFaces(doc, ctx);
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

  const nodes = new PdfBuilder(doc, ctx).build(model);
  const layout = new PdfLayout(doc, faces);
  layout.render(nodes);
  const pages = doc.bufferedPageRange().count;
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

  return { buffer, warnings, pages };
}
