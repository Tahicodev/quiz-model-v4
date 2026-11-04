/**
 * tests/unit/course-service.test.js
 *
 * Course-generation contracts (see docs plan "AI Courses from Categories"):
 *  • teachers only ever see and touch their own courses (admins: all)
 *  • a generated course persists its lesson skeleton in plan order, with the
 *    SERVER-side category mapping (a hallucinated categoryId can't repoint a
 *    lesson at a foreign category)
 *  • class assignment is an idempotent junction sync
 *  • students only ever reach published courses assigned to their class, and
 *    practice questions arrive with the answers stripped
 *  • the branch plan keeps only leaf categories that actually hold questions
 *
 * Runs against an isolated SQLite database (same helper the integration
 * suite uses) so the real PrismaRepository + junction tables are exercised.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { setupTestDb, teardownTestDb } from '../integration/helpers/testDb.js';
import { PrismaRepository } from '../../src/backend/infrastructure/PrismaRepository.js';
import { CourseService } from '../../src/frontend/services/CourseService.js';
import { AIService } from '../../src/backend/services/AIService.js';
import { toStudentPracticeView } from '../../src/backend/utils/studentQuestionView.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/shared/errors.js';

const SCHOOL = 'school-test';

let prisma;
let repo;
let courseSvc;
let teacherA;
let teacherB;
let classOne;
let classTwo;
let mathId;
let additionId;
let tensId;
let unitsId;
let geometryId;

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

beforeAll(async () => {
	const db = await setupTestDb();
	prisma = db.prisma;
	repo = new PrismaRepository(prisma);
	courseSvc = new CourseService(repo);

	classOne = await prisma.class.create({
		data: { school_id: SCHOOL, name: 'Class 1A' },
	});
	classTwo = await prisma.class.create({
		data: { school_id: SCHOOL, name: 'Class 2B' },
	});
	const hash = '$2b$04$0000000000000000000000000000000000000000000000000000';
	teacherA = await prisma.user.create({
		data: {
			school_id: SCHOOL, username: 'teacher-course-a', name: 'Teacher A',
			password_hash: hash, role: 'teacher', status: 'active',
		},
	});
	teacherB = await prisma.user.create({
		data: {
			school_id: SCHOOL, username: 'teacher-course-b', name: 'Teacher B',
			password_hash: hash, role: 'teacher', status: 'active',
		},
	});

	// Math → Addition → {Tens, Units}; Math → Geometry (leaf, no questions).
	const math = await prisma.category.create({
		data: { school_id: SCHOOL, name: 'Math-Courses', created_by: teacherA.id },
	});
	mathId = math.id;
	const addition = await prisma.category.create({
		data: { school_id: SCHOOL, name: 'Addition-Courses', parent_id: math.id, created_by: teacherA.id },
	});
	additionId = addition.id;
	const tens = await prisma.category.create({
		data: { school_id: SCHOOL, name: 'Tens-Courses', parent_id: addition.id, created_by: teacherA.id },
	});
	tensId = tens.id;
	const units = await prisma.category.create({
		data: { school_id: SCHOOL, name: 'Units-Courses', parent_id: addition.id, created_by: teacherA.id },
	});
	unitsId = units.id;
	const geometry = await prisma.category.create({
		data: { school_id: SCHOOL, name: 'Geometry-Courses', parent_id: math.id, created_by: teacherA.id },
	});
	geometryId = geometry.id;

	await prisma.question.create({
		data: {
			school_id: SCHOOL, category_id: tensId, type: 'multiple-choice',
			text: '30 + 40 = ?', options_json: '["70","60","80"]', answer: '70',
			explanation: '3 tens + 4 tens', created_by: teacherA.id,
		},
	});
	await prisma.question.createMany({
		data: [
			{
				school_id: SCHOOL, category_id: unitsId, type: 'multiple-choice',
				text: '3 + 4 = ?', options_json: '["7","6","8"]', answer: '7',
				created_by: teacherA.id,
			},
			{
				// Multi-answer row: flag is encoded inside `answer` (legacy).
				school_id: SCHOOL, category_id: unitsId, type: 'multiple-choice',
				text: 'Pick the pairs summing to 7', options_json: '["3+4","2+5","1+2"]',
				answer: 'multi::3+4|2+5', created_by: teacherA.id,
			},
		],
	});
});

afterAll(async () => {
	vi.unstubAllGlobals();
	await teardownTestDb();
});

let branchSeq = 0;

/** A top-level branch no course owns yet. */
async function makeBranch(teacher = teacherA, parentId = null) {
	branchSeq += 1;
	return prisma.category.create({
		data: { school_id: SCHOOL, name: `Branch ${branchSeq}`, parent_id: parentId, created_by: teacher.id },
	});
}

