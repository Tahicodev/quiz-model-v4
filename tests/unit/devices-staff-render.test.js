/**
 * tests/unit/devices-staff-render.test.js
 *
 * Classroom Devices staff rows: a machine linked to a teacher renders a
 * staff badge (no block button, no student picker) plus an admin
 * "End sessions" action; student rows keep the assign select; the Staff
 * filter isolates staff machines.
 *
 * Same file also covers the phone structure: below 768px the machine table
 * is not card-ified, it is replaced by #devicesMobileList — one self-
 * contained card per machine, the machine's sessions inside that card, and
 * no action buttons (the action sheet carries them).
 *
 * classroom-devices.js is a classic browser script (IIFE), loaded with
 * node:vm; network goes through a stubbed global fetch.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
let ctx;

const STAFF_ROW = {
  id: 'dev-teacher',
  device_key: 'hicham-pc-1',
  hostname: null,
  note: null,
  device_type: 'desktop',
  platform: 'Windows',
  last_ip: '192.168.1.10',
  status: 'allowed',
  assigned_user_id: 'teacher-1',
  assignedUser: { id: 'teacher-1', name: 'Hicham', username: 'hicham', role: 'teacher' },
  last_seen: new Date().toISOString(),
};
const STUDENT_ROW = {
  id: 'dev-student',
  device_key: 'lab-pc-1',
  hostname: 'Lab PC 1',
  note: null,
  device_type: 'desktop',
  platform: 'Windows',
  last_ip: '192.168.1.11',
  status: 'allowed',
  assigned_user_id: 'student-1',
  assignedUser: { id: 'student-1', name: 'Sara', username: 'sara', role: 'student' },
  last_seen: new Date().toISOString(),
};

const state = {
  isAdmin: true,
  filterStudent: '',
  search: '',
  rows: [STAFF_ROW, STUDENT_ROW],
};

function makeEl(over = {}) {
  const el = {
    value: '',
    checked: false,
    dataset: {},
    children: [],
    style: {},
    textContent: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    removeAttribute() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    ...over,
  };
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get: () => html,
    set: (v) => {
      html = String(v ?? '');
    },
  });
  return el;
}

const els = {};
function resetEls() {
  for (const k of Object.keys(els)) delete els[k];
  els.devicesTableBody = makeEl();
  els.devicesMobileList = makeEl();
  els.devicesSearch = makeEl({ value: '' });
  els.deviceFilterStatus = makeEl({ value: '' });
  els.deviceFilterType = makeEl({ value: '' });
  els.deviceFilterPresence = makeEl({ value: '' });
  els.deviceFilterStudent = makeEl({ value: '' });
  els['kpi-devices-total'] = makeEl();
  els['kpi-devices-online'] = makeEl();
  els['kpi-devices-blocked'] = makeEl();
}

beforeAll(() => {
  resetEls();
  const sandbox = {
    console,
    window: {
      addEventListener() {},
      confirm: () => true,
      prompt: () => null,
      innerWidth: 1280,
      Auth: { isAdmin: () => state.isAdmin },
      TeacherFilter: { isAdminSession: () => state.isAdmin },
      MobileActionSheet: null,
      showToast: () => {},
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
    fetch: async (url) => {
      const u = String(url);
      if (u.includes('/users')) {
        return { ok: true, status: 200, json: async () => ({ data: [], total: 0 }) };
      }
      if (u.includes('/devices')) {
        return { ok: true, status: 200, json: async () => state.rows };
      }
      if (u.includes('/sessions/live')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              user: { id: 'teacher-1', name: 'Hicham', username: 'hicham', role: 'teacher' },
              sessions: [
                {
                  id: 'tok-1',
                  created_at: new Date().toISOString(),
                  ip_address: '192.168.1.10',
                  user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
                },
              ],
            },
          ],
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
  };
  sandbox.globalThis = sandbox;
  ctx = vm.createContext(sandbox);
  vm.runInContext(
    readFileSync(path.join(ROOT, 'classroom-devices.js'), 'utf8'),
    ctx,
    { filename: 'classroom-devices.js' },
  );
});

async function refresh() {
  await vm.runInContext('window.ClassroomDevices.refresh()', ctx);
}

async function setViewport(width) {
  vm.runInContext(`window.innerWidth = ${width};`, ctx);
  await vm.runInContext('window.ClassroomDevices.filter()', ctx);
}

describe('staff device rows', () => {
  it('renders a staff badge, no block button, and per-user end-sessions actions', async () => {
    resetEls();
    await refresh();
    const html = els.devicesTableBody.innerHTML;
    expect(html).toContain('device-staff-badge');
    expect(html).toContain('Teacher');
    expect(html).toContain('Hicham');
    // Block action only on the student row.
    const blockCount = html.split("title=\"Bloquer\"").length - 1;
    expect(blockCount).toBe(1);
    // Per-user End-sessions: one for the teacher (session sub-row line).
    const endCount = html.split('endUserSessions(').length - 1;
    expect(endCount).toBe(1);
  });

  it('hides the end-sessions action for non-admins', async () => {
    resetEls();
    state.isAdmin = false;
    await refresh();
    expect(els.devicesTableBody.innerHTML).not.toContain('endUserSessions(');
    state.isAdmin = true;
  });

  it('staff filter isolates staff machines', async () => {
    resetEls();
    els.deviceFilterStudent.value = 'staff';
    await refresh();
    const html = els.devicesTableBody.innerHTML;
    expect(html).toContain('Hicham');
    expect(html).not.toContain('Lab PC 1');
  });
});

describe('phone structure (<= 768px)', () => {
  async function mobileRefresh() {
    resetEls();
    await setViewport(390);
    await refresh();
    return els.devicesMobileList.innerHTML;
  }

  afterAll(() => {
    vm.runInContext('window.innerWidth = 1280;', ctx);
  });

  it('renders cards instead of the table', async () => {
    const html = await mobileRefresh();
    expect(html.split('class="device-mcard').length - 1).toBe(2);
    // No table markup at all, and the desktop body was emptied — one
    // structure at a time, or BulkSelect would count each machine twice.
    expect(html).not.toContain('<tr');
    expect(html).not.toContain('<td');
    expect(els.devicesTableBody.innerHTML).toBe('');
  });

  it('keeps the data and the assign picker, drops the icon buttons', async () => {
    const html = await mobileRefresh();
    expect(html).toContain('Hicham');
    expect(html).toContain('device-staff-badge');
    expect(html).toContain('Lab PC 1');
    expect(html).toContain('device-assign');
    // Block / rename / forget live in the action sheet, not on the card.
    expect(html).not.toContain('exam-action-btn');
    // Bulk selection still works from the card.
    expect(html.split('class="device-checkbox"').length - 1).toBe(2);
  });

  it('carries the machine\'s sessions inside its own card', async () => {
    await setViewport(390);
    await refresh();
    vm.runInContext("window.ClassroomDevices.toggleSessions('dev-teacher');", ctx);
    await vm.runInContext('window.ClassroomDevices.filter()', ctx);
    const html = els.devicesMobileList.innerHTML;
    expect(html).toContain('dm-sessions');
    expect(html).toContain('Chrome');
    // The panel sits inside the teacher card, i.e. before the next machine.
    expect(html.indexOf('dm-sessions')).toBeLessThan(html.indexOf('data-device-id="dev-student"'));
  });

  it('says so when no session comes from the machine', async () => {
    await setViewport(390);
    await refresh();
    vm.runInContext("window.ClassroomDevices.toggleSessions('dev-student');", ctx);
    await vm.runInContext('window.ClassroomDevices.filter()', ctx);
    expect(els.devicesMobileList.innerHTML).toContain('dm-sessions-empty');
  });

  it('shows no session block to a teacher', async () => {
    resetEls();
    state.isAdmin = false;
    await setViewport(390);
    await refresh();
    const html = els.devicesMobileList.innerHTML;
    expect(html).toContain('device-mcard');
    expect(html).not.toContain('dm-sessions');
    state.isAdmin = true;
  });

  // The render split is only half the fix: the CSS has to drop the table on
  // phones and pick the card list up again, or both structures would show.
  it('is matched by the stylesheet', () => {
    const css = readFileSync(path.join(ROOT, 'admin.css'), 'utf8');
    const base = /#devices \.devices-mobile-list \{\s*display: none;/;
    const card = /#devices #devicesTable \{\s*display: none !important;/;
    const wide = /#devices \.devices-mobile-list \{\s*display: flex;/;
    expect(css).toMatch(base);
    expect(css).toMatch(card);
    expect(css).toMatch(wide);
    // Desktop hide first, phone swap after it — later wins at equal weight.
    expect(css.search(wide)).toBeGreaterThan(css.search(base));
    const block = css.lastIndexOf('@media', css.search(card));
    expect(css.slice(block, css.indexOf('{', block))).toMatch(/max-width:\s*768px/);
  });
});
