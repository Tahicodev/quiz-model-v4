/**
 * tests/unit/examPageEstimator.test.js
 *
 * Step 3 of the template refactor: the estimator contract.
 *
 * The instant analytic estimate and the exact dry render must agree to within
 * ONE page across every paper shape (1 / 10 / 20 / 50 / 100 questions, short and
 * pathologically long stems, one and two columns). That bracket is what lets the
 * "Génération personnalisée" panel show a trustworthy page count on every
 * keystroke while only running the real renderer on export.
 */

import { describe, it, expect } from 'vitest';
import { buildDocument, longFixtures } from './helpers/examDocFixtures.js';
import { compactFixtures, denseFixtures, stressFixtures } from './helpers/examDocStress.js';
import { estimateAnalytic, estimateExact } from '../../src/backend/services/exam-doc/pageEstimator.js';
import { fitToPages } from '../../src/backend/services/exam-doc/pageEstimator.js';
import { resolveTemplate } from '../../src/backend/services/exam-doc/templates/index.js';

async function model(rows, document = 'student') {
  return buildDocument({ questions: rows }, { document });
}

describe('exam page estimator — analytic vs exact within 1 page', () => {
  const cfg = resolveTemplate('classique');

  for (const n of [1, 10, 20, 50, 100]) {
    it(`compact ${n}-question subject`, async () => {
      const m = await model(compactFixtures(n));
      const a = estimateAnalytic(m, cfg).pages;
      const e = (await estimateExact(m, cfg)).pages;
      // eslint-disable-next-line no-console
      console.log(`[estimate] compact n=${n} analytic=${a} exact=${e}`);
      expect(Math.abs(a - e)).toBeLessThanOrEqual(1);
    });
  }

  for (const n of [1, 20, 50]) {
    it(`dense ${n}-question subject`, async () => {
      const m = await model(denseFixtures(n));
      const a = estimateAnalytic(m, cfg).pages;
      const e = (await estimateExact(m, cfg)).pages;
      // eslint-disable-next-line no-console
      console.log(`[estimate] dense n=${n} analytic=${a} exact=${e}`);
      expect(Math.abs(a - e)).toBeLessThanOrEqual(1);
    });
  }

  for (const n of [1, 10, 20]) {
    it(`pathological ${n}-question subject`, async () => {
      const m = await model(stressFixtures(n));
      const a = estimateAnalytic(m, cfg).pages;
      const e = (await estimateExact(m, cfg)).pages;
      // eslint-disable-next-line no-console
      console.log(`[estimate] stress n=${n} analytic=${a} exact=${e}`);
      expect(Math.abs(a - e)).toBeLessThanOrEqual(1);
    });
  }

  for (const n of [10, 20, 50]) {
    it(`long-stem ${n}-question subject`, async () => {
      const m = await model(longFixtures(n));
      const a = estimateAnalytic(m, cfg).pages;
      const e = (await estimateExact(m, cfg)).pages;
      // eslint-disable-next-line no-console
      console.log(`[estimate] long n=${n} analytic=${a} exact=${e}`);
      expect(Math.abs(a - e)).toBeLessThanOrEqual(1);
    });
  }

  it('two columns pack into fewer or equal pages than one', async () => {
    const m = await model(compactFixtures(20));
    const one = estimateAnalytic(m, cfg);
    const two = estimateAnalytic(m, resolveTemplate('compact'));
    expect(two.pages).toBeLessThanOrEqual(one.pages);
  });

  // The band-aware packer must model full-width `pairs` tables even in two
  // columns. A table-heavy paper is exactly the shape that used to fool the
  // estimator into a wildly low count (it packed each spanning table into a
  // single half-width column), so pin the ≤1 contract against the real render.
  const twoCol = resolveTemplate('compact');
  for (const n of [20, 50]) {
    it(`two-column table-heavy ${n}-question subject`, async () => {
      const m = await model(denseFixtures(n));
      const a = estimateAnalytic(m, twoCol).pages;
      const e = (await estimateExact(m, twoCol)).pages;
      // eslint-disable-next-line no-console
      console.log(`[estimate] 2col-tables n=${n} analytic=${a} exact=${e}`);
      expect(Math.abs(a - e)).toBeLessThanOrEqual(1);
    });
  }

  it('exact render reports a last-page fill between 0 and 1', async () => {
    const m = await model(compactFixtures(20));
    const exact = await estimateExact(m, cfg);
    expect(exact.lastPageFill).toBeGreaterThanOrEqual(0);
    expect(exact.lastPageFill).toBeLessThanOrEqual(1);
  });

  it('fit-pages tunes a lever to shave a page and honours the 9pt floor', async () => {
    const m = await model(denseFixtures(50));
    const base = await estimateExact(m, cfg);
    const result = await fitToPages(m, cfg, base.pages - 1);
    // eslint-disable-next-line no-console
    console.log(`[fit] base=${base.pages} -> ${result.pages} levers=${JSON.stringify(result.levers)}`);
    expect(result.pages).toBeLessThan(base.pages);
    expect(result.levers.length).toBeGreaterThan(0);
    const sizes = result.template.theme?.sizes;
    if (sizes) {
      for (const value of Object.values(sizes)) expect(value).toBeGreaterThanOrEqual(9);
    }
    if (result.template.theme?.density != null) expect(result.template.theme.density).toBeGreaterThanOrEqual(0.7);
  });

  it('a budget that already fits changes no lever', async () => {
    const m = await model(compactFixtures(20));
    const result = await fitToPages(m, cfg, 40);
    expect(result.fits).toBe(true);
    expect(result.levers).toEqual([]);
  });
});