/**
 * Fresh course on a branch of its own. The 1:1 rule means a course claims a
 * whole category branch, so every spec needs a branch nobody has taken: pass
 * `categoryId` only when the branch under test is the point of the spec.
 */
async function makeCourse(name, categoryId = null, teacher = teacherA) {
	const branch = categoryId ? { id: categoryId } : await makeBranch(teacher);
	return courseSvc.create({ name, description: null, category_id: branch.id }, teacher);
}

describe('one course per category branch (1:1 rule)', () => {
	it('refuses a course with no category structure of its own', async () => {
		const missing = await courseSvc.create({ name: 'Branch-less course' }, teacherA).catch((err) => err);
		expect(missing).toBeInstanceOf(ValidationError);
		expect(missing.fields.category_id[0]).toMatch(/needs its own category structure/i);
		const empty = await courseSvc.create({ name: 'Empty branch course', category_id: '' }, teacherA)
			.catch((err) => err);
		expect(empty).toBeInstanceOf(ValidationError);
		expect(await prisma.course.count({ where: { school_id: SCHOOL, name: 'Branch-less course' } })).toBe(0);
	});

	it('names the course that already owns the branch', async () => {
		const branch = await makeBranch();
		const first = await makeCourse('First on the branch', branch.id);
		const err = await courseSvc.create({ name: 'Second on the branch', category_id: branch.id }, teacherA)
			.catch((error) => error);
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fields.category_id[0]).toContain(first.name);
		expect(await prisma.course.count({ where: { school_id: SCHOOL, name: 'Second on the branch' } })).toBe(0);
	});

	it('refuses a sub-branch that sits inside another course', async () => {
		const root = await makeBranch();
		const child = await makeBranch(teacherA, root.id);
		const owner = await makeCourse('Whole-tree course', root.id);
		const err = await courseSvc.create({ name: 'Nested course', category_id: child.id }, teacherA)
			.catch((error) => error);
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fields.category_id[0]).toContain(owner.name);
		expect(err.fields.category_id[0]).toMatch(/sits inside the course/);
	});

	it('refuses a root whose subtree already holds another course', async () => {
		const root = await makeBranch();
		const child = await makeBranch(teacherA, root.id);
		const owner = await makeCourse('Leaf-level course', child.id);
		const err = await courseSvc.create({ name: 'Wrapping course', category_id: root.id }, teacherA)
			.catch((error) => error);
		expect(err).toBeInstanceOf(ValidationError);
		expect(err.fields.category_id[0]).toContain(owner.name);
		expect(err.fields.category_id[0]).toMatch(/already contains the course/);
	});

	it('links a branch-less course to a free branch and refuses a taken one', async () => {
		const course = await makeCourse('Course to relink');
		const free = await makeBranch();
		const taken = await makeBranch();
		const blocker = await makeCourse('Blocks the branch', taken.id);

		const linked = await courseSvc.update(course.id, { category_id: free.id }, teacherA);
		expect(String(linked.category_id)).toBe(String(free.id));
		// Re-asserting the link it already holds must not collide with itself.
		await expect(courseSvc.update(course.id, { category_id: free.id }, teacherA)).resolves.toBeTruthy();

		const shared = await courseSvc.update(course.id, { category_id: taken.id }, teacherA).catch((err) => err);
		expect(shared).toBeInstanceOf(ValidationError);
		expect(shared.fields.category_id[0]).toContain(blocker.name);
		await expect(courseSvc.update(course.id, { category_id: null }, teacherA)).rejects.toBeInstanceOf(ValidationError);
		const after = await courseSvc.getById(course.id);
		expect(String(after.category_id)).toBe(String(free.id));
	});

	it('leaves the branch (and its lessons\' categories) behind when a course is deleted', async () => {
		const branch = await makeBranch();
		const axe = await makeBranch(teacherA, branch.id);
		const course = await makeCourse('Doomed course', branch.id);
		await courseSvc.addLesson(course.id, { title: 'Lesson to cascade', category_id: axe.id }, teacherA);

		await courseSvc.delete(course.id, teacherA);
		expect(await prisma.category.count({ where: { id: { in: [branch.id, axe.id] } } })).toBe(2);
		expect(await prisma.lesson.count({ where: { course_id: course.id } })).toBe(0);
		expect(await prisma.question.count({ where: { category_id: axe.id } })).toBe(0);

		// The freed branch is claimable again: it now shows as a structure row.
		const revived = await makeCourse('New owner of the branch', branch.id);
		expect(String(revived.category_id)).toBe(String(branch.id));
	});
});

