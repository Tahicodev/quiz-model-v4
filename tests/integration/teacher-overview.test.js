/**
 * tests/integration/teacher-overview.test.js
 *
 * Contract test for the Teacher Overview analytics service against a real
 * throwaway SQLite database with an injected clock.
 *
 * Every expectation is hand-computed from the seed below so a formula change
 * fails loudly. The test also proves the two security-critical rules:
 *  - a teacher only ever sees their assigned classes (another teacher's
 *    students/results never leak), and
 *  - a teacher with no assignment gets an explicit empty dashboard instead of
 *    a school-wide fallback.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaRepository } from '../../src/backend/infrastructure/PrismaRepository.js';
import { TeacherOverviewService } from '../../src/backend/services/TeacherOverviewService.js';

const ROOT = process.cwd();
const TEST_DB_PATH = path.join(ROOT, 'prisma', 'test-teacher-overview.db');
const TEST_DB_URL = `file:${TEST_DB_PATH.replace(/\\/g, '/')}`;

const SCHOOL = 'school-tov';
const NOW = new Date('2026-02-01T00:00:00.000Z');
const FILTERS = { period: 'custom', from: '2026-01-01', to: '2026-01-31' };

let prisma;
let svc;

const dt = (iso) => new Date(iso);

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  writeFileSync(TEST_DB_PATH, '');
  const schemaPath = path.join(ROOT, 'prisma', 'schema.prisma');
  const prismaBin = path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js');
  execFileSync(process.execPath, [prismaBin, 'migrate', 'deploy', '--schema', schemaPath], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });
  prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  svc = new TeacherOverviewService(new PrismaRepository(prisma));

  await prisma.school.create({
    data: { id: SCHOOL, name: 'Teacher Overview Test', slug: 'tov-test', school_year: '2025-2026' },
  });

  await prisma.class.createMany({
    data: [
      { id: 'C1', school_id: SCHOOL, name: 'Class One' },
      { id: 'C2', school_id: SCHOOL, name: 'Class Two' },
    ],
  });

  await prisma.user.createMany({
    data: [
      { id: 'T1', school_id: SCHOOL, username: 't1', password_hash: 'h', name: 'Teacher One', role: 'teacher', subjects_json: '["Mathematics"]' },
      { id: 'T2', school_id: SCHOOL, username: 't2', password_hash: 'h', name: 'Teacher Two', role: 'teacher' },
      { id: 'T3', school_id: SCHOOL, username: 't3', password_hash: 'h', name: 'Teacher Three', role: 'teacher' },
      { id: 'S1', school_id: SCHOOL, class_id: 'C1', username: 's1', password_hash: 'h', name: 'Student One', role: 'student', numero: '101' },
      { id: 'S2', school_id: SCHOOL, class_id: 'C1', username: 's2', password_hash: 'h', name: 'Student Two', role: 'student', numero: '102' },
      { id: 'S3', school_id: SCHOOL, class_id: 'C2', username: 's3', password_hash: 'h', name: 'Student Three', role: 'student', numero: '103' },
    ],
  });

  await prisma.setting.create({
    data: {
      school_id: SCHOOL,
      key: 'teacherClassAssignments',
      value: JSON.stringify({ T1: ['C1'], T2: ['C2'] }),
      visibility: 'admin',
    },
  });

  await prisma.subject.createMany({
    data: [
      { id: 'MATH', school_id: SCHOOL, created_by: 'T1', name: 'Mathematics' },
      { id: 'FRENCH', school_id: SCHOOL, created_by: 'T1', name: 'French' },
    ],
  });

  await prisma.category.createMany({
    data: [
      { id: 'CAT-MATH', school_id: SCHOOL, subject_id: 'MATH', created_by: 'T1', name: 'Mathematics' },
      { id: 'CAT-FRAC', school_id: SCHOOL, subject_id: 'MATH', created_by: 'T1', name: 'Fractions', parent_id: 'CAT-MATH' },
      { id: 'CAT-FR', school_id: SCHOOL, subject_id: 'FRENCH', created_by: 'T1', name: 'French' },
      { id: 'CAT-GRAM', school_id: SCHOOL, subject_id: 'FRENCH', created_by: 'T1', name: 'Grammar', parent_id: 'CAT-FR' },
    ],
  });

  await prisma.question.createMany({
    data: [
      { id: 'Q1', school_id: SCHOOL, category_id: 'CAT-FRAC', type: 'mcq', text: 'One half?', answer: 'A', created_by: 'T1' },
      { id: 'Q2', school_id: SCHOOL, category_id: 'CAT-FRAC', type: 'mcq', text: 'One third?', answer: 'B', created_by: 'T1' },
      { id: 'Q3', school_id: SCHOOL, category_id: 'CAT-GRAM', type: 'mcq', text: 'Le verbe?', answer: 'A', created_by: 'T1' },
    ],
  });

  await prisma.exam.createMany({
    data: [
      { id: 'E1', school_id: SCHOOL, creator_id: 'T1', name: 'Maths Exam', status: 'active', is_training: false, passing_score: 50 },
      { id: 'E2', school_id: SCHOOL, creator_id: 'T1', name: 'French Exam', status: 'active', is_training: false, passing_score: 50 },
    ],
  });
  await prisma.examQuestion.createMany({
    data: [
      { exam_id: 'E1', question_id: 'Q1', order_index: 0 },
      { exam_id: 'E1', question_id: 'Q2', order_index: 1 },
      { exam_id: 'E2', question_id: 'Q3', order_index: 0 },
    ],
  });
  await prisma.examClass.createMany({
    data: [
      { exam_id: 'E1', class_id: 'C1' },
      { exam_id: 'E2', class_id: 'C1' },
    ],
  });

  await prisma.course.create({
    data: {
      id: 'CO1',
      school_id: SCHOOL,
      created_by: 'T1',
      name: 'Fractions Course',
      status: 'published',
      subject_id: 'MATH',
      category_id: 'CAT-MATH',
    },
  });
  await prisma.lesson.create({
    data: { id: 'L1', course_id: 'CO1', category_id: 'CAT-FRAC', title: 'Halves and thirds', order_index: 0 },
  });
  await prisma.courseClass.create({ data: { course_id: 'CO1', class_id: 'C1' } });

  const mk = (id, user_id, exam_id, score, date, answers, mode = 'exam') => ({
    id,
    school_id: SCHOOL,
    user_id,
    exam_id,
    score,
    mode,
    passed: score >= 50,
    total_points: 10,
    earned_points: Math.round(score / 10),
    answers_json: JSON.stringify(answers),
    date_taken: dt(date),
  });

  await prisma.result.createMany({
    data: [
      mk('R1', 'S1', 'E1', 80, '2026-01-10T10:00:00Z', { Q1: 'A', Q2: 'B' }),
      mk('R2', 'S2', 'E1', 40, '2026-01-11T10:00:00Z', { Q1: 'C', Q2: 'B' }),
      mk('R3', 'S1', 'E2', 50, '2026-01-12T10:00:00Z', { Q3: 'A' }),
      mk('R4', 'S2', 'E2', 30, '2026-01-12T11:00:00Z', { Q3: 'B' }),
      mk('R5', 'S1', 'E1', 60, '2026-01-18T10:00:00Z', { Q1: 'A' }),
      // Previous equivalent window (Dec 2 → Jan 1).
      mk('R6', 'S1', 'E1', 40, '2025-12-20T10:00:00Z', { Q1: 'A' }),
      // Another teacher's class — must never appear for T1.
      mk('R7', 'S3', 'E1', 100, '2026-01-15T10:00:00Z', { Q1: 'A', Q2: 'B' }),
      // Training attempts (wrapped answers shape).
      mk('R8', 'S1', null, 30, '2026-01-19T10:00:00Z', { userAnswers: { Q1: 'B', Q2: 'A' } }, 'training'),
      mk('R9', 'S2', null, 70, '2026-01-20T10:00:00Z', { userAnswers: { Q1: 'A' } }, 'training'),
      // Inside the trailing 7-day window for NOW (Feb 1) — T2's class only,
      // so T1's period metrics are unaffected.
      mk('R10', 'S3', 'E1', 100, '2026-01-27T10:00:00Z', { Q1: 'A', Q2: 'B' }),
    ],
  });

  await prisma.game.create({
    data: {
      id: 'G1',
      school_id: SCHOOL,
      creator_id: 'T1',
      name: 'Fractions Race',
      type: 'quiz',
      status: 'finished',
      question_ids: JSON.stringify(['Q1']),
    },
  });
  await prisma.gameSession.create({
    data: { id: 'GS1', game_id: 'G1', user_id: 'S1', school_id: SCHOOL, score: 10, completed: true, joined_at: dt('2026-01-21T10:00:00Z') },
  });
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  for (const p of [TEST_DB_PATH, `${TEST_DB_PATH}-journal`]) {
    try { rmSync(p); } catch { /* gone */ }
  }
});

