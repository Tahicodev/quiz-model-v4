/**
 * tests/unit/category-hierarchy.test.js
 *
 * Frontend unit tests for nested categories (Math → Addition/Subtraction →
 * Equations): tree ordering, ancestor/descendant resolution, the parent
 * picker exclusions, training/count roll-up, save plumbing (parent_id set /
 * cleared), and the leaf-only Assign gate.
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
  toasts: [],
  createPayloads: [],
  updatePayloads: [],
  questions: [],
  savedCategories: null,
  selectValues: { categoryParent: '' },
};

function makeEl(over = {}) {
  const el = {
    value: '',
    checked: false,
    dataset: {},
    children: [],
    style: { setProperty() {}, removeProperty() {} },
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    removeAttribute() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector: () => null,
    reset() {},
    focus() {},
    ...over,
  };
  // Like a real browser, clearing innerHTML drops the child nodes.
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

const MATH = '11111111-1111-4111-8111-111111111111';
const ADDITION = '22222222-2222-4222-8222-222222222222';
const SUBTRACTION = '33333333-3333-4333-8333-333333333333';
const EQUATIONS = '44444444-4444-4444-8444-444444444444';
const SCIENCE = '55555555-5555-4555-8555-555555555555';

const TREE = [
  { id: MATH, name: 'Math', color: '#3b82f6', questionCount: 0, dateCreated: '2026-01-01', isSystem: false, created_by: 't1', ownerId: 't1', parent_id: null, parentId: null },
  { id: ADDITION, name: 'Addition', color: '#3b82f6', questionCount: 0, dateCreated: '2026-01-02', isSystem: false, created_by: 't1', ownerId: 't1', parent_id: MATH, parentId: MATH },
  { id: EQUATIONS, name: 'Equations', color: '#3b82f6', questionCount: 0, dateCreated: '2026-01-03', isSystem: false, created_by: 't1', ownerId: 't1', parent_id: ADDITION, parentId: ADDITION },
  { id: SUBTRACTION, name: 'Subtraction', color: '#3b82f6', questionCount: 0, dateCreated: '2026-01-04', isSystem: false, created_by: 't1', ownerId: 't1', parent_id: MATH, parentId: MATH },
  { id: SCIENCE, name: 'Science', color: '#10b981', questionCount: 0, dateCreated: '2026-01-05', isSystem: false, created_by: 't1', ownerId: 't1', parent_id: null, parentId: null },
];

beforeAll(() => {
  const parentSelect = makeEl();
  Object.defineProperty(parentSelect, 'value', {
    get: () => state.selectValues.categoryParent,
    set: (v) => {
      state.selectValues.categoryParent = String(v ?? '');
    },
  });
  const els = {
    categoryName: makeEl({ value: '' }),
    categoryDescription: makeEl({ value: '' }),
    categoryColor: makeEl({ value: '#3b82f6' }),
    categoryTraining: makeEl({ checked: false }),
    categoryModalTitle: makeEl(),
    categoryForm: makeEl(),
    categoryModal: makeEl(),
    categoryParent: parentSelect,
    assignCategoryQuestionsModal: makeEl(),
  };
  const sandbox = {
    console,
    confirm: () => true,
    window: {
      addEventListener() {},
      Auth: {
        getCurrentUser: () => ({ id: 't1' }),
        canAccessItem: () => true,
      },
      API: {
        create: async (entity, payload) => {
          state.createPayloads.push([entity, payload]);
          return { id: 'new-id', ...payload, created_by: 't1' };
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
          getAll_sync: (table) =>
            table === 'questions' ? state.questions : [],
          setAll_sync: (table, data) => {
            if (table === 'questions') state.questions = data;
            if (table === 'categories') state.savedCategories = data;
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
  vm.runInContext(`categories = ${JSON.stringify(TREE)};`, ctx);
});

function resetCapture() {
  state.toasts = [];
  state.createPayloads = [];
  state.updatePayloads = [];
  state.questions = [];
  state.savedCategories = null;
  state.selectValues.categoryParent = '';
  vm.runInContext(
    `categories = ${JSON.stringify(TREE)}; currentCategoryId = null; categoryTrainingMapCache = null;`,
    ctx,
  );
}

describe('category tree helpers', () => {
  it('orders pre-order with depth (Math → Addition → Equations, …)', () => {
    const order = vm.runInContext(
      'getOrderedCategoryTree().map((e) => [e.category.name, e.depth])',
      ctx,
    );
    expect(order).toEqual([
      ['Math', 0],
      ['Addition', 1],
      ['Equations', 2],
      ['Subtraction', 1],
      ['Science', 0],
    ]);
  });

  it('resolves descendants, ancestors, depth, path and leaves', () => {
    expect(
      vm.runInContext(`getCategoryDescendantIds('${MATH}').length`, ctx),
    ).toBe(3);
    expect(
      vm.runInContext(`getCategoryAncestorIds('${EQUATIONS}')`, ctx),
    ).toEqual([ADDITION, MATH]);
    expect(vm.runInContext(`getCategoryDepth('${EQUATIONS}')`, ctx)).toBe(2);
    expect(vm.runInContext(`getCategoryPath('${EQUATIONS}')`, ctx)).toBe(
      'Math › Addition › Equations',
    );
    expect(vm.runInContext(`isLeafCategory('${MATH}')`, ctx)).toBe(false);
    expect(vm.runInContext(`isLeafCategory('${EQUATIONS}')`, ctx)).toBe(true);
  });

  it('parent picker excludes the edited category and its subtree', () => {
    vm.runInContext(`populateCategoryParentPicker('${MATH}');`, ctx);
    const values = vm.runInContext(
      `document.getElementById('categoryParent').children.map((o) => o.value)`,
      ctx,
    );
    expect(values).toEqual(['', SCIENCE]);
  });

  it('parent picker lists everything for a new category', () => {
    vm.runInContext('populateCategoryParentPicker(null);', ctx);
    const values = vm.runInContext(
      `document.getElementById('categoryParent').children.map((o) => o.value)`,
      ctx,
    );
    expect(values).toEqual(['', MATH, ADDITION, EQUATIONS, SUBTRACTION, SCIENCE]);
  });
});

describe('training roll-up', () => {
  it('enabling Math covers the whole subtree', () => {
    resetCapture();
    vm.runInContext(
      `categoryTrainingMapCache = { '${MATH}': true };`,
      ctx,
    );
    expect(vm.runInContext(`isTrainingCategory('${MATH}')`, ctx)).toBe(true);
    expect(vm.runInContext(`isTrainingCategory('${ADDITION}')`, ctx)).toBe(true);
    expect(vm.runInContext(`isTrainingCategory('${EQUATIONS}')`, ctx)).toBe(true);
    expect(vm.runInContext(`isTrainingCategory('${SCIENCE}')`, ctx)).toBe(false);
  });

  it('nearest explicit entry wins over the parent', () => {
    resetCapture();
    vm.runInContext(
      `categoryTrainingMapCache = { '${MATH}': true, '${ADDITION}': false };`,
      ctx,
    );
    expect(vm.runInContext(`isTrainingCategory('${ADDITION}')`, ctx)).toBe(false);
    expect(vm.runInContext(`isTrainingCategory('${EQUATIONS}')`, ctx)).toBe(false);
    expect(vm.runInContext(`isTrainingCategory('${SUBTRACTION}')`, ctx)).toBe(true);
  });
});

describe('save plumbing', () => {
  it('creating a subcategory sends parent_id', async () => {
    resetCapture();
    state.selectValues.categoryParent = MATH;
    vm.runInContext(
      `currentCategoryId = null;
       document.getElementById('categoryName').value = 'Geometry';`,
      ctx,
    );
    await vm.runInContext('saveCategoryForm()', ctx);
    expect(state.createPayloads).toHaveLength(1);
    expect(state.createPayloads[0][0]).toBe('categories');
    expect(state.createPayloads[0][1].parent_id).toBe(MATH);
    const row = vm.runInContext(
      `categories.find((c) => c.name === 'Geometry')`,
      ctx,
    );
    expect(row.parent_id).toBe(MATH);
  });

  it('moving a subcategory to top-level sends explicit null', async () => {
    resetCapture();
    state.selectValues.categoryParent = '';
    vm.runInContext(`currentCategoryId = '${ADDITION}';`, ctx);
    await vm.runInContext('saveCategoryForm()', ctx);
    const catUpdate = state.updatePayloads.find((p) => p[0] === 'categories');
    expect(catUpdate[2].parent_id).toBeNull();
    const row = vm.runInContext(
      `categories.find((c) => String(c.id) === '${ADDITION}')`,
      ctx,
    );
    expect(row.parent_id).toBeNull();
  });

  it('refuses to nest a category inside its own subcategory', async () => {
    resetCapture();
    state.selectValues.categoryParent = EQUATIONS;
    vm.runInContext(`currentCategoryId = '${MATH}';`, ctx);
    await vm.runInContext('saveCategoryForm()', ctx);
    expect(state.createPayloads).toHaveLength(0);
    expect(
      state.updatePayloads.filter((p) => p[0] === 'categories'),
    ).toHaveLength(0);
    expect(state.toasts.join(' ')).toMatch(/inside itself/i);
  });
});

describe('counts roll-up and assign gate', () => {
  it('rolls subtree counts into parents', () => {
    resetCapture();
    state.questions = [
      { id: 'q1', category: EQUATIONS },
      { id: 'q2', category: EQUATIONS },
      { id: 'q3', category: SUBTRACTION },
    ];
    vm.runInContext('updateQuestionCategoryCounts();', ctx);
    const counts = vm.runInContext(
      'Object.fromEntries(categories.map((c) => [c.name, c.questionCount]))',
      ctx,
    );
    expect(counts).toMatchObject({
      Equations: 2,
      Subtraction: 1,
      Addition: 2,
      Math: 3,
      Science: 0,
    });
  });

  it('refuses to open Assign for a parent category', () => {
    resetCapture();
    vm.runInContext(`openAssignCategoryQuestions('${MATH}');`, ctx);
    expect(state.toasts.join(' ')).toMatch(/subcategor/);
  });
});
