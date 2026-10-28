/**
 * src/backend/services/exam-doc/previewCss.js
 *
 * The single source of truth for paper typography. It travels INSIDE the
 * preview HTML (so the modal shows exactly what the file will look like) and
 * is reused verbatim by the print window — no duplicated stylesheet in the
 * admin theme, and no risk of the preview drifting from the printed page.
 *
 * Every selector is `.ed-` prefixed: it cannot leak into the admin UI.
 */

export const EXAM_DOC_PAPER_CSS = `
.ed-paper {
  --ed-ink: #111827;
  --ed-muted: #4b5563;
  --ed-line: #9ca3af;
  --ed-rule: #6b7280;
  --ed-key-bg: #f8fafc;
  --ed-key-border: #cbd5e1;
  /* One accent for the whole paper, the same value the PDF and Word use. */
  --ed-accent: #1f3a5f;
  --ed-accent-bg: #f6f8fa;
  --ed-hairline: #c9d1d9;
  --ed-sans: 'Segoe UI', Helvetica, Arial, sans-serif;
  box-sizing: border-box;
  width: 210mm;
  max-width: 100%;
  min-height: 297mm;
  margin: 0 auto;
  padding: 16mm 15mm;
  background: #fff;
  color: var(--ed-ink);
  font-family: Georgia, 'Times New Roman', 'Noto Serif', serif;
  font-size: 12pt;
  line-height: 1.5;
}
.ed-paper *, .ed-paper *::before, .ed-paper *::after { box-sizing: border-box; }

/* ── Header: masthead band, accent rule, title, information line ────────── */
.ed-header { margin-bottom: 10px; }
.ed-masthead { display: flex; align-items: center; gap: 14px; font-family: var(--ed-sans); }
.ed-masthead-logo { flex: 0 0 auto; }
.ed-logo { height: calc(54px * var(--ed-logo-scale, 1)); width: auto; max-width: 132px; object-fit: contain; }
.ed-masthead-left { flex: 1 1 auto; min-width: 0; }
.ed-masthead-right { flex: 0 0 auto; margin-left: auto; text-align: right; }
.ed-masthead-school { font-weight: 700; font-size: 14pt; line-height: 1.25; color: var(--ed-accent); }
.ed-masthead-programme { font-size: 9.5pt; color: var(--ed-muted); }
.ed-masthead-institution { font-size: 8.5pt; color: var(--ed-muted); }
.ed-masthead-year { font-size: 9.5pt; color: var(--ed-muted); }
.ed-masthead-session { font-size: 8.5pt; color: var(--ed-muted); }
.ed-accent-rule { height: 2.5px; background: var(--ed-accent); margin: 8px 0 7px; }
.ed-title-block { text-align: center; font-family: var(--ed-sans); }
.ed-title { font-size: 15pt; margin: 0; color: var(--ed-accent); letter-spacing: .03em; }
.ed-tag { font-size: 9pt; letter-spacing: .06em; color: var(--ed-muted); margin-top: 3px; }
.ed-meta { margin-top: 3px; font-size: 10pt; color: var(--ed-muted); display: flex; flex-wrap: wrap; justify-content: center; gap: 0 9px; }
.ed-meta-sep { color: var(--ed-hairline); }

/* ── Student identification: light plate + dedicated grade box ──────────── */
.ed-identity { display: flex; align-items: stretch; gap: 12px; font-family: var(--ed-sans); margin: 10px 0; }
.ed-id-plate { flex: 1 1 auto; background: var(--ed-accent-bg); border: 1px solid var(--ed-hairline); border-radius: 6px; padding: 10px 12px; }
.ed-id-row { display: flex; gap: 18px; }
.ed-id-row + .ed-id-row { margin-top: 12px; }
.ed-id-field { flex: 1 1 0; display: flex; align-items: flex-end; gap: 6px; min-width: 0; font-size: 10.5pt; }
.ed-id-field::after { content: ''; flex: 1 1 auto; height: 1em; border-bottom: 1px dotted var(--ed-rule); }
.ed-note-box { flex: 0 0 118px; min-height: 58px; display: flex; flex-direction: column; justify-content: space-between; padding: 6px 9px; border: 1.5px solid var(--ed-accent); border-radius: 6px; }
.ed-note-label { font-size: 8pt; letter-spacing: .08em; color: var(--ed-muted); }
.ed-note-max { font-size: 15pt; font-weight: 700; color: var(--ed-accent); text-align: right; }
.ed-score-badge { text-align: center; font-size: 11pt; margin: 6px 0; }
.ed-header-close { border-bottom: 1.5px solid var(--ed-ink); margin: 10px 0 12px; }

.ed-instructions { border: 1px solid var(--ed-line); padding: 8px 10px; font-size: 10.5pt; margin-bottom: 12px; }
.ed-instructions h3 { margin: 0 0 4px; font-size: 10.5pt; text-transform: uppercase; letter-spacing: .04em; }
.ed-instructions p { margin: 0; }

/* ── Body ───────────────────────────────────────────────────────────────── */
.ed-section { margin-bottom: 10px; }
.ed-section-title { font-size: 12pt; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: .03em; }
.ed-section-subtotal { font-weight: 400; color: var(--ed-muted); font-size: 10.5pt; text-transform: none; }
.ed-question { page-break-inside: avoid; break-inside: avoid; margin-bottom: 12px; }
.ed-question-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; page-break-after: avoid; break-after: avoid; }
.ed-question-number { font-weight: 700; }
.ed-question-points { font-size: 10.5pt; color: var(--ed-muted); white-space: nowrap; }
.ed-question-text { margin: 2px 0 4px; }
.ed-instruction { margin: 0 0 4px; font-size: 10pt; font-style: italic; color: var(--ed-muted); }
.ed-question-img { display: block; max-width: 70mm; margin: 6px 0; }
.ed-option-img { display: inline-block; max-height: 22mm; max-width: 40mm; vertical-align: middle; margin-left: 6px; }

.ed-options { list-style: none; margin: 2px 0 6px; padding-left: 10px; }
.ed-option { margin-bottom: 2px; }
.ed-marker { font-family: 'Segoe UI Symbol', 'Noto Sans Symbols', sans-serif; }
.ed-letter { font-weight: 600; }

.ed-rule { display: inline-block; border-bottom: 1px solid var(--ed-rule); min-width: 140px; height: 1.1em; }
.ed-rule-medium { min-width: 90px; }
.ed-rule-short { min-width: 70px; }
.ed-pool { margin: 4px 0 6px; }
.ed-pool-title { font-size: 10.5pt; }
.ed-pool-item { margin: 2px 0 2px 14px; font-size: 10.5pt; }
.ed-slots { margin: 4px 0 6px 22px; padding-left: 8px; }
.ed-slots li { margin-bottom: 6px; }

.ed-pairs { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 10.5pt; }
.ed-pairs th, .ed-pairs td { border: 1px solid var(--ed-line); padding: 5px 8px; text-align: left; }
.ed-pairs th { background: #f3f4f6; font-weight: 600; }
.ed-pairs-a, .ed-pairs td:nth-child(1) { width: 37%; }
.ed-pairs-b, .ed-pairs td:nth-child(2) { width: 38%; }
.ed-pairs-r, .ed-pairs td:nth-child(3) { width: 25%; text-align: center; }
.ed-code { font-family: 'Courier New', monospace; font-size: 10pt; background: #f9fafb; border: 1px solid var(--ed-key-border); padding: 6px 8px; white-space: pre-wrap; margin: 4px 0 6px; }
.ed-answer-line { border-bottom: 1px dotted var(--ed-rule); height: 22px; }

/* ── Answer key ─────────────────────────────────────────────────────────── */
.ed-key { background: var(--ed-key-bg); border: 1px solid var(--ed-key-border); border-radius: 3px; padding: 6px 9px; margin-top: 4px; font-size: 10.5pt; }
.ed-key-label { text-transform: uppercase; letter-spacing: .04em; font-size: 9.5pt; color: var(--ed-muted); }
.ed-key-entries { margin: 2px 0 0; padding-left: 18px; }
.ed-key-missing, .ed-key-warning { color: #b45309; font-style: italic; }
.ed-key-feedback { margin-top: 4px; }
.ed-warnings { border: 1px dashed var(--ed-key-border); padding: 8px 10px; font-size: 10.5pt; margin-top: 10px; }
.ed-warnings-title { margin: 0 0 4px; font-size: 10.5pt; text-transform: uppercase; }

/* ── Scale note (normalization disclosure) ─────────────────────────────────── */
.ed-scale-note { color: var(--ed-muted); font-style: italic; font-size: 9.5pt; margin-top: 16px; text-align: center; }
`;

/** Print-window additions: A4 page box, no admin chrome, page numbers. */
export const EXAM_DOC_PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
html, body { margin: 0; padding: 0; background: #fff; }
body.ed-print-body { font-family: Georgia, 'Times New Roman', serif; }
.ed-print-body .ed-paper { width: auto; min-height: 0; margin: 0; padding: 0; }
@media print { .ed-print-body .ed-question { break-inside: avoid; } }
`;