describe('TeacherOverviewService — scoped KPIs', () => {
  let data;
  beforeAll(async () => {
    data = await svc.getOverview({ schoolId: SCHOOL, teacherId: 'T1', filters: FILTERS, now: NOW });
  });

  it('counts unique students in the assigned classes only', () => {
    expect(data.meta.scope.empty).toBe(false);
    expect(data.meta.scope.classIds).toEqual(['C1']);
    expect(data.sections.glance.totalStudents.value).toBe(2);
    expect(data.sections.glance.activeStudents.value).toBe(2);
  });

  it('normalizes formal exam results to /20 and applies the 10/20 success rule', () => {
    // 5 attempts (R1,R2,R3,R4,R5) = 52% average.
    expect(data.sections.glance.avgExamScore.sample).toBe(5);
    expect(data.sections.glance.avgExamScore.value).toBe(10.4);
    expect(data.sections.glance.successRate.passed).toBe(3);
    expect(data.sections.glance.successRate.value).toBe(60);
    expect(data.sections.glance.completedExams.value).toBe(2);
    // Previous window has only 1 attempt → not comparable (min sample 5).
    expect(data.sections.glance.avgExamScore.comparable).toBe(false);
    expect(data.sections.glance.avgExamScore.delta).toBeNull();
  });

  it('attributes exam results to the dominant subject and separates training', () => {
    const math = data.sections.progress.subjectPerformance.find((s) => s.subjectId === 'MATH');
    const french = data.sections.progress.subjectPerformance.find((s) => s.subjectId === 'FRENCH');
    expect(math.avg20).toBe(12); // (80+40+60)/3 = 60%
    expect(math.sample).toBe(3);
    expect(french.avg20).toBe(8); // (50+30)/2 = 40%
    expect(french.sample).toBe(2);
    expect(data.sections.progress.trainingVsExam.training.avg20).toBe(10); // (30+70)/2
    expect(data.sections.progress.trainingVsExam.training.sample).toBe(2);
  });

  it('compares classes without double-counting students', () => {
    expect(data.sections.progress.classComparison).toHaveLength(1);
    const cls = data.sections.progress.classComparison[0];
    expect(cls.classId).toBe('C1');
    expect(cls.students).toBe(2);
    expect(cls.sample).toBe(5);
    expect(cls.avg20).toBe(10.4);
  });

  it('reports academic difficulty separately from engagement', () => {
    const rows = data.sections.attention.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].studentId).toBe('S2');
    expect(rows[0].kind).toBe('academic');
    expect(rows[0].avg20).toBe(7); // (40+30)/2 = 35%
    expect(data.sections.glance.needingAttention.value).toBe(1);
    expect(data.sections.glance.needingAttention.engagement).toBe(0);
  });

  it('computes chapter difficulty from real answers', () => {
    const fractions = data.sections.content.chapters.find((c) => c.categoryId === 'CAT-FRAC');
    expect(fractions).toBeTruthy();
    expect(fractions.attempts).toBe(8);
    expect(fractions.correctRate).toBe(62.5);
    expect(fractions.errorRate).toBe(37.5);
    expect(fractions.students).toBe(2);
    expect(fractions.courseId).toBe('CO1');
    // 8 answers but only 2 students → never flagged "high" from a tiny cohort.
    expect(fractions.severity).toBe('medium');
  });

  it('measures practice participation instead of claiming course completion', () => {
    const course = data.sections.content.courses.find((c) => c.courseId === 'CO1');
    expect(course.practicingStudents).toBe(2);
    expect(course.trainingAttempts).toBe(2);
    expect(course.avgTraining20).toBe(10);
    expect(data.sections.content.training.attempts).toBe(2);
    expect(data.meta.unavailable.courseCompletion).toMatch(/not tracked/i);
  });

  it('analyses exam assignment completion and question-level performance', () => {
    const exam = data.sections.exams.analysis.find((e) => e.examId === 'E1');
    expect(exam.assigned).toBe(2);
    expect(exam.completed).toBe(3); // three attempts in the window
    expect(exam.completedAllTime).toBe(2); // two distinct students
    expect(exam.pending).toBe(0);
    expect(exam.avg20).toBe(12); // (80+40+60)/3
    expect(exam.highest).toBe(16);
    expect(exam.lowest).toBe(8);
    const q1 = exam.questions.find((q) => q.questionId === 'Q1');
    expect(q1.attempts).toBe(3);
    expect(q1.correctRate).toBe(66.7);
    const q2 = exam.questions.find((q) => q.questionId === 'Q2');
    expect(q2.skipped).toBe(1); // R5 answered only Q1
    expect(data.sections.exams.summary.pendingAttempts.value).toBe(0);
  });

  it('keeps games as engagement only', () => {
    expect(data.sections.engagement.games.sessions).toBe(1);
    expect(data.sections.engagement.games.students).toBe(1);
    expect(data.sections.engagement.games.completed).toBe(1);
    const gameInsight = data.sections.insights.find((i) => i.id === 'games-engagement');
    expect(gameInsight).toBeTruthy();
    expect(gameInsight.severity).toBe('info');
    // No academic insight is fabricated from a single game session.
    expect(data.sections.insights.some((i) => i.id === 'exam-improvement')).toBe(false);
  });

  it('produces deterministic, evidence-bearing insights with navigation', () => {
    for (const insight of data.sections.insights) {
      expect(insight.observation).toBeTruthy();
      expect(insight.metric).toBeTruthy();
      expect(insight.link && insight.link.tab).toBeTruthy();
      // Domain lets each tab show only its own insights.
      expect(insight.domain).toBeTruthy();
    }
  });

  it('documents unavailable metrics instead of inventing them', () => {
    expect(data.meta.unavailable.examSchedule).toMatch(/no scheduled date/i);
    expect(data.meta.unavailable.trainingAbandonment).toMatch(/not measurable/i);
    expect(data.meta.unavailable.gameAcademicRanking).toMatch(/never merged/i);
    expect(data.meta.unavailable.questionDifficulty).toMatch(/authored metadata/i);
  });

  it('counts certified, failed and never-assessed students separately', () => {
    const g = data.sections.glance;
    expect(g.assessedStudents.value).toBe(2);
    expect(g.certifiedStudents.value).toBe(1); // S1 averages 12.67/20
    expect(g.failedExamStudents.value).toBe(1); // S2 averages 7/20
    expect(g.neverAssessedStudents.value).toBe(0);
    expect(g.notCertifiedStudents.value).toBe(1);
    expect(g.notCertifiedStudents.failed).toBe(1);
    expect(g.certificationRate.value).toBe(50);
  });

  it('exposes student-level pass/fail and attention counts per class', () => {
    const cls = data.sections.progress.classComparison[0];
    expect(cls.passCount).toBe(3);
    expect(cls.failCount).toBe(2);
    expect(cls.studentsAbove10).toBe(1); // S1
    expect(cls.studentsBelow10).toBe(1); // S2
    expect(cls.attention).toEqual({ total: 1, academic: 1, engagement: 0, both: 0 });
    expect(data.sections.progress.bestClass.classId).toBe('C1');
    expect(data.sections.attention.byClass).toEqual([
      { classId: 'C1', className: 'Class One', total: 1, academic: 1, engagement: 0, both: 0 },
    ]);
  });

  it('ranks the weakest class over the trailing seven days', () => {
    const week = data.sections.progress.weekComparison;
    expect(week.label).toBe('Last 7 days');
    // T1 has no formal result between Jan 25 and Feb 1 in the seed.
    expect(week.classes).toEqual([]);
    expect(week.best).toBeNull();
    expect(week.weakest).toBeNull();
  });

  it('analyses the teacher question bank from real answers', () => {
    const q = data.sections.questions;
    expect(q.summary.total.value).toBe(3);
    expect(q.coverage).toMatchObject({
      categorised: 3,
      uncategorised: 0,
      examAssigned: 3,
      practised: 3,
      untouched: 0,
    });
    expect(q.typeMix).toEqual([{ key: 'mcq', count: 3, pct: 100 }]);
    expect(q.bySubject.find((s) => s.subjectId === 'MATH')).toMatchObject({
      count: 2,
      practised: 2,
      struggling: 0,
    });
    const q1 = q.performance.find((row) => row.questionId === 'Q1');
    expect(q1.attempts).toBe(5); // R1, R2, R5 + training R8, R9
    expect(q1.correct).toBe(3);
    expect(q1.correctRate).toBe(60);
    expect(q1.examAttempts).toBe(3);
    expect(q1.trainingAttempts).toBe(2);
    expect(q.hardestQuestions.map((row) => row.questionId)).toEqual(['Q1']);
    expect(q.summary.struggling.value).toBe(0);
  });
});

