import PDFDocument from 'pdfkit';
import {
	AlignmentType,
	BorderStyle,
	Document,
	Footer,
	Header,
	HeadingLevel,
	Packer,
	PageNumber,
	Paragraph,
	ShadingType,
	TextRun,
} from 'docx';

const THEMES = Object.freeze({
	classique: { accent: '#1f3a5f', soft: '#eef2f7', font: 'Georgia', body: 11, title: 24, section: 17, compact: false },
	moderne: { accent: '#0f766e', soft: '#e6f4f1', font: 'Arial', body: 11, title: 25, section: 18, compact: false },
	compact: { accent: '#b45309', soft: '#fbf0e2', font: 'Arial', body: 10, title: 21, section: 15, compact: true },
	ultra: { accent: '#be123c', soft: '#fdeaef', font: 'Arial', body: 9, title: 19, section: 13, compact: true },
	officiel: { accent: '#1b2a44', soft: '#f2f4f7', font: 'Georgia', body: 11, title: 23, section: 16, compact: false },
	college: { accent: '#15803d', soft: '#e9f6ec', font: 'Arial', body: 11, title: 24, section: 17, compact: false },
});

const HEADER_LAYOUTS = new Set(['bandeau', 'classique', 'centre', 'split', 'boxed', 'banner', 'minimal']);
const ptToTwips = (value) => Math.round(value * 20);
const noHash = (value) => value.replace('#', '').toUpperCase();

