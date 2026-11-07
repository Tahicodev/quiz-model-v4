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
	startEachLessonOnNewPage: true,
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
it('links every contents entry to a real bookmark, axes included', async () => {
		const structured = {
			name: 'Sciences de la vie',
			lessons: [{
				id: 'axis-lesson', title: 'La cellule', order_index: 0, category_id: 'axis-a',
				category_levels: [
					{ id: 'module-1', name: 'Module 1' },
					{ id: 'chapter-1', name: 'Chapitre 1' },
					{ id: 'axis-a', name: 'Axe A' },
				],
				content: 'Introduction a la cellule.',
			}],
		};
		const { buffer } = await renderCourseDocument(structured, baseOptions('docx'));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		const refs = [...xml.matchAll(/PAGEREF ([^ <]+)/g)].map((match) => match[1]);
		const bookmarks = new Set([...xml.matchAll(/w:name="([^"]+)"/g)].map((match) => match[1]));
		expect(refs.length).toBeGreaterThan(0);
		for (const ref of refs) expect(bookmarks.has(ref)).toBe(true);
		// The axis has no divider, so its entry points at the first lesson.
		expect(refs.some((ref) => ref.includes('crs_lesson_'))).toBe(true);
	});

	it('keeps the category table order for sibling chapters even when lessons were sorted differently', async () => {
		const ordered = {
			name: 'Informatique',
			lessons: [
				{
					id: 'r1', title: 'Codage', order_index: 0, category_id: 'axis-r',
					category_levels: [
						{ id: 'root', name: 'Module 1' },
						{ id: 'chapter-r', name: 'Représentation de l’information' },
						{ id: 'axis-r', name: 'Codage' },
					],
					content: 'R',
				},
				{
					id: 'v1', title: 'Informatique', order_index: 1, category_id: 'axis-v',
					category_levels: [
						{ id: 'root', name: 'Module 1' },
						{ id: 'chapter-v', name: 'vocabulaire de base' },
						{ id: 'axis-v', name: 'Informatique' },
					],
					content: 'V',
				},
			],
		};
		// Category table order: vocabulaire first, then Représentation.
		const categoryOrder = ['root', 'chapter-v', 'axis-v', 'chapter-r', 'axis-r'];
		const { buffer } = await renderCourseDocument(ordered, baseOptions('docx', { categoryOrder }));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		const text = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]);
		const vocabIndex = text.findIndex((value) => value === 'vocabulaire de base');
		const representationIndex = text.findIndex((value) => value === 'Représentation de l’information');
		expect(vocabIndex).toBeGreaterThanOrEqual(0);
		expect(representationIndex).toBeGreaterThanOrEqual(0);
		expect(vocabIndex).toBeLessThan(representationIndex);
	});

	it('numbers the sections inside a lesson, never the module/chapter/lesson titles', async () => {
		const numbered = {
			name: 'Sciences de la vie',
			lessons: [{
				id: 'n1',
				title: 'La cellule',
				order_index: 0,
				content: '## Introduction\nTexte.\n## Définition\nTexte.\n### Détail\nTexte.',
			}],
		};
		const { buffer } = await renderCourseDocument(numbered, baseOptions('docx', { numerationTemplate: 'decimal' }));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		// In-lesson headings restart at 1 for each lesson and follow the chosen
		// template (decimal → "1. ", "2. ", "2.1 ").
		expect(xml).toContain('1. Introduction');
		expect(xml).toContain('2. Définition');
		expect(xml).toContain('2.1. Détail');
		// The lesson title itself (TOC + body) stays unnumbered.
		expect(xml).not.toContain('1. La cellule');
		expect(xml).not.toContain('0. La cellule');
		const pdf = await renderCourseDocument(numbered, baseOptions('pdf', { numerationTemplate: 'decimal' }));
		expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
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

describe('course document — module and chapter divider pages', () => {
	const structured = {
		name: 'Arithmetic',
		lessons: [
			{
				id: 'a1',
				title: 'Adding whole numbers',
				order_index: 0,
				category_levels: [{ id: 'm1', name: 'Numbers' }, { id: 'c1', name: 'Whole numbers' }],
				content: '## Objectives\n- Add two whole numbers\n## Key concepts\n- Sum\n- Carry\n\n## Definition\nText.',
			},
			{
				id: 'a2',
				title: 'Subtracting whole numbers',
				order_index: 1,
				category_levels: [{ id: 'm1', name: 'Numbers' }, { id: 'c1', name: 'Whole numbers' }],
				content: '## Objectives\n- Subtract whole numbers',
			},
		],
	};

	it('starts modules and chapters as unnumbered divider pages with goals', async () => {
		const { buffer } = await renderCourseDocument(structured, baseOptions('docx'));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		const moduleIndex = xml.indexOf('MODULE');
		const moduleTitle = xml.indexOf('Numbers', moduleIndex);
		const chapterIndex = xml.indexOf('CHAPTER', moduleTitle);
		const chapterTitle = xml.indexOf('Whole numbers', chapterIndex);
		const goalsIndex = xml.indexOf('Goals', chapterTitle);
		const objectiveIndex = xml.indexOf('Add two whole numbers', goalsIndex);
		const lessonIndex = xml.indexOf('Adding whole numbers', objectiveIndex);
		expect(moduleIndex).toBeGreaterThan(-1);
		expect(moduleTitle).toBeGreaterThan(moduleIndex);
		expect(chapterIndex).toBeGreaterThan(moduleTitle);
		expect(chapterTitle).toBeGreaterThan(chapterIndex);
		expect(goalsIndex).toBeGreaterThan(chapterTitle);
		expect(objectiveIndex).toBeGreaterThan(goalsIndex);
		expect(lessonIndex).toBeGreaterThan(objectiveIndex);
		expect(xml).toContain('Key concepts');
		// structural titles are not numbered by the lesson numeration template
		expect(xml).not.toContain('1. Numbers');
		expect(xml).not.toContain('1. Whole numbers');
	});

	it('uses a section as the overline of its lesson instead of another divider', async () => {
		const sectioned = {
			name: 'Arithmetic',
			lessons: [{
				id: 's1',
				title: 'Carrying over',
				order_index: 0,
				category_levels: [
					{ id: 'm1', name: 'Numbers' },
					{ id: 'c1', name: 'Whole numbers' },
					{ id: 's1c', name: 'Addition strategies' },
				],
				content: '## Objectives\n- Carry to the next column',
			}],
		};
		const { buffer } = await renderCourseDocument(sectioned, baseOptions('docx'));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		expect(xml).toContain('ADDITION STRATEGIES');
		expect(xml).not.toContain('SECTION');
		const sectionIndex = xml.indexOf('ADDITION STRATEGIES');
		expect(sectionIndex).toBeGreaterThan(-1);
		expect(xml.indexOf('Carrying over', sectionIndex)).toBeGreaterThan(sectionIndex);
	});

	it('shows chapters and goals on the module page, keeping them together', async () => {
		const { buffer } = await renderCourseDocument(structured, baseOptions('docx'));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		const moduleStart = xml.indexOf('MODULE');
		const moduleSegment = xml.slice(moduleStart, xml.indexOf('CHAPTER', moduleStart));
		expect(moduleSegment).toContain('Chapters');
		expect(moduleSegment).toContain('Whole numbers');
		expect(moduleSegment).toContain('Goals');
		// Key concepts stay on the chapter page, not the module overview.
		expect(moduleSegment).not.toContain('Key concepts');
		const chapterSegment = xml.slice(xml.indexOf('CHAPTER', moduleStart));
		expect(chapterSegment).toContain('Key concepts');
	});

	it('puts ministry and academy in the cover header and institution in the table', async () => {
		const coverHeader = {
			...header,
			ministry: 'Ministry of Education',
			academy: 'Rabat-Salé-Kénitra Academy',
		};
		const { buffer } = await renderCourseDocument(course, baseOptions('docx', { header: coverHeader }));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		// Institution replaced Subject in the centred identity table.
		expect(xml).toContain('Institution information');
		expect(xml).toContain('Lycée Ibn Sina');
		expect(xml).not.toContain('Subject');
		// The old meta chip (lesson/section counts, year, level) is gone.
		expect(xml).not.toContain('2 lessons');
		expect(xml).not.toContain('0 sections');

		const zip = await JSZip.loadAsync(buffer);
		const names = Object.keys(zip.files).filter((name) => /^word\/header\d+\.xml$/.test(name));
		const headers = await Promise.all(names.map((name) => zip.file(name).async('string')));
		const coverHeaderXml = headers.find((value) => value.includes('Ministry of Education'));
		expect(coverHeaderXml).toBeTruthy();
		expect(coverHeaderXml).toContain('Rabat-Salé-Kénitra Academy');
		// The cover header no longer repeats the institution or the school year.
		expect(coverHeaderXml).not.toContain('Ibn Sina');
		expect(coverHeaderXml).not.toContain('2025-2026');
	});

	it('starts every lesson on its own page by default', async () => {
		const { buffer } = await renderCourseDocument(structured, baseOptions('docx', { startEachLessonOnNewPage: true }));
		const xml = await zipParts(buffer, /^word\/document\.xml$/);
		expect((xml.match(/<w:pageBreakBefore\/>/g) || []).length).toBeGreaterThanOrEqual(4);
		const pdf = await renderCourseDocument(structured, baseOptions('pdf'));
		const pages = (pdf.buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
		// cover + contents + module + chapter + one page per lesson
		expect(pages).toBeGreaterThanOrEqual(6);
		expect(pages).toBeLessThanOrEqual(12);
	});

	it('defaults lesson pagination to a page per lesson', () => {
		const parsed = CourseDocumentSchema.parse({ format: 'pdf', header: {} });
		expect(parsed.startEachLessonOnNewPage).toBe(true);
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
