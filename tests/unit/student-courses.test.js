// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../student-courses.js';

describe('student course structure', () => {
	beforeEach(() => {
		document.body.innerHTML = '<div id="studentCourseGrid"></div><div id="studentCourseReader"></div>';
		const course = {
			id: 'course-1',
			name: 'Module 1',
			description: 'Course description',
			lessons: [{
				id: 'section-1',
				title: 'AI-generated lesson title',
				summary: 'Section summary',
				content: 'The section content.',
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

	it('shows matching category hierarchies in contents and section content', async () => {
		await window.StudentCourses.openCourse('course-1');

		const reader = document.getElementById('studentCourseReader');
		const toc = reader.querySelector('.course-document-toc');
		const content = reader.querySelector('.course-document-body');
		const expectedNames = [
			'Module 1 : Généralités sur les systèmes informatiques',
			'1- vocabulaire de base',
			'Information (en informatique)',
		];

		for (const name of expectedNames) {
			expect(toc.textContent).toContain(name);
			expect(content.textContent).toContain(name);
		}
		expect(toc.querySelector('ol ol ol')).not.toBeNull();
		expect(toc.querySelector('a[href="#student-course-category-axis-1"]')).not.toBeNull();

		const axis = content.querySelector('#student-course-category-axis-1');
		expect(axis.querySelector('.course-document-lesson').textContent).toContain('The section content.');
		expect(axis.querySelector('.course-document-lesson').textContent).not.toContain('AI-generated lesson title');
		expect(axis.querySelector('button').textContent).toBe('Practice this section');
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

	it('keeps summary, contents, and lesson content consistent without category structure', async () => {
		window.API.raw = vi.fn(async (_method, path) => {
			if (path === '/courses/student/plain-course') {
				return {
					id: 'plain-course',
					name: 'Module 2',
					lessons: [
						{
							id: 'lesson-one',
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
		expect(reader.querySelector('.course-document-toc h2').textContent).toBe('Summary and contents');
		expect(reader.querySelector('.course-document-overview').textContent).toContain('A helpful course summary.');
		expect(reader.querySelector('.course-document-cover-top').textContent).toContain('All courses');
		expect(reader.querySelector('.course-document-cover-top').textContent).toContain('Course content');
		expect(reader.querySelector('.course-document-toc').textContent).toContain('First topic');
		expect([...reader.querySelectorAll('.course-document-toc a strong')].map((item) => item.textContent)).toEqual([
			'Module 2',
			'First topic',
			'Second section',
		]);
		expect(reader.querySelector('.course-document-body').textContent).toContain('First lesson content.');
		expect(reader.querySelector('.course-document-body').textContent).toContain('Second lesson content.');
		expect(reader.querySelector('.course-document-toc a[href="#student-course-category-leaf-category"]')).not.toBeNull();
	});
});
