/**
 * tests/unit/exerciseRenderer.test.js
 *
 * The exercise renderer turns a situation-problem into a printable document:
 *   page 1..n → scenario, given data, tasks (student copy)
 *   then      → the CORRECTION with worked steps and the final answer
 *
 * Both formats must produce a valid binary that actually contains the
 * correction, and an exercise with neither a situation nor tasks must be
 * refused instead of producing an empty file.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { renderExercise } from '../../src/backend/services/exerciseRenderer.js';

const exercise = {
	title: 'Le budget du voyage',
	language: 'French',
	difficulty: 'medium',
	situation:
		'La classe de 6e organise une sortie au musée. Le bus coûte 180 € et chaque entrée 4,50 €.',
	givenData: ['Nombre d’élèves : 24', 'Budget total : 320 €'],
	tasks: [
		{ prompt: 'Calcule le prix des entrées pour 24 élèves.', points: 2 },
		{ prompt: 'Le budget suffit-il ? Justifie.', points: 2 },
	],
	solutionSteps: [
		'24 × 4,50 = 108 € pour les entrées.',
		'108 + 180 = 288 € au total.',
	],
	finalAnswer: 'Le budget de 320 € suffit : il reste 32 €.',
	keyCompetencies: ['Résoudre un problème en plusieurs étapes'],
};

describe('renderExercise', () => {
	it('renders a DOCX with the correction section', async () => {
		const out = await renderExercise(exercise, { teacherName: 'Mme Martin', courseName: 'Maths 6e' }, 'docx');
		expect(out.extension).toBe('docx');
		expect(out.mime).toContain('wordprocessingml');
		expect(Buffer.isBuffer(out.buffer)).toBe(true);

		const zip = await JSZip.loadAsync(out.buffer);
		const xml = await zip.file('word/document.xml').async('string');
		expect(xml).toContain('Le budget du voyage');
		expect(xml).toContain('24 × 4,50 = 108 €');
		expect(xml).toContain('Le budget de 320 € suffit');
		// The correction is a real section, not silently dropped.
		expect(xml).toMatch(/Corrigé/);
	});

	it('renders a PDF that starts with the PDF magic number', async () => {
		const out = await renderExercise(exercise, {}, 'pdf');
		expect(out.extension).toBe('pdf');
		expect(out.mime).toBe('application/pdf');
		expect(out.buffer.subarray(0, 5).toString()).toBe('%PDF-');
		expect(out.buffer.length).toBeGreaterThan(1000);
	});

	it('rejects an exercise with nothing to print', async () => {
		await expect(renderExercise({ title: 'Vide' }, {}, 'docx')).rejects.toThrow(/no situation or tasks/i);
	});

	it('rejects an unknown format', async () => {
		await expect(renderExercise(exercise, {}, 'pptx')).rejects.toThrow(/Unsupported exercise format/);
	});
});