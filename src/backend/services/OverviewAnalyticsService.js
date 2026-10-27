/**
 * src/backend/services/OverviewAnalyticsService.js
 *
 * School-wide analytics for the Admin Dashboard Overview.
 *
 * Design (locked during the audit/design phases):
 *  - Aggregation happens here (backend / repository layer), NOT in the browser.
 *    The client fetches a compact, pre-computed metric bundle instead of
 *    downloading every user/result/exam row.
 *  - Everything is tenant-scoped (`school_id`) and role-scoped by the route
 *    (admin-only). A teacher never reaches this service for school-wide data.
 *  - The database is the single source of truth: only Prisma aggregates
 *    (count / groupBy / aggregate) are used — never localStorage caches and
 *    never fabricated/placeholder values.
 *  - Missing data is returned as `null` (an "unavailable" signal), never a
 *    fake zero. Division by zero is guarded everywhere.
 *
 * Data-model facts that shape the formulas (see prisma/schema.prisma):
 *  - Result has NO class_id column. Class attribution goes through the
 *    optional `user` relation (User.class_id); class filters therefore use a
 *    Prisma relation filter `user: { class_id }`, which naturally excludes
 *    anonymous (kid PIN) plays.
 *  - Score is a percentage (0–100). The /20 academic scale is score / 5.
 *  - "Formal exam" outcomes are mode === 'exam' rows that reference a real
 *   , non-training Exam. Training/game/tournament results are kept separate so
 *    achievement KPIs never mix practice with assessment.
 *  - School.school_year is a single free-text string (e.g. "2025-2026"); records
 *    are NOT year-tagged, so "academic year" is a DERIVED date window parsed
 *    from that string. Tooltips must say so.
 *  - exam_classes is unreliable for legacy exams (many only store classes in
 *    options_json), so assignment-level completion (KPI 10) is intentionally
 *    reported as unavailable rather than faked from exam definitions.
 */

import {
  ROLES,
  EXAM_STATUS,
  GAME_STATUS,
  TOURNAMENT_STATUS,
  RESULT_MODE,
} from '../../shared/constants.js';

// Minimum finalized-result sample before a class ranking / trend is trusted.
// Small samples produce misleading averages, so we surface "insufficient data"
// instead of a confident-looking-but-noise number.
const MIN_RESULTS_FOR_RANK = 5;
const MIN_RESULTS_FOR_TREND = 5;

// One school academic year ≈ Sept 1 → Aug 31 of the following year. Records are
// not year-tagged; this is the derived window the "This academic year" filter
// applies to date-bearing entities (results, sessions, games, tournaments).
function parseAcademicYearWindow(rawSchoolYear, now = new Date()) {
  const match = String(rawSchoolYear || '').match(/(\d{4})\D+(\d{4})/);
  if (!match) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || endYear <= startYear) {
    return null;
  }
  return {
    label: `${startYear}-${endYear}`,
    start: new Date(Date.UTC(startYear, 8, 1)), // Sept 1
    end: new Date(Date.UTC(endYear, 7, 31, 23, 59, 59, 999)), // Aug 31 next yr
    startYear,
    endYear,
  };
}

// Resolve the [start,end] instant for a period selection. `academicWindow`
// bounds term/month math to the chosen school year; a null window means the
// caller picked "All time".
function resolvePeriodWindow(periodKey, now, academicWindow, customFrom, customTo) {
  const d = now instanceof Date ? now : new Date(now);
  const utcDayStart = (date) =>
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  switch (periodKey) {
    case 'today': {
      const start = utcDayStart(d);
      return { key: 'today', label: 'Today', start, end: d };
    }
    case '7d': {
      const start = new Date(d.getTime() - 7 * 86400000);
      return { key: '7d', label: 'Last 7 days', start, end: d };
    }
    case '30d': {
      const start = new Date(d.getTime() - 30 * 86400000);
      return { key: '30d', label: 'Last 30 days', start, end: d };
    }
    case 'month': {
      const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      return { key: 'month', label: 'Current month', start, end: d };
    }
    case 'term': {
      // Trimester within the academic year (or calendar year as a fallback).
      const base = academicWindow || {
        start: new Date(Date.UTC(d.getUTCFullYear(), 0, 1)),
        end: new Date(Date.UTC(d.getUTCFullYear(), 11, 31, 23, 59, 59)),
        startYear: d.getUTCFullYear(),
      };
      const a = base.start;
      const spanMs = base.end.getTime() - a.getTime();
      const q = Math.min(2, Math.floor(((d.getTime() - a.getTime()) / spanMs) * 3));
      const tStart = new Date(a.getTime() + (spanMs / 3) * q);
      const tEnd = new Date(a.getTime() + (spanMs / 3) * (q + 1));
      return {
        key: 'term',
        label: `Current term (T${q + 1})`,
        start: tStart,
        end: d < tEnd ? d : tEnd,
      };
    }
    case 'all':
      return { key: 'all', label: 'All time', start: null, end: null };
    case 'custom': {
      const start = customFrom ? new Date(customFrom) : null;
      const end = customTo ? new Date(customTo) : null;
      return {
        key: 'custom',
        label: 'Custom range',
        start: start && Number.isFinite(start.getTime()) ? start : null,
        end: end && Number.isFinite(end.getTime()) ? end : null,
      };
    }
    default:
      return { key: '30d', label: 'Last 30 days', start: new Date(d.getTime() - 30 * 86400000), end: d };
  }
}

