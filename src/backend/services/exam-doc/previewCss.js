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

/* ── Header ─────────────────────────────────────────────────────────────── */
.ed-header { border-bottom: 2px solid var(--ed-ink); padding-bottom: 8px; margin-bottom: 12px; }
.ed-institutional { text-align: center; font-size: 10.5pt; letter-spacing: .02em; text-transform: uppercase; color: var(--ed-muted); }
.ed-school { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
.ed-logo { height: calc(48px * var(--ed-logo-scale, 1)); width: auto; max-width: 160px; object-fit: contain; }
.ed-school-name { font-weight: 700; font-size: 13pt; }
.ed-school-year { font-size: 10.5pt; color: var(--ed-muted); }
.ed-title-block { margin-top: 10px; text-align: center; }
.ed-title { font-size: 15pt; margin: 0 0 6px; text-transform: uppercase; letter-spacing: .03em; }
.ed-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 18px; font-size: 10.5pt; }
.ed-meta-label { color: var(--ed-muted); }
.ed-meta-value { font-weight: 600; }
.ed-score-badge { margin-top: 6px; font-size: 11pt; }

/* ── Student identification ─────────────────────────────────────────────── */
.ed-identity { display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: flex-end; font-size: 11pt; margin-bottom: 10px; }
.ed-id-field { display: flex; align-items: flex-end; gap: 6px; }
.ed-id-note { margin-left: auto; }
.ed-rule { display: inline-block; border-bottom: 1px solid var(--ed-rule); min-width: 140px; height: 1.1em; }
.ed-rule-medium { min-width: 90px; }
.ed-rule-short { min-width: 70px; }

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

.ed-blanks-line { margin: 6px 0; }
.ed-pool { display: flex; flex-wrap: wrap; gap: 6px 10px; margin: 4px 0 6px; }
.ed-pool-item { border: 1px solid var(--ed-line); border-radius: 3px; padding: 2px 8px; font-size: 10.5pt; }
.ed-slots { margin: 4px 0 6px 22px; padding-left: 8px; }
.ed-slots li { margin-bottom: 6px; }

.ed-pairs { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 10.5pt; }
.ed-pairs th, .ed-pairs td { border: 1px solid var(--ed-line); padding: 5px 8px; text-align: left; width: 50%; }
.ed-pairs th { background: #f3f4f6; font-weight: 600; }

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

/* ── Footer ─────────────────────────────────────────────────────────────── */
.ed-footer { margin-top: 16px; border-top: 1px solid var(--ed-line); padding-top: 8px; font-size: 10.5pt; }
.ed-total { text-align: right; }
.ed-scale-note { color: var(--ed-muted); font-style: italic; font-size: 9.5pt; margin-top: 4px; }
.ed-closing { text-align: center; margin-top: 12px; color: var(--ed-muted); }
`;

/** Print-window additions: A4 page box, no admin chrome, page numbers. */
export const EXAM_DOC_PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm; }
html, body { margin: 0; padding: 0; background: #fff; }
body.ed-print-body { font-family: Georgia, 'Times New Roman', serif; }
.ed-print-body .ed-paper { width: auto; min-height: 0; margin: 0; padding: 0; }
@media print { .ed-print-body .ed-question { break-inside: avoid; } }
`;
