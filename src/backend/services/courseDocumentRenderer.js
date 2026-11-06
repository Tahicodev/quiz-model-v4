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
	Tab,
	Table,
	TableCell,
	TableLayoutType,
	TableRow,
	TabStopType,
	TextRun,
	VerticalAlign,
	WidthType,
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

// A4 portrait in twips and the running chrome shared by every page. The cover
// keeps the full institutional identity (in the body), while every page carries
// a slim running header (teacher · school year) and a footer (course name ·
// page number) — the convention requested for course documents and prep sheets.
const DOCX_PAGE = { width: 11906, height: 16838 };
const docxContentWidth = (theme) => DOCX_PAGE.width - (theme.compact ? 720 : 1000) * 2;

/** Cover "general information" as a compact Label/Value/Label/Value grid —
 * the same table treatment used in the lesson preparation sheets: shaded
 * label cells, consistent borders, one row per pair of fields. */
function docxInfoCell(text, { bold, color, size = 9, fill, span, theme } = {}) {
	return new TableCell({
		...(span ? { columnSpan: span } : {}),
		verticalAlign: VerticalAlign.CENTER,
		margins: { top: 60, bottom: 60, left: 90, right: 90 },
		...(fill ? { shading: { type: ShadingType.CLEAR, fill: noHash(fill), color: 'auto' } } : {}),
		children: [new Paragraph({
			spacing: { after: 0 },
			children: [makeRun(text || '', { bold, color: color || '273449', size: size * 2, font: theme?.font || 'Arial' })],
		})],
	});
}

function docxCoverIdentityTable(identity, theme) {
	const cw = docxContentWidth(theme);
	const lw = Math.round(cw * 0.24);
	const vw = Math.round(cw * 0.26);
	const widths = [lw, vw, lw, cw - lw - vw - lw];
	const accent = noHash(theme.accent);
	const soft = noHash(theme.soft);
	const rows = [];
	for (let i = 0; i < identity.length; i += 2) {
		const a = identity[i];
		const b = identity[i + 1];
		const cells = [
			docxInfoCell(a[0], { bold: true, color: accent, fill: soft, theme }),
			docxInfoCell(a[1], { theme }),
		];
		if (b) {
			cells.push(docxInfoCell(b[0], { bold: true, color: accent, fill: soft, theme }));
			cells.push(docxInfoCell(b[1], { theme }));
		} else {
			cells.push(docxInfoCell('', { span: 2, theme }));
		}
		rows.push(new TableRow({ cantSplit: true, children: cells }));
	}
	const border = { style: BorderStyle.SINGLE, size: 4, color: 'B7C3D0' };
	return new Table({
		width: { size: cw, type: WidthType.DXA },
		columnWidths: widths,
		layout: TableLayoutType.FIXED,
		borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
		rows,
	});
}

/** Slim running header: teacher on the left, school year on the right. */
function docxRunningHeader(options, theme) {
	const h = options.header || {};
	const left = String(h.teacherName || '').trim();
	const right = String(h.academicYear || '').trim();
	if (!left && !right) return new Header({ children: [new Paragraph({ children: [] })] });
	return new Header({
		children: [new Paragraph({
			tabStops: [{ type: TabStopType.RIGHT, position: docxContentWidth(theme) }],
			border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: noHash(theme.accent), space: 4 } },
			children: [
				makeRun(left, { size: 16, bold: true, color: noHash(theme.accent), font: theme.font }),
				// A real <w:tab/> jumps to the right tab stop — a literal '\t'
				// inside <w:t> is plain text and Word renders it as a space.
				...(right ? [
					new TextRun({ children: [new Tab()], size: 16, font: theme.font }),
					makeRun(right, { size: 16, color: '526174', font: theme.font }),
				] : []),
			],
		})],
	});
}

/** Footer on every page: course name on the left, page number on the right. */
function docxRunningFooter(course, theme) {
	const name = String(course?.name || 'Course').trim();
	return new Footer({
		children: [new Paragraph({
			tabStops: [{ type: TabStopType.RIGHT, position: docxContentWidth(theme) }],
			border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D2D8E0', space: 4 } },
			children: [
				makeRun(name, { size: 15, color: '64748B', font: theme.font }),
				new TextRun({ children: [new Tab()], size: 15, color: '64748B', font: theme.font }),
				new TextRun({ children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 15, color: '64748B', font: theme.font }),
			],
		})],
	});
}

function sortedLessons(course) {
	const lessons = [...(course.lessons || [])].sort(
		(a, b) => (a.order_index || 0) - (b.order_index || 0),
	);
	if (!lessons.some((lesson) => lesson.parent_lesson_id)) return lessons;
	const byId = new Map(lessons.map((lesson) => [String(lesson.id), lesson]));
	const children = new Map();
	const roots = [];
	for (const lesson of lessons) {
		const parentId = String(lesson.parent_lesson_id || '');
		if (!byId.has(parentId) || parentId === String(lesson.id)) {
			roots.push(lesson);
			continue;
		}
		if (!children.has(parentId)) children.set(parentId, []);
		children.get(parentId).push(lesson);
	}
	const ordered = [];
	const visited = new Set();
	const visit = (lesson) => {
		const id = String(lesson.id);
		if (visited.has(id)) return;
		visited.add(id);
		ordered.push(lesson);
		for (const child of children.get(id) || []) visit(child);
	};
	roots.forEach(visit);
	lessons.forEach(visit);
	return ordered;
}

function buildLessonOutline(course) {
	const lessons = [...(course.lessons || [])].sort(
		(a, b) => (a.order_index || 0) - (b.order_index || 0),
	);
	const nodes = new Map(
		lessons.map((lesson) => [
			String(lesson.id),
			{ key: String(lesson.id), lesson, name: '', children: [], lessons: [lesson], depth: 0, outlineLesson: true },
		]),
	);
	for (const node of nodes.values()) {
		const parent = nodes.get(String(node.lesson.parent_lesson_id || ''));
		if (parent && parent !== node) node.parent = parent;
	}
	for (const node of nodes.values()) {
		const path = new Set([node.key]);
		let ancestor = node.parent;
		while (ancestor) {
			if (path.has(ancestor.key)) {
				node.parent = null;
				break;
			}
			path.add(ancestor.key);
			ancestor = ancestor.parent;
		}
	}
	const roots = [];
	for (const node of nodes.values()) {
		if (node.parent) node.parent.children.push(node);
		else roots.push(node);
	}
	const sort = (siblings, depth = 0) => {
		siblings.sort(
			(a, b) =>
				(a.lesson.order_index || 0) - (b.lesson.order_index || 0),
		);
		siblings.forEach((node) => {
			node.depth = depth;
			sort(node.children, depth + 1);
		});
	};
	sort(roots);
	return roots;
}