describe('teacher scoping', () => {
	it('lists only the teacher\'s own courses for that teacher', async () => {
		const mine = await makeCourse('Own course A');
		const theirs = await makeCourse('Foreign course B', null, teacherB);

		const asAuthor = await courseSvc.list(
			{ school_id: SCHOOL, created_by: teacherA.id },
			{ limit: 100 },
		);
		const ids = asAuthor.data.map((c) => String(c.id));
		expect(ids).toContain(String(mine.id));
		expect(ids).not.toContain(String(theirs.id));

		// Admins scope by school only, so both rows are visible.
		const asAdmin = await courseSvc.list({ school_id: SCHOOL }, { limit: 100 });
		expect(asAdmin.data.map((c) => String(c.id))).toEqual(
			expect.arrayContaining([String(mine.id), String(theirs.id)]),
		);
	});

	it('refuses updates, status changes and deletes on another teacher\'s course', async () => {
		const theirs = await makeCourse('Not yours', null, teacherB);
		await expect(courseSvc.update(theirs.id, { name: 'Hijacked' }, teacherA))
			.rejects.toBeInstanceOf(ForbiddenError);
		await expect(courseSvc.setStatus(theirs.id, 'published', teacherA))
			.rejects.toBeInstanceOf(ForbiddenError);
		await expect(courseSvc.delete(theirs.id, teacherA)).rejects.toBeInstanceOf(ForbiddenError);
		// …while the author (and an admin) may.
		await expect(courseSvc.setStatus(theirs.id, 'published', teacherB)).resolves.toMatchObject({
			status: 'published',
		});
		const admin = { id: 'user-test-admin', role: 'admin', school_id: SCHOOL };
		await expect(courseSvc.delete(theirs.id, admin)).resolves.toBeUndefined();
	});

	it('guards lesson mutations through the owning course', async () => {
		const course = await makeCourse('Lesson guard course');
		const lesson = await courseSvc.addLesson(course.id, { title: 'First lesson' }, teacherA);
		await expect(
			courseSvc.updateLesson(lesson.id, { title: 'Stolen' }, teacherB),
		).rejects.toBeInstanceOf(ForbiddenError);
		await expect(courseSvc.deleteLesson(lesson.id, teacherB)).rejects.toBeInstanceOf(ForbiddenError);
	});

	it('allows teachers to assign or clear a lesson category level', async () => {
		const course = await makeCourse('Lesson level course');
		const lesson = await courseSvc.addLesson(
			course.id,
			{ title: 'Lesson without a level' },
			teacherA,
		);

		const assigned = await courseSvc.updateLesson(
			lesson.id,
			{ category_id: tensId },
			teacherA,
		);
		expect(String(assigned.category_id)).toBe(String(tensId));

		const cleared = await courseSvc.updateLesson(
			lesson.id,
			{ category_id: null },
			teacherA,
		);
		expect(cleared.category_id).toBeNull();
	});

	it('nests lessons only under other lessons in the same course and prevents loops', async () => {
		const course = await makeCourse('Nested lesson course');
		const parent = await courseSvc.addLesson(
			course.id,
			{ title: 'Main title' },
			teacherA,
		);
		const child = await courseSvc.addLesson(
			course.id,
			{ title: 'Nested title', parent_lesson_id: parent.id },
			teacherA,
		);
		expect(String(child.parent_lesson_id)).toBe(String(parent.id));

		await expect(
			courseSvc.updateLesson(parent.id, { parent_lesson_id: child.id }, teacherA),
		).rejects.toBeInstanceOf(ValidationError);
		await expect(
			courseSvc.updateLesson(parent.id, { parent_lesson_id: parent.id }, teacherA),
		).rejects.toBeInstanceOf(ValidationError);

		const otherCourse = await makeCourse('Other nested lesson course');
		const outsideLesson = await courseSvc.addLesson(
			otherCourse.id,
			{ title: 'Outside lesson' },
			teacherA,
		);
		await expect(
			courseSvc.updateLesson(child.id, { parent_lesson_id: outsideLesson.id }, teacherA),
		).rejects.toBeInstanceOf(ValidationError);
	});
});

