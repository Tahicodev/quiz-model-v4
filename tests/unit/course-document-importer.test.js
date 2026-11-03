import { describe, expect, it } from 'vitest';
import PDFDocument from 'pdfkit';
import { Document, HeadingLevel, Packer, Paragraph } from 'docx';
import {
	buildCourseImportSections,
	detectCourseDocumentHeadings,
	detectCourseDocumentOutline,
	extractCourseDocumentText,
	MAX_IMPORTED_SECTION_LENGTH,
} from '../../src/backend/services/courseDocumentImporter.js';

async function makePdf(text) {
	const pdf = new PDFDocument();
	const chunks = [];
	const completed = new Promise((resolve, reject) => {
		pdf.on('data', (chunk) => chunks.push(chunk));
		pdf.on('end', () => resolve(Buffer.concat(chunks)));
		pdf.on('error', reject);
	});
	pdf.text(text);
	pdf.end();
	return completed;
}

describe('course document extraction', () => {
	it('extracts readable text from DOCX and text-based PDF', async () => {
		const word = new Document({
			sections: [{
				children: [
					new Paragraph({ text: 'Module 1', heading: HeadingLevel.HEADING_1 }),
					new Paragraph('First section content.'),
				],
			}],
		});
		const docx = await Packer.toBuffer(word);
		const pdf = await makePdf('Module 1\nFirst section content.');

		await expect(extractCourseDocumentText(docx, 'course.docx'))
			.resolves.toContain('First section content.');
		await expect(extractCourseDocumentText(pdf, 'course.pdf'))
			.resolves.toContain('First section content.');
	});

	it('rejects image-only PDFs with a clear message', async () => {
		const pdf = await makePdf('');
		await expect(extractCourseDocumentText(pdf, 'scanned.pdf'))
			.rejects.toMatchObject({
				fields: {
					file: [expect.stringContaining('Scanned/image-only PDFs are not supported')],
				},
			});
	});

	it('partitions every source line into the intro or its exact heading section', () => {
		const documentText = [
			'Course introduction',
			'Module 1',
			'Module context',
			'1. Basics',
			'Subcategory context',
			'Information',
			'Information body',
			'Communication',
			'Communication body',
			'Module 2',
			'Final section text',
		].join('\n');
		const result = buildCourseImportSections(documentText, [
			{ line: 2, level: 1, title: 'Module 1' },
			{ line: 4, level: 2, title: '1. Basics' },
			{ line: 6, level: 3, title: 'Information' },
			{ line: 8, level: 3, title: 'Communication' },
			{ line: 10, level: 1, title: 'Module 2' },
		]);

		expect(result.introduction).toBe('Course introduction');
		expect(result.roots).toMatchObject([
			{
				title: 'Module 1',
				content: 'Module context',
				children: [{
					title: '1. Basics',
					content: 'Subcategory context',
					children: [
						{ title: 'Information', content: 'Information body' },
						{ title: 'Communication', content: 'Communication body' },
					],
				}],
			},
			{ title: 'Module 2', content: 'Final section text' },
		]);

		const retained = [
			result.introduction,
			...result.roots.flatMap((root) => [
				root.content,
				...root.children.flatMap((child) => [
					child.content,
					...child.children.map((leaf) => leaf.content),
				]),
			]),
		].filter(Boolean).join('\n');
		expect(retained).toBe([
			'Course introduction',
			'Module context',
			'Subcategory context',
			'Information body',
			'Communication body',
			'Final section text',
		].join('\n'));
	});

	it('rejects sections that exceed the app lesson content limit instead of truncating them', () => {
		const text = `Heading\n${'x'.repeat(MAX_IMPORTED_SECTION_LENGTH + 1)}`;
		let error;
		try {
			buildCourseImportSections(text, [{ line: 1, level: 1, title: 'Heading' }]);
		} catch (caught) {
			error = caught;
		}
		expect(error?.fields?.headings?.[0]).toContain('per-section limit');
	});
});

describe('local course outline detection', () => {
	it('detects a numbered category, subcategory and axis from extracted PDF text', () => {
		const text = [
			'Module 1 : Généralités sur les systèmes informatiques',
			'Overview and context.',
			'1- vocabulaire de base',
			'The core terms are explained here.',
			'1.1 Information (en informatique)',
			'Information body.',
			'1.2 Communication',
			'Communication body.',
		].join('\n');

		expect(detectCourseDocumentHeadings(text)).toEqual([
			{ line: 1, level: 1 },
			{ line: 3, level: 2 },
			{ line: 5, level: 3 },
			{ line: 7, level: 3 },
		]);
	});

	it('preserves Heading 4 as an axis under the three category levels', () => {
		const result = buildCourseImportSections('Main\nSub\nDetail\nAxis\nAxis content', [
			{ line: 1, level: 1, title: 'Main' },
			{ line: 2, level: 2, title: 'Sub' },
			{ line: 3, level: 3, title: 'Detail' },
			{ line: 4, level: 4, title: 'Axis' },
		]);
		expect(result.roots[0].children[0].children[0].children[0]).toMatchObject({
			title: 'Axis',
			content: 'Axis content',
		});
	});

	it('rejects skipped levels so imported category trees remain unambiguous', () => {
		let error;
		try {
			buildCourseImportSections('Main\nAxis', [
			{ line: 1, level: 1, title: 'Main' },
			{ line: 2, level: 4, title: 'Axis' },
			]);
		} catch (caught) {
			error = caught;
		}
		expect(error?.fields?.headings?.[0]).toContain('intermediate heading level');
	});

	it('uses DOCX heading styles and keeps source line references', async () => {
		const document = new Document({
			sections: [{
				children: [
					new Paragraph({ text: 'Module 1', heading: HeadingLevel.HEADING_1 }),
					new Paragraph('Module introduction.'),
					new Paragraph({ text: 'Basics', heading: HeadingLevel.HEADING_2 }),
					new Paragraph('Definitions.'),
					new Paragraph({ text: 'Information', heading: HeadingLevel.HEADING_3 }),
					new Paragraph('Information content.'),
				],
			}],
		});
		const buffer = await Packer.toBuffer(document);
		const text = await extractCourseDocumentText(buffer, 'course.docx');
		const result = await detectCourseDocumentOutline(buffer, 'course.docx', text);

		expect(result.method).toBe('docx-styles-and-local-patterns');
		expect(result.headings).toEqual([
			{ line: 1, level: 1 },
			{ line: 5, level: 2 },
			{ line: 9, level: 3 },
		]);
	});

	it('returns no headings rather than guessing when local patterns are absent', async () => {
		const text = 'An introductory paragraph without structural headings.';
		expect(detectCourseDocumentHeadings(text)).toEqual([]);
		await expect(detectCourseDocumentOutline(Buffer.alloc(0), 'course.pdf', text))
			.resolves.toEqual({ headings: [], method: 'local-patterns' });
	});
});
