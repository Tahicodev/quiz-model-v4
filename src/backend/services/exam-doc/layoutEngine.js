/**
 * src/backend/services/exam-doc/layoutEngine.js
 *
 * The layout engine — the "how to draw it" layer of the generator.
 *
 * It owns the declarative op-tree (measured before drawn) and the measure →
 * paginate → render loop. Every geometry comes from a single frozen ENGINE
 * CONFIG (`cfg`) resolved by the template registry (`templates/index.js`):
 * margins, content width, columns, footer height, colours, sizes and the
 * masthead / grade-box geometry. The engine also honours the template's header
 * variant (bandeau / minimal / officiel + anonymity, with an optional compact
 * running header on pages ≥ 2) and footer variant.
 *
 * Two invariants protect the built-in Classique sheet:
 *  - for one column, `#x()`/`#w()` equal the historical `PDF_MARGIN`/`CONTENT_W`,
 *    and the `title+number` footer reproduces the old stamping exactly;
 *  - a running header is only drawn when the template enables `compactOnFollow`,
 *    which Classique does not, so page 2+ is unchanged.
 *
 * Pagination rules (from Step 0, unchanged):
 *  - EVERY block is measured before it is drawn and pushed forward when it does
 *    not fit; a group taller than a column flows instead of wasting the page;
 *  - the inner "question head" group keeps a title glued to its stem;
 *  - one table row is the atomic unit; a `span` block (a matching table) breaks
 *    out to the full page width.
 */

import { EXAM_DOC_TARGET_SCORE } from '../../../shared/schemas/examDocument.schema.js';

// ─── Op constructors (declarative layout tree), parameterized by cfg ─────────
export function opHelpers(cfg) {
  const contentW = cfg.contentW;
  const density = cfg.theme.density;
  return {
    space: (h) => ({ t: 'space', h: h * density }),
    rule: (opts = {}) => ({
      t: 'rule',
      style: opts.style || 'solid',
      width: opts.width ?? contentW,
      thickness: opts.thickness ?? 0.8,
      spaceBefore: (opts.spaceBefore ?? 3) * density,
      spaceAfter: (opts.spaceAfter ?? 6) * density,
      span: opts.span,
    }),
    image: (pic, opts = {}) => ({
      t: 'image',
      pic,
      maxW: opts.maxW ?? contentW,
      align: opts.align || 'left',
      indent: opts.indent ?? 0,
      spaceBefore: (opts.spaceBefore ?? 4) * density,
      spaceAfter: (opts.spaceAfter ?? 6) * density,
      span: opts.span,
    }),
    cells: (rowList, opts = {}) => ({
      t: 'cells',
      rows: rowList,
      spaceBefore: (opts.spaceBefore ?? 4) * density,
      spaceAfter: (opts.spaceAfter ?? 8) * density,
      span: opts.span,
    }),
    group: (ops, opts = {}) => ({
      t: 'group',
      keep: opts.keep !== false,
      label: opts.label || '',
      span: opts.span,
      ops,
    }),
  };
}

export class PdfLayout {
  constructor(doc, faces, cfg) {
    this.doc = doc;
    this.faces = faces;
    this.cfg = cfg;
    const m = cfg.margin;
    this.mLeft = m.left;
    this.mTop = m.top;
    this.mBottom = m.bottom;
    this.mRight = m.right;
    this.contentW = cfg.contentW;
    this.colW = cfg.colW;
    this.cols = cfg.page.columns;
    this.gutter = cfg.page.gutter;
    this.ruleBetween = cfg.page.ruleBetween && this.cols > 1;
    this.pageBottom = cfg.pageH - m.bottom - cfg.footerH;
    this.header = cfg.header;
    this.footerCfg = cfg.footer;
    this.S = cfg.theme.sizes;
    this.C = cfg.theme.colors;
    this.H = cfg.header;
    // A running header only exists when the template asks for it (Classique
    // never did), so its reserved height is 0 by default → page 2 unchanged.
    this.compactOnFollow = !!(cfg.header.fullOnFirstPage && cfg.header.compactOnFollow);
    this.compactHeaderH = 24;
    // Flow cursor: starts in "span" for the page-1 header, then columns begin.
    this.colIndex = 0;
    this.bandTop = m.top;
    // Top of the current page's content, used only to report last-page fill: it
    // is set once per page and is NOT moved by a full-width band's `#exitSpan`
    // (which resets `bandTop`), so a page that ends on a spanning table still
    // reports the table's height as filled rather than 0%.
    this.pageTop = m.top;
    this.y = m.top;
    this.mode = 'column';
    this.spanStack = [];
    this.pagesStarted = 0;
  }

