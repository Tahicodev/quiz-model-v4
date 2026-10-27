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
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from 'docx';
import { config } from '../../config.js';
import { EXAM_DOC_TARGET_SCORE } from '../../../shared/schemas/examDocument.schema.js';
import { formatPoints, resolveImage, imageDimensions } from './text.js';

// A4 in twips (1440 twips = 1 inch): 210×297mm.
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1134; // 2 cm
const CONTENT_W = PAGE_W - MARGIN * 2;
// Word images are sized in pixels at 96 dpi.
const CONTENT_PX = Math.round((CONTENT_W / 1440) * 96);

const BODY = 24; // half-points → 12pt
const SMALL = 20; // 10pt
const TINY = 18;

const FONT = 'Times New Roman';
const MARKER = { radio: '○', checkbox: '□' };

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };

const run = (text, opts = {}) =>
  new TextRun({
    text,
    font: FONT,
    size: opts.size ?? BODY,
    bold: !!opts.bold,
    italics: !!opts.italics,
    color: '000000',
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
      before: opts.spaceBefore ?? 0,
      after: opts.spaceAfter ?? 80,
      line: opts.line ?? 276,
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

  headerChildren(model) {
    const { header } = model;
    const out = [];
    const push = (value, opts = {}) => {
      if (value === null || value === undefined || String(value).trim() === '') return;
      out.push(para([run(String(value), { size: opts.size ?? BODY, bold: opts.bold })], {
        align: AlignmentType.CENTER,
        spaceAfter: opts.spaceAfter ?? 60,
        keepNext: true,
      }));
    };

    push(header.ministry, { size: SMALL });
    push(header.academy, { size: SMALL, spaceAfter: 120 });

    const scale = Number(header.logoScale) || 1;
    const logo = this.imageElement(header.logoDataUrl || header.logoUrl, {
      maxWPx: Math.min(170, CONTENT_PX / 3),
      maxHPx: Math.round(50 * scale * 96 / 72),
    });
    if (logo) out.push(para([logo], { align: AlignmentType.CENTER, spaceAfter: 120, keepNext: true }));

    push(header.schoolName, { bold: true, size: 26 });
    push(header.academicYear, { size: SMALL, spaceAfter: 160 });
    push(header.title || 'Examen', { bold: true, size: 30, spaceAfter: 120 });

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
    if (meta.length) out.push(para([run(meta.join('     '), { size: SMALL })], { align: AlignmentType.CENTER, spaceAfter: 100, keepNext: true }));

    // The grade is printed on the confidential key only: on the student paper
    // the note box has to stay empty (same rule as the PDF renderer).
    if (model.meta.document === 'answer_key') {
      out.push(
        para([run(`Note : ${model.scoring.label}`, { bold: true })], {
          align: AlignmentType.CENTER,
          spaceAfter: 80,
          keepNext: true,
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000', space: 4 } },
        }),
      );
    }
    return out;
  }

  identityChildren(model) {
    if (model.meta.document !== 'student') return [];
    const { header } = model;
    const fields = [];
    if (header.studentNameField !== false) fields.push({ label: 'Nom & prénom :', w: 38 });
    if (header.studentNumberField !== false) fields.push({ label: 'N° :', w: 17 });
    if (header.showClassField !== false) fields.push({ label: 'Classe :', w: 20 });
    fields.push({ label: `Note :  / ${EXAM_DOC_TARGET_SCORE}`, w: 25 });

    const row = new TableRow({
      children: fields.map((field) =>
        new TableCell({
          width: { size: field.w, type: WidthType.PERCENTAGE },
          borders: {
            top: NO_BORDER,
            left: NO_BORDER,
            right: NO_BORDER,
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '404040' },
          },
          margins: { bottom: 120, top: 40, left: 40, right: 40 },
          children: [para([run(field.label, { size: SMALL })], { spaceAfter: 0 })],
        }),
      ),
    });

    const out = [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: 'fixed',
        rows: [row],
      }),
    ];
    if (header.instructions) {
      out.push(
        para([run('Consignes : ', { bold: true, size: SMALL }), run(header.instructions, { size: SMALL })], {
          spaceBefore: 120,
          spaceAfter: 160,
          keepNext: true,
          border: {
            top: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 },
            left: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 },
            right: { style: BorderStyle.SINGLE, size: 4, color: '808080', space: 2 },
          },
        }),
      );
    }
    return out;
  }

  blockChildren(item) {
    const block = item.block;
    const out = [];
    const tail = () => true;
    if (block.instruction) {
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
      case 'blanks':
        for (let i = 0; i < (block.blanks || 1); i++) {
          out.push(
            para([run(' ', { size: SMALL })], {
              spaceAfter: 100,
              keepNext: i + 1 < (block.blanks || 1),
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '404040', space: 2 } },
            }),
          );
        }
        break;
      case 'sequence': {
        const pool = block.pool.map((o) => `${o.letter}. ${o.text || '(image)'}`).join('     ');
        if (pool) out.push(para([run(`Éléments à placer : ${pool}`, { size: SMALL })], { spaceAfter: 100, keepNext: true }));
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
        const rows = [
          new TableRow({
            tableHeader: true,
            children: ['Colonne A', 'Colonne B'].map((label) =>
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: boxBorders(),
                shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
                margins: { top: 60, bottom: 60, left: 80, right: 80 },
                children: [para([run(label, { bold: true, size: SMALL })], { spaceAfter: 0 })],
              }),
            ),
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
              ].map((value) =>
                new TableCell({
                  width: { size: 50, type: WidthType.PERCENTAGE },
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
            layout: 'fixed',
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
      para([run(item.block.text || '(énoncé vide)')], { spaceAfter: 60, keepNext: true }),
    );
    const media = this.imageElement(item.block.media, { maxWPx: Math.round(CONTENT_PX * 0.7), maxHPx: 190 });
    if (media) out.push(para([media], { spaceAfter: 80, keepNext: true }));

    out.push(...this.blockChildren(item));

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
    const isKey = model.meta.document === 'answer_key';
    const out = [
      para(
        [
          run(
            isKey ? `Total : ${model.scoring.label}` : `Barème : ${formatPoints(model.scoring.total)} points`,
            { bold: true },
          ),
        ],
        {
          align: AlignmentType.RIGHT,
          spaceBefore: 160,
          spaceAfter: 60,
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: '808080', space: 4 } },
        },
      ),
    ];
    if (model.header.scaleNote) {
      out.push(para([run(model.header.scaleNote, { italics: true, size: TINY })], { align: AlignmentType.CENTER, spaceAfter: 60 }));
    }
    out.push(
      para(
        [run(model.meta.document === 'answer_key' ? '— Fin du corrigé —' : '— Fin du sujet —', { size: SMALL })],
        { align: AlignmentType.CENTER, spaceBefore: 120 },
      ),
    );
    return out;
  }

  build(model) {
    const children = [
      ...this.headerChildren(model),
      ...this.identityChildren(model),
    ];
    for (const section of model.sections) children.push(...this.sectionChildren(section, model));
    children.push(...this.warningsChildren(model));
    children.push(...this.footerChildren(model));
    return children;
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
 * @param {object} [options] { uploadsDir }
 * @returns {Promise<{ buffer: Buffer, warnings: object[] }>}
 */
export async function renderExamDocumentDocx(model, options = {}) {
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
  const children = new DocxBuilder(ctx).build(model);

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
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W, height: PAGE_H },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          },
        },
        headers: {
          default: new Header({
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
          }),
        },
        footers: {
          default: new Footer({
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
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return { buffer: Buffer.from(buffer), warnings };
}
