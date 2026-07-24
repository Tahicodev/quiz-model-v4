/**
 * src/frontend/ui/pages/admin/ResultsPage.js
 * Results browser: per-exam and per-user tabs, plus aggregate stats.
 *
 * Uses ResultService via the container for listings:
 *   getByExam / getByUser / getById
 * Raw `api()` helper for the stats endpoints (GET /results/exam/:id/stats,
 * GET /results/user/:id/stats) which aren't exposed as service methods.
 */

import { getContainer }  from '../../../container.js';
import { logger }       from '../../../utils/logger.js';
import { formatDate }    from '../../../utils/format.js';
import { safeSetHTML }   from '../../../utils/sanitize.js';
import { api }           from './components/api.js';

let hostRef = null;

export async function initResultsPage(host) {
  hostRef = host;
  host.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Results';
  host.appendChild(title);

  // === Filter row: choose exam or user, then load.
  const toolbar = document.createElement('div');
  toolbar.className = 'admin-toolbar';

  const examSel = await buildExamSelect();
  examSel.id = 'results-exam';
  examSel.addEventListener('change', () => loadResults());

  const userSel = await buildUserSelect();
  userSel.id = 'results-user';
  userSel.addEventListener('change', () => loadResults());

  const spacer = document.createElement('span');
  spacer.style.flex = '1';

  toolbar.append(lbl('By exam', examSel), lbl('By user', userSel), spacer);
  host.appendChild(toolbar);

  // === Stats panel
  const stats = document.createElement('div');
  stats.className = 'admin-stats';
  stats.id = 'results-stats';
  host.appendChild(stats);

  // === Results table
  const tableHost = document.createElement('div');
  tableHost.id = 'results-table-host';
  host.appendChild(tableHost);

  // Initial load: by the first exam if available, else empty.
  await loadResults();
  return async () => { loadResults(); };
}

function lbl(text, el) {
  const w = document.createElement('label');
  w.className = 'admin-toolbar__field';
  const s = document.createElement('span');
  s.textContent = text;
  w.append(s, el);
  return w;
}

async function buildExamSelect() {
  const sel = document.createElement('select');
  const none = document.createElement('option');
  none.value = ''; none.textContent = '— select exam —';
  sel.appendChild(none);
  try {
    const c = getContainer();
    const { data } = await c.examSvc.list({}, { limit: 200, orderBy: 'name' });
    for (const ex of data) {
      const o = document.createElement('option');
      o.value = ex.id; o.textContent = ex.name;
      sel.appendChild(o);
    }
  } catch (err) { logger.warn('Could not load exams for results filter', err); }
  return sel;
}

async function buildUserSelect() {
  const sel = document.createElement('select');
  const none = document.createElement('option');
  none.value = ''; none.textContent = '— select user —';
  sel.appendChild(none);
  try {
    const c = getContainer();
    const { data } = await c.userSvc.list({}, { limit: 200, orderBy: 'name' });
    for (const u of data) {
      const o = document.createElement('option');
      o.value = u.id; o.textContent = `${u.name ?? u.username} (${u.role})`;
      sel.appendChild(o);
    }
  } catch (err) { logger.warn('Could not load users for results filter', err); }
  return sel;
}

async function loadResults() {
  const examId = document.getElementById('results-exam').value;
  const userId = document.getElementById('results-user').value;
  const c = getContainer();
  const host = document.getElementById('results-table-host');
  const statsHost = document.getElementById('results-stats');
  host.replaceChildren();
  statsHost.replaceChildren();

  let entries = [];
  let stats = null;

  try {
    if (examId) {
      const res = await c.resultSvc.getByExam(examId, { limit: 100 });
      entries = res?.data ?? [];
      try { stats = await api('GET', `/api/v1/results/exam/${examId}/stats`); } catch (e) { logger.warn('No stats', e); }
    } else if (userId) {
      const res = await c.resultSvc.getByUser(userId, { limit: 100 });
      entries = res?.data ?? [];
      try { stats = await api('GET', `/api/v1/results/user/${userId}/stats`); } catch (e) { logger.warn('No stats', e); }
    }

    if (stats) statsHost.appendChild(renderStats(stats, examId ? 'exam' : 'user'));
    renderResultsTable(host, entries);
  } catch (err) {
    const errBox = document.createElement('div');
    errBox.className = 'admin-error';
    errBox.textContent = `Failed to load results: ${err.message}`;
    host.appendChild(errBox);
  }
}

function renderStats(stats, kind) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-stats__grid';
  const cards = kind === 'exam'
    ? [
        { label: 'Total attempts', value: stats.total ?? 0 },
        { label: 'Average score', value: `${stats.avg ?? 0}%` },
        { label: 'Min / Max', value: `${stats.min ?? 0}% / ${stats.max ?? 0}%` },
        { label: 'Pass rate', value: `${stats.passRate ?? 0}%` },
      ]
    : [
        { label: 'Exams taken', value: stats.totalExams ?? 0 },
        { label: 'Average score', value: `${stats.avg ?? 0}%` },
        { label: 'Pass rate', value: `${stats.passRate ?? 0}%` },
      ];
  for (const c of cards) {
    const card = document.createElement('div');
    card.className = 'admin-kpi';
    const v = document.createElement('span');
    v.className = 'admin-kpi__value';
    v.textContent = c.value;
    const l = document.createElement('span');
    l.className = 'admin-kpi__label';
    l.textContent = c.label;
    card.append(v, l);
    wrap.appendChild(card);
  }
  return wrap;
}

function renderResultsTable(host, entries) {
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty-inline';
    empty.textContent = 'No results. Pick an exam or user above.';
    host.appendChild(empty);
    return;
  }
  const table = document.createElement('table');
  table.className = 'data-table';
  const thead = document.createElement('thead');
  safeSetHTML(thead, '<tr><th>Date</th><th>Score</th><th>Passed</th><th>Time</th><th>Attempt</th></tr>');
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const r of entries) {
    const tr = document.createElement('tr');
    tr.appendChild(td(formatDate(r.date_taken)));
    tr.appendChild(scoreCell(r.score));
    tr.appendChild(passCell(r.passed));
    tr.appendChild(td(r.time_spent ? `${r.time_spent}s` : '—'));
    tr.appendChild(td(r.attempt_number ?? '—'));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  host.appendChild(table);
}

function td(text) {
  const c = document.createElement('td');
  c.textContent = text ?? '—';
  return c;
}
function scoreCell(score) {
  const c = document.createElement('td');
  const span = document.createElement('span');
  const num = Number(score);
  span.className = 'badge ' + (num >= 50 ? 'badge--green' : 'badge--red');
  span.textContent = `${num}%`;
  c.appendChild(span);
  return c;
}
function passCell(passed) {
  const c = document.createElement('td');
  const span = document.createElement('span');
  span.className = 'badge ' + (passed ? 'badge--green' : 'badge--red');
  span.textContent = passed ? 'Pass' : 'Fail';
  c.appendChild(span);
  return c;
}
