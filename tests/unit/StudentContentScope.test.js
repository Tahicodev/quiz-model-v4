/**
 * tests/unit/StudentContentScope.test.js
 *
 * Students see ONLY content authored by their own teachers — never
 * admins', never other teachers'. Unattributed legacy rows stay visible
 * (fail-open; attribution gaps surface in the bootstrap diagnostics log).
 * Covers the pure author predicate used by bootstrap + kids browse routes.
 */

import { describe, it, expect } from 'vitest';
import { isAuthorVisibleToStudent } from '../../src/backend/routes/users.routes.js';

const scope = {
  myTeacherIds: new Set(['t-1', 't-2']),
};

describe('isAuthorVisibleToStudent', () => {
  it('shows content authored by one of the student\u2019s teachers', () => {
    expect(isAuthorVisibleToStudent('t-1', scope)).toBe(true);
    expect(isAuthorVisibleToStudent('t-2', scope)).toBe(true);
  });

  it('withholds content authored by an admin', () => {
    expect(isAuthorVisibleToStudent('a-1', scope)).toBe(false);
  });

  it('withholds content authored by another teacher', () => {
    expect(isAuthorVisibleToStudent('t-9', scope)).toBe(false);
  });

  it('keeps unattributed legacy rows visible (fail-open)', () => {
    expect(isAuthorVisibleToStudent(null, scope)).toBe(true);
    expect(isAuthorVisibleToStudent(undefined, scope)).toBe(true);
    expect(isAuthorVisibleToStudent('', scope)).toBe(true);
    expect(isAuthorVisibleToStudent('   ', scope)).toBe(true);
  });

  it('is permissive without a scope (outage fallback)', () => {
    expect(isAuthorVisibleToStudent('anyone', null)).toBe(true);
    expect(isAuthorVisibleToStudent('anyone', undefined)).toBe(true);
  });
});
