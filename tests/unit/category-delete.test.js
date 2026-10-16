/**
 * tests/unit/category-delete.test.js
 *
 * Regression test for "Deleted 0; 1 failed on server — kept locally so you
 * can retry": deleting a category that still contains questions always failed
 * because the UI sent DELETE /categories/:id while the server still had
 * questions filed under it (the server refuses that), instead of detaching
 * the questions first as the confirm dialog promises ("all questions will
 * become uncategorized").
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
  selected: [],
  rawCalls: [],
  removeCalls: [],
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
    confirm: () => true,
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
          return null;
        },
      },
      __DI_CONTAINER__: {
        repo: {
          getAll_sync: (table) =>
            table === 'questions' ? state.questions : [],
          setAll_sync: (table, data) => {
            if (table === 'questions') state.questions = data;
          },
          getValue_sync: () => ({}),
        },
      },
      BulkSelect: {
        getSelectedIds: () => state.selected,
        clear: () => {},
        restore: () => {},
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
    showToast: () => {},
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

describe('category delete with attached questions', () => {
  it('bulk delete detaches server questions BEFORE deleting the row', async () => {
    resetScenario();
    await vm.runInContext('deleteSelectedCategories()', ctx);

    // Questions are detached first (category_id NULL), then the row delete.
    expect(state.rawCalls).toEqual([
      {
        method: 'PATCH',
        path: '/questions/q-1',
        body: { category_id: null },
      },
    ]);
    expect(state.removeCalls).toEqual([['categories', 'cat-teacher-1']]);

    // Local mirror converges: row gone, question uncategorized.
    const remaining = vm.runInContext('categories', ctx);
    expect(remaining.find((c) => c.id === 'cat-teacher-1')).toBeUndefined();
    expect(state.questions[0].category).toBe('');
    expect(state.questions[0].category_id).toBeNull();
  });

  it('single delete detaches server questions BEFORE deleting the row', async () => {
    resetScenario();
    await vm.runInContext(`deleteCategory('cat-teacher-1')`, ctx);

    expect(state.rawCalls).toEqual([
      {
        method: 'PATCH',
        path: '/questions/q-1',
        body: { category_id: null },
      },
    ]);
    expect(state.removeCalls).toEqual([['categories', 'cat-teacher-1']]);
    const remaining = vm.runInContext('categories', ctx);
    expect(remaining.find((c) => c.id === 'cat-teacher-1')).toBeUndefined();
  });

  it('delete of an empty category sends no question PATCH', async () => {
    resetScenario();
    state.questions = [];
    await vm.runInContext(`deleteCategory('cat-teacher-1')`, ctx);

    expect(state.rawCalls).toEqual([]);
    expect(state.removeCalls).toEqual([['categories', 'cat-teacher-1']]);
  });
});
