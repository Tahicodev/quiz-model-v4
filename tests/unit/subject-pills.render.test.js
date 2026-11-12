/**
 * tests/unit/subject-pills.render.test.js
 *
 * Rendering contract of the Subjects tab:
 *  - the pill bar is the segmented control (one pill per subject + leftover
 *    unassigned courses + the dashed "New" pill) and only one pill carries .active;
 *  - game-generated `Kids · …` buckets are not pills;
 *  - the category tree is scoped to the selected subject;
 *  - the synthetic "Uncategorized" row is not repeated under every subject;
 *  - a subject without a branch yet renders an empty state instead of a
 *    blank table;
 *  - the Manage Subjects table reports per-subject category/course counts.
 *
 * category-management.js is a classic browser script (no modules), so it is
 * loaded with node:vm into a sandbox with stubbed browser globals.
 */

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { installRowActions } from './helpers/rowActions.js';

const ROOT = process.cwd();
let ctx;

const SUBJECT_MATH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUBJECT_SCIENCE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUBJECT_EMPTY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const ALGEBRA = '11111111-1111-4111-8111-111111111111';
const LINEAR = '22222222-2222-4222-8222-222222222222';
const PHYSICS = '33333333-3333-4333-8333-333333333333';
const LEGACY = '44444444-4444-4444-8444-444444444444';

const state = {
  questions: [],
  categories: [],
  courses: [],
  subjects: [],
  toasts: [],
  updatePayloads: [],
  createPayloads: [],
  focused: 0,
  categoryModalOpens: 0,
};

// openTabAndHighlight lives in admin-main.js; here it only records the jump.
const jumps = [];

