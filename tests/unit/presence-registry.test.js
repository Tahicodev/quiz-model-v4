import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearPresence,
  listPresence,
  presenceSize,
  removePresence,
  upsertPresence,
} from '../../src/backend/realtime/presence.registry.js';

const student = (socketId, userId, extra = {}) => ({
  socketId,
  userId,
  schoolId: 'school-a',
  role: 'student',
  kind: 'student',
  ...extra,
});

beforeEach(() => clearPresence());

describe('presence registry', () => {
  it('ignores rows without a socket id', () => {
    expect(upsertPresence({ userId: 'S1' })).toBeNull();
    expect(presenceSize()).toBe(0);
  });

  it('normalises ids and timestamps', () => {
    const row = upsertPresence({ socketId: 7, userId: 42, schoolId: 'school-a', role: 'STUDENT' });
    expect(row.socketId).toBe('7');
    expect(row.userId).toBe('42');
    expect(row.role).toBe('student');
    expect(row.kind).toBe('student');
    expect(row.status).toBe('online');
    expect(row.lastSeen).toBeTruthy();
    expect(row.connectedAt).toBeTruthy();
  });

  it('refreshes an existing socket instead of duplicating it', () => {
    upsertPresence(student('s1', 'S1'));
    upsertPresence(student('s1', 'S1', { name: 'Renamed' }));
    expect(presenceSize()).toBe(1);
    expect(listPresence()[0].name).toBe('Renamed');
  });

  it('filters by school, role and kind', () => {
    upsertPresence(student('a1', 'S1'));
    upsertPresence(student('a2', 'S3'));
    upsertPresence(student('a3', 'T1', { role: 'teacher', kind: 'staff' }));
    upsertPresence(student('b1', 'S9', { schoolId: 'school-b' }));

    expect(listPresence({ schoolId: 'school-a' })).toHaveLength(3);
    expect(listPresence({ schoolId: 'school-a', role: 'student' })).toHaveLength(2);
    expect(listPresence({ schoolId: 'school-a', kind: 'staff' })).toHaveLength(1);
    expect(listPresence({ schoolId: 'school-b' })).toHaveLength(1);
    expect(listPresence({ schoolId: 'school-c' })).toEqual([]);
    // Empty school means "all schools" (legacy broadcast behavior).
    expect(listPresence({ schoolId: '' })).toHaveLength(4);
  });

  it('returns the last row on removal and forgets it', () => {
    upsertPresence(student('a1', 'S1'));
    const removed = removePresence('a1');
    expect(removed.userId).toBe('S1');
    expect(removePresence('a1')).toBeNull();
    expect(presenceSize()).toBe(0);
  });

  it('returns copies so callers cannot mutate the registry', () => {
    upsertPresence(student('a1', 'S1'));
    const snapshot = listPresence();
    snapshot[0].name = 'mutated';
    expect(listPresence()[0].name).toBeNull();
  });
});
