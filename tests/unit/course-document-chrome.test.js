/**
 * tests/unit/course-document-chrome.test.js
 *
 * Structure pass on course documents:
 *  • the cover renders the general information as a Label/Value table under a
 *    big centred course title (same treatment as the prep sheets);
 *  • every page carries a running header (teacher · school year) and a footer
 *    (course name + page number) — in Word via real <w:tab/> jumps to a right
 *    tab stop, never a literal '\t' inside <w:t>;
 *  • the two added cover templates ('elegant', 'minimal') render in both
 *    formats and the schema accepts them;
 *  • the PDF page chrome never spawns blank pages (footer/header are stamped
 *    inside the margins with the maxY workaround).
 */

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { renderCourseDocument } from '../../src/backend/services/courseDocumentRenderer.js';
import { CourseDocumentSchema } from '../../src/shared/schemas/courseDocument.schema.js';

const course = {
	name: 'Sciences de la vie',
	description: 'Cours complet pour la 2ème VMST.',
	lessons: [
		{ id: 'l1', title: 'La cellule', order_index: 0, content: 'Introduction a la cellule.' },
		{ id: 'l2', title: 'La genetique', order_index: 1, content: 'Les bases de la genetique.' },
	],
};

const header = {
	schoolName: 'Lycée Ibn Sina',
	teacherName: 'M. Tahic',
	subject: 'SVT',
	level: '2eme VMST',
	group: 'Groupe A',
	academicYear: '2025-2026',
	date: '2026-11-06',
};

const baseOptions = (format, extra = {}) => ({
	format,
	templateId: 'classique',
	numerationTemplate: 'default',
	coverTemplate: 'academic',
	headerLayout: 'bandeau',
	includeCover: true,
	includeTableOfContents: true,
	startEachLessonOnNewPage: false,
	header,
	...extra,
});

const zipParts = async (buffer, pattern) => {
	const zip = await JSZip.loadAsync(buffer);
	const names = Object.keys(zip.files).filter((name) => pattern.test(name));
	return (await Promise.all(names.map((name) => zip.file(name).async('string')))).join('');
};

describe('course document docx — cover structure', () => {
	it('renders the general information as a table with a DOCUMENT IDENTITY grid', async () => {
		const { buffer } = await renderCourseDocument(course, baseOptions('docx'));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		expect(xml).toContain('DOCUMENT IDENTITY');
		expect(xml).toContain('<w:tbl>');
		expect(xml).toContain('Ibn Sina');
		// big centred title on the cover
		expect(xml).toContain('Sciences de la vie');
	});

	it('uses a different-first-page setup so the cover keeps its rich header', async () => {
		const { buffer } = await renderCourseDocument(course, baseOptions('docx'));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		expect(xml).toContain('<w:titlePg');
	});
});

describe('course document docx — running header & footer', () => {
	it('teacher + school year ride the running header, course name + page number the footer', async () => {
		const { buffer } = await renderCourseDocument(course, baseOptions('docx'));
		const chrome = await zipParts(buffer, /^word\/(header|footer)\d+\.xml$/);
		expect(chrome).toContain('M. Tahic');
		expect(chrome).toContain('2025-2026');
		expect(chrome).toContain('Sciences de la vie');
		// real page fields, not literal text
		expect(chrome).toMatch(/PAGE/);
		expect(chrome).toMatch(/NUMPAGES/);
		// tabs are real <w:tab/> elements — a literal '\t' in <w:t> never jumps
		expect(chrome).toContain('<w:tab/>');
		expect(chrome).not.toMatch(/<w:t[^>]*>[^<]*\t/);
	});

	it('without a cover every page (including the first) gets the running header', async () => {
		const { buffer } = await renderCourseDocument(course, baseOptions('docx', { includeCover: false }));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		// no separate first-page header — the running header applies from page 1
		expect(xml).not.toMatch(/<w:headerReference w:type="first"/);
		const headers = await zipParts(buffer, /^word\/header\d+\.xml$/);
		expect(headers).toContain('M. Tahic');
	});
});

describe('course document — TOC polish', () => {
	it('contents page keeps its title, numbers its entries and drops the redundant body label', async () => {
		const { buffer } = await renderCourseDocument(course, baseOptions('docx', { numerationTemplate: 'decimal' }));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		expect(xml).toContain('Contents');
		expect(xml).toContain('La cellule');
		// the redundant "Course material" divider heading is gone
		expect(xml).not.toContain('Course material');
		expect(xml).not.toContain('COURSE MATERIAL');
	});
});

