/**
 * src/backend/services/TeacherOverviewService.js
 *
 * Teacher-scoped pedagogical analytics for the Teacher Overview tab.
 *
 * Design rules (audited against prisma/schema.prisma):
 *  - The authenticated teacher's assigned classes (the `teacherClassAssignments`
 *    setting) are the ONLY population boundary. A teacher with no assigned
 *    class gets an explicit empty dashboard — never a school-wide fallback.
 *  - Aggregation happens on the server with Prisma (count/groupBy/aggregate +
 *    narrow column selects). The browser never downloads whole tables.
 *  - Formal exam metrics use only finalized formal results: mode = 'exam',
 *    a real exam_id, and exam.is_training = false. Training, game and
 *    tournament results are kept separate.
 *  - Result.score is a percentage (0–100); the /20 academic scale is score / 5.
 *  - Success is defined by the pedagogical rule score >= 50% (== 10/20),
 *    independent of each exam's own passing_score.
 *  - Missing data is returned as `null` / an `unavailable` entry, never a
 *    fabricated zero.
 *
 * Data that does NOT exist in the schema (and is therefore reported as
 * unavailable, not invented):
 *  - Course reading / lesson completion (no access or completion table).
 *  - Exam scheduling (Exam has no scheduled date; "upcoming" is replaced by
 *    assigned exams awaiting completion).
 *  - Training abandonment (ExamSession only covers formal exams).
 */

import { RESULT_MODE } from '../../shared/constants.js';
import {
  parseAcademicYearWindow,
  resolvePeriodWindow,
  precedingWindow,
} from './OverviewAnalyticsService.js';
import {
  decodeStoredAnswer,
  isAnswerCorrect,
  normalizeQuestionType,
} from './GradingService.js';

// Minimum samples before an average/rate is treated as decision-worthy.
const MIN_AVG_SAMPLE = 5;
// Chapter difficulty needs both volume and breadth, otherwise one struggling
// student would flag a whole chapter.
const MIN_CHAPTER_ANSWERS = 8;
const MIN_CHAPTER_STUDENTS = 3;
const MIN_QUESTION_ATTEMPTS = 4;
// Hard safety caps so a single dashboard load can never stream the database.
const MAX_RESULT_ROWS = 20000;
const ANSWER_SAMPLE_CAP = 4000;
const MAX_EXAM_ANALYSES = 8;
const PASS_PERCENT = 50; // == 10/20
const IN_CHUNK = 400;

function round1(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
}
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
function pct(numerator, denominator) {
  if (!denominator) return null;
  return round1((numerator / denominator) * 100);
}
function avg(values) {
  const list = values.filter((v) => Number.isFinite(v));
  if (!list.length) return null;
  return list.reduce((a, b) => a + b, 0) / list.length;
}
function to20(scorePercent) {
  if (scorePercent == null || !Number.isFinite(Number(scorePercent))) return null;
  return round2(Number(scorePercent) / 5);
}
function isPass(scorePercent) {
  return Number(scorePercent) >= PASS_PERCENT;
}
function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}
function parseJson(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// Answers are stored in several shapes (see results.routes.js). Only scalar
// values are answers; metadata keys must never be graded.
function extractAnswers(answersJson) {
  const root = parseJson(answersJson, null);
  if (!root || typeof root !== 'object' || Array.isArray(root)) return {};
  const pick = (obj) => {
    const out = {};
    for (const [key, value] of Object.entries(obj)) {
      if ((typeof value === 'string' || typeof value === 'number') && String(key).trim()) {
        out[String(key).trim()] = String(value);
      }
    }
    return out;
  };
  for (const key of ['userAnswers', 'answers']) {
    const nested = parseJson(root[key], null);
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const out = pick(nested);
      if (Object.keys(out).length) return out;
    }
  }
  if ('userAnswers' in root || 'answers' in root) return {};
  return pick(root);
}

export class TeacherOverviewService {
  #repo;
  #m;

