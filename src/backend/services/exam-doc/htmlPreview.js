/**
 * src/backend/services/exam-doc/htmlPreview.js
 *
 * Server-rendered HTML of the SAME normalized model the PDF and DOCX use, so
 * the modal preview is the document — not the interactive quiz screen.
 *
 * Every string is escaped; every class is `ed-` prefixed so the paper keeps
 * its own typography inside the admin page (and in the print window).
 */

import { formatPoints, optionLetter } from './text.js';

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

function metaRow(label, value) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  return `<div class="ed-meta-item"><span class="ed-meta-label">${escapeHtml(label)} :</span> <span class="ed-meta-value">${escapeHtml(value)}</span></div>`;
}

function renderHeader(model) {
  const { header } = model;
  const institutional = [header.ministry, header.academy].filter((v) => v && String(v).trim());
  const top = institutional.length
    ? `<div class="ed-institutional">${institutional.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>`
    : '';
  const logo = imgTag(header.logoDataUrl || header.logoUrl, 'ed-logo');
  const scale = Number(header.logoScale) || 1;
  const identity = header.schoolName
    ? `<div class="ed-school"${scale !== 1 ? ` style="--ed-logo-scale:${scale}"` : ''}>${logo}<div class="ed-school-name">${escapeHtml(header.schoolName)}</div>${header.academicYear ? `<div class="ed-school-year">${escapeHtml(header.academicYear)}</div>` : ''}</div>`
    : `${logo}`;

  const meta = [
    metaRow('Matière', header.subject),
    metaRow('Enseignant', header.teacherName),
    metaRow('Niveau / Classe', header.level),
    metaRow('Groupe', header.group),
    metaRow('Session', header.sessionType),
    metaRow('Trimestre', header.term),
    metaRow('Date', header.date),
    header.durationMinutes ? metaRow('Durée', `${header.durationMinutes} min`) : '',
  ].join('');

  return `
    <header class="ed-header">
      ${top}
      ${identity}
      <div class="ed-title-block">
        <h1 class="ed-title">${escapeHtml(header.title || 'Examen')}</h1>
        <div class="ed-meta">${meta}</div>
        <div class="ed-score-badge">Note : <strong>${escapeHtml(model.scoring.label)}</strong></div>
      </div>
    </header>`;
}

function renderStudentIdentity(model) {
  if (model.meta.document !== 'student') return '';
  const { header } = model;
  const fields = [];
  if (header.studentNameField !== false) fields.push('<div class="ed-id-field">Nom &amp; prénom : <span class="ed-rule"></span></div>');
  if (header.studentNumberField !== false) fields.push('<div class="ed-id-field">N° : <span class="ed-rule ed-rule-short"></span></div>');
  if (header.showClassField !== false) fields.push('<div class="ed-id-field">Classe : <span class="ed-rule ed-rule-short"></span></div>');
  fields.push('<div class="ed-id-field ed-id-note">Note : <span class="ed-rule ed-rule-short"></span> / 20</div>');
  return `<section class="ed-identity">${fields.join('')}</section>`;
}

function renderBlock(block) {
  const parts = [];
  if (block.instruction) parts.push(`<p class="ed-instruction">${escapeHtml(block.instruction)}</p>`);

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
      parts.push('<div class="ed-blanks-line"><span class="ed-rule"></span></div>');
      break;
    case 'sequence':
      parts.push(
        `<div class="ed-pool">${block.pool.map((o) => `<span class="ed-pool-item">${escapeHtml(o.text)}${imgTag(o.image, 'ed-option-img')}</span>`).join('')}</div>`,
      );
      parts.push(
        `<ol class="ed-slots">${Array.from({ length: block.slots }, () => '<li><span class="ed-rule ed-rule-medium"></span></li>').join('')}</ol>`,
      );
      break;
    case 'pairs':
      parts.push(`
        <table class="ed-pairs">
          <thead><tr><th>Colonne A</th><th>Colonne B</th></tr></thead>
          <tbody>
            ${Array.from({ length: Math.max(block.lefts.length, block.rights.length) }, (_, i) => {
              const left = block.lefts[i];
              const right = block.rights[i];
              return `<tr><td>${left ? `${left.n}. ${escapeHtml(left.text)}` : ''}</td><td>${right ? `${right.letter}. ${escapeHtml(right.text)}` : ''}</td></tr>`;
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

function renderItems(model) {
  const isKey = model.meta.document === 'answer_key';
  return model.sections
    .map((section) => {
      const heading = section.title
        ? `<h2 class="ed-section-title">${escapeHtml(section.title)} <span class="ed-section-subtotal">(${formatPoints(section.subtotal)} pts)</span></h2>`
        : '';
      const items = section.items
        .map((item) => {
          const stem = `<div class="ed-question-text">${escapeHtml(item.block.text)}</div>`;
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
          const lines = isKey ? 0 : writingLines(item);
          return `
            <article class="ed-question">
              <div class="ed-question-head">
                <span class="ed-question-number">Question ${item.number}</span>
                <span class="ed-question-points">${formatPoints(item.points)} pt${item.points === 1 ? '' : 's'}</span>
              </div>
              ${stem}${media}
              ${renderBlock(item.block)}
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

/** @param {object} model output of ExamDocumentService.buildExamDocument */
export function renderExamDocumentHtml(model) {
  const { header } = model;
  const instructions =
    model.meta.document === 'student' && header.instructions
      ? `<section class="ed-instructions"><h3>Consignes</h3><p>${escapeHtml(header.instructions)}</p></section>`
      : '';
  const closing =
    model.meta.document === 'student'
      ? '<div class="ed-closing">— Fin du sujet —</div>'
      : '<div class="ed-closing ed-closing-key">— Fin du corrigé —</div>';

  return `<article class="ed-paper ed-paper--${model.meta.document}">
    ${renderHeader(model)}
    ${renderStudentIdentity(model)}
    ${instructions}
    <main class="ed-body">${renderItems(model)}</main>
    ${renderWarnings(model)}
    <footer class="ed-footer">
      <div class="ed-total">Total : <strong>${escapeHtml(model.scoring.label)}</strong></div>
      ${header.scaleNote ? `<div class="ed-scale-note">${escapeHtml(header.scaleNote)}</div>` : ''}
      ${closing}
    </footer>
  </article>`;
}

/** Standalone document for the print window (A4, no admin chrome). */
export function renderPrintablePage(model, css) {
  const title = `${model.meta.document === 'answer_key' ? 'Corrigé — ' : 'Sujet — '}${model.meta.examName}`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body class="ed-print-body">${renderExamDocumentHtml(model)}</body>
</html>`;
}

export { escapeHtml, optionLetter };
