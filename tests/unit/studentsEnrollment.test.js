/**
 * tests/unit/studentsEnrollment.test.js
 *
 * Students Management used to end with a "Save Roster" footer: the roster was
 * staged in the modal and only written on save, while account creation lived
 * in Settings → Users. That split produced drift (roster rows without accounts)
 * and a duplicate "Open Account" action that opened the same editor as
 * "Edit User".
 *
 * These are source-level guards for the replacement flow:
 *   1. no Save Roster step anywhere (markup, JS, CSS),
 *   2. the Add Students modal is tabbed: Create New collects identity,
 *      credentials and access/role; Existing & Signups enrolls accounts and
 *      approves pending self-registrations,
 *   3. roster mutations persist immediately through PATCH /users/:id,
 *   4. the student action sheet has a single account editor.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');

const html = read('admin.html');
const js = read('class-management.js');
const auth = read('auth.js');
const css = read('admin.css');

describe('students management: no Save Roster step', () => {
  it('removes the save bar and its pending hint from the markup', () => {
    expect(html).not.toMatch(/rosterPendingHint/);
    expect(html).not.toMatch(/roster-save-bar/);
    expect(html).not.toMatch(/saveAssignClassStudents/);
  });

  it('removes the save bar styles and JS bookkeeping', () => {
    expect(css).not.toMatch(/roster-save-bar/);
    expect(css).not.toMatch(/roster-pending-hint/);
    expect(js).not.toMatch(/markRosterDirty|clearRosterDirty/);
    expect(js).not.toMatch(/function saveAssignClassStudents/);
  });
});

describe('Add Students modal', () => {
  it('offers Create New and Existing & Signups tabs', () => {
    expect(html).toContain('id="addStudentsTabNewBtn"');
    expect(html).toContain('id="addStudentsTabExistingBtn"');
    expect(html).toContain('id="addStudentsNewPanel"');
    expect(html).toContain('id="addStudentsExistingPanel"');
    expect(js).toContain('function switchAddStudentsTab(');
  });

  it('collects identity, credentials and access/role in the create form', () => {
    for (const id of [
      'newStudentName',
      'newStudentNumber',
      'newStudentUsername',
      'newStudentPassword',
      'newStudentStatus',
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toMatch(/id="newStudentRole"[\s\S]{0,80}disabled/);
    expect(html).toContain('id="createStudentSubmitBtn"');
    expect(js).toContain('function submitNewStudentForm(');
  });

  it('creates the account server-first with the class assignment', () => {
    expect(js).toMatch(
      /window\.API\.create\('users',\s*\{[\s\S]{0,400}class_id:\s*String\(classData\.id\)/,
    );
    expect(js).toContain('numero: studentNumber');
    expect(js).toContain('role: \'student\'');
  });

  it('surfaces pending signups with approve/reject actions', () => {
    expect(html).toContain('id="pendingSignupsList"');
    expect(js).toContain('function renderPendingSignups(');
    expect(js).toContain('async function approvePendingSignup(');
    expect(js).toContain('async function rejectPendingSignup(');
    expect(js).toContain('window.Auth.approveAccountRequest');
  });
});

describe('roster mutations persist immediately', () => {
  it('assigns and unassigns through a raw PATCH (null clears the class)', () => {
    expect(js).toContain('function persistStudentClassAssignment(');
    expect(js).toMatch(
      /API\.raw\('PATCH',\s*'\/users\/'[\s\S]{0,120}class_id:\s*classId \|\| null/,
    );
    expect(js).toMatch(/persistStudentClassAssignment\(account\.id, null\)/);
  });

  it('enrolls existing accounts backend-first', () => {
    expect(js).toMatch(
      /async function enrollExistingStudent\(user\)[\s\S]{0,500}persistStudentClassAssignment\(user\.id, classData\.id\)/,
    );
  });
});

describe('single account editor in the student action sheet', () => {
  it('uses Edit User instead of a duplicate Open Account entry', () => {
    const start = js.indexOf('function openStudentActionSheet(');
    const end = js.indexOf('if (window.MobileActionSheet)', start);
    const block = js.slice(start, end);
    expect(block).toContain("label: hasAccount ? 'Edit User' : 'Create User Account'");
    expect(block).not.toContain("label: 'Open Account'");
    expect(block).toContain("label: 'Remove from Roster'");
  });
});

describe('account status mapping', () => {
  it('sends disabled as suspended on user save', () => {
    expect(auth).toMatch(
      /\['disabled', 'inactive', 'suspended'\]\.includes\([\s\S]{0,200}\? 'suspended'\s*:\s*'active'/,
    );
  });

  it('shows every non-active server status as Disabled in the editor', () => {
    expect(auth).toMatch(
      /statusSelect\.value = status === 'active' \? 'active' : 'disabled'/,
    );
  });

  it('styles the new tabs and pending signup cards', () => {
    expect(css).toContain('.add-students-tab');
    expect(css).toContain('.pending-signup-card');
    expect(css).toContain('.password-input-group');
  });
});
