import { describe, expect, it } from 'vitest';
import {
	SECTION_INDEX,
	extractLessonHighlights,
	lessonSectionLabels,
} from '../../src/shared/lessonSections.js';

describe('lesson section vocabulary', () => {
	it('returns the ordered teaching skeleton for a language', () => {
		const french = lessonSectionLabels('French');
		expect(french[SECTION_INDEX.introduction]).toBe('Introduction');
		expect(french[SECTION_INDEX.objectives]).toBe('Objectifs');
		expect(french[SECTION_INDEX.keyConcepts]).toBe('Concepts clés');
		expect(french).toHaveLength(8);

		const english = lessonSectionLabels('en');
		expect(english[SECTION_INDEX.objectives]).toBe('Objectives');
		expect(english[SECTION_INDEX.keyConcepts]).toBe('Key concepts');
	});

	it('falls back to English labels for an unknown language', () => {
		expect(lessonSectionLabels('Klingon')).toEqual(lessonSectionLabels('English'));
	});
});

describe('extractLessonHighlights', () => {
	it('extracts objectives and key concepts bullets from a French lesson', () => {
		const markdown = [
			'## Introduction',
			'Une mise en contexte.',
			'## Objectifs',
			'- Identifier les composants du système',
			'- Appliquer la méthode de conversion',
			'## Concepts clés',
			'- **Information** : donnée mise en forme',
			'- Donnée',
			'## Définition',
			"L'information désigne…",
		].join('\n');

		expect(extractLessonHighlights(markdown)).toEqual({
			objectives: [
				'Identifier les composants du système',
				'Appliquer la méthode de conversion',
			],
			keyConcepts: ['Information : donnée mise en forme', 'Donnée'],
		});
	});

	it('matches headings in any supported language and ignores the case', () => {
		const markdown = [
			'## OBJECTIVES:',
			'- Explain the goal',
			'## Conceptos clave',
			'- Dato',
			'- Información',
		].join('\n');

		expect(extractLessonHighlights(markdown)).toEqual({
			objectives: ['Explain the goal'],
			keyConcepts: ['Dato', 'Información'],
		});
	});

	it('falls back to paragraphs and de-duplicates repeated items', () => {
		const markdown = [
			'## Key concepts',
			'Information is a meaningful fact.',
			'',
			'Data is a raw fact.',
			'',
			'Data is a raw fact.',
		].join('\n');

		expect(extractLessonHighlights(markdown).keyConcepts).toEqual([
			'Information is a meaningful fact.',
			'Data is a raw fact.',
		]);
	});

	it('returns empty arrays when the lesson has no highlight sections', () => {
		expect(extractLessonHighlights('## Introduction\nHello.\n## Examples\n- one')).toEqual({
			objectives: [],
			keyConcepts: [],
		});
		expect(extractLessonHighlights('')).toEqual({ objectives: [], keyConcepts: [] });
	});
});