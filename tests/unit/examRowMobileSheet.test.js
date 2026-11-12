/**
 * tests/unit/examRowMobileSheet.test.js
 *
 * On a phone (<= 768px) an exam row is one tap that opens the MobileActionSheet,
 * and the inline icon bar is hidden — so the sheet has to carry *every* action
 * the desktop row offers. Exam Documents used to be missing from it, which made
 * the PDF / Word / print panel unreachable on mobile once the buttons went away.
 *
 * The row actions now live in one catalog (examRowActions) that feeds both
 * surfaces: RowActions.render() paints the desktop row (three icon buttons plus
 * a "…" popover for the rest) and RowActions.sheetItems() feeds the mobile
 * sheet. These are source-level guards (the files are classic browser scripts
 * with a lot of globals, so running them here would cost more than they check):
 *   1. the catalog carries every action the row used to expose,
 *   2. the sheet is built from the same catalog (so it can never fall behind),
 *   3. styles.css really drops the exam action bar on small viewports, and the
 *      rule is written after the generic "keep the buttons visible" rule that
 *      the card layout installs, inside a max-width 768px block.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

const js = read('exam-management.js');
const css = read('styles.css');

/** The examRowActions catalog, as source text. */
function catalog() {
  const start = js.indexOf('function examRowActions(exam) {');
  const end = js.indexOf('\n}\n', start);
  return js.slice(start, end);
}

/** Keys declared in the catalog, in order. */
function catalogKeys() {
  return [...catalog().matchAll(/key: '([\w-]+)'/g)].map((m) => m[1]);
}

/** `desktop` placement of every catalog key. */
function catalogPlacement() {
  const out = {};
  const block = catalog();
  const entries = block.split(/\n\t\t\{\n/).slice(1);
  for (const entry of entries) {
    const key = /key: '([\w-]+)'/.exec(entry);
    if (!key) continue;
    const desktop = /desktop: '([\w-]+)'/.exec(entry);
    out[key[1]] = desktop ? desktop[1] : 'visible';
  }
  return out;
}

describe('exam row action catalog', () => {
  it('keeps every action the row used to expose', () => {
    expect(catalogKeys()).toEqual([
      'edit',
      'assign-questions',
      'assign-classes',
      'analysis',
      'documents',
      'push',
      'stop',
      'delete',
    ]);
  });

  it('caps the desktop row at three buttons and moves the rest behind the "…" menu', () => {
    const placement = catalogPlacement();
    const visible = Object.entries(placement)
      .filter(([, where]) => where === 'visible')
      .map(([key]) => key);
    expect(visible).toEqual(['edit', 'assign-questions', 'assign-classes']);
    expect(placement.documents).toBe('overflow');
    expect(placement.push).toBe('overflow');
    expect(placement.stop).toBe('overflow');
    expect(placement.delete).toBe('overflow');
  });

  it('drops the analysis button from the row (the title link already opens it)', () => {
    expect(catalogPlacement().analysis).toBe('none');
    // The analysis panel stays reachable from the exam title.
    expect(js).toContain('class="exam-name-link"');
    expect(js).toMatch(/openExamAnalysis\('\$\{/);
  });

  it('still offers Exam Documents, Push and Stop from the row', () => {
    const block = catalog();
    expect(block).toContain('openExamDocuments');
    expect(block).toContain('pushExamToDevices');
    expect(block).toContain('stopExamOnDevices');
  });
});

describe('exam row mobile action sheet', () => {
  it('is built from the same catalog as the desktop row', () => {
    // One catalog, two surfaces: the sheet can never fall behind the row.
    expect(js).toContain(
      'window.RowActions.sheetItems(examRowActions(exam))',
    );
  });

  it('carries every catalog action (the sheet lists all of them)', () => {
    // RowActions.sheetItems() maps every action that is not `mobile: false`,
    // so the sheet is the full catalog.
    const helper = read('row-actions.js');
    expect(helper).toContain('.filter((action) => action.mobile !== false)');
    // No catalog entry opts out of the sheet.
    expect(catalog()).not.toContain('mobile: false');
  });

  it('can reach Exam Documents from the sheet', () => {
    // The reported bug: the paper panel was desktop-only.
    expect(catalog()).toContain('openExamDocuments');
  });

  it('makes the whole exam row a desktop drill-down, with a keyboard link', () => {
    expect(js).toContain('class="clickable-exam-row"');
    expect(js).toContain('class="exam-name-link"');
    expect(js).toMatch(
      /if \(window\.innerWidth > 768\) \{[\s\S]{0,160}openExamAnalysis\(exam\.id\)/,
    );
  });
});

describe('exam action bar on small viewports', () => {
  const hideRule = /\.tab-content #examList tbody tr > td\.actions-cell \{[^}]*display: none !important;/;

  it('hides the row button bar', () => {
    expect(css).toMatch(hideRule);
  });

  it('outranks the card layout that re-shows the buttons', () => {
    const hide = hideRule.exec(css).index;
    const reshow = css.indexOf('.tab-content #examList tbody tr > td.actions-cell .exam-action-btn,');
    expect(reshow).toBeGreaterThan(-1);
    expect(hide).toBeGreaterThan(reshow);
  });

  it('does it inside a max-width 768px block', () => {
    const hide = hideRule.exec(css).index;
    const at = css.lastIndexOf('@media', hide);
    expect(css.slice(at, css.indexOf('{', at))).toMatch(/max-width:\s*768px/);
    const body = css.slice(at, hide);
    expect((body.match(/{/g) || []).length).toBeGreaterThan((body.match(/}/g) || []).length);
  });
});
