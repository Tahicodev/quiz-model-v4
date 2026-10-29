/**
 * src/backend/services/exam-doc/htmlPreview.js
 *
 * Server-rendered HTML of the SAME normalized model the PDF and DOCX use, so
 * the modal preview is the document — not the interactive quiz screen.
 *
 * Every string is escaped; every class is `ed-` prefixed so the paper keeps
 * its own typography inside the admin page (and in the print window).
 */

import { formatPoints, optionLetter, blankStem } from './text.js';
import { examHeaderParts, examIdentityParts, examInstructions } from './headerLayout.js';
import { resolveForRenderer } from './templates/index.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const MARKER = { radio: '○', checkbox: '□' };

function imgTag(src, cls) {
  const ref = String(src ?? '').trim();
  if (!ref) return '';
  const safe = /^(\/uploads\/|https?:\/\/|data:image\/)/i.test(ref);
  if (!safe) return '';
  return `<img class="${cls}" src="${escapeHtml(ref)}" alt="">`;
}

/**
 * The masthead, drawn from `examHeaderParts` — the same list the PDF and the
 * Word file print, in the same order. The template's header `variant` only
 * decides WHERE those elements sit on the sheet, and every variant below maps
 * one-to-one onto the `PdfLayout` drawer of the same name: the DOM is always
 * band → rule → title → information, and the `ed-header--*` class restyles it.
 */
function renderHeader(model, cfg) {
  const parts = examHeaderParts(model);
  if (!parts.enabled) return ''; // the teacher hid the printed header
  // `officiel` is the historical name of the framed `boxed` layout.
  const variant = cfg?.header?.variant || 'bandeau';
  const layout = variant === 'officiel' ? 'boxed' : variant;
  const scale = parts.logoScale;
  const logo = imgTag(parts.logo, 'ed-logo');
  const line = (item) => `<div class="ed-masthead-${item.role}">${escapeHtml(item.text)}</div>`;
  const left = parts.left.filter((item) => item.text).map(line).join('');
  const right = parts.right.filter((item) => item.text).map(line).join('');
  const info = parts.info
    .map((item) => `<span class="ed-meta-item">${escapeHtml(item)}</span>`)
    .join('<span class="ed-meta-sep">·</span>');

  return `
    <header class="ed-header ed-header--${layout}">
      ${parts.band ? `
      <div class="ed-masthead"${scale !== 1 ? ` style="--ed-logo-scale:${scale}"` : ''}>
        ${logo ? `<div class="ed-masthead-logo">${logo}</div>` : ''}
        <div class="ed-masthead-left">${left}</div>
        <div class="ed-masthead-right">${right}</div>
      </div>
      <div class="ed-accent-rule"></div>` : ''}
      <div class="ed-title-block">
        <h1 class="ed-title">${escapeHtml(parts.title)}</h1>
        ${parts.tag ? `<div class="ed-tag">${escapeHtml(parts.tag)}</div>` : ''}
        ${info ? `<div class="ed-meta">${info}</div>` : ''}
      </div>
      ${layout === 'centre' ? '<div class="ed-rule ed-rule--close"></div>' : ''}
    </header>`;
}

/**
 * Fill-in area (identity plate + grade box), the instruction line and the
 * closing rule: the preview counterpart of the PDF `identity` op.
 */
function renderIdentityBlock(model) {
  const { rows, showNote, noteLabel, noteSuffix } = examIdentityParts(model);
  const parts = [];
  if (rows.length || showNote) {
    const plate = rows.length
      ? `<div class="ed-id-plate">${rows
          .map(
            (row) =>
              `<div class="ed-id-row">${row
                .map((label) => `<span class="ed-id-field">${escapeHtml(label)}</span>`)
                .join('')}</div>`,
          )
          .join('')}</div>`
      : '';
    const note = showNote
      ? `<div class="ed-note-box"><span class="ed-note-label">${escapeHtml(noteLabel)}</span><span class="ed-note-max">${escapeHtml(noteSuffix)}</span></div>`
      : '';
    parts.push(`<section class="ed-identity">${plate}${note}</section>`);
  }
  const instructions = examInstructions(model);
  if (instructions) {
    // The wording comes from `headerLayout`, so the preview says exactly what
    // the paper says (including the "données aux élèves" framing on the key).
    parts.push(`<section class="ed-instructions"><p>${escapeHtml(instructions)}</p></section>`);
  }
  // The grade never appears on the subject: the student note box stays empty,
  // only the confidential key prints the total.
  if (model.meta.document === 'answer_key') {
    parts.push(`<div class="ed-score-badge">Note : <strong>${escapeHtml(model.scoring.label)}</strong></div>`);
  }
  parts.push('<div class="ed-header-close"></div>');
  return parts.join('');
}

