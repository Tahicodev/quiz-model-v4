/**
 * src/frontend/ui/pages/sessions/SessionResults.js
 * @description Exam session results display.
 */

import { logger } from '../../../utils/logger.js';
import { safeSetHTML } from '../../../utils/sanitize.js';
import { withError } from '../../../utils/eventBus.js';
import { getContainer } from '../../../container.js';
import { formatScore, formatDuration } from '../../../utils/format.js';

export async function initSessionResults(sessionId) {
  const c = getContainer();
  try {
    const result = await c.resultSvc.getById(sessionId);
    const el = document.getElementById('app');
    safeSetHTML(el, `
      <h2>Exam Results</h2>
      <table class="data-table">
        <tr><td>Score</td><td>${result?.score ?? '—'}%</td></tr>
        <tr><td>Passed</td><td>${result?.passed ? 'Yes' : 'No'}</td></tr>
        <tr><td>Time spent</td><td>${formatDuration(result?.time_spent)}</td></tr>
        <tr><td>Date</td><td>${result?.date_taken || '—'}</td></tr>
      </table>
    `);
  } catch (err) {
    logger.error('Failed to load results', err);
    safeSetHTML(document.getElementById('app'), `<p>Error loading results.</p>`);
  }
}
