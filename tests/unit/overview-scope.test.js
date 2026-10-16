/**
 * tests/unit/overview-scope.test.js
 *
 * Overview tab isolation: teachers see only their own activities, classes
 * and students (pinned to self + assigned classes); admins see everything
 * and narrow via the teacher/class filter bar.
 *
 * overview-dashboard.js + teacher-filter.js are classic browser scripts, so
 * they are loaded with node:vm into a sandbox with stubbed browser globals.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
let ctx;
const state = {
  role: 'teacher',
  me: null,
  tables: {},
  storage: {},
  toasts: [],
  rafClock: 0,
};

function makeEl(over = {}) {
  const el = {
    value: '',
    checked: false,
    dataset: {},
    children: [],
    style: {},
    textContent: '',
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains: () => false,
    },
    setAttribute() {},
    removeAttribute() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    remove() {
      if (typeof this.onRemove === 'function') this.onRemove();
    },
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    ...over,
  };
  Object.defineProperty(el, 'options', {
    get() {
      return this.children;
    },
  });
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get: () => html,
    set: (v) => {
      html = String(v ?? '');
      if (html === '') el.children = [];
    },
  });
  return el;
}

const T1 = 'teacher-1';
const T2 = 'teacher-2';
const C1 = 'class-1';
const C2 = 'class-2';

function seedTables() {
  state.tables = {
    users: [
      { id: T1, role: 'teacher', name: 'Teacher One', classIds: [C1] },
      { id: T2, role: 'teacher', name: 'Teacher Two', classIds: [C2] },
      { id: 's1', role: 'student', name: 'Student One', classId: C1, studentNumber: '101' },
      { id: 's2', role: 'student', name: 'Student Two', classId: C2, studentNumber: '102' },
    ],
    classes: [
      { id: C1, name: 'Class One' },
      { id: C2, name: 'Class Two' },
    ],
    categories: [
      { id: 'cat1', name: 'T1 Cat', created_by: T1 },
      { id: 'cat2', name: 'T2 Cat', created_by: T2 },
    ],
    questions: [
      { id: 'q1', question: 'T1 question?', type: 'mcq', answer: 'A', dateCreated: '2026-10-01T10:00:00Z', created_by: T1, category: 'cat1' },
      { id: 'q2', question: 'T2 question?', type: 'mcq', answer: 'B', dateCreated: '2026-10-02T10:00:00Z', created_by: T2, category: 'cat2' },
    ],
    exams: [
      { id: 'e1', name: 'T1 Exam', dateCreated: '2026-10-03T10:00:00Z', creator_id: T1 },
      { id: 'e2', name: 'T2 Exam', dateCreated: '2026-10-04T10:00:00Z', creator_id: T2 },
    ],
    games: [
      { id: 'g1', name: 'T1 Game', creator_id: T1 },
      { id: 'g2', name: 'T2 Game', creator_id: T2 },
    ],
    results: [
      { id: 'r1', user_id: 's1', classId: C1, studentName: 'Student One', studentNumber: '101', score: 80, totalPoints: 10, mode: 'exam', date: '2026-10-05T10:00:00Z' },
      { id: 'r2', user_id: 's2', classId: C2, studentName: 'Student Two', studentNumber: '102', score: 50, totalPoints: 10, mode: 'exam', date: '2026-10-06T10:00:00Z' },
    ],
    audit_logs: [
      { id: 'a1', type: 'question', name: 'T1 question?', action: 'created', date: '2026-10-01T10:00:00Z', user: { id: T1, name: 'Teacher One', role: 'teacher' } },
      { id: 'a2', type: 'question', name: 'T2 question?', action: 'created', date: '2026-10-02T10:00:00Z', user: { id: T2, name: 'Teacher Two', role: 'teacher' } },
    ],
    settings: [],
  };
}

const els = {};
function resetEls() {
  for (const k of Object.keys(els)) delete els[k];
  els.overview = makeEl();
  els.overviewTeacherFilter = makeEl({ value: '' });
  els.overviewTeacherFilterWrap = makeEl();
  els.overviewClassFilter = makeEl({ value: '' });
  els.overviewClassFilterWrap = makeEl();
  els.overviewCategoryFilter = makeEl({ value: '' });
  els.overviewCategoryFilterWrap = makeEl();
  els.overviewStudentFilter = makeEl({ value: '' });
  els.overviewStudentFilterWrap = makeEl();
  els.overviewModeFilter = makeEl({ value: '' });
  els.overviewFilterBar = makeEl();
  els.recentActivityList = makeEl();
  els.dashboardGreeting = makeEl();
  els.categoryInsightsScopeLabel = makeEl();
  els['kpi-cat-training'] = makeEl();
  els['kpi-cat-exam'] = makeEl();
  els['kpi-cat-attempts'] = makeEl();
  els['kpi-cat-struggling'] = makeEl();
  els.categoryClassTableBody = makeEl();
  els.categoryHardList = makeEl();
  els.categoryUnattemptedLine = makeEl();
  els.scoreDistributionChart = makeEl();
}

function setRole(role, me) {
  state.role = role;
  state.me = me;
  resetEls();
}

beforeAll(() => {
  resetEls();
  seedTables();
  const sandbox = {
    console,
    window: {
      addEventListener() {},
      requestAnimationFrame: (fn) => {
        state.rafClock += 500;
        try {
          fn(state.rafClock);
        } catch (_) {
          /* ignore */
        }
        return 1;
      },
      Auth: {
        getCurrentUser: () => state.me,
        isAdmin: () => state.role === 'admin',
        isTeacher: () => state.role === 'teacher',
        getUsers: () => state.tables.users || [],
        getUserDisplayName: (u) => (u && (u.name || u.username)) || '',
      },
      currentUser: null,
      __DI_CONTAINER__: {
        repo: {
          getAll_sync: (table) => state.tables[table] || [],
          setAll_sync: (table, data) => {
            state.tables[table] = data;
          },
          getValue_sync: () => ({}),
        },
      },
    },
    document: {
      addEventListener() {},
      getElementById: (id) => els[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => makeEl(),
      head: { appendChild() {} },
      documentElement: { classList: { add() {}, remove() {} } },
      body: { classList: { add() {}, remove() {} }, appendChild() {} },
    },
    localStorage: {
      getItem: (k) => (k in state.storage ? state.storage[k] : null),
      setItem: (k, v) => {
        state.storage[k] = String(v);
      },
      removeItem: (k) => {
        delete state.storage[k];
      },
    },
    showToast: (m) => {
      state.toasts.push(String(m));
    },
    escapeHtml: (s) => String(s ?? ''),
    getOwnerLabel: (id) => (id ? String(id) : ''),
    getOwnerId: (item) =>
      item ? String(item.ownerId || item.created_by || '') || null : null,
  };
  sandbox.globalThis = sandbox;
  sandbox.window.Auth.getUsers = () => state.tables.users || [];
  ctx = vm.createContext(sandbox);
  vm.runInContext(
    readFileSync(path.join(ROOT, 'teacher-filter.js'), 'utf8'),
    ctx,
    { filename: 'teacher-filter.js' },
  );
  vm.runInContext(
    readFileSync(path.join(ROOT, 'overview-dashboard.js'), 'utf8'),
    ctx,
    { filename: 'overview-dashboard.js' },
  );
});