describe('TeacherOverviewService — filters', () => {
  it('narrows every result metric to the selected subject', async () => {
    const data = await svc.getOverview({
      schoolId: SCHOOL,
      teacherId: 'T1',
      filters: { ...FILTERS, subjectIds: ['FRENCH'] },
      now: NOW,
    });
    expect(data.meta.scope.subjectIds).toEqual(['FRENCH']);
    expect(data.sections.glance.avgExamScore.sample).toBe(2);
    expect(data.sections.glance.avgExamScore.value).toBe(8);
    expect(data.sections.progress.subjectPerformance.map((s) => s.subjectId)).toEqual(['FRENCH']);
    // Training attempts are attributed through their answers (Maths) → excluded.
    expect(data.sections.progress.trainingVsExam.training.sample).toBe(0);
    // Courses are narrowed by subject too.
    expect(data.sections.content.courses).toHaveLength(0);
    // The question bank follows the same subject boundary.
    expect(data.sections.questions.summary.total.value).toBe(1);
    expect(data.sections.questions.performance.map((row) => row.questionId)).toEqual(['Q3']);
    expect(data.sections.glance.assessedStudents.value).toBe(2);
  });

  it('narrows to one class and drops the other class entirely', async () => {
    const data = await svc.getOverview({
      schoolId: SCHOOL,
      teacherId: 'T1',
      filters: { ...FILTERS, classIds: ['C1'] },
      now: NOW,
    });
    expect(data.meta.scope.classIds).toEqual(['C1']);
    expect(data.sections.glance.totalStudents.value).toBe(2);
  });

  it('never widens beyond the teacher assignment', async () => {
    const data = await svc.getOverview({
      schoolId: SCHOOL,
      teacherId: 'T1',
      filters: { ...FILTERS, classIds: ['C2'] },
      now: NOW,
    });
    expect(data.meta.scope.empty).toBe(true);
    expect(data.meta.scope.classIds).toEqual([]);
    expect(data.sections.glance.totalStudents.value).toBe(0);
  });

  it('isolates a second teacher to their own class', async () => {
    const data = await svc.getOverview({
      schoolId: SCHOOL,
      teacherId: 'T2',
      filters: FILTERS,
      now: NOW,
    });
    expect(data.meta.scope.classIds).toEqual(['C2']);
    expect(data.sections.glance.totalStudents.value).toBe(1);
    expect(data.sections.glance.avgExamScore.value).toBe(20); // R7 + R10, both 20/20
    expect(data.sections.attention.rows.some((r) => r.studentId === 'S1')).toBe(false);
  });

  it('returns an explicit empty dashboard when no class is assigned', async () => {
    const data = await svc.getOverview({
      schoolId: SCHOOL,
      teacherId: 'T3',
      filters: FILTERS,
      now: NOW,
    });
    expect(data.meta.scope.empty).toBe(true);
    expect(data.meta.emptyReason).toMatch(/assigned/i);
    expect(data.sections.glance.totalStudents.value).toBe(0);
    expect(data.sections.insights[0].id).toBe('no-classes');
    expect(data.sections.content.courses).toEqual([]);
  });

  it('supports the week period key without breaking existing periods', async () => {
    const data = await svc.getOverview({
      schoolId: SCHOOL,
      teacherId: 'T1',
      filters: { period: 'week' },
      now: NOW, // Feb 1 2026 is a Sunday → week starts Jan 26
    });
    expect(data.meta.period.key).toBe('week');
    expect(data.meta.period.label).toBe('This week');
    // No results between Jan 26 and Feb 1 in the seed.
    expect(data.sections.glance.avgExamScore.sample).toBe(0);
    expect(data.sections.glance.avgExamScore.value).toBeNull();
  });

  it('identifies the weakest class from the trailing week', async () => {
    const data = await svc.getOverview({
      schoolId: SCHOOL,
      teacherId: 'T2',
      filters: FILTERS,
      now: NOW,
    });
    const week = data.sections.progress.weekComparison;
    expect(week.classes).toHaveLength(1);
    expect(week.classes[0]).toMatchObject({
      classId: 'C2',
      avg20: 20,
      sample: 1,
      reliable: false,
    });
    expect(week.weakest.classId).toBe('C2');
    expect(week.best.classId).toBe('C2');
  });
});

