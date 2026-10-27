/**
 * src/backend/services/exam-doc/pdfRenderer.js
 *
 * Real A4 PDF (pdfkit — no Chromium, no native addon) built from the SAME
 * normalized model the HTML preview and the DOCX consume.
 *
 * Layout rules that matter for a printable exam:
 *  - A4 portrait 595.28×841.89pt, 42pt margins.
 *  - EVERY block is measured before it is drawn (`heightOfString`) and pushed to
 *    the next page when it does not fit — question groups, table rows and choice
 *    lines alike. A frame and its text therefore always land on the same sheet:
 *    pdfkit starts a page per `text()` call once the explicit `y` is past the
 *    bottom limit, which used to tear tables apart.
 *  - Standard fonts are WinAnsi-encoded: all French accents are native, any
 *    character outside that set is transliterated AND reported, never silently
 *    mangled. `EXAM_DOC_FONT_TTF` embeds a real Unicode font when supplied.
 *  - "Page i / n" is stamped afterwards through `bufferedPageRange()`.
 *  - Black ink for the content — no colour-coded answers, so a grayscale
 *    photocopy stays readable and the answer key carries no visual "cheat" cue.
 *    The masthead and the grade box are the only coloured areas, one accent
 *    colour dark enough to survive a photocopier.
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

// Single accent for the masthead + grade box. Dark enough that a grayscale
// photocopy keeps the header readable; the content itself stays black.
const NAVY = '#1F3A5F';
const GREY = '#5B6472';
const HAIRLINE = '#C9D1D9';
const FIELD_BG = '#F6F8FA';
const NOTE_W = 126; // ≈ 4.4 cm: a teacher writes "17,5" in red inside it
const NOTE_H = 58;
const LOGO_MAX_W = 132;
const LOGO_MAX_H = 54;
const DISC_R = 20; // fallback logo: a plain disc carrying the school initial
const HEADER_BAND_MIN = 52;
const RULE_GAP = 8;
const RULE_T = 2.4;
const TITLE_GAP = 7;
const TITLE_SIZE = 15;
const SUB_GAP = 3;
const TAG_SIZE = 9;
const MASTHEAD_RIGHT_W = 170;

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

  /**
   * The masthead: logo (or a fallback disc), the institutional block, the title
   * and the run-through information line. Absolute-free: it is one measured op
   * that the layout engine moves as a unit.
   */
  headerNode(model) {
    const { header, meta, scoring } = model;
    const isKey = meta.document === 'answer_key';
    const enc = (value) => this.ctx.encode(String(value ?? ''));
    const stack = (entries) =>
      entries
        .map(([text, opts]) => ({ text: enc(text), ...opts }))
        .filter((line) => line.text.trim() !== '');

    const scale = Number(header.logoScale) || 1;
    const logo = this.picture(header.logoDataUrl || header.logoUrl, {
      maxW: LOGO_MAX_W,
      maxH: LOGO_MAX_H * scale,
    });

    const schoolName = String(header.schoolName || meta.examName || 'Examen').trim();
    const left = stack([
      [schoolName, { face: 'headBold', size: 14, color: NAVY, lineGap: 0.5 }],
      [[header.subject, header.level, header.group].filter(Boolean).join('   ·   '), {
        face: 'head', size: 9.5, color: GREY, lineGap: 0.5, spaceBefore: 1,
      }],
      [[header.ministry, header.academy].filter(Boolean).join('   ·   '), {
        face: 'head', size: 8, color: GREY, lineGap: 0,
      }],
    ]);
    const right = stack([
      [header.academicYear ? `Année scolaire ${header.academicYear}` : '', {
        face: 'head', size: 9.5, color: GREY, align: 'right', lineGap: 0,
      }],
      [[header.sessionType, header.term].filter(Boolean).join('   ·   '), {
        face: 'head', size: 9, color: GREY, align: 'right', lineGap: 0,
      }],
    ]);
    const subtitleParts = [
      header.teacherName ? `Enseignant : ${header.teacherName}` : null,
      header.durationMinutes ? `Durée : ${header.durationMinutes} min` : null,
      // A date the teacher did not fill stays a blank to write on paper, never a guess.
      `Date : ${header.date || '____/____/______'}`,
      isKey ? `Barème : ${formatPoints(scoring.total)} points` : null,
    ].filter(Boolean);
    const subtitle = enc(subtitleParts.join('     ·     '));

    const ops = [
      {
        t: 'masthead',
        logo,
        initials: schoolName.slice(0, 1).toUpperCase(),
        left,
        right,
        title: enc(header.title || meta.examName || 'Examen'),
        tag: isKey ? enc('CORRIGÉ — document enseignant, ne pas distribuer') : '',
        subtitle,
        spaceBefore: 0,
        spaceAfter: 9,
      },
    ];
    const identity = this.identityNode(model);
    if (identity) ops.push(identity);
    if (header.instructions) {
      ops.push(
        this.txt(
          isKey
            ? `Consignes données aux élèves : ${header.instructions}`
            : `Consignes : ${header.instructions}`,
          { size: SMALL, spaceAfter: 6 },
        ),
      );
    }
    // The barème is printed on the confidential key only: on the student paper
    // the grade box is meant to stay empty.
    if (isKey) ops.push(this.txt(`Note : ${model.scoring.label}`, { face: 'bold', align: 'center', spaceAfter: 3 }));
    ops.push(rule({ thickness: 1.4, spaceAfter: 8 }));
    return group(ops, { label: 'header' });
  }

  /**
   * Identity fields + grade box, one block: the fields are drawn as real dotted
   * rules on a light plate, and the grade gets a dedicated ~4.4 × 2 cm box.
   */
  identityNode(model) {
    if (model.meta.document !== 'student') return null;
    const { header } = model;
    const fields = [];
    if (header.studentNameField !== false) fields.push('Nom & prénom :');
    if (header.studentNumberField !== false) fields.push('N° :');
    if (header.showClassField !== false) fields.push('Classe :');
    return {
      t: 'identity',
      rows: fields.length >= 3 ? [[fields[0]], fields.slice(1)] : [fields],
      showNote: true,
      spaceBefore: 2,
      spaceAfter: 9,
    };
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
        // Two content columns plus a narrow answer column: without it the table
        // asks for a connection the student has nowhere to write down. Heights
        // leave room for a hand-drawn link or a letter.
        const colA = CONTENT_W * 0.37;
        const colB = CONTENT_W * 0.38;
        const colR = CONTENT_W * 0.25;
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
    const isKey = model.meta.document === 'answer_key';
    const ops = [rule({ thickness: 0.8, spaceBefore: 6, spaceAfter: 5 })];
    ops.push(
      this.txt(
        // The student paper carries the barème as a statement, not as a grade:
        // printing "Note : 20 / 20" on the subject gives away the correction.
        isKey ? `Total : ${model.scoring.label}` : `Barème : ${formatPoints(model.scoring.total)} points`,
        { face: 'bold', align: 'right', spaceAfter: 3 },
      ),
    );
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
    // The identity fields belong to the header keep-group: splitting them off
    // would let a page break land between the title block and the name box.
    const nodes = [this.headerNode(model)];
    for (const section of model.sections) nodes.push(this.sectionNode(section, model));
    const warnings = this.warningsNode(model);
    if (warnings) nodes.push(warnings);
    nodes.push(this.footerNode(model));
    return nodes;
  }
}

