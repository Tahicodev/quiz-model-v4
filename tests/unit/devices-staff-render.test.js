/**
 * tests/unit/devices-staff-render.test.js
 *
 * Classroom Devices staff rows: a machine linked to a teacher renders a
 * staff badge (no block button, no student picker) plus an admin
 * "End sessions" action; student rows keep the assign select; the Staff
 * filter isolates staff machines.
 *
 * classroom-devices.js is a classic browser script (IIFE), loaded with
 * node:vm; network goes through a stubbed global fetch.
 */

import { describe, it, expect, beforeAll } from 'vitest';
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

describe('staff device rows', () => {
  it('renders a staff badge, no block button, and an end-sessions action', async () => {
    resetEls();
    await refresh();
    const html = els.devicesTableBody.innerHTML;
    expect(html).toContain('device-staff-badge');
    expect(html).toContain('Teacher');
    expect(html).toContain('Hicham');
    // Block action only on the student row.
    const blockCount = html.split("title=\"Bloquer\"").length - 1;
    expect(blockCount).toBe(1);
    // End-sessions on both linked rows (admin session).
    const endCount = html.split('endSessions(').length - 1;
    expect(endCount).toBe(2);
  });

  it('hides the end-sessions action for non-admins', async () => {
    resetEls();
    state.isAdmin = false;
    await refresh();
    expect(els.devicesTableBody.innerHTML).not.toContain('endSessions(');
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
