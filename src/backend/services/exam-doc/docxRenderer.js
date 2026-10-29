/**
 * src/backend/services/exam-doc/docxRenderer.js
 *
 * Native Word file (the `docx` library — no headless Office, no HTML-in-a-.docx
 * trick) built from the SAME normalized model as the preview and the PDF.
 *
 * Why native paragraphs/tables instead of exported HTML:
 *  - teachers must be able to edit the subject (reword an instruction, add a
 *    school logo, change a barème) in Word without breaking the layout;
 *  - real headings keep the navigation pane and screen readers working;
 *  - `Page X of Y` must be a live field, not stamped text.
 *
 * Word-side equivalents of the paper rules:
 *  - A4 page size + 2cm margins through section properties;
 *  - `keepNext` on every paragraph of a question except the last one, so Word
 *    never splits a heading away from its content;
 *  - tables for the two matching columns and for the ruled identity fields;
 *  - `PageNumber.CURRENT` / `PageNumber.TOTAL_PAGES` in the footer;
 *  - text keeps its original Unicode (no WinAnsi limitation in Word).
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HeightRule,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  SectionType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TableLayoutType,
  TextRun,
  VerticalAlignTable,
  WidthType,
} from 'docx';
import { config } from '../../config.js';
import { formatPoints, resolveImage, imageDimensions, blankStem } from './text.js';
import { HEADER_INK, examHeaderParts, examIdentityParts, examInstructions } from './headerLayout.js';
import { resolveForRenderer } from './templates/index.js';

// A4 in twips (1440 twips = 1 inch): 210×297mm. These start at the historical
// Classique page and are re-derived from the resolved template in
// `applyDocxTheme`, so the Word sheet really has the margins, the page size and
// the number of columns of the PDF it is exported next to.
let PAGE_W = 11906;
let PAGE_H = 16838;
let MARGINS = { top: 1134, right: 1134, bottom: 1134, left: 1134 }; // 2 cm
let CONTENT_W = PAGE_W - MARGINS.left - MARGINS.right;
// Word images are sized in pixels at 96 dpi.
let CONTENT_PX = Math.round((CONTENT_W / 1440) * 96);
let COLUMNS = 1;
let GUTTER = 360; // twips between two columns
let DENSITY = 1; // the vertical tightness the template asks for
// Distance of the running header/footer from the page edge. Word keeps the
// band at a FIXED distance and lets it grow INTO the text area, so a tight
// bottom margin (Ultra: 24 pt) would print "Page 1 / 2" over the last
// question. It is the historical 708 twips (0.49") as long as the margin can
// host the band, and shrinks with the margin below that.
let EDGE = { header: 708, footer: 708 };

// Half-point sizes and Office (no-'#') colours. They start at the historical
// Classique values and are re-derived from the resolved template in
// `applyDocxTheme`, so the Word sheet reads the same model as the PDF.
let BODY = 24; // half-points → 12pt
let SMALL = 20; // 10pt
let TINY = 18;
let ANSWER_STYLE = 'classic'; // 'classic' | 'inline' (student answer layout)
let HEADER_VARIANT = 'bandeau'; // header LAYOUT (see `PdfLayout` masthead variants)

const FONT = 'Times New Roman';
const HEAD_FONT = 'Calibri'; // the masthead reads as a different register, as in the PDF
const MARKER = { radio: '○', checkbox: '□' };

// Same accent and same neutrals as the PDF, taken from `headerLayout` so the
// Word sheet cannot drift from the printed one. Office colours carry no '#'.
let ACCENT = HEADER_INK.accentHex;
let MUTED = HEADER_INK.mutedHex;
let HAIRLINE = HEADER_INK.hairlineHex;
let FIELD_BG = HEADER_INK.fieldBgHex;

// Typography of each masthead line, keyed by the role `headerLayout` names it.
// Sizes are half-points, i.e. twice the pt the PDF uses for the same line.
let MASTHEAD_RUN = buildMastheadRun();
function buildMastheadRun() {
  return {
    school: { bold: true, size: 28, color: ACCENT, font: HEAD_FONT },
    programme: { size: 20, color: MUTED, font: HEAD_FONT },
    institution: { size: 17, color: MUTED, font: HEAD_FONT },
    year: { size: 20, color: MUTED, font: HEAD_FONT },
    session: { size: 18, color: MUTED, font: HEAD_FONT },
  };
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER };
let DOTTED_RULE = { style: BorderStyle.DOTTED, size: 6, color: MUTED };

const noHash = (hex) => String(hex).replace('#', '').toUpperCase();

/**
 * Point the module colours/sizes/page geometry at a resolved template config. The whole
 * `DocxBuilder.build` is synchronous (the only `await` is `Packer.toBuffer`,
 * after the children tree already exists), so reassigning these module bindings
 * around the build is race-free: no other render interleaves during it.
 */