  // ── horizontal geometry (column vs full-width span) ────────────────────────
  #x() {
    if (this.mode === 'span' || this.cols === 1) return this.mLeft;
    return this.mLeft + this.colIndex * (this.colW + this.gutter);
  }
  #w() {
    if (this.mode === 'span' || this.cols === 1) return this.contentW;
    return this.colW;
  }
  // Effective text width: keep the baked value for 1-column/span (byte-parity),
  // recompute against the column width only when actually flowing in 2 columns.
  #textWidth(op) {
    if (this.cols > 1 && this.mode !== 'span') return this.#w() - (op.indent || 0);
    return op.width;
  }
  #columnHeight() {
    return this.pageBottom - this.bandTop;
  }
  #runningReserve() {
    return this.compactOnFollow && this.pagesStarted > 0 ? this.compactHeaderH : 0;
  }

  face(name, size) {
    this.doc.font(this.faces[name] || this.faces.regular).fontSize(size ?? this.S.body);
  }

  newPage() {
    this.doc.addPage();
    this.pagesStarted++;
    this.colIndex = 0;
    this.bandTop = this.mTop + this.#runningReserve();
    this.pageTop = this.bandTop;
    this.y = this.bandTop;
  }

  ensure(height) {
    if (this.y + height <= this.pageBottom) return;
    if (this.cols > 1 && this.mode === 'column' && this.colIndex < this.cols - 1) {
      this.#nextColumn();
    } else if (this.y > this.bandTop) {
      this.newPage();
    }
  }

  #nextColumn() {
    if (this.ruleBetween && this.colIndex === 0) {
      // a hairline between the two columns on the sheet
      const x = this.mLeft + this.colW + this.gutter / 2;
      this.doc.lineWidth(0.5).strokeColor(this.C.hairline);
      this.doc.moveTo(x, this.bandTop).lineTo(x, this.pageBottom).stroke();
    }
    this.colIndex++;
    this.y = this.bandTop;
  }

  #hasColumnContent() {
    return this.colIndex > 0 || this.y > this.bandTop + 2;
  }

  #enterSpan() {
    // A full-width band may only occupy space where no column already has text.
    // While we are still in the FIRST column the second column is empty by
    // construction (sequential fill), so the band fits inline: its right half
    // overlaps the still-empty column and only that unused strip is lost. Once
    // we have advanced to a LATER column the left one is already filled below
    // the band's top, so a full-width band would collide — flush to a clean page
    // instead. (A band that is too tall to fit inline still page-breaks via the
    // `ensure` guard in `visit`, so this never overflows the sheet.)
    if (this.cols > 1 && this.mode === 'column' && this.colIndex > 0 && this.#hasColumnContent()) {
      this.newPage();
    }
    this.spanStack.push(this.mode);
    this.mode = 'span';
  }

  #exitSpan() {
    this.mode = this.spanStack.pop() || 'column';
    if (this.cols > 1) {
      // Columns resume at the baseline just left by the full-width block.
      this.colIndex = 0;
      this.bandTop = this.y;
    }
  }

  /**
   * Draw one flow node. A `span` node temporarily takes the full page width; a
   * group keeps its own stay-together rule and its children are still guarded
   * individually, so a group taller than a column breaks at a row or line.
   */
  visit(node) {
    if (!node) return;
    if (node.span) this.#enterSpan();
    try {
      if (node.t === 'group') {
        if (node.keep) {
          const h = this.measure(node);
          if (h <= this.#columnHeight()) this.ensure(h);
        }
        for (const child of node.ops) this.visit(child);
        return;
      }
      const h = this.measure(node);
      if (h > 0 && h < this.#columnHeight()) this.ensure(h);
      this.draw(node);
    } finally {
      if (node.span) this.#exitSpan();
    }
  }

  measure(op) {
    const doc = this.doc;
    const CODE_PAD = this.cfg.codePad;
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
        return (op.spaceBefore || 0) + this.H.noteH + (op.spaceAfter || 0);
      case 'text':
      case 'code': {
        this.face(op.face, op.size);
        const lines = doc.heightOfString(op.value, { width: this.#textWidth(op), lineGap: op.lineGap });
        return op.spaceBefore + lines + (op.t === 'code' ? CODE_PAD * 2 : 0) + op.spaceAfter;
      }
      case 'split': {
        this.face(op.face, op.size);
        const W = this.#w();
        const h = Math.max(
          doc.heightOfString(op.left, { width: W * 0.6, lineGap: 0 }),
          doc.heightOfString(op.right, { width: W * 0.35, lineGap: 0 }),
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
    const H = this.H;
    const W = this.#w();
    const L = this.#x();
    const R = L + W;
    const logoW = op.logo ? Math.min(op.logo.width, H.logoMaxW) : 0;
    const logoH = op.logo ? (op.logo.height * logoW) / op.logo.width : 0;
    const mark = op.logo ? logoW : op.left.length || op.right.length ? H.discR * 2 : 0;
    const textX = L + (mark ? mark + 14 : 0);
    const rightW = H.rightW;
    const leftW = Math.max(120, R - textX - (op.right.length ? rightW + 18 : 0));
    const stackH = (lines, width) =>
      lines.reduce((acc, line) => {
        this.face(line.face, line.size);
        return acc + (line.spaceBefore || 0) + doc.heightOfString(line.text, { width, lineGap: line.lineGap || 0 });
      }, 0);
    // The band is as tall as its tallest element: the logo HEIGHT, the disc, or
    // the two text stacks.
    const band = Math.max(H.bandMin, logoH, op.logo ? 0 : mark, stackH(op.left, leftW) + 4, stackH(op.right, rightW) + 4);
    this.face('headBold', H.titleSize);
    const titleH = doc.heightOfString(op.title, { width: W - 20, lineGap: 0 });
    this.face('head', 9.5);
    const subH = op.subtitle ? doc.heightOfString(op.subtitle, { width: W, lineGap: 1 }) : 0;
    const tagH = op.tag ? H.tagSize * 1.3 + H.subGap : 0;
    const body = band + H.ruleGap + H.ruleT + H.titleGap + titleH + tagH + subH + H.subGap;
    return { L, R, W, logoW, logoH, mark, textX, rightW, leftW, band, titleH, subH, tagH,
      total: (op.spaceBefore || 0) + body + (op.spaceAfter || 0) };
  }

  /** Geometry of the reduced running header (pages ≥ 2), compact variant. */
  #compactHeaderGeom(op) {
    const doc = this.doc;
    const W = this.contentW;
    this.face('headBold', 11);
    const h = doc.heightOfString(op.title || '', { width: W - 120, lineGap: 0 });
    return { height: Math.max(this.compactHeaderH, h + 8) };
  }

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
    // by cumulative width so a wide table can still wrap within its column.
    const W = this.#w();
    const chunks = [];
    let current = [];
    let used = 0;
    for (const cell of rows) {
      const w = cell.width || 0;
      if (current.length && used + w > W + 1) {
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
    const CODE_PAD = this.cfg.codePad;
    const C = this.C;
    const S = this.S;
    const H = this.H;
    switch (op.t) {
      case 'space':
        this.y += op.h;
        break;
      case 'rule': {
        this.y += op.spaceBefore;
        const x = this.#x();
        const W = this.#w();
        doc.lineWidth(op.thickness).strokeColor(op.color || '#000000');
        if (op.style === 'dotted') doc.dash(1.5, { spaceWidth: 3 });
        doc.moveTo(x, this.y).lineTo(x + Math.min(op.width || W, W), this.y).stroke();
        if (op.style === 'dotted') doc.undash();
        this.y += op.thickness + op.spaceAfter;
        break;
      }
      case 'image': {
        this.y += op.spaceBefore;
        const x0 = this.#x();
        const W = this.#w();
        const w = Math.min(op.pic.width, Math.min(op.maxW, W));
        const h = op.pic.height * (w / op.pic.width);
        const x = op.align === 'center' ? x0 + (W - w) / 2 : x0 + op.indent;
        doc.image(op.pic.buffer, x, this.y, { width: w, height: h });
        this.y += h + op.spaceAfter;
        break;
      }
      case 'text':
      case 'code': {
        this.y += op.spaceBefore;
        this.face(op.face, op.size);
        doc.fillColor('#000000');
        const x = this.#x() + op.indent;
        const tw = this.#textWidth(op);
        const boxH = doc.heightOfString(op.value, { width: tw, lineGap: op.lineGap });
        if (op.t === 'code') {
          doc.lineWidth(0.6).strokeColor('#000000').rect(x, this.y - 2, tw, boxH + CODE_PAD * 2 - 2).stroke();
        }
        doc.text(op.value, x, this.y + (op.t === 'code' ? CODE_PAD - 2 : 0), {
          width: tw,
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
        const x = this.#x();
        const W = this.#w();
        doc.text(op.left, x, this.y, { width: W * 0.6, lineGap: 0 });
        doc.text(op.right, x + W * 0.4, this.y, { width: W * 0.6, align: 'right', lineGap: 0 });
        this.y = Math.max(doc.y, this.y + S.body * 1.2) + op.spaceAfter;
        break;
      }
      case 'masthead': {
        if (op.variant === 'minimal') {
          this.#drawMinimalMasthead(op);
          break;
        }
        const g = this.#mastheadGeom(op);
        this.y += op.spaceBefore || 0;
        const top = this.y;
        if (op.logo) {
          doc.image(op.logo.buffer, g.L, top, { width: g.logoW, height: g.logoH });
        } else if (g.mark) {
          const cy = top + g.band / 2;
          doc.fillColor(C.accent).circle(g.L + H.discR, cy, H.discR).fill();
          doc.font(this.faces.headBold).fontSize(17).fillColor('#FFFFFF');
          doc.text(op.initials, g.L, cy - 7, { width: H.discR * 2, align: 'center', lineGap: 0 });
        }
        let ly = top + 1;
        for (const line of op.left) ly = this.#drawLine(line, g.textX, ly, g.leftW);
        let ry = top + 1;
        for (const line of op.right) ry = this.#drawLine(line, g.R - g.rightW, ry, g.rightW);

        const ruleY = top + g.band + H.ruleGap;
        const ruleColor = op.variant === 'classique' ? C.hairline : C.accent;
        doc.fillColor(ruleColor).rect(g.L, ruleY, g.W, H.ruleT).fill();
        let y = ruleY + H.ruleT + H.titleGap;
        this.face('headBold', H.titleSize);
        doc.fillColor(C.accent);
        doc.text(op.title, g.L + 10, y, { width: g.W - 20, align: 'center', lineGap: 0 });
        y = doc.y + H.subGap;
        if (op.tag) {
          this.face('headBold', H.tagSize);
          doc.fillColor(C.muted);
          doc.text(op.tag, g.L + 10, y, { width: g.W - 20, align: 'center', characterSpacing: 0.6, lineGap: 0 });
          y = doc.y + H.subGap;
        }
        if (op.subtitle) {
          this.face('head', 9.5);
          doc.fillColor(C.muted);
          doc.text(op.subtitle, g.L, y, { width: g.W, align: 'center', lineGap: 1 });
          y = doc.y + H.subGap;
        }
        this.y = y + (op.spaceAfter || 0);
        break;
      }
      case 'identity': {
        this.y += op.spaceBefore || 0;
        const top = this.y;
        const L = this.#x();
        const R = L + this.#w();
        const NOTE_W = H.noteW;
        const NOTE_H = H.noteH;
        if (op.anonymity) {
          this.#drawAnonymity(op, L, R, top, NOTE_W, NOTE_H);
          this.y = top + NOTE_H + (op.spaceAfter || 0);
          break;
        }
        const boxW = R - L - (op.showNote ? NOTE_W + 12 : 0);
        const rows = (op.rows || []).filter((row) => row.length);
        if (rows.length) {
          doc.fillColor(C.fieldBg).roundedRect(L, top, boxW, NOTE_H, 6).fill();
          doc.strokeColor(C.hairline).lineWidth(0.8).roundedRect(L, top, boxW, NOTE_H, 6).stroke();
          let y = top + 13;
          for (const row of rows) {
            const seg = boxW / row.length;
            row.forEach((label, i) => {
              const x = L + 12 + i * seg;
              this.face('head', S.small);
              doc.fillColor('#111111');
              doc.text(label, x, y, { width: seg - 10, lineBreak: false, lineGap: 0 });
              const from = x + doc.widthOfString(label) + 5;
              doc
                .lineWidth(0.7)
                .strokeColor(C.muted)
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
          doc.strokeColor(C.accent).lineWidth(1.2).roundedRect(nx, top, NOTE_W, NOTE_H, 6).stroke();
          this.face('head', 8);
          doc.fillColor(C.muted).text('NOTE', nx + 9, top + 7, { lineGap: 0 });
          this.face('headBold', 15);
          doc
            .fillColor(C.accent)
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

  /** `minimal` header: no band, just the title over the info line — compact. */
  #drawMinimalMasthead(op) {
    const doc = this.doc;
    const C = this.C;
    const H = this.H;
    this.y += op.spaceBefore || 0;
    const L = this.#x();
    const W = this.#w();
    this.face('headBold', H.titleSize);
    doc.fillColor(C.accent);
    doc.text(op.title, L, this.y, { width: W, align: 'center', lineGap: 0 });
    let y = doc.y + H.subGap;
    if (op.subtitle) {
      this.face('head', 9.5);
      doc.fillColor(C.muted);
      doc.text(op.subtitle, L, y, { width: W, align: 'center', lineGap: 1 });
      y = doc.y + H.subGap;
    }
    doc.lineWidth(0.8).strokeColor(C.hairline).moveTo(L, y + 2).lineTo(L + W, y + 2).stroke();
    this.y = y + 6 + (op.spaceAfter || 0);
  }

  /** `officiel` anonymity plate: a candidate-number / barcode box, no names. */
  #drawAnonymity(op, L, R, top, NOTE_W, NOTE_H) {
    const doc = this.doc;
    const C = this.C;
    const boxW = R - L - (op.showNote ? NOTE_W + 12 : 0);
    doc.strokeColor(C.muted).lineWidth(1).roundedRect(L, top, boxW, NOTE_H, 6).stroke();
    this.face('head', this.S.small);
    doc.fillColor(C.muted).text('Numéro anonyme', L + 12, top + 9, { lineGap: 0 });
    // A neutral hatched strip standing in for the code-barre collant.
    const bx = L + 12;
    const by = top + 26;
    const bw = boxW - 24;
    doc.lineWidth(0.8).strokeColor('#111111');
    for (let x = bx; x < bx + bw; x += 6) doc.moveTo(x, by).lineTo(x, by + 22).stroke();
    if (op.showNote) {
      const nx = R - NOTE_W;
      doc.strokeColor(C.accent).lineWidth(1.2).roundedRect(nx, top, NOTE_W, NOTE_H, 6).stroke();
      this.face('head', 8);
      doc.fillColor(C.muted).text('NOTE', nx + 9, top + 7, { lineGap: 0 });
      this.face('headBold', 15);
      doc.fillColor(C.accent).text(`/ ${EXAM_DOC_TARGET_SCORE}`, nx + NOTE_W - 62, top + NOTE_H - 22, {
        width: 53,
        align: 'right',
        lineGap: 0,
      });
    }
  }

  #drawRow(row, h) {
    const doc = this.doc;
    const top = this.y;
    const xs = [];
    let x = this.#x();
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

  /**
   * Fraction of the current (last) column that real content occupies, measured
   * the moment rendering finishes and before footers are stamped. It is the
   * dry-render counterpart of the analytic estimate and feeds the "last page
   * fill" the custom-generation panel shows. Clamped to [0, 1].
   */
  lastPageFill() {
    const capacity = this.pageBottom - this.pageTop;
    if (capacity <= 0) return 1;
    const used = this.y - this.pageTop;
    return Math.max(0, Math.min(1, used / capacity));
  }

  /** Compact running header stamped on pages ≥ 2 (only when the template asks). */
  stampRunningHeaders(headerOp) {
    if (!this.compactOnFollow || !headerOp) return;
    const range = this.doc.bufferedPageRange();
    const C = this.C;
    for (let i = 1; i < range.count; i++) {
      this.doc.switchToPage(range.start + i);
      const g = this.#compactHeaderGeom(headerOp);
      const y = this.mTop;
      this.face('headBold', 11);
      this.doc.fillColor(C.accent);
      this.doc.text(headerOp.title || '', this.mLeft, y, { width: this.contentW - 140, lineGap: 0, ellipsis: true });
      this.face('head', 9);
      this.doc.fillColor(C.muted);
      this.doc.text(headerOp.tag || '', this.mLeft, y + 1, { width: this.contentW, align: 'right', lineGap: 0 });
      const ruleY = y + Math.max(16, g.height - 6);
      this.doc.lineWidth(0.6).strokeColor(C.hairline).moveTo(this.mLeft, ruleY).lineTo(this.mLeft + this.contentW, ruleY).stroke();
    }
  }

  stampFooters(model, pages) {
    const cfg = this.cfg;
    const CONTENT_W = cfg.contentW;
    const TINY = cfg.theme.sizes.tiny;
    const f = cfg.footer;
    const range = this.doc.bufferedPageRange();
    const boxHeight = cfg.footerH - 8;
    const isKey = model.meta.document === 'answer_key';
    const examLabel = isKey ? `CORRIGÉ — ${model.meta.examName} — confidentiel` : model.meta.examName;
    for (let i = 0; i < range.count; i++) {
      this.doc.switchToPage(range.start + i);
      const y = cfg.pageH - cfg.margin.bottom + 8;
      this.face('regular', TINY);
      this.doc.fillColor('#000000');
      const last = i === range.count - 1;
      // `total` adds " / n"; without it the page number is alone.
      const num = f.total ? `Page ${i + 1} / ${pages}` : `Page ${i + 1}`;
      if (f.variant === 'number') {
        this.doc.text(num, this.mLeft, y, { width: CONTENT_W, height: boxHeight, align: 'center', lineGap: 0 });
      } else if (f.variant === 'number+encouragement') {
        const left = last ? f.encouragement : examLabel;
        this.doc.text(left, this.mLeft, y, { width: CONTENT_W * 0.6, height: boxHeight, lineGap: 0, ellipsis: true });
        this.doc.text(num, this.mLeft + CONTENT_W * 0.4, y, { width: CONTENT_W * 0.6, height: boxHeight, align: 'right', lineGap: 0 });
      } else if (f.variant === 'turn-page') {
        const left = last ? (isKey ? examLabel : f.encouragement) : 'Suite →  tournez la page';
        this.doc.text(left, this.mLeft, y, { width: CONTENT_W * 0.6, height: boxHeight, lineGap: 0, ellipsis: true });
        this.doc.text(num, this.mLeft + CONTENT_W * 0.4, y, { width: CONTENT_W * 0.6, height: boxHeight, align: 'right', lineGap: 0 });
      } else {
        // 'title+number' — the Classique default, byte-identical to the old stamp.
        this.doc.text(examLabel, this.mLeft, y, { width: CONTENT_W * 0.6, height: boxHeight, lineGap: 0, ellipsis: true });
        this.doc.text(num, this.mLeft + CONTENT_W * 0.4, y, { width: CONTENT_W * 0.6, height: boxHeight, align: 'right', lineGap: 0 });
      }
    }
  }
}
