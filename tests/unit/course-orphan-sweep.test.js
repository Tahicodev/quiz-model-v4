/**
 * tests/unit/course-orphan-sweep.test.js
 *
 * The bug-era repair path. Category/course FKs are `onDelete: SetNull`, so
 * courses generated before the cascade existed survive with no category link
 * at all: their branch is gone, so the content is unreachable from the
 * Subjects tab. The Courses tab surfaces them behind an explicit,
 * admin-triggered sweep — never a silent delete on load.
 *
 * A course is a sweep candidate only when it has no category link the server
 * can resolve (`category_id` null, or a `category_path` that came back empty
 * because the branch is gone). Courses still attached to a live branch are
 * never listed, and healthy rows are never deleted.
 *
 * courses-management.js is a classic browser script wrapped in an IIFE, so it
 * is loaded with node:vm into a sandbox with stubbed browser globals and
 * driven through its window aliases (the same entry points the UI uses).
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
let ctx;

const state = {
  // What GET /courses answers with (the server's view).
  courseRows: [],
  // The shared localStorage mirror other tabs read.
  mirror: [],
  deletes: [],
  toasts: [],
  bannerHidden: null,
  bannerCount: null,
};

function makeClassList(el) {
  return {
    add: (name) => el.classes.add(name),
    remove: (name) => el.classes.delete(name),
    toggle: (name, force) => {
      const on = force === undefined ? !el.classes.has(name) : !!force;
      if (on) el.classes.add(name);
      else el.classes.delete(name);
      return on;
    },
    contains: (name) => el.classes.has(name),
  };
}

function makeEl(over = {}) {
  const el = {
    classes: new Set(),
    attrs: {},
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    children: [],
    ...over,
  };
  el.classList = makeClassList(el);
  el.setAttribute = (k, v) => {
    el.attrs[k] = v;
  };
  el.getAttribute = (k) => (k in el.attrs ? el.attrs[k] : null);
  el.appendChild = (child) => {
    el.children.push(child);
    byId[child.id] = child;
    return child;
  };
  el.querySelectorAll = () => [];
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

const byId = {};
let tbody;

beforeAll(() => {
  byId.courseSearch = makeEl({ id: 'courseSearch', value: '' });
  byId.courseStatusFilter = makeEl({ id: 'courseStatusFilter', value: '' });
  byId.courseOrphanBanner = makeEl({ id: 'courseOrphanBanner' });
  byId.courseOrphanBanner.classes.add('hidden');
  byId.courseOrphanCount = makeEl({ id: 'courseOrphanCount' });
  byId.courseListPane = makeEl({ id: 'courseListPane' });
  byId.courseDetailPane = makeEl({ id: 'courseDetailPane' });
  tbody = makeEl();

  // In a browser `window` IS the global object, and this script assigns its
  // entry points through it (window.renderCourseList = …) while also reading
  // them back as bare identifiers — so the sandbox mirrors that identity.
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    innerWidth: 1400,
    addEventListener() {},
    showToast: (message, type) => {
      state.toasts.push(`${type || 'success'}: ${String(message)}`);
    },
    API: {
      raw: async (method, url) => {
        if (method === 'GET') return { data: state.courseRows.map((r) => ({ ...r })) };
        if (method === 'DELETE') {
          state.deletes.push(url);
          const id = decodeURIComponent(url.split('?')[0].replace('/courses/', ''));
          // The server really removes the row (lessons cascade with it).
          state.courseRows = state.courseRows.filter((r) => String(r.id) !== id);
          return {};
        }
        return {};
      },
    },
    __DI_CONTAINER__: {
      repo: {
        getAll_sync: (table) => (table === 'courses' ? state.mirror : []),
        setAll_sync: (table, data) => {
          if (table === 'courses') state.mirror = data;
        },
        getValue_sync: () => ({}),
      },
    },
    document: {
      createElement: (tagName) => {
        const el = makeEl({ tagName });
        el.remove = () => {
          if (el.id && byId[el.id] === el) delete byId[el.id];
        };
        return el;
      },
      getElementById: (id) => byId[id] || null,
      querySelector: (sel) => (sel === '#courseList tbody' ? tbody : null),
      querySelectorAll: () => [],
      addEventListener() {},
      head: { appendChild() {} },
      documentElement: { classList: { add() {}, remove() {} } },
      body: {
        classes: new Set(),
        classList: { add() {}, remove() {} },
        appendChild: (child) => {
          if (child && child.id) byId[child.id] = child;
          return child;
        },
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  ctx = vm.createContext(sandbox);
  const src = readFileSync(path.join(ROOT, 'courses-management.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'courses-management.js' });
});

function setScenario(rows, mirrorRows) {
  state.courseRows = rows;
  state.mirror = mirrorRows === undefined ? rows.map((r) => ({ ...r })) : mirrorRows;
  state.deletes = [];
  state.toasts = [];
  state.bannerHidden = byId.courseOrphanBanner.classList.contains('hidden');
  state.bannerCount = byId.courseOrphanCount.textContent;
}

/** Healthy generated course: bound branch + resolvable path. */
const HEALTHY = {
  id: 'course-healthy',
  name: 'Zéro Déclaratif',
  status: 'published',
  category_id: 'cat-a',
  category_path: 'Informatique > Algorithmique',
  lesson_count: 3,
};

/** Bug-era casualty: the branch was deleted, the FK nulled itself. */
const NO_LINK = {
  id: 'course-nolink',
  name: 'Ancien cours PDF',
  status: 'draft',
  category_id: null,
  category_path: null,
  lesson_count: 4,
};

