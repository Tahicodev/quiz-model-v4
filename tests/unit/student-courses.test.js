// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../student-courses.js';

describe('student course structure', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="studentCourseGrid"></div><div id="studentCourseReader"></div>';
		const course = {
			id: 'course-1',
			category_id: 'module-1',
			name: 'Module 1',
			description: 'Course description',
			lessons: [{
				id: 'section-1',
				category_id: 'axis-1',
				title: 'AI-generated lesson title',
				summary: 'Section summary',
				content: '## Introduction\nThe section content.',
				objectives: ['Identifier le vocabulaire de base'],
				key_concepts: ['Information', 'Donnée'],
				category_levels: [
					{ id: 'module-1', name: 'Module 1 : Généralités sur les systèmes informatiques' },
					{ id: 'subcategory-1', name: '1- vocabulaire de base' },
					{ id: 'axis-1', name: 'Information (en informatique)' },
				],
			}],
			category_structure: {
				id: 'module-1',
				name: 'Module 1 : Généralités sur les systèmes informatiques',
				children: [{
					id: 'subcategory-1',
					name: '1- vocabulaire de base',
					children: [{
						id: 'axis-1',
						name: 'Information (en informatique)',
						children: [],
						lesson: { id: 'section-1' },
						lessons: [{ id: 'section-1' }],
					}],
					lesson: null,
					lessons: [],
				}],
				lesson: null,
				lessons: [],
			},
			unlinked_lessons: [],
		};
		window.API = {
			raw: vi.fn(async (_method, path) => {
				if (path === '/courses/student') return { data: [] };
				if (path === '/courses/student/course-1') return course;
				throw new Error(`Unexpected request: ${path}`);
			}),
		};
	});

	it('opens the course outline, then the chapter lessons and lesson content', async () => {
		await window.StudentCourses.openCourse('course-1');

		const reader = document.getElementById('studentCourseReader');
		// Course view: course name, aggregated goals and one chapter card.
		expect(reader.querySelector('.course-document-cover h1').textContent).toBe('Module 1');
		expect(reader.querySelector('.course-outline-grid').textContent).toContain('1- vocabulaire de base');
		// Chapter cards now carry their ordinal so students see the order.
		expect(reader.querySelector('.course-outline-level').textContent).toBe('Chapter');
		expect(reader.querySelector('.course-outline-number').textContent).toBe('1');
		expect(reader.querySelector('.course-highlights').textContent).toContain('Identifier le vocabulaire de base');
		expect(reader.querySelector('.course-highlights').textContent).toContain('Information');

		// Chapter view: its own highlights panel and the lesson card.
		window.StudentCourses.openChapter('subcategory-1');
		expect(reader.querySelector('.course-view-breadcrumb').textContent).toContain('1- vocabulaire de base');
		expect(reader.querySelector('.course-highlights').textContent).toContain('Identifier le vocabulaire de base');
		expect(reader.querySelector('.course-lesson-card h3').textContent).toBe('AI-generated lesson title');
		expect(reader.querySelector('.course-lesson-kicker').textContent).toBe('Information (en informatique)');

		// Lesson view: rendered markdown body + practice action.
		window.StudentCourses.openLesson('section-1');
		expect(reader.querySelector('.course-document-cover h1').textContent).toBe('AI-generated lesson title');
		expect(reader.querySelector('.course-document-body').textContent).toContain('The section content.');
		expect(reader.querySelector('.course-lesson-actions button').textContent).toBe('Practice this lesson');

		window.StudentCourses.backToChapter();
		expect(reader.querySelector('.course-view-breadcrumb').textContent).toContain('1- vocabulaire de base');
		window.StudentCourses.backToCourse();
		expect(reader.querySelector('.course-outline-grid')).not.toBeNull();
	});

	it('renders course cards with clear section counts and keyboard-friendly actions', async () => {
		window.API.raw = vi.fn(async () => ({
			data: [
				{ id: 'course-1', name: 'Module 1', description: 'Course description', lesson_count: 1 },
				{ id: 'course-2', name: 'Module 2', lesson_count: 0 },
			],
		}));

		await window.StudentCourses.load(true);

		const cards = [...document.querySelectorAll('.course-student-card')];
		expect(cards).toHaveLength(2);
		expect(cards[0].getAttribute('role')).toBe('button');
		expect(cards[0].getAttribute('tabindex')).toBe('0');
		expect(cards[0].dataset.courseTone).toBe('0');
		expect(cards[0].textContent).toContain('1 section');
		expect(cards[0].textContent).toContain('Open course');
		expect(cards[1].textContent).toContain('0 sections');
	});

	it('falls back to the lesson paths when the course has no category structure', async () => {
		window.API.raw = vi.fn(async (_method, path) => {
			if (path === '/courses/student/plain-course') {
				return {
					id: 'plain-course',
					name: 'Module 2',
					lessons: [
						{
							id: 'lesson-one',
							category_id: 'leaf-category',
							title: 'First section',
							summary: 'A helpful course summary.',
							content: 'First lesson content.',
							category_levels: [
								{ id: 'root-category', name: 'Module 2' },
								{ id: 'leaf-category', name: 'First topic' },
							],
						},
						{
							id: 'lesson-two',
							title: 'Second section',
							content: 'Second lesson content.',
						},
					],
				};
			}
			throw new Error(`Unexpected request: ${path}`);
		});

		await window.StudentCourses.openCourse('plain-course');

		const reader = document.getElementById('studentCourseReader');
		expect(reader.querySelector('.course-document-cover h1').textContent).toBe('Module 2');
		expect(reader.querySelector('.course-document-overview').textContent).toContain('A helpful course summary.');
		expect(reader.querySelector('.course-document-cover-top').textContent).toContain('All courses');
		expect(reader.querySelector('.course-document-cover-top').textContent).toContain('Course content');
		const cards = [...reader.querySelectorAll('.course-lesson-card h3')];
		expect(cards.map((item) => item.textContent)).toEqual(['First section', 'Second section']);
		expect([...reader.querySelectorAll('.course-lesson-kicker')].map((item) => item.textContent)).toEqual([
			'First topic',
		]);

		window.StudentCourses.openChapter('leaf-category');
		expect(reader.querySelector('.course-lesson-card h3').textContent).toBe('First section');
		window.StudentCourses.openLesson('lesson-one');
		expect(reader.querySelector('.course-document-body').textContent).toContain('First lesson content.');

		window.StudentCourses.backToCourse();
		window.StudentCourses.openLesson('lesson-two');
		expect(reader.querySelector('.course-document-body').textContent).toContain('Second lesson content.');
	});
});