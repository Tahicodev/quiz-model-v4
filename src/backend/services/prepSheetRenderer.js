/**
 * src/backend/services/prepSheetRenderer.js
 *
 * Renders an AI-generated lesson preparation sheet (see AIService.
 * generateLessonPrepSheet) to Word or PDF. Unlike the course/exam renderers
 * this one needs real tables: the Session Distribution grid (5 columns,
 * portrait) and the Detailed Lesson Plan grid (7 columns, its own landscape
 * section/pages). The Session Distribution table is always recomputed from
 * `sessions` — never trusted to the model output.
 *
 * Layout rules applied on purpose (document-design pass):
 *  • General information is a compact Label/Value grid with the lesson title
 *    and session duration given a highlighted band — never a loose paragraph list.
 *  • Table rows never split across pages (DOCX cantSplit, PDF row atomicity)
 *    and header rows repeat when a table continues on the next page.
 *  • Column widths follow content importance; the wide 7-column grid is the
 *    only landscape content. Font size is NOT shrunk to squeeze a table in.
 *  • Headings keep their following content; a session title stays glued to its
 *    table so nothing is orphaned at a page boundary.
 *  • The detailed progression lives in exactly ONE place per session (the
 *    landscape grid); the portrait sheet only points to it — no duplication.
 *
 * Word-corruption guards established the hard way: cell text goes through
 * stripInvalidXmlChars (C0 controls kill the file) and bullets are ONLY ever
 * emitted as `bullet: { level: 0 }` (an undefined level serializes <w:ilvl/>
 * without the required w:val).
 */

import PDFDocument from 'pdfkit';
import { z } from 'zod';
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

export const PREP_SHEET_EXPORT_SCHEMA = z.object({
	format: z.enum(['docx', 'pdf']).default('docx'),
});

const THEME = Object.freeze({ accent: '#1f3a5f', soft: '#eef2f7', font: 'Georgia', body: 11 });
const TO_COMPLETE = 'À compléter';