/**
 * Layout engine. Every block — keep-group, table row, choice line, banner — is
 * measured and given a page-break guard before it is drawn, because pdfkit
 * writes vectors at the exact `y` asked for while `text()` silently starts a new
 * page once `y` is past the bottom limit: an unguarded table therefore left its
 * frames on one sheet and its words on the next.
 */
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

  /**
   * Draw one flow node. Groups keep their own "stay together" rule and their
   * children are still guarded individually, so a group taller than the page
   * breaks cleanly at a row or a line instead of at an arbitrary glyph.
   */
  visit(node) {
    if (!node) return;
    if (node.t === 'group') {
      if (node.keep) {
        const h = this.measure(node);
        if (h <= USABLE_H) this.ensure(h);
        else if (this.y > PDF_MARGIN + 4) this.newPage();
      }
      for (const child of node.ops) this.visit(child);
      return;
    }
    const h = this.measure(node);
    // Anything that does not fit on an empty page must be allowed to flow
    // (ensure() would refuse it anyway and pdfkit splits long text itself).
    if (h > 0 && h < USABLE_H) this.ensure(h);
    this.draw(node);
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
      case 'masthead':
        return this.#mastheadGeom(op).total;
      case 'identity':
        return (op.spaceBefore || 0) + NOTE_H + (op.spaceAfter || 0);
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

  /** Geometry of the masthead, shared by `measure` and the drawer. */
  #mastheadGeom(op) {
    const doc = this.doc;
    const L = PDF_MARGIN;
    const R = PDF_PAGE.width - PDF_MARGIN;
    const logoW = op.logo ? Math.min(op.logo.width, LOGO_MAX_W) : 0;
    const logoH = op.logo ? (op.logo.height * logoW) / op.logo.width : 0;
    const mark = op.logo ? logoW : op.left.length || op.right.length ? DISC_R * 2 : 0;
    const textX = L + (mark ? mark + 14 : 0);
    const rightW = MASTHEAD_RIGHT_W;
    const leftW = Math.max(120, R - textX - (op.right.length ? rightW + 18 : 0));
    const stackH = (lines, width) =>
      lines.reduce((acc, line) => {
        this.face(line.face, line.size);
        return acc + (line.spaceBefore || 0) + doc.heightOfString(line.text, { width, lineGap: line.lineGap || 0 });
      }, 0);
    // The band is as tall as its tallest element: the logo HEIGHT (its width only
    // moves the text column), the disc, or the two text stacks.
    const band = Math.max(HEADER_BAND_MIN, logoH, op.logo ? 0 : mark, stackH(op.left, leftW) + 4, stackH(op.right, rightW) + 4);
    this.face('headBold', TITLE_SIZE);
    const titleH = doc.heightOfString(op.title, { width: CONTENT_W - 20, lineGap: 0 });
    this.face('head', 9.5);
    const subH = op.subtitle ? doc.heightOfString(op.subtitle, { width: CONTENT_W, lineGap: 1 }) : 0;
    const tagH = op.tag ? TAG_SIZE * 1.3 + SUB_GAP : 0;
    const body = band + RULE_GAP + RULE_T + TITLE_GAP + titleH + tagH + subH + SUB_GAP;
    return {
      L, R, logoW, logoH, mark, textX, rightW, leftW, band, titleH, subH, tagH,
      total: (op.spaceBefore || 0) + body + (op.spaceAfter || 0),
    };
  }

  /** One line of the masthead stacks: returns the y just after it. */
  #drawLine(line, x, y, width) {
    const doc = this.doc;
    this.face(line.face, line.size);
    doc.fillColor(line.color || '#000000');
    doc.text(line.text, x, y + (line.spaceBefore || 0), {
      width,
      lineGap: line.lineGap || 0,
      align: line.align || 'left',
    });
    return doc.y;
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
      case 'masthead': {
        const g = this.#mastheadGeom(op);
        this.y += op.spaceBefore || 0;
        const top = this.y;
        if (op.logo) {
          doc.image(op.logo.buffer, g.L, top, { width: g.logoW, height: g.logoH });
        } else if (g.mark) {
          // No readable logo (private storage, unsupported format, corrupt
          // upload): a plain disc with the school initial, never an empty hole.
          const cy = top + g.band / 2;
          doc.fillColor(NAVY).circle(g.L + DISC_R, cy, DISC_R).fill();
          doc.font(this.faces.headBold).fontSize(17).fillColor('#FFFFFF');
          doc.text(op.initials, g.L, cy - 7, { width: DISC_R * 2, align: 'center', lineGap: 0 });
        }
        let ly = top + 1;
        for (const line of op.left) ly = this.#drawLine(line, g.textX, ly, g.leftW);
        let ry = top + 1;
        for (const line of op.right) ry = this.#drawLine(line, g.R - g.rightW, ry, g.rightW);

        const ruleY = top + g.band + RULE_GAP;
        doc.fillColor(NAVY).rect(g.L, ruleY, CONTENT_W, RULE_T).fill();
        let y = ruleY + RULE_T + TITLE_GAP;
        this.face('headBold', TITLE_SIZE);
        doc.fillColor(NAVY);
        doc.text(op.title, g.L + 10, y, { width: CONTENT_W - 20, align: 'center', lineGap: 0 });
        y = doc.y + SUB_GAP;
        if (op.tag) {
          this.face('headBold', TAG_SIZE);
          doc.fillColor(GREY);
          doc.text(op.tag, g.L + 10, y, { width: CONTENT_W - 20, align: 'center', characterSpacing: 0.6, lineGap: 0 });
          y = doc.y + SUB_GAP;
        }
        if (op.subtitle) {
          this.face('head', 9.5);
          doc.fillColor(GREY);
          doc.text(op.subtitle, g.L, y, { width: CONTENT_W, align: 'center', lineGap: 1 });
          y = doc.y + SUB_GAP;
        }
        this.y = y + (op.spaceAfter || 0);
        break;
      }
      case 'identity': {
        this.y += op.spaceBefore || 0;
        const top = this.y;
        const L = PDF_MARGIN;
        const R = PDF_PAGE.width - PDF_MARGIN;
        const boxW = R - L - (op.showNote ? NOTE_W + 12 : 0);
        const rows = (op.rows || []).filter((row) => row.length);
        if (rows.length) {
          doc.fillColor(FIELD_BG).roundedRect(L, top, boxW, NOTE_H, 6).fill();
          doc.strokeColor(HAIRLINE).lineWidth(0.8).roundedRect(L, top, boxW, NOTE_H, 6).stroke();
          let y = top + 13;
          for (const row of rows) {
            const seg = boxW / row.length;
            row.forEach((label, i) => {
              const x = L + 12 + i * seg;
              this.face('head', SMALL);
              doc.fillColor('#111111');
              doc.text(label, x, y, { width: seg - 10, lineBreak: false, lineGap: 0 });
              // A dotted rule the student actually writes on, drawn instead of
              // a row of typed dots (which reads as noise at the photocopier).
              const from = x + doc.widthOfString(label) + 5;
              doc
                .lineWidth(0.7)
                .strokeColor(GREY)
                .dash(1.6, { spaceWidth: 2.6 })
                .moveTo(from, y + 11)
                .lineTo(x + seg - 16, y + 11)
                .stroke()
                .undash();
            });
            y += 22;
          }
        }
        if (op.showNote) {
          const nx = R - NOTE_W;
          doc.strokeColor(NAVY).lineWidth(1.2).roundedRect(nx, top, NOTE_W, NOTE_H, 6).stroke();
          this.face('head', 8);
          doc.fillColor(GREY).text('NOTE', nx + 9, top + 7, { lineGap: 0 });
          this.face('headBold', 15);
          doc
            .fillColor(NAVY)
            .text(`/ ${EXAM_DOC_TARGET_SCORE}`, nx + NOTE_W - 62, top + NOTE_H - 22, {
              width: 53,
              align: 'right',
              lineGap: 0,
            });
        }
        this.y = top + NOTE_H + (op.spaceAfter || 0);
        break;
      }
      case 'cells': {
        this.y += op.spaceBefore;
        for (const row of this.#rowChunks(op.rows)) {
          const h = this.#rowHeight(row);
          // One row is the atomic unit of a table: breaking before it keeps the
          // frame and its text on the same sheet.
          this.ensure(h);
          this.#drawRow(row, h);
          this.y += h + 0.5;
        }
        this.y += op.spaceAfter;
        break;
      }
      case 'group':
        for (const child of op.ops) this.visit(child);
        break;
      default:
        break;
    }
  }

  /**
   * A visual table row: borders first, then text. Neighbouring bordered cells
   * are outlined as one run, because stroking each cell on its own printed the
   * shared edge twice and made the dividers look bolder than the outline.
   */
  #drawRow(row, h) {
    const doc = this.doc;
    const top = this.y;
    const xs = [];
    let x = PDF_MARGIN;
    for (const cell of row) {
      xs.push(x);
      x += cell.width || 0;
    }
    const rowEnd = x;
    doc.lineWidth(0.6).strokeColor('#000000');

    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (cell.border !== 'bottom') continue;
      doc.moveTo(xs[i] + 2, top + h).lineTo(xs[i] + (cell.width || 0) - 2, top + h).stroke();
    }
    let run = -1;
    for (let i = 0; i <= row.length; i++) {
      const inRun = i < row.length && row[i].border === 'box';
      if (inRun && run < 0) run = i;
      if (!inRun && run >= 0) {
        const x0 = xs[run];
        const x1 = i === row.length ? rowEnd : xs[i];
        doc.rect(x0, top, x1 - x0, h).stroke();
        for (let j = run + 1; j < i; j++) doc.moveTo(xs[j], top).lineTo(xs[j], top + h).stroke();
        run = -1;
      }
    }
    for (let i = 0; i < row.length; i++) {
      const cell = row[i];
      if (!cell.text) continue;
      this.face(cell.face, cell.size);
      doc
        .fillColor(cell.color || '#000000')
        .text(cell.text, xs[i] + 4, top + 3, { width: (cell.width || 0) - 8, lineGap: 0, align: cell.align || 'left' });
    }
  }

  render(nodes) {
    for (const node of nodes) this.visit(node);
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
  return {
    regular: 'Times-Roman',
    bold: 'Times-Bold',
    italic: 'Times-Italic',
    mono: 'Courier',
    // The masthead takes the sans face: Helvetica is one of the 14 standard PDF
    // fonts, so header and body still read as two different registers without an
    // embedded TTF. Set EXAM_DOC_FONT_TTF (Lato, Inter, Source Sans 3…) to have
    // the whole paper drawn with a real embedded typeface.
    head: 'Helvetica',
    headBold: 'Helvetica-Bold',
  };
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