function makeEl(over = {}) {
  const el = {
    value: '',
    textContent: '',
    dataset: {},
    children: [],
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    removeAttribute() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
    get options() {
      return this.children;
    },
    ...over,
  };
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

function makeRow() {
  return {
    attrs: {},
    style: {},
    innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    addEventListener() {},
    querySelector: () => null,
  };
}

const treeBody = makeEl();
const managerBody = makeEl();
const pillBar = makeEl();
const bandTitle = makeEl();
const managerTable = makeEl();

let els;

beforeAll(() => {
  els = {
    subjectTabBar: pillBar,
    categoryBandTitle: bandTitle,
    subjectManagerList: managerTable,
    subjectManagerModal: makeEl({ style: { display: 'none' } }),
    newSubjectName: makeEl({ value: '', focus() { state.focused++; } }),
    categorySearch: makeEl({ value: '' }),
    categorySortBy: makeEl({ value: 'name' }),
    categoryList: makeEl(),
    // Create-category form (only reached once a subject owns the row).
    categoryModalTitle: makeEl(),
    categoryForm: makeEl({ reset() {} }),
    categoryColor: makeEl({ value: '' }),
    categoryTraining: makeEl({ checked: false }),
    categorySubject: makeEl({ value: '', disabled: false }),
  };
  const sandbox = {
    console,
    confirm: () => true,
    prompt: () => null,
    isAutoGameCategory: (c) => String((c && c.name) || '').startsWith('Kids · '),
    window: {
      addEventListener() {},
      Auth: {
        getCurrentUser: () => ({ id: 't1' }),
        isAdmin: () => true,
      },
      API: {
        create: async (entity, payload) => {
          state.createPayloads.push([entity, payload]);
          return { id: 'subject-created', name: payload.name, created_by: 't1' };
        },
        update: async (entity, id, payload) => {
          state.updatePayloads.push([entity, id, payload]);
          return { id, ...payload };
        },
        raw: async () => ({}),
        remove: async () => null,
      },
      __DI_CONTAINER__: {
        repo: {
          getAll_sync: (table) => {
            if (table === 'questions') return state.questions;
            if (table === 'courses') return state.courses;
            if (table === 'subjects') return state.subjects;
            return [];
          },
          setAll_sync: (table, data) => {
            if (table === 'questions') state.questions = data;
            if (table === 'courses') state.courses = data;
            if (table === 'subjects') state.subjects = data;
          },
          getValue_sync: () => ({}),
        },
      },
      CoursesManagement: {
        refresh: () => Promise.resolve(),
        getCourses: () => state.courses,
      },
      BulkSelect: {
        getSelectedIds: () => [],
        clear() {},
        restore() {},
        removeIds() {},
      },
    },
    document: {
      addEventListener() {},
      getElementById: (id) => els[id] || null,
      querySelector: (sel) => {
        if (sel === '#categoryList tbody') return treeBody;
        if (sel === '#subjectManagerList tbody') return managerBody;
        return null;
      },
      querySelectorAll: () => [],
      elementFromPoint: () => null,
      createElement: (tag) => (tag === 'tr' ? makeRow() : makeEl()),
      head: { appendChild() {} },
      documentElement: { classList: { add() {}, remove() {} } },
      body: { classList: { add() {}, remove() {} }, appendChild: (c) => c },
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    showToast: (message) => {
      state.toasts.push(String(message));
    },
    escapeHtml: (s) => String(s ?? ''),
    getOwnerLabel: (id) => (id ? String(id) : 'Shared'),
  };
  sandbox.globalThis = sandbox;
  ctx = vm.createContext(sandbox);
  // The row templates paint through the shared row-action bar.
  installRowActions(ctx);
  const src = readFileSync(path.join(ROOT, 'category-management.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'category-management.js' });

  state.subjects = [
    { id: SUBJECT_MATH, name: 'Mathematics', created_by: 't1' },
    { id: SUBJECT_SCIENCE, name: 'Science', created_by: 't1' },
    { id: SUBJECT_EMPTY, name: 'Geography', created_by: 't1' },
  ];
  state.categories = [
    {
      id: ALGEBRA,
      name: 'Algebra',
      color: '#3b82f6',
      questionCount: 0,
      dateCreated: '2026-01-01',
      isSystem: false,
      created_by: 't1',
      ownerId: 't1',
      parent_id: null,
      subject_id: SUBJECT_MATH,
    },
    {
      id: LINEAR,
      name: 'Linear equations',
      color: '#f59e0b',
      questionCount: 0,
      dateCreated: '2026-01-02',
      isSystem: false,
      created_by: 't1',
      ownerId: 't1',
      parent_id: ALGEBRA,
      subject_id: SUBJECT_MATH,
    },
    {
      id: PHYSICS,
      name: 'Physics',
      color: '#10b981',
      questionCount: 0,
      dateCreated: '2026-01-03',
      isSystem: false,
      created_by: 't1',
      ownerId: 't1',
      parent_id: null,
      subject_id: SUBJECT_SCIENCE,
    },
    {
      id: LEGACY,
      name: 'Old branch',
      color: '#8b5cf6',
      questionCount: 0,
      dateCreated: '2026-01-04',
      isSystem: false,
      created_by: 't1',
      ownerId: 't1',
      parent_id: null,
    },
    {
      id: 'kids-bb',
      name: 'Kids · BB',
      color: '#ec4899',
      questionCount: 0,
      dateCreated: '2026-01-05',
      isSystem: false,
      created_by: 't1',
      ownerId: 't1',
      parent_id: null,
    },
  ];
  state.questions = [
    { id: 'q-1', question: '2+2?', category: ALGEBRA, category_id: ALGEBRA },
    { id: 'q-2', question: 'loose', category: '', category_id: null },
    { id: 'q-3', question: 'legacy', category: LEGACY, category_id: LEGACY },
  ];
  state.courses = [
    { id: 'course-1', category_id: ALGEBRA, subject_id: SUBJECT_MATH },
    { id: 'course-2', category_id: PHYSICS, subject_id: SUBJECT_SCIENCE },
    { id: 'course-3', name: 'Old course', category_id: LEGACY, subject_id: null },
  ];
  vm.runInContext(
    `categories = ${JSON.stringify(state.categories)};
     categorySubjects = ${JSON.stringify(state.subjects)};
     activeCategorySubjectId = ${JSON.stringify(SUBJECT_MATH)};`,
    ctx,
  );
  // Real entry point: the nav tab calls SubjectsManagement.refresh(), which
  // reads the subject mirror and paints the pill bar.
  vm.runInContext('window.SubjectsManagement.refresh();', ctx);
  sandbox.window.openTabAndHighlight = (event, tab, id) => {
    jumps.push([tab, id]);
  };
  sandbox.window.openCategoryModalProbe = () => {
    state.categoryModalOpens++;
  };
});

function rowsHtml() {
  return treeBody.children.map((r) => String(r.innerHTML));
}

function selectSubject(id) {
  vm.runInContext(`selectCategorySubject('${id}');`, ctx);
}

function selectLeftover(key) {
  vm.runInContext(`selectLegacyWorkspaceItem('${key}');`, ctx);
}

const LEFTOVER_COURSE = 'course:course-3';

describe('subject pill bar', () => {
  it('renders one pill per subject plus leftover unassigned courses and the new pill', () => {
    const html = pillBar.innerHTML;
    expect(html).toContain('>Mathematics</button>');
    expect(html).toContain('>Science</button>');
    expect(html).toContain('>Geography</button>');
    expect(html).toContain('>Old course</button>');
    expect(html).not.toContain('Unassigned (legacy)');
    expect(html).not.toContain('Kids · BB');
    expect(html).toContain('subject-pill-new');
    expect((html.match(/class="games-studio-tab-btn/g) || []).length).toBe(5);
  });

  it('marks exactly one pill active and keeps the segmented-control classes', () => {
    selectSubject(SUBJECT_SCIENCE);
    const html = pillBar.innerHTML;
    expect((html.match(/ active/g) || []).length).toBe(1);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('subject-pill active');
    expect(bandTitle.textContent).toBe('Science · All categories');
    selectSubject(SUBJECT_MATH);
    expect(bandTitle.textContent).toBe('Mathematics · All categories');
  });

  it('the leftover unassigned course pill is active when selected', () => {
    selectLeftover(LEFTOVER_COURSE);
    expect(pillBar.innerHTML).toContain('data-legacy-key="course:course-3"');
    expect(pillBar.innerHTML).toMatch(/aria-selected="true"[^>]*data-legacy-key="course:course-3"|data-legacy-key="course:course-3"[^>]*aria-selected="true"/);
    expect(bandTitle.textContent).toBe('Old course · Structure of Old course');
    selectSubject(SUBJECT_MATH);
  });
});

describe('category tree scoped by subject', () => {
  it('shows only the selected subject branch', () => {
    selectSubject(SUBJECT_MATH);
    const rows = rowsHtml();
    expect(rows.some((r) => r.includes('>Algebra<'))).toBe(true);
    expect(rows.some((r) => r.includes('>Linear equations<'))).toBe(true);
    expect(rows.some((r) => r.includes('>Physics<'))).toBe(false);
    expect(rows.some((r) => r.includes('>Old branch<'))).toBe(false);
  });

  it('does not repeat the synthetic Uncategorized row inside a subject', () => {
    selectSubject(SUBJECT_MATH);
    expect(rowsHtml().some((r) => r.includes('>Uncategorized<'))).toBe(false);
    selectSubject(SUBJECT_SCIENCE);
    expect(rowsHtml().some((r) => r.includes('>Uncategorized<'))).toBe(false);
  });

  it('opens a leftover unassigned course onto its own structure, not a dump tab', () => {
    selectLeftover(LEFTOVER_COURSE);
    expect(rowsHtml().some((r) => r.includes('>Old branch<'))).toBe(true);
    expect(rowsHtml().some((r) => r.includes('>Kids · BB<'))).toBe(false);
    expect(rowsHtml().some((r) => r.includes('>Uncategorized<'))).toBe(false);
    selectSubject(SUBJECT_MATH);
    expect(rowsHtml().some((r) => r.includes('>Uncategorized<'))).toBe(false);
  });

  it('rolls the subtree count up to the branch root', () => {
    selectSubject(SUBJECT_MATH);
    const algebra = rowsHtml().find((r) => r.includes('>Algebra<'));
    expect(algebra).toMatch(/<td>1<\/td>/);
  });
});

describe('subject without categories', () => {
  it('renders an empty state instead of a blank table', () => {
    selectSubject(SUBJECT_EMPTY);
    expect(treeBody.children.length).toBe(0);
    expect(treeBody.innerHTML).toContain('No categories in this subject yet');
    expect(treeBody.innerHTML).toContain('colspan="8"');
    selectSubject(SUBJECT_MATH);
    expect(treeBody.innerHTML).not.toContain('No categories in this subject yet');
  });
});

describe('manage subjects table', () => {
  it('lists each subject with its category and course counts', () => {
    vm.runInContext('renderSubjectManagerTable();', ctx);
    const html = managerBody.innerHTML;
    expect(html).toContain('value="Mathematics"');
    expect(html).toContain('subject-checkbox');
    expect(html).toContain('onclick="renameSubjectViaModal');
    expect(html).toContain('onclick="deleteSubject');
    // Row actions reuse the app's icon-button pattern (same as the category
    // and exam tables), which is what makes them dark-mode aware.
    expect(html).toContain('<div class="exam-actions">');
    expect(html).toContain('exam-action-btn exam-delete-btn');
    const mathRow = html.split('<tr data-id="').find((chunk) => chunk.startsWith(SUBJECT_MATH));
    const cells = mathRow.match(/data-label="Categories">(\d+)<\/td>/);
    const courseCells = mathRow.match(/data-label="Courses">(\d+)<\/td>/);
    expect(cells[1]).toBe('2');
    expect(courseCells[1]).toBe('1');
    const scienceRow = html.split('<tr data-id="').find((chunk) => chunk.startsWith(SUBJECT_SCIENCE));
    expect(scienceRow).toMatch(/data-label="Categories">1<\/td>/);
    expect(scienceRow).toMatch(/data-label="Courses">1<\/td>/);
    const emptyRow = html.split('<tr data-id="').find((chunk) => chunk.startsWith(SUBJECT_EMPTY));
    expect(emptyRow).toMatch(/data-label="Categories">0<\/td>/);
    expect(emptyRow).toMatch(/data-label="Courses">0<\/td>/);
  });

  it('renaming refreshes the pill label through the shared subject list', async () => {
    await vm.runInContext(
      `renameSubjectViaModal('${SUBJECT_SCIENCE}', { tagName: 'INPUT', value: 'Physics & Chem' });`,
      ctx,
    );
    expect(state.updatePayloads).toEqual([['subjects', SUBJECT_SCIENCE, { name: 'Physics & Chem' }]]);
    expect(pillBar.innerHTML).toContain('>Physics &amp; Chem</button>');
    // restore for the remaining specs
    await vm.runInContext(
      `renameSubjectViaModal('${SUBJECT_SCIENCE}', { tagName: 'INPUT', value: 'Science' });`,
      ctx,
    );
    expect(pillBar.innerHTML).toContain('>Science</button>');
  });
});

// Courses are server-backed and deliberately not part of the localStorage
// mirror, so the manager reads them from the Courses tab cache.
describe('course counts come from the Courses tab cache', () => {
  it('prefers the module cache and falls back to the mirror', () => {
    const mirror = state.courses;
    const management = ctx.window.CoursesManagement;
    const originalGetCourses = management.getCourses;
    try {
      // Real app state right after a page load: empty mirror, loaded tab cache.
      state.courses = [];
      management.getCourses = () => [
        { id: 'c-a', category_id: ALGEBRA, subject_id: SUBJECT_MATH },
        { id: 'c-b', category_id: PHYSICS, subject_id: SUBJECT_SCIENCE },
        { id: 'c-c', category_id: null, subject_id: SUBJECT_MATH },
      ];
      vm.runInContext('renderSubjectManagerTable();', ctx);
      const html = managerBody.innerHTML;
      const mathRow = html.split('<tr data-id="').find((chunk) => chunk.startsWith(SUBJECT_MATH));
      expect(mathRow).toMatch(/data-label="Courses">2<\/td>/);
      // No cache at all: the mirror is consulted instead.
      state.courses = mirror;
      delete management.getCourses;
      vm.runInContext('renderSubjectManagerTable();', ctx);
      const mathRowAgain = managerBody.innerHTML
        .split('<tr data-id="')
        .find((chunk) => chunk.startsWith(SUBJECT_MATH));
      expect(mathRowAgain).toMatch(/data-label="Courses">1<\/td>/);
    } finally {
      // Later specs rely on the Courses tab cache to resolve leftover pills.
      state.courses = mirror;
      management.getCourses = originalGetCourses;
    }
  });
});

// Naming a subject happens inside the manager modal (no browser prompt), so
// the flow is testable and matches the rest of the app's forms.
describe('creating a subject from the manager modal', () => {
  it('adds the pill, selects it and clears the field', async () => {
    els.newSubjectName.value = ' History ';
    const created = await vm.runInContext('window.createSubjectViaModal();', ctx);

    expect(state.createPayloads).toEqual([['subjects', { name: 'History' }]]);
    expect(created.name).toBe('History');
    expect(els.newSubjectName.value).toBe('');
    expect(pillBar.innerHTML).toContain('>History</button>');
    expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe('subject-created');
    expect(bandTitle.textContent).toBe('History · All categories');
    expect(managerBody.innerHTML).toContain('value="History"');

    // Leave the fixture untouched for anything running after this spec.
    state.subjects = state.subjects.filter((s) => s.id !== 'subject-created');
    vm.runInContext('window.SubjectsManagement.refresh();', ctx);
    expect(pillBar.innerHTML).not.toContain('>History</button>');
  });

  it('refuses an empty name and focuses the field', async () => {
    state.toasts = [];
    els.newSubjectName.value = '   ';
    const before = state.createPayloads.length;
    const created = await vm.runInContext('window.createSubjectViaModal();', ctx);

    expect(created).toBeNull();
    expect(state.createPayloads.length).toBe(before);
    expect(state.toasts.join(' ')).toContain('Type a subject name first');
    expect(state.focused).toBeGreaterThan(0);
  });

  it('refuses a duplicate subject name', async () => {
    state.toasts = [];
    els.newSubjectName.value = 'science';
    const before = state.createPayloads.length;
    const created = await vm.runInContext('window.createSubjectViaModal();', ctx);

    expect(created).toBeNull();
    expect(state.createPayloads.length).toBe(before);
    expect(state.toasts.join(' ')).toContain('already exists');
  });

  it('the + New pill opens the modal instead of a prompt', () => {
    // The spy goes through the shared stub (and is restored): other specs
    // count focus calls through state.focused too.
    const original = els.newSubjectName.focus;
    const before = state.focused;
    els.newSubjectName.focus = function () {
      state.focused++;
    };
    try {
      vm.runInContext('createNewSubjectFlow();', ctx);
      expect(els.subjectManagerModal.style.display).toBe('flex');
      expect(state.focused).toBe(before + 1);
    } finally {
      els.newSubjectName.focus = original;
      els.subjectManagerModal.style.display = 'none';
    }
  });
});

// Refreshing the tab must not silently move the selection: a leftover course
// tab is a real place, and losing it would show one subject's tree under a
// band titled another.
describe('selection survives a refresh', () => {
  afterEach(() => {
    selectSubject(SUBJECT_MATH);
  });

  it('keeps the leftover course tab selected and its tree visible', () => {
    selectLeftover(LEFTOVER_COURSE);
    vm.runInContext('window.SubjectsManagement.refresh();', ctx);

    expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe('__unassigned__');
    expect(vm.runInContext('activeLegacyWorkspaceKey', ctx)).toBe(LEFTOVER_COURSE);
    expect(pillBar.innerHTML).toMatch(/aria-selected="true"[^>]*data-legacy-key="course:course-3"|data-legacy-key="course:course-3"[^>]*aria-selected="true"/);
    expect(bandTitle.textContent).toBe('Old course · Structure of Old course');
    expect(rowsHtml().some((r) => r.includes('>Old branch<'))).toBe(true);
  });

  it('falls back to the first remaining subject when the selection is gone', () => {
    selectLeftover(LEFTOVER_COURSE);
    const treeBefore = rowsHtml().join('|');
    vm.runInContext("activeCategorySubjectId = 'subject-deleted';", ctx);
    vm.runInContext("activeLegacyWorkspaceKey = '';", ctx);
    vm.runInContext('window.SubjectsManagement.refresh();', ctx);

    expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe(SUBJECT_MATH);
    expect(pillBar.innerHTML).toContain('subject-pill active');
    // The repaint is the point: a band title describing one subject over the
    // tree of another is the exact desync the browser audit caught.
    expect(rowsHtml().join('|')).not.toBe(treeBefore);
    expect(rowsHtml().some((r) => r.includes('>Algebra<'))).toBe(true);
    expect(bandTitle.textContent).toBe('Mathematics · All categories');
  });

  it('falls back to leftover unassigned courses when the last subject is deleted', () => {
    const saved = state.subjects;
    try {
      state.subjects = [];
      vm.runInContext('window.SubjectsManagement.refresh();', ctx);

      expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe('__unassigned__');
      expect(vm.runInContext('activeLegacyWorkspaceKey', ctx)).toBe(LEFTOVER_COURSE);
      expect(pillBar.innerHTML).toContain('>Old course</button>');
      expect(pillBar.innerHTML).not.toContain('Unassigned (legacy)');
      expect(rowsHtml().some((r) => r.includes('>Old branch<'))).toBe(true);
    } finally {
      state.subjects = saved;
      vm.runInContext('window.SubjectsManagement.refresh();', ctx);
    }
  });
});

// The mirror paints instantly but the server owns the list: a subject deleted
// from another device must not stay alive as a pill forever.
describe('reconciling the pill bar with the server', () => {
  it('replaces a stale mirror, repaints pills and reselects', async () => {
    const serverRows = [
      { id: SUBJECT_MATH, name: 'Mathematics', created_by: 't1' },
      { id: SUBJECT_SCIENCE, name: 'Science renamed', created_by: 't1' },
    ];
    ctx.window.API.list = async (entity) => ({ data: entity === 'subjects' ? serverRows : [] });
    try {
      selectSubject(SUBJECT_EMPTY);
      vm.runInContext('window.SubjectsManagement.refresh();', ctx);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(state.subjects.map((s) => s.id)).toEqual([SUBJECT_MATH, SUBJECT_SCIENCE]);
      expect(pillBar.innerHTML).toContain('>Science renamed</button>');
      expect(pillBar.innerHTML).not.toContain('>Geography</button>');
      // Geography vanished, so the selection moved to a subject that exists.
      expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe(SUBJECT_MATH);
      expect(bandTitle.textContent).toBe('Mathematics · All categories');
    } finally {
      delete ctx.window.API.list;
      state.subjects = [
        { id: SUBJECT_MATH, name: 'Mathematics', created_by: 't1' },
        { id: SUBJECT_SCIENCE, name: 'Science', created_by: 't1' },
        { id: SUBJECT_EMPTY, name: 'Geography', created_by: 't1' },
      ];
      vm.runInContext('window.SubjectsManagement.refresh();', ctx);
      selectSubject(SUBJECT_MATH);
    }
  });

  it('leaves the UI untouched when the server agrees with the mirror', async () => {
    ctx.window.API.list = async () => ({ data: state.subjects.map((s) => ({ ...s })) });
    try {
      vm.runInContext('window.SubjectsManagement.refresh();', ctx);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(pillBar.innerHTML).toContain('>Geography</button>');
      expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe(SUBJECT_MATH);
    } finally {
      delete ctx.window.API.list;
    }
  });

  it('keeps the mirror when the server call fails (offline)', async () => {
    ctx.window.API.list = async () => {
      throw new Error('network down');
    };
    try {
      vm.runInContext('window.SubjectsManagement.refresh();', ctx);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(state.subjects.length).toBe(3);
      expect(pillBar.innerHTML).toContain('>Geography</button>');
    } finally {
      delete ctx.window.API.list;
    }
  });
});

// The Overview activity feed and the quick-start wizard reach the tree from
// outside the tab. A row only exists while its subject pill is active, so a
// jump has to activate the owning pill first.
describe('cross-tab jumps into the Subjects tab', () => {
  it('activates the pill that owns the category before highlighting it', () => {
    jumps.length = 0;
    selectSubject(SUBJECT_MATH);
    vm.runInContext(`revealCategoryFromActivity({}, '${PHYSICS}')`, ctx);

    expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe(SUBJECT_SCIENCE);
    expect(bandTitle.textContent).toBe('Science · All categories');
    expect(rowsHtml().some((r) => r.includes('>Physics<'))).toBe(true);
    expect(rowsHtml().some((r) => r.includes('>Algebra<'))).toBe(false);
    expect(jumps).toEqual([['subjects', PHYSICS]]);
    selectSubject(SUBJECT_MATH);
  });

  it('sends a subject-less category to its leftover course tab', () => {
    jumps.length = 0;
    vm.runInContext(`revealCategoryFromActivity({}, '${LEGACY}')`, ctx);

    expect(vm.runInContext('activeLegacyWorkspaceKey', ctx)).toBe(LEFTOVER_COURSE);
    expect(rowsHtml().some((r) => r.includes('>Old branch<'))).toBe(true);
    expect(jumps).toEqual([['subjects', LEGACY]]);
    selectSubject(SUBJECT_MATH);
  });

  it('falls back to the first subject for a category it cannot resolve', () => {
    jumps.length = 0;
    vm.runInContext(`revealCategoryFromActivity({}, 'gone-branch')`, ctx);

    expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe(SUBJECT_MATH);
    // The jump still happens — the row simply is not there to be flashed.
    expect(jumps).toEqual([['subjects', 'gone-branch']]);
    selectSubject(SUBJECT_MATH);
  });

  it('creates a category in the first subject when the legacy pill is selected', async () => {
    const openedBefore = state.categoryModalOpens;
    vm.runInContext(
      `openCategoryModal = () => { window.openCategoryModalProbe(); };
       populateCategoryParentPicker = () => {};`,
      ctx,
    );
    selectSubject('__unassigned__');
    await vm.runInContext('createNewCategory()', ctx);

    expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe(SUBJECT_MATH);
    expect(state.categoryModalOpens).toBe(openedBefore + 1);
    // The form defaults to the pill the row will land in.
    expect(els.categorySubject.value).toBe(SUBJECT_MATH);
    selectSubject(SUBJECT_MATH);
  });

  it('opens the category form with a subject notice when no subject exists yet', async () => {
    const focusBefore = state.focused;
    const openedBefore = state.categoryModalOpens;
    const savedSubjects = state.subjects;
    try {
      state.subjects = [];
      vm.runInContext(
        `categorySubjects = []; activeCategorySubjectId = ""; currentCategoryId = null;
         openCategoryModal = () => { window.openCategoryModalProbe(); };
         populateCategoryParentPicker = () => {};`,
        ctx,
      );
      await vm.runInContext('createNewCategory()', ctx);

      // A category action must never silently create a subject pill; the form
      // opens on the category flow and points at the inline subject creator.
      expect(state.categoryModalOpens).toBe(openedBefore + 1);
      expect(els.subjectManagerModal.style.display).toBe('none');
      expect(state.focused).toBe(focusBefore);
      expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe('');
      const notice = els.categoryForm.children
        .map((child) => child.textContent)
        .join(' ');
      expect(notice).toContain('No subject exists yet');
    } finally {
      state.subjects = savedSubjects;
      vm.runInContext('window.SubjectsManagement.refresh();', ctx);
      vm.runInContext(
        `document.getElementById('subjectManagerModal').style.display = 'none';`,
        ctx,
      );
      selectSubject(SUBJECT_MATH);
    }
  });
});
