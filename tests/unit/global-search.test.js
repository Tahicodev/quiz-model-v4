/**
 * tests/unit/global-search.test.js
 *
 * Global search covers every admin entity: local-mirror rows (questions,
 * exams, classes, subjects, results, users, games, tournaments, activity) and
 * one-shot server indexes (courses, kids games, championships, devices).
 *
 * global-search.js is a classic browser script; it runs inside a vm context
 * with a minimal DOM and a stubbed repo/API.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SOURCE = readFileSync(path.join(process.cwd(), 'global-search.js'), 'utf8');

const rows = {
  questions: [
    { id: 'q1', question: 'Capital of France', answer: 'Paris', category: 'geo', ownerId: 'u1' },
  ],
  categories: [
    { id: 'geo', name: 'Geography', subject_id: 's1', ownerId: 'u1' },
  ],
  exams: [{ id: 'e1', name: 'Geography Final', questions: [0], duration: 30, ownerId: 'u1' }],
  classes: [{ id: 'c1', name: 'Class Alpha', ownerId: 'u1' }],
  subjects: [{ id: 's1', name: 'Geography' }],
  results: [
    {
      id: 'r1',
      name: 'Sara — Geography Final',
      studentName: 'Sara',
      studentNumber: '07',
      examTitle: 'Geography Final',
      class: 'Class Alpha',
      score: 18,
      totalScore: 20,
    },
  ],
  users: [
    { id: 'u1', name: 'Alex Admin', username: 'alex', role: 'admin' },
    { id: 'u2', name: 'Sara Student', username: 'sara', role: 'student', classId: 'c1', studentNumber: '07' },
    { id: 'u3', name: 'Other Student', username: 'other', role: 'student', classId: 'c2' },
  ],
  games: [
    { id: 'g1', name: 'Speed Quiz', type: 'quiz', status: 'draft', questions: [1, 2], joinCode: 'ABC123' },
  ],
  tournaments: [{ id: 't1', name: 'Spring Cup', status: 'active', rounds: 4 }],
  audit_logs: [
    { id: 'a1', type: 'device', name: 'Lab PC linked', action: 'created', date: '2026-11-01T10:00:00Z' },
  ],
};

const asyncIndexes = {
  courses: [
    { id: 'co1', name: 'Arabic language', subject_id: 's1', status: 'published', lesson_count: 3 },
  ],
  kidsGames: [
    { id: 'k1', name: 'Jungle Count', game_type: 'math_quest', grade: 'cp', status: 'published', pin: '9911' },
  ],
  kidsChampionships: [
    { id: 'ch1', name: 'LL Championship', code: 'LL7', status: 'active', game_ids: ['k1'] },
  ],
  devices: [
    { id: 'd1', hostname: 'Windows PC 7zmq', device_type: 'desktop', status: 'allowed', assigned_user_id: 'u2', last_ip: '10.0.0.7' },
  ],
};

let ctx;

function run(expression) {
  return vm.runInContext(expression, ctx);
}

function search(fn, term) {
  return run(`(() => { globalSearchResults = []; ${fn}(${JSON.stringify(term)}); return globalSearchResults.map((r) => ({ type: r.type, id: r.id, title: r.title, score: r.score })); })()`);
}

beforeAll(async () => {
  const documentStub = {
    addEventListener() {},
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return { style: {}, classList: { add() {} }, appendChild() {} };
    },
    body: { appendChild() {} },
    head: { appendChild() {} },
  };
  const storage = {};
  const windowStub = {
    Auth: {
      isAdmin: () => true,
      isTeacher: () => false,
      getCurrentUser: () => rows.users[0],
      getTeacherClassIds: () => [],
      canAccessItem: () => true,
    },
    __DI_CONTAINER__: {
      repo: {
        getAll_sync: (store) => rows[store] || [],
      },
    },
    API: {
      raw: (method, url) => {
        const data =
          url.startsWith('/kids/championships')
            ? asyncIndexes.kidsChampionships
            : url.startsWith('/kids')
              ? asyncIndexes.kidsGames
              : url.startsWith('/courses')
                ? asyncIndexes.courses
                : url.startsWith('/devices')
                  ? asyncIndexes.devices
                  : [];
        return Promise.resolve({ data });
      },
    },
    localStorage: {
      getItem: (key) => storage[key] || null,
      setItem: (key, value) => {
        storage[key] = value;
      },
    },
  };
  ctx = vm.createContext({
    window: windowStub,
    document: documentStub,
    console,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(SOURCE, ctx);
  // Prime the lazy server indexes the same way a first keystroke does.
  run('ensureServerBackedIndexes("xx")');
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe('global search relevance', () => {
  it('ranks exact > prefix > word-start > substring > none', () => {
    expect(run("matchScore('geo', 'geo')")).toBe(5);
    expect(run("matchScore('geo', 'geography')")).toBe(4);
    expect(run("matchScore('geo', 'my geography')")).toBe(3);
    expect(run("matchScore('geo', 'pigeon')")).toBe(1);
    expect(run("matchScore('geo', 'zzz')")).toBe(0);
  });

  it('groups results and sorts each group by score then title', () => {
    const grouped = run(`(() => {
      const out = groupResultsByType([
        { type: 'exam', title: 'Beta', score: 1 },
        { type: 'exam', title: 'Alpha', score: 3 },
        { type: 'exam', title: 'Aaa', score: 3 },
        { type: 'class', title: 'Only', score: 2 },
      ]);
      return { exams: out.exam.map((r) => r.title), classes: out.class.map((r) => r.title) };
    })()`);
    expect(grouped.exams).toEqual(['Aaa', 'Alpha', 'Beta']);
    expect(grouped.classes).toEqual(['Only']);
  });
});

describe('global search entity coverage', () => {
  it('finds subjects, courses, classes and exams', () => {
    expect(search('searchSubjects', 'geog').map((r) => r.type)).toEqual(['subject']);
    expect(search('searchCourses', 'arabic').map((r) => r.type)).toEqual(['course']);
    expect(search('searchClasses', 'alpha').map((r) => r.type)).toEqual(['class']);
    expect(search('searchExams', 'final').map((r) => r.type)).toEqual(['exam']);
  });

  it('finds users by name, username and student number', () => {
    expect(search('searchUsers', 'sara').map((r) => r.id)).toContain('u2');
    expect(search('searchUsers', '07').map((r) => r.id)).toContain('u2');
    expect(search('searchUsers', 'zz')).toEqual([]);
  });

  it('finds results, games, tournaments and activity entries', () => {
    expect(search('searchResults', 'sara').map((r) => r.type)).toEqual(['result']);
    expect(search('searchGames', 'abc123').map((r) => r.id)).toEqual(['g1']);
    expect(search('searchTournaments', 'spring').map((r) => r.id)).toEqual(['t1']);
    expect(search('searchActivity', 'lab pc').map((r) => r.id)).toEqual(['a1']);
  });

  it('finds server-backed kids studios and devices once indexed', async () => {
    expect(run('globalSearchIndexes.courses.loaded')).toBe(true);
    expect(run('globalSearchIndexes.kidsGames.loaded')).toBe(true);
    expect(run('globalSearchIndexes.kidsChampionships.loaded')).toBe(true);
    expect(run('globalSearchIndexes.devices.loaded')).toBe(true);

    expect(search('searchServerBackedResults', 'jungle').map((r) => r.type)).toEqual(['kidsGame']);
    expect(search('searchServerBackedResults', 'll7').map((r) => r.type)).toEqual(['championship']);
    expect(search('searchServerBackedResults', '7zmq').map((r) => r.type)).toEqual(['device']);
    expect(search('searchServerBackedResults', 'sara').map((r) => r.type)).toEqual(['device']);
  });
});

describe('global search role scoping', () => {
  it('limits teachers to themselves and their own students', () => {
    run(`window.Auth.isAdmin = () => false;
         window.Auth.isTeacher = () => true;
         window.Auth.getCurrentUser = () => ({ id: 'u2', role: 'teacher' });
         window.Auth.getTeacherClassIds = () => ['c1'];`);
    const ids = search('searchUsers', 'student').map((r) => r.id);
    expect(ids).toContain('u2');
    expect(ids).not.toContain('u3');
    run(`window.Auth.isAdmin = () => true; window.Auth.isTeacher = () => false;`);
  });
});
