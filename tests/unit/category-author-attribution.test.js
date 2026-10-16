/**
 * tests/unit/category-author-attribution.test.js
 *
 * Frontend regression test for the role-attribution bug: a category created
 * by a teacher ("Kids · info") showed the admin as its creator in admin
 * sessions, because the edit dialog rebuilt the local row with
 * `ownerId = existing.ownerId || currentUser.id` while server rows carry
 * `created_by` — not `ownerId`.
 *
 * category-management.js is a classic browser script (no modules), so it is
 * loaded with node:vm into a sandbox with stubbed browser globals and the
 * exact reported scenario is replayed: an admin edits a teacher's category
 * and the recorded author must stay the teacher.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
let ctx;

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
  const els = {
    categoryName: makeEl({ value: 'Kids · info' }),
    categoryDescription: makeEl({ value: '' }),
    categoryColor: makeEl({ value: '#10b981' }),
    categoryTraining: makeEl({ checked: false }),
    categoryModal: makeEl(),
    categoryForm: makeEl(),
    categoryModalTitle: makeEl(),
  };
  const sandbox = {
    console,
    window: {
      addEventListener() {},
      Auth: { getCurrentUser: () => ({ id: 'admin-1' }) },
      API: {
        // Server echoes the teacher authorship it stamped at creation.
        create: async () => ({
          id: 'cat-teacher-1',
          name: 'Kids · info',
          created_by: 'teacher-1',
        }),
        update: async () => ({}),
      },
      __DI_CONTAINER__: {
        repo: {
          getAll_sync: () => [],
          setAll_sync: () => {},
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
    showToast: () => {},
  };
  sandbox.globalThis = sandbox;
  ctx = vm.createContext(sandbox);
  const src = readFileSync(
    path.join(ROOT, 'category-management.js'),
    'utf8',
  );
  vm.runInContext(src, ctx, { filename: 'category-management.js' });
  // Neutralise DOM-heavy follow-ups; the assertions target the data model.
  vm.runInContext(
    'updateCategoryList = () => {}; loadCategoriesIntoSelect = () => {}; loadCategoriesIntoFilters = () => {};',
    ctx,
  );
});

describe('category frontend author attribution', () => {
  it('resolves the server-stamped author over a stale legacy ownerId', () => {
    const label = vm.runInContext(
      `getCategoryAuthorId({ created_by: 'teacher-1', ownerId: 'admin-1' })`,
      ctx,
    );
    expect(label).toBe('teacher-1');
  });

  it('falls back to the legacy ownerId when no server key exists', () => {
    const label = vm.runInContext(
      `getCategoryAuthorId({ ownerId: 'teacher-1' })`,
      ctx,
    );
    expect(label).toBe('teacher-1');
  });

  it('admin editing a teacher category keeps the teacher as author', async () => {
    vm.runInContext(
      `categories = [{ id: 'cat-teacher-1', name: 'Kids · info', color: '#3b82f6',
          questionCount: 0, dateCreated: new Date().toISOString(),
          isSystem: false, created_by: 'teacher-1' }];
       currentCategoryId = 'cat-teacher-1';`,
      ctx,
    );
    await vm.runInContext('saveCategoryForm()', ctx);
    const row = vm.runInContext('categories[0]', ctx);
    // `window.Auth` in this sandbox is the admin — the bug attributed the
    // row to them; the fix must preserve (and server-merge) the teacher.
    expect(row.created_by).toBe('teacher-1');
    expect(row.ownerId).toBe('teacher-1');
  });

  it('normalizes a stale ownerId back to the server author on load', () => {
    vm.runInContext(
      `categories = [{ id: 'cat-teacher-1', name: 'Kids · info',
          created_by: 'teacher-1', ownerId: 'admin-1' }];
       normalizeCategoryAuthors();`,
      ctx,
    );
    const row = vm.runInContext('categories[0]', ctx);
    expect(row.ownerId).toBe('teacher-1');
    expect(row.created_by).toBe('teacher-1');
  });
});
