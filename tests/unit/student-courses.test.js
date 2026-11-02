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
});