describe('course document — lesson path toggle', () => {
	// A lesson filed under a two-level category renders a breadcrumb that
	// formatPath joins with a "  /  " separator — a string that appears
	// nowhere else, so it is a clean signal for the small path line.
	const nestedCourse = {
		name: 'Sciences de la vie',
		lessons: [
			{
				id: 'l1',
				title: 'La cellule',
				order_index: 0,
				content: 'Introduction a la cellule.',
				category_levels: [{ id: 'c1', name: 'Organisation du vivant' }, { id: 'c2', name: 'La cellule' }],
			},
		],
	};
	it('omits the tiny lesson path by default and shows it when requested', async () => {
		const withPath = await renderCourseDocument(nestedCourse, baseOptions('docx', { includeLessonPath: true }));
		const xmlWithPath = await zipParts(withPath.buffer, /^word\/document\.xml$/);
		expect(xmlWithPath).toContain('  /  ');
		const noPath = await renderCourseDocument(nestedCourse, baseOptions('docx'));
		const xmlNoPath = await zipParts(noPath.buffer, /^word\/document\.xml$/);
		expect(xmlNoPath).not.toContain('  /  ');
	});
});

describe('course document — cover page keeps no footer', () => {
	it('gives the cover an empty first-page footer in docx', async () => {
		const { buffer } = await renderCourseDocument(course, baseOptions('docx'));
		const zip = await JSZip.loadAsync(buffer);
		const footerNames = Object.keys(zip.files).filter((n) => /^word\/footer\d+\.xml$/.test(n));
		// the running footer keeps the page number; the cover footer is empty
		const footers = await Promise.all(footerNames.map((n) => zip.file(n).async('string')));
		expect(footers.some((f) => /PAGE/.test(f))).toBe(true);
		expect(footers.some((f) => !/PAGE/.test(f) && !/of /.test(f))).toBe(true);
	});
});

describe('course document — new numeration templates', () => {
	for (const numerationTemplate of ['progressif', 'academique']) {
		it(`"${numerationTemplate}" renders in docx and pdf`, async () => {
			const docx = await renderCourseDocument(course, baseOptions('docx', { numerationTemplate }));
			const xml = await zipParts(docx.buffer, /^word\/document\.xml$/);
			expect(xml).toContain('Contents');
			const pdf = await renderCourseDocument(course, baseOptions('pdf', { numerationTemplate }));
			expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
		});
	}

	it('the schema accepts the new templates and the lesson-path flag', () => {
		const parsed = CourseDocumentSchema.safeParse({
			format: 'docx',
			numerationTemplate: 'academique',
			includeLessonPath: true,
			header: {},
		});
		expect(parsed.success).toBe(true);
		expect(parsed.data?.includeLessonPath).toBe(true);
	});
});

describe('course document pdf — page chrome', () => {
	const pageCount = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

	it('stamps header and footer inside the margins without spawning blank pages', async () => {
		const { buffer } = await renderCourseDocument(course, baseOptions('pdf'));
		expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
		const pages = pageCount(buffer);
		// cover + contents + lessons — compact, and NOT doubled by footer stamps
		expect(pages).toBeGreaterThanOrEqual(2);
		expect(pages).toBeLessThanOrEqual(8);
	});
});

describe('course document — cover templates', () => {
	const covers = ['academic', 'modern', 'book', 'university', 'elegant', 'minimal'];
	for (const coverTemplate of covers) {
		it(`"${coverTemplate}" renders in docx and pdf`, async () => {
			const docx = await renderCourseDocument(course, baseOptions('docx', { coverTemplate }));
			expect(docx.buffer.length).toBeGreaterThan(2000);
			const pdf = await renderCourseDocument(course, baseOptions('pdf', { coverTemplate }));
			expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
		});
	}

	it('schema accepts the two new cover templates', () => {
		expect(CourseDocumentSchema.parse({ format: 'docx', header: {}, coverTemplate: 'elegant' }).coverTemplate).toBe('elegant');
		expect(CourseDocumentSchema.parse({ format: 'pdf', header: {}, coverTemplate: 'minimal' }).coverTemplate).toBe('minimal');
	});
});