describe('teacher overview isolation', () => {
  it('pins teachers to themselves with only their classes', () => {
    seedTables();
    setRole('teacher', { id: T1, role: 'teacher', name: 'Teacher One' });
    const scope = vm.runInContext('getOverviewScope()', ctx);
    expect(scope).toEqual({ teacherId: T1, classId: '', categoryId: '', studentId: '' });
    const classes = vm.runInContext(
      'overviewScopeClasses().map((c) => c.id)',
      ctx,
    );
    expect(classes).toEqual([C1]);
  });

  it('activity feed contains only own activities and students', () => {
    seedTables();
    setRole('teacher', { id: T1, role: 'teacher', name: 'Teacher One' });
    const dump = vm.runInContext('JSON.stringify(getAllActivities())', ctx);
    expect(dump).toContain('T1 question?');
    expect(dump).toContain('T1 Exam');
    expect(dump).toContain('Student One');
    expect(dump).not.toContain('T2 question?');
    expect(dump).not.toContain('T2 Exam');
    expect(dump).not.toContain('Student Two');
    expect(dump).not.toContain('Teacher Two');
  });

  it('results and students narrow to own classes', () => {
    seedTables();
    setRole('teacher', { id: T1, role: 'teacher', name: 'Teacher One' });
    expect(
      vm.runInContext(
        'scopeResultRows(window.__DI_CONTAINER__.repo.getAll_sync("results")).map((r) => r.id)',
        ctx,
      ),
    ).toEqual(['r1']);
  });

  it('recent activity renders without other teachers', () => {
    seedTables();
    setRole('teacher', { id: T1, role: 'teacher', name: 'Teacher One' });
    vm.runInContext('renderRecentActivity();', ctx);
    const html = els.recentActivityList.innerHTML;
    expect(html).not.toContain('Teacher Two');
    expect(html).not.toContain('T2 Exam');
  });
});