function sortedLessons(course) {
	return [...(course.lessons || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
}

function lessonLevels(lesson, course) {
	const levels = Array.isArray(lesson.category_levels)
		? lesson.category_levels.filter((level) => level && level.name)
		: [];
	if (levels.length) return levels;
	const path = String(lesson.category_path || course.category_path || '')
		.split('>')
		.map((name) => name.trim())
		.filter(Boolean);
	return path.map((name, index) => ({ id: `${index}:${name}`, name }));
}

function buildDocumentSections(course) {
	const roots = [];
	const nodes = new Map();
	for (const lesson of sortedLessons(course)) {
		const levels = lessonLevels(lesson, course);
		let parent = null;
		for (const level of levels) {
			const key = String(level.id || `${parent?.key || 'root'}:${level.name}`);
			let node = nodes.get(key);
			if (!node) {
				node = { key, name: String(level.name), children: [], lessons: [], depth: parent ? parent.depth + 1 : 0 };
				nodes.set(key, node);
				if (parent) parent.children.push(node);
				else roots.push(node);
			}
			parent = node;
		}
		if (parent) parent.lessons.push(lesson);
		else roots.push({
			key: `lesson:${lesson.id}`,
			name: '',
			children: [],
			lessons: [lesson],
			depth: 0,
		});
	}
	return roots;
}

function stripInlineMarkdown(text) {
	return String(text || '').replace(/[`*_~]/g, '');
}

function headerFields(header = {}) {
	return [
		['Ministry', header.ministry],
		['Academy / region', header.academy],
		['Institution', header.schoolName],
		['Academic year', header.academicYear],
		['Teacher', header.teacherName],
		['Subject', header.subject],
		['Level', header.level],
		['Class / group', header.group],
		['Date', header.date],
	].filter(([, value]) => String(value || '').trim());
}

function sectionLabel(depth) {
	return ['UNIT', 'CHAPTER', 'TOPIC', 'AXIS'][Math.min(depth, 3)];
}

function renderMarkdownPdf(doc, markdown, theme) {
	const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) {
			doc.moveDown(theme.compact ? 0.18 : 0.35);
			continue;
		}
		const heading = line.match(/^(#{1,4})\s+(.*)$/);
		if (heading) {
			doc.moveDown(theme.compact ? 0.3 : 0.5);
			doc.fillColor(theme.accent).font('Helvetica-Bold')
				.fontSize(heading[1].length === 1 ? theme.section : theme.body + 2)
				.text(stripInlineMarkdown(heading[2]), { paragraphGap: 2 });
			doc.moveDown(0.18);
		} else if (/^\s*[-*•]\s+/.test(raw)) {
			doc.fillColor('#273449').font('Helvetica').fontSize(theme.body)
				.text(`•  ${stripInlineMarkdown(raw.replace(/^\s*[-*•]\s+/, ''))}`, { indent: 14, paragraphGap: 3 });
		} else if (/^\s*\d+[.)]\s+/.test(raw)) {
			doc.fillColor('#273449').font('Helvetica').fontSize(theme.body)
				.text(stripInlineMarkdown(raw.trim()), { indent: 14, paragraphGap: 3 });
		} else {
			doc.fillColor('#273449').font('Helvetica').fontSize(theme.body)
				.text(stripInlineMarkdown(line), { align: 'left', paragraphGap: theme.compact ? 2 : 5 });
		}
	}
}

function addPdfHeader(doc, course, options, theme) {
	const header = options.header || {};
	const fields = headerFields(header);
	const layout = HEADER_LAYOUTS.has(options.headerLayout) ? options.headerLayout : 'bandeau';
	const leftFields = fields.slice(0, Math.ceil(fields.length / 2));
	const rightFields = fields.slice(Math.ceil(fields.length / 2));
	const y = doc.y;
	const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

	if (layout === 'minimal') {
		doc.font('Helvetica-Bold').fontSize(9).fillColor(theme.accent)
			.text([header.schoolName, header.academicYear, header.subject].filter(Boolean).join('  ·  '), { align: 'center' });
		doc.moveDown(0.25);
		return;
	}
	if (layout === 'split') {
		doc.font('Helvetica-Bold').fontSize(9).fillColor(theme.accent)
			.text(leftFields.map((field) => `${field[0]}: ${field[1]}`).join('\n'), doc.page.margins.left, y, { width: width * 0.55 });
		doc.font('Helvetica').fontSize(9).fillColor('#526174')
			.text(rightFields.map((field) => `${field[0]}: ${field[1]}`).join('\n'), doc.page.margins.left + width * 0.58, y, { width: width * 0.42, align: 'right' });
		doc.y = Math.max(doc.y, y + Math.max(leftFields.length, rightFields.length, 1) * 13);
	} else {
		if (layout === 'boxed') {
			doc.save().roundedRect(doc.page.margins.left, y - 8, width, Math.max(fields.length * 12 + 20, 42), 4)
				.lineWidth(1).strokeColor(theme.accent).stroke().restore();
			doc.x = doc.page.margins.left + 12;
			doc.y = y;
		} else if (layout === 'banner') {
			doc.save().rect(doc.page.margins.left, y - 8, width, 27).fill(theme.accent).restore();
			doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9)
				.text([header.schoolName, header.academicYear, header.subject].filter(Boolean).join('  ·  '), { align: 'center' });
			doc.y = y + 31;
		} else {
			const align = layout === 'centre' ? 'center' : 'left';
			doc.font('Helvetica-Bold').fontSize(9).fillColor(theme.accent)
				.text(fields.map(([label, value]) => `${label}: ${value}`).join('   ·   '), { align });
			doc.moveDown(0.25);
		}
		if (layout === 'boxed') {
			doc.font('Helvetica').fontSize(8).fillColor('#526174')
				.text(fields.map(([label, value]) => `${label}: ${value}`).join('   ·   '), { width: width - 24 });
			doc.y = y + Math.max(fields.length * 12 + 12, 34);
		}
	}
	doc.moveTo(doc.page.margins.left, doc.y + 4)
		.lineTo(doc.page.margins.left + width, doc.y + 4)
		.lineWidth(layout === 'bandeau' ? 2 : 0.8)
		.strokeColor(theme.accent).stroke();
	doc.y += 14;
}

function pdfCover(doc, course, options, theme, sections) {
	addPdfHeader(doc, course, options, theme);
	const top = Math.max(doc.y + 74, 190);
	doc.y = top;
	if (options.headerLayout === 'banner') {
		doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(10).text('COURSE MATERIAL', { align: 'center', characterSpacing: 2 });
		doc.moveDown(1);
	}
	doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(theme.title)
		.text(course.name || 'Course', { align: 'center', lineGap: 6 });
	doc.moveDown(0.8);
	if (course.description) {
		doc.fillColor('#526174').font('Helvetica').fontSize(12).text(course.description, {
			align: 'center',
			width: doc.page.width * 0.7,
			align: 'center',
		});
		doc.moveDown(1.2);
	}
	if (course.category_path) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10)
			.text(course.category_path, { align: 'center' });
		doc.moveDown(1.4);
	}
	const details = [
		`${sortedLessons(course).length} lesson${sortedLessons(course).length === 1 ? '' : 's'}`,
		`${sections.length} learning unit${sections.length === 1 ? '' : 's'}`,
		options.header?.academicYear,
		options.header?.level,
	].filter(Boolean);
	const chipY = doc.y;
	const chipText = details.join('     ·     ');
	doc.save().roundedRect(doc.page.margins.left + 18, chipY, doc.page.width - doc.page.margins.left - doc.page.margins.right - 36, 40, 6)
		.fill(theme.soft).restore();
	doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(10)
		.text(chipText, doc.page.margins.left + 28, chipY + 13, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 56, align: 'center' });
}

function drawPdfFooter(doc, course, pageRange) {
	const range = doc.bufferedPageRange();
	for (let index = range.start; index < range.start + range.count; index++) {
		doc.switchToPage(index);
		const pageNo = index - range.start + 1;
		const bottom = doc.page.height - doc.page.margins.bottom + 14;
		const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
		doc.moveTo(doc.page.margins.left, bottom - 7).lineTo(doc.page.margins.left + width, bottom - 7)
			.lineWidth(0.5).strokeColor('#d2d8e0').stroke();
		doc.font('Helvetica').fontSize(8).fillColor('#64748b')
			.text(course.name || 'Course', doc.page.margins.left, bottom, { width: width * 0.72, lineBreak: false });
		doc.text(`${pageNo} / ${pageRange}`, doc.page.margins.left + width * 0.72, bottom, { width: width * 0.28, align: 'right', lineBreak: false });
	}
}

function addPdfLesson(doc, lesson, index, theme, sectionDepth, options, forceNewPage = false) {
	if (forceNewPage) doc.addPage();
	const depth = Math.max(0, Number(sectionDepth) || 0);
	const label = sectionLabel(depth);
	const title = `${String(index + 1).padStart(2, '0')}  ${lesson.title || 'Untitled lesson'}`;
	doc.save().roundedRect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 20, 3)
		.fill(theme.soft).restore();
	doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(8)
		.text(`${label}  ·  LESSON ${String(index + 1).padStart(2, '0')}`, doc.page.margins.left + 9, doc.y + 6, { characterSpacing: 1 });
	doc.moveDown(1.4);
	doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(theme.section + 1)
		.text(title, { lineGap: 3 });
	if (lesson.summary) {
		doc.moveDown(0.35);
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(theme.body)
			.text(lesson.summary, { lineGap: 2 });
	}
	doc.moveDown(theme.compact ? 0.45 : 0.8);
	const body = String(lesson.content || '').trim();
	if (body) renderMarkdownPdf(doc, body, theme);
	else {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(theme.body)
			.text('Lesson content has not been added yet.');
	}
}

function pdfBuffer(course, options) {
	return new Promise((resolve, reject) => {
		const theme = THEMES[options.templateId] || THEMES.classique;
		const doc = new PDFDocument({
			size: 'A4',
			margins: { top: 52, right: 54, bottom: 56, left: 54 },
			bufferPages: true,
			info: {
				Title: course.name || 'Course',
				Author: options.header?.teacherName || 'Quiz App',
				Subject: options.header?.subject || course.name || 'Course material',
				Creator: 'Quiz App — course document generator',
			},
		});
		const chunks = [];
		doc.on('data', (chunk) => chunks.push(chunk));
		doc.on('error', reject);
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		const sections = buildDocumentSections(course);
		const lessons = sortedLessons(course);
		if (options.includeCover !== false) {
			pdfCover(doc, course, options, theme, sections);
		}
		if (options.includeTableOfContents !== false && lessons.length) {
			if (options.includeCover !== false) doc.addPage();
			doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(theme.section + 2).text('Contents');
			doc.moveDown(0.8);
			lessons.forEach((lesson, index) => {
				const levels = lessonLevels(lesson, course);
				const category = levels.map((level) => level.name).join('  /  ');
				doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(theme.body)
					.text(`${String(index + 1).padStart(2, '0')}  ${lesson.title}`, { indent: 2 });
				if (category) {
					doc.fillColor('#64748b').font('Helvetica').fontSize(theme.body - 1)
						.text(category, { indent: 21, paragraphGap: 5 });
				}
			});
		}

		let lessonIndex = 0;
		const containsLessons = (node) => node.lessons.length > 0 || node.children.some(containsLessons);
		const visit = (nodes) => {
			for (const node of nodes) {
				if (options.startEachLessonOnNewPage && lessonIndex > 0 && containsLessons(node)) doc.addPage();
				if (node.name) {
					if (!options.startEachLessonOnNewPage && lessonIndex > 0) doc.moveDown(theme.compact ? 0.6 : 1);
					const label = sectionLabel(node.depth);
					doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(Math.max(11, theme.section - node.depth * 2))
						.text(`${label}  ${node.name}`, { lineGap: 2 });
					doc.moveTo(doc.page.margins.left, doc.y + 3)
						.lineTo(doc.page.width - doc.page.margins.right, doc.y + 3)
						.lineWidth(0.7).strokeColor(theme.accent).stroke();
					doc.moveDown(0.55);
				}
				for (let localIndex = 0; localIndex < node.lessons.length; localIndex += 1) {
					const lesson = node.lessons[localIndex];
					const newPage = options.startEachLessonOnNewPage && (lessonIndex > 0 || localIndex > 0) &&
						!(localIndex === 0 && node.name && containsLessons(node) && lessonIndex > 0);
					addPdfLesson(doc, lesson, lessonIndex, theme, node.depth, options, newPage);
					lessonIndex += 1;
				}
				visit(node.children);
			}
		};
		if ((options.includeCover !== false || options.includeTableOfContents !== false) && lessons.length) doc.addPage();
		visit(sections);
		const pageCount = doc.bufferedPageRange().count;
		drawPdfFooter(doc, course, pageCount);
		doc.end();
	});
}

function makeRun(text, options = {}) {
	return new TextRun({
		text,
		font: options.font || 'Arial',
		size: options.size || 22,
		bold: Boolean(options.bold),
		italics: Boolean(options.italics),
		color: options.color || '273449',
	});
}

function markdownRuns(line, theme) {
	const chunks = [];
	const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
	let lastIndex = 0;
	let match;
	while ((match = pattern.exec(line))) {
		if (match.index > lastIndex) chunks.push(makeRun(line.slice(lastIndex, match.index), { size: theme.body * 2 }));
		const token = match[0];
		if (token.startsWith('**')) chunks.push(makeRun(token.slice(2, -2), { size: theme.body * 2, bold: true }));
		else if (token.startsWith('`')) chunks.push(makeRun(token.slice(1, -1), { size: theme.body * 2, font: 'Consolas', color: noHash(theme.accent) }));
		else chunks.push(makeRun(token.slice(1, -1), { size: theme.body * 2, italics: true }));
		lastIndex = match.index + token.length;
	}
	if (lastIndex < line.length) chunks.push(makeRun(line.slice(lastIndex), { size: theme.body * 2 }));
	return chunks.length ? chunks : [makeRun(stripInlineMarkdown(line), { size: theme.body * 2 })];
}

function docxHeader(options, theme) {
	const fields = headerFields(options.header);
	const layout = HEADER_LAYOUTS.has(options.headerLayout) ? options.headerLayout : 'bandeau';
	const text = layout === 'minimal'
		? [options.header?.schoolName, options.header?.academicYear, options.header?.subject].filter(Boolean).join('  ·  ')
		: fields.map(([label, value]) => `${label}: ${value}`).join('   ·   ');
	const alignment = layout === 'split' ? AlignmentType.BOTH : AlignmentType.CENTER;
	const border = {
		bottom: { style: BorderStyle.SINGLE, size: layout === 'bandeau' ? 16 : 6, color: noHash(theme.accent), space: 6 },
	};
	const headerChildren = [];
	if (layout === 'split') {
		const splitIndex = Math.ceil(fields.length / 2);
		headerChildren.push(
			new Paragraph({ children: [makeRun(fields.slice(0, splitIndex).map(([label, value]) => `${label}: ${value}`).join('   ·  ') || ' ', { size: 17, bold: true, color: noHash(theme.accent) })], alignment: AlignmentType.LEFT }),
			new Paragraph({ children: [makeRun(fields.slice(splitIndex).map(([label, value]) => `${label}: ${value}`).join('   ·  ') || ' ', { size: 17, color: noHash(theme.accent) })], alignment: AlignmentType.RIGHT }),
		);
	} else if (layout === 'bandeau' || layout === 'classique') {
		headerChildren.push(
			new Paragraph({
				children: [makeRun(options.header?.schoolName || options.header?.ministry || ' ', { size: 19, bold: true, color: noHash(theme.accent) })],
				alignment: layout === 'classique' ? AlignmentType.LEFT : AlignmentType.CENTER,
			}),
			new Paragraph({
				children: [makeRun(fields.filter(([label]) => label !== 'Institution').map(([label, value]) => `${label}: ${value}`).join('   ·  ') || ' ', { size: 16, color: '526174' })],
				alignment: AlignmentType.CENTER,
			}),
		);
	} else {
		headerChildren.push(new Paragraph({
			children: [makeRun(text || ' ', {
				size: layout === 'minimal' ? 16 : 18,
				bold: true,
				color: layout === 'banner' ? 'FFFFFF' : noHash(theme.accent),
			})],
			alignment,
			border: layout === 'boxed' ? {
					top: { style: BorderStyle.SINGLE, size: 6, color: noHash(theme.accent), space: 5 },
					bottom: { style: BorderStyle.SINGLE, size: 6, color: noHash(theme.accent), space: 5 },
					left: { style: BorderStyle.SINGLE, size: 6, color: noHash(theme.accent), space: 5 },
					right: { style: BorderStyle.SINGLE, size: 6, color: noHash(theme.accent), space: 5 },
				} : {
					bottom: { style: BorderStyle.SINGLE, size: layout === 'bandeau' ? 16 : 6, color: noHash(theme.accent), space: 6 },
				},
			shading: layout === 'banner' ? { type: ShadingType.CLEAR, fill: noHash(theme.accent), color: 'auto' } : undefined,
			spacing: { after: 100 },
		}));
	}
	return new Header({
		children: headerChildren,
	});
}

function docxFooter() {
	return new Footer({
		children: [new Paragraph({
			children: [
				makeRun('Page ', { size: 16, color: '64748B' }),
				new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' }),
				makeRun(' of ', { size: 16, color: '64748B' }),
				new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64748B' }),
			],
			alignment: AlignmentType.CENTER,
			border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D2D8E0', space: 6 } },
		})],
	});
}

function docxParagraphs(course, options, theme) {
	const accent = noHash(theme.accent);
	const lessons = sortedLessons(course);
	const paragraphs = [];
	if (options.includeCover !== false) {
		const school = options.header?.schoolName;
		if (school) paragraphs.push(new Paragraph({
			children: [makeRun(school, { bold: true, size: 24, color: accent })],
			alignment: AlignmentType.CENTER,
			spacing: { before: 2400, after: 500 },
		}));
		paragraphs.push(new Paragraph({
			children: [makeRun(course.name || 'Course', { bold: true, size: theme.title * 2, color: accent })],
			alignment: AlignmentType.CENTER,
			spacing: { before: school ? 1200 : 2400, after: 420 },
			border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: accent, space: 10 } },
		}));
		if (course.description) paragraphs.push(new Paragraph({
			children: [makeRun(course.description, { size: 24, color: '526174' })],
			alignment: AlignmentType.CENTER,
			spacing: { before: 240, after: 500 },
		}));
		if (course.category_path) paragraphs.push(new Paragraph({
			children: [makeRun(course.category_path, { size: 20, italics: true, color: '64748B' })],
			alignment: AlignmentType.CENTER,
			spacing: { after: 500 },
		}));
		const coverMeta = [
			`${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`,
			options.header?.academicYear,
			options.header?.level,
		].filter(Boolean).join('   ·   ');
		if (coverMeta) paragraphs.push(new Paragraph({
			children: [makeRun(coverMeta, { size: 19, bold: true, color: accent })],
			alignment: AlignmentType.CENTER,
			shading: { type: ShadingType.CLEAR, fill: noHash(theme.soft), color: 'auto' },
			spacing: { before: 700, after: 1800 },
		}));
		for (const [label, value] of headerFields(options.header).filter(([label]) => label !== 'Institution')) {
			paragraphs.push(new Paragraph({
				children: [makeRun(`${label}: `, { bold: true, size: 18 }), makeRun(value, { size: 18 })],
				alignment: AlignmentType.CENTER,
				spacing: { after: 100 },
			}));
		}
	}

	if (options.includeTableOfContents !== false && lessons.length) {
		paragraphs.push(new Paragraph({
			text: 'Contents',
			heading: HeadingLevel.HEADING_1,
			pageBreakBefore: options.includeCover !== false,
			spacing: { after: 300 },
		}));
		lessons.forEach((lesson, index) => {
			const path = lessonLevels(lesson, course).map((level) => level.name).join('  /  ');
			paragraphs.push(new Paragraph({
				children: [
					makeRun(`${String(index + 1).padStart(2, '0')}  `, { bold: true, color: accent, size: 21 }),
					makeRun(lesson.title || 'Untitled lesson', { bold: true, size: 21 }),
				],
				keepNext: Boolean(path),
				spacing: { before: 120, after: path ? 20 : 100 },
				border: { bottom: { style: BorderStyle.DOTTED, size: 4, color: 'CBD5E1', space: 4 } },
			}));
			if (path) paragraphs.push(new Paragraph({
				children: [makeRun(path, { size: 17, italics: true, color: '64748B' })],
				indent: { left: 420 },
				spacing: { after: 100 },
			}));
		});
	}
	if (options.includeCover !== false || (options.includeTableOfContents !== false && lessons.length)) {
		paragraphs.push(new Paragraph({ text: 'Course material', pageBreakBefore: true, spacing: { after: 180 } }));
	}

	const sections = buildDocumentSections(course);
	let lessonIndex = 0;
	const visit = (nodes) => {
		for (const node of nodes) {
			if (node.name) {
				paragraphs.push(new Paragraph({
					children: [
						makeRun(`${sectionLabel(node.depth)}  `, { bold: true, size: 17, color: accent }),
						makeRun(node.name, { bold: true, size: (theme.section - node.depth) * 2, color: accent }),
					],
					heading: node.depth === 0 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
					spacing: { before: 260, after: 110 },
					shading: node.depth === 0 ? { type: ShadingType.CLEAR, fill: noHash(theme.soft), color: 'auto' } : undefined,
					border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: noHash(theme.accent), space: 5 } },
				}));
			}
			for (const lesson of node.lessons) {
				paragraphs.push(new Paragraph({
					children: [
						makeRun(`LESSON ${String(lessonIndex + 1).padStart(2, '0')}  `, { bold: true, size: 18, color: accent }),
						makeRun(lesson.title || 'Untitled lesson', { bold: true, size: theme.section * 2, color: accent }),
					],
					heading: HeadingLevel.HEADING_2,
					pageBreakBefore: lessonIndex > 0 && options.startEachLessonOnNewPage,
					keepNext: Boolean(lesson.summary),
					spacing: { before: 260, after: 110 },
				}));
				if (lesson.summary) paragraphs.push(new Paragraph({
					children: [makeRun(lesson.summary, { italics: true, size: theme.body * 2, color: '64748B' })],
					keepNext: true,
					spacing: { after: 180 },
				}));
				const path = lessonLevels(lesson, course).map((level) => level.name).join('  /  ');
				if (path) paragraphs.push(new Paragraph({
					children: [makeRun(path, { size: 17, color: '64748B' })],
					keepNext: Boolean(lesson.content),
					spacing: { after: 160 },
				}));
				const content = String(lesson.content || '').replace(/\r\n/g, '\n');
				if (!content.trim()) {
					paragraphs.push(new Paragraph({ children: [makeRun('Lesson content has not been added yet.', { italics: true, color: '64748B' })] }));
				} else {
					for (const raw of content.split('\n')) {
						const line = raw.trim();
						if (!line) continue;
						const heading = line.match(/^(#{1,4})\s+(.*)$/);
						if (heading) {
							paragraphs.push(new Paragraph({
								children: [makeRun(heading[2], { bold: true, size: (theme.body + (heading[1].length === 1 ? 4 : 2)) * 2, color: accent })],
								heading: heading[1].length <= 2 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4,
								keepNext: true,
								spacing: { before: 220, after: 90 },
							}));
						} else if (/^\s*[-*•]\s+/.test(raw)) {
							paragraphs.push(new Paragraph({
								children: markdownRuns(raw.replace(/^\s*[-*•]\s+/, ''), theme),
								bullet: { indent: 360 },
								spacing: { after: 70 },
							}));
						} else if (/^\s*\d+[.)]\s+/.test(raw)) {
							paragraphs.push(new Paragraph({
								children: markdownRuns(raw.trim().replace(/^\d+[.)]\s+/, ''), theme),
								numbering: { reference: 'course-numbering', level: 0 },
								spacing: { after: 70 },
							}));
						} else {
							paragraphs.push(new Paragraph({ children: markdownRuns(line, theme), spacing: { after: 130 } }));
						}
					}
				}
				lessonIndex += 1;
			}
			visit(node.children);
		}
	};
	visit(sections);
	return paragraphs;
}