describe('generated course persistence', () => {
	it('persists the lesson skeleton in plan order with the server category mapping', async () => {
		const lessons = [
			{ title: 'Tens', summary: 'Adding tens', categoryId: tensId, order_index: 0 },
			{ title: 'Units', summary: 'Adding units', categoryId: unitsId, order_index: 1 },
			{ title: 'Wrapped up', summary: null, categoryId: tensId, order_index: 2 },
		];
		const branch = await makeBranch();
		const created = await courseSvc.createWithLessons(
			{ name: 'Addition course', description: null, categoryId: branch.id, lessons },
			teacherA,
		);
		const full = await courseSvc.getWithLessons(created.id, SCHOOL);
		expect(full.lessons.map((l) => l.title)).toEqual(['Tens', 'Units', 'Wrapped up']);
		expect(full.lessons.map((l) => l.order_index)).toEqual([0, 1, 2]);
		expect(full.lessons.every((l) => l.ai_generated === true)).toBe(true);
		expect(full.lessons.map((l) => String(l.category_id))).toEqual([
			String(tensId),
			String(unitsId),
			String(tensId),
		]);
		expect(full.status).toBe('draft');
		expect(String(full.created_by)).toBe(String(teacherA.id));
	});

	it('reorders lessons and closes the gap after a delete', async () => {
		const created = await courseSvc.createWithLessons(
			{
				name: 'Reorder course',
				categoryId: (await makeBranch()).id,
				lessons: [
					{ title: 'One', categoryId: tensId },
					{ title: 'Two', categoryId: unitsId },
					{ title: 'Three' },
				],
			},
			teacherA,
		);
		const before = await courseSvc.getWithLessons(created.id, SCHOOL);
		const three = before.lessons.find((l) => l.title === 'Three');
		const moved = await courseSvc.reorderLessons(created.id, [three.id, before.lessons[1].id, before.lessons[0].id], teacherA);
		expect(moved.lessons.map((l) => l.title)).toEqual(['Three', 'Two', 'One']);

		const two = moved.lessons.find((l) => l.title === 'Two');
		await courseSvc.deleteLesson(two.id, teacherA);
		const after = await courseSvc.getWithLessons(created.id, SCHOOL);
		expect(after.lessons.map((l) => l.title)).toEqual(['Three', 'One']);
		expect(after.lessons.map((l) => l.order_index)).toEqual([0, 1]);
	});
});