describe('admin overview filters', () => {
  it('sees everything with no filter', () => {
    seedTables();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    const dump = vm.runInContext('JSON.stringify(getAllActivities())', ctx);
    expect(dump).toContain('T1 Exam');
    expect(dump).toContain('T2 Exam');
    expect(dump).toContain('Student One');
    expect(dump).toContain('Student Two');
    expect(
      vm.runInContext('overviewScopeClasses().map((c) => c.id).sort()', ctx),
    ).toEqual([C1, C2]);
  });

  it('teacher filter narrows to that teacher', () => {
    seedTables();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    vm.runInContext('initDashboard();', ctx);
    els.overviewTeacherFilter.value = T2;
    const dump = vm.runInContext('JSON.stringify(getAllActivities())', ctx);
    expect(dump).toContain('T2 Exam');
    expect(dump).not.toContain('T1 Exam');
    expect(dump).not.toContain('Student One');
    expect(dump).toContain('Student Two');
    expect(
      vm.runInContext('overviewScopeClasses().map((c) => c.id)', ctx),
    ).toEqual([C2]);
  });

  it('class filter narrows results to that class', () => {
    seedTables();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    els.overviewClassFilter.value = C1;
    const dump = vm.runInContext(
      'JSON.stringify(scopeResultRows(window.__DI_CONTAINER__.repo.getAll_sync("results")))',
      ctx,
    );
    expect(dump).toContain('Student One');
    expect(dump).not.toContain('Student Two');
  });
});

const MATH = 'math-uuid-1';
const ADDITION = 'addition-uuid-1';

function seedInsights() {
  seedTables();
  state.tables.categories.push(
    { id: MATH, name: 'Math', created_by: T1, color: '#3b82f6', parent_id: null },
    { id: ADDITION, name: 'Addition', created_by: T1, color: '#3b82f6', parent_id: MATH },
  );
  state.tables.questions.push(
    { id: 'q10', question: 'What is 2 + 2?', type: 'mcq', answer: '4', dateCreated: '2026-10-07T10:00:00Z', created_by: T1, category: ADDITION },
    { id: 'q11', question: 'Capital of France?', type: 'mcq', answer: 'Paris', dateCreated: '2026-10-07T11:00:00Z', created_by: T1, category: ADDITION },
    { id: 'q12', question: 'Unattempted one?', type: 'mcq', answer: 'X', dateCreated: '2026-10-07T12:00:00Z', created_by: T1, category: ADDITION },
  );
  state.tables.results.push(
    { id: 'r10', user_id: 's1', classId: C1, studentName: 'Student One', studentNumber: '101', score: 50, totalPoints: 10, mode: 'training', date: '2026-10-08T10:00:00Z', answers_json: { q10: '4', q11: 'London' } },
    { id: 'r11', user_id: 's1', classId: C1, studentName: 'Student One', studentNumber: '101', score: 0, totalPoints: 10, mode: 'exam', date: '2026-10-08T11:00:00Z', answers_json: { q10: '5' } },
    { id: 'r12', user_id: 's2', classId: C2, studentName: 'Student Two', studentNumber: '102', score: 0, totalPoints: 10, mode: 'training', date: '2026-10-08T12:00:00Z', answers_json: { q11: 'Rome' } },
  );
}