function renderBlock(block, isKey = false, inline = false) {
  const parts = [];
  const inlineTailored = inline && (block.kind === 'pairs' || block.kind === 'sequence'
    || (block.kind === 'blanks' && Array.isArray(block.bank) && block.bank.length));
  if (block.instruction && !inlineTailored) parts.push(`<p class="ed-instruction">${escapeHtml(block.instruction)}</p>`);

  switch (block.kind) {
    case 'options':
      parts.push(
        `<ul class="ed-options">${block.options
          .map(
            (o) => `<li class="ed-option"><span class="ed-marker">${MARKER[block.marker] || '□'}</span> <span class="ed-letter">${escapeHtml(o.letter)}.</span> ${escapeHtml(o.text)}${imgTag(o.image, 'ed-option-img')}</li>`,
          )
          .join('')}</ul>`,
      );
      break;
    case 'blanks':
      // Numbered gap markers live in the sentence; the student answers on the
      // numbered lines of this "Réponses" list. The key lists the answers.
      if (isKey) break;
      if (inline && Array.isArray(block.bank) && block.bank.length) {
        // Inline: numbered option bank ("1. word  2. word …", the number in
        // bold); the student writes the option number in each `(n)` gap of
        // the sentence, so there are no answer lines here.
        parts.push(`<p class="ed-instruction">Complétez : dans chaque espace, écrivez le numéro de l'option qui convient.</p>`);
        parts.push(
          `<p class="ed-bank"><strong>Options :</strong> ${block.bank
            .map((w, i) => `<span class="ed-bank-opt"><strong>${i + 1}.</strong>&nbsp;${escapeHtml(w)}</span>`)
            .join(' ')}</p>`,
        );
        break;
      }
      parts.push(
        `<div class="ed-pool-title">Réponses :</div><ol class="ed-slots ed-blank-answers">${Array.from(
          { length: block.blanks || 1 },
          () => '<li><span class="ed-rule ed-rule-medium"></span></li>',
        ).join('')}</ol>`,
      );
      break;
    case 'sequence':
      // Inline: each option carries a `[   ]` box to write the rank; the numbered
      // writing lines underneath are dropped (the box is the answer).
      if (inline) {
        parts.push(`<p class="ed-instruction">Rangez : écrivez dans chaque case le numéro d'ordre correspondant (1 = premier).</p>`);
        parts.push(
          `<div class="ed-order-list">${(block.pool || [])
            .map(
              (o) =>
                `<div class="ed-order-item"><span class="ed-box"></span> <span class="ed-letter">${escapeHtml(o.letter)}.</span> ${escapeHtml(o.text || '(image)')}${imgTag(o.image, 'ed-option-img')}</div>`,
            )
            .join('')}</div>`,
        );
        break;
      }
      // One element per line, lettered: the same readable pool the PDF and Word
      // print, instead of a wrapped strip of chips where the letters vanish.
      if (block.pool.length) {
        parts.push(
          `<div class="ed-pool"><div class="ed-pool-title">Éléments à placer :</div>${block.pool
            .map(
              (o) =>
                `<div class="ed-pool-item"><span class="ed-letter">${escapeHtml(o.letter)}.</span> ${escapeHtml(o.text)}${imgTag(o.image, 'ed-option-img')}</div>`,
            )
            .join('')}</div>`,
        );
      }
      parts.push(
        `<ol class="ed-slots">${Array.from({ length: block.slots }, () => '<li><span class="ed-rule ed-rule-medium"></span></li>').join('')}</ol>`,
      );
      break;
    case 'pairs':
      // Inline: the two lists print one after the other (no table, no column
      // headers), then the answer grid records the pairs. The grid is TWO ROWS ×
      // N columns — the numbers on the first row, one empty cell under each for
      // its letter — the same surface the PDF and Word draw.
      if (inline) {
        const count = Math.max(1, block.lefts.length, (block.rights || []).length);
        const col = ` style="width:${(100 / count).toFixed(3)}%"`;
        parts.push(`<p class="ed-instruction">Associez : dans la grille, écrivez la lettre qui correspond à chaque numéro.</p>`);
        parts.push(
          `<div class="ed-pairs-lists"><ul class="ed-plain">${block.lefts
            .map((l) => `<li>${l.n}. ${escapeHtml(l.text)}</li>`)
            .join('')}</ul><ul class="ed-plain ed-plain-letters">${(block.rights || [])
            .map((r) => `<li>${r.letter}. ${escapeHtml(r.text)}</li>`)
            .join('')}</ul></div>`,
        );
        parts.push(
          `<table class="ed-match-grid ed-match-h"><colgroup>${Array.from({ length: count }, () => `<col${col}>`).join('')}</colgroup>` +
            `<tbody><tr class="ed-match-num">${Array.from({ length: count }, (_, i) => `<td>${block.lefts[i] ? block.lefts[i].n : i + 1}</td>`).join('')}</tr>` +
            `<tr class="ed-match-answer">${Array.from({ length: count }, () => '<td></td>').join('')}</tr></tbody></table>`,
        );
        break;
      }
      // The third column is where the student writes the letter: without it the
      // table asks for a connection with nowhere to note it down.
      parts.push(`
        <table class="ed-pairs">
          <thead><tr><th class="ed-pairs-a">Colonne A</th><th class="ed-pairs-b">Colonne B</th><th class="ed-pairs-r">Réponse</th></tr></thead>
          <tbody>
            ${Array.from({ length: Math.max(block.lefts.length, block.rights.length) }, (_, i) => {
              const left = block.lefts[i];
              const right = block.rights[i];
              return `<tr><td>${left ? `${left.n}. ${escapeHtml(left.text)}` : ''}</td><td>${right ? `${right.letter}. ${escapeHtml(right.text)}` : ''}</td><td></td></tr>`;
            }).join('')}
          </tbody>
        </table>`);
      break;
    case 'code':
      if (block.snippet) parts.push(`<pre class="ed-code">${escapeHtml(block.snippet)}</pre>`);
      if (block.options) {
        parts.push(
          `<ul class="ed-options">${block.options
            .map((o) => `<li class="ed-option"><span class="ed-marker">${MARKER.radio}</span> <span class="ed-letter">${escapeHtml(o.letter)}.</span> ${escapeHtml(o.text)}</li>`)
            .join('')}</ul>`,
        );
      }
      break;
    default:
      break;
  }
  return parts.join('');
}

