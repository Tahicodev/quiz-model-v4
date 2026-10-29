/**
 * tests/unit/examRowMobileSheet.test.js
 *
 * On a phone (<= 768px) an exam row is one tap that opens the MobileActionSheet,
 * and the inline icon bar is hidden — so the sheet has to carry *every* action
 * the desktop row offers. Exam Documents used to be missing from it, which made
 * the PDF / Word / print panel unreachable on mobile once the buttons went away.
 *
 * These are source-level guards (the files are classic browser scripts with a
 * lot of globals, so running them here would cost more than they check):
 *   1. every desktop row button handler has a sheet entry with the same call,
 *   2. styles.css really drops the exam action bar on small viewports, and the
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

/** Handler names behind the desktop icon buttons in the exam row template. */
function desktopActions() {
  return [...js.matchAll(/class="exam-action-btn exam-[\w-]+" onclick="(\w+)\('/g)].map((m) => m[1]);
}

/** Handler names behind the MobileActionSheet entries. */
function sheetActions() {
  const start = js.indexOf('MobileActionSheet.open(');
  const end = js.indexOf(']);', start);
  const block = js.slice(start, end);
  return [...block.matchAll(/onClick: \(\) => (\w+)\(exam\.id\)/g)].map((m) => m[1]);
}

describe('exam row mobile action sheet', () => {
  it('lists one entry per desktop row button', () => {
    const desktop = desktopActions();
    const sheet = sheetActions();
    expect(desktop.length).toBeGreaterThan(1);
    expect(sheet.sort()).toEqual([...new Set(desktop)].sort());
  });

  it('can reach Exam Documents from the sheet', () => {
    // The reported bug: the paper panel was desktop-only.
    expect(sheetActions()).toContain('openExamDocuments');
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
