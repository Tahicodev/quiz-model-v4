// @vitest-environment jsdom

/**
 * tests/unit/student-course-outline.test.js
 *
 * The student course reader numbers the outline the way the teacher's
 * category structure is ordered, badges every lesson card with its number,
 * and lets the student fold the Learning goals panel open and shut again.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../student-courses.js';

const MODULE = 'module-1';
const CHAPTER_A = 'chapter-a';
const CHAPTER_B = 'chapter-b';

function buildCourse() {
	return {
		id: 'course-1',
		category_id: MODULE,
		name: 'Module 1',
		description: 'Course description',
		lessons: [
			{
				id: 'lesson-a1',
				category_id: CHAPTER_A,
				title: 'First lesson of chapter A',
				summary: 'Summary A1',
				content: '## Intro\nBody A1.',
				objectives: ['Objective A1'],
				key_concepts: ['Concept A1'],
			},
			{
				id: 'lesson-b1',
				category_id: CHAPTER_B,
				title: 'First lesson of chapter B',
				summary: 'Summary B1',
				content: '## Intro\nBody B1.',
				objectives: ['Objective B1'],
				key_concepts: ['Concept B1'],
			},
		],
		category_structure: {
			id: MODULE,
			name: 'Module 1',
			children: [
				{
					id: CHAPTER_A,
					name: 'Chapter A',
					children: [],
					lesson: { id: 'lesson-a1' },
					lessons: [{ id: 'lesson-a1' }],
				},
				{
					id: CHAPTER_B,
					name: 'Chapter B',
					children: [],
					lesson: { id: 'lesson-b1' },
					lessons: [{ id: 'lesson-b1' }],
				},
			],
			lesson: null,
			lessons: [],
		},
		unlinked_lessons: [],
	};
}

describe('student course outline numbering', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="studentCourseGrid"></div><div id="studentCourseReader"></div>';
		const course = buildCourse();
		window.API = {
			raw: vi.fn(async (_method, path) => {
				if (path === '/courses/student') return { data: [] };
				if (path === '/courses/student/course-1') return course;
				throw new Error(`Unexpected request: ${path}`);
			}),
		};
	});

	it('numbers the outline cards in the structure order', async () => {
		await window.StudentCourses.openCourse('course-1');
		const reader = document.getElementById('studentCourseReader');
		const numbers = [...reader.querySelectorAll('.course-outline-number')].map(
			(node) => node.textContent,
		);
		expect(numbers).toEqual(['1', '2']);

		const names = [...reader.querySelectorAll('.course-outline-name')].map(
			(node) => node.textContent,
		);
		expect(names).toEqual(['Chapter A', 'Chapter B']);
	});

	it('keeps the level chip separate from the ordinal', async () => {
		await window.StudentCourses.openCourse('course-1');
		const reader = document.getElementById('studentCourseReader');
		expect(reader.querySelector('.course-outline-level').textContent).toBe('Chapter');
	});

	it('badges the lesson cards of a chapter with their number', async () => {
		await window.StudentCourses.openCourse('course-1');
		window.StudentCourses.openChapter(CHAPTER_A);
		const reader = document.getElementById('studentCourseReader');
		const badges = [...reader.querySelectorAll('.course-lesson-number')].map(
			(node) => node.textContent,
		);
		expect(badges).toEqual(['1']);
	});
});

describe('student Learning goals toggle', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="studentCourseGrid"></div><div id="studentCourseReader"></div>';
		const course = buildCourse();
		// Enough goals that the collapsed panel hides some of them.
		course.lessons[0].objectives = ['O1', 'O2', 'O3', 'O4', 'O5', 'O6'];
		course.lessons[0].key_concepts = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
		window.API = {
			raw: vi.fn(async (_method, path) => {
				if (path === '/courses/student') return { data: [] };
				if (path === '/courses/student/course-1') return course;
				throw new Error(`Unexpected request: ${path}`);
			}),
		};
	});

	it('offers a toggle when goals are hidden', async () => {
		await window.StudentCourses.openCourse('course-1');
		const reader = document.getElementById('studentCourseReader');
		const toggle = reader.querySelector('.course-highlights-toggle');
		expect(toggle).not.toBeNull();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(toggle.textContent).toContain('Show all');
	});

	it('expands and collapses the goals on each click', async () => {
		await window.StudentCourses.openCourse('course-1');
		const reader = document.getElementById('studentCourseReader');
		const section = reader.querySelector('.course-highlights');
		const toggle = reader.querySelector('.course-highlights-toggle');

		window.StudentCourses.toggleHighlights(MODULE, toggle);
		expect(section.dataset.expanded).toBe('true');
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(toggle.textContent).toContain('Show fewer');

		window.StudentCourses.toggleHighlights(MODULE, toggle);
		expect(section.dataset.expanded).toBe('false');
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(toggle.textContent).toContain('Show all');
	});

	it('marks the truncated lists so the CSS can fold them', async () => {
		await window.StudentCourses.openCourse('course-1');
		const reader = document.getElementById('studentCourseReader');
		const lists = [...reader.querySelectorAll('.course-highlights-list')];
		expect(lists.length).toBe(2);
		expect(lists.every((list) => list.classList.contains('course-highlights-list--truncated'))).toBe(true);
	});
});
