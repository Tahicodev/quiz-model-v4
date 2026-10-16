/**
 * tests/unit/category-dragdrop.test.js
 *
 * Unit tests for the collapsible category tree (+/- toggles, persisted
 * collapse state, hidden descendants) and drag-and-drop nesting
 * (validation + moveCategoryToParent server-first flow).
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
  updatePayloads: [],
  questions: [],
  storage: {},
  dynamicEls: {},
  pointEl: null,
};

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

function makeEl(over = {}) {
  const el = {
    value: '',
    checked: false,
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
    remove() {
      if (typeof this.onRemove === 'function') this.onRemove();
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    reset() {},
    focus() {},
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
    listeners: {},
    innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    addEventListener(t, fn) {
      (this.listeners[t] = this.listeners[t] || []).push(fn);
    },
    querySelector: () => null,
  };
}

const tbody = makeEl();
const tableEl = makeEl();
const docListeners = {};
const winListeners = {};

beforeAll(() => {
  const els = {
    categorySearch: makeEl({ value: '' }),
    categorySortBy: makeEl({ value: 'name' }),
    categoryList: tableEl,
  };
  const sandbox = {
    console,
    confirm: () => true,
    window: {
      addEventListener: (type, fn) => {
        (winListeners[type] = winListeners[type] || []).push(fn);
      },
      Auth: { getCurrentUser: () => ({ id: 't1' }) },
      API: {
        create: async () => ({}),
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
          setAll_sync: () => {},
          getValue_sync: () => ({}),
        },
      },
    },
    document: {
      addEventListener: (type, fn) => {
        (docListeners[type] = docListeners[type] || []).push(fn);
      },
      getElementById: (id) => {
        if (id === 'category-tree-styles' || id === 'system-category-styles') {
          return makeEl();
        }
        return els[id] || state.dynamicEls[id] || null;
      },
      querySelector: (sel) => (sel === '#categoryList tbody' ? tbody : null),
      querySelectorAll: () => [],
      elementFromPoint: () => state.pointEl || null,
      createElement: (tag) => (tag === 'tr' ? makeRow() : makeEl()),
      head: { appendChild() {} },
      documentElement: { classList: { add() {}, remove() {} } },
      body: {
        classList: { add() {}, remove() {} },
        appendChild: (child) => {
          if (child && child.id) {
            child.onRemove = () => {
              delete state.dynamicEls[child.id];
            };
            state.dynamicEls[child.id] = child;
          }
          return child;
        },
      },
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
    showToast: (message) => {
      state.toasts.push(String(message));
    },
    escapeHtml: (s) => String(s ?? ''),
    getOwnerLabel: (id) => (id ? String(id) : 'Shared'),
  };
  sandbox.globalThis = sandbox;
  ctx = vm.createContext(sandbox);
  const src = readFileSync(
    path.join(ROOT, 'category-management.js'),
    'utf8',
  );
  vm.runInContext(src, ctx, { filename: 'category-management.js' });
  vm.runInContext(`categories = ${JSON.stringify(TREE)};`, ctx);
});

function rowByName(frag) {
  return tbody.children.find((r) => String(r.innerHTML).includes(frag));
}

describe('collapse / expand', () => {
  it('renders +/- toggles for parents, spacers for leaves', () => {
    vm.runInContext('updateCategoryList();', ctx);
    const mathRow = rowByName('>Math<');
    const equationsRow = rowByName('>Equations<');
    expect(mathRow.innerHTML).toContain('cat-collapse-btn');
    expect(mathRow.innerHTML).toContain('>−</button>');
    expect(mathRow.innerHTML).toContain('2 sub');
    expect(equationsRow.innerHTML).toContain('cat-collapse-spacer');
    expect(equationsRow.innerHTML).toContain('drag-grip');
    expect(equationsRow.innerHTML).toContain('cat-guides');
    expect(equationsRow.innerHTML).toContain('cat-path');
  });

  it('collapsing hides descendants and persists the state', () => {
    vm.runInContext(`toggleCategoryCollapse(null, '${MATH}');`, ctx);
    const mathRow = rowByName('>Math<');
    expect(mathRow.innerHTML).toContain('>+</button>');
    expect(rowByName('>Addition<').style.display).toBe('none');
    expect(rowByName('>Equations<').style.display).toBe('none');
    expect(rowByName('>Subtraction<').style.display).toBe('none');
    expect(rowByName('>Science<').style.display).not.toBe('none');
    expect(JSON.parse(state.storage.quizCollapsedCategories)).toEqual([MATH]);
    // Expanding restores visibility.
    vm.runInContext(`toggleCategoryCollapse(null, '${MATH}');`, ctx);
    expect(rowByName('>Addition<').style.display).not.toBe('none');
    expect(state.storage.quizCollapsedCategories).toBe('[]');
  });
});

describe('drag-and-drop validation', () => {
  it('rejects self, descendants and system targets', () => {
    expect(vm.runInContext(`canDropCategoryOn('${MATH}', '${MATH}')`, ctx)).toBe(false);
    expect(vm.runInContext(`canDropCategoryOn('${MATH}', '${ADDITION}')`, ctx)).toBe(false);
    expect(vm.runInContext(`canDropCategoryOn('${MATH}', '${EQUATIONS}')`, ctx)).toBe(false);
    expect(vm.runInContext(`canDropCategoryOn('${ADDITION}', '${MATH}')`, ctx)).toBe(true);
    expect(vm.runInContext(`canDropCategoryOn('${SCIENCE}', '${EQUATIONS}')`, ctx)).toBe(true);
    // Uncategorized accepts drops (means "move to top level").
    expect(vm.runInContext(`canDropCategoryOn('${ADDITION}', 'uncategorized')`, ctx)).toBe(true);
  });
});

describe('moveCategoryToParent', () => {
  it('moves a category via the API and mirrors locally', async () => {
    state.toasts = [];
    state.updatePayloads = [];
    await vm.runInContext(
      `moveCategoryToParent('${SCIENCE}', '${MATH}')`,
      ctx,
    );
    expect(state.updatePayloads).toHaveLength(1);
    expect(state.updatePayloads[0][0]).toBe('categories');
    expect(state.updatePayloads[0][1]).toBe(SCIENCE);
    expect(state.updatePayloads[0][2].parent_id).toBe(MATH);
    const row = vm.runInContext(
      `categories.find((c) => String(c.id) === '${SCIENCE}')`,
      ctx,
    );
    expect(row.parent_id).toBe(MATH);
    expect(state.toasts.join(' ')).toMatch(/moved into "Math"/);
  });

  it('moving to top-level sends explicit null', async () => {
    state.updatePayloads = [];
    await vm.runInContext(`moveCategoryToParent('${ADDITION}', '')`, ctx);
    expect(state.updatePayloads).toHaveLength(1);
    expect(state.updatePayloads[0][2].parent_id).toBeNull();
    const row = vm.runInContext(
      `categories.find((c) => String(c.id) === '${ADDITION}')`,
      ctx,
    );
    expect(row.parent_id).toBeNull();
  });

  it('refuses moves into its own subtree without calling the API', async () => {
    state.toasts = [];
    state.updatePayloads = [];
    // Reset fixture (previous tests mutated it).
    vm.runInContext(`categories = ${JSON.stringify(TREE)};`, ctx);
    await vm.runInContext(`moveCategoryToParent('${MATH}', '${EQUATIONS}')`, ctx);
    expect(state.updatePayloads).toHaveLength(0);
    expect(state.toasts.join(' ')).toMatch(/inside itself/i);
  });

  it('drop with an invalid target toasts instead of moving', async () => {
    state.toasts = [];
    state.updatePayloads = [];
    vm.runInContext(`categories = ${JSON.stringify(TREE)};`, ctx);
    await vm.runInContext(`dropCategoryOnto('${MATH}', '${ADDITION}');`, ctx);
    expect(state.updatePayloads).toHaveLength(0);
    expect(state.toasts.join(' ')).toMatch(/inside itself/i);
  });

  it('drop on a valid target moves', async () => {
    state.toasts = [];
    state.updatePayloads = [];
    vm.runInContext(`categories = ${JSON.stringify(TREE)};`, ctx);
    await vm.runInContext(`dropCategoryOnto('${SCIENCE}', '${ADDITION}');`, ctx);
    expect(state.updatePayloads).toHaveLength(1);
    expect(state.updatePayloads[0][2].parent_id).toBe(ADDITION);
  });
});

function pressGrip(id, x = 0, y = 0) {
  vm.runInContext(
    `onGripPointerDown({ pointerId: 7, pointerType: 'touch', button: 0, clientX: ${x}, clientY: ${y}, preventDefault() {} }, '${id}');`,
    ctx,
  );
}

function movePointer(x, y) {
  for (const fn of winListeners.pointermove || []) {
    fn({ pointerId: 7, clientX: x, clientY: y });
  }
}

async function releasePointer(x = 0, y = 0) {
  for (const fn of winListeners.pointerup || []) {
    await fn({ pointerId: 7, clientX: x, clientY: y });
  }
}

function fakeRowEl(id) {
  return { closest: () => ({ dataset: { id } }) };
}

describe('pointer drag (mouse + touch)', () => {
  function resetPointer() {
    state.toasts = [];
    state.updatePayloads = [];
    state.pointEl = null;
    state.dynamicEls = {};
    vm.runInContext(
      `categories = ${JSON.stringify(TREE)};
       moveModeCategoryId = null;
       renderMoveModeBanner();`,
      ctx,
    );
  }

  it('tap on the grip enters tap-to-move mode', async () => {
    resetPointer();
    pressGrip(SCIENCE);
    await releasePointer();
    expect(vm.runInContext('catDrag', ctx)).toBeNull();
    expect(state.updatePayloads).toHaveLength(0);
    expect(state.toasts.join(' ')).toMatch(/Moving "Science"/);
    expect(state.dynamicEls.categoryMoveBanner).toBeTruthy();
  });

  it('second tap on the same grip exits the mode', async () => {
    resetPointer();
    pressGrip(SCIENCE);
    await releasePointer();
    pressGrip(SCIENCE);
    await releasePointer();
    expect(state.dynamicEls.categoryMoveBanner || null).toBeNull();
  });

  it('drag with no target cancels silently', async () => {
    resetPointer();
    pressGrip(SCIENCE);
    movePointer(0, 40);
    expect(vm.runInContext('catDrag && catDrag.started', ctx)).toBe(true);
    expect(vm.runInContext('catDrag.ghost.innerHTML', ctx)).toMatch(/Science/);
    await releasePointer(0, 40);
    expect(vm.runInContext('catDrag', ctx)).toBeNull();
    expect(state.updatePayloads).toHaveLength(0);
    expect(state.toasts).toHaveLength(0);
  });

  it('drag onto a valid row nests on release', async () => {
    resetPointer();
    state.pointEl = fakeRowEl(ADDITION);
    pressGrip(SCIENCE);
    movePointer(0, 40);
    expect(vm.runInContext('catDrag && catDrag.targetId', ctx)).toBe(ADDITION);
    await releasePointer(0, 40);
    expect(state.updatePayloads).toHaveLength(1);
    expect(state.updatePayloads[0][2].parent_id).toBe(ADDITION);
    const row = vm.runInContext(
      `categories.find((c) => String(c.id) === '${SCIENCE}')`,
      ctx,
    );
    expect(row.parent_id).toBe(ADDITION);
  });

  it('drag onto an invalid row shows the reason and moves nothing', async () => {
    resetPointer();
    state.pointEl = fakeRowEl(EQUATIONS);
    pressGrip(MATH);
    movePointer(0, 40);
    await releasePointer(0, 40);
    expect(state.updatePayloads).toHaveLength(0);
    expect(state.toasts.join(' ')).toMatch(/inside itself/i);
  });
});

describe('tap-to-move mode (touch friendly)', () => {
  function resetMoveMode() {
    state.toasts = [];
    state.updatePayloads = [];
    state.dynamicEls = {};
    vm.runInContext(
      `categories = ${JSON.stringify(TREE)};
       moveModeCategoryId = null;
       renderMoveModeBanner();`,
      ctx,
    );
  }

  function banner() {
    return state.dynamicEls.categoryMoveBanner || null;
  }

  it('starting move mode shows a banner and swaps row actions', () => {
    resetMoveMode();
    vm.runInContext(`startCategoryMove(null, '${SCIENCE}');`, ctx);
    expect(banner()).toBeTruthy();
    expect(banner().innerHTML).toMatch(/Moving.*Science/);
    expect(banner().innerHTML).toContain('Cancel');
    // Source row offers Cancel, valid targets offer Move here, invalid show —.
    expect(rowByName('>Science<').innerHTML).toContain('move-cancel-btn');
    expect(rowByName('>Addition<').innerHTML).toContain('Move here');
    expect(rowByName('>Math<').innerHTML).toContain('Move here');
    expect(state.toasts.join(' ')).toMatch(/Moving "Science"/);
  });

  it('tapping the source row cancels the mode', () => {
    resetMoveMode();
    vm.runInContext(`startCategoryMove(null, '${SCIENCE}');`, ctx);
    vm.runInContext(`finishCategoryMoveOnTap('${SCIENCE}');`, ctx);
    expect(banner()).toBeNull();
    expect(state.updatePayloads).toHaveLength(0);
    expect(rowByName('>Science<').innerHTML).toContain('exam-move-btn');
  });

  it('tapping a valid target moves and exits the mode', async () => {
    resetMoveMode();
    vm.runInContext(`startCategoryMove(null, '${SCIENCE}');`, ctx);
    await vm.runInContext(`finishCategoryMoveOnTap('${ADDITION}');`, ctx);
    expect(state.updatePayloads).toHaveLength(1);
    expect(state.updatePayloads[0][2].parent_id).toBe(ADDITION);
    expect(banner()).toBeNull();
    expect(state.toasts.join(' ')).toMatch(/moved into "Addition"/);
  });

  it('tapping an invalid target keeps the mode active', async () => {
    resetMoveMode();
    vm.runInContext(`startCategoryMove(null, '${MATH}');`, ctx);
    await vm.runInContext(`finishCategoryMoveOnTap('${EQUATIONS}');`, ctx);
    expect(state.updatePayloads).toHaveLength(0);
    expect(state.toasts.join(' ')).toMatch(/inside itself/i);
    expect(banner()).toBeTruthy();
  });

  it('Escape cancels the mode', () => {
    resetMoveMode();
    vm.runInContext(`startCategoryMove(null, '${SCIENCE}');`, ctx);
    expect(banner()).toBeTruthy();
    for (const fn of docListeners.keydown || []) fn({ key: 'Escape' });
    expect(banner()).toBeNull();
  });

  it('uncategorized is offered as a top-level target', () => {
    resetMoveMode();
    vm.runInContext(`startCategoryMove(null, '${ADDITION}');`, ctx);
    const uncRow = tbody.children.find(
      (r) => r.attrs && r.attrs['data-id'] === 'uncategorized',
    );
    expect(uncRow).toBeTruthy();
    expect(uncRow.innerHTML).toContain('Move here');
  });
});
