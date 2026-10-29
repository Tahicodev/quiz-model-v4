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
      case 'bank':
        return this.#bankGeom(op).total;
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

  /**
   * Measure a node the way `visit` would see it: a `span` node is measured at
   * the full content width, anything else inside the current column. No cursor
   * moves and no page opens, so this is safe to run on a throwaway document —
   * it is what the page packer asks for the heights the sheet will really use,
   * instead of a second opinion measured by hand.
   */
  measureFlow(node) {
    if (!node) return 0;
    if (!node.span) return this.measure(node);
    this.spanStack.push(this.mode);
    this.mode = 'span';
    try {
      return this.measure(node);
    } finally {
      this.mode = this.spanStack.pop() || 'column';
    }
  }

  /**
   * Geometry of the masthead, shared by `measure` and the drawer. The template's
   * header `variant` decides WHERE the elements go — WHAT they say always comes
   * from `examHeaderParts`, so no layout can print a line the teacher left empty.
   *
   *   bandeau   band (logo · school block · year) → accent rule → centred title
   *   classique band → hairline → title and information aligned LEFT
   *   centre    everything on the axis: logo, school lines, title between rules
   *   split     title + information on the left, logo and identity stacked right
   *   boxed     the whole header framed in a rectangle (the official-paper look)
   *   banner    band → a filled accent bar carrying the title in white
   *   minimal   one centred line, no band at all
   *
   * `officiel` is the historical name of `boxed`: a template saved with it keeps
   * drawing the framed header instead of the plain band it used to share.
   */
  #mastheadGeom(op) {
    const doc = this.doc;
    const H = this.H;
    const PAGE_W = this.#w();
    const PAGE_L = this.#x();
    const variant = op.variant === 'officiel' ? 'boxed' : op.variant || 'bandeau';
    const barPad = variant === 'banner' ? 9 : 0; // inside padding of the filled title bar
    const boxPad = variant === 'boxed' ? 10 : 0; // framed header: gap between rule and content
    const L = PAGE_L + boxPad;
    const R = PAGE_L + PAGE_W - boxPad;
    const W = Math.max(60, R - L);
    const logoW = op.logo ? Math.min(op.logo.width, H.logoMaxW) : 0;
    const logoH = op.logo ? (op.logo.height * logoW) / op.logo.width : 0;
    const mark = op.logo ? logoW : op.left.length || op.right.length ? H.discR * 2 : 0;
    const textX = L + (mark ? mark + 14 : 0);
    const rightW = Math.min(H.rightW, Math.round(W * 0.4));
    const leftW = Math.max(120, R - textX - (op.right.length ? rightW + 18 : 0));
    const stackH = (lines, width) =>
      lines.reduce((acc, line) => {
        this.face(line.face, line.size);
        return acc + (line.spaceBefore || 0) + doc.heightOfString(line.text, { width, lineGap: line.lineGap || 0 });
      }, 0);
    // The band is as tall as its tallest element: the logo HEIGHT, the disc, or
    // the two text stacks. `hideBand` drops the whole top strip (and its rule):
    // only the title and the information line remain of the header.
    const band = op.hideBand ? 0 : Math.max(H.bandMin, logoH, op.logo ? 0 : mark, stackH(op.left, leftW) + 4, stackH(op.right, rightW) + 4);

    // `split` stands the identity block BESIDE the title, so both get a column.
    const sideW = variant === 'split' ? Math.max(140, Math.round(W * 0.4)) : 0;
    const titleAlign = variant === 'classique' || variant === 'split' ? 'left' : 'center';
    const titleX = titleAlign === 'left' ? L : L + 10;
    const titleW = Math.max(80, variant === 'split' ? W - sideW - 16 : W - (titleAlign === 'left' ? 0 : 20));
    const infoX = L;
    const infoW = Math.max(80, variant === 'split' ? W - sideW - 16 : W);

    this.face('headBold', H.titleSize);
    const titleTextH = doc.heightOfString(op.title, { width: titleW, lineGap: 0 });
    const titleH = titleTextH + barPad * 2;
    this.face('head', 9.5);
    const subH = op.subtitle ? doc.heightOfString(op.subtitle, { width: infoW, lineGap: 1 }) : 0;
    const tagH = op.tag ? H.tagSize * 1.3 + H.subGap : 0;
    // Band content when everything is stacked on the axis (`centre`): the logo,
    // or the initials disc standing in for it, then every line centred.
    const markH = op.logo ? logoH + 6 : op.left.length || op.right.length ? H.discR * 2 + 6 : 0;
    const centreBand = markH + stackH(op.left, W) + stackH(op.right, W);
    // …and when it is stacked in the right-hand column (`split`).
    const splitSide = (op.logo ? logoH + 6 : op.left.length || op.right.length ? H.discR * 2 + 6 : 0)
      + stackH(op.left, sideW || W) + stackH(op.right, sideW || W);

    let body;
    if (variant === 'centre') {
      body = (op.hideBand ? 0 : centreBand + H.ruleGap + 0.8) + titleH + tagH
        + (op.subtitle ? H.subGap + subH : 0) + H.subGap + 3.8;
    } else if (variant === 'split') {
      const row = Math.max(titleH + tagH, op.hideBand ? 0 : splitSide);
      body = row + (op.hideBand ? 0 : H.ruleGap + 0.8) + (op.subtitle ? H.subGap + subH : 0) + H.subGap;
    } else {
      // bandeau / classique / banner / minimal: band, then title. `banner` and
      // `minimal` print no rule — the filled bar and the plain paper are the
      // separators — which is what the HTML and Word headers already do.
      const ruled = variant !== 'banner' && variant !== 'minimal';
      const pre = op.hideBand ? 0 : band + H.ruleGap + (ruled ? H.ruleT + H.titleGap : 0);
      // The framed header closes its box with a thin rule under the title.
      const inner = variant === 'boxed' ? 0.8 + H.subGap : 0;
      // The bar keeps padding BELOW the title, which the lines under it clear.
      const after = variant === 'banner' ? barPad : 0;
      body = pre + titleH + tagH + (op.subtitle ? H.subGap + subH : 0) + inner + after + H.subGap;
    }
    return {
      variant, pageL: PAGE_L, pageW: PAGE_W, boxPad,
      L, R, W, logoW, logoH, mark, textX, rightW, leftW, sideW,
      titleAlign, titleX, titleW, titleTextH, infoX, infoW,
      barPad, band, centreBand, splitSide, titleH, subH, tagH,
      total: (op.spaceBefore || 0) + body + (op.spaceAfter || 0),
    };
  }

  /** Geometry of the reduced running header (pages ≥ 2), compact variant. */
  #compactHeaderGeom(op) {
    const doc = this.doc;
    const W = this.contentW;
    this.face('headBold', 11);
    const h = doc.heightOfString(op.title || '', { width: W - 120, lineGap: 0 });
    return { height: Math.max(this.compactHeaderH, h + 8) };
  }

  /**
   * Geometry of the fill-in-blank option bank: every option reads "N. word",
   * the number in bold so it stands apart from the option itself — a plain
   * "(n)" would be confusable with the numbered gap in the sentence. Chips
   * wrap inside the current column; the bold `Options :` label sits on the
   * first line. Shared by `measure` and the drawer so the two can never disagree.
   */
  #bankGeom(op) {
    const doc = this.doc;
    const size = op.size || this.S.small;
    const W = Math.max(60, this.#w() - (op.indent || 0));
    const numGap = size * 0.35; // gap between "N." and its option word
    const chipGap = size * 1.6; // horizontal space between two options
    const lineH = size * 1.4;
    this.face('bold', size);
    const labelW = op.label ? doc.widthOfString(op.label) + size * 0.8 : 0;
    const lines = [];
    let current = null;
    // The first line starts AFTER the label; every wrapped line starts at the
    // left edge again. Seeding `x` with the label width and then resetting it in
    // the wrap branch used to drop the first chips under "Options :".
    let x = labelW;
    for (const item of op.items || []) {
      this.face('bold', size);
      const numW = doc.widthOfString(`${item.n}.`);
      this.face('regular', size);
      const tw = doc.widthOfString(item.text);
      const cw = numW + numGap + tw;
      if (!current) {
        current = { chips: [] };
        lines.push(current);
      } else if (x + cw > W) {
        current = { chips: [] };
        lines.push(current);
        x = 0;
      }
      current.chips.push({ n: item.n, text: item.text, x, numW });
      x += cw + chipGap;
    }
    const height = lines.length * lineH;
    return { size, numGap, chipGap, lineH, labelW, lines, height,
      total: (op.spaceBefore || 0) + height + (op.spaceAfter || 0) };
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

  #rowChunks(rows, chunkW) {
    // `cells` receives a flat list of cells; they are chunked into visual rows
    // by cumulative width so a wide table can still wrap within its column.
    // `chunkW` overrides the flow width when a caller needs its own wrapping
    // (a table narrower than the column, whose rows must not merge).
    const W = chunkW || this.#w();
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

  #measureRows(rows, chunkW) {
    return this.#rowChunks(rows, chunkW).reduce((acc, row) => acc + this.#rowHeight(row), 0);
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
        // `minimal` is a typography variant, not a licence to swallow the
        // teacher's institutional band: the logo, school, ministry, academy and
        // year lines are CONTENT governed by the `showMastheadBand` switch, and
        // the preview already prints them for every variant. Only a band-less
        // minimal header takes the compact one-line path.
        if (op.variant === 'minimal' && op.hideBand) {
          this.#drawMinimalMasthead(op);
          break;
        }
        const g = this.#mastheadGeom(op);
        this.y += op.spaceBefore || 0;
        const top = this.y;
        let bottom;
        if (g.variant === 'centre') bottom = this.#drawCentreMasthead(op, g, top);
        else if (g.variant === 'split') bottom = this.#drawSplitMasthead(op, g, top);
        else if (g.variant === 'boxed') bottom = this.#drawBoxedMasthead(op, g, top);
        else bottom = this.#drawBandMasthead(op, g, top);
        this.y = bottom + (op.spaceAfter || 0);
        break;
      }
      case 'bank': {
        // Option bank of an inline fill-blank question: "N. word" chips that
        // wrap inside the column. The whole bank is one atomic op — the caller
        // already ensured its measured height fits the column.
        this.y += op.spaceBefore || 0;
        const g = this.#bankGeom(op);
        const x0 = this.#x() + (op.indent || 0);
        const top = this.y;
        doc.fillColor('#000000');
        if (op.label && g.lines.length) {
          this.face('bold', g.size);
          doc.text(op.label, x0, top + (g.lineH - g.size * 1.25) / 2, { lineBreak: false, lineGap: 0 });
        }
        g.lines.forEach((line, li) => {
          const lineY = top + li * g.lineH;
          for (const chip of line.chips) {
            const baseY = lineY + (g.lineH - g.size * 1.25) / 2;
            this.face('bold', g.size);
            doc.fillColor('#000000');
            doc.text(`${chip.n}.`, x0 + chip.x, baseY, { lineBreak: false, lineGap: 0 });
            this.face('regular', g.size);
            doc.text(chip.text, x0 + chip.x + chip.numW + g.numGap, baseY, {
              lineBreak: false,
              lineGap: 0,
            });
          }
        });
        this.y = top + g.height + (op.spaceAfter || 0);
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

  /**
   * Logo (or, with no logo, the initials disc) at the left of a band, and the
   * school / ministry / year stacks beside it — the part the `bandeau`,
   * `classique`, `banner`, `minimal` and `boxed` headers share. Returns the y
   * under the band.
   */
  #drawBandStacks(op, g, top) {
    const doc = this.doc;
    const H = this.H;
    const C = this.C;
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
    return Math.max(ly, ry, top + g.band);
  }

  /**
   * The exam title and the answer-key tag. `banner` traces the title white on an
   * accent bar spanning the sheet; `classique` and `split` left-align it. The
   * information line is drawn by the caller, which knows the column it belongs
   * to. Returns the y under the block.
   */
  #drawTitleBlock(op, g, y) {
    const doc = this.doc;
    const C = this.C;
    const H = this.H;
    const pad = g.barPad;
    const barTop = y;
    if (pad) doc.fillColor(C.accent).rect(g.pageL, barTop, g.pageW, g.titleH).fill();
    this.face('headBold', H.titleSize);
    doc.fillColor(pad ? '#FFFFFF' : C.accent);
    doc.text(op.title, g.titleX, y + pad, { width: g.titleW, align: g.titleAlign, lineGap: 0 });
    y = doc.y + H.subGap;
    if (op.tag) {
      this.face('headBold', H.tagSize);
      doc.fillColor(C.muted);
      doc.text(op.tag, g.titleX, y, { width: g.titleW, align: g.titleAlign, characterSpacing: 0.6, lineGap: 0 });
      y = doc.y + H.subGap;
    }
    // Nothing may be printed INSIDE the filled bar: the tag and the information
    // line continue below it, whatever the title's own height came out as.
    if (pad) y = Math.max(y, barTop + g.titleH + H.subGap);
    return y;
  }

  /** The Prof. · Durée · Date line, in the column the variant gave the title. */
  #drawInfo(op, g, y) {
    if (!op.subtitle) return y;
    const doc = this.doc;
    this.face('head', 9.5);
    doc.fillColor(this.C.muted);
    doc.text(op.subtitle, g.infoX, y, { width: g.infoW, align: g.titleAlign, lineGap: 1 });
    return doc.y + this.H.subGap;
  }

  /** `bandeau` / `classique` / `banner` / `minimal`: band across the top, title below. */
  #drawBandMasthead(op, g, top) {
    const doc = this.doc;
    const C = this.C;
    const H = this.H;
    let y = top;
    if (!op.hideBand) {
      y = this.#drawBandStacks(op, g, top);
      if (g.variant === 'banner' || g.variant === 'minimal') {
        // The filled bar (`banner`) or the bare paper (`minimal`) is the
        // separator itself: no rule between band and title.
        y += H.ruleGap;
      } else {
        const ruleY = y + H.ruleGap;
        doc.fillColor(g.variant === 'classique' ? C.hairline : C.accent).rect(g.L, ruleY, g.W, H.ruleT).fill();
        y = ruleY + H.ruleT + H.titleGap;
      }
    }
    y = this.#drawTitleBlock(op, g, y);
    return this.#drawInfo(op, g, y);
  }

  /** `centre`: logo, institution lines, title and information all on the axis. */
  #drawCentreMasthead(op, g, top) {
    const doc = this.doc;
    const C = this.C;
    const H = this.H;
    let y = top;
    if (!op.hideBand) {
      if (op.logo) {
        doc.image(op.logo.buffer, g.L + (g.W - g.logoW) / 2, y, { width: g.logoW, height: g.logoH });
        y += g.logoH + 6;
      } else if (op.left.length || op.right.length) {
        const r = H.discR;
        doc.fillColor(C.accent).circle(g.L + g.W / 2, y + r, r).fill();
        doc.font(this.faces.headBold).fontSize(17).fillColor('#FFFFFF');
        doc.text(op.initials, g.L + g.W / 2 - r, y + r - 7, { width: r * 2, align: 'center', lineGap: 0 });
        y += r * 2 + 6;
      }
      for (const line of [...op.left, ...op.right]) {
        y = this.#drawLine({ ...line, align: 'center' }, g.L, y, g.W);
      }
      const ruleY = y + H.ruleGap;
      doc.strokeColor(C.hairline).lineWidth(0.8).moveTo(g.L, ruleY).lineTo(g.R, ruleY).stroke();
      y = ruleY + 0.8 + H.titleGap / 2;
    }
    y = this.#drawTitleBlock(op, g, y);
    const out = this.#drawInfo(op, g, y);
    // The closing hairline is what makes an all-centred header read as a header
    // and not as a loose title page: the sheet starts under it.
    doc.strokeColor(C.accent).lineWidth(0.8).moveTo(g.L, out - 2).lineTo(g.R, out - 2).stroke();
    return out + 3;
  }

  /** `split`: title and information left, logo and identity stacked right. */
  #drawSplitMasthead(op, g, top) {
    const doc = this.doc;
    const C = this.C;
    const H = this.H;
    const sideX = g.R - g.sideW;
    let ry = top;
    if (!op.hideBand) {
      if (op.logo) {
        doc.image(op.logo.buffer, g.R - g.logoW, ry, { width: g.logoW, height: g.logoH });
        ry += g.logoH + 6;
      } else if (op.left.length || op.right.length) {
        const r = Math.min(H.discR, 14);
        doc.fillColor(C.accent).circle(g.R - r, ry + r, r).fill();
        doc.font(this.faces.headBold).fontSize(13).fillColor('#FFFFFF');
        doc.text(op.initials, g.R - r * 2, ry + r - 5, { width: r * 2, align: 'center', lineGap: 0 });
        ry += r * 2 + 6;
      }
      for (const line of [...op.left, ...op.right]) {
        ry = this.#drawLine({ ...line, align: 'right' }, sideX, ry, g.sideW);
      }
    }
    const titleBottom = this.#drawTitleBlock(op, g, top);
    let y = Math.max(titleBottom, ry);
    if (!op.hideBand) {
      const ruleY = y + H.ruleGap;
      doc.fillColor(C.hairline).rect(g.L, ruleY, g.W, 0.8).fill();
      y = ruleY + 0.8 + H.subGap;
    }
    // The information line always belongs to the title column, never to the
    // identity stack: it is about the exam, not about the institution.
    return this.#drawInfo(op, g, Math.max(y, titleBottom));
  }

  /** `boxed` (the official paper): the whole header inside a rectangle. */
  #drawBoxedMasthead(op, g, top) {
    const doc = this.doc;
    const C = this.C;
    const H = this.H;
    const pad = g.boxPad;
    let y = top + pad;
    if (!op.hideBand) {
      y = this.#drawBandStacks(op, g, y);
      const ruleY = y + H.ruleGap;
      doc.fillColor(C.accent).rect(g.L, ruleY, g.W, H.ruleT).fill();
      // The double rule under the band is the institutional mark of an official
      // subject paper; a single hairline would read as an ordinary separator.
      doc.fillColor(C.hairline).rect(g.L, ruleY + H.ruleT + 1.4, g.W, 0.6).fill();
      y = ruleY + H.ruleT + 2 + H.titleGap;
    }
    y = this.#drawTitleBlock(op, g, y);
    doc.strokeColor(C.hairline).lineWidth(0.8).moveTo(g.L, y - 2).lineTo(g.R, y - 2).stroke();
    const inner = this.#drawInfo(op, g, y) + pad;
    // Framed last, so the box hugs what was actually laid out rather than the
    // upper bound the paginator measured.
    doc.strokeColor(C.accent).lineWidth(1.2).rect(g.pageL, top, g.pageW, inner - top).stroke();
    return inner;
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