function applyDocxTheme(cfg) {
  const S = cfg.theme.sizes;
  const C = cfg.theme.colors;
  BODY = Math.round(S.body * 2);
  SMALL = Math.round(S.small * 2);
  TINY = Math.round(S.tiny * 2);
  // Page geometry: points → twips is ×20. The same `cfg` the PDF paginates with
  // decides the Word margins, columns and vertical spacing, so a 2-column
  // compact paper is a 2-column compact paper in every format.
  const pt = (v) => Math.round((Number(v) || 0) * 20);
  PAGE_W = pt(cfg.pageW);
  PAGE_H = pt(cfg.pageH);
  // The engine reserves `footerH` BELOW the template margin for the running
  // footer (`usableH = pageH - top - bottom - footerH`), so Word has to reserve
  // the same strip: without it the last line of a tight paper is written under
  // the "Page 1 / 2" band, which is exactly the overlap the PDF cannot have.
  const footerH = Number(cfg.footerH) || 0;
  MARGINS = {
    top: pt(cfg.margin.top),
    right: pt(cfg.margin.right),
    bottom: pt((Number(cfg.margin.bottom) || 0) + footerH),
    left: pt(cfg.margin.left),
  };
  CONTENT_W = PAGE_W - MARGINS.left - MARGINS.right;
  CONTENT_PX = Math.round((CONTENT_W / 1440) * 96);
  COLUMNS = cfg.page.columns > 1 ? 2 : 1;
  GUTTER = pt(cfg.page.gutter);
  DENSITY = cfg.theme.density ?? 1;
  // The bands sit where the PDF draws them: 8 pt under the template's own
  // margin line, and the historical 708 twips whenever the margin is wide
  // enough to host them without touching the text.
  EDGE = {
    header: MARGINS.top >= 908 ? 708 : Math.max(115, Math.round(MARGINS.top * 0.4)),
    footer: Math.min(708, Math.max(115, pt(Math.max(0, (Number(cfg.margin.bottom) || 0) - 8)))),
  };
  ACCENT = noHash(C.accent);
  MUTED = noHash(C.muted);
  HAIRLINE = noHash(C.hairline);
  FIELD_BG = noHash(C.fieldBg);
  MASTHEAD_RUN = buildMastheadRun();
  DOTTED_RULE = { style: BorderStyle.DOTTED, size: 6, color: MUTED };
  ANSWER_STYLE = cfg.question?.answerStyle === 'inline' ? 'inline' : 'classic';
  // WHERE the header elements sit. `officiel` is the historical name of the
  // framed `boxed` layout, so a template saved with it keeps the frame here too
  // (the exact alias the PDF drawer uses).
  HEADER_VARIANT = (() => {
    const v = cfg.header?.variant || 'bandeau';
    return v === 'officiel' ? 'boxed' : v;
  })();
}

const run = (text, opts = {}) =>
  new TextRun({
    text,
    font: opts.font || FONT,
    size: opts.size ?? BODY,
    bold: !!opts.bold,
    italics: !!opts.italics,
    color: opts.color || '000000',
    keepNext: !!opts.keepNext,
    keepLines: !!opts.keepLines,
    ...(opts.break ? { break: opts.break } : {}),
  });

function para(children, opts = {}) {
  const kids = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return new Paragraph({
    children: kids,
    alignment: opts.align,
    heading: opts.heading,
    keepNext: opts.keepNext,
    keepLines: opts.keepLines,
    pageBreakBefore: opts.pageBreakBefore,
    numbering: opts.numbering,
    indent: opts.indent ? { left: opts.indent } : undefined,
    tabStops: opts.rightTab
      ? [{ type: TabStopType.RIGHT, position: CONTENT_W }]
      : undefined,
    shading: opts.shading
      ? { type: ShadingType.CLEAR, fill: opts.shading, color: 'auto' }
      : undefined,
    border: opts.border,
    spacing: {
      // `density` is the template's vertical tightness lever, applied to the
      // Word sheet exactly as the layout engine applies it to the PDF (1.0 for
      // Classique keeps every value byte-identical).
      before: Math.round((opts.spaceBefore ?? 0) * DENSITY),
      after: Math.round((opts.spaceAfter ?? 80) * DENSITY),
      line: Math.round((opts.line ?? 276) * DENSITY),
    },
  });
}

const blankRule = ({ spaceAfter = 160 } = {}) =>
  para([run(' ')], {
    spaceAfter,
    keepNext: true,
    border: { bottom: { style: BorderStyle.DOTTED, size: 6, color: '404040', space: 1 } },
  });

class DocxBuilder {
  constructor(ctx) {
    this.ctx = ctx;
  }

  imageElement(ref, { maxWPx, maxHPx, align }) {
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
    const dims = imageDimensions(resolved.buffer, resolved.format);
    if (!dims) {
      this.ctx.warn({ type: 'image-skipped', message: `Dimensions illisibles pour l’image : ${src.slice(0, 90)}` });
      return null;
    }
    const k = Math.min(maxWPx / dims.width, maxHPx / dims.height, 1);
    try {
      return new ImageRun({
        type: resolved.format === 'png' ? 'png' : 'jpg',
        data: resolved.buffer,
        transformation: {
          width: Math.max(1, Math.round(dims.width * k)),
          height: Math.max(1, Math.round(dims.height * k)),
        },
      });
    } catch (_) {
      this.ctx.warn({ type: 'image-skipped', message: `Image non insérable dans le fichier Word : ${src.slice(0, 90)}` });
      return null;
    }
  }

