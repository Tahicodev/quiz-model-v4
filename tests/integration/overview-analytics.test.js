/**
 * tests/integration/overview-analytics.test.js
 *
 * End-to-end validation of OverviewAnalyticsService against a real throwaway
 * SQLite DB (same boot pattern as PrismaRepository.contract.test.js). This is
 * where the KPI *numbers* are proven — the design decisions (distinct-counting,
 * training/formal separation, derived windows, class attribution via the user
 * relation, min-sample guards, honest "unavailable" states) are asserted here
 * with fully deterministic data and an injected clock.
 *
 * Every expectation below is hand-computed from the seeded dataset; if a formula
 * changes, this test is the contract that catches it.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaRepository } from '../../src/backend/infrastructure/PrismaRepository.js';
import { OverviewAnalyticsService } from '../../src/backend/services/OverviewAnalyticsService.js';

const ROOT = process.cwd();
const TEST_DB_PATH = path.join(ROOT, 'prisma', 'test-overview.db');
const TEST_DB_URL = `file:${TEST_DB_PATH.replace(/\\/g, '/')}`;

const SCHOOL = 'school-ov';
const NOW = new Date('2026-01-15T00:00:00.000Z');

let prisma;
let svc;

function iso(d) {
  return new Date(d);
}

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  writeFileSync(TEST_DB_PATH, '');
  const schemaPath = path.join(ROOT, 'prisma', 'schema.prisma');
  const prismaBin = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(
    process.execPath,
    [prismaBin, 'migrate', 'deploy', '--schema', schemaPath],
    { cwd: ROOT, env: { ...process.env, DATABASE_URL: TEST_DB_URL }, stdio: 'pipe' },
  );
  prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  svc = new OverviewAnalyticsService(new PrismaRepository(prisma));

  // ── seed ────────────────────────────────────────────────────────────────
  await prisma.school.create({
    data: { id: SCHOOL, name: 'Overview Test', slug: 'overview-test', school_year: '2025-2026' },
  });

  // Two classes.
  await prisma.class.createMany({
    data: [
      { id: 'C1', school_id: SCHOOL, name: 'Class One' },
      { id: 'C2', school_id: SCHOOL, name: 'Class Two' },
    ],
  });

  // Five students + two teachers.
  await prisma.user.createMany({
    data: [
      { id: 'S1', school_id: SCHOOL, class_id: 'C1', username: 's1', password_hash: 'h', name: 'S1', role: 'student' },
      { id: 'S2', school_id: SCHOOL, class_id: 'C1', username: 's2', password_hash: 'h', name: 'S2', role: 'student' },
      { id: 'S3', school_id: SCHOOL, class_id: 'C1', username: 's3', password_hash: 'h', name: 'S3', role: 'student' },
      { id: 'S4', school_id: SCHOOL, class_id: 'C2', username: 's4', password_hash: 'h', name: 'S4', role: 'student' },
      { id: 'S5', school_id: SCHOOL, class_id: 'C2', username: 's5', password_hash: 'h', name: 'S5', role: 'student' },
      { id: 'T1', school_id: SCHOOL, username: 't1', password_hash: 'h', name: 'Teacher One', role: 'teacher' },
      { id: 'T2', school_id: SCHOOL, username: 't2', password_hash: 'h', name: 'Teacher Two', role: 'teacher' },
    ],
  });

  // Two formal active exams + one training exam + one archived exam.
  await prisma.exam.createMany({
    data: [
      { id: 'E1', school_id: SCHOOL, creator_id: 'T1', name: 'Formal One', status: 'active', is_training: false, passing_score: 50 },
      { id: 'E2', school_id: SCHOOL, creator_id: 'T2', name: 'Formal Two', status: 'active', is_training: false, passing_score: 50 },
      { id: 'E3', school_id: SCHOOL, creator_id: 'T1', name: 'Training', status: 'active', is_training: true, passing_score: 50 },
      { id: 'E4', school_id: SCHOOL, creator_id: 'T1', name: 'Draft', status: 'draft', is_training: false, passing_score: 50 },
    ],
  });

  await prisma.category.create({
    data: { id: 'CAT1', school_id: SCHOOL, name: 'Algebra', created_by: 'T1' },
  });
  await prisma.question.createMany({
    data: [
      { id: 'Q1', school_id: SCHOOL, category_id: 'CAT1', type: 'mcq', text: 'Q1', answer: 'A', created_by: 'T1' },
      { id: 'Q2', school_id: SCHOOL, category_id: 'CAT1', type: 'mcq', text: 'Q2', answer: 'A', created_by: 'T1' },
      { id: 'Q3', school_id: SCHOOL, type: 'mcq', text: 'Q3', answer: 'A', created_by: 'T2' },
    ],
  });

  // teacher↔class assignments.
  await prisma.setting.create({
    data: { school_id: SCHOOL, key: 'teacherClassAssignments', value: JSON.stringify({ T1: ['C1'], T2: ['C2'] }), visibility: 'admin' },
  });

  // Results. score is a percentage (0-100). Formal exam-mode rows carry exam_id.
  const mk = (id, user_id, exam_id, score, passed, date_taken, mode = 'exam') => ({
    id, school_id: SCHOOL, user_id, exam_id, score, passed, mode,
    total_points: 100, earned_points: Math.round(score), answers_json: '{}',
    date_taken: iso(date_taken),
  });
  await prisma.result.createMany({
    data: [
      // In-window formal exam results.
      mk('R1', 'S1', 'E1', 80, true, '2026-01-10T00:00:00Z'),
      mk('R2', 'S2', 'E1', 60, true, '2026-01-11T00:00:00Z'),
      mk('R3', 'S3', 'E1', 40, false, '2026-01-12T00:00:00Z'),
      mk('R4', 'S1', 'E1', 90, true, '2026-01-13T00:00:00Z'), // S1 duplicate attempt
      mk('R10', 'S2', 'E1', 70, true, '2026-01-14T00:00:00Z'),
      mk('R11', 'S3', 'E1', 55, true, '2026-01-14T00:00:00Z'),
      mk('R6', 'S4', 'E2', 20, false, '2026-01-09T00:00:00Z'),
      mk('R7', 'S5', 'E2', 30, false, '2026-01-09T00:00:00Z'),
      mk('R8', 'S4', 'E2', 25, false, '2026-01-09T00:00:00Z'),
      // Training (must be excluded from achievement KPIs).
      mk('R5', 'S1', 'E3', 30, false, '2026-01-14T00:00:00Z', 'training'),
      // Out-of-window but inside the academic year (excluded by 30d, kept by all).
      mk('R9', 'S1', 'E1', 100, true, '2025-11-20T00:00:00Z'),
    ],
  });
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  for (const p of [TEST_DB_PATH, `${TEST_DB_PATH}-journal`]) {
    try { rmSync(p); } catch { /* gone */ }
  }
});