const stripInvalidXmlChars = (text) =>
	String(text == null ? '' : text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

const asText = (value) => {
	if (value == null) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return '';
};

// "10 min", "1h30", "1:15" → minutes; anything unparseable → NaN.
const parseMinutes = (value) => {
	const s = String(value || '').trim();
	if (!s) return NaN;
	const h = s.match(/(\d+)\s*h\s*(\d+)?/i);
	if (h) return Number(h[1]) * 60 + Number(h[2] || 0);
	const colon = s.match(/^(\d+):(\d{2})$/);
	if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
	const min = s.match(/(\d+(?:[.,]\d+)?)\s*(?:min|m\b|$)/i);
	return min ? Math.round(Number(min[1].replace(',', '.'))) : NaN;
};

const fmtMinutes = (n, labels) => {
	if (!Number.isFinite(n) || n <= 0) return '';
	if (labels === LABELS.English) {
		return n >= 60 && n % 60 === 0 ? `${n / 60} h` : `${n} ${labels.minutesUnit}`;
	}
	// French clock style: 55 min · 1 h · 1 h 20.
	if (n < 60) return `${n} ${labels.minutesUnit}`;
	const h = Math.floor(n / 60);
	const rest = n % 60;
	return rest ? `${h} h ${rest}` : `${h} h`;
};

// FR/EN section labels; sheets default to French per the app's document
// convention, unknown languages fall back to French too.
const LABELS = {
	French: {
		docTitle: 'Fiche de préparation de séance',
		generalInfo: 'Informations générales',
		institution: 'Établissement',
		ministry: 'Ministère',
		academy: 'Académie / Région',
		teacher: 'Enseignant',
		subject: 'Matière',
		level: 'Niveau / Classe',
		group: 'Groupe',
		date: 'Date',
		academicYear: 'Année scolaire',
		module: 'Module / Chapitre',
		lesson: 'Leçon',
		sessionMinutes: 'Durée d\'une séance',
		sessionsTitle: 'Planification des séances',
		sessionsIntro: 'Répartition du contenu en séances, dans l\'ordre de progression pédagogique :',
		sessionsCountWord: 'séance(s)',
		colSession: 'Séance',
		colTitle: 'Titre',
		colContent: 'Contenu à couvrir',
		colObjectives: 'Objectifs d\'apprentissage',
		colDuration: 'Durée estimée',
		total: 'Total',
		sessionSheet: 'Fiche de préparation',
		objectives: 'Objectifs',
		generalObjective: 'Objectif général',
		specificObjectives: 'Objectifs spécifiques',
		prerequisites: 'Prérequis',
		content: 'Contenu de la leçon',
		detailedPlan: 'Déroulement détaillé de la séance',
		detailedPlanNote: 'Le déroulement détaillé (étapes, durée, activités, rôles de l\'enseignant et de l\'élève, supports et résultats attendus) figure dans le tableau récapitulatif en page paysage.',
		colStage: 'Étape',
		colDurationShort: 'Durée',
		colActivities: 'Contenu / Activités',
		colTeacher: 'Rôle de l\'enseignant',
		colStudent: 'Rôle de l\'élève',
		colResources: 'Supports / Ressources',
		colOutcome: 'Résultats attendus',
		methods: 'Méthodes pédagogiques',
		materials: 'Matériel didactique',
		assessment: 'Évaluation',
		colTask: 'Activité d\'évaluation',
		colCriteria: 'Critères',
		colExpected: 'Réponse attendue',
		summary: 'Synthèse',
		keyPoints: 'À retenir',
		homework: 'Devoirs',
		minutesUnit: 'min',
		sessionWord: 'Séance',
		generatedBy: 'Fiche générée par l\'assistant pédagogique — à vérifier et compléter par l\'enseignant.',
	},
	English: {
		docTitle: 'Lesson Preparation Sheet',
		generalInfo: 'General information',
		institution: 'Institution',
		ministry: 'Ministry',
		academy: 'Academy / Region',
		teacher: 'Teacher',
		subject: 'Subject',
		level: 'Level / Class',
		group: 'Group',
		date: 'Date',
		academicYear: 'Academic year',
		module: 'Module / Chapter',
		lesson: 'Lesson',
		sessionMinutes: 'Session length',
		sessionsTitle: 'Session planning',
		sessionsIntro: 'Content split into sessions, in teaching-progression order:',
		sessionsCountWord: 'session(s)',
		colSession: 'Session',
		colTitle: 'Title',
		colContent: 'Content to cover',
		colObjectives: 'Learning objectives',
		colDuration: 'Estimated duration',
		total: 'Total',
		sessionSheet: 'Preparation sheet',
		objectives: 'Objectives',
		generalObjective: 'General objective',
		specificObjectives: 'Specific objectives',
		prerequisites: 'Prerequisites',
		content: 'Lesson content',
		detailedPlan: 'Detailed lesson plan',
		detailedPlanNote: 'The detailed progression (stages, duration, activities, teacher and student roles, resources and expected outcomes) is in the summary table on the landscape pages.',
		colStage: 'Stage',
		colDurationShort: 'Duration',
		colActivities: 'Content / Activities',
		colTeacher: 'Teacher\'s role',
		colStudent: 'Student\'s role',
		colResources: 'Resources',
		colOutcome: 'Expected outcomes',
		methods: 'Teaching methods',
		materials: 'Teaching materials',
		assessment: 'Assessment',
		colTask: 'Assessment task',
		colCriteria: 'Criteria',
		colExpected: 'Expected answer',
		summary: 'Summary',
		keyPoints: 'Key points',
		homework: 'Homework',
		minutesUnit: 'min',
		sessionWord: 'Session',
		generatedBy: 'Sheet generated by the teaching assistant — to be reviewed and completed by the teacher.',
	},
};

const labelsFor = (language) =>
	LABELS[String(language || '').toLowerCase().startsWith('fr') ? 'French'
		: String(language || '').toLowerCase().startsWith('en') ? 'English' : 'French'] || LABELS.French;

/** A session with no content anywhere and a generic title is a model
 * placeholder, not a real session — it must not clutter the planning grid. */
function isEmptySession(r) {
	if (!r) return true;
	if (asText(r.contentSummary).trim()) return false;
	if ((r.planRows || []).length) return false;
	if ((r.specificObjectives || []).some((t) => asText(t).trim())) return false;
	if (asText(r.generalObjective).trim()) return false;
	if ((r.keyConcepts || []).some((c) => asText(c.heading).trim() || asText(c.body).trim())) return false;
	if ((r.assessment || []).some((a) => asText(a.task).trim())) return false;
	const t = asText(r.title).trim();
	return !t || /^s[ée]ance[. ]?$/i.test(t);
}

/**
 * Session rows enriched with server-computed fields: plan minutes total
 * (sum of planRows durations, fallback estimatedMinutes) and a compact
 * objectives cell for the distribution table. Placeholder-only sessions are
 * dropped (unless that would empty the sheet) and the remaining ones are
 * renumbered sequentially so the numbering stays consistent.
 */
function buildSessionRows(sheet) {
	const sessions = Array.isArray(sheet?.sessions) ? sheet.sessions : [];
	const mapped = sessions.map((s, i) => {
		const planSum = (s.planRows || [])
			.map((r) => parseMinutes(r.duration))
			.reduce((acc, n) => (Number.isFinite(n) ? acc + n : acc), 0);
		const estimated = Number.isFinite(planSum) && planSum > 0 ? planSum : s.estimatedMinutes;
		const objectives = [s.generalObjective, ...(s.specificObjectives || [])].filter(Boolean);
		return {
			...s,
			index: i + 1,
			estimatedMinutes: estimated,
			objectivesText: objectives.slice(0, 4).join(' • '),
		};
	});
	const kept = mapped.filter((r) => !isEmptySession(r));
	const list = kept.length ? kept : mapped;
	return list.map((r, i) => ({ ...r, index: i + 1 }));
}

const cellOr = (value) => (String(asText(value)).trim() || TO_COMPLETE);

/**
 * Shared general-information model for both renderers: an ordered list of
 * non-empty label/value pairs (grouped institution/teacher, academy/year,
 * subject/level, module/date) plus the lesson title and session duration,
 * which are rendered as a separate emphasis band. Missing fields are simply
 * omitted — never invented or silently corrected.
 */
function buildInfoModel(sheet, rows, headerInfo, L) {
	const minutes = rows[0]?.estimatedMinutes || sheet.sessionMinutes;
	const duration = fmtMinutes(minutes, L)
		|| (Number.isFinite(sheet.sessionMinutes) && sheet.sessionMinutes > 0 ? `${sheet.sessionMinutes} ${L.minutesUnit}` : '');
	const src = [
		[L.institution, headerInfo.institution || headerInfo.schoolName],
		[L.teacher, headerInfo.teacherName],
		[L.academy, headerInfo.academy],
		[L.academicYear, headerInfo.academicYear],
		[L.subject, headerInfo.subject],
		[L.level, headerInfo.level],
		[L.group, headerInfo.group],
		[L.module, headerInfo.categoryPath || headerInfo.courseName],
		[L.date, headerInfo.date],
		[L.ministry, headerInfo.ministry],
	];
	const pairs = src
		.filter(([, v]) => asText(v).trim())
		.map(([label, value]) => ({ label, value: asText(value).trim() }));
	return { pairs, lesson: asText(sheet.lessonTitle).trim(), duration };
}

// ── DOCX ────────────────────────────────────────────────────────────────────

const DOCX_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'B7C3D0' };
const DOCX_BORDERS = {
	top: DOCX_BORDER, bottom: DOCX_BORDER, left: DOCX_BORDER, right: DOCX_BORDER,
	insideHorizontal: DOCX_BORDER, insideVertical: DOCX_BORDER,
};
const DOCX_CELL_MARGINS = { top: 60, bottom: 60, left: 90, right: 90 };

function docxRun(text, options = {}) {
	return new TextRun({ text: stripInvalidXmlChars(asText(text)), ...options });
}

/** Multi-paragraph cell content: one paragraph per source line. */
function cellParagraphs(value, options = {}) {
	const lines = asText(value).split(/\r?\n/).map((l) => l.trim()).filter((l, idx, arr) => l || idx === 0);
	const target = lines.length ? lines : [''];
	return target.map((line) => new Paragraph({
		...(options.bullet ? { bullet: { level: 0 } } : {}),
		children: [docxRun(line || (options.blankEmpty ? '' : TO_COMPLETE), {
			size: (options.size || 10) * 2,
			color: line ? (options.color || '273449') : '8A97A8',
			bold: options.bold,
			font: THEME.font,
		})],
	}));
}