describe('category insights', () => {
  it('computes training vs exam accuracy, attempts and struggling', () => {
    seedInsights();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    vm.runInContext('initDashboard();', ctx);
    const stats = vm.runInContext('getOverviewCategoryStats()', ctx);
    expect(stats.totals.attempts).toBe(4);
    expect([stats.totals.training.a, stats.totals.training.c]).toEqual([3, 1]);
    expect([stats.totals.exam.a, stats.totals.exam.c]).toEqual([1, 0]);
    const q = (id) => stats.perQuestion.get(id);
    expect([q('q10').attempts, q('q10').correct]).toEqual([2, 1]);
    expect([q('q11').attempts, q('q11').correct]).toEqual([2, 0]);
    expect(q('q12')).toBeUndefined();
    const c1 = stats.perClass.get(C1);
    expect([c1.attempts, c1.training.a, c1.training.c, c1.exam.a]).toEqual([3, 2, 1, 1]);
  });

  it('renders KPI cards, class table, hard list and unattempted line', () => {
    seedInsights();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    vm.runInContext('initDashboard();', ctx);
    expect(els['kpi-cat-training'].textContent).toBe('33%');
    expect(els['kpi-cat-exam'].textContent).toBe('0%');
    expect(els['kpi-cat-attempts'].textContent).toBe('4');
    expect(els['kpi-cat-struggling'].textContent).toBe('1');
    expect(els.categoryInsightsScopeLabel.textContent).toBe('All data');
    const tableHtml = els.categoryClassTableBody.innerHTML;
    expect(tableHtml).toContain('Class One');
    expect(tableHtml).toContain('Class Two');
    const hardHtml = els.categoryHardList.innerHTML;
    expect(hardHtml).toContain('Capital of France?');
    expect(hardHtml.indexOf('Capital of France?')).toBeLessThan(
      hardHtml.indexOf('What is 2 + 2?'),
    );
    expect(els.categoryUnattemptedLine.textContent).toBe(
      '3 questions not attempted yet',
    );
  });

  it('category filter rolls the subtree up and narrows the charts', () => {
    seedInsights();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    vm.runInContext('initDashboard();', ctx);
    // The picker lists the child indented under its parent.
    const labels = els.overviewCategoryFilter.children.map((o) => o.textContent);
    expect(labels).toContain('Math');
    expect(labels.some((t) => t.includes('Addition'))).toBe(true);
    // Filtering by the parent still covers the subcategory answers.
    els.overviewCategoryFilter.value = MATH;
    vm.runInContext('initDashboard();', ctx);
    expect(els['kpi-cat-attempts'].textContent).toBe('4');
    expect(els.categoryInsightsScopeLabel.textContent).toContain('Math');
    // Charts follow: uncategorized-only filter empties them.
    els.overviewCategoryFilter.value = 'uncategorized';
    vm.runInContext('initDashboard();', ctx);
    expect(els.scoreDistributionChart.innerHTML).toContain('chart-empty');
    els.overviewCategoryFilter.value = ADDITION;
    vm.runInContext('initDashboard();', ctx);
    expect(els.scoreDistributionChart.innerHTML).toContain('bar-group');
  });

  it('teacher scope restricts insights to own data', () => {
    seedInsights();
    setRole('teacher', { id: T1, role: 'teacher', name: 'Teacher One' });
    vm.runInContext('initDashboard();', ctx);
    // r12 belongs to the other class: excluded from teacher 1.
    expect(els['kpi-cat-attempts'].textContent).toBe('3');
    expect(els.categoryClassTableBody.innerHTML).toContain('Class One');
    expect(els.categoryClassTableBody.innerHTML).not.toContain('Class Two');
  });
});