describe('OverviewAnalyticsService — school-wide KPIs (30d window)', () => {
  let res;
  beforeAll(async () => {
    res = await svc.getSchoolOverview({ schoolId: SCHOOL, filters: { period: '30d' }, now: NOW });
  });

  it('counts distinct registered students, teachers and classes (current-state)', () => {
    expect(res.sections.glance.totalStudents.value).toBe(5);
    expect(res.sections.glance.totalTeachers.value).toBe(2);
    expect(res.sections.glance.totalClasses.value).toBe(2);
  });

  it('counts active students distinctly (S1 with 2 attempts + training counts once)', () => {
    // S1..S5 each have ≥1 qualifying activity in window = 5 distinct.
    expect(res.sections.glance.activeStudents.value).toBe(5);
    expect(res.sections.glance.participationRate.value).toBe(100);
  });

  it('excludes training from formal-exam achievement metrics', () => {
    // 9 formal exam results in window (R1,R2,R3,R4,R10,R11,R6,R7,R8); R5 excluded.
    const a = res.sections.achievement;
    expect(a.avgExamScore.sample).toBe(9);
    // mean score = 470/9 = 52.222 → /5 = 10.44/20
    expect(a.avgExamScore.value).toBeCloseTo(10.44, 2);
  });

  it('computes pass rate from passed finalized results', () => {
    const a = res.sections.achievement;
    expect(a.passRate.passed).toBe(5); // R1,R2,R4,R10,R11
    expect(a.passRate.total).toBe(9);
    expect(a.passRate.value).toBeCloseTo(55.6, 1);
  });

  it('counts certified vs pending students distinctly', () => {
    const a = res.sections.achievement;
    expect(a.certifiedStudents.value).toBe(3); // S1,S2,S3
    expect(a.pendingSuccess.assessedStudents).toBe(5);
    expect(a.pendingSuccess.value).toBe(2); // assessed(5) - certified(3)
  });

  it('flags students needing attention (≥2 failed formal attempts, none passed)', () => {
    // S4 has R6,R8 both failing and never passes.
    expect(res.sections.glance.studentsNeedingAttention.value).toBe(1);
  });

  it('ranks the top class only above the minimum sample and reports the sample', () => {
    const a = res.sections.achievement;
    // C1 has 6 finalized results (≥5) → eligible; C2 has 3 → below min.
    expect(a.topClass.value).toBe('Class One');
    expect(a.topClass.sample).toBe(6);
    // C1 per-student means weighted: (85*2 + 65*2 + 47.5*2)/6 = 65.833 → /5 = 13.17
    expect(a.topClass.avgScore20).toBeCloseTo(13.17, 2);
    const c2 = a.classComparison.find((c) => c.className === 'Class Two');
    expect(c2.sample).toBe(3);
    expect(c2).toHaveProperty('passRate');
  });

  it('computes avg score trend vs the equal-length preceding window', () => {
    const t = res.sections.achievement.avgScoreTrend;
    // Preceding 30d (Nov16–Dec16) has R9 (score 100) → previous avg present.
    expect(t.previous).not.toBeNull();
    expect(t.previousSample).toBe(1);
    // current sample 9 ≥5 but previous sample 1 <5 → insufficient for a trend.
    expect(t.insufficient).toBe(true);
  });

  it('exposes engagement & live-state snapshots', () => {
    const e = res.sections.engagement;
    // total attempts (all modes, real users) in window = 9 formal + 1 training = 10
    expect(e.totalAttempts.value).toBe(10);
    expect(e.completedAssessments.value).toBe(9);
    expect(e.gameLobbies.basis).toBe('current-state');
  });

  it('reports data-unsupported KPIs as unavailable, never a fabricated value', () => {
    expect(res.meta.unavailable.assessmentCompletionRate).toBeTruthy();
    expect(res.sections.content.assessmentCompletionRate.status).toBe('unavailable');
  });
});