function docxHeaderRow(columns, widths, theme) {
	return new TableRow({
		tableHeader: true,
		cantSplit: true,
		children: columns.map((label, i) => new TableCell({
			width: { size: widths[i], type: WidthType.DXA },
			margins: DOCX_CELL_MARGINS,
			verticalAlign: VerticalAlign.CENTER,
			shading: { type: ShadingType.CLEAR, fill: noHash(theme.accent) },
			children: [new Paragraph({
				alignment: AlignmentType.LEFT,
				children: [docxRun(label, { bold: true, color: 'FFFFFF', size: 18, font: THEME.font })],
			})],
		})),
	});
}

const noHash = (value) => String(value).replace('#', '').toUpperCase();

/**
 * Uniform bordered table. `layout: FIXED` keeps the requested column widths
 * (Word will not auto-shrink a column and cause a wrap cascade); body rows
 * carry `cantSplit` so a row is never cut across two pages, and the header
 * row carries `tableHeader` so it repeats when the table continues. When
 * `blankEmpty` is set, missing cells stay blank instead of being filled with
 * the "À compléter" marker (used for the summary/planning grids, where a
 * placeholder would read like a real value).
 */
function docxTable(columnLabels, widths, rows, theme, opts = {}) {
	const { blankEmpty = false } = opts;
	return new Table({
		width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
		columnWidths: widths,
		layout: TableLayoutType.FIXED,
		borders: DOCX_BORDERS,
		rows: [
			docxHeaderRow(columnLabels, widths, theme),
			...rows.map((row, rowIndex) => new TableRow({
				cantSplit: true,
				children: row.map((cell, i) => new TableCell({
					width: { size: widths[i], type: WidthType.DXA },
					margins: DOCX_CELL_MARGINS,
					verticalAlign: VerticalAlign.TOP,
					...(rowIndex % 2 === 1 ? { shading: { type: ShadingType.CLEAR, fill: noHash(theme.soft) } } : {}),
					children: cellParagraphs(cell, { size: 10, blankEmpty }),
				})),
			})),
		],
	});
}

function docxHeading(text, level, theme) {
	return new Paragraph({
		heading: level,
		// A heading must never sit alone at the foot of a page: keep it with
		// the next block and keep its own lines together.
		keepNext: true,
		keepLines: true,
		spacing: { before: level === HeadingLevel.HEADING_1 ? 240 : 160, after: 120 },
		children: [new TextRun({
			text: stripInvalidXmlChars(text),
			bold: true,
			color: noHash(theme.accent),
			size: level === HeadingLevel.HEADING_1 ? 28 : level === HeadingLevel.HEADING_2 ? 24 : 21,
			font: THEME.font,
		})],
	});
}

const docxBody = (text, options = {}) => new Paragraph({
	...(options.bullet ? { bullet: { level: 0 } } : {}),
	...(options.keepNext ? { keepNext: true } : {}),
	spacing: { after: options.after ?? 80 },
	children: [docxRun(text || TO_COMPLETE, {
		size: 22, color: text ? '273449' : '8A97A8', italics: options.italics, font: THEME.font,
	})],
});

/** Two-column "label: value" block for the small per-session headers. */
function docxInfoLines(pairs) {
	const rows = pairs.filter(([, value]) => asText(value).trim());
	return rows.map(([label, value]) => new Paragraph({
		spacing: { after: 40 },
		children: [
			docxRun(`${label} : `, { bold: true, size: 22, color: noHash(THEME.accent), font: THEME.font }),
			docxRun(asText(value), { size: 22, color: '273449', font: THEME.font }),
		],
	}));
}

const docxInfoCell = (text, { bold, color, size = 10, fill, span, align } = {}) => new TableCell({
	...(span ? { columnSpan: span } : {}),
	verticalAlign: VerticalAlign.CENTER,
	margins: DOCX_CELL_MARGINS,
	...(fill ? { shading: { type: ShadingType.CLEAR, fill: noHash(fill) } } : {}),
	children: [new Paragraph({
		...(align ? { alignment: align } : {}),
		spacing: { after: 0 },
		children: [docxRun(text || '', { bold, color: color || '273449', size: size * 2, font: THEME.font })],
	})],
});

/**
 * General-information block as a compact 4-column grid (Label / Value /
 * Label / Value): related fields sit side by side and the block fits high on
 * the first page. The lesson title and the session duration close the grid as
 * a highlighted band (accent label cell + soft value cell, larger bold text)
 * so the identity of the sheet reads at a glance.
 */
function docxInfoTable(model, L, theme) {
	const cw = contentWidth(PORTRAIT_WIDTHS.page, PORTRAIT_WIDTHS.margin);
	const w0 = Math.round(cw * 0.20);
	const w1 = Math.round(cw * 0.30);
	const w2 = Math.round(cw * 0.20);
	const widths = [w0, w1, w2, cw - w0 - w1 - w2];
	const rows = [];
	const pairs = model.pairs;
	for (let i = 0; i < pairs.length; i += 2) {
		const a = pairs[i];
		const b = pairs[i + 1];
		const cells = [
			docxInfoCell(a.label, { bold: true, color: theme.accent, fill: theme.soft }),
			docxInfoCell(a.value),
		];
		if (b) {
			cells.push(docxInfoCell(b.label, { bold: true, color: theme.accent, fill: theme.soft }));
			cells.push(docxInfoCell(b.value));
		} else {
			cells.push(docxInfoCell('', { span: 2 }));
		}
		rows.push(new TableRow({ cantSplit: true, children: cells }));
	}
	if (model.lesson) {
		rows.push(new TableRow({
			cantSplit: true,
			children: [
				docxInfoCell(L.lesson, { bold: true, color: 'FFFFFF', fill: theme.accent }),
				docxInfoCell(model.lesson, { span: 3, bold: true, size: 12, color: theme.accent, fill: theme.soft }),
			],
		}));
	}
	if (model.duration) {
		rows.push(new TableRow({
			cantSplit: true,
			children: [
				docxInfoCell(L.sessionMinutes, { bold: true, color: 'FFFFFF', fill: theme.accent }),
				docxInfoCell(model.duration, { span: 3, bold: true, size: 12, color: theme.accent, fill: theme.soft }),
			],
		}));
	}
	return new Table({
		width: { size: cw, type: WidthType.DXA },
		columnWidths: widths,
		layout: TableLayoutType.FIXED,
		borders: DOCX_BORDERS,
		rows,
	});
}

function docxStringList(items, labels) {
	const list = (items || []).map(asText).filter((t) => t.trim());
	if (!list.length) return [docxBody('')];
	return list.map((item) => docxBody(item, { bullet: true }));
}

