import PDFDocument from 'pdfkit';
import {
	AlignmentType,
	Bookmark,
	BorderStyle,
	Document,
	Footer,
	Header,
	HeadingLevel,
	LeaderType,
	Packer,
	PageNumber,
	PageReference,
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
import { estimatePageNumbersWith } from 'docx/layout';
import { extractLessonHighlights } from '../../shared/lessonSections.js';

const THEMES = Object.freeze({
	classique: { accent: '#1f3a5f', soft: '#eef2f7', font: 'Georgia', body: 11, title: 20, section: 14, compact: false },
	moderne: { accent: '#0f766e', soft: '#e6f4f1', font: 'Arial', body: 11, title: 21, section: 15, compact: false },
	compact: { accent: '#b45309', soft: '#fbf0e2', font: 'Arial', body: 10, title: 18, section: 13, compact: true },
	ultra: { accent: '#be123c', soft: '#fdeaef', font: 'Arial', body: 9, title: 17, section: 12, compact: true },
	officiel: { accent: '#1b2a44', soft: '#f2f4f7', font: 'Georgia', body: 11, title: 19, section: 14, compact: false },
	college: { accent: '#15803d', soft: '#e9f6ec', font: 'Arial', body: 11, title: 20, section: 14, compact: false },
});

const ptToTwips = (value) => Math.round(value * 20);
const noHash = (value) => value.replace('#', '').toUpperCase();
const normalizeCoverText = (value) => String(value || '')
	.normalize('NFKD')
	.replace(/[\u0300-\u036f]/g, '')
	.replace(/[^a-z0-9]+/gi, ' ')
	.trim()
	.toLowerCase();

/**
 * The category breadcrumb shown under the cover title. A course's last
 * category segment is usually its own name, so only the ancestor path is
 * kept — the title already carries the module name and repeating it on the
 * same page is exactly the duplication this pass removes.
 */
function coverContextLine(course) {
	const path = String(course?.category_path || '').trim();
	if (!path) return '';
	const name = normalizeCoverText(course?.name);
	if (!name) return path;
	if (normalizeCoverText(path) === name) return '';
	const parts = path.split(/\s*>\s*/).filter(Boolean);
	if (parts.length > 1 && normalizeCoverText(parts[parts.length - 1]) === name) {
		return parts.slice(0, -1).join(' › ');
	}
	return path;
}

/** Identity rows minus anything already stated in the header or the title. */
function coverIdentity(course, options) {
	const header = options.header || {};
	const banned = new Set(
		[header.ministry, header.academy, course?.name, course?.description]
			.map(normalizeCoverText)
			.filter(Boolean),
	);
	const seen = new Set();
	return [
		['Teacher', header.teacherName],
		['Institution information', header.schoolName],
		['Level / class', header.level],
		['Group', header.group],
		['Academic year', header.academicYear],
		['Date', header.date],
	].filter(([, value]) => {
		const key = normalizeCoverText(value);
		if (!key || banned.has(key) || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

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
		separator: '- ',
		formats: [(n) => toRoman(n), (n) => String(n), (n) => toAlpha(n, false), (n) => toRoman(n).toLowerCase()],
	},
	decimal: {
		label: 'Decimal (1 · 1.1 · 1.1.1)',
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
		separator: '. ',
		formats: [(n) => toRoman(n), (n) => toRoman(n), (n) => toRoman(n), (n) => toRoman(n)],
	},
	alpha: {
		label: 'Alpha (A · B · C)',
		separator: '. ',
		formats: [(n) => toAlpha(n, true), (n) => toAlpha(n, true), (n) => toAlpha(n, true), (n) => toAlpha(n, true)],
	},
	// The "book", "module" and "academique" presets keep their own rhythm but
	// are rendered numeral-only, exactly like the other templates: structural
	// titles (module, chapter, lesson) are never numbered — only the sections
	// inside a lesson are.
	book: {
		label: 'Book (I · 1 · a · i)',
		separator: ' ',
		formats: [(n) => toRoman(n), (n) => String(n), (n) => toAlpha(n, false), (n) => toRoman(n).toLowerCase()],
	},
	module: {
		label: 'Module (I · 1 · a · i)',
		separator: ' ',
		formats: [(n) => toRoman(n), (n) => String(n), (n) => toAlpha(n, false), (n) => toRoman(n).toLowerCase()],
	},
	// Purely decimal, no letters anywhere — 1 · 1.1 · 1.1.1. Reads as a clean
	// technical syllabus and never collides with roman/alpha conventions.
	progressif: {
		label: 'Progressif (1 · 1.1 · 1.1.1)',
		separator: '. ',
		formats: [
			(n) => String(n),
			(n, depth, idx) => idx.join('.'),
			(n, depth, idx) => idx.join('.'),
			(n, depth, idx) => idx.join('.'),
		],
	},
	// Running outline where each depth keeps the numeral of its own level
	// (I · 1 · 1.1 · 1.1.1).
	academique: {
		label: 'Académique (I · 1 · 1.1 · 1.1.1)',
		separator: ' ',
		formats: [
			(n) => toRoman(n),
			(n, depth, idx) => String(idx[idx.length - 1] || n),
			(n, depth, idx) => idx.slice(1).join('.'),
			(n, depth, idx) => idx.slice(1).join('.'),
		],
	},
});

// Numeral-only sign for a heading nested `depth` levels inside a lesson body
// (Introduction, Definition, Examples…). The template's word labels ("Module",
// "Chapter"…) are deliberately ignored: they describe structural levels, and
// modules/chapters themselves are rendered as unnumbered titles — only the
// sections inside a lesson are numbered by the numeration template.
function lessonSectionSign(template, depth, pathIndex) {
	const tpl = NUMERATION_TEMPLATES[template] || NUMERATION_TEMPLATES.default;
	const formats = tpl.formats;
	const fmt = formats[depth] || formats[formats.length - 1];
	const seq = pathIndex[pathIndex.length - 1];
	return `${fmt(seq, depth, pathIndex)}${tpl.separator}`;
}

function formatPath(path) {
	return path.map((p) => `${p.sign}${p.name}`).join('  /  ');
}

function stripInlineMarkdown(text) {
	return String(text || '').replace(/[`*_~]/g, '');
}

function renderMarkdownPdf(doc, markdown, theme, numeration = 'default') {
	const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
	// Per-lesson heading counters: `##` maps to depth 0 (the first numbered
	// level), `###` to 1, `####` to 2. Reset deeper levels when a shallower
	// heading appears so the path reads 1 · 1.1 · 1.1.1.
	const counters = [];
	for (const raw of lines) {
		const line = raw.trim();
		if (!line) {
			doc.moveDown(theme.compact ? 0.18 : 0.35);
			continue;
		}
		const heading = line.match(/^(#{1,4})\s+(.*)$/);
		if (heading) {
			const depth = Math.max(0, heading[1].length - 2);
			counters.length = depth + 1;
			counters[depth] = (counters[depth] || 0) + 1;
			for (let i = depth + 1; i < counters.length; i += 1) counters[i] = 0;
			const sign = lessonSectionSign(numeration, depth, counters.slice());
			doc.moveDown(theme.compact ? 0.3 : 0.5);
			doc.fillColor(theme.accent).font('Helvetica-Bold')
				.fontSize(heading[1].length <= 2 ? theme.section : theme.body + 2)
				.text(`${sign}${stripInlineMarkdown(heading[2])}`, { paragraphGap: 2 });
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
	// The cover's top band is intentionally minimal: ministry and academy are
	// the only fields that live here; everything else is in the identity table.
	const header = options.header || {};
	const ministry = String(header.ministry || '').trim();
	const academy = String(header.academy || '').trim();
	if (!ministry && !academy) return;
	const layout = options.headerLayout || 'bandeau';
	const left = doc.page.margins.left;
	const right = doc.page.width - doc.page.margins.right;
	const width = right - left;
	const y = doc.y;
	const startX = doc.x;
	const rule = (yy, color = theme.accent, lineWidth = 0.8) => {
		doc.moveTo(left, yy).lineTo(right, yy).lineWidth(lineWidth).strokeColor(color).stroke();
	};
	const leftText = (text, x, ty, w, color = theme.accent, font = 'Helvetica-Bold', size = 9) =>
		doc.font(font).fontSize(size).fillColor(color).text(text, x, ty, { width: w, lineBreak: false });
	const rightText = (text, x, ty, w, color = '#526174', font = 'Helvetica', size = 9) =>
		doc.font(font).fontSize(size).fillColor(color).text(text, x, ty, { width: w, align: 'right', lineBreak: false });

	if (layout === 'centre') {
		const combined = [ministry, academy].filter(Boolean).join('  ·  ');
		doc.font('Helvetica-Bold').fontSize(9).fillColor(theme.accent)
			.text(combined, left, y, { width, align: 'center', lineBreak: false });
		doc.y = y + 16;
		rule(doc.y);
		doc.y += 14;
	} else if (layout === 'boxed') {
		const boxH = 38;
		doc.rect(left, y, width, boxH).lineWidth(0.8).strokeColor(theme.accent).stroke();
		if (ministry) leftText(ministry, left + 10, y + 9, width * 0.58);
		if (academy) rightText(academy, left + 10, y + 9, width - 20);
		doc.y = y + boxH + 10;
	} else if (layout === 'banner') {
		doc.save().rect(left, y, width, 30).fill(theme.accent).restore();
		if (ministry) leftText(ministry, left + 10, y + 9, width * 0.6, '#ffffff');
		if (academy) rightText(academy, left + 10, y + 9, width - 20, '#e2e8f0');
		doc.y = y + 38;
	} else if (layout === 'minimal') {
		const only = ministry || academy;
		doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#64748b')
			.text(only, left, y, { width, align: 'left', lineBreak: false });
		doc.y = y + 14;
	} else if (layout === 'classique') {
		if (ministry) {
			doc.font('Helvetica-Bold').fontSize(9).fillColor(theme.accent)
				.text(ministry, left, y, { width, align: 'center', lineBreak: false });
		}
		if (academy) {
			doc.font('Helvetica').fontSize(8.5).fillColor('#526174')
				.text(academy, left, y + (ministry ? 13 : 0), { width, align: 'center', lineBreak: false });
		}
		doc.y = y + (ministry && academy ? 28 : 18);
		rule(doc.y);
		doc.y += 14;
	} else {
		// 'bandeau' and 'split' keep the compact left/right arrangement.
		if (ministry) leftText(ministry, left, y, width * 0.62);
		if (academy) rightText(academy, left, y, width);
		doc.y = y + 16;
		rule(doc.y);
		doc.y += 14;
	}
	doc.x = startX;
}

/** Rough height of the cover composition, so the block can be centred
 * vertically instead of hugging the top of an otherwise empty page. */
function pdfCoverHeight(doc, course, theme, identity, width) {
	let height = 0;
	const titleW = Math.min(width * 0.86, 520);
	height += doc.font('Helvetica-Bold').fontSize(theme.title + 2)
		.heightOfString(course.name || 'Course', { width: titleW, lineGap: 8 });
	height += 22;
	const context = coverContextLine(course);
	if (course.description) {
		height += doc.font('Helvetica').fontSize(12.5)
			.heightOfString(course.description, { width: doc.page.width * 0.72, lineGap: 4 }) + 18;
	}
	if (context) height += 28;
	if (identity.length) height += 24 + Math.ceil(identity.length / 2) * 17 + 12;
	return height;
}

function pdfCover(doc, course, options, theme) {
	addPdfHeader(doc, course, options, theme);
	const header = options.header || {};
	const coverTemplate = options.coverTemplate || 'academic';
	const identity = coverIdentity(course, options);
	const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
	const cx = doc.page.margins.left + width / 2;
	const decorHeight = { modern: 40, university: 30, elegant: 12, minimal: 8, book: 0, academic: 0 }[coverTemplate] || 0;
	const contentHeight = pdfCoverHeight(doc, course, theme, identity, width) + decorHeight;
	const available = doc.page.height - doc.page.margins.bottom - doc.y;
	// Slightly above the optical centre reads better than exact centring.
	const offset = Math.max(0, (available - contentHeight) / 2);
	doc.y += Math.min(offset, available * 0.42);
	doc.x = doc.page.margins.left;

	if (coverTemplate === 'modern') {
		pdfCoverModern(doc, course, options, theme, header, identity, width, cx);
	} else if (coverTemplate === 'book') {
		pdfCoverBook(doc, course, options, theme, header, identity, width, cx);
	} else if (coverTemplate === 'university') {
		pdfCoverUniversity(doc, course, options, theme, header, identity, width, cx);
	} else if (coverTemplate === 'elegant') {
		pdfCoverElegant(doc, course, options, theme, header, identity, width, cx);
	} else if (coverTemplate === 'minimal') {
		pdfCoverMinimal(doc, course, options, theme, header, identity, width, cx);
	} else {
		pdfCoverAcademic(doc, course, options, theme, header, identity, width, cx);
	}
	// No trailing addPage here: the TOC / body blocks each start with their own
	// page break, and adding one too produced a blank page after the cover.
}

function pdfCoverAcademic(doc, course, options, theme, header, identity, width, cx) {
	const accent = theme.accent;
	const context = coverContextLine(course);
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
	if (context) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(11)
			.text(context, { align: 'center' });
		doc.moveDown(1.2);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	}

function pdfCoverModern(doc, course, options, theme, header, identity, width, cx) {
	const accent = theme.accent;
	const context = coverContextLine(course);
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
	if (context) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10)
			.text(context, { align: 'center' });
		doc.moveDown(1.2);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	}

function pdfCoverBook(doc, course, options, theme, header, identity, width, cx) {
	const accent = theme.accent;
	const context = coverContextLine(course);
	// Left accent bar
	doc.save().rect(doc.page.margins.left, doc.y, 10, 150).fill(accent).restore();
	doc.x = doc.page.margins.left + 22;
	doc.fillColor(accent).font('Helvetica-Bold').fontSize(theme.title + 2)
		.text(course.name || 'Course', { width: width - 40, lineGap: 6 });
	doc.moveDown(0.8);
	doc.fillColor('#374151').font('Helvetica').fontSize(12)
		.text('A course document prepared for study and reference.', { width: width - 40 });
	doc.moveDown(1.2);
	if (context) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10)
			.text(context, { width: width - 40 });
		doc.moveDown(1.2);
	}
	if (course.description) {
		doc.fillColor('#526174').font('Helvetica-Oblique').fontSize(11)
			.text(course.description, { width: width - 40, lineGap: 4 });
		doc.moveDown(1.4);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	}

function pdfCoverUniversity(doc, course, options, theme, header, identity, width, cx) {
	const accent = theme.accent;
	const context = coverContextLine(course);
	// Formal double rule; the institutional details already live in the header
	// (ministry/academy) and the centred table (level/group), so they are not
	// repeated here.
	doc.lineWidth(2.2).strokeColor(accent)
		.moveTo(doc.page.margins.left, doc.y)
		.lineTo(doc.page.margins.left + width, doc.y)
		.stroke();
	doc.moveDown(0.35);
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
	if (context) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10)
			.text(context, { align: 'center' });
		doc.moveDown(1.2);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	doc.lineWidth(2.2).strokeColor(accent)
		.moveTo(doc.page.margins.left, doc.y)
		.lineTo(doc.page.margins.left + width, doc.y)
		.stroke();
	}

function pdfCoverElegant(doc, course, options, theme, header, identity, width, cx) {
	const accent = theme.accent;
	const context = coverContextLine(course);
	doc.moveDown(0.2);
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
	doc.fillColor(accent).font('Helvetica-Bold').fontSize(theme.title + 2)
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
	if (context) {
		doc.fillColor('#64748b').font('Helvetica-Oblique').fontSize(10)
			.text(context, { align: 'center' });
		doc.moveDown(1);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
	}

function pdfCoverMinimal(doc, course, options, theme, header, identity, width, cx) {
	const accent = theme.accent;
	const context = coverContextLine(course);
	doc.moveDown(0.3);
	doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(theme.title + 1)
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
	if (context) {
		doc.fillColor('#94a3b8').font('Helvetica-Oblique').fontSize(10)
			.text(context, { align: 'center' });
		doc.moveDown(1.2);
	}
	if (identity.length) pdfCoverIdentityTable(doc, identity, theme, width);
}

/** Cover "general information" as a centred Label/Value/Label/Value grid —
 * shaded label cells and hairline borders, mirroring the Word cover. */
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

/**
 * Write the page each TOC entry points at. The TOC is laid out before the
 * body, so entries remember their page and y; once pagination is known the
 * numbers are stamped on the buffered TOC pages.
 */
function stampPdfTocPages(doc, entries, pageLookup) {
	if (!entries.length) return;
	const range = doc.bufferedPageRange();
	const accent = '#64748b';
	for (const entry of entries) {
		const targetPage = pageLookup.get(entry.key)
			?? (entry.fallbackKey ? pageLookup.get(entry.fallbackKey) : undefined);
		if (targetPage === undefined) continue;
		doc.switchToPage(entry.pageIndex);
		const right = doc.page.width - doc.page.margins.right;
		const pageNo = String(targetPage - range.start + 1);
		doc.font(entry.font).fontSize(entry.size).fillColor(accent);
		const numberW = doc.widthOfString(pageNo);
		const numberX = right - numberW;
		const textRight = entry.x + doc.widthOfString(entry.label);
		if (numberX - textRight > 14) {
			doc.save()
				.lineWidth(0.5)
				.strokeColor('#cbd5e1')
				.dash(1, { space: 2 })
				.moveTo(textRight + 6, entry.y + entry.size * 0.9)
				.lineTo(numberX - 6, entry.y + entry.size * 0.9)
				.stroke()
				.undash()
				.restore();
		}
		doc.text(pageNo, numberX, entry.y, { lineBreak: false });
	}
	// Footer/header stamping walks every page; start it from the last one.
	doc.switchToPage(range.start + range.count - 1);
}

function addPdfLesson(doc, lesson, theme, path, options, depth = 0, sectionName = '') {
	if (sectionName) {
		doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8.5)
			.text(`AXIS · ${sectionName.toUpperCase()}`, { characterSpacing: 1.6, lineGap: 1 });
		doc.moveDown(0.3);
	}
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
	if (body) renderMarkdownPdf(doc, body, theme, options.numerationTemplate || 'default');
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
		const sections = buildDocumentSections(course, options);
		const lessons = sortedLessons(course);
		const tocEntries = [];
		const pageLookup = new Map();
		const currentPageIndex = () => {
			const range = doc.bufferedPageRange();
			return range.start + range.count - 1;
		};
		if (options.includeCover !== false) {
			pdfCover(doc, course, options, theme);
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
			// Structural levels (modules/chapters) are unnumbered titles, so the
			// TOC reads as an indented outline; only the sections inside each
			// lesson carry the numeration template.
			const renderToc = (nodes, depth, path) => {
				let sib = 0;
				for (const node of nodes) {
					sib += 1;
					const myPath = [...path, { sign: '', name: node.name, depth, index: sib }];
					// A leaf whose only content is its lesson would repeat the same
					// title twice (category name + lesson name); keep the lesson row.
					const leafWithLesson = Boolean(node.name)
						&& node.children.length === 0
						&& node.lessons.length > 0;
					const showNode = Boolean(node.name) && !leafWithLesson;
					const lessonDepth = leafWithLesson ? depth : depth + 1;
					if (showNode) {
						doc.moveDown(depth === 0 ? 0.45 : 0.2);
						const size = depth === 0 ? theme.body + 0.5 : theme.body;
						const x = doc.page.margins.left + depth * 16;
						const firstLesson = firstLessonOfNode(node);
						tocEntries.push({
							key: `node:${documentPathKey(myPath)}`,
							fallbackKey: firstLesson ? `lesson:${firstLesson.id}` : '',
							pageIndex: currentPageIndex(),
							x,
							y: doc.y,
							label: node.name,
							font: 'Helvetica-Bold',
							size,
						});
						doc.fillColor(theme.accent).font('Helvetica-Bold')
							.fontSize(size)
							.text(node.name, {
								indent: depth * 16,
								characterSpacing: depth === 0 ? 0.6 : 0,
								paragraphGap: 1,
							});
						doc.moveDown(0.15);
					}
					node.lessons.forEach((lesson) => {
						const label = lesson.title || 'Untitled lesson';
						const x = doc.page.margins.left + lessonDepth * 16 + 8;
						tocEntries.push({
							key: `lesson:${lesson.id}`,
							pageIndex: currentPageIndex(),
							x,
							y: doc.y,
							label,
							font: 'Helvetica',
							size: theme.body - 0.5,
						});
						doc.fillColor('#374151').font('Helvetica').fontSize(theme.body - 0.5)
							.text(label, {
								indent: lessonDepth * 16 + 8,
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
		const pageState = { hasContent: false };
		const startPage = () => {
			if (pageState.hasContent) {
				doc.addPage();
				pageState.hasContent = false;
			}
		};
		const renderDivider = (node, kind) => {
			const isModule = kind === 'Module';
			doc.y = doc.page.margins.top + (isModule ? 64 : 40);
			doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(9)
				.text(kind.toUpperCase(), { characterSpacing: 2.4, lineGap: 1 });
			doc.moveDown(0.35);
			doc.fillColor(theme.accent).font('Helvetica-Bold').fontSize(isModule ? 22 : 17)
				.text(node.name, { lineGap: 4 });
			doc.moveDown(0.65);
			const ruleY = doc.y;
			doc.moveTo(doc.page.margins.left, ruleY)
				.lineTo(doc.page.width - doc.page.margins.right, ruleY)
				.lineWidth(1).strokeColor(theme.accent).stroke();
			doc.y = ruleY + 18;
			const { goals, keyConcepts } = collectDocumentHighlights(node);
			const dividerList = (title, items) => {
				if (!items.length) return;
				doc.fillColor('#111827').font('Helvetica-Bold').fontSize(theme.body + 2).text(title);
				doc.moveDown(0.2);
				for (const item of items) {
					doc.fillColor('#475569').font('Helvetica').fontSize(theme.body)
						.text(`•  ${item}`, { indent: 12, paragraphGap: 4, lineGap: 1 });
				}
				doc.moveDown(0.35);
			};
			if (isModule) {
				// A module divider is the module's roadmap: its chapters followed by
				// the goals they collectively reach. Both lists stay on this page.
				dividerList('Chapters', collectDocumentChapters(node));
				dividerList('Goals', goals);
			} else {
				dividerList('Goals', goals);
				dividerList('Key concepts', keyConcepts);
			}
			pageState.hasContent = true;
		};
		const visit = (nodes, path, sectionName = '') => {
			let sib = 0;
			for (const node of nodes) {
				sib += 1;
				const myPath = [...path, { sign: '', name: node.name, depth: node.depth, index: sib }];
				if (node.outlineLesson) {
					if (options.startEachLessonOnNewPage && lessonIndex > 0) startPage();
					lessonIndex += 1;
					pageLookup.set(`lesson:${node.lesson.id}`, currentPageIndex());
					addPdfLesson(doc, node.lesson, theme, myPath, options, node.depth, sectionName);
					pageState.hasContent = true;
					visit(node.children, myPath, sectionName);
					continue;
				}
				const kind = node.name ? documentNodeKind(node) : '';
				if (kind) {
					startPage();
					pageLookup.set(`node:${documentPathKey(myPath)}`, currentPageIndex());
					renderDivider(node, kind);
				}
				const nestedSection = node.depth >= 2 && node.name ? node.name : sectionName;
				const separateLessons = options.startEachLessonOnNewPage !== false;
				let firstLessonInNode = true;
				for (const lesson of node.lessons) {
					if (separateLessons || firstLessonInNode) startPage();
					lessonIndex += 1;
					pageLookup.set(`lesson:${lesson.id}`, currentPageIndex());
					addPdfLesson(doc, lesson, theme, myPath, options, 0, nestedSection);
					pageState.hasContent = true;
					firstLessonInNode = false;
				}
				visit(node.children, myPath, nestedSection);
			}
		};
		if ((options.includeCover !== false || options.includeTableOfContents !== false) && lessons.length) doc.addPage();
		visit(sections, []);
		stampPdfTocPages(doc, tocEntries, pageLookup);
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
	// Cover header only: ministry and academy are the only fields here; the
	// rest belongs to the centred identity table so it appears exactly once.
	const header = options.header || {};
	const ministry = String(header.ministry || '').trim();
	const academy = String(header.academy || '').trim();
	if (!ministry && !academy) return new Header({ children: [new Paragraph({ children: [] })] });
	const layout = options.headerLayout || 'bandeau';
	const width = docxContentWidth(theme);
	const accent = noHash(theme.accent);
	const rule = { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 6 } };
	const text = (value, runOptions = {}) => makeRun(value, { size: 17, font: theme.font, ...runOptions });

	let paragraph;
	if (layout === 'centre') {
		paragraph = new Paragraph({
			alignment: AlignmentType.CENTER,
			spacing: { after: 120 },
			border: rule,
			children: [text([ministry, academy].filter(Boolean).join('  ·  '), { bold: true, color: accent })],
		});
	} else if (layout === 'boxed') {
		paragraph = new Paragraph({
			alignment: AlignmentType.CENTER,
			spacing: { after: 120 },
			borders: {
				top: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 6 },
				bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 6 },
				left: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 10 },
				right: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 10 },
			},
			children: [text([ministry, academy].filter(Boolean).join('  ·  '), { bold: true, color: accent })],
		});
	} else if (layout === 'banner') {
		paragraph = new Paragraph({
			alignment: AlignmentType.CENTER,
			spacing: { after: 160 },
			shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
			children: [text([ministry, academy].filter(Boolean).join('  ·  '), { bold: true, color: 'FFFFFF' })],
		});
	} else if (layout === 'minimal') {
		paragraph = new Paragraph({
			alignment: AlignmentType.LEFT,
			spacing: { after: 80 },
			children: [text(ministry || academy, { size: 15, color: '64748B' })],
		});
	} else if (layout === 'classique') {
		paragraph = new Paragraph({
			alignment: AlignmentType.CENTER,
			spacing: { after: 100 },
			border: rule,
			children: [
				text(ministry, { bold: true, color: accent }),
				...(academy ? [new TextRun({ children: ['  ·  '], size: 17, color: '94A3B8', font: theme.font }), text(academy, { color: '526174' })] : []),
			],
		});
	} else {
		// 'bandeau' and 'split': ministry left, academy right on a real tab stop.
		paragraph = new Paragraph({
			tabStops: [{ type: TabStopType.RIGHT, position: width }],
			border: rule,
			children: [
				text(ministry, { bold: true, color: accent }),
				...(academy ? [
					new TextRun({ children: [new Tab()], size: 17, font: theme.font }),
					text(academy, { size: 16, color: '526174' }),
				] : []),
			],
		});
	}
	return new Header({ children: [paragraph] });
}

function docxCover(course, options, theme) {
	const paragraphs = [];
	const accent = noHash(theme.accent);
	const header = options.header || {};
	const coverTemplate = options.coverTemplate || 'academic';
	const identity = coverIdentity(course, options);

	if (coverTemplate === 'modern') {
		docxCoverModern(paragraphs, course, options, theme, header, identity, accent);
	} else if (coverTemplate === 'book') {
		docxCoverBook(paragraphs, course, options, theme, header, identity, accent);
	} else if (coverTemplate === 'university') {
		docxCoverUniversity(paragraphs, course, options, theme, header, identity, accent);
	} else if (coverTemplate === 'elegant') {
		docxCoverElegant(paragraphs, course, options, theme, header, identity, accent);
	} else if (coverTemplate === 'minimal') {
		docxCoverMinimal(paragraphs, course, options, theme, header, identity, accent);
	} else {
		docxCoverAcademic(paragraphs, course, options, theme, header, identity, accent);
	}
	return paragraphs;
}

/** Vertical lead (twips) that puts the cover block near the optical centre. */
function docxCoverLead(course, theme, identity, extraTwips = 0) {
	const usable = DOCX_PAGE.height - 2000;
	let content = (theme.title + 2) * 1.45 * 20 + 600;
	if (course.description) content += Math.min(2600, 300 + String(course.description).length * 5);
	if (coverContextLine(course)) content += 360;
	if (identity.length) content += 320 + Math.ceil(identity.length / 2) * 340;
	content += extraTwips;
	return Math.max(900, Math.round((usable - content) * 0.5));
}

function docxCoverAcademic(paragraphs, course, options, theme, header, identity, accent) {
	const context = coverContextLine(course);
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: (theme.title + 2) * 2, color: accent })],
		alignment: AlignmentType.CENTER,
		spacing: { before: docxCoverLead(course, theme, identity), after: 420 },
		border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: accent, space: 10 } },
	}));
	if (course.description) paragraphs.push(new Paragraph({
		children: [makeRun(course.description, { size: 24, color: '526174' })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 240, after: 460 },
	}));
	if (context) paragraphs.push(new Paragraph({
		children: [makeRun(context, { size: 20, italics: true, color: '64748B' })],
		alignment: AlignmentType.CENTER,
		spacing: { after: 420 },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
	}

function docxCoverModern(paragraphs, course, options, theme, header, identity, accent) {
	const context = coverContextLine(course);
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: (theme.title + 1) * 2, color: 'FFFFFF' })],
		alignment: AlignmentType.CENTER,
		spacing: { before: docxCoverLead(course, theme, identity, 500), after: 300 },
		shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
		border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 8 } },
	}));
	if (course.description) paragraphs.push(new Paragraph({
		children: [makeRun(course.description, { size: 22, color: 'F1F5F9' })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 300, after: 460 },
		shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
	}));
	if (context) paragraphs.push(new Paragraph({
		children: [makeRun(context, { size: 18, italics: true, color: 'CBD5E1' })],
		alignment: AlignmentType.CENTER,
		spacing: { after: 560 },
		shading: { type: ShadingType.CLEAR, fill: accent, color: 'auto' },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
	}

function docxCoverBook(paragraphs, course, options, theme, header, identity, accent) {
	const context = coverContextLine(course);
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: (theme.title + 2) * 2, color: accent })],
		alignment: AlignmentType.LEFT,
		spacing: { before: docxCoverLead(course, theme, identity, 300), after: 400 },
		border: { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 12 } },
	}));
	paragraphs.push(new Paragraph({
		children: [makeRun('A course document prepared for study and reference.', { size: 18, color: '374151' })],
		alignment: AlignmentType.LEFT,
		spacing: { after: 800 },
		border: { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 12 } },
	}));
	if (context) paragraphs.push(new Paragraph({
		children: [makeRun(context, { size: 17, italics: true, color: '64748B' })],
		alignment: AlignmentType.LEFT,
		spacing: { after: 700 },
		border: { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 12 } },
	}));
	if (course.description) paragraphs.push(new Paragraph({
		children: [makeRun(course.description, { size: 18, italics: true, color: '475569' })],
		alignment: AlignmentType.LEFT,
		spacing: { after: 900 },
		border: { left: { style: BorderStyle.SINGLE, size: 24, color: accent, space: 12 } },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
	}

function docxCoverUniversity(paragraphs, course, options, theme, header, identity, accent) {
	const context = coverContextLine(course);
	// Double rule only — ministry/academy sit in the page header and level/group
	// in the identity table, so repeating them here would duplicate the cover.
	paragraphs.push(new Paragraph({
		text: '',
		alignment: AlignmentType.CENTER,
		spacing: { before: docxCoverLead(course, theme, identity, 300), after: 80 },
		border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: accent, space: 6 } },
	}));
	paragraphs.push(new Paragraph({
		text: '',
		alignment: AlignmentType.CENTER,
		spacing: { after: 600 },
		border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: accent, space: 6 } },
	}));
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: (theme.title + 1) * 2, color: accent })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 400, after: 400 },
	}));
	if (course.description) paragraphs.push(new Paragraph({
		children: [makeRun(course.description, { size: 20, color: '374151' })],
		alignment: AlignmentType.CENTER,
		spacing: { before: 300, after: 460 },
	}));
	if (context) paragraphs.push(new Paragraph({
		children: [makeRun(context, { size: 17, italics: true, color: '64748B' })],
		alignment: AlignmentType.CENTER,
		spacing: { after: 520 },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
	}

/** Elegant: a formal centred composition framed by thin double rules. */
function docxCoverElegant(paragraphs, course, options, theme, header, identity, accent) {
	const eyebrow = String(header.subject || '').trim();
	const context = coverContextLine(course);
	const lead = docxCoverLead(course, theme, identity, eyebrow ? 300 : 0);
	if (eyebrow) paragraphs.push(new Paragraph({
		children: [makeRun(eyebrow, { bold: true, size: 15, color: '64748B', tracking: 30 })],
		alignment: AlignmentType.CENTER,
		spacing: { before: lead, after: 260 },
	}));
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: (theme.title + 2) * 2, color: accent, font: theme.font })],
		alignment: AlignmentType.CENTER,
		spacing: { before: eyebrow ? 120 : lead, after: 120 },
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
	if (context) paragraphs.push(new Paragraph({
		children: [makeRun(context, { size: 18, italics: true, color: '64748B' })],
		alignment: AlignmentType.CENTER,
		spacing: { after: 300 },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
	}

/** Minimal: generous whitespace, a single hairline rule, centred title. */
function docxCoverMinimal(paragraphs, course, options, theme, header, identity, accent) {
	const context = coverContextLine(course);
	paragraphs.push(new Paragraph({
		children: [makeRun(course.name || 'Course', { bold: true, size: (theme.title + 1) * 2, color: '1F2937', font: theme.font })],
		alignment: AlignmentType.CENTER,
		spacing: { before: docxCoverLead(course, theme, identity, 200), after: 160 },
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
	if (context) paragraphs.push(new Paragraph({
		children: [makeRun(context, { size: 17, italics: true, color: '94A3B8' })],
		alignment: AlignmentType.CENTER,
		spacing: { after: 300 },
	}));
	docxCoverIdentity(paragraphs, identity, accent, theme);
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

const HEADING_LEVELS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

function headingLevelForDepth(depth) {
	return HEADING_LEVELS[Math.min(depth, HEADING_LEVELS.length - 1)] || HeadingLevel.HEADING_6;
}

/** Stable key for a structural path, shared by the TOC and the body pass. */
function documentPathKey(path) {
	return (path || [])
		.map((item) => `${item.depth}:${item.index}:${String(item.name || '').trim()}`)
		.join('/');
}

/**
 * Word bookmark names are limited to 40 characters and must start with a
 * letter, so the human-readable path is hashed and only a short slug is kept.
 */
function documentBookmarkName(kind, key) {
	const source = `${kind}:${key}`;
	let hash = 2166136261;
	for (let i = 0; i < source.length; i += 1) {
		hash ^= source.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	const slug = String(key || '')
		.replace(/[^A-Za-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 20);
	return `crs_${kind}_${(hash >>> 0).toString(36)}_${slug}`.slice(0, 40);
}

function docxParagraphs(course, options, theme) {
	const accent = noHash(theme.accent);
	const lessons = sortedLessons(course);
	const sections = buildDocumentSections(course, options);
	const numeration = options.numerationTemplate || 'default';
	const paragraphs = [];
	if (options.includeCover !== false) {
		paragraphs.push(...docxCover(course, options, theme));
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
		// Structural levels (modules/chapters) are unnumbered titles; the TOC is
		// an indented outline and only lesson sections carry the numeration.
		const tocTabStops = [{
			type: TabStopType.RIGHT,
			position: docxContentWidth(theme),
			leader: LeaderType.DOT,
		}];
		const renderToc = (nodes, depth, path) => {
			let sib = 0;
			for (const node of nodes) {
				sib += 1;
				const myPath = [...path, { sign: '', name: node.name, depth, index: sib }];
				// A leaf whose only content is its lesson would repeat the same
				// title twice (category name + lesson name); keep the lesson row.
				const leafWithLesson = Boolean(node.name)
					&& node.children.length === 0
					&& node.lessons.length > 0;
				const showNode = Boolean(node.name) && !leafWithLesson;
				const lessonDepth = leafWithLesson ? depth : depth + 1;
				if (showNode) {
					const firstLesson = firstLessonOfNode(node);
					const pageTarget = documentNodeKind(node)
						? documentBookmarkName('node', documentPathKey(myPath))
						: firstLesson
							? documentBookmarkName('lesson', firstLesson.id)
							: '';
					paragraphs.push(new Paragraph({
						children: [
							makeRun(node.name, { bold: true, color: accent, size: 21, ...(depth === 0 ? { tracking: 10 } : {}) }),
							...(pageTarget ? [
								new TextRun({ children: [new Tab()], size: 19, color: '64748B', font: theme.font }),
								new PageReference(pageTarget, { hyperlink: true }),
							] : []),
						],
						tabStops: tocTabStops,
						indent: depth ? { left: Math.min(depth * 360, 1800) } : undefined,
						spacing: { before: depth === 0 ? 200 : 120, after: 40 },
						border: depth === 0 ? { bottom: { style: BorderStyle.DOTTED, size: 4, color: 'CBD5E1', space: 4 } } : undefined,
					}));
				}
				node.lessons.forEach((lesson) => {
					paragraphs.push(new Paragraph({
						children: [
							makeRun(lesson.title || 'Untitled lesson', { size: 19, color: '374151' }),
							new TextRun({ children: [new Tab()], size: 19, color: '64748B', font: theme.font }),
							new PageReference(documentBookmarkName('lesson', lesson.id), { hyperlink: true }),
						],
						tabStops: tocTabStops,
						indent: { left: Math.min(lessonDepth * 360, 1800) + 80 },
						spacing: { before: 20, after: 20 },
					}));
				});
				renderToc(node.children, depth + 1, myPath);
			}
		};
		renderToc(sections, 0, []);
	}

	let lessonIndex = 0;
	let pageHasContent = paragraphs.length > 0;
	const breakPage = () => {
		paragraphs.push(new Paragraph({ text: '', pageBreakBefore: true, spacing: { after: 0 } }));
		pageHasContent = false;
	};
	if (options.includeCover !== false || (options.includeTableOfContents !== false && lessons.length)) {
		// Body starts on a fresh page after the cover/TOC. The old label
		// "Course material" was a redundant divider heading (already on the
		// cover) — drop it and just force the page break here.
		breakPage();
	}

	const docxSectionLabel = (title) => {
		paragraphs.push(new Paragraph({
			children: [makeRun(`AXIS · ${title.toUpperCase()}`, { bold: true, size: 17, color: '64748B', tracking: 20 })],
			spacing: { before: 140, after: 70 },
			keepNext: true,
		}));
	};

	const docxDivider = (node, kind, bookmarkId = '') => {
		const isModule = kind === 'Module';
		paragraphs.push(new Paragraph({
			children: [makeRun(kind.toUpperCase(), { bold: true, size: 16, color: accent, tracking: 30 })],
			spacing: { before: isModule ? 720 : 420, after: 120 },
			keepNext: true,
		}));
		const nameRun = makeRun(node.name, { bold: true, size: isModule ? 44 : 36, color: accent });
		paragraphs.push(new Paragraph({
			children: [bookmarkId ? new Bookmark({ id: bookmarkId, children: [nameRun] }) : nameRun],
			spacing: { after: 180 },
			keepNext: true,
		}));
		paragraphs.push(new Paragraph({
			text: '',
			border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: accent, space: 2 } },
			spacing: { after: 240 },
		}));
		const { goals, keyConcepts } = collectDocumentHighlights(node);
		const addList = (heading, items) => {
			if (!items.length) return;
			paragraphs.push(new Paragraph({
				children: [makeRun(heading, { bold: true, size: 24, color: '111827' })],
				spacing: { before: 80, after: 80 },
				keepNext: true,
			}));
			for (const item of items) {
				paragraphs.push(new Paragraph({
					children: [makeRun(`•  ${item}`, { size: theme.body * 2, color: '475569' })],
					spacing: { after: 70 },
				}));
			}
		};
		addList('Chapters', isModule ? collectDocumentChapters(node) : []);
		addList('Goals', goals);
		if (!isModule) addList('Key concepts', keyConcepts);
		pageHasContent = true;
	};

	const docxLesson = (lesson, myPath, sectionName, headingOptions = {}) => {
		if (sectionName) docxSectionLabel(sectionName);
		const titleRun = makeRun(lesson.title || 'Untitled lesson', {
			bold: true,
			size: headingOptions.size || theme.section * 2,
			color: accent,
		});
		paragraphs.push(new Paragraph({
			children: [headingOptions.bookmark ? new Bookmark({ id: headingOptions.bookmark, children: [titleRun] }) : titleRun],
			heading: headingOptions.heading || HeadingLevel.HEADING_2,
			pageBreakBefore: Boolean(headingOptions.pageBreakBefore),
			indent: headingOptions.indent,
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
			const headingCounters = [];
			for (const raw of content.split('\n')) {
				const line = raw.trim();
				if (!line) continue;
				const heading = line.match(/^(#{1,4})\s+(.*)$/);
				if (heading) {
					const depth = Math.max(0, heading[1].length - 2);
					headingCounters.length = depth + 1;
					headingCounters[depth] = (headingCounters[depth] || 0) + 1;
					for (let k = depth + 1; k < headingCounters.length; k += 1) headingCounters[k] = 0;
					const headingText = `${lessonSectionSign(numeration, depth, headingCounters.slice())}${heading[2]}`;
					paragraphs.push(new Paragraph({
						children: [makeRun(headingText, { bold: true, size: (theme.body + (heading[1].length === 1 ? 4 : 2)) * 2, color: accent })],
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
		pageHasContent = true;
	};

	const visit = (nodes, path, parentSection = '') => {
		let sib = 0;
		for (const node of nodes) {
			sib += 1;
			const myPath = [...path, { sign: '', name: node.name, depth: node.depth, index: sib }];
			if (node.outlineLesson) {
				const lesson = node.lesson;
				const separate = options.startEachLessonOnNewPage && lessonIndex > 0;
				docxLesson(lesson, myPath, '', {
					heading: headingLevelForDepth(node.depth),
					size: Math.max(22, (theme.section - node.depth) * 2),
					indent: node.depth ? { left: Math.min(node.depth * 360, 1800) } : undefined,
					pageBreakBefore: separate,
					bookmark: documentBookmarkName('lesson', lesson.id),
				});
				lessonIndex += 1;
				visit(node.children, myPath, parentSection);
				continue;
			}

			const kind = documentNodeKind(node);
			if (kind) {
				if (pageHasContent) breakPage();
				docxDivider(node, kind, documentBookmarkName('node', documentPathKey(myPath)));
			}
			const section = node.depth >= 2 && node.name ? node.name : parentSection;
			const separateLessons = options.startEachLessonOnNewPage !== false;
			let firstLessonInNode = true;
			for (const lesson of node.lessons) {
				if (pageHasContent && (separateLessons || firstLessonInNode)) breakPage();
				docxLesson(lesson, myPath, section, {
					bookmark: documentBookmarkName('lesson', lesson.id),
				});
				lessonIndex += 1;
				firstLessonInNode = false;
			}
			visit(node.children, myPath, section);
		}
	};
	visit(sections, []);
	return paragraphs;
}

function documentNodeKind(node) {
	if (!node || !node.name) return '';
	if (node.depth === 0) return 'Module';
	if (node.depth === 1) return 'Chapter';
	return '';
}

/** The first lesson rendered inside a structural node, descending through
 * nested axes. Levels without their own divider still need a page target. */
function firstLessonOfNode(node) {
	if (!node) return null;
	if (node.outlineLesson && node.lesson) return node.lesson;
	for (const lesson of node.lessons || []) return lesson;
	for (const child of node.children || []) {
		const found = firstLessonOfNode(child);
		if (found) return found;
	}
	return null;
}

function collectDocumentChapters(node, limit = 12) {
	const chapters = [];
	for (const child of node.children || []) {
		const name = String(child.name || '').trim();
		if (child.depth === 1 && name && !chapters.includes(name)) chapters.push(name);
	}
	return chapters.slice(0, limit);
}

/**
 * Goals and key concepts for a module/chapter divider page. They are read from
 * the Objectives / Key concepts sections of every lesson underneath the node,
 * de-duplicated and capped so the divider stays a one-page overview. When an
 * older course has no such sections, lesson summaries are used as the goals.
 */
function collectDocumentHighlights(node, limit = 10) {
	const objectives = [];
	const keyConcepts = [];
	const summaries = [];
	const add = (target, values) => {
		for (const value of values || []) {
			const text = String(value || '').replace(/\s+/g, ' ').trim();
			if (text && !target.includes(text)) target.push(text);
		}
	};
	const visit = (item) => {
		for (const lesson of item.lessons || []) {
			const highlights = extractLessonHighlights(lesson.content);
			add(objectives, highlights.objectives);
			add(keyConcepts, highlights.keyConcepts);
			if (lesson.summary) add(summaries, [lesson.summary]);
		}
		for (const child of item.children || []) visit(child);
	};
	visit(node);
	return {
		goals: (objectives.length ? objectives : summaries).slice(0, limit),
		keyConcepts: keyConcepts.slice(0, limit),
	};
}

function buildDocumentSections(course, options = {}) {
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
	// The category table has its own manual/name order; the export passes it as
	// `categoryOrder`, and the document keeps the exact same sequence.
	const order = new Map();
	(options.categoryOrder || []).forEach((id, index) => {
		if (id != null && id !== '') order.set(String(id), index);
	});
	if (!order.size) return roots;
	const rank = (node, memo = new Map()) => {
		if (memo.has(node)) return memo.get(node);
		let value = order.has(String(node.key)) ? order.get(String(node.key)) : Number.POSITIVE_INFINITY;
		for (const child of node.children) value = Math.min(value, rank(child, memo));
		for (const lesson of node.lessons) {
			const id = String(lesson.category_id || '');
			if (order.has(id)) value = Math.min(value, order.get(id));
		}
		memo.set(node, value);
		return value;
	};
	const sortNodes = (list) => {
		// Reassign: sortNodes returns a NEW array, and the document visits
		// node.children later — an ignored return left siblings in lesson order.
		for (const node of list) node.children = sortNodes(node.children);
		if (list.length < 2) return list;
		const memo = new Map();
		return list
			.map((node, index) => ({ node, index, value: rank(node, memo) }))
			.sort((a, b) => (a.value - b.value) || (a.index - b.index))
			.map((item) => item.node);
	};
	const sortedRoots = sortNodes(roots);
	// Lessons attached to the same node follow their category's table order;
	// order_index only breaks ties (multiple lessons on one leaf).
	const lessonRank = (lesson) => {
		const id = String(lesson.category_id || '');
		return order.has(id) ? order.get(id) : Number.POSITIVE_INFINITY;
	};
	const sortLessons = (nodes) => {
		for (const node of nodes) {
			if (node.lessons.length > 1) {
				node.lessons = node.lessons
					.map((lesson, index) => ({ lesson, index, value: lessonRank(lesson) }))
					.sort((a, b) => (a.value - b.value) || (a.index - b.index))
					.map((item) => item.lesson);
			}
			sortLessons(node.children);
		}
	};
	sortLessons(sortedRoots);
	return sortedRoots;
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
	const sections = buildDocumentSections(course, options);
	const hasCover = options.includeCover !== false;
	const buffer = await Packer.toBuffer(new Document({
		pageNumbers: estimatePageNumbersWith({ guess: true }),
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