describe('OverviewAnalyticsService — filters', () => {
  it('class filter scopes results and students to that class', async () => {
    const res = await svc.getSchoolOverview({ schoolId: SCHOOL, filters: { period: '30d', classId: 'C2' }, now: NOW });
    expect(res.sections.glance.totalStudents.value).toBe(2); // S4,S5
    // Only E2 results in C2 window: R6,R7,R8 (3)
    expect(res.sections.achievement.avgExamScore.sample).toBe(3);
  });

  it('teacher filter restricts content authorship and result scope to that teacher', async () => {
    const res = await svc.getSchoolOverview({ schoolId: SCHOOL, filters: { period: '30d', teacherId: 'T1' }, now: NOW });
    // T1 authored 2 questions, 1 active formal exam (E1); E3 is training, E4 draft.
    expect(res.sections.content.totalQuestions.value).toBe(2);
    expect(res.sections.content.activeExams.value).toBe(1);
    // T1 manages C1 → 6 formal results in window.
    expect(res.sections.achievement.avgExamScore.sample).toBe(6);
  });

  it('all-time period includes out-of-window academic-year results; lifetime totals unchanged', async () => {
    const res = await svc.getSchoolOverview({ schoolId: SCHOOL, filters: { period: 'all' }, now: NOW });
    // +R9 (score 100) → 10 formal results.
    expect(res.sections.achievement.avgExamScore.sample).toBe(10);
    // totalStudents is a current-state count and is NOT date-filtered.
    expect(res.sections.glance.totalStudents.value).toBe(5);
  });
});

describe('OverviewAnalyticsService — empty & role isolation', () => {
  it('returns honest nulls (not zeros) when a scope has no data', async () => {
    const res = await svc.getSchoolOverview({ schoolId: SCHOOL, filters: { period: 'today' }, now: NOW });
    // No results are dated exactly on 2026-01-15 within a today window ending NOW.
    expect(res.sections.achievement.avgExamScore.value).toBeNull();
    expect(res.sections.achievement.avgExamScore.sample).toBe(0);
    expect(res.sections.achievement.passRate.value).toBeNull();
  });

  it('is tenant-scoped: another school sees none of this data', async () => {
    await prisma.school.create({ data: { id: 'other', name: 'Other', slug: 'other' } });
    const res = await svc.getSchoolOverview({ schoolId: 'other', filters: { period: 'all' }, now: NOW });
    expect(res.sections.glance.totalStudents.value).toBe(0);
    expect(res.sections.achievement.avgExamScore.sample).toBe(0);
  });
});