function docxConceptBlocks(concepts) {
	const out = [];
	for (const c of concepts || []) {
		if (!asText(c.heading).trim() && !asText(c.body).trim()) continue;
		out.push(docxHeading(asText(c.heading) || TO_COMPLETE, HeadingLevel.HEADING_3, THEME));
		for (const para of asText(c.body).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
			out.push(docxBody(para));
		}
	}
	if (!out.length) out.push(docxBody(''));
	return out;
}

const PORTRAIT_WIDTHS = { page: 11906, height: 16838, margin: 850 };
const LANDSCAPE_WIDTHS = { page: 16838, height: 11906, margin: 700 };
const contentWidth = (page, margin) => page - margin * 2;

function docxGeneralInfoBlock(sheet, rows, headerInfo, L) {
	const model = buildInfoModel(sheet, rows, headerInfo, L);
	return [
		docxHeading(L.generalInfo, HeadingLevel.HEADING_1, THEME),
		docxInfoTable(model, L, THEME),
	];
}

function docxSessionSheetBlocks(sheet, row, headerInfo, L, index) {
	const blocks = [
		docxHeading(`${L.sessionSheet} ${index + 1} — ${cellOr(row.title)}`, HeadingLevel.HEADING_1, THEME),
		...docxInfoLines([
			[L.colContent, row.contentSummary],
			[L.colDuration, fmtMinutes(row.estimatedMinutes, L)],
		]),
	];
	if (row.lessonType) blocks.push(...docxInfoLines([[`${L.lesson} — type`, row.lessonType]]));

	blocks.push(docxHeading(L.objectives, HeadingLevel.HEADING_2, THEME));
	blocks.push(...docxInfoLines([[L.generalObjective, row.generalObjective]]));
	blocks.push(docxBody(`${L.specificObjectives} :`, { after: 20 }));
	blocks.push(...docxStringList(row.specificObjectives, L));

	blocks.push(docxHeading(L.prerequisites, HeadingLevel.HEADING_2, THEME));
	blocks.push(...docxStringList(row.prerequisites, L));

	blocks.push(docxHeading(L.content, HeadingLevel.HEADING_2, THEME));
	blocks.push(...docxConceptBlocks(row.keyConcepts));

	// The full 7-column progression grid is rendered once, on the landscape
	// pages. Here we only point to it — no compact duplicate table.
	blocks.push(docxHeading(L.detailedPlan, HeadingLevel.HEADING_2, THEME));
	blocks.push(docxBody(L.detailedPlanNote, { italics: true }));

	blocks.push(docxHeading(L.methods, HeadingLevel.HEADING_2, THEME));
	blocks.push(...docxStringList(row.methods, L));

	blocks.push(docxHeading(L.materials, HeadingLevel.HEADING_2, THEME));
	blocks.push(...docxStringList(row.materials, L));

	blocks.push(docxHeading(L.assessment, HeadingLevel.HEADING_2, THEME));
	const cw = contentWidth(PORTRAIT_WIDTHS.page, PORTRAIT_WIDTHS.margin);
	const assessWidths = [Math.round(cw * 0.34), Math.round(cw * 0.30), cw - Math.round(cw * 0.34) - Math.round(cw * 0.30)];
	const assessmentRows = (row.assessment || []).map((a) => [a.task, a.criteria, a.expectedAnswer]);
	blocks.push(assessmentRows.length
		? docxTable([L.colTask, L.colCriteria, L.colExpected], assessWidths, assessmentRows, THEME, { blankEmpty: true })
		: docxBody(''));

	blocks.push(docxHeading(L.keyPoints, HeadingLevel.HEADING_2, THEME));
	blocks.push(...docxStringList(row.keyPoints, L));

	blocks.push(docxHeading(L.homework, HeadingLevel.HEADING_2, THEME));
	blocks.push(...docxStringList(row.homework, L));
	return blocks;
}

