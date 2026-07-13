/**
 * src/frontend/ui/pages/admin/DashboardPage.js
 * Overview tab: KPI cards (totals), recent activity lists, quick-action buttons.
 *
 * Calls (via container services — handles both local and SaaS modes):
 *   questionSvc.list({ limit: 1 })     → { total }
 *   examSvc.list({ limit: 5 })         → recent exams + total
 *   userSvc.list({ limit: 5 })         → recent users + total
 *   resultSvc.getByExam / getByUser not used here; we list recent via stats.
 */

import { getContainer } from '../../../container.js';
import { withError }    from '../../../utils/eventBus.js';
import { logger }       from '../../../utils/logger.js';
import { formatDate }   from '../../../utils/format.js';

/**
 * @param {HTMLElement} host
 * @returns {() => Promise<void>} refresh function
 */
export async function initDashboardPage(host) {
  host.replaceChildren();

  // Title
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Dashboard';
  host.appendChild(title);

  // KPI grid
  const kpiGrid = document.createElement('div');
  kpiGrid.className = 'admin-kpi-grid';
  const kpiCards = {
    questions: makeKpi('Questions', '…', '❓'),
    exams:     makeKpi('Exams',     '…', '📝'),
    users:     makeKpi('Users',     '…', '👥'),
    results:   makeKpi('Results',   '…', '📈'),
  };
  for (const card of Object.values(kpiCards)) kpiGrid.appendChild(card.el);
  host.appendChild(kpiGrid);

  // Quick actions
  const actions = document.createElement('div');
  actions.className = 'admin-actions';
  actions.append(
    quickAction('New Question', '#questions', '❓'),
    quickAction('New Exam',     '#exams',     '📝'),
    quickAction('New User',     '#users',     '👤'),
    quickAction('Migrate Data',  '/migrate.html', '📦'),
  );
  host.appendChild(actions);

  // Recent activity (two columns)
  const activity = document.createElement('div');
  activity.className = 'admin-activity';
  activity.append(
    activityBlock('Recent Exams', 'exam-activity'),
    activityBlock('Recent Users', 'user-activity'),
  );
  host.appendChild(activity);

  async function load() {
    const c = getContainer();
    const listExams   = await c.examSvc.list({}, { limit: 5, orderBy: 'created_at', direction: 'desc' });
    const listUsers   = await c.userSvc.list({}, { limit: 5, orderBy: 'created_at', direction: 'desc' });
    const listQ       = await c.questionSvc.list({}, { limit: 1, orderBy: 'created_at', direction: 'desc' });
    // Total results: ResultService has no global `list`, so read the count
    // straight through the repository (cheap: limit=1, only total is used).
    let resultTotal = 0;
    try {
      const { total } = await c.repo.getAll('results', { limit: 1 });
      resultTotal = total ?? 0;
    } catch (err) { logger.warn('Could not count results', err); }

    kpiCards.questions.update(listQ?.total ?? 0);
    kpiCards.exams.update(listExams?.total ?? 0);
    kpiCards.users.update(listUsers?.total ?? 0);
    kpiCards.results.update(resultTotal);

    renderActivity('exam-activity', listExams?.data ?? [], (e) => `${e.name} · ${e.status ?? ''}`);
    renderActivity('user-activity',  listUsers?.data ?? [], (u) => `${u.name ?? u.username} · ${u.role}`);
  }

  await withError(load);
  return load;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeKpi(label, value, icon) {
  const el = document.createElement('div');
  el.className = 'admin-kpi';
  const iconEl = document.createElement('span');
  iconEl.className = 'admin-kpi__icon';
  iconEl.textContent = icon;
  const numEl = document.createElement('span');
  numEl.className = 'admin-kpi__value';
  numEl.textContent = value;
  const lblEl = document.createElement('span');
  lblEl.className = 'admin-kpi__label';
  lblEl.textContent = label;
  el.append(iconEl, numEl, lblEl);
  return {
    el,
    update(v) { numEl.textContent = String(v ?? 0); },
  };
}

function quickAction(label, href, icon) {
  const a = document.createElement('a');
  a.className = 'admin-quick-action';
  a.href = href;
  const ic = document.createElement('span');
  ic.className = 'admin-quick-action__icon';
  ic.textContent = icon;
  const tx = document.createElement('span');
  tx.textContent = label;
  a.append(ic, tx);
  return a;
}

function activityBlock(title, id) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-activity__col';
  const h = document.createElement('h2');
  h.className = 'admin-activity__title';
  h.textContent = title;
  const list = document.createElement('ul');
  list.id = id;
  list.className = 'admin-activity__list';
  wrap.append(h, list);
  return wrap;
}

function renderActivity(listId, items, fmt) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.replaceChildren();
  if (!items || items.length === 0) {
    const li = document.createElement('li');
    li.className = 'admin-activity__empty';
    li.textContent = 'No recent activity';
    list.appendChild(li);
    return;
  }
  for (const it of items) {
    const li = document.createElement('li');
    const primary = document.createElement('span');
    primary.className = 'admin-activity__item';
    const secondary = document.createElement('span');
    secondary.className = 'admin-activity__meta';
    const date = it.created_at ?? it.date_taken ?? it.last_login;
    secondary.textContent = date ? formatDate(date) : '';
    const text = document.createElement('span');
    text.textContent = fmt(it);
    primary.append(text, secondary);
    li.appendChild(primary);
    list.appendChild(li);
  }
}
