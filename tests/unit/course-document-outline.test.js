import { describe, expect, it } from 'vitest';
import { renderCourseDocument } from '../../src/backend/services/courseDocumentRenderer.js';
import { zipText } from './helpers/examDocZip.js';

describe('nested course lesson documents', () => {
	it('exports parent and child lesson titles at their nested Word heading levels', async () => {
		const { buffer } = await renderCourseDocument(
			{
				name: 'Course outline',
				lessons: [
					{ id: 'parent', title: 'Main title', order_index: 0 },
					{
						id: 'child',
						title: 'Nested title',
						parent_lesson_id: 'parent',
						order_index: 1,
					},
					{
						id: 'grandchild',
						title: 'Nested subsection',
						parent_lesson_id: 'child',
						order_index: 2,
					},
				],
			},
			{
				format: 'docx',
				templateId: 'classique',
				headerLayout: 'bandeau',
				includeCover: false,
				includeTableOfContents: false,
				startEachLessonOnNewPage: false,
				header: {},
			},
		);
		const xml = zipText(buffer, 'word/document.xml');
		const parentIndex = xml.indexOf('Main title');
		const childIndex = xml.indexOf('Nested title');
		const grandchildIndex = xml.indexOf('Nested subsection');

		expect(parentIndex).toBeGreaterThan(-1);
		expect(childIndex).toBeGreaterThan(parentIndex);
		expect(grandchildIndex).toBeGreaterThan(childIndex);
		expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
		expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
		expect(xml).toContain('<w:pStyle w:val="Heading3"/>');
	});
});