async function renderPrepSheetDocx(sheet, headerInfo) {
	const rows = buildSessionRows(sheet);
	const L = labelsFor(sheet.language);
	const page = PORTRAIT_WIDTHS;
	const land = LANDSCAPE_WIDTHS;

	// Running chrome shared with the course documents: every page carries a
	// slim header (teacher · school year) and a footer (course/lesson name +
	// page number). The first portrait page is the sheet's own cover block, so
	// `titlePage` lets it keep a clean top while the footer still prints.
	const portraitCW = contentWidth(page.page, page.margin);
	const landscapeCW = contentWidth(land.page, land.margin);
	const runningHeader = (cw) => {
		const left = asText(headerInfo.teacherName).trim();
		const right = asText(headerInfo.academicYear).trim();
		if (!left && !right) return new Header({ children: [new Paragraph({ children: [] })] });
		return new Header({
			children: [new Paragraph({
				tabStops: [{ type: TabStopType.RIGHT, position: cw }],
				border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: noHash(THEME.accent), space: 4 } },
				children: [
					docxRun(left, { bold: true, size: 16, color: noHash(THEME.accent), font: THEME.font }),
					// A real <w:tab/> jumps to the right tab stop; a literal '\t'
					// inside <w:t> is plain text and Word renders it as a space.
					...(right ? [
						new TextRun({ children: [new Tab()], size: 16, font: THEME.font }),
						docxRun(right, { size: 16, color: '526174', font: THEME.font }),
					] : []),
				],
			})],
		});
	};
	const runningFooterLeft = [asText(headerInfo.courseName).trim(), asText(sheet.lessonTitle).trim()].filter(Boolean).join(' — ') || L.docTitle;
	const footer = (cw) => new Footer({
		children: [new Paragraph({
			tabStops: [{ type: TabStopType.RIGHT, position: cw }],
			border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D2D8E0', space: 4 } },
			children: [
				docxRun(runningFooterLeft, { size: 16, color: '8A97A8', font: THEME.font }),
				new TextRun({ children: [new Tab()], size: 16, color: '8A97A8', font: THEME.font }),
				new TextRun({ children: ['Page ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16, color: '8A97A8', font: THEME.font }),
			],
		})],
	});

	const portraitChildren = [
		new Paragraph({
			alignment: AlignmentType.CENTER,
			spacing: { after: 60 },
			children: [docxRun(cellOr(headerInfo.institution || headerInfo.schoolName || headerInfo.ministry), { bold: true, size: 26, color: noHash(THEME.accent), font: THEME.font })],
		}),
		new Paragraph({
			alignment: AlignmentType.CENTER,
			spacing: { after: 240 },
			keepNext: true,
			children: [docxRun(`${L.docTitle} — ${cellOr(sheet.lessonTitle)}`, { bold: true, size: 32, font: THEME.font })],
		}),
		...docxGeneralInfoBlock(sheet, rows, headerInfo, L),
	];

	// Session Distribution: 5 columns, recomputed server-side. Widths give the
	// substantive columns (content, objectives) the room and keep the numeric
	// columns tight so nothing wraps into a stub. The sessions count and grand
	// total ride in the intro line so they never orphan onto a blank page.
	const grandTotal = rows.reduce((acc, r) => acc + (Number.isFinite(r.estimatedMinutes) ? r.estimatedMinutes : 0), 0);
	portraitChildren.push(docxHeading(L.sessionsTitle, HeadingLevel.HEADING_1, THEME));
	portraitChildren.push(docxBody(`${L.sessionsIntro} (${rows.length} ${L.sessionsCountWord} · ${L.total} : ${fmtMinutes(grandTotal, L) || '—'}).`, { keepNext: true }));
	const distTotal = contentWidth(page.page, page.margin);
	const dw1 = Math.round(distTotal * 0.07);
	const dw2 = Math.round(distTotal * 0.24);
	const dw3 = Math.round(distTotal * 0.28);
	const dw4 = Math.round(distTotal * 0.26);
	const distWidths = [dw1, dw2, dw3, dw4, distTotal - dw1 - dw2 - dw3 - dw4];
	portraitChildren.push(docxTable(
		[L.colSession, L.colTitle, L.colContent, L.colObjectives, L.colDuration],
		distWidths,
		[
			...rows.map((r, i) => [String(r.index || i + 1), r.title, r.contentSummary, r.objectivesText, fmtMinutes(r.estimatedMinutes, L)]),
			['', L.total, '', '', fmtMinutes(grandTotal, L)],
		],
		THEME,
		{ blankEmpty: true },
	));

	for (const [i, row] of rows.entries()) {
		portraitChildren.push(new Paragraph({ pageBreakBefore: true, children: [] }));
		portraitChildren.push(...docxSessionSheetBlocks(sheet, row, headerInfo, L, i));
	}

	// Detailed 7-column plans on landscape pages. Widths prioritise the
	// pedagogically dense columns (activities, teacher/student roles, outcomes);
	// the tight stage/duration columns never force a wrap.
	const planTotal = contentWidth(land.page, land.margin);
	const pw = [0.10, 0.06, 0.22, 0.19, 0.17, 0.10].map((f) => Math.round(planTotal * f));
	const planWidths = [...pw, planTotal - pw.reduce((a, b) => a + b, 0)];
	const planChildren = [
		docxHeading(`${L.detailedPlan} — ${cellOr(sheet.lessonTitle)}`, HeadingLevel.HEADING_1, THEME),
		docxBody(L.generatedBy, { italics: true }),
	];
	for (const [i, row] of rows.entries()) {
		const planRows = (row.planRows || []).map((r) => [
			r.stage, r.duration, r.activities, r.teacherRole, r.studentRole, r.resources, r.expectedOutcome,
		]);
		if (!planRows.length) continue;
		// Session title glued to its table: heading carries keepNext and the
		// table header repeats if the (long) plan spans pages.
		planChildren.push(docxHeading(`${L.sessionSheet} ${i + 1} — ${cellOr(row.title)}`, HeadingLevel.HEADING_2, THEME));
		const rowTotal = (row.planRows || [])
			.map((r) => parseMinutes(r.duration))
			.reduce((acc, n) => (Number.isFinite(n) ? acc + n : acc), 0);
		planRows.push(['', L.total, '', '', '', '', fmtMinutes(rowTotal, L)]);
		planChildren.push(docxTable(
			[L.colStage, L.colDurationShort, L.colActivities, L.colTeacher, L.colStudent, L.colResources, L.colOutcome],
			planWidths, planRows, THEME, { blankEmpty: true },
		));
	}

	const doc = new Document({
		styles: {
			default: { document: { run: { font: THEME.font, size: 22, color: '273449' } } },
			paragraphStyles: [
				{ id: 'Normal', name: 'Normal', run: { font: THEME.font, size: 22, color: '273449' }, paragraph: { spacing: { after: 100, line: 276 } } },
			],
		},
		numbering: {
			config: [{
				reference: 'prep-bullets',
				levels: [{ level: 0, format: 'bullet', text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 420, hanging: 220 } } } }],
			}],
		},
		sections: [
			{
				properties: {
					page: {
						size: { width: page.page, height: page.height },
						margin: { top: page.margin, right: page.margin, bottom: page.margin, left: page.margin },
					},
					titlePage: true,
				},
				headers: { default: runningHeader(portraitCW), first: new Header({ children: [new Paragraph({ children: [] })] }) },
				footers: { default: footer(portraitCW), first: footer(portraitCW) },
				children: portraitChildren,
			},
			{
				properties: {
					page: {
						size: { width: land.page, height: land.height, orientation: 'landscape' },
						margin: { top: land.margin, right: land.margin, bottom: land.margin, left: land.margin },
					},
				},
				headers: { default: runningHeader(landscapeCW) },
				footers: { default: footer(landscapeCW) },
				children: planChildren,
			},
		],
	});
	return Packer.toBuffer(doc);
}

// ── PDF ─────────────────────────────────────────────────────────────────────