function renderLines(count, cls = 'ed-answer-line') {
  const n = Math.max(0, Math.min(20, Number(count) || 0));
  return Array.from({ length: n }, () => `<div class="${cls}"></div>`).join('');
}

function writingLines(item) {
  const block = item.block;
  switch (block.kind) {
    case 'options':
      return 0;
    case 'blanks':
      return 0;
    case 'sequence':
      return 0;
    case 'pairs':
      return block.answerSpace ? 1 : 0;
    case 'code':
      return block.lines || 0;
    default:
      return block.lines || 2;
  }
}

function renderItems(model, cfg) {
  const isKey = model.meta.document === 'answer_key';
  const inlineMode = !isKey && cfg?.question?.answerStyle === 'inline';
  return model.sections
    .map((section) => {
      const heading = section.title
        ? `<h2 class="ed-section-title">${escapeHtml(section.title)} <span class="ed-section-subtotal">(${formatPoints(section.subtotal)} pts)</span></h2>`
        : '';
      const items = section.items
        .map((item) => {
          // Same rule as the PDF: the `(n)` marker only exists when the sheet
          // numbers answer lines below; the inline surface writes the option
          // number inside the space, so its gaps stay plain rules.
          const rawStem = blankStem(item.block, { inline: inlineMode });
          const stem = `<div class="ed-question-text">${escapeHtml(rawStem || '(énoncé vide)')}</div>`;
          const media = imgTag(item.block.media, 'ed-question-img');
          const answerKey = isKey
            ? `<div class="ed-key">
                <div class="ed-key-label">Réponse</div>
                <ul class="ed-key-entries">${(item.answer?.entries || [])
                  .map((entry) => `<li>${escapeHtml(entry)}</li>`)
                  .join('') || '<li class="ed-key-missing">À compléter par l’enseignant</li>'}</ul>
                ${(item.feedback || []).map((f) => `<div class="ed-key-feedback"><strong>${escapeHtml(f.label)} :</strong> ${escapeHtml(f.text)}</div>`).join('')}
                ${item.answer?.missing ? '<div class="ed-key-warning">Réponse manquante — à vérifier avant distribution.</div>' : ''}
              </div>`
            : '';
          const lines = isKey ? 0 : inlineMode ? 0 : writingLines(item);
          return `
            <article class="ed-question">
              <div class="ed-question-head">
                <span class="ed-question-number">Question ${item.number}</span>
                <span class="ed-question-points">${formatPoints(item.points)} pt${item.points === 1 ? '' : 's'}</span>
              </div>
              ${stem}${media}
              ${renderBlock(item.block, isKey, inlineMode)}
              ${renderLines(lines)}
              ${answerKey}
            </article>`;
        })
        .join('');
      return `<section class="ed-section">${heading}${items}</section>`;
    })
    .join('');
}

