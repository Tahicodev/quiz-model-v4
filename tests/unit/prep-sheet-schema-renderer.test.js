/**
 * tests/unit/prep-sheet-schema-renderer.test.js
 *
 * Contracts of the lesson preparation sheet feature:
 *  • PrepSheetDataSchema normalizes tolerant AI output (wrapped objects,
 *    string numbers) but rejects structurally wrong JSON
 *  • the docx export embeds real <w:tbl> tables, a landscape section for the
 *    7-column plan grids, recomputed distribution totals, and never trips the
 *    two known Word-corruption traps (empty <w:ilvl/>, C0 control chars)
 *  • the pdf export is a real multi-page PDF
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { PrepSheetDataSchema } from '../../src/shared/schemas/course.schema.js';
import { renderPrepSheet } from '../../src/backend/services/prepSheetRenderer.js';

const goodFixture = {
	sessions: [
		{
			index: 1,
			title: 'Découverte des fractions',
			estimatedMinutes: 55,
			contentSummary: 'Notion de fraction.',
			generalObjective: 'Comprendre la fraction comme part d\u2019un tout.',
			specificObjectives: ['Identifier un partage équitable', 'Lire une fraction'],
			prerequisites: ['Nombres entiers'],
			keyConcepts: [{ heading: 'Fraction', body: 'Parts égales d\u2019un tout.\nExemple : 1/4.' }],
			planRows: [
				{ stage: 'Introduction', duration: '15 min', activities: 'Partage du gâteau', teacherRole: 'Questionne', studentRole: 'Répond', resources: 'Image', expectedOutcome: 'Besoin des fractions' },
				{ stage: 'Pratique', duration: '30 min', activities: 'Exercices 1-3', teacherRole: 'Circule', studentRole: 'Pratique', resources: 'Manuel', expectedOutcome: 'Écrit des fractions' },
				{ stage: 'Synthèse', duration: '10 min', activities: 'Bilan', teacherRole: 'Fait formuler', studentRole: 'Rédige', resources: 'Tableau', expectedOutcome: 'Énonce la règle' },
			],
			methods: ['Situation-problème'],
			materials: ['Manuel p. 42'],
			assessment: [{ task: 'Écrire la fraction coloriée', criteria: '6/6 items', expectedAnswer: '3/8' }],
			keyPoints: ['Fraction = parts égales'],
			homework: ['Exercice 4'],
		},
		{
			index: 2,
			title: 'Comparer des fractions',
			estimatedMinutes: 55,
			contentSummary: 'Comparaison.',
			generalObjective: 'Comparer des fractions.',
			specificObjectives: ['Utiliser < et >'],
			prerequisites: ['Séance 1'],
			keyConcepts: [{ heading: 'Ordre', body: 'Même dénominateur → numérateurs.' }],
			planRows: [{ stage: 'Rappel', duration: '55 min', activities: 'Comparaisons', teacherRole: 'Démontre', studentRole: 'Compare', resources: 'Bandes', expectedOutcome: 'Compare' }],
			methods: ['Démonstration'],
			materials: [],
			assessment: [],
			keyPoints: [],
			homework: [],
		},
	],
};

describe('PrepSheetDataSchema', () => {
	it('accepts and completes a well-formed sheet', () => {
		const parsed = PrepSheetDataSchema.parse({ lessonTitle: 'Les fractions', language: 'French', sessionMinutes: 55, ...goodFixture });
		expect(parsed.sessions).toHaveLength(2);
		expect(parsed.sessions[0].planRows[0].teacherRole).toBe('Questionne');
		expect(parsed.generatedAt).toBeTruthy();
	});

	it('stays tolerant on wrapped objects and stringified numbers', () => {
		const loose = {
			sessions: {
				index: '1',
				title: 'Séance unique',
				estimatedMinutes: '55',
				keyConcepts: { heading: 'Concept', body: ['Ligne A', 'Ligne B'] },
				planRows: { stage: 'Introduction', duration: '55 min' },
				specificObjectives: 'Objectif isolé',
			},
		};
		const parsed = PrepSheetDataSchema.parse(loose);
		expect(parsed.sessions).toHaveLength(1);
		expect(parsed.sessions[0].index).toBe(1);
		expect(parsed.sessions[0].estimatedMinutes).toBe(55);
		expect(parsed.sessions[0].keyConcepts[0].body).toBe('Ligne A\nLigne B');
		expect(parsed.sessions[0].planRows).toHaveLength(1);
		expect(parsed.sessions[0].specificObjectives).toEqual(['Objectif isolé']);
	});

	it('rejects structurally wrong output (no sessions, empty sessions)', () => {
		expect(() => PrepSheetDataSchema.parse({ hello: 'world' })).toThrow();
		expect(() => PrepSheetDataSchema.parse({ sessions: [] })).toThrow();
	});
});

describe('renderPrepSheet docx', () => {
	it('produces a valid document with tables, landscape plans and totals', async () => {
		const sheet = PrepSheetDataSchema.parse({ lessonTitle: 'Les fractions', language: 'French', sessionMinutes: 55, ...goodFixture });
		const { buffer, mime, extension } = await renderPrepSheet(sheet, { teacherName: 'M. Tahic', schoolName: 'Lycée A', subject: 'Maths' }, 'docx');
		expect(extension).toBe('docx');
		expect(mime).toContain('wordprocessingml');

		const zip = await JSZip.loadAsync(buffer);
		const xml = await zip.file('word/document.xml').async('string');

		// Real tables + landscape section for the 7-column grids.
		expect((xml.match(/<w:tbl>/g) || []).length).toBeGreaterThanOrEqual(4);
		expect(xml).toMatch(/w:orient="landscape"/);

		// Distribution table is recomputed: 15+30+10 = 55 min and total 110 min.
		expect(xml).toContain('55 min');
		expect(xml).toContain('1 h 50');

		// Word-corruption traps: ilvl always carries w:val, no C0 controls.
		expect(xml).not.toMatch(/<w:ilvl\s*\/>/);
		expect(xml.match(/<w:ilvl w:val="(\d+)"/g) || []).not.toHaveLength(0);
		expect(xml).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
		expect(xml).not.toMatch(/undefined|NaN/);

		// Numbering cross-check: every numId used is defined.
		const numbering = await zip.file('word/numbering.xml')?.async('string');
		const used = [...new Set([...xml.matchAll(/<w:numId w:val="(\d+)"/g)].map((m) => m[1]))];
		if (numbering) {
			const defined = [...new Set([...numbering.matchAll(/<w:num w:numId="(\d+)"/g)].map((m) => m[1]))];
			for (const id of used) expect(defined).toContain(id);
		}
	});

	it('fills missing AI fields with the "À compléter" marker instead of inventing', async () => {
		const sparse = PrepSheetDataSchema.parse({
			lessonTitle: 'Leçon vide',
			language: 'French',
			sessionMinutes: 45,
			sessions: [{ index: 1, title: 'Séance 1', estimatedMinutes: 45 }],
		});
		const { buffer } = await renderPrepSheet(sparse, {}, 'docx');
		const zip = await JSZip.loadAsync(buffer);
		const xml = await zip.file('word/document.xml').async('string');
		expect(xml).toContain('À compléter');
		expect(xml).not.toMatch(/undefined/);
	});
});

describe('renderPrepSheet docx — layout & pagination', () => {
	async function goodXml() {
		const sheet = PrepSheetDataSchema.parse({ lessonTitle: 'Les fractions', language: 'French', sessionMinutes: 55, ...goodFixture });
		const { buffer } = await renderPrepSheet(sheet, { teacherName: 'M. Tahic', institution: 'Lycée A', subject: 'Maths', academy: 'Créteil', academicYear: '2025-2026', level: '6ème' }, 'docx');
		const zip = await JSZip.loadAsync(buffer);
		return zip.file('word/document.xml').async('string');
	}

	it('turns the general information into a real table (not a paragraph list)', async () => {
		const xml = await goodXml();
		// info table + distribution + assessment + two landscape plans.
		expect((xml.match(/<w:tbl>/g) || []).length).toBeGreaterThanOrEqual(5);
		// The header values land inside table cells.
		expect(xml).toContain('Créteil');
		expect(xml).toContain('2025-2026');
	});

	it('applies pagination controls: no split rows, repeating headers, fixed layout, kept headings', async () => {
		const xml = await goodXml();
		expect(xml).toMatch(/<w:cantSplit\/>/);      // rows never break mid-content
		expect(xml).toMatch(/<w:tblHeader\/>/);      // header row repeats on continuation
		expect(xml).toMatch(/w:type="fixed"/);        // requested column widths honoured
		expect(xml).toMatch(/<w:keepNext\/>/);        // a heading never sits alone
	});

	it('keeps exactly one detailed progression per session (portrait only points to it)', async () => {
		const xml = await goodXml();
		// The pointer replaces the old compact duplicate table.
		expect(xml).toContain('page paysage');
		// Activities header appears once per landscape plan (2 sessions), never
		// again as a compact portrait 3-column table.
		const activitiesHits = (xml.match(/Contenu \/ Activités/g) || []).length;
		expect(activitiesHits).toBeLessThanOrEqual(2);
	});
});

describe('renderPrepSheet pdf', () => {
	const pageCount = (buf) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

	it('renders a multi-part PDF', async () => {
		const sheet = PrepSheetDataSchema.parse({ lessonTitle: 'Les fractions', language: 'French', sessionMinutes: 55, ...goodFixture });
		const { buffer, mime, extension } = await renderPrepSheet(sheet, { teacherName: 'M. Tahic' }, 'pdf');
		expect(extension).toBe('pdf');
		expect(mime).toBe('application/pdf');
		expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
		expect(buffer.length).toBeGreaterThan(4000);
	});

	it('never spawns blank pages: one page per content block, footers stamped in place', async () => {
		// Regression guard: the footer used to be drawn below page.maxY, so
		// pdfkit auto-added a fresh page for every page number, doubling the
		// document with empty pages. A 2-session sheet stays compact.
		const sheet = PrepSheetDataSchema.parse({ lessonTitle: 'Les fractions', language: 'French', sessionMinutes: 55, ...goodFixture });
		const { buffer } = await renderPrepSheet(sheet, { teacherName: 'M. Tahic' }, 'pdf');
		const pages = pageCount(buffer);
		expect(pages).toBeGreaterThanOrEqual(4); // cover + 2 sheets + landscape
		expect(pages).toBeLessThanOrEqual(6);    // no runaway blank pages
	});

	it('rejects an unknown format', async () => {
		const sheet = PrepSheetDataSchema.parse({ lessonTitle: 'X', sessions: [{ index: 1, title: 'A', estimatedMinutes: 55 }] });
		await expect(renderPrepSheet(sheet, {}, 'pptx')).rejects.toThrow(/Unsupported/);
	});
});

describe('renderPrepSheet — running header & footer chrome', () => {
	it('docx: teacher · year running header and course/lesson footer with page fields', async () => {
		const sheet = PrepSheetDataSchema.parse({ lessonTitle: 'Les fractions', language: 'French', sessionMinutes: 55, ...goodFixture });
		const { buffer } = await renderPrepSheet(sheet, { teacherName: 'M. Tahic', academicYear: '2025-2026', courseName: 'Mathematiques' }, 'docx');
		const zip = await JSZip.loadAsync(buffer);
		const parts = [];
		for (const name of Object.keys(zip.files)) {
			if (/^word\/(header|footer)\d+\.xml$/.test(name)) parts.push(await zip.file(name).async('string'));
		}
		const all = parts.join('');
		expect(all).toContain('M. Tahic');
		expect(all).toContain('2025-2026');
		expect(all).toContain('Mathematiques');
		expect(all).toContain('Les fractions');
		// real page-number fields and real tab jumps (not a literal '\t' text)
		expect(all).toMatch(/PAGE/);
		expect(all).toContain('<w:tab/>');
		// the portrait cover page keeps a clean top via titlePage
		const xml = await zip.file('word/document.xml').async('string');
		expect(xml).toMatch(/<w:titlePg/);
	});

	it('pdf: header stamping keeps the sheet compact — no extra blank pages', async () => {
		const sheet = PrepSheetDataSchema.parse({ lessonTitle: 'Les fractions', language: 'French', sessionMinutes: 55, ...goodFixture });
		const { buffer } = await renderPrepSheet(sheet, { teacherName: 'M. Tahic', academicYear: '2025-2026', courseName: 'Maths' }, 'pdf');
		const pages = (buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
		expect(pages).toBeGreaterThanOrEqual(4);
		expect(pages).toBeLessThanOrEqual(6);
	});
});