describe('student filter', () => {
  it('lists nothing until a class is chosen', () => {
    seedTables();
    setRole('teacher', { id: T1, role: 'teacher', name: 'Teacher One' });
    vm.runInContext('initDashboard();', ctx);
    // Only the static "All Students" option (innerHTML string) plus the
    // appended hint node: no student options are built without a class.
    expect(els.overviewStudentFilter.innerHTML).toContain('All Students');
    expect(
      els.overviewStudentFilter.children.map((o) => o.textContent),
    ).toEqual(['Select a class first']);
  });

  it('lists only the selected class students with readable labels', () => {
    seedTables();
    setRole('teacher', { id: T1, role: 'teacher', name: 'Teacher One' });
    els.overviewClassFilter.value = C1;
    vm.runInContext('initDashboard();', ctx);
    const labels = els.overviewStudentFilter.children.map((o) => o.textContent);
    expect(labels).toContain('#101 - Student One');
    expect(labels.some((t) => t.includes('Student Two'))).toBe(false);
  });

  it('narrows results, activity and insights to the student', () => {
    seedInsights();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    els.overviewClassFilter.value = C1;
    vm.runInContext('initDashboard();', ctx);
    els.overviewStudentFilter.value = 's1';
    vm.runInContext('initDashboard();', ctx);
    const results = vm.runInContext(
      'scopeResultRows(window.__DI_CONTAINER__.repo.getAll_sync("results")).map((r) => r.id).sort()',
      ctx,
    );
    expect(results).toEqual(['r1', 'r10', 'r11']);
    // Classes focus the student's class; scope label names them.
    expect(
      vm.runInContext('overviewScopeClasses().map((c) => c.id)', ctx),
    ).toEqual([C1]);
    vm.runInContext('renderRecentActivity();', ctx);
    expect(els.recentActivityList.innerHTML).not.toContain('Student Two');
    // Insights follow: only s1 attempts counted.
    expect(els['kpi-cat-attempts'].textContent).toBe('3');
    expect(els.categoryInsightsScopeLabel.textContent).toContain('#101');
  });

  it('matches legacy rows by student number too', () => {
    seedTables();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    els.overviewStudentFilter.value = '101';
    const results = vm.runInContext(
      'scopeResultRows(window.__DI_CONTAINER__.repo.getAll_sync("results")).map((r) => r.id)',
      ctx,
    );
    expect(results).toEqual(['r1']);
  });

  it('student outside the class scope yields empty views', () => {
    seedTables();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    // Incoherent combination (s2 is not in c1): the scope functions stay
    // honest and match nothing. (The UI prevents this state: picking a
    // class resets the student pick.)
    els.overviewClassFilter.value = C1;
    els.overviewStudentFilter.value = 's2';
    expect(
      vm.runInContext(
        'scopeResultRows(window.__DI_CONTAINER__.repo.getAll_sync("results"))',
        ctx,
      ),
    ).toEqual([]);
    expect(vm.runInContext('overviewScopeClasses()', ctx)).toEqual([]);
    const scoped = vm.runInContext('overviewScopedStudents()', ctx);
    expect(scoped.ids.size + scoped.numeros.size).toBe(0);
  });

  it('class pick constrains the student options', () => {
    seedTables();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    els.overviewClassFilter.value = C1;
    vm.runInContext('initDashboard();', ctx);
    const labels = els.overviewStudentFilter.children.map((o) => o.textContent);
    expect(labels).toContain('#101 - Student One');
    expect(labels.some((t) => t.includes('Student Two'))).toBe(false);
  });

  it('top-bar mode drives both charts', () => {
    seedInsights();
    setRole('admin', { id: 'admin-1', role: 'admin', name: 'Admin' });
    els.overviewModeFilter.value = 'exam';
    vm.runInContext('initDashboard();', ctx);
    // Only the exam result counts: one attempt scoring 0 -> full 0-5/20 bar.
    expect(els.scoreDistributionChart.innerHTML).toContain('100%');
    els.overviewModeFilter.value = 'training';
    vm.runInContext('initDashboard();', ctx);
    // Two training attempts split across buckets -> 50% each.
    expect(els.scoreDistributionChart.innerHTML).toContain('50%');
  });

  it('hides authored entries when a student is selected', () => {
    seedTables();
    setRole('teacher', { id: T1, role: 'teacher', name: 'Teacher One' });
    els.overviewStudentFilter.value = 's1';
    const dump = vm.runInContext('JSON.stringify(getAllActivities())', ctx);
    expect(dump).not.toContain('T1 question?');
    expect(dump).toContain('Student One');
  });
});

describe('overview markup', () => {
  it('exposes all four filters plus the mobile toggle in admin.html', () => {
    const html = readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    for (const id of [
      'overviewTeacherFilter',
      'overviewClassFilter',
      'overviewCategoryFilter',
      'overviewStudentFilter',
      'overviewModeFilter',
      'overviewFilterBar',
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain('data-filter-target="#overviewFilterBar"');
    expect(html).toContain('toggleMobileFilters(this)');
    // Per-chart filters were consolidated into the top bar.
    expect(html).not.toContain('id="scoreDistributionMode"');
    expect(html).not.toContain('id="classPerformanceMode"');
    expect(html).not.toContain('id="classPerformanceClassFilter"');
    // Category Insights sits right after Advanced Insights.
    const advancedAt = html.indexOf('Advanced Insights');
    const categoryAt = html.indexOf('id="categoryInsightsPanel"');
    const reportsAt = html.indexOf('Reports Grid');
    expect(advancedAt).toBeGreaterThanOrEqual(0);
    expect(categoryAt).toBeGreaterThan(advancedAt);
    expect(reportsAt).toBeGreaterThan(categoryAt);
  });
});