export async function renderCourseDocument(course, options) {
	if (options.format === 'pdf') {
		return { buffer: await pdfBuffer(course, options), mime: 'application/pdf', extension: 'pdf' };
	}
	if (options.format !== 'docx') throw new Error(`Unsupported course document format: ${options.format}`);
	const theme = THEMES[options.templateId] || THEMES.classique;
	const pageWidth = 11906;
	const pageHeight = 16838;
	const margin = theme.compact ? 720 : 1000;
	const buffer = await Packer.toBuffer(new Document({
		styles: {
			default: { document: { run: { font: theme.font, size: theme.body * 2, color: '273449' } } },
			paragraphStyles: [
				{ id: 'Normal', name: 'Normal', run: { font: theme.font, size: theme.body * 2, color: '273449' }, paragraph: { spacing: { after: theme.compact ? 80 : 130, line: 280 } } },
			],
		},
		numbering: {
			config: [{
				reference: 'course-numbering',
				levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
			}],
		},
		sections: [{
			properties: {
				page: {
					size: { width: pageWidth, height: pageHeight },
					margin: { top: margin, right: margin, bottom: margin, left: margin },
				},
			},
			headers: { default: docxHeader(options, theme) },
			footers: { default: docxFooter() },
			children: docxParagraphs(course, options, theme),
		}],
	}));
	return {
		buffer,
		mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		extension: 'docx',
	};
}