function pdfBuffer(sheet, headerInfo) {
	return new Promise((resolve, reject) => {
		const rows = buildSessionRows(sheet);
		const L = labelsFor(sheet.language);
		const doc = new PDFDocument({
			size: 'A4',
			layout: 'portrait',
			margins: { top: 52, right: 54, bottom: 56, left: 54 },
			bufferPages: true,
			info: {
				Title: `${L.docTitle} — ${sheet.lessonTitle || ''}`,
				Author: headerInfo.teacherName || 'Quiz App',
				Subject: headerInfo.subject || sheet.lessonTitle || '',
				Creator: 'Quiz App — lesson preparation sheet generator',
			},
		});
		const chunks = [];
		doc.on('data', (c) => chunks.push(c));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);

		const ACCENT = THEME.accent;
		const INK = '#273449';
		const MUTED = '#8A97A8';
		const SOFT = THEME.soft;
		const FONT = 'Helvetica';
		const sanitize = (value) => stripInvalidXmlChars(asText(value).replace(/[^\x20-\x7E\u00A0-\uFFFF\t]/g, ''));

		let planMode = false; // landscape pages hold the 7-column grids
		const newPage = () => {
			doc.addPage({
				size: 'A4',
				layout: planMode ? 'landscape' : 'portrait',
				margins: planMode
					? { top: 44, right: 40, bottom: 48, left: 40 }
					: { top: 52, right: 54, bottom: 56, left: 54 },
			});
		};

		const contentLeft = () => doc.page.margins.left;
		const contentW = () => doc.page.width - doc.page.margins.left - doc.page.margins.right;
		const bottomY = () => doc.page.height - doc.page.margins.bottom;
		const ensureRoom = (needed) => {
			if (doc.y + needed > bottomY() - 10) newPage();
		};

		const heading = (text, { size = 13, gap = 6 } = {}) => {
			ensureRoom(size + gap + 24);
			doc.font(FONT).fontSize(size).fillColor(ACCENT)
				.text(sanitize(text), contentLeft(), doc.y, { lineGap: 1 });
			doc.moveTo(contentLeft(), doc.y + 2).lineTo(contentLeft() + contentW(), doc.y + 2)
				.lineWidth(0.8).strokeColor(ACCENT).stroke();
			doc.moveDown(0.5);
			doc.font(FONT).fontSize(10).fillColor(INK);
		};
		const bodyText = (text, { size = 10, color = INK, italics = false, bullet = false, gap = 3 } = {}) => {
			const line = text && String(text).trim() ? text : TO_COMPLETE;
			const displayColor = text && String(text).trim() ? color : MUTED;
			ensureRoom(size * 2);
			doc.font(bullet ? FONT : (italics ? 'Helvetica-Oblique' : FONT))
				.fontSize(size).fillColor(displayColor);
			const x = contentLeft() + (bullet ? 14 : 0);
			doc.text(`${bullet ? '•  ' : ''}${sanitize(line)}`, x, doc.y, {
				width: contentW() - (bullet ? 14 : 0), lineGap: 1.5,
			});
			doc.y += gap;
			doc.font(FONT).fontSize(10).fillColor(INK);
		};
		const labeled = (label, value) => {
			if (!asText(value).trim()) return;
			ensureRoom(24);
			doc.font(FONT).fontSize(10);
			const labelW = doc.widthOfString(`${label}  `);
			doc.fillColor(ACCENT).text(sanitize(`${label}:`), contentLeft(), doc.y, { continued: true });
			doc.fillColor(INK).text(` ${sanitize(value)}`, { width: contentW() - labelW, lineGap: 1.5 });
			doc.moveDown(0.25);
		};

		/**
		 * Hand-rolled table painter with proper pagination behaviour: per-cell
		 * wrapped-line measurement, row height = tallest cell, rows never split
		 * across pages (a row that does not fit starts a fresh page), the header
		 * row repeats on every page the table continues onto, and an optional
		 * caption that is kept glued to the header + first row. A single row
		 * taller than a whole page is drawn once and clipped rather than looping.
		 * `blankEmpty` leaves missing cells blank; `labelCols` shades + accent-
		 * colours specific columns (used by the general-information grid).
		 */
		const drawTable = (columns, widths, dataRows, opts = {}) => {
			const {
				fontSize = 9, zebra = true, blankEmpty = false,
				header = true, labelCols = [], caption = null,
			} = opts;
			const total = widths.reduce((a, b) => a + b, 0);
			const colW = widths.map((w) => (w / total) * contentW());
			const padX = 5;
			const padY = 4;
			// The exact options used to render every cell. Height measurement and
			// painting MUST share them, otherwise the reserved row height drifts
			// from the rendered height: text overflows into the next row and pdfkit
			// silently inserts pages our manual pagination did not account for
			// (the phantom blank pages). `cellOpts` is the single source of truth.
			const textOpts = (i) => ({ width: colW[i] - padX * 2, lineGap: 2.2, lineHeight: 1.25 });

			const wrapCell = (value, w) => {
				let text = asText(value).trim();
				if (!text) text = blankEmpty ? '' : TO_COMPLETE;
				// Measure with the SAME font/size we render with — pdfkit's
				// widthOfString reads the current doc state, so set it first or a
				// stale size makes every word wrap and inflates the row height.
				doc.font(FONT).fontSize(fontSize);
				const out = [];
				for (const para of text.split(/\r?\n/)) {
					const words = String(para).split(/\s+/).filter(Boolean);
					if (!words.length) { out.push(''); continue; }
					let cur = '';
					for (const word of words) {
						const trial = cur ? `${cur} ${word}` : word;
						if (doc.widthOfString(trial) <= w - padX * 2 || !cur) cur = trial;
						else { out.push(cur); cur = word; }
					}
					out.push(cur);
				}
				return out.length ? out : [''];
			};
			// Measure the real rendered height with pdfkit's own engine (same font,
			// size and options as the paint step) instead of counting lines by hand —
			// this keeps reserved height == painted height for every row.
			const cellHeight = (cellLines, i) => {
				doc.font(FONT).fontSize(fontSize);
				return doc.heightOfString(cellLines.map(sanitize).join('\n'), textOpts(i));
			};
			const blockH = (lines) => Math.max(0, ...lines.map((cl, i) => cellHeight(cl, i))) + padY * 2;
			const headerLines = columns.map((c, i) => wrapCell(c, colW[i]));
			const headerH = header ? blockH(headerLines) : 0;
			const captionH = caption ? fontSize + 8 : 0;
			const metrics = (cells) => {
				const lines = cells.map((c, i) => wrapCell(c, colW[i]));
				return { lines, h: blockH(lines) };
			};

			const paintCaption = () => {
				if (!caption) return;
				doc.font(FONT).fontSize(fontSize + 1).fillColor(ACCENT)
					.text(sanitize(caption), contentLeft(), doc.y, { lineGap: 1 });
				doc.y += captionH;
			};
			const paintHeader = () => {
				if (!header) return;
				const y0 = doc.y;
				doc.rect(contentLeft(), y0, contentW(), headerH).fill(ACCENT);
				doc.fillColor('#FFFFFF').font(FONT).fontSize(fontSize);
				headerLines.forEach((cellLines, i) => {
					const x = contentLeft() + colW.slice(0, i).reduce((a, b) => a + b, 0) + padX;
					doc.text(cellLines.map(sanitize).join('\n'), x, y0 + padY, textOpts(i));
				});
				doc.y = y0 + headerH;
				doc.font(FONT).fontSize(10).fillColor(INK);
			};
			const paintRow = (m, cells, rowIndex) => {
				const y0 = doc.y;
				if (labelCols.length) {
					labelCols.forEach((ci) => {
						doc.rect(contentLeft() + colW.slice(0, ci).reduce((a, b) => a + b, 0), y0, colW[ci], m.h).fill(SOFT);
					});
				} else if (zebra && rowIndex % 2 === 1) {
					doc.rect(contentLeft(), y0, contentW(), m.h).fill(SOFT);
				}
				m.lines.forEach((cellLines, i) => {
					const txt = cellLines.map(sanitize).join('\n');
					const isLabel = labelCols.includes(i);
					const placeholder = !blankEmpty && txt === sanitize(TO_COMPLETE);
					doc.fillColor(isLabel ? ACCENT : (placeholder ? MUTED : INK)).font(FONT).fontSize(fontSize);
					const x = contentLeft() + colW.slice(0, i).reduce((a, b) => a + b, 0) + padX;
					doc.text(txt, x, y0 + padY, textOpts(i));
				});
				doc.strokeColor('#B7C3D0').lineWidth(0.6);
				doc.rect(contentLeft(), y0, contentW(), m.h).stroke();
				let x = contentLeft();
				for (let i = 0; i < colW.length - 1; i += 1) {
					x += colW[i];
					doc.moveTo(x, y0).lineTo(x, y0 + m.h).stroke();
				}
				doc.y = y0 + m.h;
				doc.font(FONT).fontSize(10).fillColor(INK);
			};

			// Reserve caption + header + first row together so a table never
			// begins with its header (or caption) stranded at a page foot.
			const firstRowH = dataRows.length ? Math.min(metrics(dataRows[0]).h, bottomY() - doc.y) : 0;
			ensureRoom(captionH + headerH + Math.min(firstRowH, 160));
			paintCaption();
			paintHeader();
			dataRows.forEach((cells, i) => {
				const m = metrics(cells);
				if (doc.y + m.h > bottomY() - 4) { newPage(); paintHeader(); }
				paintRow(m, cells, i);
			});
			doc.moveDown(0.4);
		};

		// General information as a compact 4-column grid + emphasis band.
		const drawInfoTable = (model) => {
			const grid = [];
			for (let i = 0; i < model.pairs.length; i += 2) {
				const a = model.pairs[i];
				const b = model.pairs[i + 1];
				grid.push([a.label, a.value, b ? b.label : '', b ? b.value : '']);
			}
			if (grid.length) {
				drawTable(['', '', '', ''], [20, 30, 20, 30], grid, {
					header: false, zebra: false, blankEmpty: true, labelCols: [0, 2], fontSize: 9,
				});
			}
			const emphasis = [
				[L.lesson, model.lesson],
				[L.sessionMinutes, model.duration],
			].filter(([, v]) => asText(v).trim());
			if (!emphasis.length) return;
			const cw = contentW();
			const labelW = Math.round(cw * 0.28);
			const rowH = 22;
			emphasis.forEach(([label, value]) => {
				ensureRoom(rowH + 4);
				const y0 = doc.y;
				doc.rect(contentLeft(), y0, labelW, rowH).fill(ACCENT);
				doc.rect(contentLeft() + labelW, y0, cw - labelW, rowH).fill(SOFT);
				doc.font(FONT).fontSize(9).fillColor('#FFFFFF')
					.text(sanitize(`${label}:`), contentLeft() + 6, y0 + 6, { width: labelW - 12 });
				doc.font(FONT).fontSize(11).fillColor(ACCENT)
					.text(sanitize(value), contentLeft() + labelW + 8, y0 + 6, { width: cw - labelW - 16 });
				doc.strokeColor('#B7C3D0').lineWidth(0.6).rect(contentLeft(), y0, cw, rowH).stroke();
				doc.y = y0 + rowH;
				doc.moveDown(0.15);
			});
			doc.moveDown(0.3);
		};

		// Cover + general information (portrait).
		doc.font(FONT).fontSize(13).fillColor(ACCENT)
			.text(sanitize(headerInfo.institution || headerInfo.schoolName || headerInfo.ministry || ''), { align: 'center' })
			.moveDown(0.4);
		doc.fontSize(17).fillColor(INK)
			.text(sanitize(`${L.docTitle} — ${sheet.lessonTitle || ''}`), { align: 'center' })
			.moveDown(1);
		doc.font(FONT).fontSize(10).fillColor(INK);

		heading(L.generalInfo, { size: 13 });
		drawInfoTable(buildInfoModel(sheet, rows, headerInfo, L));

		// Session Distribution (computed server-side). The sessions count and the
		// grand total ride in the intro line so they can never orphan onto a
		// blank page the way a caption below a full-page table would.
		heading(L.sessionsTitle, { size: 13 });
		const grandTotal = rows.reduce((acc, r) => acc + (Number.isFinite(r.estimatedMinutes) ? r.estimatedMinutes : 0), 0);
		bodyText(`${L.sessionsIntro} (${rows.length} ${L.sessionsCountWord} · ${L.total} : ${fmtMinutes(grandTotal, L) || '—'}).`);
		drawTable(
			[L.colSession, L.colTitle, L.colContent, L.colObjectives, L.colDuration],
			[7, 24, 28, 26, 15],
			[
				...rows.map((r, i) => [String(r.index || i + 1), r.title, r.contentSummary, r.objectivesText, fmtMinutes(r.estimatedMinutes, L)]),
				['', L.total, '', '', fmtMinutes(grandTotal, L)],
			],
			{ blankEmpty: true },
		);

		// One preparation sheet per session (portrait).
		rows.forEach((row, i) => {
			newPage();
			heading(`${L.sessionSheet} ${i + 1} — ${cellOr(row.title)}`, { size: 13 });
			labeled(L.colContent, row.contentSummary);
			labeled(L.colDuration, fmtMinutes(row.estimatedMinutes, L));

			heading(L.objectives, { size: 11.5 });
			labeled(L.generalObjective, row.generalObjective);
			bodyText(`${L.specificObjectives}:`, { size: 10, color: ACCENT });
			(row.specificObjectives || []).filter((t) => asText(t).trim()).forEach((t) => bodyText(t, { bullet: true }));
			if (!(row.specificObjectives || []).some((t) => asText(t).trim())) bodyText('');

			heading(L.prerequisites, { size: 11.5 });
			(row.prerequisites || []).filter((t) => asText(t).trim()).forEach((t) => bodyText(t, { bullet: true }));
			if (!(row.prerequisites || []).some((t) => asText(t).trim())) bodyText('');

			heading(L.content, { size: 11.5 });
			const concepts = (row.keyConcepts || []).filter((c) => asText(c.heading).trim() || asText(c.body).trim());
			for (const c of (concepts.length ? concepts : [{ heading: '', body: '' }])) {
				if (asText(c.heading).trim()) bodyText(c.heading, { size: 10.5, color: ACCENT });
				for (const para of asText(c.body).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
					bodyText(para);
				}
			}
			if (!concepts.length) bodyText('');

			heading(L.detailedPlan, { size: 11.5 });
			bodyText(L.detailedPlanNote, { size: 9, italics: true, color: MUTED });

			heading(L.methods, { size: 11.5 });
			(row.methods || []).filter((t) => asText(t).trim()).forEach((t) => bodyText(t, { bullet: true }));
			if (!(row.methods || []).some((t) => asText(t).trim())) bodyText('');

			heading(L.materials, { size: 11.5 });
			(row.materials || []).filter((t) => asText(t).trim()).forEach((t) => bodyText(t, { bullet: true }));
			if (!(row.materials || []).some((t) => asText(t).trim())) bodyText('');

			heading(L.assessment, { size: 11.5 });
			const assessmentRows = (row.assessment || []).map((a) => [a.task, a.criteria, a.expectedAnswer]);
			if (assessmentRows.length) {
				drawTable([L.colTask, L.colCriteria, L.colExpected], [34, 33, 33], assessmentRows, { blankEmpty: true });
			} else bodyText('');

			heading(L.keyPoints, { size: 11.5 });
			(row.keyPoints || []).filter((t) => asText(t).trim()).forEach((t) => bodyText(t, { bullet: true }));
			if (!(row.keyPoints || []).some((t) => asText(t).trim())) bodyText('');

			heading(L.homework, { size: 11.5 });
			(row.homework || []).filter((t) => asText(t).trim()).forEach((t) => bodyText(t, { bullet: true }));
			if (!(row.homework || []).some((t) => asText(t).trim())) bodyText('');
		});

		// Detailed 7-column plans on landscape pages — the single source of the
		// progression. Each session's title is passed as a table caption so it
		// stays glued to its header, and the header repeats across page breaks.
		planMode = true;
		newPage();
		heading(`${L.detailedPlan} — ${sheet.lessonTitle || ''}`, { size: 13 });
		bodyText(L.generatedBy, { size: 9, italics: true, color: MUTED });
		rows.forEach((row, i) => {
			const planRows = (row.planRows || []).map((r) => [
				r.stage, r.duration, r.activities, r.teacherRole, r.studentRole, r.resources, r.expectedOutcome,
			]);
			if (!planRows.length) return;
			const rowTotal = (row.planRows || [])
				.map((r) => parseMinutes(r.duration))
				.reduce((acc, n) => (Number.isFinite(n) ? acc + n : acc), 0);
			planRows.push(['', L.total, '', '', '', '', fmtMinutes(rowTotal, L)]);
			drawTable(
				[L.colStage, L.colDurationShort, L.colActivities, L.colTeacher, L.colStudent, L.colResources, L.colOutcome],
				[10, 6, 22, 19, 17, 10, 16],
				planRows,
				{ fontSize: 8.5, blankEmpty: true, caption: `${L.sessionSheet} ${i + 1} — ${cellOr(row.title)}` },
			);
		});

		// Page chrome (bufferPages: re-iterate after content is complete).
		// • running header — teacher left, school year right — on every page
		//   except the first, which is the sheet's own cover block;
		// • footer — course/lesson name left, page number right — on every page.
		// Both live inside the margins: pdfkit auto-adds a page whenever text is
		// drawn past maxY, so we temporarily drop the bottom margin (raising
		// maxY to the page foot) while stamping the footer, then restore it —
		// otherwise every footer spawns a blank page and the real pages lose
		// their numbering.
		const range = doc.bufferedPageRange();
		const headLeft = sanitize(asText(headerInfo.teacherName).trim());
		const headRight = sanitize(asText(headerInfo.academicYear).trim());
		const footLeft = sanitize(
			[asText(headerInfo.courseName).trim(), asText(sheet.lessonTitle).trim()].filter(Boolean).join(' — ') || L.docTitle,
		);
		for (let p = 0; p < range.count; p += 1) {
			doc.switchToPage(p);
			const mL = doc.page.margins.left;
			const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
			if (p > 0 && (headLeft || headRight)) {
				doc.font(FONT + '-Bold').fontSize(8).fillColor(ACCENT)
					.text(headLeft, mL, 26, { width: pageW * 0.6, lineBreak: false });
				if (headRight) {
					doc.font(FONT).fontSize(8).fillColor('#526174')
						.text(headRight, mL, 26, { width: pageW, align: 'right', lineBreak: false });
				}
				doc.moveTo(mL, 37).lineTo(mL + pageW, 37).lineWidth(0.5).strokeColor(ACCENT).stroke();
			}
			const savedBottom = doc.page.margins.bottom;
			doc.page.margins.bottom = 0;
			const fy = doc.page.height - savedBottom + 14;
			doc.moveTo(mL, fy - 7).lineTo(mL + pageW, fy - 7).lineWidth(0.5).strokeColor('#d2d8e0').stroke();
			doc.font(FONT).fontSize(8).fillColor(MUTED)
				.text(footLeft, mL, fy, { width: pageW * 0.75, lineBreak: false });
			doc.text(`Page ${p + 1} / ${range.count}`, mL + pageW * 0.75, fy, { width: pageW * 0.25, align: 'right', lineBreak: false });
			doc.page.margins.bottom = savedBottom;
		}
		doc.end();
	});
}

// ── Entry point ─────────────────────────────────────────────────────────────

export async function renderPrepSheet(sheet, headerInfo = {}, format = 'docx') {
	if (!sheet || !Array.isArray(sheet.sessions) || !sheet.sessions.length) {
		throw new Error('Preparation sheet has no sessions to render');
	}
	if (format === 'pdf') {
		return { buffer: await pdfBuffer(sheet, headerInfo), mime: 'application/pdf', extension: 'pdf' };
	}
	if (format !== 'docx') throw new Error(`Unsupported prep sheet format: ${format}`);
	return { buffer: await renderPrepSheetDocx(sheet, headerInfo), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' };
}