  /** @param {import('../infrastructure/PrismaRepository.js').PrismaRepository} repo */
  constructor(repo) {
    this.#repo = repo;
    this.#m = {
      user: repo.modelFor('users'),
      class: repo.modelFor('classes'),
      category: repo.modelFor('categories'),
      subject: repo.modelFor('subjects'),
      question: repo.modelFor('questions'),
      exam: repo.modelFor('exams'),
      examQuestion: repo.modelFor('exam_questions'),
      examClass: repo.modelFor('exam_classes'),
      course: repo.modelFor('courses'),
      lesson: repo.modelFor('lessons'),
      courseClass: repo.modelFor('course_classes'),
      result: repo.modelFor('results'),
      game: repo.modelFor('games'),
      gameSession: repo.modelFor('game_sessions'),
      tournament: repo.modelFor('tournaments'),
      tournamentEntry: repo.modelFor('tournament_entries'),
      setting: repo.modelFor('settings'),
      school: repo.modelFor('schools'),
    };
  }

  // ── entry point ──────────────────────────────────────────────────────────

  /**
   * @param {object} p
   * @param {string} p.schoolId
   * @param {string} p.teacherId
   * @param {object} [p.filters] { classIds: string[], subjectIds: string[], period, from, to }
   * @param {Date}   [p.now]
   */
  async getOverview({ schoolId, teacherId, filters = {}, now = new Date() }) {
    const [school, teacherRow, classRows, subjectRows, categoryRows] = await Promise.all([
      this.#m.school.findUnique({ where: { id: schoolId }, select: { school_year: true } }),
      this.#m.user.findFirst({
        where: { id: String(teacherId), school_id: schoolId, role: 'teacher' },
        select: { id: true, name: true, title: true, username: true, subjects_json: true },
      }),
      this.#m.class.findMany({
        where: { school_id: schoolId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.#m.subject.findMany({
        where: { school_id: schoolId },
        select: { id: true, name: true, created_by: true },
      }),
      this.#m.category.findMany({
        where: { school_id: schoolId },
        select: { id: true, name: true, parent_id: true, subject_id: true, created_by: true },
      }),
    ]);

    if (!teacherRow) {
      return this.#emptyBundle({
        schoolYear: school?.school_year || null,
        teacher: null,
        now,
        message: 'Teacher account not found.',
      });
    }

    const assignedClassIds = await this.#teacherClassIds(schoolId, teacherId);
    const classIdSet = new Set(assignedClassIds);
    const requestedClassIds = Array.isArray(filters.classIds) ? filters.classIds.filter(Boolean) : [];
    const allowedClasses = classRows.filter((c) => classIdSet.has(String(c.id)));
    const selectedClasses = requestedClassIds.length
      ? allowedClasses.filter((c) => requestedClassIds.includes(String(c.id)))
      : allowedClasses;
    const classIds = selectedClasses.map((c) => String(c.id));

    const academicWindow = parseAcademicYearWindow(school?.school_year, now);
    const periodKey = String(filters.period || 'month');
    const window = resolvePeriodWindow(periodKey, now, academicWindow, filters.from, filters.to);
    const prev = precedingWindow(window);

    const teacher = {
      id: String(teacherRow.id),
      name: teacherRow.name || teacherRow.username || 'Teacher',
      title: teacherRow.title || '',
      subjects: parseJson(teacherRow.subjects_json, []) || [],
    };

    if (!classIds.length) {
      return this.#emptyBundle({
        schoolYear: school?.school_year || null,
        teacher,
        now,
        window,
        prev,
        academicWindow,
        classes: allowedClasses,
        message: allowedClasses.length
          ? 'No class matches the selected filter.'
          : 'No class has been assigned to your account yet. Ask an administrator to assign your classes.',
      });
    }

    const catById = new Map(categoryRows.map((c) => [String(c.id), c]));
    const subjectById = new Map(subjectRows.map((s) => [String(s.id), s]));

    // Students: unique accounts, not class rows. A student appears once even
    // when multiple classes were requested.
    const students = await this.#m.user.findMany({
      where: {
        school_id: schoolId,
        role: 'student',
        class_id: { in: classIds },
      },
      select: { id: true, name: true, username: true, numero: true, class_id: true, status: true },
      orderBy: { name: 'asc' },
    });
    const studentById = new Map(students.map((s) => [String(s.id), s]));
    const classById = new Map(classRows.map((c) => [String(c.id), c]));

    // ── raw result sets (narrow columns; never full rows) ──────────────────
    const studentScope = { role: 'student', class_id: { in: classIds } };
    const dateWindow = (field) =>
      window.start && window.end ? { [field]: { gte: window.start, lte: window.end } } : {};
    const prevWindow = (field) =>
      prev ? { [field]: { gte: prev.start, lte: prev.end } } : null;

    const examWhere = {
      school_id: schoolId,
      mode: RESULT_MODE.EXAM,
      exam_id: { not: null },
      exam: { is_training: false },
      user: studentScope,
    };
    const activityWhere = {
      school_id: schoolId,
      mode: { in: [RESULT_MODE.EXAM, RESULT_MODE.TRAINING, RESULT_MODE.GAME, RESULT_MODE.TOURNAMENT] },
      user: studentScope,
    };

    const [examRowsRaw, prevExamRowsRaw, activityRowsRaw] = await Promise.all([
      this.#m.result.findMany({
        where: { ...examWhere, ...dateWindow('date_taken') },
        select: { id: true, user_id: true, exam_id: true, score: true, date_taken: true },
        orderBy: { date_taken: 'desc' },
        take: MAX_RESULT_ROWS,
      }),
      prev
        ? this.#m.result.findMany({
            where: { ...examWhere, ...prevWindow('date_taken') },
            select: { id: true, user_id: true, exam_id: true, score: true, date_taken: true },
            orderBy: { date_taken: 'desc' },
            take: MAX_RESULT_ROWS,
          })
        : [],
      this.#m.result.findMany({
        where: { ...activityWhere, ...dateWindow('date_taken') },
        select: { id: true, user_id: true, exam_id: true, mode: true, score: true, date_taken: true },
        orderBy: { date_taken: 'desc' },
        take: MAX_RESULT_ROWS,
      }),
    ]);

    // Answer payloads power chapter/question analysis. This is the only place
    // the JSON blob is loaded and it is hard-capped (most recent attempts).
    const answerRowsRaw = await this.#m.result.findMany({
      where: {
        school_id: schoolId,
        mode: { in: [RESULT_MODE.EXAM, RESULT_MODE.TRAINING] },
        user: studentScope,
        ...dateWindow('date_taken'),
      },
      select: {
        id: true,
        user_id: true,
        exam_id: true,
        mode: true,
        score: true,
        answers_json: true,
        date_taken: true,
      },
      orderBy: { date_taken: 'desc' },
      take: ANSWER_SAMPLE_CAP,
    });

    // Keep only results whose student is in scope (defensive: the relation
    // filter already guarantees it, but a stale class_id must never leak).
    const examRows = examRowsRaw.filter((r) => studentById.has(String(r.user_id)));
    const prevExamRows = prevExamRowsRaw.filter((r) => studentById.has(String(r.user_id)));
    const activityRows = activityRowsRaw.filter((r) => studentById.has(String(r.user_id)));
    const answerRows = answerRowsRaw
      .filter((r) => studentById.has(String(r.user_id)))
      .map((r) => ({ ...r, answers: extractAnswers(r.answers_json) }));

    const trainingRows = activityRows.filter((r) => r.mode === RESULT_MODE.TRAINING);

    // ── exam metadata, questions and subject attribution ──────────────────
    const examIds = [...new Set(examRows.map((r) => String(r.exam_id)).filter(Boolean))];
    const examsById = new Map();
    if (examIds.length) {
      const examRowsMeta = await this.#findByIds(this.#m.exam, examIds, {
        id: true,
        name: true,
        status: true,
        is_training: true,
        passing_score: true,
        creator_id: true,
        created_at: true,
        options_json: true,
        duration: true,
      });
      examRowsMeta.forEach((e) => examsById.set(String(e.id), e));
    }

    const { examQuestionsByExam, examSubjects, questionById } =
      await this.#loadExamQuestions(schoolId, examIds, catById);

    // ── courses, lessons, class assignment ────────────────────────────────
    const courses = await this.#m.course.findMany({
      where: { school_id: schoolId, created_by: String(teacherId) },
      select: { id: true, name: true, status: true, subject_id: true, category_id: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
    const courseIds = courses.map((c) => String(c.id));
    const lessons = courseIds.length
      ? await this.#m.lesson.findMany({
          where: { course_id: { in: courseIds } },
          select: { id: true, course_id: true, category_id: true, title: true, order_index: true },
        })
      : [];
    const courseClassRows = courseIds.length
      ? await this.#m.courseClass.findMany({
          where: { course_id: { in: courseIds }, class_id: { in: classIds } },
          select: { course_id: true, class_id: true },
        })
      : [];

    const childrenByParent = new Map();
    for (const cat of categoryRows) {
      const parent = cat.parent_id ? String(cat.parent_id) : '';
      if (!parent) continue;
      if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
      childrenByParent.get(parent).push(String(cat.id));
    }
    const expand = (rootIds) => {
      const out = new Set();
      const queue = [...rootIds];
      while (queue.length) {
        const id = String(queue.shift());
        if (out.has(id)) continue;
        out.add(id);
        (childrenByParent.get(id) || []).forEach((child) => queue.push(child));
      }
      return out;
    };

    const lessonsByCourse = new Map();
    for (const lesson of lessons) {
      const cid = String(lesson.course_id);
      if (!lessonsByCourse.has(cid)) lessonsByCourse.set(cid, []);
      lessonsByCourse.get(cid).push(lesson);
    }
    const courseCategoryIds = new Map();
    const categoryToCourse = new Map();
    for (const course of courses) {
      const rootIds = [
        ...(lessonsByCourse.get(String(course.id)) || []).map((l) => l.category_id),
        course.category_id,
      ].filter(Boolean);
      const expanded = expand(rootIds);
      courseCategoryIds.set(String(course.id), expanded);
      expanded.forEach((catId) => {
        if (!categoryToCourse.has(catId)) categoryToCourse.set(catId, String(course.id));
      });
    }
    const courseClassesByCourse = new Map();
    for (const row of courseClassRows) {
      const cid = String(row.course_id);
      if (!courseClassesByCourse.has(cid)) courseClassesByCourse.set(cid, new Set());
      courseClassesByCourse.get(cid).add(String(row.class_id));
    }

    // Categories the teacher actually owns content for: their own categories,
    // their courses' chapters, and the categories of their own questions.
    const teacherQuestionCats = await this.#m.question.findMany({
      where: { school_id: schoolId, created_by: String(teacherId), category_id: { not: null } },
      select: { category_id: true },
    });
    const scopeCategoryIds = new Set(categoryRows.filter((c) => String(c.created_by || '') === String(teacherId)).map((c) => String(c.id)));
    for (const set of courseCategoryIds.values()) set.forEach((id) => scopeCategoryIds.add(id));
    teacherQuestionCats.forEach((q) => scopeCategoryIds.add(String(q.category_id)));

    // ── games & tournaments (engagement only) ─────────────────────────────
    const [gameSessions, tournamentEntries] = await Promise.all([
      this.#m.gameSession.findMany({
        where: {
          school_id: schoolId,
          user: studentScope,
          ...dateWindow('joined_at'),
        },
        select: { game_id: true, user_id: true, completed: true, score: true, joined_at: true },
        take: MAX_RESULT_ROWS,
      }),
      this.#m.tournamentEntry.findMany({
        where: {
          school_id: schoolId,
          user: studentScope,
          ...dateWindow('registered_at'),
        },
        select: { tournament_id: true, user_id: true, completed: true, score: true, registered_at: true },
        take: MAX_RESULT_ROWS,
      }),
    ]);

    const gameIds = [...new Set(gameSessions.map((s) => String(s.game_id)))];
    const tournamentIds = [...new Set(tournamentEntries.map((e) => String(e.tournament_id)))];
    const [games, tournaments] = await Promise.all([
      gameIds.length
        ? this.#findByIds(this.#m.game, gameIds, {
            id: true,
            name: true,
            type: true,
            status: true,
            creator_id: true,
            question_ids: true,
            created_at: true,
          })
        : [],
      tournamentIds.length
        ? this.#findByIds(this.#m.tournament, tournamentIds, {
            id: true,
            name: true,
            status: true,
            creator_id: true,
            question_ids: true,
            starts_at: true,
            ends_at: true,
          })
        : [],
    ]);
    const gamesById = new Map(games.map((g) => [String(g.id), g]));
    const tournamentsById = new Map(tournaments.map((t) => [String(t.id), t]));

    // ── assigned active exams (no schedule field → awaiting completion) ───
    const assignedExamIds = await this.#assignedExamIds(schoolId, classIds);
    const assignedExams = assignedExamIds.length
      ? await this.#findByIds(this.#m.exam, assignedExamIds, {
          id: true,
          name: true,
          status: true,
          is_training: true,
          creator_id: true,
          created_at: true,
          options_json: true,
        })
      : [];
    const activeAssignedExams = assignedExams.filter(
      (e) => String(e.status) === 'active' && !e.is_training,
    );
    const examClassMap = await this.#examClassAssignments(schoolId, classIds, activeAssignedExams);

    // All-time completion per exam (used ONLY for "pending attempts": a student
    // who completed the exam before the reporting window is not pending).
    const completionRows = activeAssignedExams.length
      ? await this.#m.result.groupBy({
          by: ['exam_id', 'user_id'],
          where: {
            school_id: schoolId,
            mode: RESULT_MODE.EXAM,
            exam_id: { in: activeAssignedExams.map((e) => String(e.id)) },
            user: studentScope,
          },
          _count: { _all: true },
        })
      : [];
    const completionByExam = new Map();
    for (const row of completionRows) {
      const eid = String(row.exam_id);
      if (!completionByExam.has(eid)) completionByExam.set(eid, new Set());
      completionByExam.get(eid).add(String(row.user_id));
    }

    // ── questions needed by chapter + game analyses ────────────────────────
    const answeredQuestionIds = new Set();
    for (const row of answerRows) {
      Object.keys(row.answers).forEach((qid) => answeredQuestionIds.add(qid));
    }
    // Game questions feed engagement-by-subject; load them in the same pass.
    for (const game of gamesById.values()) {
      const ids = parseJson(game.question_ids, []);
      if (Array.isArray(ids)) ids.forEach((id) => answeredQuestionIds.add(String(id)));
    }
    questionById.forEach((_q, id) => answeredQuestionIds.delete(id));
    const extraQuestionRows = await this.#findByIds(
      this.#m.question,
      [...answeredQuestionIds],
      { id: true, text: true, type: true, answer: true, options_json: true, category_id: true, created_by: true },
    );
    extraQuestionRows.forEach((q) => questionById.set(String(q.id), q));

    // Active tournaments relevant to the teacher (created by them or joined by
    // their students). Tournament rows carry no class link.
    const activeTournamentRows = await this.#m.tournament.findMany({
      where: {
        school_id: schoolId,
        status: { in: ['open', 'active'] },
        OR: [
          { creator_id: String(teacherId) },
          { id: { in: [...new Set(tournamentEntries.map((e) => String(e.tournament_id)))] } },
        ],
      },
      select: { id: true },
    });
    const activeTournamentIds = new Set(activeTournamentRows.map((t) => String(t.id)));

    const ctx = {
      schoolId,
      teacherId: String(teacherId),
      now,
      window,
      prev,
      academicWindow,
      teacher,
      classIds,
      allowedClasses,
      classById,
      students,
      studentById,
      categoryRows,
      catById,
      categoryToCourse,
      subjects: subjectRows,
      subjectById,
      scopeCategoryIds,
      examRows,
      prevExamRows,
      activityRows,
      allActivityRows: activityRows,
      trainingRows,
      answerRows,
      answersByResult: new Map(answerRows.map((r) => [String(r.id), r.answers])),
      examsById,
      examQuestionsByExam,
      examSubjects,
      questionById,
      courses,
      lessonsByCourse,
      courseCategoryIds,
      courseClassesByCourse,
      gamesById,
      tournamentsById,
      activeTournamentIds,
      gameSessions,
      tournamentEntries,
      activeAssignedExams,
      examClassMap,
      completionByExam,
      resultRowsCapped:
        examRowsRaw.length >= MAX_RESULT_ROWS || activityRowsRaw.length >= MAX_RESULT_ROWS,
      answerRowsCapped: answerRowsRaw.length >= ANSWER_SAMPLE_CAP,
    };

    // Available subject filters = subjects the teacher actually touches.
    const subjectRefs = new Map();
    const addSubjectRef = (id) => {
      const sid = String(id || '');
      if (!sid) return;
      const subject = subjectById.get(sid);
      if (subject) subjectRefs.set(sid, String(subject.name));
    };
    subjectRows
      .filter((s) => String(s.created_by || '') === ctx.teacherId)
      .forEach((s) => addSubjectRef(s.id));
    categoryRows
      .filter((c) => String(c.created_by || '') === ctx.teacherId)
      .forEach((c) => addSubjectRef(c.subject_id));
    courses.forEach((c) => addSubjectRef(c.subject_id));
    for (const meta of examSubjects.values()) addSubjectRef(meta.subjectId);
    const teacherSubjectNames = new Set(
      (Array.isArray(teacher.subjects) ? teacher.subjects : []).map((s) => String(s).toLowerCase()),
    );
    subjectRows
      .filter((s) => teacherSubjectNames.has(String(s.name).toLowerCase()))
      .forEach((s) => addSubjectRef(s.id));

    const requestedSubjectIds = Array.isArray(filters.subjectIds)
      ? filters.subjectIds.filter(Boolean)
      : [];
    const availableSubjects = [...subjectRefs.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const selectedSubjectIds = requestedSubjectIds.length
      ? requestedSubjectIds.filter((id) => subjectRefs.has(String(id)))
      : [];
    ctx.selectedSubjectIds = selectedSubjectIds;
    ctx.availableSubjects = availableSubjects;

    // Subject filter: exam results narrow through their dominant exam subject.
    // Training attempts carry no exam/subject FK, so they are attributed by the
    // dominant subject of the questions they actually answered (never guessed
    // from another subject). Game/tournament rows are not academically
    // attributable and are therefore excluded from subject-filtered metrics.
    if (selectedSubjectIds.length) {
      const allowed = new Set(selectedSubjectIds.map(String));
      const trainingSubject = new Map();
      for (const row of answerRows) {
        if (row.mode !== RESULT_MODE.TRAINING) continue;
        const counts = new Map();
        for (const qid of Object.keys(row.answers)) {
          if (!row.answers[qid] || String(row.answers[qid]).trim() === '') continue;
          const question = questionById.get(String(qid));
          const cat = question?.category_id ? catById.get(String(question.category_id)) : null;
          const sid = cat?.subject_id ? String(cat.subject_id) : '';
          if (sid) counts.set(sid, (counts.get(sid) || 0) + 1);
        }
        if (counts.size) {
          trainingSubject.set(String(row.id), [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]);
        }
      }
      const examSubjectOf = (row) => String(examSubjects.get(String(row.exam_id))?.subjectId || '');
      ctx.examRows = examRows.filter((r) => allowed.has(examSubjectOf(r)));
      ctx.prevExamRows = prevExamRows.filter((r) => allowed.has(examSubjectOf(r)));
      ctx.answerRows = answerRows.filter((r) =>
        r.mode === RESULT_MODE.EXAM
          ? allowed.has(examSubjectOf(r))
          : allowed.has(String(trainingSubject.get(String(r.id)) || '')),
      );
      ctx.activityRows = activityRows.filter((r) => {
        if (r.mode === RESULT_MODE.EXAM) return allowed.has(examSubjectOf(r));
        if (r.mode === RESULT_MODE.TRAINING) {
          return allowed.has(String(trainingSubject.get(String(r.id)) || ''));
        }
        return false;
      });
      ctx.trainingRows = ctx.activityRows.filter((r) => r.mode === RESULT_MODE.TRAINING);
      ctx.courses = courses.filter((c) => allowed.has(String(c.subject_id || '')));
    }
    ctx.visibleCourseIds = new Set(ctx.courses.map((c) => String(c.id)));
    ctx.subjectAttribution = {
      exam: 'Exam results are attributed to the subject holding most of the exam questions.',
      training: 'Training attempts are attributed to the dominant subject of the questions actually answered; attempts with no attributable answers are excluded when a subject filter is active.',
      games: 'Game/tournament engagement is excluded from subject-filtered metrics.',
    };

    const studentMetrics = this.#studentMetrics(ctx);

    const glance = this.#sectionGlance(ctx, studentMetrics);
    const progress = this.#sectionProgress(ctx);
    const attention = this.#sectionAttention(ctx, studentMetrics);
    const content = this.#sectionContent(ctx);
    const exams = this.#sectionExams(ctx);
    const engagement = this.#sectionEngagement(ctx);

    glance.needingAttention = {
      value: attention.summary.total,
      academic: attention.summary.academic,
      engagement: attention.summary.engagement,
      both: attention.summary.both,
      basis: 'period',
    };

    const insights = this.#buildInsights({ glance, progress, attention, content, exams, engagement, ctx });

    return {
      meta: {
        generatedAt: now.toISOString(),
        teacher,
        academicYear: academicWindow
          ? { label: academicWindow.label, start: academicWindow.start.toISOString(), end: academicWindow.end.toISOString() }
          : null,
        period: {
          key: window.key,
          label: window.label,
          start: window.start ? window.start.toISOString() : null,
          end: window.end ? window.end.toISOString() : null,
        },
        previous: prev ? { start: prev.start.toISOString(), end: prev.end.toISOString() } : null,
        scope: {
          empty: false,
          classIds,
          classes: selectedClasses.map((c) => ({ id: String(c.id), name: c.name })),
          // Full assignment list so the filter can always re-offer every class
          // even while a narrower selection is applied.
          allClasses: allowedClasses.map((c) => ({ id: String(c.id), name: c.name })),
          subjectIds: selectedSubjectIds,
          subjects: availableSubjects,
          studentCount: students.length,
        },
        thresholds: {
          pass20: 10,
          passPercent: PASS_PERCENT,
          minAvgSample: MIN_AVG_SAMPLE,
          minChapterAnswers: MIN_CHAPTER_ANSWERS,
          minChapterStudents: MIN_CHAPTER_STUDENTS,
          minQuestionAttempts: MIN_QUESTION_ATTEMPTS,
        },
        unavailable: {
          courseCompletion: 'Lesson reading and course completion are not tracked by the platform, so a completion rate cannot be computed.',
          examSchedule: 'Exams have no scheduled date field; assigned exams awaiting completion replace a calendar of upcoming exams.',
          trainingAbandonment: 'Only formal exam sessions are recorded as sessions; abandoned training attempts are not measurable.',
          gameAcademicRanking: 'Game and tournament scores are engagement data and are never merged into academic averages.',
        },
        sample: {
          resultRowsCapped: ctx.resultRowsCapped,
          answerRowsCapped: ctx.answerRowsCapped,
          answerRowsUsed: ctx.answerRows.length,
          answerRowsCap: ANSWER_SAMPLE_CAP,
        },
      },
      sections: { glance, progress, attention, content, exams, engagement, insights },
    };
  }

  // ── scope helpers ────────────────────────────────────────────────────────

  async #teacherClassIds(schoolId, teacherId) {
    const row = await this.#m.setting.findFirst({
      where: { school_id: schoolId, key: 'teacherClassAssignments' },
      select: { value: true },
    });
    try {
      const map = parseJson(row?.value || '{}', {}) || {};
      const ids = map?.[String(teacherId)];
      if (!Array.isArray(ids)) return [];
      return [...new Set(ids.map(String))].filter(Boolean);
    } catch {
      return [];
    }
  }

  async #findByIds(model, ids, select) {
    const unique = [...new Set((ids || []).map(String).filter(Boolean))];
    const out = [];
    for (let i = 0; i < unique.length; i += IN_CHUNK) {
      const chunk = unique.slice(i, i + IN_CHUNK);
      const rows = await model.findMany({ where: { id: { in: chunk } }, select });
      out.push(...rows);
    }
    return out;
  }

  // Question ids per exam + the subject each exam is attributed to.
  // Attribution is exam-level: the subject holding most of the exam's
  // questions. An exam spanning subjects is flagged `mixed` — never silently
  // split, which would fabricate per-subject averages.
  async #loadExamQuestions(schoolId, examIds, catById) {
    const examQuestionsByExam = new Map();
    const examSubjects = new Map();
    const questionById = new Map();
    if (!examIds.length) return { examQuestionsByExam, examSubjects, questionById };

    const junctions = [];
    for (let i = 0; i < examIds.length; i += IN_CHUNK) {
      const chunk = examIds.slice(i, i + IN_CHUNK);
      const rows = await this.#m.examQuestion.findMany({
        where: { exam_id: { in: chunk } },
        select: { exam_id: true, question_id: true, order_index: true },
        orderBy: { order_index: 'asc' },
      });
      junctions.push(...rows);
    }
    const questionIds = [...new Set(junctions.map((j) => String(j.question_id)))];
    const questions = await this.#findByIds(this.#m.question, questionIds, {
      id: true,
      text: true,
      type: true,
      answer: true,
      options_json: true,
      category_id: true,
      created_by: true,
      points: true,
    });
    questions.forEach((q) => questionById.set(String(q.id), q));

    for (const junction of junctions) {
      const eid = String(junction.exam_id);
      if (!examQuestionsByExam.has(eid)) examQuestionsByExam.set(eid, []);
      examQuestionsByExam.get(eid).push(String(junction.question_id));
    }

    const subjectCounts = new Map();
    for (const eid of examIds) {
      const counts = new Map();
      for (const qid of examQuestionsByExam.get(String(eid)) || []) {
        const q = questionById.get(String(qid));
        const cat = q?.category_id ? catById.get(String(q.category_id)) : null;
        const sid = cat?.subject_id ? String(cat.subject_id) : '';
        if (!sid) continue;
        counts.set(sid, (counts.get(sid) || 0) + 1);
      }
      if (!counts.size) {
        examSubjects.set(String(eid), { subjectId: null, mixed: false, questionCount: 0 });
        continue;
      }
      const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      examSubjects.set(String(eid), {
        subjectId: sorted[0][0],
        mixed: sorted.length > 1,
        questionCount: [...counts.values()].reduce((a, b) => a + b, 0),
      });
    }
    return { examQuestionsByExam, examSubjects, questionById };
  }

  // Exams assigned to any of the teacher's classes: normalized junction first,
  // then the legacy options_json.classes names (many legacy exams only store
  // names there).
  async #assignedExamIds(schoolId, classIds) {
    const rows = await this.#m.examClass.findMany({
      where: { class_id: { in: classIds }, exam: { school_id: schoolId } },
      select: { exam_id: true },
    });
    const ids = new Set(rows.map((r) => String(r.exam_id)));
    const legacy = await this.#m.exam.findMany({
      where: { school_id: schoolId, status: 'active', is_training: false, options_json: { not: null } },
      select: { id: true, options_json: true },
      take: 500,
    });
    const classNameById = new Map();
    const classes = await this.#m.class.findMany({
      where: { school_id: schoolId },
      select: { id: true, name: true },
    });
    classes.forEach((c) => classNameById.set(String(c.name).trim().toLowerCase(), String(c.id)));
    const myClasses = new Set(classIds.map(String));
    for (const exam of legacy) {
      const options = parseJson(exam.options_json, null) || {};
      const names = Array.isArray(options.classes) ? options.classes : [];
      const matched = names.some((name) => {
        const label = String(typeof name === 'object' ? name?.name || name?.id || '' : name).trim().toLowerCase();
        const cid = classNameById.get(label) || (myClasses.has(label) ? label : null);
        return cid ? myClasses.has(cid) : false;
      });
      if (matched) ids.add(String(exam.id));
    }
    return [...ids];
  }

  async #examClassAssignments(schoolId, classIds, exams) {
    const map = new Map();
    const examIds = exams.map((e) => String(e.id));
    if (!examIds.length) return map;
    const rows = await this.#m.examClass.findMany({
      where: { exam_id: { in: examIds }, class_id: { in: classIds } },
      select: { exam_id: true, class_id: true },
    });
    for (const row of rows) {
      const eid = String(row.exam_id);
      if (!map.has(eid)) map.set(eid, new Set());
      map.get(eid).add(String(row.class_id));
    }
    // Legacy options_json classes.
    const classes = await this.#m.class.findMany({
      where: { school_id: schoolId, id: { in: classIds } },
      select: { id: true, name: true },
    });
    const byName = new Map(classes.map((c) => [String(c.name).trim().toLowerCase(), String(c.id)]));
    for (const exam of exams) {
      const options = parseJson(exam.options_json, null) || {};
      const names = Array.isArray(options.classes) ? options.classes : [];
      for (const name of names) {
        const label = String(typeof name === 'object' ? name?.name || name?.id || '' : name).trim().toLowerCase();
        const cid = byName.get(label);
        if (!cid) continue;
        const eid = String(exam.id);
        if (!map.has(eid)) map.set(eid, new Set());
        map.get(eid).add(cid);
      }
    }
    return map;
  }

  // ── student-level metrics (shared by glance + attention) ────────────────

  #studentMetrics(ctx) {
    const map = new Map();
    const ensure = (id) => {
      const key = String(id || '');
      if (!key || !ctx.studentById.has(key)) return null;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          examAttempts: 0,
          examScoreSum: 0,
          examScores: [],
          prevAttempts: 0,
          prevScoreSum: 0,
          trainingAttempts: 0,
          activityCount: 0,
          lastActivity: null,
          subjects: new Map(),
          chapterErrors: new Map(),
        });
      }
      return map.get(key);
    };

    for (const row of ctx.examRows) {
      const metric = ensure(row.user_id);
      if (!metric) continue;
      metric.examAttempts += 1;
      metric.examScoreSum += Number(row.score) || 0;
      metric.examScores.push(Number(row.score) || 0);
      const sid = ctx.examSubjects.get(String(row.exam_id))?.subjectId;
      if (sid) {
        if (!metric.subjects.has(sid)) metric.subjects.set(sid, { attempts: 0, sum: 0 });
        const bucket = metric.subjects.get(sid);
        bucket.attempts += 1;
        bucket.sum += Number(row.score) || 0;
      }
    }
    for (const row of ctx.prevExamRows) {
      const metric = ensure(row.user_id);
      if (!metric) continue;
      metric.prevAttempts += 1;
      metric.prevScoreSum += Number(row.score) || 0;
    }
    // Engagement uses ALL activity in the period (unfiltered by subject): a
    // student active in another subject is not "inactive".
    const filteredActivityIds = new Set(ctx.activityRows.map((r) => String(r.id)));
    for (const row of ctx.allActivityRows) {
      const metric = ensure(row.user_id);
      if (!metric) continue;
      if (filteredActivityIds.has(String(row.id))) metric.activityCount += 1;
      if (row.mode === RESULT_MODE.TRAINING) metric.trainingAttempts += 1;
      const at = new Date(row.date_taken).getTime();
      if (Number.isFinite(at) && (!metric.lastActivity || at > metric.lastActivity)) {
        metric.lastActivity = at;
      }
    }

    // Chapter weaknesses per student: answered >= 3 and error rate >= 40%.
    const answerStats = new Map();
    for (const row of ctx.answerRows) {
      const uid = String(row.user_id || '');
      if (!ctx.studentById.has(uid)) continue;
      for (const [qid, given] of Object.entries(row.answers)) {
        if (given == null || String(given).trim() === '') continue;
        const question = ctx.questionById.get(String(qid));
        if (!question) continue;
        const categoryId = question.category_id ? String(question.category_id) : '';
        if (!categoryId || !ctx.scopeCategoryIds.has(categoryId)) continue;
        const key = `${uid}:${categoryId}`;
        if (!answerStats.has(key)) {
          answerStats.set(key, { userId: uid, categoryId, answered: 0, correct: 0 });
        }
        const stat = answerStats.get(key);
        stat.answered += 1;
        const decoded = decodeStoredAnswer(question);
        const type = normalizeQuestionType(decoded);
        if (isAnswerCorrect(given, decoded.answer, type)) stat.correct += 1;
      }
    }
    for (const stat of answerStats.values()) {
      if (stat.answered < 3) continue;
      const errorRate = (stat.answered - stat.correct) / stat.answered;
      if (errorRate < 0.4) continue;
      const metric = ensure(stat.userId);
      if (!metric) continue;
      metric.chapterErrors.set(stat.categoryId, {
        answered: stat.answered,
        correctRate: round1((stat.correct / stat.answered) * 100),
        errorRate: round1(errorRate * 100),
      });
    }

    for (const metric of map.values()) {
      metric.avg20 = metric.examAttempts ? round2(metric.examScoreSum / metric.examAttempts / 5) : null;
      metric.prevAvg20 = metric.prevAttempts ? round2(metric.prevScoreSum / metric.prevAttempts / 5) : null;
      metric.trendDelta =
        metric.avg20 != null && metric.prevAvg20 != null
          ? round2(metric.avg20 - metric.prevAvg20)
          : null;
      metric.daysInactive =
        metric.lastActivity == null
          ? null
          : Math.max(0, Math.floor((ctx.now.getTime() - metric.lastActivity) / 86400000));
    }
    return map;
  }

  // ── Section B — Classroom at a glance ───────────────────────────────────

  #sectionGlance(ctx, metrics) {
    const totalStudents = ctx.students.length;
    const activeIds = new Set(ctx.activityRows.map((r) => String(r.user_id)).filter(Boolean));
    const examSample = ctx.examRows.length;
    const avg20 = examSample ? round2(avg(ctx.examRows.map((r) => Number(r.score) / 5))) : null;
    const passed = ctx.examRows.filter((r) => isPass(r.score)).length;
    const successRate = pct(passed, examSample);
    const completedExams = new Set(ctx.examRows.map((r) => String(r.exam_id)).filter(Boolean)).size;

    const prevSample = ctx.prevExamRows.length;
    const prevAvg20 = prevSample ? round2(avg(ctx.prevExamRows.map((r) => Number(r.score) / 5))) : null;
    const comparable = examSample >= MIN_AVG_SAMPLE && prevSample >= MIN_AVG_SAMPLE && avg20 != null && prevAvg20 != null;
    const delta = comparable ? round2(avg20 - prevAvg20) : null;

    return {
      totalStudents: {
        value: totalStudents,
        basis: 'current-state',
        explanation: 'Unique student accounts in your assigned classes. Each student is counted once.',
      },
      activeStudents: {
        value: activeIds.size,
        rate: pct(activeIds.size, totalStudents),
        basis: 'period',
        explanation: 'Students with at least one completed exam, training, game or tournament activity in the selected period.',
      },
      avgExamScore: {
        value: avg20,
        scale: 20,
        sample: examSample,
        previous: prevAvg20,
        delta,
        deltaPct: comparable && prevAvg20 ? round1((delta / prevAvg20) * 100) : null,
        trend: delta == null ? null : delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat',
        comparable,
        explanation: 'Mean of valid formal exam attempts, normalized to /20. Training and game scores are excluded.',
      },
      successRate: {
        value: successRate,
        passed,
        total: examSample,
        threshold: '10/20',
        explanation: 'Share of valid formal exam attempts scoring at least 10/20.',
      },
      completedExams: {
        value: completedExams,
        basis: 'period',
        explanation: 'Distinct exams that produced at least one valid formal attempt in the period.',
      },
      needingAttention: { value: 0, academic: 0, engagement: 0, both: 0, basis: 'period' },
    };
  }

  // ── Section C — Learning progress & performance ─────────────────────────

  #sectionProgress(ctx) {
    const spanDays = ctx.window.start && ctx.window.end
      ? Math.max(1, Math.ceil((ctx.window.end.getTime() - ctx.window.start.getTime()) / 86400000))
      : 30;
    const granularity = spanDays <= 14 ? 'day' : spanDays <= 120 ? 'week' : 'month';

    const performanceEvolution = this.#performanceEvolution(ctx, granularity);
    const participationEvolution = this.#participationEvolution(ctx, granularity);

    // Class comparison: exam attempts grouped by the student's current class.
    const classBuckets = new Map();
    for (const row of ctx.examRows) {
      const student = ctx.studentById.get(String(row.user_id));
      const cid = student ? String(student.class_id || '') : '';
      if (!cid) continue;
      if (!classBuckets.has(cid)) classBuckets.set(cid, { scores: [], passed: 0, students: new Set() });
      const bucket = classBuckets.get(cid);
      bucket.scores.push(Number(row.score) || 0);
      if (isPass(row.score)) bucket.passed += 1;
      bucket.students.add(String(row.user_id));
    }
    const classComparison = [...classBuckets.entries()]
      .map(([cid, bucket]) => ({
        classId: cid,
        className: ctx.classById.get(cid)?.name || 'Unassigned',
        avg20: round2(avg(bucket.scores) / 5),
        sample: bucket.scores.length,
        students: bucket.students.size,
        successRate: pct(bucket.passed, bucket.scores.length),
        reliable: bucket.scores.length >= MIN_AVG_SAMPLE,
      }))
      .filter((c) => c.avg20 != null)
      .sort((a, b) => b.avg20 - a.avg20);

    // Subject comparison (exam-level dominant-subject attribution).
    const subjectBuckets = new Map();
    for (const row of ctx.examRows) {
      const meta = ctx.examSubjects.get(String(row.exam_id));
      const sid = meta?.subjectId;
      if (!sid) continue;
      if (!subjectBuckets.has(sid)) {
        subjectBuckets.set(sid, { scores: [], passed: 0, students: new Set(), mixed: 0 });
      }
      const bucket = subjectBuckets.get(sid);
      bucket.scores.push(Number(row.score) || 0);
      if (isPass(row.score)) bucket.passed += 1;
      bucket.students.add(String(row.user_id));
      if (meta.mixed) bucket.mixed += 1;
    }
    const subjectPerformance = [...subjectBuckets.entries()]
      .map(([sid, bucket]) => ({
        subjectId: sid,
        subjectName: ctx.subjectById.get(sid)?.name || 'Unknown subject',
        avg20: round2(avg(bucket.scores) / 5),
        sample: bucket.scores.length,
        students: bucket.students.size,
        successRate: pct(bucket.passed, bucket.scores.length),
        reliable: bucket.scores.length >= MIN_AVG_SAMPLE,
        mixedExams: bucket.mixed,
      }))
      .filter((s) => s.avg20 != null)
      .sort((a, b) => a.avg20 - b.avg20);

    // Training vs formal examination: same scale, different contexts.
    const trainingAvg20 = ctx.trainingRows.length
      ? round2(avg(ctx.trainingRows.map((r) => Number(r.score) / 5)))
      : null;
    const examAvg20 = ctx.examRows.length
      ? round2(avg(ctx.examRows.map((r) => Number(r.score) / 5)))
      : null;

    return {
      performanceEvolution,
      participationEvolution,
      classComparison,
      subjectPerformance,
      trainingVsExam: {
        training: {
          avg20: trainingAvg20,
          sample: ctx.trainingRows.length,
          students: new Set(ctx.trainingRows.map((r) => String(r.user_id))).size,
        },
        exam: {
          avg20: examAvg20,
          sample: ctx.examRows.length,
          students: new Set(ctx.examRows.map((r) => String(r.user_id))).size,
        },
        note: 'Training and examination attempts are different assessment contexts. A training/exam difference is a cue to investigate, never proof of mastery.',
      },
    };
  }

  #performanceEvolution(ctx, granularity) {
    const current = this.#bucketsFor(ctx.window, granularity);
    for (const row of ctx.examRows) {
      const key = this.#bucketKey(row.date_taken, granularity);
      const bucket = current.get(key);
      if (!bucket) continue;
      bucket.attempts += 1;
      bucket.scores.push(Number(row.score) || 0);
      bucket.students.add(String(row.user_id));
    }
    const points = [...current.values()].map((b) => ({
      period: b.key,
      label: b.label,
      avg20: b.scores.length ? round2(avg(b.scores) / 5) : null,
      attempts: b.attempts,
      students: b.students.size,
    }));

    let previousPoints = [];
    if (ctx.prev) {
      const prevBuckets = this.#bucketsFor(ctx.prev, granularity);
      for (const row of ctx.prevExamRows) {
        const key = this.#bucketKey(row.date_taken, granularity);
        const bucket = prevBuckets.get(key);
        if (!bucket) continue;
        bucket.attempts += 1;
        bucket.scores.push(Number(row.score) || 0);
      }
      previousPoints = [...prevBuckets.values()].map((b) => ({
        period: b.key,
        label: b.label,
        avg20: b.scores.length ? round2(avg(b.scores) / 5) : null,
        attempts: b.attempts,
      }));
    }

    const valid = points.filter((p) => p.avg20 != null);
    const first = valid[0] || null;
    const last = valid[valid.length - 1] || null;
    const direction =
      first && last
        ? last.avg20 > first.avg20 + 0.05
          ? 'improving'
          : last.avg20 < first.avg20 - 0.05
            ? 'declining'
            : 'stable'
        : null;

    return {
      granularity,
      points,
      previousPoints,
      comparable: points.some((p) => p.avg20 != null) && previousPoints.some((p) => p.avg20 != null),
      direction,
      change: first && last ? round2(last.avg20 - first.avg20) : null,
    };
  }

  #participationEvolution(ctx, granularity) {
    const buckets = this.#bucketsFor(ctx.window, granularity);
    for (const row of ctx.activityRows) {
      const key = this.#bucketKey(row.date_taken, granularity);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.students.add(String(row.user_id));
      if (row.mode === RESULT_MODE.EXAM) bucket.examAttempts += 1;
      if (row.mode === RESULT_MODE.TRAINING) bucket.trainingAttempts += 1;
    }
    return {
      granularity,
      points: [...buckets.values()].map((b) => ({
        period: b.key,
        label: b.label,
        activeStudents: b.students.size,
        examAttempts: b.examAttempts,
        trainingAttempts: b.trainingAttempts,
      })),
    };
  }

  #bucketsFor(window, granularity) {
    const map = new Map();
    if (!window.start || !window.end) return map;
    const cursor = new Date(Date.UTC(
      window.start.getUTCFullYear(),
      window.start.getUTCMonth(),
      window.start.getUTCDate(),
    ));
    const end = window.end.getTime();
    let guard = 0;
    while (cursor.getTime() <= end && guard < 400) {
      guard += 1;
      const key = this.#bucketKey(cursor, granularity);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: this.#bucketLabel(key, granularity),
          scores: [],
          attempts: 0,
          students: new Set(),
          examAttempts: 0,
          trainingAttempts: 0,
        });
      }
      if (granularity === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
      else if (granularity === 'week') cursor.setUTCDate(cursor.getUTCDate() + 7);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    // Ensure the final bucket (e.g. the current week/month) exists even when
    // the window ends mid-period.
    const endKey = this.#bucketKey(new Date(end), granularity);
    if (!map.has(endKey)) {
      map.set(endKey, {
        key: endKey,
        label: this.#bucketLabel(endKey, granularity),
        scores: [],
        attempts: 0,
        students: new Set(),
        examAttempts: 0,
        trainingAttempts: 0,
      });
    }
    return map;
  }

  #bucketKey(date, granularity) {
    const d = new Date(date);
    if (granularity === 'month') {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    if (granularity === 'week') {
      const day = d.getUTCDay() || 7;
      const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 1));
      return monday.toISOString().slice(0, 10);
    }
    return dayKey(d);
  }

  #bucketLabel(key, granularity) {
    if (granularity === 'month') return key;
    if (granularity === 'week') return `Week of ${key.slice(5)}`;
    return key.slice(5);
  }

  // ── Section D — Students needing attention ──────────────────────────────

  #sectionAttention(ctx, metrics) {
    const rows = [];
    let academic = 0;
    let engagement = 0;
    let both = 0;

    for (const student of ctx.students) {
      const metric = metrics.get(String(student.id));
      const avg20 = metric?.avg20 ?? null;
      const trendDelta = metric?.trendDelta ?? null;
      const hasAcademic = (metric?.examAttempts || 0) >= 2 && avg20 != null && avg20 < 10;
      const hasDecline =
        (metric?.examAttempts || 0) >= 2 &&
        trendDelta != null &&
        trendDelta <= -1.5 &&
        avg20 != null &&
        avg20 < 12;
      const hasEngagement = (metric?.activityCount || 0) === 0;
      if (!hasAcademic && !hasDecline && !hasEngagement) continue;

      if (hasAcademic || hasDecline) academic += 1;
      if (hasEngagement) engagement += 1;
      if ((hasAcademic || hasDecline) && hasEngagement) both += 1;

      const weakChapters = [...(metric?.chapterErrors.entries() || [])]
        .sort((a, b) => b[1].errorRate - a[1].errorRate)
        .slice(0, 2)
        .map(([categoryId, stat]) => ({
          categoryId,
          name: ctx.catById.get(String(categoryId))?.name || 'Chapter',
          errorRate: stat.errorRate,
          answered: stat.answered,
          courseId: ctx.categoryToCourse.get(String(categoryId)) || null,
        }));
      const weakSubjects = [...(metric?.subjects.entries() || [])]
        .map(([sid, bucket]) => ({
          subjectId: sid,
          name: ctx.subjectById.get(sid)?.name || 'Subject',
          avg20: round2(bucket.sum / bucket.attempts / 5),
          attempts: bucket.attempts,
        }))
        .filter((s) => s.avg20 < 10)
        .sort((a, b) => a.avg20 - b.avg20)
        .slice(0, 2);

      const kind = (hasAcademic || hasDecline) && hasEngagement ? 'both' : hasEngagement ? 'engagement' : 'academic';
      const difficultyLabel = hasEngagement && !(hasAcademic || hasDecline)
        ? 'No activity in period'
        : weakChapters.length
          ? `Weak in ${weakChapters[0].name}`
          : hasDecline
            ? 'Performance declining'
            : 'Below 10/20';

      rows.push({
        studentId: String(student.id),
        name: student.name || student.username || 'Student',
        numero: student.numero || '',
        classId: String(student.class_id || ''),
        className: ctx.classById.get(String(student.class_id || ''))?.name || 'Unassigned',
        status: student.status,
        avg20,
        examAttempts: metric?.examAttempts || 0,
        trend: trendDelta == null ? null : trendDelta > 0.05 ? 'up' : trendDelta < -0.05 ? 'down' : 'flat',
        trendDelta,
        trainingAttempts: metric?.trainingAttempts || 0,
        lastActivity: metric?.lastActivity ? new Date(metric.lastActivity).toISOString() : null,
        daysInactive: metric?.daysInactive ?? null,
        kind,
        reason: hasAcademic
          ? `Average ${avg20}/20 over ${metric.examAttempts} exam attempts`
          : hasDecline
            ? `Down ${Math.abs(trendDelta)} points vs previous period`
            : 'No learning activity in the selected period',
        difficulty: {
          type: kind,
          label: difficultyLabel,
          weakChapters,
          weakSubjects,
        },
        intervention: hasEngagement && !(hasAcademic || hasDecline)
          ? { label: 'Review participation', action: 'student', tab: 'results' }
          : { label: 'Review results & chapters', action: 'student', tab: 'results' },
      });
    }

    rows.sort((a, b) => {
      const rank = (row) => (row.kind === 'both' ? 0 : row.kind === 'academic' ? 1 : 2);
      const byKind = rank(a) - rank(b);
      if (byKind !== 0) return byKind;
      if (a.kind === 'engagement' && b.kind === 'engagement') {
        return (b.daysInactive || 0) - (a.daysInactive || 0);
      }
      return (a.avg20 ?? 99) - (b.avg20 ?? 99);
    });

    return {
      rows: rows.slice(0, 50),
      summary: {
        total: rows.length,
        academic,
        engagement,
        both,
        shown: Math.min(rows.length, 50),
      },
      rules: [
        'Academic: at least 2 valid formal exam attempts with an average below 10/20.',
        'Academic: a drop of at least 1.5 points (/20) versus the previous equivalent period.',
        'Engagement: no exam, training, game or tournament activity in the selected period.',
        'Academic and engagement difficulties are reported separately; inactivity alone never labels a student as academically weak.',
      ],
      classes: ctx.allowedClasses.map((c) => ({ id: String(c.id), name: c.name })),
    };
  }

  // ── Section E — Courses & training ──────────────────────────────────────

  #sectionContent(ctx) {
    const published = ctx.courses.filter((c) => String(c.status) === 'published');
    const courseStats = new Map();
    const ensure = (id) => {
      if (!courseStats.has(id)) {
        courseStats.set(id, {
          courseId: id,
          students: new Set(),
          trainingAttempts: 0,
          examAttempts: 0,
          trainingScoreSum: 0,
          lastPracticedAt: null,
        });
      }
      return courseStats.get(id);
    };

    for (const row of ctx.answerRows) {
      const uid = String(row.user_id || '');
      if (!ctx.studentById.has(uid)) continue;
      const touched = new Set();
      for (const qid of Object.keys(row.answers)) {
        if (!row.answers[qid] || String(row.answers[qid]).trim() === '') continue;
        const question = ctx.questionById.get(String(qid));
        if (!question?.category_id) continue;
        const courseId = ctx.categoryToCourse.get(String(question.category_id));
        if (!courseId) continue;
        if (!touched.has(courseId)) {
          touched.add(courseId);
          const stat = ensure(courseId);
          stat.students.add(uid);
          if (row.mode === RESULT_MODE.TRAINING) stat.trainingAttempts += 1;
          else stat.examAttempts += 1;
          const at = new Date(row.date_taken).getTime();
          if (Number.isFinite(at) && (!stat.lastPracticedAt || at > stat.lastPracticedAt)) {
            stat.lastPracticedAt = at;
          }
        }
      }
      // A training attempt's score is added once per course it practised —
      // never once per answered question (that would inflate the average).
      if (row.mode === RESULT_MODE.TRAINING) {
        for (const courseId of touched) {
          ensure(courseId).trainingScoreSum += Number(row.score) || 0;
        }
      }
    }

    const courseRows = ctx.courses.map((course) => {
      const stat = courseStats.get(String(course.id));
      const lessonCount = (ctx.lessonsByCourse.get(String(course.id)) || []).length;
      return {
        courseId: String(course.id),
        name: course.name,
        subjectId: course.subject_id ? String(course.subject_id) : null,
        subjectName: course.subject_id ? ctx.subjectById.get(String(course.subject_id))?.name || null : null,
        status: course.status,
        lessonCount,
        assignedClasses: [...(ctx.courseClassesByCourse.get(String(course.id)) || [])].length,
        practicingStudents: stat?.students.size || 0,
        trainingAttempts: stat?.trainingAttempts || 0,
        examAttempts: stat?.examAttempts || 0,
        avgTraining20: stat?.trainingAttempts
          ? round2(stat.trainingScoreSum / stat.trainingAttempts / 5)
          : null,
        lastPracticedAt: stat?.lastPracticedAt ? new Date(stat.lastPracticedAt).toISOString() : null,
      };
    });
    const visibleCourseIds = ctx.visibleCourseIds || new Set(courseRows.map((c) => c.courseId));

    const publishedRows = courseRows.filter((c) => c.status === 'published');
    const mostPracticed = publishedRows
      .slice()
      .sort((a, b) => b.practicingStudents - a.practicingStudents || b.trainingAttempts - a.trainingAttempts)
      .slice(0, 3);
    const leastPracticed = publishedRows
      .slice()
      .sort((a, b) => a.practicingStudents - b.practicingStudents || a.trainingAttempts - b.trainingAttempts)
      .slice(0, 3);

    // Chapter difficulty from real answers (training + exam), restricted to
    // the teacher's own content scope.
    const chapterStats = new Map();
    for (const row of ctx.answerRows) {
      for (const [qid, given] of Object.entries(row.answers)) {
        if (given == null || String(given).trim() === '') continue;
        const question = ctx.questionById.get(String(qid));
        if (!question) continue;
        const categoryId = question.category_id ? String(question.category_id) : '';
        if (!categoryId || !ctx.scopeCategoryIds.has(categoryId)) continue;
        const decoded = decodeStoredAnswer(question);
        const type = normalizeQuestionType(decoded);
        if (!chapterStats.has(categoryId)) {
          chapterStats.set(categoryId, {
            attempts: 0,
            correct: 0,
            students: new Set(),
            examAttempts: 0,
            trainingAttempts: 0,
          });
        }
        const stat = chapterStats.get(categoryId);
        stat.attempts += 1;
        stat.students.add(String(row.user_id));
        if (row.mode === RESULT_MODE.EXAM) stat.examAttempts += 1;
        else stat.trainingAttempts += 1;
        if (isAnswerCorrect(given, decoded.answer, type)) stat.correct += 1;
      }
    }

    const chapters = [...chapterStats.entries()]
      .map(([categoryId, stat]) => {
        const category = ctx.catById.get(String(categoryId));
        const errorRate = round1(((stat.attempts - stat.correct) / stat.attempts) * 100);
        const correctRate = round1((stat.correct / stat.attempts) * 100);
        const severity =
          stat.attempts >= MIN_CHAPTER_ANSWERS && stat.students.size >= MIN_CHAPTER_STUDENTS && errorRate >= 50
            ? 'high'
            : errorRate >= 35
              ? 'medium'
              : 'ok';
        return {
          categoryId,
          name: category?.name || 'Chapter',
          path: this.#categoryPath(categoryId, ctx.catById),
          courseId: visibleCourseIds.has(String(ctx.categoryToCourse.get(String(categoryId)) || ''))
            ? ctx.categoryToCourse.get(String(categoryId))
            : null,
          courseName: visibleCourseIds.has(String(ctx.categoryToCourse.get(String(categoryId)) || ''))
            ? ctx.courses.find((c) => String(c.id) === ctx.categoryToCourse.get(String(categoryId)))?.name || null
            : null,
          subjectId: category?.subject_id ? String(category.subject_id) : null,
          subjectName: category?.subject_id ? ctx.subjectById.get(String(category.subject_id))?.name || null : null,
          attempts: stat.attempts,
          students: stat.students.size,
          correctRate,
          errorRate,
          examAttempts: stat.examAttempts,
          trainingAttempts: stat.trainingAttempts,
          severity,
        };
      })
      .filter((c) => c.attempts >= 3)
      .sort((a, b) => b.errorRate - a.errorRate || b.attempts - a.attempts)
      .slice(0, 12);

    const trainingStudents = new Set(ctx.trainingRows.map((r) => String(r.user_id))).size;

    return {
      publishedCourses: { value: published.length, basis: 'current-state' },
      draftCourses: { value: ctx.courses.length - published.length, basis: 'current-state' },
      courses: courseRows,
      mostPracticed,
      leastPracticed,
      training: {
        attempts: ctx.trainingRows.length,
        students: trainingStudents,
        attemptsPerStudent: trainingStudents ? round1(ctx.trainingRows.length / trainingStudents) : null,
        avg20: ctx.trainingRows.length ? round2(avg(ctx.trainingRows.map((r) => Number(r.score) / 5))) : null,
        participationRate: pct(trainingStudents, ctx.students.length),
      },
      chapters,
      unavailable: {
        completion: 'Course reading and lesson completion are not recorded, so course completion cannot be measured.',
        participation: 'Course participation here means practice on the course chapter questions — not that a student read the lesson.',
      },
    };
  }

  #categoryPath(categoryId, catById) {
    const names = [];
    let current = catById.get(String(categoryId));
    const guard = new Set();
    while (current && !guard.has(String(current.id)) && names.length < 8) {
      guard.add(String(current.id));
      names.unshift(String(current.name || ''));
      current = current.parent_id ? catById.get(String(current.parent_id)) : null;
    }
    return names.join(' › ');
  }

  // ── Section F — Examinations ────────────────────────────────────────────

  #sectionExams(ctx) {
    const sample = ctx.examRows.length;
    const avg20 = sample ? round2(avg(ctx.examRows.map((r) => Number(r.score) / 5))) : null;
    const passed = ctx.examRows.filter((r) => isPass(r.score)).length;

    const buckets = [
      { key: '0-5', label: '0–5', min: 0, max: 5 },
      { key: '5-10', label: '5–10', min: 5, max: 10 },
      { key: '10-15', label: '10–15', min: 10, max: 15 },
      { key: '15-20', label: '15–20', min: 15, max: 20.01 },
    ].map((b) => ({ ...b, count: 0 }));
    for (const row of ctx.examRows) {
      const score20 = Number(row.score) / 5;
      const bucket = buckets.find((b) => score20 >= b.min && score20 < b.max) || buckets[buckets.length - 1];
      bucket.count += 1;
    }
    const distribution = buckets.map((b) => ({
      bucket: b.key,
      label: b.label,
      count: b.count,
      pct: pct(b.count, sample),
    }));

    // Class comparison for exams (same metric as progress, kept here so the
    // examination section is self-contained).
    const classBuckets = new Map();
    for (const row of ctx.examRows) {
      const student = ctx.studentById.get(String(row.user_id));
      const cid = student ? String(student.class_id || '') : '';
      if (!cid) continue;
      if (!classBuckets.has(cid)) classBuckets.set(cid, { scores: [], passed: 0 });
      const b = classBuckets.get(cid);
      b.scores.push(Number(row.score) || 0);
      if (isPass(row.score)) b.passed += 1;
    }
    const classComparison = [...classBuckets.entries()]
      .map(([cid, b]) => ({
        classId: cid,
        className: ctx.classById.get(cid)?.name || 'Unassigned',
        avg20: round2(avg(b.scores) / 5),
        sample: b.scores.length,
        successRate: pct(b.passed, b.scores.length),
        reliable: b.scores.length >= MIN_AVG_SAMPLE,
      }))
      .sort((a, b) => b.avg20 - a.avg20);

    // Assigned exams awaiting completion (the schema has no exam date).
    const awaiting = [];
    let pendingTotal = 0;
    for (const exam of ctx.activeAssignedExams) {
      const eid = String(exam.id);
      const assignedClasses = ctx.examClassMap.get(eid) || new Set();
      const assigned = ctx.students.filter((s) => assignedClasses.has(String(s.class_id || ''))).length;
      const completed = ctx.completionByExam.get(eid)?.size || 0;
      const pending = Math.max(0, assigned - completed);
      pendingTotal += pending;
      if (assigned === 0) continue;
      awaiting.push({
        examId: eid,
        name: exam.name,
        status: exam.status,
        assigned,
        completed,
        pending,
        createdAt: exam.created_at ? new Date(exam.created_at).toISOString() : null,
        assignedClasses: [...assignedClasses].map((cid) => ({
          id: cid,
          name: ctx.classById.get(cid)?.name || 'Class',
        })),
      });
    }
    awaiting.sort((a, b) => b.pending - a.pending || String(b.createdAt).localeCompare(String(a.createdAt)));

    // Recent results (bounded).
    const recent = ctx.examRows
      .slice()
      .sort((a, b) => new Date(b.date_taken) - new Date(a.date_taken))
      .slice(0, 10)
      .map((row) => {
        const student = ctx.studentById.get(String(row.user_id));
        return {
          resultId: String(row.id),
          studentId: String(row.user_id),
          studentName: student?.name || 'Student',
          classId: student ? String(student.class_id || '') : '',
          className: student ? ctx.classById.get(String(student.class_id || ''))?.name || 'Unassigned' : '',
          examId: String(row.exam_id),
          examName: ctx.examsById.get(String(row.exam_id))?.name || 'Exam',
          score20: round2(Number(row.score) / 5),
          passed: isPass(row.score),
          date: new Date(row.date_taken).toISOString(),
        };
      });

    // Per-exam analysis, bounded to the exams with the most attempts.
    const attemptsByExam = new Map();
    for (const row of ctx.examRows) {
      const eid = String(row.exam_id);
      if (!attemptsByExam.has(eid)) attemptsByExam.set(eid, []);
      attemptsByExam.get(eid).push(row);
    }
    const topExamIds = [...attemptsByExam.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_EXAM_ANALYSES)
      .map(([eid]) => eid);

    const analysis = topExamIds.map((eid) => {
      const rows = attemptsByExam.get(eid) || [];
      const scores = rows.map((r) => Number(r.score) / 5);
      const exam = ctx.examsById.get(eid) || {};
      const assignedClasses = ctx.examClassMap.get(eid) || new Set();
      const assigned = assignedClasses.size
        ? ctx.students.filter((s) => assignedClasses.has(String(s.class_id || ''))).length
        : null;
      const completedAll = ctx.completionByExam.get(eid)?.size ?? rows.length;
      const pending = assigned == null ? null : Math.max(0, assigned - completedAll);

      const questionIds = ctx.examQuestionsByExam.get(eid) || [];
      const perQuestion = new Map();
      for (const qid of questionIds) {
        perQuestion.set(qid, { attempts: 0, correct: 0, incorrect: 0, skipped: 0 });
      }
      const chapterStats = new Map();
      for (const row of rows) {
        const answers = ctx.answersByResult.get(String(row.id)) || {};
        for (const qid of questionIds) {
          const question = ctx.questionById.get(String(qid));
          if (!question) continue;
          const stat = perQuestion.get(qid);
          const given = answers[qid];
          const answered = given != null && String(given).trim() !== '';
          if (!answered) {
            stat.skipped += 1;
            continue;
          }
          stat.attempts += 1;
          const decoded = decodeStoredAnswer(question);
          const type = normalizeQuestionType(decoded);
          const correct = isAnswerCorrect(given, decoded.answer, type);
          if (correct) stat.correct += 1;
          else stat.incorrect += 1;
          const categoryId = question.category_id ? String(question.category_id) : '';
          if (categoryId) {
            if (!chapterStats.has(categoryId)) chapterStats.set(categoryId, { answered: 0, correct: 0 });
            const c = chapterStats.get(categoryId);
            c.answered += 1;
            if (correct) c.correct += 1;
          }
        }
      }

      const questions = questionIds
        .map((qid) => {
          const stat = perQuestion.get(qid);
          const question = ctx.questionById.get(String(qid));
          const categoryId = question?.category_id ? String(question.category_id) : '';
          return {
            questionId: String(qid),
            text: String(question?.text || '').slice(0, 240),
            categoryId: categoryId || null,
            categoryName: categoryId ? ctx.catById.get(categoryId)?.name || null : null,
            attempts: stat.attempts,
            correct: stat.correct,
            incorrect: stat.incorrect,
            skipped: stat.skipped,
            correctRate: pct(stat.correct, stat.attempts),
          };
        })
        .filter((q) => q.text);

      const graded = questions.filter((q) => q.attempts >= MIN_QUESTION_ATTEMPTS && q.correctRate != null);
      const hardestQuestions = graded.slice().sort((a, b) => a.correctRate - b.correctRate).slice(0, 3);
      const strongestQuestions = graded.slice().sort((a, b) => b.correctRate - a.correctRate).slice(0, 3);
      const skippedQuestions = questions
        .filter((q) => q.skipped > 0)
        .sort((a, b) => b.skipped - a.skipped)
        .slice(0, 3);
      const weakChapters = [...chapterStats.entries()]
        .map(([categoryId, stat]) => ({
          categoryId,
          name: ctx.catById.get(categoryId)?.name || 'Chapter',
          path: this.#categoryPath(categoryId, ctx.catById),
          answered: stat.answered,
          correctRate: pct(stat.correct, stat.answered),
          errorRate: pct(stat.answered - stat.correct, stat.answered),
          courseId: ctx.categoryToCourse.get(categoryId) || null,
        }))
        .filter((c) => c.answered >= 3 && (c.errorRate || 0) >= 40)
        .sort((a, b) => (b.errorRate || 0) - (a.errorRate || 0))
        .slice(0, 3);

      return {
        examId: eid,
        name: exam.name || 'Exam',
        status: exam.status || null,
        createdAt: exam.created_at ? new Date(exam.created_at).toISOString() : null,
        assigned,
        completed: rows.length,
        completedAllTime: completedAll,
        pending,
        avg20: scores.length ? round2(avg(scores)) : null,
        highest: scores.length ? round2(Math.max(...scores)) : null,
        lowest: scores.length ? round2(Math.min(...scores)) : null,
        passCount: rows.filter((r) => isPass(r.score)).length,
        failCount: rows.filter((r) => !isPass(r.score)).length,
        successRate: pct(rows.filter((r) => isPass(r.score)).length, rows.length),
        questionAnalysisAvailable: questionIds.length > 0,
        questions,
        hardestQuestions,
        strongestQuestions,
        skippedQuestions,
        weakChapters,
      };
    });

    return {
      summary: {
        completed: { value: new Set(ctx.examRows.map((r) => String(r.exam_id))).size, basis: 'period' },
        avg20: { value: avg20, sample, scale: 20 },
        successRate: { value: pct(passed, sample), passed, total: sample },
        awaitingCount: { value: awaiting.filter((e) => e.pending > 0).length },
        pendingAttempts: { value: pendingTotal },
      },
      distribution,
      classComparison,
      awaiting: awaiting.slice(0, 6),
      recent,
      analysis,
      thresholds: { pass20: 10, minQuestionAttempts: MIN_QUESTION_ATTEMPTS },
      unavailable: {
        completionRate:
          'Assignment-level completion is computed from recorded class assignments. Exams whose legacy options only name classes that no longer exist cannot be attributed and are excluded.',
        schedule: 'Exams have no scheduled date; the list shows assigned exams still awaiting student attempts.',
      },
    };
  }

  // ── Section G — Games & tournaments (engagement only) ───────────────────

  #sectionEngagement(ctx) {
    const gameStudents = new Set(ctx.gameSessions.map((s) => String(s.user_id))).size;
    const tournamentStudents = new Set(ctx.tournamentEntries.map((e) => String(e.user_id))).size;

    const spanDays = ctx.window.start && ctx.window.end
      ? Math.max(1, Math.ceil((ctx.window.end.getTime() - ctx.window.start.getTime()) / 86400000))
      : 30;
    const granularity = spanDays <= 14 ? 'day' : spanDays <= 120 ? 'week' : 'month';
    const buckets = this.#bucketsFor(ctx.window, granularity);
    for (const session of ctx.gameSessions) {
      const bucket = buckets.get(this.#bucketKey(session.joined_at, granularity));
      if (bucket) bucket.gameSessions = (bucket.gameSessions || 0) + 1;
    }
    for (const entry of ctx.tournamentEntries) {
      const bucket = buckets.get(this.#bucketKey(entry.registered_at, granularity));
      if (bucket) bucket.tournamentEntries = (bucket.tournamentEntries || 0) + 1;
    }
    const trend = [...buckets.values()].map((b) => ({
      period: b.key,
      label: b.label,
      games: b.gameSessions || 0,
      tournaments: b.tournamentEntries || 0,
    }));

    const classBuckets = new Map();
    const addClassActivity = (uid, kind) => {
      const student = ctx.studentById.get(String(uid));
      const cid = student ? String(student.class_id || '') : '';
      if (!cid) return;
      if (!classBuckets.has(cid)) classBuckets.set(cid, { students: new Set(), attempts: 0 });
      const b = classBuckets.get(cid);
      b.students.add(String(uid));
      b.attempts += 1;
    };
    ctx.gameSessions.forEach((s) => addClassActivity(s.user_id, 'game'));
    ctx.tournamentEntries.forEach((e) => addClassActivity(e.user_id, 'tournament'));
    const activeClasses = [...classBuckets.entries()]
      .map(([cid, b]) => ({
        classId: cid,
        className: ctx.classById.get(cid)?.name || 'Unassigned',
        students: b.students.size,
        attempts: b.attempts,
      }))
      .sort((a, b) => b.students - a.students || b.attempts - a.attempts)
      .slice(0, 5);

    // Subject of each game, from its question set (dominant subject). Game
    // questions were loaded with the chapter-analysis batch in getOverview.
    const gameSubject = new Map();
    for (const game of ctx.gamesById.values()) {
      const parsed = parseJson(game.question_ids, []);
      const ids = Array.isArray(parsed) ? parsed.map(String) : [];
      const counts = new Map();
      for (const qid of ids) {
        const q = ctx.questionById.get(qid);
        const cat = q?.category_id ? ctx.catById.get(String(q.category_id)) : null;
        const sid = cat?.subject_id ? String(cat.subject_id) : '';
        if (sid) counts.set(sid, (counts.get(sid) || 0) + 1);
      }
      gameSubject.set(String(game.id), counts.size ? [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0] : null);
    }

    const subjectBuckets = new Map();
    for (const session of ctx.gameSessions) {
      const sid = gameSubject.get(String(session.game_id));
      if (!sid) continue;
      if (!subjectBuckets.has(sid)) subjectBuckets.set(sid, { sessions: 0, students: new Set() });
      const b = subjectBuckets.get(sid);
      b.sessions += 1;
      b.students.add(String(session.user_id));
    }
    const bySubject = [...subjectBuckets.entries()]
      .map(([sid, b]) => ({
        subjectId: sid,
        subjectName: ctx.subjectById.get(sid)?.name || 'Subject',
        sessions: b.sessions,
        students: b.students.size,
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 6);

    const activityBuckets = new Map();
    for (const session of ctx.gameSessions) {
      const key = `game:${session.game_id}`;
      if (!activityBuckets.has(key)) {
        activityBuckets.set(key, {
          type: 'game',
          id: String(session.game_id),
          name: ctx.gamesById.get(String(session.game_id))?.name || 'Game',
          participants: new Set(),
          completions: 0,
        });
      }
      const b = activityBuckets.get(key);
      b.participants.add(String(session.user_id));
      if (session.completed) b.completions += 1;
    }
    for (const entry of ctx.tournamentEntries) {
      const key = `tournament:${entry.tournament_id}`;
      if (!activityBuckets.has(key)) {
        activityBuckets.set(key, {
          type: 'tournament',
          id: String(entry.tournament_id),
          name: ctx.tournamentsById.get(String(entry.tournament_id))?.name || 'Tournament',
          participants: new Set(),
          completions: 0,
        });
      }
      const b = activityBuckets.get(key);
      b.participants.add(String(entry.user_id));
      if (entry.completed) b.completions += 1;
    }
    const topActivities = [...activityBuckets.values()]
      .map((b) => ({
        id: b.id,
        type: b.type,
        name: b.name,
        participants: b.participants.size,
        completions: b.completions,
      }))
      .sort((a, b) => b.participants - a.participants)
      .slice(0, 5);

    // Active tournaments relevant to this teacher: created by them, or with
    // entries from their students.
    const activeTournamentIds = ctx.activeTournamentIds || new Set();

    return {
      games: {
        sessions: ctx.gameSessions.length,
        students: gameStudents,
        completed: ctx.gameSessions.filter((s) => s.completed).length,
        participationRate: pct(gameStudents, ctx.students.length),
      },
      tournaments: {
        entries: ctx.tournamentEntries.length,
        students: tournamentStudents,
        active: activeTournamentIds.size,
        participationRate: pct(tournamentStudents, ctx.students.length),
      },
      trend,
      activeClasses,
      bySubject,
      topActivities,
      unavailable: {
        ranking:
          'Game and tournament points measure engagement only. They are never combined with examination averages or used to rank academic performance.',
      },
    };
  }

  // ── Section H — pedagogical insights (deterministic rules) ──────────────

  #buildInsights({ glance, progress, attention, content, exams, engagement, ctx }) {
    const insights = [];
    const push = (insight) => {
      if (insight) insights.push(insight);
    };

    // 1. Hard chapters with enough volume and breadth.
    for (const chapter of content.chapters) {
      if (chapter.severity !== 'high') continue;
      push({
        id: `chapter-${chapter.categoryId}`,
        severity: 'high',
        observation: `Students struggle with “${chapter.name}”.`,
        metric: `${chapter.errorRate}% wrong answers across ${chapter.attempts} answers from ${chapter.students} students.`,
        scope: chapter.path,
        target: chapter.name,
        action: chapter.courseId ? 'Open course chapter' : 'Review chapter questions',
        link: chapter.courseId
          ? { tab: 'subjects', action: 'course', id: chapter.courseId }
          : { tab: 'questions', action: 'category', id: chapter.categoryId },
      });
      if (insights.length >= 3) break;
    }

    // 2. Subject decline vs previous equivalent period.
    const bySubjectPrev = new Map();
    for (const row of ctx.prevExamRows) {
      const sid = ctx.examSubjects.get(String(row.exam_id))?.subjectId;
      if (!sid) continue;
      if (!bySubjectPrev.has(sid)) bySubjectPrev.set(sid, []);
      bySubjectPrev.get(sid).push(Number(row.score) / 5);
    }
    for (const subject of progress.subjectPerformance) {
      const prevScores = bySubjectPrev.get(subject.subjectId) || [];
      if (prevScores.length < MIN_AVG_SAMPLE || subject.sample < MIN_AVG_SAMPLE) continue;
      const prevAvg = avg(prevScores);
      const delta = subject.avg20 - prevAvg;
      if (delta > -1) continue;
      push({
        id: `subject-decline-${subject.subjectId}`,
        severity: delta <= -2 ? 'high' : 'medium',
        observation: `${subject.subjectName} results declined compared with the previous period.`,
        metric: `${round2(subject.avg20)}/20 vs ${round2(prevAvg)}/20 (${round2(delta)}), ${subject.sample} attempts.`,
        scope: subject.subjectName,
        target: subject.subjectName,
        action: 'Inspect subject chapters',
        link: { tab: 'subjects', action: 'subject', id: subject.subjectId },
      });
    }

    // 3. Class average below 10/20.
    for (const cls of progress.classComparison) {
      if (!cls.reliable || cls.avg20 >= 10) continue;
      push({
        id: `class-low-${cls.classId}`,
        severity: cls.avg20 < 8 ? 'high' : 'medium',
        observation: `${cls.className} is below the pass line in examinations.`,
        metric: `${cls.avg20}/20 average over ${cls.sample} attempts · ${cls.successRate}% success.`,
        scope: cls.className,
        target: cls.className,
        action: 'Review class results',
        link: { tab: 'results', action: 'class', id: cls.classId, query: cls.className },
      });
    }

    // 4. Inactive students.
    const inactiveCount = ctx.students.filter((s) => {
      return !ctx.allActivityRows.some((r) => String(r.user_id) === String(s.id));
    }).length;
    if (inactiveCount >= 3) {
      push({
        id: 'inactive-students',
        severity: inactiveCount >= Math.max(5, Math.ceil(ctx.students.length * 0.25)) ? 'high' : 'medium',
        observation: `${inactiveCount} students had no learning activity in this period.`,
        metric: `${inactiveCount} of ${ctx.students.length} students recorded no exam, training or game activity.`,
        scope: 'Your classes',
        target: 'Inactive students',
        action: 'Open attention list',
        link: { tab: 'overview', action: 'attention' },
      });
    }

    // 5. Frequent wrong question in a formal exam.
    for (const exam of exams.analysis) {
      const question = exam.hardestQuestions.find(
        (q) => q.attempts >= MIN_QUESTION_ATTEMPTS && q.correctRate != null && q.correctRate <= 40,
      );
      if (!question) continue;
      push({
        id: `question-${exam.examId}-${question.questionId}`,
        severity: 'medium',
        observation: `A question in “${exam.name}” was frequently answered incorrectly.`,
        metric: `${question.correctRate}% correct across ${question.attempts} answers (${question.categoryName || 'uncategorised'}).`,
        scope: `${exam.name}${question.categoryName ? ` · ${question.categoryName}` : ''}`,
        target: question.text,
        action: 'Review question performance',
        link: { tab: 'exams', action: 'exam-analysis', id: exam.examId, questionId: question.questionId },
      });
      if (insights.length >= 8) break;
    }

    // 6. Assigned exam with low completion.
    const lowCompletion = exams.awaiting.find((e) => e.assigned >= 5 && e.completed / e.assigned < 0.6);
    if (lowCompletion) {
      push({
        id: `exam-pending-${lowCompletion.examId}`,
        severity: 'medium',
        observation: `“${lowCompletion.name}” has not been completed by most assigned students.`,
        metric: `${lowCompletion.completed} completed · ${lowCompletion.pending} pending of ${lowCompletion.assigned} assigned.`,
        scope: 'Examinations',
        target: lowCompletion.name,
        action: 'Open examination',
        link: { tab: 'exams', action: 'exam-analysis', id: lowCompletion.examId },
      });
    }

    // 7. Low training participation.
    if (ctx.students.length >= 5 && (content.training.participationRate ?? 0) < 40) {
      push({
        id: 'training-participation',
        severity: 'medium',
        observation: 'Few students practised the course chapters in this period.',
        metric: `${content.training.participationRate ?? 0}% of students attempted training (${content.training.students} of ${ctx.students.length}).`,
        scope: 'Courses & training',
        target: 'Training participation',
        action: 'Open courses',
        link: { tab: 'subjects', action: 'courses' },
      });
    }

    // 8. Positive: measurable improvement.
    if (glance.avgExamScore.comparable && (glance.avgExamScore.delta || 0) >= 1) {
      push({
        id: 'exam-improvement',
        severity: 'positive',
        observation: 'Average examination results improved compared with the previous period.',
        metric: `+${glance.avgExamScore.delta} points (/20): ${glance.avgExamScore.value}/20 vs ${glance.avgExamScore.previous}/20.`,
        scope: 'All classes',
        target: 'Performance evolution',
        action: 'See evolution',
        link: { tab: 'overview', action: 'progress' },
      });
    }

    // 9. Games used as reinforcement (engagement only).
    if (engagement.games.students > 0) {
      push({
        id: 'games-engagement',
        severity: 'info',
        observation: 'Educational games are being used to reinforce learning.',
        metric: `${engagement.games.students} students played ${engagement.games.sessions} game sessions.`,
        scope: 'Games & tournaments',
        target: 'Engagement',
        action: 'Open games',
        link: { tab: 'games', action: 'games' },
      });
    }

    // Nothing actionable at all: say so honestly.
    if (!insights.length) {
      insights.push({
        id: 'no-signal',
        severity: 'info',
        observation: 'No pedagogical alert is currently triggered.',
        metric: 'There is not enough activity or no threshold is crossed in this period.',
        scope: 'Your classes',
        target: 'Teaching insights',
        action: 'Open attention list',
        link: { tab: 'overview', action: 'attention' },
      });
    }

    const rank = { high: 0, medium: 1, info: 2, positive: 3 };
    return insights.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
  }

  // ── Empty scope bundle ──────────────────────────────────────────────────

  #emptyBundle({ schoolYear, teacher, now, window, prev, academicWindow, classes = [], message }) {
    const period = window || {
      key: 'month',
      label: 'Current month',
      start: null,
      end: null,
    };
    const noAttention = {
      rows: [],
      summary: { total: 0, academic: 0, engagement: 0, both: 0, shown: 0 },
      rules: [],
      classes,
    };
    const empty = {
      value: 0,
      explanation: message || 'No classes assigned.',
    };
    return {
      meta: {
        generatedAt: now.toISOString(),
        teacher,
        academicYear: academicWindow
          ? { label: academicWindow.label, start: academicWindow.start.toISOString(), end: academicWindow.end.toISOString() }
          : schoolYear
            ? { label: schoolYear, start: null, end: null }
            : null,
        period: {
          key: period.key,
          label: period.label,
          start: period.start ? period.start.toISOString() : null,
          end: period.end ? period.end.toISOString() : null,
        },
        previous: prev ? { start: prev.start.toISOString(), end: prev.end.toISOString() } : null,
        scope: {
          empty: true,
          classIds: [],
          classes: classes.map((c) => ({ id: String(c.id), name: c.name })),
          allClasses: classes.map((c) => ({ id: String(c.id), name: c.name })),
          subjectIds: [],
          subjects: [],
          studentCount: 0,
        },
        thresholds: {
          pass20: 10,
          passPercent: PASS_PERCENT,
          minAvgSample: MIN_AVG_SAMPLE,
          minChapterAnswers: MIN_CHAPTER_ANSWERS,
          minChapterStudents: MIN_CHAPTER_STUDENTS,
          minQuestionAttempts: MIN_QUESTION_ATTEMPTS,
        },
        unavailable: {},
        sample: { answerRowsUsed: 0, answerRowsCap: ANSWER_SAMPLE_CAP, answerRowsCapped: false, resultRowsCapped: false },
        emptyReason: message || 'No classes assigned.',
      },
      sections: {
        glance: {
          totalStudents: empty,
          activeStudents: { value: 0, rate: null, explanation: empty.explanation },
          avgExamScore: { value: null, sample: 0, comparable: false, trend: null, explanation: empty.explanation },
          successRate: { value: null, passed: 0, total: 0, threshold: '10/20', explanation: empty.explanation },
          completedExams: { value: 0, explanation: empty.explanation },
          needingAttention: { value: 0, academic: 0, engagement: 0, both: 0 },
        },
        progress: {
          performanceEvolution: { granularity: 'day', points: [], previousPoints: [], comparable: false, direction: null, change: null },
          participationEvolution: { granularity: 'day', points: [] },
          classComparison: [],
          subjectPerformance: [],
          trainingVsExam: {
            training: { avg20: null, sample: 0, students: 0 },
            exam: { avg20: null, sample: 0, students: 0 },
            note: 'No data in the selected scope.',
          },
        },
        attention: noAttention,
        content: {
          publishedCourses: { value: 0 },
          draftCourses: { value: 0 },
          courses: [],
          mostPracticed: [],
          leastPracticed: [],
          training: { attempts: 0, students: 0, attemptsPerStudent: null, avg20: null, participationRate: null },
          chapters: [],
          unavailable: {},
        },
        exams: {
          summary: {
            completed: { value: 0 },
            avg20: { value: null, sample: 0, scale: 20 },
            successRate: { value: null, passed: 0, total: 0 },
            awaitingCount: { value: 0 },
            pendingAttempts: { value: 0 },
          },
          distribution: [],
          classComparison: [],
          awaiting: [],
          recent: [],
          analysis: [],
          thresholds: { pass20: 10, minQuestionAttempts: MIN_QUESTION_ATTEMPTS },
          unavailable: {},
        },
        engagement: {
          games: { sessions: 0, students: 0, completed: 0, participationRate: null },
          tournaments: { entries: 0, students: 0, active: 0, participationRate: null },
          trend: [],
          activeClasses: [],
          bySubject: [],
          topActivities: [],
          unavailable: {},
        },
        insights: [
          {
            id: 'no-classes',
            severity: 'info',
            observation: message || 'No classes assigned.',
            metric: 'The dashboard only reports on students in your assigned classes.',
            scope: 'Your account',
            target: 'Class assignment',
            action: 'Open classes',
            link: { tab: 'classes', action: 'classes' },
          },
        ],
      },
    };
  }
}