describe('AIService course generation', () => {
	it('builds one lesson per plan row and ignores a bogus categoryId from the model', async () => {
		const modelRows = [
			{ categoryId: 'not-a-real-category', title: '  Le des dizaines  ', summary: 'Add tens' },
			{ categoryId: String(unitsId), title: 'Les unités', summary: 'Add units' },
			{ categoryId: String(unitsId), title: '', summary: 'dropped — no title' },
		];
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({
					choices: [{ message: { content: '```json\n' + JSON.stringify(modelRows) + '\n```' } }],
				}),
				text: async () => '',
			})),
		);
		const ai = new AIService(repo, silentLogger);
		const plan = [
			{ categoryId: tensId, path: 'Math > Addition > Tens', questionCount: 1 },
			{ categoryId: unitsId, path: 'Math > Addition > Units', questionCount: 2 },
			{ categoryId: geometryId, path: 'Math > Geometry', questionCount: 0 },
		];
		const lessons = await ai.generateCourseOutline({
			config: { provider: 'openai', model_id: 'gpt-test', api_key: 'k' },
			courseName: 'Addition',
			language: 'French',
			plan,
		});
		// Row 3 is dropped (empty title) → two lessons, mapped positionally to
		// the SERVER plan, so no lesson ever points at a foreign category id.
		expect(lessons.map((l) => l.title)).toEqual(['Le des dizaines', 'Les unités']);
		expect(lessons.map((l) => String(l.categoryId))).toEqual([String(tensId), String(unitsId)]);
		expect(lessons.map((l) => l.order_index)).toEqual([0, 1]);
		vi.unstubAllGlobals('fetch');
	});

	it('keeps generated lessons in category-plan order when the model returns them out of order', async () => {
		const modelRows = [
			{ categoryId: String(unitsId), title: 'Units', summary: 'Units lesson' },
			{ categoryId: String(tensId), title: 'Tens', summary: 'Tens lesson' },
		];
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({
					choices: [{ message: { content: JSON.stringify(modelRows) } }],
				}),
				text: async () => '',
			})),
		);
		const ai = new AIService(repo, silentLogger);
		const lessons = await ai.generateCourseOutline({
			config: { provider: 'openai', model_id: 'gpt-test', api_key: 'k' },
			courseName: 'Addition',
			plan: [
				{ categoryId: tensId, path: 'Math > Addition > Tens', questionCount: 1 },
				{ categoryId: unitsId, path: 'Math > Addition > Units', questionCount: 2 },
			],
		});
		expect(lessons.map((lesson) => lesson.title)).toEqual(['Tens', 'Units']);
		expect(lessons.map((lesson) => lesson.order_index)).toEqual([0, 1]);
		vi.unstubAllGlobals('fetch');
	});

	it('writes lesson markdown from the provider and refuses an empty answer', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({ choices: [{ message: { content: '## Objectives\n- add tens' } }] }),
				text: async () => '',
			})),
		);
		const ai = new AIService(repo, silentLogger);
		const content = await ai.generateLessonContent({
			config: { provider: 'openai', model_id: 'gpt-test', api_key: 'k' },
			language: 'French',
			lesson: { title: 'Tens', summary: 'Add tens' },
			categoryPath: 'Math > Addition > Tens',
			questionDigest: ['30 + 40 = ?'],
			includeQuestions: true,
		});
		expect(content).toContain('## Objectives');

		// An empty provider answer must fail loudly instead of saving a blank
		// lesson body.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({ choices: [{ message: { content: '   ' } }] }),
				text: async () => '',
			})),
		);
		await expect(
			ai.generateLessonContent({
				config: { provider: 'openai', model_id: 'gpt-test', api_key: 'k' },
				lesson: { title: 'Tens' },
				categoryPath: 'x',
			}),
		).rejects.toBeInstanceOf(ValidationError);
		vi.unstubAllGlobals('fetch');
	});

	it('rejects an empty branch plan instead of generating a hollow course', async () => {
		const ai = new AIService(repo, silentLogger);
		await expect(
			ai.generateCourseOutline({
				config: { provider: 'openai', model_id: 'gpt-test' },
				courseName: 'Nothing',
				plan: [],
			}),
		).rejects.toBeInstanceOf(ValidationError);
	});
});