function lessonOutlineDepths(course) {
	const depths = new Map();
	const visit = (nodes) => {
		for (const node of nodes) {
			depths.set(String(node.lesson.id), node.depth);
			visit(node.children);
		}
	};
	if ((course.lessons || []).some((lesson) => lesson.parent_lesson_id)) {
		visit(buildLessonOutline(course));
	}
	return depths;
}

function lessonLevels(lesson, course) {
	if ((course.lessons || []).some((item) => item.parent_lesson_id)) return [];
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

function toRoman(n) {
	const map = [
		[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
		[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
		[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
	];
	let res = '';
	let m = Math.max(0, Math.floor(Number(n) || 0));
	for (const [value, symbol] of map) {
		while (m >= value) { res += symbol; m -= value; }
	}
	return res;
}

function toAlpha(n, upper = true) {
	let m = Math.max(1, Math.floor(Number(n) || 1));
	let res = '';
	while (m > 0) {
		m -= 1;
		const code = upper ? 65 : 97;
		res = String.fromCharCode(code + (m % 26)) + res;
		m = Math.floor(m / 26);
	}
	return res;
}

	const NUMERATION_TEMPLATES = Object.freeze({
	default: {
		label: 'Classic (I · 1 · a · i)',
		labels: null,
		separator: '- ',
		formats: [(n) => toRoman(n), (n) => String(n), (n) => toAlpha(n, false), (n) => toRoman(n).toLowerCase()],
	},
	decimal: {
		label: 'Decimal (1 · 1.1 · 1.1.1)',
		labels: null,
		separator: '. ',
		formats: [
			(n) => String(n),
			(n, depth, idx) => idx.join('.'),
			(n, depth, idx) => idx.join('.'),
			(n, depth, idx) => idx.join('.'),
		],
	},
	roman: {
		label: 'Roman (I · II · III)',
		labels: null,
		separator: '. ',
		formats: [(n) => toRoman(n), (n) => toRoman(n), (n) => toRoman(n), (n) => toRoman(n)],
	},
	alpha: {
		label: 'Alpha (A · B · C)',
		labels: null,
		separator: '. ',
		formats: [(n) => toAlpha(n, true), (n) => toAlpha(n, true), (n) => toAlpha(n, true), (n) => toAlpha(n, true)],
	},
	book: {
		label: 'Book (Chapter · Section · Subsection)',
		labels: ['Chapter', 'Section', 'Subsection', 'Division'],
		separator: ' ',
		formats: [(n) => toRoman(n), (n) => String(n), (n) => toAlpha(n, false), (n) => toRoman(n).toLowerCase()],
	},
	module: {
		label: 'Module (Module · Unit · Topic · Axis)',
		labels: ['Module', 'Unit', 'Topic', 'Axis'],
		separator: ' ',
		formats: [(n) => toRoman(n), (n) => String(n), (n) => toAlpha(n, false), (n) => toRoman(n).toLowerCase()],
	},
	// Purely decimal, no letters anywhere — 1 · 1.1 · 1.1.1. Reads as a clean
	// technical syllabus and never collides with roman/alpha conventions.
	progressif: {
		label: 'Progressif (1 · 1.1 · 1.1.1)',
		labels: null,
		separator: '. ',
		formats: [
			(n) => String(n),
			(n, depth, idx) => idx.join('.'),
			(n, depth, idx) => idx.join('.'),
			(n, depth, idx) => idx.join('.'),
		],
	},
	// French academic outline: the big structural titles carry a word label
	// (Module I, then Section 1 …) instead of a bare count, and the running
	// lesson numbering restarts below them.
	academique: {
		label: 'Académique (Module I · Section 1 · 1.1)',
		labels: ['Module', 'Section', 'Paragraphe', 'Axe'],
		separator: ' ',
		formats: [
			(n) => toRoman(n),
			(n, depth, idx) => String(idx[idx.length - 1] || n),
			(n, depth, idx) => idx.slice(1).join('.'),
			(n, depth, idx) => idx.slice(1).join('.'),
		],
	},
});

function numerationFormat(template, depth, index, pathIndex) {
	const tpl = NUMERATION_TEMPLATES[template] || NUMERATION_TEMPLATES.default;
	const formats = tpl.formats;
	const fmt = formats[depth] || formats[formats.length - 1];
	const num = fmt(index, depth, pathIndex);
	const label = tpl.labels ? tpl.labels[depth] : null;
	return { num, label, separator: tpl.separator };
}

function sectionSign(template, depth, index, pathIndex) {
	const f = numerationFormat(template, depth, index, pathIndex);
	let sign = f.label ? `${f.label} ${f.num}` : f.num;
	return sign + f.separator;
}

function formatPath(path) {
	return path.map((p) => `${p.sign}${p.name}`).join('  /  ');
}

function stripInlineMarkdown(text) {
	return String(text || '').replace(/[`*_~]/g, '');
}

function headerFields(header = {}) {
	// The cover carries two zones: this institutional header (ministry /
	// academy / institution / school year) and the centred identity table
	// (teacher, subject, level, group, date). Keeping the field sets disjoint
	// is what stops the same value from being printed twice on the cover.
	return [
		['Ministry', header.ministry],
		['Academy / region', header.academy],
		['Institution', header.schoolName],
		['Academic year', header.academicYear],
	].filter(([, value]) => String(value || '').trim());
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
			.text(fields.map((f) => `${f[0]}: ${f[1]}`).join('\n').slice(0, 200), doc.page.margins.left, y, { width: width * 0.5 });
		doc.font('Helvetica').fontSize(9).fillColor('#526174')
			.text(fields.map((f) => `${f[0]}: ${f[1]}`).join('\n').slice(200), doc.page.margins.left + width * 0.52, y, { width: width * 0.48, align: 'right' });
		doc.y = Math.max(doc.y, y + fields.length * 13 + 6);
	} else if (layout === 'boxed') {
		doc.save().roundedRect(doc.page.margins.left, y - 6, width, fields.length * 13 + 18, 5)
			.lineWidth(1).strokeColor(theme.accent).stroke().restore();
		doc.x = doc.page.margins.left + 14;
		doc.y = y;
		doc.font('Helvetica-Bold').fontSize(8.5).fillColor(theme.accent)
			.text(fields.map((f) => `${f[0]}: ${f[1]}`).join('    ·    '), { width: width - 28 });
		doc.y = y + fields.length * 13 + 12;
	} else if (layout === 'banner') {
		doc.save().rect(doc.page.margins.left, y - 6, width, 30).fill(theme.accent).restore();
		doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
			.text([header.schoolName, header.academicYear, header.subject].filter(Boolean).join('  ·  '), { align: 'center' });
		doc.y = y + 36;
	} else if (layout === 'centre') {
		doc.font('Helvetica-Bold').fontSize(9).fillColor(theme.accent)
			.text(fields.map((f) => `${f[0]}: ${f[1]}`).join('    ·    '), { align: 'center' });
		doc.moveDown(0.28);
	} else {
		doc.font('Helvetica-Bold').fontSize(9).fillColor(theme.accent)
			.text(fields.map((f) => `${f[0]}: ${f[1]}`).join('    ·    '), { align: 'left' });
		doc.moveDown(0.28);
	}
	doc.moveTo(doc.page.margins.left, doc.y + 4)
		.lineTo(doc.page.margins.left + width, doc.y + 4)
		.lineWidth(layout === 'bandeau' ? 2 : 0.8)
		.strokeColor(theme.accent).stroke();
	doc.y += 14;
}

function pdfCover(doc, course, options, theme, sections) {
	addPdfHeader(doc, course, options, theme);
	doc.moveDown(0.4);
	const header = options.header || {};
	const coverTemplate = options.coverTemplate || 'academic';
	const identity = [
		['Teacher', header.teacherName],
		['Subject', header.subject],
		['Level / class', header.level],
		['Group', header.group],
		['Academic year', header.academicYear],
		['Date', header.date],
	].filter(([, value]) => String(value || '').trim());
	const details = [
		`${sortedLessons(course).length} lesson${sortedLessons(course).length === 1 ? '' : 's'}`,
		`${sections.length} section${sections.length === 1 ? '' : 's'}`,
		options.header?.academicYear,
		options.header?.level,
	].filter(Boolean);
	const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
	const cx = doc.page.margins.left + width / 2;

	if (coverTemplate === 'modern') {
		pdfCoverModern(doc, course, options, theme, header, identity, width, cx, details);
	} else if (coverTemplate === 'book') {
		pdfCoverBook(doc, course, options, theme, header, identity, width, cx, details);
	} else if (coverTemplate === 'university') {
		pdfCoverUniversity(doc, course, options, theme, header, identity, width, cx, details);
	} else if (coverTemplate === 'elegant') {
		pdfCoverElegant(doc, course, options, theme, header, identity, width, cx, details);
	} else if (coverTemplate === 'minimal') {
		pdfCoverMinimal(doc, course, options, theme, header, identity, width, cx, details);
	} else {
		pdfCoverAcademic(doc, course, options, theme, header, identity, width, cx, details);
	}
	// No trailing addPage here: the TOC / body blocks each start with their own
	// page break, and adding one too produced a blank page after the cover.
}

function pdfCoverAcademic(doc, course, options, theme, header, identity, width, cx, details) {
	const accent = theme.accent;
	doc.fillColor(accent).font('Helvetica-Bold').fontSize(theme.title + 2)
		.text(course.name || 'Course', { align: 'center', lineGap: 8 });
	doc.moveDown(0.6);
	if (course.description) {
		doc.fillColor('#526174').font('Helvetica').fontSize(12.5).text(course.description, {
			align: 'center',
			width: doc.page.width * 0.72,
			lineGap: 4,
		});
		doc.moveDown(1);
	}
	if (course.category_path) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(11)
			.text(course.category_path, { align: 'center' });
		doc.moveDown(1.4);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	pdfCoverMetaChip(doc, theme, width, cx, details);
}

function pdfCoverModern(doc, course, options, theme, header, identity, width, cx, details) {
	const accent = theme.accent;
	// Top accent band
	doc.save().rect(doc.page.margins.left, doc.y, width, 34).fill(accent).restore();
	doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13)
		.text(course.name || 'Course', { align: 'center', y: doc.y + 10 });
	doc.y += 38;
	doc.moveDown(0.6);
	const eyebrow = String(header.subject || '').trim();
	if (eyebrow) {
		doc.fillColor(accent).font('Helvetica-Bold').fontSize(11)
			.text(eyebrow, { align: 'center', characterSpacing: 2 });
		doc.moveDown(0.4);
	}
	if (course.description) {
		doc.fillColor('#374151').font('Helvetica').fontSize(12).text(course.description, {
			align: 'center',
			width: doc.page.width * 0.78,
			lineGap: 4,
		});
		doc.moveDown(1);
	}
	if (course.category_path) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10)
			.text(course.category_path, { align: 'center' });
		doc.moveDown(1.2);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	pdfCoverMetaChip(doc, theme, width, cx, details);
}

function pdfCoverBook(doc, course, options, theme, header, identity, width, cx, details) {
	const accent = theme.accent;
	// Left accent bar
	doc.save().rect(doc.page.margins.left, doc.y, 10, 150).fill(accent).restore();
	doc.x = doc.page.margins.left + 22;
	doc.fillColor(accent).font('Helvetica-Bold').fontSize(theme.title + 4)
		.text(course.name || 'Course', { width: width - 40, lineGap: 6 });
	doc.moveDown(0.8);
	doc.fillColor('#374151').font('Helvetica').fontSize(12)
		.text('A course document prepared for study and reference.', { width: width - 40 });
	doc.moveDown(1.4);
	if (course.category_path) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10)
			.text(course.category_path);
		doc.moveDown(1.4);
	}
	if (course.description) {
		doc.fillColor('#526174').font('Helvetica-Oblique').fontSize(11)
			.text(course.description, { width: width - 40, lineGap: 4 });
		doc.moveDown(1.6);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	pdfCoverMetaChip(doc, theme, width, cx, details);
}

function pdfCoverUniversity(doc, course, options, theme, header, identity, width, cx, details) {
	const accent = theme.accent;
	// Formal double rule
	doc.lineWidth(2.2).strokeColor(accent)
		.moveTo(doc.page.margins.left, doc.y)
		.lineTo(doc.page.margins.left + width, doc.y)
		.stroke();
	doc.moveDown(0.5);
	doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(11)
		.text([header.schoolName, header.academy, header.ministry].filter(Boolean).join('  ·  '), { align: 'center' });
	doc.moveDown(0.3);
	doc.fillColor('#64748b').font('Helvetica').fontSize(9)
		.text([header.academicYear, header.level, header.group].filter(Boolean).join('  ·  '), { align: 'center' });
	doc.moveDown(1.4);
	doc.lineWidth(2.2).strokeColor(accent)
		.moveTo(doc.page.margins.left, doc.y)
		.lineTo(doc.page.margins.left + width, doc.y)
		.stroke();
	doc.moveDown(1);
	doc.fillColor(accent).font('Helvetica-Bold').fontSize(theme.title + 2)
		.text(course.name || 'Course', { align: 'center', lineGap: 8 });
	doc.moveDown(0.8);
	if (course.description) {
		doc.fillColor('#374151').font('Helvetica').fontSize(12).text(course.description, {
			align: 'center',
			width: doc.page.width * 0.7,
			lineGap: 5,
		});
		doc.moveDown(1.2);
	}
	if (course.category_path) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10)
			.text(course.category_path, { align: 'center' });
		doc.moveDown(1.4);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	doc.lineWidth(2.2).strokeColor(accent)
		.moveTo(doc.page.margins.left, doc.y)
		.lineTo(doc.page.margins.left + width, doc.y)
		.stroke();
	pdfCoverMetaChip(doc, theme, width, cx, details);
}

function pdfCoverElegant(doc, course, options, theme, header, identity, width, cx, details) {
	const accent = theme.accent;
	doc.moveDown(3);
	const eyebrow = String(header.subject || '').trim();
	if (eyebrow) {
		doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(10)
			.text(eyebrow, { align: 'center', characterSpacing: 3 });
		doc.moveDown(1);
	}
	// Thin double rule above the title
	doc.lineWidth(0.8).strokeColor(accent)
		.moveTo(cx - width * 0.28, doc.y).lineTo(cx + width * 0.28, doc.y).stroke();
	doc.moveDown(0.6);
	doc.fillColor(accent).font('Helvetica-Bold').fontSize(theme.title + 4)
		.text(course.name || 'Course', { align: 'center', width: width * 0.86, lineGap: 8 });
	doc.moveDown(0.6);
	doc.lineWidth(0.8).strokeColor(accent)
		.moveTo(cx - width * 0.28, doc.y).lineTo(cx + width * 0.28, doc.y).stroke();
	doc.moveDown(1);
	if (course.description) {
		doc.fillColor('#526174').font('Helvetica-Oblique').fontSize(12.5).text(course.description, {
			align: 'center', width: doc.page.width * 0.7, lineGap: 4,
		});
		doc.moveDown(0.8);
	}
	if (course.category_path) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10)
			.text(course.category_path, { align: 'center' });
		doc.moveDown(1.2);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	pdfCoverMetaChip(doc, theme, width, cx, details);
}

function pdfCoverMinimal(doc, course, options, theme, header, identity, width, cx, details) {
	const accent = theme.accent;
	doc.moveDown(5);
	doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(theme.title + 3)
		.text(course.name || 'Course', { align: 'center', width: width * 0.9, lineGap: 8 });
	doc.moveDown(0.8);
	// Single hairline rule, short and centred
	doc.lineWidth(1).strokeColor(accent)
		.moveTo(cx - 60, doc.y).lineTo(cx + 60, doc.y).stroke();
	doc.moveDown(1);
	if (course.description) {
		doc.fillColor('#475569').font('Helvetica').fontSize(12).text(course.description, {
			align: 'center', width: doc.page.width * 0.66, lineGap: 5,
		});
		doc.moveDown(0.8);
	}
	if (course.category_path) {
		doc.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(10)
			.text(course.category_path, { align: 'center' });
		doc.moveDown(1.4);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	pdfCoverMetaChip(doc, theme, width, cx, details);
}

function pdfCoverMetaChip(doc, theme, width, cx, details) {
	if (!details || !details.length) return;
	const chipText = details.join('     ·     ');
	const fill = theme.soft;
	doc.save().roundedRect(doc.page.margins.left + 18, doc.y, width - 36, 40, 6)
		.fill(fill).restore();
	doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(10)
		.text(chipText, doc.page.margins.left + 28, doc.y + 13, { width: width - 56, align: 'center' });
	doc.moveDown(1.8);
}


/** Cover "general information" as a centred Label/Value/Label/Value grid —
 * shaded label cells and hairline borders, mirroring the Word cover and the
 * preparation-sheet identity table. Values are short, so each cell is a single
 * line (ellipsis guards a rare overflow). */
function pdfCoverIdentityTable(doc, identity, theme, width) {
	if (!identity.length) return;
	const accent = theme.accent;
	const soft = theme.soft;
	doc.fillColor(accent).font('Helvetica-Bold').fontSize(9)
		.text('DOCUMENT IDENTITY', { align: 'center', characterSpacing: 1.5 });
	doc.moveDown(0.4);
	const tableW = Math.min(width * 0.82, 470);
	const startX = doc.page.margins.left + (width - tableW) / 2;
	const lw = Math.round(tableW * 0.26);
	const vw = Math.round(tableW * 0.24);
	const cols = [lw, vw, lw, tableW - lw - vw - lw];
	const padX = 6;
	const fontSize = 8.5;
	const rowH = 17;
	// pdfkit's `ellipsis` option only works with automatic line breaks, so long
	// values wrapped over the fixed-height row — truncate them by measured width.
	const fitCell = (txt, font, maxW) => {
		doc.font(font).fontSize(fontSize);
		let s = String(txt || '');
		if (!s || doc.widthOfString(s, { characterSpacing: 0 }) <= maxW) return s;
		while (s.length > 1 && doc.widthOfString(`${s}…`, { characterSpacing: 0 }) > maxW) s = s.slice(0, -1);
		return `${s.trimEnd()}…`;
	};
	const rows = [];
	for (let i = 0; i < identity.length; i += 2) rows.push([identity[i], identity[i + 1]]);
	const top = doc.y;
	rows.forEach((pair, ri) => {
		const [a, b] = pair;
		const cells = b ? [a[0], a[1], b[0], b[1]] : [a[0], a[1], '', ''];
		let x = startX;
		cells.forEach((txt, ci) => {
			const isLabel = ci % 2 === 0;
			const cw = cols[ci];
			if (isLabel && txt) doc.rect(x, top + ri * rowH, cw, rowH).fill(soft);
			x += cw;
		});
	});
	rows.forEach((pair, ri) => {
		const [a, b] = pair;
		const cells = b ? [a[0], a[1], b[0], b[1]] : [a[0], a[1], '', ''];
		const y = top + ri * rowH;
		let x = startX;
		cells.forEach((txt, ci) => {
			const isLabel = ci % 2 === 0;
			const cw = cols[ci];
			const font = isLabel ? 'Helvetica-Bold' : 'Helvetica';
			doc.fillColor(isLabel ? accent : '#374151').font(font).fontSize(fontSize)
				.text(fitCell(txt, font, cw - padX * 2), x + padX, y + 4, { width: cw - padX * 2, lineBreak: false });
			doc.strokeColor('#B7C3D0').lineWidth(0.6).rect(x, y, cw, rowH).stroke();
			x += cw;
		});
	});
	doc.y = top + rows.length * rowH + 16;
	doc.font('Helvetica').fontSize(11).fillColor('#273449');
}

/** Slim running header (teacher · school year) stamped in the top margin of
 * every page except the cover, which already carries the full identity. */
function drawPdfRunningHeader(doc, options, theme, skipCover) {
	const h = options.header || {};
	const left = String(h.teacherName || '').trim();
	const right = String(h.academicYear || '').trim();
	if (!left && !right) return;
	const range = doc.bufferedPageRange();
	for (let index = range.start; index < range.start + range.count; index++) {
		if (skipCover && index === range.start) continue;
		doc.switchToPage(index);
		const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
		const y = 26;
		doc.font('Helvetica-Bold').fontSize(8).fillColor(theme.accent)
			.text(left, doc.page.margins.left, y, { width: width * 0.6, lineBreak: false });
		doc.font('Helvetica').fontSize(8).fillColor('#526174')
			.text(right, doc.page.margins.left, y, { width, align: 'right', lineBreak: false });
		doc.moveTo(doc.page.margins.left, y + 11).lineTo(doc.page.margins.left + width, y + 11)
			.lineWidth(0.5).strokeColor(theme.accent).stroke();
	}
}

function drawPdfFooter(doc, course, pageRange, skipCover) {
	const range = doc.bufferedPageRange();
	for (let index = range.start; index < range.start + range.count; index++) {
		// The cover page keeps no footer and no number.
		if (skipCover && index === range.start) continue;
		doc.switchToPage(index);
		const pageNo = index - range.start + 1;
		const bottom = doc.page.height - doc.page.margins.bottom + 14;
		const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
		doc.moveTo(doc.page.margins.left, bottom - 7).lineTo(doc.page.margins.left + width, bottom - 7)
			.lineWidth(0.5).strokeColor('#d2d8e0').stroke();
		// The footer sits inside the bottom margin, past page.maxY — without this
		// temporary release pdfkit would stamp each footer onto a fresh blank page.
		const savedBottom = doc.page.margins.bottom;
		doc.page.margins.bottom = 0;
		doc.font('Helvetica').fontSize(8).fillColor('#64748b')
			.text(course.name || 'Course', doc.page.margins.left, bottom, { width: width * 0.72, lineBreak: false });
		doc.text(`${pageNo} / ${pageRange}`, doc.page.margins.left + width * 0.72, bottom, { width: width * 0.28, align: 'right', lineBreak: false });
		doc.page.margins.bottom = savedBottom;
	}
}

function addPdfLesson(doc, lesson, theme, path, options, forceNewPage = false, depth = 0) {
	if (forceNewPage) doc.addPage();
	doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(theme.section + 1)
		.text(lesson.title || 'Untitled lesson', { indent: depth * 16, lineGap: 3 });
	if (path && options.includeLessonPath) {
		doc.moveDown(0.2);
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(theme.body - 0.5)
			.text(formatPath(path), { paragraphGap: 2 });
	}
	if (lesson.summary) {
		doc.moveDown(0.4);
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(theme.body)
			.text(lesson.summary, { lineGap: 2 });
	}
	doc.moveDown(theme.compact ? 0.5 : 0.9);
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
		const numeration = options.numerationTemplate || 'default';
		const doc = new PDFDocument({
			size: 'A4',
			margins: { top: 52, right: 54, bottom: 56, left: 54 },
			bufferPages: true,
			info: {
				Title: course.name || 'Course',
				Author: options.header?.teacherName || 'Quiz App',
				Subject: options.header?.subject || course.name || 'Course',
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
			doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(theme.section + 2)
				.text('Contents', { characterSpacing: 1.2 });
			const tocRuleY = doc.y + 4;
			doc.moveTo(doc.page.margins.left, tocRuleY)
				.lineTo(doc.page.width - doc.page.margins.right, tocRuleY)
				.lineWidth(0.8).strokeColor(theme.accent).stroke();
			doc.y = tocRuleY + 12;
			const renderToc = (nodes, depth, path) => {
				let sib = 0;
				for (const node of nodes) {
					sib += 1;
					const sign = sectionSign(numeration, depth, sib, path.map((p) => p.index));
					const myPath = [...path, { sign, name: node.name, depth, index: sib }];
					if (node.name) {
						doc.moveDown(depth === 0 ? 0.45 : 0.2);
						doc.fillColor(theme.accent).font('Helvetica-Bold')
							.fontSize(depth === 0 ? theme.body + 0.5 : theme.body)
							.text(`${sign}${node.name}`, {
								indent: depth * 16,
								characterSpacing: depth === 0 ? 0.6 : 0,
								paragraphGap: 1,
							});
						doc.moveDown(0.15);
					}
					let lseq = 0;
					node.lessons.forEach((lesson) => {
						lseq += 1;
						const marker = node.name
							? `${lseq}) `
							: `${sign}${node.lessons.length > 1 ? `${lseq}) ` : ''}`;
						doc.fillColor('#374151').font('Helvetica').fontSize(theme.body - 0.5)
							.text(`${marker}${lesson.title || 'Untitled lesson'}`, {
								indent: (depth + 1) * 16 + 8,
								paragraphGap: 1.4,
								lineGap: 0.5,
							});
					});
					renderToc(node.children, depth + 1, myPath);
				}
			};
			renderToc(sections, 0, []);
		}

		let lessonIndex = 0;
		const containsLessons = (node) => node.lessons.length > 0 || node.children.some(containsLessons);
		const visit = (nodes, path, isFirstTop = true) => {
			let sib = 0;
			for (const node of nodes) {
				sib += 1;
				const sign = sectionSign(numeration, node.depth, sib, path.map((p) => p.index));
				const myPath = [...path, { sign, name: node.name, depth: node.depth, index: sib }];
				const isTopLevel = node.depth === 0;
				if (isTopLevel && !isFirstTop && !options.startEachLessonOnNewPage) doc.addPage();
				if (options.startEachLessonOnNewPage && lessonIndex > 0 && containsLessons(node)) doc.addPage();
				if (node.name) {
					if (!(isTopLevel && !isFirstTop && !options.startEachLessonOnNewPage) && lessonIndex > 0) doc.moveDown(theme.compact ? 0.6 : 1);
					doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(Math.max(11, theme.section - node.depth * 2))
						.text(`${sign}${node.name}`, { indent: node.depth * 16, lineGap: 2, characterSpacing: node.depth === 0 ? 0.5 : 0 });
					// Hairline under every section title — same outline language as the TOC.
					const sectionRuleY = doc.y + 1;
					doc.moveTo(doc.page.margins.left + node.depth * 16, sectionRuleY)
						.lineTo(doc.page.width - doc.page.margins.right, sectionRuleY)
						.lineWidth(0.6).strokeColor('#CBD5E1').stroke();
					doc.y = sectionRuleY;
					doc.moveDown(0.55);
				}
				node.lessons.forEach((lesson) => {
					lessonIndex += 1;
					const newPage = options.startEachLessonOnNewPage && lessonIndex > 1;
					addPdfLesson(doc, lesson, theme, myPath, options, newPage, node.depth + 1);
				});
				visit(node.children, myPath, false);
				isFirstTop = false;
			}
		};
		if ((options.includeCover !== false || options.includeTableOfContents !== false) && lessons.length) doc.addPage();
		visit(sections, []);
		const pageCount = doc.bufferedPageRange().count;
		drawPdfRunningHeader(doc, options, theme, options.includeCover !== false);
		drawPdfFooter(doc, course, pageCount, options.includeCover !== false);
		doc.end();
	});
}

// Word refuses to open a .docx whose XML carries C0 control characters —
// and they do sneak in: vertical tab (\x0B) and form feed (\x0C) arrive with
// lesson content pasted or imported from Word/PDF documents. The docx library
// escapes & and <, but not these, and XML 1.0 only allows \t \n \r.
const stripInvalidXmlChars = (text) =>
	String(text == null ? '' : text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function makeRun(text, options = {}) {
	return new TextRun({
		text: stripInvalidXmlChars(text),
		font: options.font || 'Arial',
		size: options.size || 22,
		bold: Boolean(options.bold),
		italics: Boolean(options.italics),
		color: options.color || '273449',
		...(options.tracking ? { characterSpacing: options.tracking } : {}),
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
	const text = fields.map(([label, value]) => `${label}: ${value}`).join('   ·   ');
	const alignment = layout === 'split' ? AlignmentType.BOTH : AlignmentType.CENTER;
	const headerChildren = [];
	if (layout === 'split') {
		const splitIndex = Math.ceil(fields.length / 2);
		headerChildren.push(
			new Paragraph({ children: [makeRun(fields.slice(0, splitIndex).map(([label, value]) => `${label}: ${value}`).join('   ·  ') || ' ', { size: 17, bold: true, color: noHash(theme.accent) })], alignment: AlignmentType.LEFT }),
			new Paragraph({ children: [makeRun(fields.slice(splitIndex).map(([label, value]) => `${label}: ${value}`).join('   ·  ') || ' ', { size: 16, color: noHash(theme.accent) })], alignment: AlignmentType.RIGHT }),
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
	return new Header({ children: headerChildren });
}

function docxCover(course, options, theme, sections) {
	const paragraphs = [];
	const accent = noHash(theme.accent);
	const header = options.header || {};
	const coverTemplate = options.coverTemplate || 'academic';
	const school = options.header?.schoolName;
	const identity = [
		['Teacher', header.teacherName],
		['Subject', header.subject],
		['Level / class', header.level],
		['Group', header.group],
		['Academic year', header.academicYear],
		['Date', header.date],
	].filter(([, value]) => String(value || '').trim());
	const coverMeta = [
		`${sortedLessons(course).length} lesson${sortedLessons(course).length === 1 ? '' : 's'}`,
		`${sections.length} section${sections.length === 1 ? '' : 's'}`,
		options.header?.academicYear,
		options.header?.level,
	].filter(Boolean).join('   ·   ');

	if (coverTemplate === 'modern') {
		docxCoverModern(paragraphs, course, options, theme, header, identity, coverMeta, accent);
	} else if (coverTemplate === 'book') {
		docxCoverBook(paragraphs, course, options, theme, header, identity, coverMeta, accent);
	} else if (coverTemplate === 'university') {
		docxCoverUniversity(paragraphs, course, options, theme, header, identity, coverMeta, accent);
	} else if (coverTemplate === 'elegant') {
		docxCoverElegant(paragraphs, course, options, theme, header, identity, coverMeta, accent);
	} else if (coverTemplate === 'minimal') {
		docxCoverMinimal(paragraphs, course, options, theme, header, identity, coverMeta, accent);
	} else {
		docxCoverAcademic(paragraphs, course, options, theme, header, school, identity, coverMeta, accent);
	}
	return paragraphs;
}

function docxCoverAcademic(paragraphs, course, options, theme, header, school, identity, coverMeta, accent) {
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
	docxCoverIdentity(paragraphs, identity, accent, theme);
	docxCoverMeta(paragraphs, coverMeta, accent, theme);
}

function docxCoverModern(paragraphs, course, options, theme, header, identity, coverMeta, accent) {
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: theme.title * 2, color: 'FFFFFF' })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 1600, after: 300 },
		shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
		border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 8 } },
	}));
	if (course.description) paragraphs.push(new Paragraph({
		children: [makeRun(course.description, { size: 22, color: 'F1F5F9' })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 300, after: 500 },
		shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
	}));
	if (course.category_path) paragraphs.push(new Paragraph({
		children: [makeRun(course.category_path, { size: 18, italics: true, color: 'CBD5E1' })],
		alignment: AlignmentType.CENTER,
		spacing: { after: 700 },
		shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
	docxCoverMeta(paragraphs, coverMeta, accent, theme);
}

function docxCoverBook(paragraphs, course, options, theme, header, identity, coverMeta, accent) {
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: theme.title * 2 + 4, color: accent })],
		alignment: AlignmentType.LEFT,
		spacing: { before: 2200, after: 400 },
		border: { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 12 } },
	}));
	paragraphs.push(new Paragraph({
		children: [makeRun('A course document prepared for study and reference.', { size: 18, color: '374151' })],
		alignment: AlignmentType.LEFT,
		spacing: { after: 1000 },
		border: { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 12 } },
	}));
	if (course.category_path) paragraphs.push(new Paragraph({
		children: [makeRun(course.category_path, { size: 17, italics: true, color: '64748B' })],
		alignment: AlignmentType.LEFT,
		spacing: { after: 1000 },
		border: { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 12 } },
	}));
	if (course.description) paragraphs.push(new Paragraph({
		children: [makeRun(course.description, { size: 18, italics: true, color: '475569' })],
		alignment: AlignmentType.LEFT,
		spacing: { after: 1400 },
		border: { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 12 } },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
	docxCoverMeta(paragraphs, coverMeta, accent, theme);
}

function docxCoverUniversity(paragraphs, course, options, theme, header, identity, coverMeta, accent) {
	paragraphs.push(new Paragraph({
		children: [makeRun([header.schoolName, header.academy, header.ministry].filter(Boolean).join('  ·  '), { bold: true, size: 17, color: accent })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 2000, after: 200 },
		border: {
			top: { style: BorderStyle.SINGLE, size: 14, color: accent, space: 6 },
			bottom: { style: BorderStyle.SINGLE, size: 14, color: accent, space: 6 },
		},
	}));
	paragraphs.push(new Paragraph({
		children: [makeRun([header.academicYear, header.level, header.group].filter(Boolean).join('  ·  '), { size: 14, color: '64748B' })],
		alignment: AlignmentType.CENTER,
		spacing: { after: 1000 },
		border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: accent, space: 6 } },
	}));
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: theme.title * 2, color: accent })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 600, after: 400 },
		border: { top: { style: BorderStyle.SINGLE, size: 14, color: accent, space: 6 } },
	}));
	if (course.description) paragraphs.push(new Paragraph({
		children: [makeRun(course.description, { size: 20, color: '374151' })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 300, after: 500 },
	}));
	if (course.category_path) paragraphs.push(new Paragraph({
		children: [makeRun(course.category_path, { size: 17, italics: true, color: '64748B' })],
		alignment: AlignmentType.CENTER,
		spacing: { after: 700 },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
	docxCoverMeta(paragraphs, coverMeta, accent, theme);
}

/** Elegant: a formal centred composition framed by thin double rules. */
function docxCoverElegant(paragraphs, course, options, theme, header, identity, coverMeta, accent) {
	const eyebrow = String(header.subject || '').trim();
	if (eyebrow) paragraphs.push(new Paragraph({
		children: [makeRun(eyebrow, { bold: true, size: 15, color: '64748B', tracking: 30 })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 2600, after: 260 },
	}));
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: theme.title * 2 + 4, color: accent, font: theme.font })],
		alignment: AlignmentType.CENTER,
		spacing: { before: eyebrow ? 120 : 2600, after: 120 },
		border: {
			top: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 14 },
			bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 14 },
		},
	}));
	if (course.description) paragraphs.push(new Paragraph({
		children: [makeRun(course.description, { size: 22, italics: true, color: '526174', font: theme.font })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 260, after: 300 },
	}));
	if (course.category_path) paragraphs.push(new Paragraph({
		children: [makeRun(course.category_path, { size: 18, italics: true, color: '64748B' })],
		alignment: AlignmentType.CENTER,
		spacing: { after: 300 },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
	docxCoverMeta(paragraphs, coverMeta, accent, theme);
}

/** Minimal: generous whitespace, a single hairline rule, centred title. */
function docxCoverMinimal(paragraphs, course, options, theme, header, identity, coverMeta, accent) {
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: theme.title * 2 + 2, color: '1F2937', font: theme.font })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 3200, after: 160 },
	}));
	paragraphs.push(new Paragraph({
		children: [makeRun('', {})],
		alignment: AlignmentType.CENTER,
		spacing: { after: 200 },
		border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 0 } },
	}));
	if (course.description) paragraphs.push(new Paragraph({
		children: [makeRun(course.description, { size: 21, color: '475569' })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 120, after: 260 },
	}));
	if (course.category_path) paragraphs.push(new Paragraph({
		children: [makeRun(course.category_path, { size: 17, italics: true, color: '94A3B8' })],
		alignment: AlignmentType.CENTER,
		spacing: { after: 300 },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
	docxCoverMeta(paragraphs, coverMeta, accent, theme);
}

function docxCoverIdentity(paragraphs, identity, accent, theme) {
	if (!identity.length) return;
	paragraphs.push(new Paragraph({
		children: [makeRun('DOCUMENT IDENTITY', { bold: true, size: 13, color: accent, italics: true })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 400, after: 200 },
		keepNext: true,
	}));
	paragraphs.push(docxCoverIdentityTable(identity, theme));
}

function docxCoverMeta(paragraphs, coverMeta, accent, theme) {
	if (!coverMeta) return;
	paragraphs.push(new Paragraph({
		children: [makeRun(coverMeta, { size: 19, bold: true, color: accent })],
		alignment: AlignmentType.CENTER,
		shading: { type: ShadingType.CLEAR, fill: noHash(theme.soft), color: 'auto' },
		spacing: { before: 700, after: 1800 },
	}));
}

const HEADING_LEVELS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function headingLevelForDepth(depth) {
	return HEADING_LEVELS[Math.min(depth, HEADING_LEVELS.length - 1)] || HeadingLevel.HEADING_6;
}

function docxParagraphs(course, options, theme) {
	const accent = noHash(theme.accent);
	const lessons = sortedLessons(course);
	const sections = buildDocumentSections(course);
	const numeration = options.numerationTemplate || 'default';
	const paragraphs = [];
	if (options.includeCover !== false) {
		paragraphs.push(...docxCover(course, options, theme, sections));
	}

	if (options.includeTableOfContents !== false && lessons.length) {
		paragraphs.push(new Paragraph({
			text: 'Contents',
			heading: HeadingLevel.HEADING_1,
			pageBreakBefore: options.includeCover !== false,
			spacing: { after: 40 },
		}));
		// Thin accent rule under the title, then breathing room before the list.
		paragraphs.push(new Paragraph({
			text: '',
			border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 0 } },
			spacing: { after: 260 },
		}));
		const renderToc = (nodes, depth, path) => {
			let sib = 0;
			for (const node of nodes) {
				sib += 1;
				const sign = sectionSign(numeration, depth, sib, path.map((p) => p.index));
				const myPath = [...path, { sign, name: node.name, depth, index: sib }];
				if (node.name) {
					paragraphs.push(new Paragraph({
						children: [
							makeRun(sign, { bold: true, color: accent, size: 21 }),
							makeRun(node.name, { bold: true, color: accent, size: 21, ...(depth === 0 ? { tracking: 10 } : {}) }),
						],
						indent: depth ? { left: Math.min(depth * 360, 1800) } : undefined,
						spacing: { before: depth === 0 ? 200 : 120, after: 40 },
						border: depth === 0 ? { bottom: { style: BorderStyle.DOTTED, size: 4, color: 'CBD5E1', space: 4 } } : undefined,
					}));
				}
				let lseq = 0;
				node.lessons.forEach((lesson) => {
					lseq += 1;
					// Number TOC lessons. Under a named section they run 1) 2) …;
					// a lesson filed directly (anonymous node) carries the section
					// sign itself, so the TOC is never left unnumbered.
					const marker = node.name
						? `${lseq}) `
						: `${sign}${node.lessons.length > 1 ? `${lseq}) ` : ''}`;
					paragraphs.push(new Paragraph({
						children: [
							makeRun(marker, { bold: true, color: accent, size: 19 }),
							makeRun(lesson.title || 'Untitled lesson', { size: 19, color: '374151' }),
						],
						indent: { left: Math.min((depth + 1) * 360, 1800) + 80 },
						spacing: { before: 20, after: 20 },
					}));
				});
				renderToc(node.children, depth + 1, myPath);
			}
		};
		renderToc(sections, 0, []);
	}

	if (options.includeCover !== false || (options.includeTableOfContents !== false && lessons.length)) {
		// Body starts on a fresh page after the cover/TOC. The old label
		// "Course material" was a redundant divider heading (already on the
		// cover) — drop it and just force the page break here.
		paragraphs.push(new Paragraph({ text: '', pageBreakBefore: true, spacing: { after: 0 } }));
	}

	let lessonIndex = 0;
	const visit = (nodes, path, isFirstTop = true) => {
		let sib = 0;
		for (const node of nodes) {
			sib += 1;
			const sign = sectionSign(numeration, node.depth, sib, path.map((p) => p.index));
			const myPath = [...path, { sign, name: node.name, depth: node.depth, index: sib }];
			const isTopLevel = node.depth === 0;
			if (isTopLevel && !isFirstTop && !options.startEachLessonOnNewPage) {
				paragraphs.push(new Paragraph({ text: '', pageBreakBefore: true, spacing: { after: 0 } }));
			}
			if (node.outlineLesson) {
				const lesson = node.lesson;
				paragraphs.push(new Paragraph({
					children: [
						makeRun(lesson.title || 'Untitled lesson', {
							bold: true,
							size: Math.max(22, (theme.section - node.depth) * 2),
							color: accent,
						}),
					],
					heading: headingLevelForDepth(node.depth),
					pageBreakBefore: lessonIndex > 0 && options.startEachLessonOnNewPage,
					indent: node.depth ? { left: Math.min(node.depth * 360, 1800) } : undefined,
					keepNext: Boolean(lesson.summary),
					spacing: { before: 260, after: 110 },
				}));
				if (lesson.summary) paragraphs.push(new Paragraph({
					children: [makeRun(lesson.summary, { italics: true, size: theme.body * 2, color: '64748B' })],
					keepNext: true,
					spacing: { after: 180 },
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
								// `level` is mandatory: docx serializes bullet options
								// straight into <w:numPr>, and an undefined level emits
								// <w:ilvl/> without w:val — Word then rejects the whole
								// file as corrupt. (`indent` is not a bullet option.)
								bullet: { level: 0 },
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
				visit(node.children, myPath, false);
				isFirstTop = false;
				continue;
			}
			if (node.name) {
				if (!(isTopLevel && !isFirstTop && !options.startEachLessonOnNewPage)) {
					paragraphs.push(new Paragraph({
						children: [makeRun(`${sign}${node.name}`, { bold: true, size: Math.max(14, (theme.section - node.depth) * 2), color: accent })],
						heading: headingLevelForDepth(node.depth),
						// Nested levels must read as nested: Word heading styles
						// carry no indent, so every depth sits on the left margin
						// unless we shift it (same 360 twips step as the TOC).
						indent: node.depth ? { left: Math.min(node.depth * 360, 1800) } : undefined,
						spacing: { before: 260, after: 110 },
						shading: node.depth === 0 ? { type: ShadingType.CLEAR, fill: noHash(theme.soft), color: 'auto' } : undefined,
					}));
				}
			}
			node.lessons.forEach((lesson) => {
				paragraphs.push(new Paragraph({
					children: [makeRun(lesson.title || 'Untitled lesson', { bold: true, size: theme.section * 2, color: accent })],
					heading: HeadingLevel.HEADING_2,
					indent: { left: Math.min((node.depth + 1) * 360, 1800) },
					pageBreakBefore: options.startEachLessonOnNewPage,
					keepNext: Boolean(lesson.summary),
					spacing: { before: 260, after: 110 },
				}));
				if (options.includeLessonPath && myPath.length) {
					paragraphs.push(new Paragraph({
						children: [makeRun(formatPath(myPath), { size: 16, italics: true, color: '64748B' })],
						keepNext: Boolean(lesson.content),
						spacing: { after: 160 },
					}));
				}
				if (lesson.summary) paragraphs.push(new Paragraph({
					children: [makeRun(lesson.summary, { italics: true, size: theme.body * 2, color: '64748B' })],
					keepNext: true,
					spacing: { after: 180 },
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
								// `level` is mandatory: docx serializes bullet options
								// straight into <w:numPr>, and an undefined level emits
								// <w:ilvl/> without w:val — Word then rejects the whole
								// file as corrupt. (`indent` is not a bullet option.)
								bullet: { level: 0 },
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
			});
			visit(node.children, myPath, false);
			isFirstTop = false;
		}
	};
	visit(sections, []);
	return paragraphs;
}

function buildDocumentSections(course) {
	if ((course.lessons || []).some((lesson) => lesson.parent_lesson_id)) {
		return buildLessonOutline(course);
	}
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

export async function renderCourseDocument(course, options) {
	if (options.format === 'pdf') {
		return { buffer: await pdfBuffer(course, options), mime: 'application/pdf', extension: 'pdf' };
	}
	if (options.format !== 'docx') throw new Error(`Unsupported course document format: ${options.format}`);
	const theme = THEMES[options.templateId] || THEMES.classique;
	const pageWidth = 11906;
	const pageHeight = 16838;
	const margin = theme.compact ? 720 : 1000;
	const sections = buildDocumentSections(course);
	const hasCover = options.includeCover !== false;
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
				// Cover page keeps the rich institutional header; every following
				// page gets the slim teacher · year running header instead.
				titlePage: hasCover,
			},
			headers: {
				default: docxRunningHeader(options, theme),
				...(hasCover ? { first: docxHeader(options, theme) } : {}),
			},
			footers: {
				default: docxRunningFooter(course, theme),
				// A cover page is never numbered: titlePage splits the first-page
				// chrome, so give the cover an EMPTY footer and let the running
				// footer start on the contents page.
				...(hasCover ? { first: new Footer({ children: [new Paragraph({ children: [] })] }) } : {}),
			},
			children: docxParagraphs(course, options, theme),
		}],
	}));
	return {
		buffer,
		mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		extension: 'docx',
	};
}
