/**
 * tests/unit/category-delete.test.js
 *
 * Regression test for "Deleted 0; 1 failed on server — kept locally so you
 * can retry": deleting a category that has subcategories/questions used to
 * fail server-side. The contract is now a cascade — DELETE /categories/:id
 * removes the whole subtree server-side and sends every question under it
 * to Uncategorized — and the UI mirrors that locally without any
 * per-question PATCH.
 *
 * category-management.js is a classic browser script (no modules), so it is
 * loaded with node:vm into a sandbox with stubbed browser globals.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
let ctx;
const state = {
  questions: [],
  categories: [],
  courses: [],
  subjects: [],
  selected: [],
  rawCalls: [],
  removeCalls: [],
  courseRefreshes: 0,
  confirms: [],
  toasts: [],
  confirmResult: true,
  // Per-entity body the DELETE route answers with (the cascade report).
  removeOutcome: {},
};

function makeEl(over = {}) {
  return {
    value: '',
    checked: false,
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    removeAttribute() {},
    reset() {},
    focus() {},
    ...over,
  };
}

beforeAll(() => {
  const sandbox = {
    console,
    confirm: (message) => {
      state.confirms.push(String(message));
      return state.confirmResult !== false;
    },
    window: {
      addEventListener() {},
      Auth: { getCurrentUser: () => ({ id: 'admin-1' }) },
      API: {
        create: async () => ({}),
        update: async () => ({}),
        raw: async (method, path, body) => {
          state.rawCalls.push({ method, path, body });
          return {};
        },
        remove: async (entity, id) => {
          state.removeCalls.push([entity, id]);
          return state.removeOutcome?.[entity] ?? null;
        },
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
        refresh: () => {
          state.courseRefreshes++;
          return Promise.resolve();
        },
      },
      BulkSelect: {
        getSelectedIds: () => state.selected,
        clear: () => {},
        restore: () => {},
        removeIds: () => {},
      },
    },
    document: {
      addEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => makeEl(),
      head: { appendChild() {} },
      documentElement: { classList: { add() {}, remove() {} } },
      body: { classList: { add() {}, remove() {} }, appendChild() {} },
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    showToast: (message) => {
      state.toasts.push(String(message));
    },
  };
  sandbox.globalThis = sandbox;
  ctx = vm.createContext(sandbox);
  const src = readFileSync(
    path.join(ROOT, 'category-management.js'),
    'utf8',
  );
  vm.runInContext(src, ctx, { filename: 'category-management.js' });
  vm.runInContext(
    'updateCategoryList = () => {}; loadCategoriesIntoSelect = () => {}; loadCategoriesIntoFilters = () => {};',
    ctx,
  );
});

function resetScenario() {
  state.rawCalls = [];
  state.removeCalls = [];
  state.courses = [];
  state.subjects = [];
  state.courseRefreshes = 0;
  state.confirms = [];
  state.toasts = [];
  state.confirmResult = true;
  state.removeOutcome = {};
  state.questions = [
    {
      id: 'q-1',
      question: 'What is 2+2?',
      category: 'cat-teacher-1',
      categoryId: 'cat-teacher-1',
      category_id: 'cat-teacher-1',
    },
  ];
  state.selected = ['cat-teacher-1'];
  vm.runInContext(
    `categories = [{ id: 'cat-teacher-1', name: 'Kids · info', color: '#3b82f6',
        questionCount: 1, dateCreated: new Date().toISOString(),
        isSystem: false, created_by: 'teacher-1', ownerId: 'teacher-1' }];
     currentCategoryId = null;`,
    ctx,
  );
}

function resetParentScenario() {
  state.rawCalls = [];
  state.removeCalls = [];
  state.courses = [];
  state.subjects = [];
  state.courseRefreshes = 0;
  state.confirms = [];
  state.toasts = [];
  state.confirmResult = true;
  state.removeOutcome = {};
  // Question filed under the CHILD (leaf level) proves the local pass
  // covers the whole subtree, not just the deleted parent.
  state.questions = [
    {
      id: 'q-1',
      question: 'What is 2+2?',
      category: 'cat-child',
      categoryId: 'cat-child',
      category_id: 'cat-child',
    },
  ];
  state.selected = ['cat-parent'];
  vm.runInContext(
    `categories = [
       { id: 'cat-parent', name: 'Parent', color: '#3b82f6',
         questionCount: 0, dateCreated: new Date().toISOString(),
         isSystem: false, created_by: 'teacher-1', ownerId: 'teacher-1' },
       { id: 'cat-child', name: 'Child', color: '#ef4444',
         questionCount: 1, dateCreated: new Date().toISOString(),
         isSystem: false, created_by: 'teacher-1', ownerId: 'teacher-1',
         parent_id: 'cat-parent' }];
     currentCategoryId = null;`,
    ctx,
  );
}

describe('category delete with attached questions', () => {
  it('bulk delete cascades: one DELETE per selected row, local subtree detach', async () => {
    resetScenario();
    await vm.runInContext('deleteSelectedCategories()', ctx);

    // No per-question PATCH anymore — the server detaches on delete.
    expect(state.rawCalls).toEqual([]);
    expect(state.removeCalls).toEqual([['categories', 'cat-teacher-1']]);

    // Local mirror converges: row gone, question uncategorized.
    const remaining = vm.runInContext('categories', ctx);
    expect(remaining.find((c) => c.id === 'cat-teacher-1')).toBeUndefined();
    expect(state.questions[0].category).toBe('');
    expect(state.questions[0].category_id).toBeNull();
  });

  it('single delete cascades without question PATCHes', async () => {
    resetScenario();
    await vm.runInContext(`deleteCategory('cat-teacher-1')`, ctx);

    expect(state.rawCalls).toEqual([]);
    expect(state.removeCalls).toEqual([['categories', 'cat-teacher-1']]);
    const remaining = vm.runInContext('categories', ctx);
    expect(remaining.find((c) => c.id === 'cat-teacher-1')).toBeUndefined();
    expect(state.questions[0].category_id).toBeNull();
  });

  it('deleting a parent removes the whole subtree locally and detaches its questions', async () => {
    resetParentScenario();
    await vm.runInContext(`deleteCategory('cat-parent')`, ctx);

    // Only ONE DELETE call — the subcategory is removed by the server's
    // cascade (mirrored locally via the subtree walk).
    expect(state.removeCalls).toEqual([['categories', 'cat-parent']]);
    const remaining = vm.runInContext('categories', ctx);
    expect(remaining.find((c) => c.id === 'cat-parent')).toBeUndefined();
    expect(remaining.find((c) => c.id === 'cat-child')).toBeUndefined();
    expect(state.questions[0].category).toBe('');
    expect(state.questions[0].category_id).toBeNull();
  });

  it('delete of an empty category sends no question PATCH', async () => {
    resetScenario();
    state.questions = [];
    await vm.runInContext(`deleteCategory('cat-teacher-1')`, ctx);

    expect(state.rawCalls).toEqual([]);
    expect(state.removeCalls).toEqual([['categories', 'cat-teacher-1']]);
  });
});

// The schema FK is onDelete: SetNull, so a category delete must explicitly
// cascade to the courses generated from that branch — server-side and in the
// shared local mirror the Courses tab renders from.
describe('category delete cascades to generated courses', () => {
  function resetCourseScenario() {
    state.rawCalls = [];
    state.removeCalls = [];
    state.courseRefreshes = 0;
    state.confirms = [];
    state.toasts = [];
    state.confirmResult = true;
    state.removeOutcome = {};
    state.questions = [];
    state.subjects = [{ id: 'subject-1', name: 'Mathematics', created_by: 'teacher-1' }];
    state.courses = [
      { id: 'course-parent', category_id: 'cat-parent', subject_id: 'subject-1' },
      { id: 'course-child', category_id: 'cat-child', subject_id: 'subject-1' },
      { id: 'course-other', category_id: 'cat-else', subject_id: 'subject-2' },
      { id: 'course-manual', category_id: null, subject_id: null },
    ];
    vm.runInContext(
      `categories = [
         { id: 'cat-parent', name: 'Parent', color: '#3b82f6', questionCount: 0,
           dateCreated: new Date().toISOString(), isSystem: false,
           created_by: 'teacher-1', ownerId: 'teacher-1', subject_id: 'subject-1' },
         { id: 'cat-child', name: 'Child', color: '#ef4444', questionCount: 0,
           dateCreated: new Date().toISOString(), isSystem: false,
           created_by: 'teacher-1', ownerId: 'teacher-1',
           parent_id: 'cat-parent', subject_id: 'subject-1' },
         { id: 'cat-else', name: 'Else', color: '#22c55e', questionCount: 0,
           dateCreated: new Date().toISOString(), isSystem: false,
           created_by: 'teacher-1', ownerId: 'teacher-1', subject_id: 'subject-2' }];
       currentCategoryId = null;`,
      ctx,
    );
  }

  it('drops the courses of the deleted branch from the local mirror', async () => {
    resetCourseScenario();
    await vm.runInContext(`deleteCategory('cat-parent')`, ctx);

    expect(state.courses.map((c) => c.id).sort()).toEqual(['course-manual', 'course-other']);
    expect(state.courseRefreshes).toBe(1);
  });

  it('bulk category delete also drops their courses', async () => {
    resetCourseScenario();
    vm.runInContext(`selectedCategoryIds = ['cat-else'];`, ctx);
    state.selected = ['cat-else'];
    await vm.runInContext('deleteSelectedCategories()', ctx);

    expect(state.removeCalls).toEqual([['categories', 'cat-else']]);
    expect(state.courses.map((c) => c.id).sort()).toEqual(['course-child', 'course-manual', 'course-parent']);
    expect(state.courseRefreshes).toBe(1);
  });
});

// Deleting a subject removes its whole category forest plus the courses built
// from it (server cascade mirrored locally).
describe('subject delete cascades to categories and courses', () => {
  function resetSubjectScenario() {
    state.rawCalls = [];
    state.removeCalls = [];
    state.courseRefreshes = 0;
    state.confirms = [];
    state.toasts = [];
    state.confirmResult = true;
    state.removeOutcome = {};
    state.questions = [
      { id: 'q-1', question: '2+2', category: 'cat-math', categoryId: 'cat-math', category_id: 'cat-math' },
    ];
    state.subjects = [
      { id: 'subject-1', name: 'Mathematics', created_by: 'teacher-1' },
      { id: 'subject-2', name: 'Science', created_by: 'teacher-1' },
    ];
    state.courses = [
      { id: 'course-math', category_id: 'cat-math', subject_id: 'subject-1' },
      { id: 'course-orphan', category_id: 'cat-math-leaf', subject_id: null },
      { id: 'course-science', category_id: 'cat-science', subject_id: 'subject-2' },
    ];
    vm.runInContext(
      `categorySubjects = [
         { id: 'subject-1', name: 'Mathematics', created_by: 'teacher-1' },
         { id: 'subject-2', name: 'Science', created_by: 'teacher-1' }];
       activeCategorySubjectId = 'subject-1';
       categories = [
         { id: 'cat-math', name: 'Algebra', color: '#3b82f6', questionCount: 1,
           dateCreated: new Date().toISOString(), isSystem: false,
           created_by: 'teacher-1', ownerId: 'teacher-1', subject_id: 'subject-1' },
         { id: 'cat-math-leaf', name: 'Linear', color: '#f59e0b', questionCount: 0,
           dateCreated: new Date().toISOString(), isSystem: false,
           created_by: 'teacher-1', ownerId: 'teacher-1',
           parent_id: 'cat-math', subject_id: 'subject-1' },
         { id: 'cat-science', name: 'Physics', color: '#22c55e', questionCount: 0,
           dateCreated: new Date().toISOString(), isSystem: false,
           created_by: 'teacher-1', ownerId: 'teacher-1', subject_id: 'subject-2' }];`,
      ctx,
    );
  }

  it('deletes the subject, its forest and its courses', async () => {
    resetSubjectScenario();
    const outcome = await vm.runInContext(`window.deleteSubject('subject-1')`, ctx);

    expect(outcome).toMatchObject({ categoriesRemoved: 2, coursesRemoved: 2 });
    expect(state.removeCalls).toEqual([['subjects', 'subject-1']]);
    const remaining = vm.runInContext('categories', ctx);
    expect(remaining.map((c) => c.id)).toEqual(['cat-science']);
    expect(state.courses.map((c) => c.id)).toEqual(['course-science']);
    expect(state.subjects.map((s) => s.id)).toEqual(['subject-2']);
    // The question that lived in the deleted forest is detached, not deleted.
    expect(state.questions[0].category_id).toBeNull();
    // The pill bar falls back to the next subject.
    expect(vm.runInContext('activeCategorySubjectId', ctx)).toBe('subject-2');
    expect(state.courseRefreshes).toBe(1);
  });

  it('quotes the cascade in the confirmation with correct singular forms', async () => {
    resetSubjectScenario();
    // One category, one course: "1 categorie" was a real copy bug.
    vm.runInContext(
      `categories = [{ id: 'cat-math', name: 'Algebra', color: '#3b82f6',
         questionCount: 0, dateCreated: new Date().toISOString(), isSystem: false,
         created_by: 'teacher-1', ownerId: 'teacher-1', subject_id: 'subject-1' }];`,
      ctx,
    );
    state.courses = [{ id: 'course-math', category_id: 'cat-math', subject_id: 'subject-1' }];
    await vm.runInContext(`window.deleteSubject('subject-1')`, ctx);

    expect(state.confirms).toHaveLength(1);
    expect(state.confirms[0]).toContain('1 category');
    expect(state.confirms[0]).not.toContain('categorie ');
    expect(state.confirms[0]).toContain('1 course generated');
    expect(state.confirms[0]).not.toContain('1 courses');
  });

  it('a cancelled confirmation deletes nothing', async () => {
    resetSubjectScenario();
    state.confirmResult = false;
    const outcome = await vm.runInContext(`window.deleteSubject('subject-1')`, ctx);

    expect(outcome).toBe(false);
    expect(state.removeCalls).toEqual([]);
    expect(state.subjects.map((s) => s.id)).toEqual(['subject-1', 'subject-2']);
    expect(state.courses.length).toBe(3);
  });

  it('the success toast quotes what the cascade actually removed', async () => {
    resetSubjectScenario();
    await vm.runInContext(`window.deleteSubject('subject-1')`, ctx);

    expect(state.toasts.join(' ')).toContain(
      'Subject "Mathematics" deleted — 2 categories and 2 courses generated from them removed.',
    );
  });

  it('prefers the server cascade report over the pre-count', async () => {
    resetSubjectScenario();
    state.removeOutcome = { subjects: { categoriesRemoved: 2, coursesRemoved: 7 } };
    const outcome = await vm.runInContext(`window.deleteSubject('subject-1')`, ctx);

    // The local mirror only knew about 2 courses; the server's answer wins in
    // both the return value and the toast.
    expect(outcome).toMatchObject({ categoriesRemoved: 2, coursesRemoved: 7 });
    expect(state.toasts.join(' ')).toContain('7 courses generated from them removed');
  });

  it('keeps the plain toast when the subject held nothing', async () => {
    resetSubjectScenario();
    vm.runInContext(
      `categories = categories.filter((c) => c.subject_id !== 'subject-1');`,
      ctx,
    );
    state.courses = state.courses.filter((c) => c.subject_id !== 'subject-1');
    await vm.runInContext(`window.deleteSubject('subject-1')`, ctx);

    expect(state.toasts.join(' ')).toBe('Subject "Mathematics" deleted.');
  });

  // The bulk bar used to ask once for the selection and then once more per
  // subject (N+1 dialogs) and to toast per row.
  it('bulk delete asks once for the whole selection', async () => {
    resetSubjectScenario();
    state.selected = ['subject-1', 'subject-2'];

    await vm.runInContext('deleteSelectedSubjects()', ctx);

    expect(state.confirms).toHaveLength(1);
    expect(state.confirms[0]).toContain('Delete 2 subjects');
    expect(state.confirms[0]).toContain('3 categories');
    expect(state.confirms[0]).toContain('3 courses');
    expect(state.removeCalls).toEqual([
      ['subjects', 'subject-1'],
      ['subjects', 'subject-2'],
    ]);
    expect(state.subjects).toEqual([]);
    // One summary toast, not one per subject.
    expect(state.toasts.filter((t) => t.startsWith('Deleted'))).toHaveLength(1);
    expect(state.toasts.join(' ')).toContain('Deleted 2 subjects and 3 courses');
  });

  // Same rule as the single-subject toast: the cascade numbers the server
  // answers with are what the bulk summary has to repeat, not the local guess.
  it('bulk delete sums the cascade reports the server returns', async () => {
    resetSubjectScenario();
    state.selected = ['subject-1', 'subject-2'];
    state.removeOutcome = { subjects: { categoriesRemoved: 2, coursesRemoved: 7 } };

    await vm.runInContext('deleteSelectedSubjects()', ctx);

    expect(state.toasts.filter((t) => t.startsWith('Deleted'))).toHaveLength(1);
    expect(state.toasts.join(' ')).toContain('Deleted 2 subjects and 14 courses');
  });

  it('bulk delete stops when the single confirmation is refused', async () => {
    resetSubjectScenario();
    state.selected = ['subject-1', 'subject-2'];
    state.confirmResult = false;

    await vm.runInContext('deleteSelectedSubjects()', ctx);

    expect(state.confirms).toHaveLength(1);
    expect(state.removeCalls).toEqual([]);
    expect(state.subjects.map((s) => s.id)).toEqual(['subject-1', 'subject-2']);
  });
});

// The confirmation and the toast have to tell the truth about the courses the
// category cascade removes — that was the original bug report.
describe('category delete wording reports the cascade', () => {
  function resetCourseScenarioForCopy() {
    state.rawCalls = [];
    state.removeCalls = [];
    state.courseRefreshes = 0;
    state.confirms = [];
    state.toasts = [];
    state.confirmResult = true;
    state.removeOutcome = {};
    state.questions = [];
    state.subjects = [];
    state.courses = [
      { id: 'course-parent', category_id: 'cat-parent' },
      { id: 'course-child', category_id: 'cat-child' },
      { id: 'course-other', category_id: 'cat-else' },
    ];
    vm.runInContext(
      `categories = [
         { id: 'cat-parent', name: 'Parent', color: '#3b82f6', questionCount: 0,
           dateCreated: new Date().toISOString(), isSystem: false,
           created_by: 'admin-1', ownerId: 'admin-1' },
         { id: 'cat-child', name: 'Child', color: '#ef4444', questionCount: 0,
           dateCreated: new Date().toISOString(), isSystem: false,
           created_by: 'admin-1', ownerId: 'admin-1', parent_id: 'cat-parent' },
         { id: 'cat-else', name: 'Else', color: '#22c55e', questionCount: 0,
           dateCreated: new Date().toISOString(), isSystem: false,
           created_by: 'admin-1', ownerId: 'admin-1' }];
       currentCategoryId = null;`,
      ctx,
    );
  }

  it('the confirmation names the exact number of courses', async () => {
    resetCourseScenarioForCopy();
    await vm.runInContext(`deleteCategory('cat-parent')`, ctx);

    expect(state.confirms).toHaveLength(1);
    expect(state.confirms[0]).toContain('2 courses generated from this branch will be removed');
    expect(state.confirms[0]).toContain('This cannot be undone.');
    expect(state.toasts.join(' ')).toContain('2 courses generated from it removed');
  });

  it('prefers the number the server reports over the local guess', async () => {
    resetCourseScenarioForCopy();
    // The mirrored list knows about nothing on this branch, so the
    // confirmation has to stay generic…
    state.courses = [
      { id: 'course-parent', category_id: 'cat-parent' },
      { id: 'course-child', category_id: 'cat-child' },
    ];
    state.removeOutcome = { categories: { coursesRemoved: 5 } };
    await vm.runInContext(`deleteCategory('cat-else')`, ctx);

    expect(state.confirms[0]).toContain('any course generated from this branch is removed');
    // …but the server's answer wins in the toast.
    expect(state.toasts.join(' ')).toContain('5 courses generated from it removed');
  });

  it('bulk category delete counts the union of the selected branches', async () => {
    resetCourseScenarioForCopy();
    state.selected = ['cat-parent', 'cat-else'];

    await vm.runInContext('deleteSelectedCategories()', ctx);

    expect(state.confirms).toHaveLength(1);
    expect(state.confirms[0]).toContain('delete 2 categories');
    expect(state.confirms[0]).toContain('3 courses generated from these branches will be removed');
    expect(state.toasts.join(' ')).toContain('Deleted 2 categories and 3 courses generated from them.');
  });
});