describe('branch plan (course generation input)', () => {
	it('keeps only leaf categories that hold questions, ordered by path', async () => {
		const plan = await courseSvc.buildBranchPlan(SCHOOL, mathId);
		expect(plan.map((p) => p.path)).toEqual([
			'Math-Courses > Addition-Courses > Tens-Courses',
			'Math-Courses > Addition-Courses > Units-Courses',
		]);
		expect(plan.map((p) => p.questionCount)).toEqual([1, 2]);
		expect(plan.every((p) => Array.isArray(p.questionTexts) && p.questionTexts.length)).toBe(true);

		// A leaf category is its own branch.
		const single = await courseSvc.buildBranchPlan(SCHOOL, tensId);
		expect(single).toHaveLength(1);
		expect(String(single[0].categoryId)).toBe(String(tensId));

		// maxLessons caps the skeleton (token guard).
		const capped = await courseSvc.buildBranchPlan(SCHOOL, mathId, { maxLessons: 1 });
		expect(capped).toHaveLength(1);

		// New course structures can generate lesson outlines before questions
		// have been added to their axes.
		const emptyByDefault = await courseSvc.buildBranchPlan(SCHOOL, geometryId);
		expect(emptyByDefault).toHaveLength(0);
		const includeEmpty = await courseSvc.buildBranchPlan(SCHOOL, geometryId, {
			includeEmptyCategories: true,
		});
		expect(includeEmpty).toMatchObject([{ categoryId: String(geometryId), questionCount: 0, questionTexts: [] }]);
	});

	it('throws for a category outside the school', async () => {
		await expect(courseSvc.buildBranchPlan('other-school', mathId)).rejects.toBeInstanceOf(
			NotFoundError,
		);
	});
});

describe('class assignment', () => {
	it('is idempotent and removal-aware', async () => {
		const course = await makeCourse('Assignment course');
		const first = await courseSvc.assignClasses(
			course.id,
			[String(classOne.id), String(classTwo.id), String(classOne.id)],
			teacherA,
		);
		expect(first.class_ids.length).toBe(2);
		expect(await prisma.courseClass.count({ where: { course_id: course.id } })).toBe(2);

		// Assigning the same set again must not duplicate junction rows.
		const again = await courseSvc.assignClasses(course.id, [String(classOne.id), String(classTwo.id)], teacherA);
		expect(again.class_ids.length).toBe(2);
		expect(await prisma.courseClass.count({ where: { course_id: course.id } })).toBe(2);

		const dropped = await courseSvc.assignClasses(course.id, [String(classTwo.id)], teacherA);
		expect(dropped.class_ids.map(String)).toEqual([String(classTwo.id)]);

		await expect(
			courseSvc.assignClasses(course.id, ['00000000-0000-4000-8000-000000000000'], teacherA),
		).rejects.toBeInstanceOf(ValidationError);
	});
});