/** Dangling reference: the id survived but the branch no longer resolves. */
const DANGLING = {
  id: 'course-dangling',
  name: 'Cours orphelin',
  status: 'draft',
  category_id: 'cat-gone',
  category_path: '',
  lesson_count: 2,
};

/**
 * Loads the list from the (stubbed) server and paints the tab, exactly the way
 * the nav onclick does — coursesCache is closure state, so every spec has to
 * go through this instead of only calling renderCourseList().
 */
async function paint() {
  await vm.runInContext('window.CoursesManagement.loadCourses();', ctx);
  vm.runInContext('window.renderCourseList();', ctx);
  return {
    hidden: byId.courseOrphanBanner.classList.contains('hidden'),
    count: byId.courseOrphanCount.textContent,
  };
}

afterEach(() => {
  // The confirmation overlay is created per call; drop it between specs.
  delete byId.courseOrphanModal;
});

describe('orphan banner', () => {
  it('stays hidden while every course resolves to a category branch', async () => {
    setScenario([HEALTHY]);
    expect(await paint()).toEqual({ hidden: true, count: '0' });
  });

  it('counts a course whose category link was nulled by a category delete', async () => {
    setScenario([HEALTHY, NO_LINK]);
    expect(await paint()).toEqual({ hidden: false, count: '1' });
  });

  it('counts a dangling reference whose category path no longer resolves', async () => {
    setScenario([HEALTHY, NO_LINK, DANGLING]);
    expect(await paint()).toEqual({ hidden: false, count: '2' });
  });

  it('renders the course rows alongside the banner', async () => {
    setScenario([HEALTHY, NO_LINK]);
    await paint();
    expect(tbody.innerHTML).toContain('Zéro Déclaratif');
    expect(tbody.innerHTML).toContain('Ancien cours PDF');
  });
});

describe('clean up confirmation', () => {
  it('lists only the orphaned courses and spells out the blast radius', async () => {
    setScenario([HEALTHY, NO_LINK, DANGLING]);
    await paint();
    vm.runInContext('window.cleanupOrphanCourses();', ctx);
    const overlay = byId.courseOrphanModal;
    expect(overlay).toBeTruthy();
    expect(overlay.innerHTML).toContain('2 courses point at categories that no longer exist');
    expect(overlay.innerHTML).toContain('Ancien cours PDF');
    expect(overlay.innerHTML).toContain('Cours orphelin');
    expect(overlay.innerHTML).not.toContain('Zéro Déclaratif');
    expect(overlay.innerHTML).toContain('question bank is not affected');
  });

  it('offers nothing to clean up when no course is orphaned', async () => {
    setScenario([HEALTHY]);
    await paint();
    vm.runInContext('window.cleanupOrphanCourses();', ctx);
    expect(byId.courseOrphanModal).toBeUndefined();
    expect(state.deletes).toEqual([]);
  });
});

describe('delete them (the only destructive step)', () => {
  it('deletes one course per orphan and keeps the healthy one', async () => {
    setScenario([HEALTHY, NO_LINK, DANGLING]);
    await paint();
    await vm.runInContext('window.deleteOrphanCourses();', ctx);

    expect(state.deletes.sort()).toEqual([
      '/courses/course-dangling',
      '/courses/course-nolink',
    ]);
    expect(state.courseRows.map((r) => r.id)).toEqual(['course-healthy']);
    expect(state.toasts.join(' ')).toContain('Removed 2 orphaned courses');
  });

  it('prunes the shared mirror so other tabs stop counting the deleted rows', async () => {
    setScenario([HEALTHY, NO_LINK, DANGLING]);
    await paint();
    await vm.runInContext('window.deleteOrphanCourses();', ctx);

    expect(state.mirror.map((c) => c.id)).toEqual(['course-healthy']);
  });

  it('re-renders the list so the banner disappears after the sweep', async () => {
    setScenario([HEALTHY, NO_LINK]);
    expect((await paint()).hidden).toBe(false);
    await vm.runInContext('window.deleteOrphanCourses();', ctx);

    expect(await paint()).toEqual({ hidden: true, count: '0' });
  });

  it('reports partial failures instead of claiming a clean sweep', async () => {
    setScenario([NO_LINK, DANGLING]);
    await paint();
    // Emulate one DELETE failing for a non-404 reason (server error).
    ctx.API.raw = async (method, url) => {
      if (method === 'GET') return { data: state.courseRows.map((r) => ({ ...r })) };
      if (String(url).includes('course-dangling')) {
        throw Object.assign(new Error('boom'), { status: 500 });
      }
      state.deletes.push(url);
      state.courseRows = state.courseRows.filter((r) => !String(url).includes(String(r.id)));
      return {};
    };
    try {
      await vm.runInContext('window.deleteOrphanCourses();', ctx);
      expect(state.toasts.join(' ')).toContain('1 deleted, 1 could not be removed');
    } finally {
      // Restore the generic stub for the specs that follow.
      ctx.API.raw = async (method, url) => {
        if (method === 'GET') return { data: state.courseRows.map((r) => ({ ...r })) };
        if (method === 'DELETE') {
          state.deletes.push(url);
          const id = decodeURIComponent(url.replace('/courses/', ''));
          state.courseRows = state.courseRows.filter((r) => String(r.id) !== id);
          return {};
        }
        return {};
      };
    }
  });

  it('does nothing when there is nothing orphaned', async () => {
    setScenario([HEALTHY]);
    await paint();
    await vm.runInContext('window.deleteOrphanCourses();', ctx);
    expect(state.deletes).toEqual([]);
    expect(state.toasts).toEqual([]);
    expect(state.courseRows.map((r) => r.id)).toEqual(['course-healthy']);
  });
});