  /**
   * Masthead band → rule → title → information line, in the order and wording
   * `headerLayout` defines (the PDF draws the same list). Word has no absolute
   * positioning, so every PDF layout is mirrored with borderless tables: the
   * band stays a one-row logo/left/right table, `split` stands the identity
   * BESIDE the title, `boxed` frames the whole header in one bordered cell,
   * `banner` reverses the title out on a filled bar, and `classique`/`centre`/
   * `minimal` move the alignment and the rule. Same sheet, still editable Word.
   */
  headerChildren(model) {
    const parts = examHeaderParts(model);
    if (!parts.enabled) return []; // teacher switch: no printed header at all
    const variant = HEADER_VARIANT;

    const leftLines = parts.left.filter((line) => line.text);
    const rightLines = parts.right.filter((line) => line.text);
    const logo = this.imageElement(parts.logo, {
      maxWPx: 130,
      maxHPx: Math.round(52 * parts.logoScale * (96 / 72)), // pt → px at 96 dpi
    });

    // `classique`/`split` print the title LEFT, every other layout centres it.
    const titleAlign =
      variant === 'classique' || variant === 'split' ? AlignmentType.LEFT : AlignmentType.CENTER;
    const stack = (lines, align) =>
      lines.map((line, i) =>
        para([run(line.text, MASTHEAD_RUN[line.role])], {
          align,
          spaceBefore: i === 0 ? 0 : 20,
          spaceAfter: 0,
          keepNext: true,
        }),
      );
    // `centre` stacks the band on the axis, `split` right-aligns it beside the
    // title; `bandeau`/`classique`/`boxed` keep the school left, the year right.
    const sideAlign =
      variant === 'centre' ? AlignmentType.CENTER : variant === 'split' ? AlignmentType.RIGHT : undefined;

    const titleBlock = (align = titleAlign) => {
      if (variant === 'banner') {
        // One filled bar: title, label and information on the accent background.
        const runs = [run(parts.title, { bold: true, size: 28, color: 'FFFFFF', font: HEAD_FONT })];
        if (parts.tag) runs.push(run(parts.tag, { bold: true, size: TINY, color: 'E8EDF3', font: HEAD_FONT, break: 1 }));
        if (parts.info.length) runs.push(run(parts.info.join(`   ${'·'}   `), { size: SMALL, color: 'E8EDF3', font: HEAD_FONT, break: 1 }));
        return [para(runs, { align: AlignmentType.CENTER, shading: ACCENT, spaceBefore: 20, spaceAfter: 120, keepNext: true })];
      }
      const out = [
        para([run(parts.title, { bold: true, size: 30, color: ACCENT, font: HEAD_FONT })], {
          align,
          spaceAfter: parts.tag ? 40 : 60,
          keepNext: true,
        }),
      ];
      if (parts.tag) {
        out.push(
          para([run(parts.tag, { bold: true, size: TINY, color: MUTED, font: HEAD_FONT })], {
            align,
            spaceAfter: 60,
            keepNext: true,
          }),
        );
      }
      if (parts.info.length) {
        out.push(
          para([run(parts.info.join(`   ${'·'}   `), { size: SMALL, color: MUTED, font: HEAD_FONT })], {
            align,
            spaceAfter: 120,
            keepNext: true,
          }),
        );
      }
      return out;
    };

    // The rule that closes the band. `minimal` needs none (the bar or the tight
    // title does the separating), `banner` skips it because the filled bar comes
    // right after, `boxed` doubles it like the framed PDF header, and only
    // `bandeau` keeps the thick accent stroke.
    const bandRule = () => {
      if (variant === 'minimal' || variant === 'banner') return null;
      const bottom =
        variant === 'boxed'
          ? { style: BorderStyle.DOUBLE, size: 6, color: ACCENT, space: 1 }
          : variant === 'bandeau'
            ? { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 1 }
            : { style: BorderStyle.SINGLE, size: 6, color: HAIRLINE, space: 1 };
      return para([run(' ', { size: 4 })], {
        spaceBefore: 20,
        spaceAfter: 100,
        keepNext: true,
        border: { bottom },
      });
    };

    const cells = [];
    if (logo) {
      cells.push(
        new TableCell({
          width: { size: 18, type: WidthType.PERCENTAGE },
          borders: NO_BORDERS,
          verticalAlign: VerticalAlignTable.CENTER,
          children: [para([logo], { align: sideAlign, spaceAfter: 0 })],
        }),
      );
    }
    cells.push(
      new TableCell({
        width: { size: logo ? 54 : 72, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        children: stack(leftLines, sideAlign),
      }),
    );
    cells.push(
      new TableCell({
        width: { size: 28, type: WidthType.PERCENTAGE },
        borders: NO_BORDERS,
        children: stack(rightLines, AlignmentType.RIGHT),
      }),
    );

    const out = [];
    if (variant === 'split' && parts.band) {
      // Title and information on the left, logo and identity stacked right — the
      // Word mirror of `#drawSplitMasthead`.
      const side = [];
      if (logo) side.push(para([logo], { align: AlignmentType.RIGHT, spaceAfter: 40, keepNext: true }));
      side.push(...stack(leftLines, AlignmentType.RIGHT), ...stack(rightLines, AlignmentType.RIGHT));
      out.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 62, type: WidthType.PERCENTAGE },
                  borders: NO_BORDERS,
                  children: titleBlock(AlignmentType.LEFT),
                }),
                new TableCell({
                  width: { size: 38, type: WidthType.PERCENTAGE },
                  borders: NO_BORDERS,
                  children: side,
                }),
              ],
            }),
          ],
        }),
      );
      out.push(
        para([run(' ', { size: 4 })], {
          spaceBefore: 40,
          spaceAfter: 120,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: HAIRLINE, space: 1 } },
        }),
      );
    } else {
      if (parts.band) {
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            rows: [new TableRow({ children: cells })],
          }),
        );
        const rule = bandRule();
        if (rule) out.push(rule);
      }
      out.push(...titleBlock());
    }
    if (variant === 'centre') {
      // The centred header closes the title block with a thin rule, as drawn on
      // the axis by `#drawCentreMasthead`.
      out.push(
        para([run(' ', { size: 4 })], {
          spaceBefore: 0,
          spaceAfter: 100,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: HAIRLINE, space: 1 } },
        }),
      );
    }
    if (variant === 'boxed') {
      // The framed official-paper look: one rectangle around the whole header.
      const inner = out.splice(0, out.length);
      const box = { style: BorderStyle.SINGLE, size: 8, color: ACCENT };
      out.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  borders: { top: box, bottom: box, left: box, right: box },
                  children: inner,
                }),
              ],
            }),
          ],
        }),
      );
      out.push(para([run(' ', { size: 4 })], { spaceBefore: 0, spaceAfter: 120 }));
    }
    // The grade is printed on the confidential key only: on the student paper
    // the note box has to stay empty (same rule as the PDF renderer).
    if (model.meta.document === 'answer_key') {
      out.push(
        para([run(`Note : ${model.scoring.label}`, { bold: true })], {
          align: AlignmentType.CENTER,
          spaceAfter: 60,
          keepNext: true,
        }),
      );
    }
    return out;
  }

  /**
   * Fill-in area under the title, then the closing hairline — the Word mirror of
   * the PDF `identity` op plus the rule that ends the header block.
   */
  identityChildren(model) {
    const { rows, showNote, noteLabel, noteSuffix } = examIdentityParts(model);
    const out = [];
    if (rows.length || showNote) out.push(this.identityTable({ rows, showNote, noteLabel, noteSuffix }));
    const instructions = examInstructions(model);
    if (instructions) {
      const line = { style: BorderStyle.SINGLE, size: 4, color: HAIRLINE, space: 2 };
      out.push(
        para([run(instructions, { size: SMALL })], {
          spaceBefore: 120,
          spaceAfter: 120,
          keepNext: true,
          border: { top: line, bottom: line, left: line, right: line },
        }),
      );
    }
    out.push(
      para([run(' ', { size: 2 })], {
        spaceBefore: 40,
        spaceAfter: 120,
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 1 } },
      }),
    );
    return out;
  }

  /**
   * Identity fields on a light plate, grade in a dedicated box next to them.
   * Word has no rounded rectangle, so the plate is a nested table (one row per
   * field line, dotted bottom border = the rule the student writes on) inside a
   * borderless wrapper cell. No vertical merges: Word and LibreOffice both
   * render this reliably.
   */
  identityTable({ rows, showNote, noteLabel, noteSuffix }) {
    const cols = rows.reduce((max, row) => Math.max(max, row.length), 2);
    const fieldRows = rows.map((row) => {
      let used = 0;
      const cells = row.map((label, index) => {
        const last = index === row.length - 1;
        const span = last ? cols - used : 1;
        used += span;
        return new TableCell({
          ...(span > 1 ? { columnSpan: span } : {}),
          width: { size: (100 / cols) * span, type: WidthType.PERCENTAGE },
          borders: { ...NO_BORDERS, bottom: DOTTED_RULE },
          shading: { type: ShadingType.CLEAR, fill: FIELD_BG, color: 'auto' },
          margins: { top: 60, bottom: 110, left: 100, right: 140 },
          children: [para([run(label, { size: SMALL, font: HEAD_FONT })], { spaceAfter: 0 })],
        });
      });
      return new TableRow({ children: cells });
    });

    const cells = [];
    if (rows.length) {
      cells.push(
        new TableCell({
          width: { size: showNote ? 72 : 100, type: WidthType.PERCENTAGE },
          borders: NO_BORDERS,
          // A table cell may not end on a nested table: the hairline paragraph
          // closes it, and doubles as the gap under the last field.
          children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              layout: TableLayoutType.FIXED,
              rows: fieldRows,
            }),
            para([run(' ', { size: 2 })], { spaceAfter: 0 }),
          ],
        }),
      );
    }
    if (showNote) {
      const box = { style: BorderStyle.SINGLE, size: 12, color: ACCENT };
      cells.push(
        new TableCell({
          width: { size: rows.length ? 28 : 100, type: WidthType.PERCENTAGE },
          borders: { top: box, bottom: box, left: box, right: box },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            para([run(noteLabel, { size: TINY, color: MUTED, font: HEAD_FONT })], { spaceAfter: 0 }),
            para([run(' ', { size: 16 })], { spaceAfter: 0 }),
            para([run(noteSuffix, { bold: true, size: 26, color: ACCENT, font: HEAD_FONT })], {
              align: AlignmentType.RIGHT,
              spaceAfter: 0,
            }),
          ],
        }),
      );
    }
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [new TableRow({ height: { value: 1150, rule: HeightRule.ATLEAST }, children: cells })],
    });
  }

  blockChildren(item, isKey = false) {
    const block = item.block;
    const out = [];
    const tail = () => true;
    const inline = ANSWER_STYLE === 'inline';
    const inlineTailored = inline && (block.kind === 'pairs' || block.kind === 'sequence'
      || (block.kind === 'blanks' && Array.isArray(block.bank) && block.bank.length));
    if (block.instruction && !inlineTailored) {
      out.push(
        para([run(block.instruction, { size: SMALL, italics: true })], {
          spaceAfter: 60,
          keepNext: tail(),
        }),
      );
    }

    switch (block.kind) {
      case 'options': {
        const marker = MARKER[block.marker] || MARKER.checkbox;
        block.options.forEach((option, i) => {
          const isLast = i === block.options.length - 1;
          const kids = [run(`${marker} ${option.letter}. `, { bold: true }), run(option.text || '(image)')];
          const img = this.imageElement(option.image, { maxWPx: 120, maxHPx: 62 });
          if (img) kids.push(run('', { break: 1 }), img);
          out.push(
            para(kids, {
              indent: 284,
              spaceAfter: isLast ? 100 : 40,
              keepNext: isLast ? false : tail(),
            }),
          );
        });
        break;
      }
      case 'blanks': {
        // The sentence only carries the numbered gap; the student writes each
        // answer on the matching numbered line of this "Réponses" block. The
        // confidential key skips it — its answers are listed, already numbered.
        if (isKey) break;
        if (inline && Array.isArray(block.bank) && block.bank.length) {
          // Inline: numbered option bank ("1. word  2. word …", the number in
          // bold); the student writes the option number in each `(n)` gap of
          // the sentence, so there are no answer lines here.
          out.push(para([run("Complétez : dans chaque espace, écrivez le numéro de l'option qui convient.", { size: SMALL, italics: true })], { spaceAfter: 40, keepNext: true }));
          const bankRuns = [];
          block.bank.forEach((w, i) => {
            if (i) bankRuns.push(run('    ', { size: SMALL }));
            bankRuns.push(run(`${i + 1}.`, { bold: true, size: SMALL }), run(`\u00a0${w}`, { size: SMALL }));
          });
          out.push(para([run('Options : ', { bold: true, size: SMALL }), ...bankRuns], { indent: 284, spaceAfter: 80 }));
          break;
        }
        const total = block.blanks || 1;
        out.push(para([run('Réponses :', { bold: true, size: SMALL })], { spaceAfter: 40, keepNext: true }));
        for (let i = 1; i <= total; i++) {
          out.push(
            para([run(`${i}. `, { bold: true }), run(' ', { size: SMALL })], {
              spaceAfter: i === total ? 100 : 60,
              keepNext: i < total,
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '404040', space: 2 } },
            }),
          );
        }
        break;
      }
      case 'sequence': {
        // Inline: each option carries a `[   ]` box to write the rank; the
        // numbered writing lines underneath are dropped (the box is the answer).
        if (inline) {
          out.push(para([run("Rangez : écrivez dans chaque case le numéro d'ordre correspondant (1 = premier).", { size: SMALL, italics: true })], { spaceAfter: 40, keepNext: true }));
          block.pool.forEach((option, i) => {
            const isLast = i === block.pool.length - 1;
            const kids = [run('[      ]   ', { bold: true }), run(`${option.letter}. ${option.text || '(image)'}`)];
            const img = this.imageElement(option.image, { maxWPx: 100, maxHPx: 55 });
            if (img) kids.push(run('', { break: 1 }), img);
            out.push(para(kids, { indent: 284, spaceAfter: isLast ? 80 : 40, keepNext: !isLast }));
          });
          break;
        }
        // One element per line, as in the PDF: glued into a single paragraph,
        // "A. … B. … C. …" is unreadable and the student cannot tell where an
        // item stops.
        if (block.pool.length) {
          out.push(para([run('Éléments à placer :', { size: SMALL })], { spaceAfter: 40, keepNext: true }));
          block.pool.forEach((option, i) => {
            out.push(
              para([run(`${option.letter}. ${option.text || '(image)'}`, { size: SMALL })], {
                indent: 284,
                spaceAfter: i === block.pool.length - 1 ? 60 : 20,
                keepNext: true,
              }),
            );
          });
        }
        for (const option of block.pool) {
          const img = this.imageElement(option.image, { maxWPx: 100, maxHPx: 55 });
          if (img) out.push(para([img], { spaceAfter: 60, keepNext: true }));
        }
        // Real Word numbered list: the student writes next to 1., 2., 3.
        for (let i = 0; i < (block.slots || 1); i++) {
          out.push(
            para([run(' ')], {
              numbering: { reference: 'ed-sequence', level: 0 },
              spaceAfter: 120,
              keepNext: i + 1 < (block.slots || 1),
              border: { bottom: { style: BorderStyle.DOTTED, size: 6, color: '404040', space: 1 } },
            }),
          );
        }
        break;
      }
      case 'pairs': {
        // Inline: the two lists print one after the other (no table, no column
        // headers), then the answer grid records the pairs. The grid is TWO ROWS
        // × N columns — the numbers on top, one empty cell under each to write
        // its letter — the same surface the PDF and the preview draw.
        if (inline) {
          out.push(para([run('Associez : dans la grille, écrivez la lettre qui correspond à chaque numéro.', { size: SMALL, italics: true })], { spaceAfter: 40, keepNext: true }));
          block.lefts.forEach((l, i) => out.push(para([run(`${l.n}. ${l.text}`)], { spaceAfter: i === block.lefts.length - 1 ? 60 : 20, keepNext: true })));
          (block.rights || []).forEach((r, i, arr) => out.push(para([run(`${r.letter}. ${r.text}`)], { spaceAfter: i === arr.length - 1 ? 60 : 20, keepNext: true })));
          const count = Math.max(1, block.lefts.length, (block.rights || []).length);
          const cellPct = 100 / count;
          const gridCell = (label, opts = {}) => new TableCell({
            width: { size: cellPct, type: WidthType.PERCENTAGE },
            borders: boxBorders(),
            margins: { top: opts.tall ? 150 : 40, bottom: opts.tall ? 150 : 40, left: 40, right: 40 },
            children: [para([run(label, { bold: !!opts.head, size: SMALL })], { align: AlignmentType.CENTER, spaceAfter: 0 })],
          });
          const gridRows = [
            new TableRow({
              tableHeader: true,
              children: Array.from({ length: count }, (_, i) => gridCell(String(block.lefts[i]?.n ?? i + 1), { head: true })),
            }),
            new TableRow({
              children: Array.from({ length: count }, () => gridCell('', { tall: true })),
            }),
          ];
          out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, rows: gridRows }));
          break;
        }
        // Two content columns plus a narrow answer column, exactly like the PDF:
        // without a place to write the letter, the table asks for a connection
        // the student has nowhere to note down.
        const COL_W = [37, 38, 25];
        const headCell = (label, width, align) =>
          new TableCell({
            width: { size: width, type: WidthType.PERCENTAGE },
            borders: boxBorders(),
            shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
            margins: { top: 60, bottom: 60, left: 80, right: 80 },
            children: [para([run(label, { bold: true, size: SMALL })], { align, spaceAfter: 0 })],
          });
        const rows = [
          new TableRow({
            tableHeader: true,
            children: [
              headCell('Colonne A', COL_W[0]),
              headCell('Colonne B', COL_W[1]),
              headCell('Réponse', COL_W[2], AlignmentType.CENTER),
            ],
          }),
        ];
        const n = Math.max(block.lefts.length, (block.rights || []).length);
        for (let i = 0; i < n; i++) {
          const left = block.lefts[i];
          const right = block.rights[i];
          rows.push(
            new TableRow({
              children: [
                left ? `${left.n}. ${left.text}` : '',
                right ? `${right.letter}. ${right.text}` : '',
                '', // the student writes the letter here
              ].map((value, column) =>
                new TableCell({
                  width: { size: COL_W[column], type: WidthType.PERCENTAGE },
                  borders: boxBorders(),
                  margins: { top: 60, bottom: 60, left: 80, right: 80 },
                  children: [para([run(value)], { spaceAfter: 0 })],
                }),
              ),
            }),
          );
        }
        out.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            rows,
          }),
        );
        out.push(para([run(' ')], { spaceAfter: 40 }));
        break;
      }
      case 'code':
        if (block.snippet) {
          const lines = String(block.snippet).split('\n');
          out.push(
            ...lines.map((line, i) =>
              para([run(line.replace(/\t/g, '    ') || ' ')], {
                spaceAfter: i === lines.length - 1 ? 100 : 0,
                keepNext: i < lines.length - 1,
                shading: 'F7F7F7',
                border: {
                  left: { style: BorderStyle.SINGLE, size: 6, color: '808080', space: 4 },
                  top: i === 0 ? { style: BorderStyle.SINGLE, size: 6, color: '808080', space: 2 } : undefined,
                  bottom:
                    i === lines.length - 1
                      ? { style: BorderStyle.SINGLE, size: 6, color: '808080', space: 2 }
                      : undefined,
                  right: { style: BorderStyle.SINGLE, size: 6, color: '808080', space: 4 },
                },
              }),
            ),
          );
        }
        (block.options || []).forEach((option, i, arr) => {
          out.push(
            para([run(`${MARKER.radio} ${option.letter}. `, { bold: true }), run(option.text)], {
              indent: 284,
              spaceAfter: i === arr.length - 1 ? 100 : 40,
              keepNext: i !== arr.length - 1,
            }),
          );
        });
        break;
      default:
        break;
    }
    return out;
  }

  answerKeyChildren(item) {
    const entries = item.answer?.entries || [];
    const kids = [run('Réponse', { bold: true, size: SMALL })];
    if (entries.length) {
      kids.push(run(`  ${entries.join('   ')}`));
    } else {
      kids.push(run('  À compléter par l’enseignant', { italics: true, size: SMALL }));
    }
    const out = [
      para(kids, {
        spaceBefore: 80,
        spaceAfter: item.feedback?.length ? 20 : 100,
        shading: 'F2F2F2',
        keepNext: !!item.feedback?.length || !!item.answer?.missing,
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: '808080', space: 4 } },
      }),
    ];
    for (const fb of item.feedback || []) {
      out.push(
        para([run(`${fb.label} : `, { bold: true, size: SMALL }), run(fb.text, { size: SMALL })], {
          spaceAfter: 40,
          shading: 'F2F2F2',
          keepNext: true,
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: '808080', space: 4 } },
        }),
      );
    }
    if (item.answer?.missing) {
      out.push(
        para([run('Réponse manquante — à vérifier avant distribution.', { italics: true, size: SMALL })], {
          spaceAfter: 100,
          shading: 'F2F2F2',
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: '808080', space: 4 } },
        }),
      );
    }
    return out;
  }

  questionChildren(item, model) {
    const isKey = model.meta.document === 'answer_key';
    const out = [];
    out.push(
      para(
        [
          run(`Question ${item.number}`),
          run(`\t${formatPoints(item.points)} pt${Number(item.points) === 1 ? '' : 's'}`, { bold: false, size: SMALL }),
        ],
        { heading: HeadingLevel.HEADING_3, rightTab: true, keepNext: true, spaceBefore: 120, spaceAfter: 60 },
      ),
    );
    out.push(
      // The inline surface writes the option number inside the space itself, so
      // its gaps stay plain rules — exactly what the PDF traces (see `blankStem`).
      // The answer key always keeps the numbered gaps: its answers are listed.
      para([run(blankStem(item.block, { inline: !isKey && ANSWER_STYLE === 'inline' }))], {
        spaceAfter: 60,
        keepNext: true,
      }),
    );
    const media = this.imageElement(item.block.media, { maxWPx: Math.round(CONTENT_PX * 0.7), maxHPx: 190 });
    if (media) out.push(para([media], { spaceAfter: 80, keepNext: true }));

    out.push(...this.blockChildren(item, isKey));

    if (!isKey) {
      const lines = writingLines(item);
      for (let i = 0; i < lines; i++) out.push(blankRule({ spaceAfter: i === lines - 1 ? 120 : 160 }));
    } else {
      out.push(...this.answerKeyChildren(item));
    }
    return out;
  }

  sectionChildren(section, model) {
    const out = [];
    if (section.title) {
      out.push(
        para(
          [
            run(section.title),
            run(`   (${formatPoints(section.subtotal)} pts)`, { size: SMALL }),
          ],
          { heading: HeadingLevel.HEADING_2, spaceBefore: 160, spaceAfter: 80, keepNext: true },
        ),
      );
    }
    for (const item of section.items) out.push(...this.questionChildren(item, model));
    return out;
  }

  warningsChildren(model) {
    if (model.meta.document !== 'answer_key' || !model.warnings.length) return [];
    const out = [
      para([run('Points à revoir', { bold: true, size: SMALL })], {
        heading: HeadingLevel.HEADING_2,
        spaceBefore: 200,
        spaceAfter: 60,
        keepNext: true,
      }),
    ];
    for (const w of model.warnings) {
      out.push(para([run(`- ${w.message || w.type}`, { size: SMALL })], { spaceAfter: 20, indent: 200 }));
    }
    return out;
  }

  footerChildren(model) {
    // Only the normalization disclosure is printed at the bottom; the barème
    // total and the "Fin du sujet" closing were removed at the teacher's request.
    const out = [];
    if (model.header.scaleNote) {
      out.push(para([run(model.header.scaleNote, { italics: true, size: TINY })], { align: AlignmentType.CENTER, spaceBefore: 120, spaceAfter: 60 }));
    }
    return out;
  }

  bodyChildren(model) {
    const children = [];
    for (const section of model.sections) children.push(...this.sectionChildren(section, model));
    children.push(...this.warningsChildren(model));
    children.push(...this.footerChildren(model));
    return children;
  }

  /**
   * Split into `[header, body]`. On a one-column paper the answer sheet is a
   * single group (nothing has to be separated yet), so the historical byte-for-byte
   * one-section file is kept exactly as it was. On a two-column paper the header
   * must NOT flow into the columns — Word would squeeze the masthead and the
   * identity block into the left half of the first column while the questions
   * started at the top of the right one — so it returns the header alone and the
   * body alone, and `renderExamDocumentDocx` wraps them in two sections whose
   * break is `continuous`, which is Word's mirror of the engine's full-width
   * masthead over a two-column question flow.
   */
  build(model) {
    const head = [...this.headerChildren(model), ...this.identityChildren(model)];
    const body = this.bodyChildren(model);
    return COLUMNS > 1 ? [head, body] : [[...head, ...body]];
  }
}