function renderWarnings(model) {
  if (model.meta.document !== 'answer_key' || !model.warnings.length) return '';
  return `<section class="ed-warnings"><h3 class="ed-warnings-title">Points à revoir</h3><ul>${model.warnings
    .map((w) => `<li>${escapeHtml(w.message || w.type)}</li>`)
    .join('')}</ul></section>`;
}

/**
 * Inline CSS custom properties that override the paper defaults with the
 * resolved template theme. The stylesheet keeps its Classique values as the
 * baseline, so for the default template these vars equal the defaults (no
 * visible change); any other template recolours and rescales the preview the
 * same way the PDF and Word do.
 */
function paperThemeStyle(cfg) {
  const C = cfg.theme.colors;
  const lower = (h) => String(h).toLowerCase();
  return [
    `--ed-accent:${lower(C.accent)}`,
    `--ed-accent-bg:${lower(C.fieldBg)}`,
    `--ed-hairline:${lower(C.hairline)}`,
    `font-size:${cfg.theme.sizes.body}pt`,
  ].join(';');
}

/** @param {object} model output of ExamDocumentService.buildExamDocument */
export function renderExamDocumentHtml(model, options = {}) {
  const cfg = resolveForRenderer(options);
  const { header } = model;
  const scaleNote = header.scaleNote
    ? `<div class="ed-scale-note">${escapeHtml(header.scaleNote)}</div>`
    : '';

  const columns = cfg.page.columns;
  const bodyStyle = columns > 1 ? ` style="column-count:${columns};column-gap:${cfg.page.gutter}px"` : '';

  return `<article class="ed-paper ed-paper--${model.meta.document}" style="${paperThemeStyle(cfg)}">
    ${renderHeader(model, cfg)}
    ${renderIdentityBlock(model)}
    <main class="ed-body"${bodyStyle}>${renderItems(model, cfg)}</main>
    ${renderWarnings(model)}
    ${scaleNote}
  </article>`;
}

/** Standalone document for the print window (A4, no admin chrome). */
export function renderPrintablePage(model, css, options = {}) {
  const title = `${model.meta.document === 'answer_key' ? 'Corrigé — ' : 'Sujet — '}${model.meta.examName}`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body class="ed-print-body">${renderExamDocumentHtml(model, options)}</body>
</html>`;
}

export { escapeHtml, optionLetter };