// Preceding window of identical length (for trend comparison). Returns null for
// open-ended windows ("all time") where a delta is not meaningful.
function precedingWindow(window) {
  if (!window.start || !window.end) return null;
  const len = window.end.getTime() - window.start.getTime();
  if (len <= 0) return null;
  return {
    start: new Date(window.start.getTime() - len),
    end: new Date(window.start.getTime()),
  };
}

export class OverviewAnalyticsService {
  #repo;
  #m;

  /** @param {import('../infrastructure/PrismaRepository.js').PrismaRepository} repo */
  constructor(repo) {
    this.#repo = repo;
    // Prisma delegates expose the aggregate primitives (count/groupBy/aggregate)
    // the generic repo API does not; resolve them through the repo's accessor.
    this.#m = {
      user: repo.modelFor('users'),
      class: repo.modelFor('classes'),
      category: repo.modelFor('categories'),
      question: repo.modelFor('questions'),
      exam: repo.modelFor('exams'),
      result: repo.modelFor('results'),
      game: repo.modelFor('games'),
      tournament: repo.modelFor('tournaments'),
      setting: repo.modelFor('settings'),
      school: repo.modelFor('schools'),
    };
  }

  // ── scope helpers ────────────────────────────────────────────────────────

  async #teacherClassIds(schoolId, teacherId) {
    if (!teacherId) return [];
    const row = await this.#m.setting.findFirst({
      where: { school_id: schoolId, key: 'teacherClassAssignments' },
      select: { value: true },
    });
    try {
      const map = JSON.parse(row?.value || '{}');
      const ids = map?.[teacherId];
      if (!Array.isArray(ids)) return [];
      return [...new Set(ids.map(String))].filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Where-clause fragment that scopes a Result to the selected class (direct) or
   * teacher (their assigned classes). Returns {} when unscoped.
   */
  #resultScope(classId, teacherClassIds) {
    if (classId) return { user: { class_id: String(classId) } };
    if (teacherClassIds && teacherClassIds.length) {
      return { user: { class_id: { in: teacherClassIds.map(String) } } };
    }
    return {};
  }

  // Relation filter that keeps only results whose parent exam contains at least
  // one question in the selected category ('uncategorized' → a question with no
  // category). Returns null when no category filter is active.
  #examCategoryFilter(categoryId) {
    if (!categoryId) return null;
    const question =
      categoryId === 'uncategorized'
        ? { category_id: null }
        : { category_id: String(categoryId) };
    return { examQuestions: { some: { question } } };
  }

  // Combine the class/teacher result-scope with the optional per-request
  // student / category / mode narrowing into one `fc` (filter context) the
  // section builders thread through. Kept as a plain object (never instance
  // state) so concurrent requests can't leak filters between each other.
  #buildFilterContext({ classId, teacherClassIds, studentId, categoryId, mode }) {
    return {
      scope: this.#resultScope(classId, teacherClassIds),
      studentId: studentId ? String(studentId) : '',
      categoryId: categoryId ? String(categoryId) : '',
      mode: mode ? String(mode) : '',
      examCategory: this.#examCategoryFilter(categoryId),
    };
  }

  #dateWindowFilter(field, window) {
    if (!window || !window.start || !window.end) return {};
    return { [field]: { gte: window.start, lte: window.end } };
  }

  // Formal, finalized exam results: mode 'exam', a real non-training exam id, and
  // (relation-scoped) the exam is not flagged as a training activity. The student
  // and category filters narrow the same population. The Mode filter is intentionally
  // NOT applied here — formal achievement (average score, pass rate, certification)
  // is exam-based by definition, so selecting a mode leaves these metrics unchanged.
  #formalExamBaseWhere(schoolId, fc) {
    const exam = { is_training: false };
    if (fc.examCategory) Object.assign(exam, fc.examCategory);
    const where = {
      school_id: schoolId,
      mode: RESULT_MODE.EXAM,
      exam_id: { not: null },
      ...fc.scope,
      exam,
    };
    if (fc.studentId) where.user_id = fc.studentId;
    return where;
  }

  // Any qualifying learning activity (submitted exam / training / tournament /
  // game result) tied to a real student account. Used for participation.
  #activityBaseWhere(schoolId, fc) {
    const where = {
      school_id: schoolId,
      user_id: { not: null },
      mode: fc.mode
        ? fc.mode
        : { in: [RESULT_MODE.EXAM, RESULT_MODE.TRAINING, RESULT_MODE.TOURNAMENT, RESULT_MODE.GAME] },
      ...fc.scope,
    };
    if (fc.studentId) where.user_id = fc.studentId;
    if (fc.examCategory) where.exam = fc.examCategory;
    return where;
  }

  // Authorship scope for content entities (questions / exams) when a teacher is
  // selected. Empty when unscoped.
  #authorScope(field, teacherId) {
    return teacherId ? { [field]: String(teacherId) } : {};
  }

  // ── main entry point ─────────────────────────────────────────────────────

  /**
   * @param {object} p
   * @param {string} p.schoolId
   * @param {object} [p.filters] { academicYear, period, teacherId, classId, from, to }
   * @param {Date}   [p.now] injectable clock for tests
   */
  async getSchoolOverview({ schoolId, filters = {}, now = new Date() }) {
    const school = await this.#m.school.findUnique({
      where: { id: schoolId },
      select: { school_year: true },
    });
    const academicWindow = parseAcademicYearWindow(school?.school_year, now);

    // Academic-year selection: 'current' (derived window), 'all' (unbounded),
    // or a specific label. Lifetime/current-state totals ignore it; only the
    // reporting window and historical aggregates respect it.
    const yearChoice = String(filters.academicYear || 'current');
    let periodBounds = academicWindow; // default reporting floor/ceiling
    if (yearChoice === 'all') periodBounds = null;

    const periodKey = String(filters.period || '30d');
    let window = resolvePeriodWindow(periodKey, now, periodBounds, filters.from, filters.to);
    // When viewing the whole academic year as the "period", anchor to its bounds.
    if (yearChoice !== 'all' && periodKey === 'year' && academicWindow) {
      window = { key: 'year', label: academicWindow.label, start: academicWindow.start, end: academicWindow.end };
    }

    const teacherId = filters.teacherId ? String(filters.teacherId) : '';
    const classId = filters.classId ? String(filters.classId) : '';
    const teacherClassIds = teacherId ? await this.#teacherClassIds(schoolId, teacherId) : [];
    const studentId = filters.studentId ? String(filters.studentId) : '';
    const categoryId = filters.categoryId ? String(filters.categoryId) : '';
    const mode =
      filters.mode === RESULT_MODE.EXAM || filters.mode === RESULT_MODE.TRAINING
        ? filters.mode
        : '';

    // Single per-request filter context threaded through every section so all
    // seven Overview filters behave consistently (never instance state).
    const fc = this.#buildFilterContext({
      classId,
      teacherClassIds,
      studentId,
      categoryId,
      mode,
    });
    const prev = precedingWindow(window);

    const [
      glance,
      content,
      achievement,
      engagement,
      teacherInsights,
    ] = await Promise.all([
      this.#sectionGlance(schoolId, fc, window, { studentId }),
      this.#sectionContent(schoolId, teacherId, classId, teacherClassIds, { categoryId }),
      this.#sectionAchievement(schoolId, fc, window, prev, { studentId }),
      this.#sectionEngagement(schoolId, fc, window),
      this.#sectionTeacherInsights(schoolId, teacherId, classId, teacherClassIds, window, fc),
    ]);

    return {
      meta: {
        generatedAt: now.toISOString(),
        scope: {
          academicYear: yearChoice,
          academicYearLabel: academicWindow?.label || null,
          academicYearWindowed: yearChoice !== 'all' && !!academicWindow,
          period: window.key,
          periodLabel: window.label,
          periodStart: window.start ? window.start.toISOString() : null,
          periodEnd: window.end ? window.end.toISOString() : null,
          teacherId: teacherId || null,
          classId: classId || null,
          studentId: studentId || null,
          categoryId: categoryId || null,
          mode: mode || null,
        },
        thresholds: {
          passNormalized: 10, // /20
          passPercent: 50, // score >= 50 (== 10/20)
          minResultsForRank: MIN_RESULTS_FOR_RANK,
          minResultsForTrend: MIN_RESULTS_FOR_TREND,
        },
        // KPIs the schema cannot honestly support are flagged, not faked.
        unavailable: {
          assessmentCompletionRate:
            'Exam-class assignments are not reliably recorded for legacy exams, so an assignment-level completion rate cannot be computed.',
          curriculumCompliance: 'No curriculum-mapping data exists in the schema.',
        },
        // How each optional filter narrows this bundle — surfaced so the UI can
        // explain scope without guessing.
        filterSemantics: {
          studentId: studentId
            ? 'All result-based metrics and the student population are narrowed to this one student.'
            : null,
          categoryId: categoryId
            ? 'Content metrics use the category directly; result-based metrics use each exam\'s question→category junction (legacy exams without a recorded junction contribute no results).'
            : null,
          mode: mode
            ? 'Participation, activity and engagement counts reflect the selected mode only. Formal achievement metrics (average score, pass rate, certification) are exam-based by definition and stay unchanged.'
            : null,
        },
      },
      sections: { glance, content, achievement, engagement, teacherInsights },
    };
  }

  // ── Section A — School at a Glance ───────────────────────────────────────

  async #sectionGlance(schoolId, fc, window) {
    const studentFilter = { school_id: schoolId, role: ROLES.STUDENT };
    if (fc.studentId) studentFilter.id = fc.studentId;
    const totalStudentsWhere = fc.scope.user ? { ...studentFilter, ...fc.scope.user } : studentFilter;

    const [totalStudents, totalTeachers, totalClasses] = await Promise.all([
      this.#m.user.count({ where: totalStudentsWhere }),
      this.#m.user.count({ where: { school_id: schoolId, role: ROLES.TEACHER } }),
      this.#m.class.count({ where: { school_id: schoolId } }),
    ]);

    // Distinct students with ≥1 qualifying activity in the reporting window.
    const activeGroups = await this.#m.result.groupBy({
      by: ['user_id'],
      where: { ...this.#activityBaseWhere(schoolId, fc), ...this.#dateWindowFilter('date_taken', window) },
      _count: { _all: true },
    });
    const activeStudents = activeGroups.filter((g) => g.user_id).length;

    // Students needing attention: ≥2 formal exam attempts in window, zero passes.
    // Prisma cannot `_sum` a Boolean, so passing students are gathered with a
    // second groupBy and subtracted from the repeated-attempt set.
    const formalWindowed = {
      ...this.#formalExamBaseWhere(schoolId, fc),
      ...this.#dateWindowFilter('date_taken', window),
    };
    // Only require a real student account when a single student is not already
    // pinned by the filter (otherwise the bare `user_id` would overwrite it).
    if (!fc.studentId) formalWindowed.user_id = { not: null };
    const [attemptGroups, passingAttemptGroups] = await Promise.all([
      this.#m.result.groupBy({
        by: ['user_id'],
        where: formalWindowed,
        _count: { _all: true },
      }),
      this.#m.result.groupBy({
        by: ['user_id'],
        where: { ...formalWindowed, passed: true },
        _count: { _all: true },
      }),
    ]);
    const everPassed = new Set(passingAttemptGroups.map((g) => g.user_id));
    const needingAttention = attemptGroups.filter(
      (g) => g.user_id && g._count._all >= 2 && !everPassed.has(g.user_id),
    ).length;

    return {
      totalStudents: { value: totalStudents, basis: 'current-state' },
      activeStudents: {
        value: activeStudents,
        basis: 'period',
        rate: totalStudents > 0 ? round1((activeStudents / totalStudents) * 100) : null,
      },
      totalTeachers: { value: totalTeachers, basis: 'current-state' },
      totalClasses: { value: totalClasses, basis: 'current-state' },
      participationRate: {
        value: totalStudents > 0 ? round1((activeStudents / totalStudents) * 100) : null,
        numerator: activeStudents,
        denominator: totalStudents,
        basis: 'period',
      },
      studentsNeedingAttention: {
        value: needingAttention,
        basis: 'period',
        rule: 'At least 2 formal exam attempts in the period with no passing result.',
      },
    };
  }

  // ── Section B — Educational Content & Assessment ─────────────────────────

  async #sectionContent(schoolId, teacherId, classId, teacherClassIds, { categoryId } = {}) {
    const authorQ = this.#authorScope('created_by', teacherId);
    const authorE = this.#authorScope('creator_id', teacherId);
    // Question-category filter for the content metrics. 'uncategorized' maps to
    // questions with no category_id; a concrete id filters to that category.
    const catQ = categoryId
      ? categoryId === 'uncategorized'
        ? { category_id: null }
        : { category_id: String(categoryId) }
      : {};

    const [totalQuestions, activeExams, totalCategories] = await Promise.all([
      this.#m.question.count({ where: { school_id: schoolId, ...authorQ, ...catQ } }),
      this.#m.exam.count({
        where: {
          school_id: schoolId,
          status: EXAM_STATUS.ACTIVE,
          is_training: false,
          ...authorE,
          // When a category is selected, keep only exams that draw on it.
          ...(categoryId ? { examQuestions: { some: { question: catQ } } } : {}),
        },
      }),
      this.#m.category.count({ where: { school_id: schoolId, ...this.#authorScope('created_by', teacherId) } }),
    ]);

    // Content coverage: distinct categories that actually hold questions.
    const catGroups = await this.#m.question.groupBy({
      by: ['category_id'],
      where: { school_id: schoolId, category_id: { not: null }, ...authorQ, ...catQ },
      _count: { _all: true },
    });
    const distribution = catGroups
      .map((g) => ({ categoryId: g.category_id, count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    // Exams conducted: distinct exams with finalized formal results in the window.
    // (Computed by the achievement section too; kept here for the content scope.)
    return {
      totalQuestions: { value: totalQuestions, basis: 'current-state' },
      activeExams: { value: activeExams, basis: 'current-state' },
      contentCoverage: {
        categoriesWithQuestions: distribution.length,
        totalCategories,
        distribution,
        basis: 'current-state',
      },
      // Omitted honestly (see meta.unavailable).
      assessmentCompletionRate: { value: null, status: 'unavailable' },
    };
  }

  // ── Section C — Student Achievement & Performance ────────────────────────

  async #sectionAchievement(schoolId, fc, window, prev) {
    const formalBase = this.#formalExamBaseWhere(schoolId, fc);
    const formalWindow = { ...formalBase, ...this.#dateWindowFilter('date_taken', window) };

    const [agg, passedCount] = await Promise.all([
      this.#m.result.aggregate({
        where: formalWindow,
        _avg: { score: true },
        _count: { _all: true },
      }),
      this.#m.result.count({ where: { ...formalWindow, passed: true } }),
    ]);

    const sample = agg._count._all;
    const avgScore20 = agg._avg.score == null ? null : round2(agg._avg.score / 5);
    const passRate = sample > 0 ? round1((passedCount / sample) * 100) : null;

    // Exams conducted: distinct exams with ≥1 finalized formal result in the
    // window (exam definitions are never counted as conducted).
    const conductedGroups = await this.#m.result.groupBy({
      by: ['exam_id'],
      where: { ...formalWindow, exam_id: { not: null } },
      _count: { _all: true },
    });
    const examsConducted = conductedGroups.filter((g) => g.exam_id).length;

    // Certified / pending: distinct students with ≥1 passing formal exam across
    // the academic-year reporting window, vs. the eligible enrolled population.
    const certifiedGroups = await this.#m.result.groupBy({
      by: ['user_id'],
      where: { ...formalWindow, passed: true },
      _count: { _all: true },
    });
    const certifiedStudents = certifiedGroups.filter((g) => g.user_id).length;

    const studentFilter = { school_id: schoolId, role: ROLES.STUDENT };
    if (fc.scope.user) Object.assign(studentFilter, fc.scope.user);
    if (fc.studentId) studentFilter.id = fc.studentId;
    const totalStudents = await this.#m.user.count({ where: studentFilter });
    // Eligible = students who actually sat at least one formal exam in the window.
    const satWhere = { ...formalWindow };
    if (!fc.studentId) satWhere.user_id = { not: null };
    const satGroups = await this.#m.result.groupBy({
      by: ['user_id'],
      where: satWhere,
      _count: { _all: true },
    });
    const assessedStudents = satGroups.filter((g) => g.user_id).length;
    const pendingSuccess = Math.max(0, assessedStudents - certifiedStudents);

    // Trend vs preceding equal-length window.
    let trend;
    if (prev) {
      const prevAgg = await this.#m.result.aggregate({
        where: { ...formalBase, ...this.#dateWindowFilter('date_taken', prev) },
        _avg: { score: true },
        _count: { _all: true },
      });
      const prevSample = prevAgg._count._all;
      const prevAvg20 = prevAgg._avg.score == null ? null : round2(prevAgg._avg.score / 5);
      const insufficient =
        sample < MIN_RESULTS_FOR_TREND || prevSample < MIN_RESULTS_FOR_TREND ||
        avgScore20 == null || prevAvg20 == null;
      trend = {
        insufficient,
        current: avgScore20,
        previous: prevAvg20,
        currentSample: sample,
        previousSample: prevSample,
        deltaAbs: insufficient || prevAvg20 == null ? null : round2(avgScore20 - prevAvg20),
        deltaPct:
          insufficient || !prevAvg20 ? null : round1(((avgScore20 - prevAvg20) / prevAvg20) * 100),
        previousWindow: prev
          ? { start: prev.start.toISOString(), end: prev.end.toISOString() }
          : null,
      };
    } else {
      trend = { insufficient: true, reason: 'No comparable preceding period (open-ended window).' };
    }

    // Per-class averages: group by student, then map to class (Result lacks a
    // class_id) — bounded, avoids N+1 and avoids downloading raw results.
    const classComparison = await this.#classComparison(schoolId, fc, window);
    const eligible = classComparison.filter((c) => c.sample >= MIN_RESULTS_FOR_RANK);
    const topClass =
      eligible.length
        ? eligible.slice().sort((a, b) => b.avgScore20 - a.avgScore20)[0]
        : null;

    return {
      avgExamScore: { value: avgScore20, sample, basis: 'period', scale: 20 },
      examsConducted: { value: examsConducted, basis: 'period' },
      passRate: { value: passRate, passed: passedCount, total: sample, basis: 'period', threshold: 'passed flag (exam-configured; default 10/20)' },
      certifiedStudents: { value: certifiedStudents, basis: 'period' },
      pendingSuccess: {
        value: pendingSuccess,
        assessedStudents,
        certifiedStudents,
        basis: 'period',
        note: 'Students who sat ≥1 formal exam in the window but have not passed one.',
      },
      avgScoreTrend: trend,
      topClass: topClass
        ? { value: topClass.className, avgScore20: topClass.avgScore20, sample: topClass.sample }
        : { value: null, status: 'insufficient-data', minSample: MIN_RESULTS_FOR_RANK },
      classComparison,
      minSampleForRank: MIN_RESULTS_FOR_RANK,
    };
  }

  async #classComparison(schoolId, fc, window) {
    const where = {
      ...this.#formalExamBaseWhere(schoolId, fc),
      ...this.#dateWindowFilter('date_taken', window),
    };
    if (!fc.studentId) where.user_id = { not: null };
    const byStudent = await this.#m.result.groupBy({
      by: ['user_id'],
      where,
      _avg: { score: true },
      _count: { _all: true },
    });
    if (!byStudent.length) return [];

    // Passing attempts per student (Boolean has no `_sum`, so a dedicated
    // groupBy feeds the per-class pass rate).
    const passingByStudent = await this.#m.result.groupBy({
      by: ['user_id'],
      where: { ...where, passed: true },
      _count: { _all: true },
    });
    const passingMap = new Map(passingByStudent.map((s) => [s.user_id, s._count._all]));

    const userIds = byStudent.map((s) => s.user_id).filter(Boolean);
    const users = await this.#m.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, class_id: true },
    });
    const classOfUser = new Map(users.map((u) => [u.id, u.class_id]));
    const classes = await this.#m.class.findMany({
      where: { school_id: schoolId },
      select: { id: true, name: true },
    });
    const className = new Map(classes.map((c) => [c.id, c.name]));

    // Weight each student's mean by their result count → per-class average.
    const bucket = new Map();
    for (const s of byStudent) {
      const cid = classOfUser.get(s.user_id) || '__unassigned__';
      const b = bucket.get(cid) || { classId: cid, scoreWeighted: 0, count: 0, passed: 0, students: 0 };
      const n = s._count._all;
      b.scoreWeighted += (s._avg.score || 0) * n;
      b.count += n;
      b.passed += passingMap.get(s.user_id) || 0;
      b.students += 1;
      bucket.set(cid, b);
    }

    return [...bucket.values()]
      .map((b) => ({
        classId: b.classId,
        className: className.get(b.classId) || 'Unassigned',
        avgScore20: b.count > 0 ? round2(b.scoreWeighted / b.count / 5) : null,
        sample: b.count,
        students: b.students,
        passRate: b.count > 0 ? round1((b.passed / b.count) * 100) : null,
      }))
      .filter((c) => c.avgScore20 != null)
      .sort((a, b) => b.avgScore20 - a.avgScore20);
  }

  // ── Section D — Engagement, Games & Live Activity ────────────────────────

  async #sectionEngagement(schoolId, fc, window) {
    const activityWindow = {
      ...this.#activityBaseWhere(schoolId, fc),
      ...this.#dateWindowFilter('date_taken', window),
    };
    const [totalAttempts, completedAssessments] = await Promise.all([
      this.#m.result.count({ where: activityWindow }),
      this.#m.result.count({
        where: {
          ...this.#formalExamBaseWhere(schoolId, fc),
          ...this.#dateWindowFilter('date_taken', window),
        },
      }),
    ]);

    // Live/current-state game & tournament snapshots (never date-filtered).
    const [gameLobbies, liveGames, totalTournaments, activeTournaments] = await Promise.all([
      this.#m.game.count({ where: { school_id: schoolId, status: GAME_STATUS.WAITING } }),
      this.#m.game.count({ where: { school_id: schoolId, status: GAME_STATUS.ACTIVE } }),
      this.#m.tournament.count({ where: { school_id: schoolId } }),
      this.#m.tournament.count({ where: { school_id: schoolId, status: TOURNAMENT_STATUS.ACTIVE } }),
    ]);

    // Activity trend: daily counts over the window (exam vs training vs game).
    const activityTrend = await this.#activityTrend(schoolId, fc, window);

    return {
      totalAttempts: { value: totalAttempts, basis: 'period' },
      completedAssessments: { value: completedAssessments, basis: 'period' },
      gameLobbies: { value: gameLobbies, basis: 'current-state' },
      liveGames: { value: liveGames, basis: 'current-state' },
      totalTournaments: { value: totalTournaments, basis: 'current-state' },
      activeTournaments: { value: activeTournaments, basis: 'current-state' },
      activityTrend,
    };
  }

  async #activityTrend(schoolId, fc, window) {
    if (!window.start || !window.end) return { granularity: 'unavailable', points: [] };
    const rows = await this.#m.result.findMany({
      where: { ...this.#activityBaseWhere(schoolId, fc), ...this.#dateWindowFilter('date_taken', window) },
      select: { date_taken: true, mode: true },
    });
    const spanDays = Math.max(
      1,
      Math.ceil((window.end.getTime() - window.start.getTime()) / 86400000),
    );
    const granularity = spanDays > 45 ? 'week' : 'day';
    const bucketKey = (dt) => {
      const d = new Date(dt);
      if (granularity === 'week') {
        const day = d.getUTCDay() || 7;
        const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 1));
        return monday.toISOString().slice(0, 10);
      }
      return d.toISOString().slice(0, 10);
    };
    const map = new Map();
    for (const r of rows) {
      const k = bucketKey(r.date_taken);
      const b = map.get(k) || { period: k, exam: 0, training: 0, game: 0, tournament: 0, total: 0 };
      if (b[r.mode] != null) b[r.mode] += 1;
      b.total += 1;
      map.set(k, b);
    }
    return { granularity, points: [...map.values()].sort((a, b) => a.period.localeCompare(b.period)) };
  }

  // ── Section E — Teacher & Class Insights ─────────────────────────────────

  async #sectionTeacherInsights(schoolId, teacherId, classId, teacherClassIds, window, fc) {
    const teachers = await this.#m.user.findMany({
      where: {
        school_id: schoolId,
        role: ROLES.TEACHER,
        ...(teacherId ? { id: teacherId } : {}),
      },
      select: { id: true, name: true, username: true, status: true },
    });
    const teacherIds = teachers.map((t) => t.id);

    // Authored content per teacher.
    const [questionGroups, examGroups, conductedGroups, passedGroups] = await Promise.all([
      teacherIds.length
        ? this.#m.question.groupBy({
            by: ['created_by'],
            where: { school_id: schoolId, created_by: { in: teacherIds } },
            _count: { _all: true },
          })
        : [],
      teacherIds.length
        ? this.#m.exam.groupBy({
            by: ['creator_id'],
            where: { school_id: schoolId, creator_id: { in: teacherIds } },
            _count: { _all: true },
          })
        : [],
      // Formal results by exam id in window → attributed to the exam creator.
      this.#m.result.groupBy({
        by: ['exam_id'],
        where: {
          ...this.#formalExamBaseWhere(schoolId, fc),
          ...this.#dateWindowFilter('date_taken', window),
        },
        _count: { _all: true },
        _avg: { score: true },
      }),
      // Passing formal results by exam id (Boolean has no `_sum`).
      this.#m.result.groupBy({
        by: ['exam_id'],
        where: {
          ...this.#formalExamBaseWhere(schoolId, fc),
          ...this.#dateWindowFilter('date_taken', window),
          passed: true,
        },
        _count: { _all: true },
      }),
    ]);

    const questionsByAuthor = new Map(questionGroups.map((g) => [g.created_by, g._count._all]));
    const examsByCreator = new Map(examGroups.map((g) => [g.creator_id, g._count._all]));

    // Map conducted results back to creators through the exam rows.
    const examIds = conductedGroups.map((g) => g.exam_id).filter(Boolean);
    const examOwners = examIds.length
      ? await this.#m.exam.findMany({
          where: { id: { in: examIds } },
          select: { id: true, creator_id: true },
        })
      : [];
    const ownerOfExam = new Map(examOwners.map((e) => [e.id, e.creator_id]));
    const conductedByTeacher = new Map();
    const scoreWeightedByTeacher = new Map();
    const passedByTeacher = new Map();
    for (const g of conductedGroups) {
      const owner = ownerOfExam.get(g.exam_id);
      if (!owner) continue;
      conductedByTeacher.set(owner, (conductedByTeacher.get(owner) || 0) + g._count._all);
      scoreWeightedByTeacher.set(
        owner,
        (scoreWeightedByTeacher.get(owner) || 0) + (g._avg.score || 0) * g._count._all,
      );
    }
    for (const g of passedGroups) {
      const owner = ownerOfExam.get(g.exam_id);
      if (!owner) continue;
      passedByTeacher.set(owner, (passedByTeacher.get(owner) || 0) + g._count._all);
    }

    // Classes managed per teacher from the assignment setting. The setting only
    // stores class ids, so resolve them to human-readable names for the table.
    const settingRow = await this.#m.setting.findFirst({
      where: { school_id: schoolId, key: 'teacherClassAssignments' },
      select: { value: true },
    });
    let assignmentMap = {};
    try {
      assignmentMap = JSON.parse(settingRow?.value || '{}') || {};
    } catch { /* treat as empty */ }
    const schoolClasses = await this.#m.class.findMany({
      where: { school_id: schoolId },
      select: { id: true, name: true },
    });
    const classNameById = new Map(schoolClasses.map((c) => [c.id, c.name]));

    const activeTeacherSet = new Set();
    const teacherRows = teachers.map((t) => {
      const conducted = conductedByTeacher.get(t.id) || 0;
      if (conducted > 0) activeTeacherSet.add(t.id);
      const weighted = scoreWeightedByTeacher.get(t.id) || 0;
      // Teacher-authored activity (their own work), never inferred from student
      // results: questions/exams they created and the classes they manage.
      const assignedIds = Array.isArray(assignmentMap[t.id])
        ? [...new Set(assignmentMap[t.id].map(String))].filter(Boolean)
        : [];
      const classNames = assignedIds.map((id) => classNameById.get(id) || id);
      return {
        teacherId: t.id,
        name: t.name || t.username,
        status: t.status,
        questionsCreated: questionsByAuthor.get(t.id) || 0,
        examsCreated: examsByCreator.get(t.id) || 0,
        classesManaged: classNames.length,
        classNames,
        assessmentActivity: conducted,
        avgScore20: conducted > 0 ? round2(weighted / conducted / 5) : null,
        passRate: conducted > 0 ? round1((passedByTeacher.get(t.id) || 0) / conducted * 100) : null,
        sampleSize: conducted,
      };
    });

    // Classes needing attention: low avg (< 8/20) or low pass rate (< 40%) with
    // enough results to be meaningful. Reason strings are explicit.
    const classComparison = await this.#classComparison(schoolId, fc, window);
    const classesNeedingAttention = classComparison
      .filter((c) => c.sample >= MIN_RESULTS_FOR_RANK)
      .map((c) => {
        const reasons = [];
        if (c.avgScore20 != null && c.avgScore20 < 8) reasons.push(`low average (${c.avgScore20}/20)`);
        if (c.passRate != null && c.passRate < 40) reasons.push(`low pass rate (${c.passRate}%)`);
        return reasons.length ? { ...c, reasons } : null;
      })
      .filter(Boolean);

    return {
      activeTeachers: { value: activeTeacherSet.size, basis: 'period' },
      teacherActivity: teacherRows,
      teacherPerformance: teacherRows
        .filter((t) => t.sampleSize >= MIN_RESULTS_FOR_RANK)
        .sort((a, b) => (b.avgScore20 || 0) - (a.avgScore20 || 0)),
      classesNeedingAttention,
    };
  }
}

function round1(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
}
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