describe('TeacherOverviewService — live presence', () => {
  const clients = [
    { socketId: 'p1', userId: 'S1', schoolId: SCHOOL, role: 'student', kind: 'student' },
    // A second tab for the same student must not double-count.
    { socketId: 'p2', userId: 'S1', schoolId: SCHOOL, role: 'student', kind: 'student' },
    { socketId: 'p3', userId: 'S3', schoolId: SCHOOL, role: 'student', kind: 'student' },
    { socketId: 'p4', userId: 'T1', schoolId: SCHOOL, role: 'teacher', kind: 'staff' },
    { socketId: 'p5', userId: 'S9', schoolId: 'other-school', role: 'student', kind: 'student' },
  ];
  let presenceSvc;

  beforeAll(() => {
    presenceSvc = new TeacherOverviewService(new PrismaRepository(prisma), {
      listPresence: ({ schoolId }) =>
        clients.filter((client) => !schoolId || client.schoolId === schoolId),
    });
  });

  it('counts unique online students in the assigned classes', async () => {
    const presence = await presenceSvc.getPresence({
      schoolId: SCHOOL,
      teacherId: 'T1',
      now: NOW,
    });
    expect(presence.studentsOnline).toBe(1); // S1 in two tabs
    expect(presence.classesOnline).toBe(1);
    expect(presence.totalClasses).toBe(1);
    expect(presence.totalStudents).toBe(2);
    expect(presence.onlineRate).toBe(50);
    expect(presence.byClass).toEqual([
      { classId: 'C1', className: 'Class One', online: 1, total: 2 },
    ]);
  });

  it('never widens presence beyond the teacher assignment', async () => {
    const presence = await presenceSvc.getPresence({
      schoolId: SCHOOL,
      teacherId: 'T1',
      filters: { classIds: ['C2'] },
      now: NOW,
    });
    expect(presence.totalClasses).toBe(0);
    expect(presence.studentsOnline).toBe(0);
    expect(presence.byClass).toEqual([]);
  });

  it('isolates a second teacher to their own online students', async () => {
    const presence = await presenceSvc.getPresence({
      schoolId: SCHOOL,
      teacherId: 'T2',
      now: NOW,
    });
    expect(presence.studentsOnline).toBe(1);
    expect(presence.byClass).toEqual([
      { classId: 'C2', className: 'Class Two', online: 1, total: 1 },
    ]);
  });

  it('reports an explicit empty presence when no class is assigned', async () => {
    const presence = await presenceSvc.getPresence({
      schoolId: SCHOOL,
      teacherId: 'T3',
      now: NOW,
    });
    expect(presence.totalClasses).toBe(0);
    expect(presence.byClass).toEqual([]);
    expect(presence.onlineRate).toBeNull();
  });
});