function boxBorders() {
  const line = { style: BorderStyle.SINGLE, size: 4, color: '808080' };
  return { top: line, bottom: line, left: line, right: line };
}

function writingLines(item) {
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

/**
 * @param {object} model output of `ExamDocumentService#buildExamDocument`
 * @param {object} [options] { uploadsDir, template }
 * @returns {Promise<{ buffer: Buffer, warnings: object[] }>}
 */
export async function renderExamDocumentDocx(model, options = {}) {
  // The Word sheet reads the SAME resolved template as the PDF: colours and
  // sizes come from it, so the three formats cannot drift. Without a template
  // the built-in Classique config reproduces the historical constants exactly.
  applyDocxTheme(resolveForRenderer(options));
  const warnings = [];
  const seen = new Set();
  const ctx = {
    uploadsDir: options.uploadsDir || config.uploadsDir,
    warn(entry) {
      const key = `${entry.type}:${entry.message || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      warnings.push(entry);
    },
  };

  const isKey = model.meta.document === 'answer_key';
  const groups = new DocxBuilder(ctx).build(model);
  // One entry per group: the paper is either a single section or, on two
  // columns, a full-width header section followed by the columned body.
  const pageHeader = () =>
    new Header({
      children: [
        para(
          [
            run(isKey ? `CORRIGÉ — ${model.meta.examName} — confidentiel` : model.header.schoolName || model.meta.examName, {
              size: TINY,
            }),
          ],
          { align: isKey ? AlignmentType.CENTER : AlignmentType.RIGHT, spaceAfter: 0 },
        ),
      ],
    });
  const pageFooter = () =>
    new Footer({
      children: [
        new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
          children: [
            new TextRun({ text: 'Page ', font: FONT, size: TINY, color: '000000' }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: TINY, color: '000000' }),
            new TextRun({ text: ' / ', font: FONT, size: TINY, color: '000000' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: TINY, color: '000000' }),
            new TextRun({
              text: `\t${isKey ? `${model.meta.examName} — confidentiel` : model.meta.examName}`,
              font: FONT,
              size: TINY,
              color: '000000',
            }),
          ],
        }),
      ],
    });

  const doc = new Document({
    creator: model.header.teacherName || 'Quiz App',
    title: `${isKey ? 'Corrigé' : 'Sujet'} — ${model.meta.examName}`,
    subject: model.header.subject || model.meta.examName,
    description: model.header.scaleNote || `Document généré depuis l’examen « ${model.meta.examName} »`,
    numbering: {
      config: [
        {
          reference: 'ed-sequence',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 340, hanging: 340 } } },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY, color: '000000' } },
        heading1: {
          run: { font: FONT, size: 30, bold: true, color: '000000' },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 120 } },
        },
        heading2: {
          run: { font: FONT, size: BODY, bold: true, color: '000000' },
          paragraph: { spacing: { before: 160, after: 80 } },
        },
        heading3: {
          run: { font: FONT, size: BODY, bold: true, color: '000000' },
          paragraph: { spacing: { before: 120, after: 60 } },
        },
      },
    },
    sections: groups.map((children, index) => ({
      properties: {
        page: {
          size: { width: PAGE_W, height: PAGE_H },
          margin: { ...MARGINS, ...EDGE, gutter: 0 },
        },
        // The header group keeps the page width to itself; the columns start
        // with the questions, exactly as the engine opens both columns under a
        // full-width masthead. `continuous` on BOTH groups is what stops the
        // break between them from turning into a page break: the readers disagree
        // on which `w:sectPr` owns a break's type (the one that ends the previous
        // section or the one that opens the next), so the split is declared
        // continuous from both sides and Word/LibreOffice cannot add a sheet.
        ...(groups.length > 1 && index === 0
          ? { type: SectionType.CONTINUOUS, column: { count: 1, separate: false } }
          : {
              ...(groups.length > 1 ? { type: SectionType.CONTINUOUS } : {}),
              ...(COLUMNS > 1
                ? { column: { count: COLUMNS, space: GUTTER, equalWidth: true, separate: false } }
                : {}),
            }),
      },
      headers: {
        default: pageHeader(),
      },
      footers: {
        default: pageFooter(),
      },
      children,
    })),
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer: Buffer.from(buffer), warnings };
}