describe('student visibility', () => {
	it('serves published courses assigned to the student class only', async () => {
		const draft = await makeCourse('Draft course');
		await courseSvc.assignClasses(draft.id, [String(classOne.id)], teacherA);

		const live = await makeCourse('Published course');
		await courseSvc.setStatus(live.id, 'published', teacherA);
		await courseSvc.assignClasses(live.id, [String(classOne.id)], teacherA);

		const otherClass = await makeCourse('Other class course');
		await courseSvc.setStatus(otherClass.id, 'published', teacherA);
		await courseSvc.assignClasses(otherClass.id, [String(classTwo.id)], teacherA);

		const studentUser = await prisma.user.create({
			data: {
				school_id: SCHOOL, class_id: classOne.id, username: 'student-courses-1',
				name: 'Student One', password_hash: 'x', role: 'student', status: 'active',
			},
		});
		const student = { id: studentUser.id, role: 'student', school_id: SCHOOL };

		const visible = await courseSvc.listForStudent(student);
		const names = visible.map((c) => c.name);
		expect(names).toContain('Published course');
		expect(names).not.toContain('Draft course');
		expect(names).not.toContain('Other class course');

		// Draft and foreign-class courses are simply not found for the student.
		await expect(courseSvc.getForStudent(draft.id, student)).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			courseSvc.getForStudent(otherClass.id, student),
		).rejects.toBeInstanceOf(NotFoundError);

		// Opening the live course hands the student its lessons in order.
		await courseSvc.addLesson(live.id, { title: 'Tens lesson', content: '## Objectives' }, teacherA);
		const opened = await courseSvc.getForStudent(live.id, student);
		expect(opened.lessons.map((l) => l.title)).toEqual(['Tens lesson']);
		expect(opened.lessons[0].content).toContain('## Objectives');
	});

	it('orders student lessons by the course category tree and exposes their category path', async () => {
		// Math is this course's own branch: the student view is built from it.
		const course = await makeCourse('Tree-ordered course', mathId);
		await courseSvc.setStatus(course.id, 'published', teacherA);
		await courseSvc.assignClasses(course.id, [String(classOne.id)], teacherA);
		await courseSvc.addLesson(course.id, {
			title: 'Units lesson',
			category_id: unitsId,
			order_index: 0,
		}, teacherA);
		await courseSvc.addLesson(course.id, {
			title: 'Tens lesson',
			category_id: tensId,
			order_index: 1,
		}, teacherA);
		const studentUser = await prisma.user.create({
			data: {
				school_id: SCHOOL,
				class_id: classOne.id,
				username: 'student-course-tree-order',
				name: 'Tree Order Student',
				password_hash: 'x',
				role: 'student',
				status: 'active',
			},
		});
		const student = { id: studentUser.id, role: 'student', school_id: SCHOOL };

		const opened = await courseSvc.getForStudent(course.id, student);
		expect(opened.lessons.map((lesson) => lesson.title)).toEqual(['Tens lesson', 'Units lesson']);
		expect(opened.lessons[0].category_levels.map((level) => level.name)).toEqual([
			'Math-Courses',
			'Addition-Courses',
			'Tens-Courses',
		]);
		expect(opened.category_structure.name).toBe('Math-Courses');
		const additionNode = opened.category_structure.children.find((node) => node.name === 'Addition-Courses');
		expect(additionNode.children.map((node) => node.name)).toEqual([
			'Tens-Courses',
			'Units-Courses',
		]);
		expect(additionNode.children[0].lesson.title).toBe('Tens lesson');
		expect(additionNode.children[1].lesson.title).toBe('Units lesson');
		expect(opened.category_structure.children.some((node) => node.name === 'Geometry-Courses')).toBe(true);
	});

	it('gates lesson practice on the same visibility rule', async () => {
		const course = await makeCourse('Practice gate course');
		await courseSvc.setStatus(course.id, 'published', teacherA);
		const lesson = await courseSvc.addLesson(
			course.id,
			{ title: 'Tens practice', category_id: tensId, content: 'body' },
			teacherA,
		);
		const studentUser = await prisma.user.create({
			data: {
				school_id: SCHOOL, class_id: classTwo.id, username: 'student-courses-2',
				name: 'Student Two', password_hash: 'x', role: 'student', status: 'active',
			},
		});
		const outsider = { id: studentUser.id, role: 'student', school_id: SCHOOL };
		await expect(courseSvc.getLessonForStudent(lesson.id, outsider)).rejects.toBeInstanceOf(
			NotFoundError,
		);
		await courseSvc.assignClasses(course.id, [String(classTwo.id)], teacherA);
		await expect(courseSvc.getLessonForStudent(lesson.id, outsider)).resolves.toMatchObject({
			id: lesson.id,
		});

		// The practice set is the leaf category's live questions, answers stripped.
		const questions = await courseSvc.getQuestionsForCategory(SCHOOL, tensId);
		expect(questions).toHaveLength(1);
		const view = toStudentPracticeView(questions[0]);
		expect(view.answer).toBeUndefined();
		expect(view.explanation).toBeUndefined();
		expect(view.school_id).toBeUndefined();
		expect(view.options).toEqual(['70', '60', '80']);
		expect(view.question).toBe('30 + 40 = ?');

		const multi = await courseSvc.getQuestionsForCategory(SCHOOL, unitsId);
		const multiView = toStudentPracticeView(multi.find((q) => String(q.answer).startsWith('multi::')));
		expect(multiView.allowMultipleAnswers).toBe(true);
		expect(multiView.answer).toBeUndefined();
	});
});
