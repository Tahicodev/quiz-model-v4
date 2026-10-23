/**
 * tests/unit/kids-mq-normalize.test.js
 *
 * Stage-4 option-art preservation in KidsGameService.normalizeKidQuestion:
 *  - per-option images are kept ONLY when every option carries one, aligned
 *    with the label order (all-or-nothing), so label grids can never
 *    accidentally claim art (art-pick template contract),
 *  - object options attach `image`; an option string only counts as art when
 *    it is itself a URL, never as a plain label,
 *  - questions already normalized with complete art pass `option_images`
 *    through unchanged → create→play re-normalization is idempotent,
 *  - misaligned/partial art is dropped (client falls back to story-cards).
 */
import { describe, it, expect } from 'vitest';
import { normalizeKidQuestion } from '../../src/frontend/services/KidsGameService.js';

describe('normalizeKidQuestion — per-option art (stage 4 art-pick)', () => {
	it('keeps images attached to object options when every option has one', () => {
		const out = normalizeKidQuestion({
			id: 'q1', type: 'mcq', text: 'Which one is the ruby?',
			options_json: JSON.stringify([
				{ text: 'Ruby', image: '/uploads/a.png' },
				{ text: 'Leaf', image: '/uploads/b.png' },
			]),
			answer: 'Ruby',
		});
		expect(out.option_images).toEqual(['/uploads/a.png', '/uploads/b.png']);
		expect(JSON.parse(out.options_json)).toEqual(['Ruby', 'Leaf']);
	});

	it('treats URL-string options as their own art (aligned with label order)', () => {
		const out = normalizeKidQuestion({
			id: 'q2', type: 'mcq', text: 'Pick the picture',
			options_json: JSON.stringify(['/uploads/a.png', '/uploads/b.png', 'https://cdn.c/x.png']),
			answer: '/uploads/a.png',
		});
		expect(out.option_images).toEqual(['/uploads/a.png', '/uploads/b.png', 'https://cdn.c/x.png']);
	});

	it('stays null when art is partial, misaligned or a plain label', () => {
		// one object option without an image → nothing is art
		const partial = normalizeKidQuestion({
			id: 'q3', type: 'mcq', text: 'x',
			options_json: JSON.stringify([{ text: 'A', image: '/u.png' }, { text: 'B' }]),
			answer: 'A',
		});
		expect(partial.option_images).toBeNull();
		// plain labels are never art
		const labels = normalizeKidQuestion({
			id: 'q4', type: 'mcq', text: 'x', options_json: '["A","B"]', answer: 'A',
		});
		expect(labels.option_images).toBeNull();
		// options trailing junk breaks the label↔art alignment
		const misaligned = normalizeKidQuestion({
			id: 'q5', type: 'mcq', text: 'x',
			options_json: JSON.stringify(['/u/a.png', '/u/b.png', '']),
			answer: '/u/a.png',
		});
		expect(misaligned.option_images).toBeNull();
		// blank image string → not usable art
		const blank = normalizeKidQuestion({
			id: 'q6', type: 'mcq', text: 'x',
			options_json: JSON.stringify([{ text: 'A', image: '   ' }, { text: 'B', image: '/u/b.png' }]),
			answer: 'A',
		});
		expect(blank.option_images).toBeNull();
		// fewer than two options can never be an art-pick
		const single = normalizeKidQuestion({
			id: 'q7', type: 'mcq', text: 'x',
			options_json: JSON.stringify([{ text: 'A', image: '/u/a.png' }]),
			answer: 'A',
		});
		expect(single.option_images).toBeNull();
	});

	it('drops an earlier option_images set that no longer matches the labels', () => {
		const out = normalizeKidQuestion({
			id: 'q8', type: 'mcq', text: 'x',
			options_json: '["A","B","C"]',
			option_images: ['/x.png', '/y.png'],
			answer: 'A',
		});
		expect(out.option_images).toBeNull();
	});

	it('passes existing complete option_images through (idempotent)', () => {
		const raw = {
			id: 'q9', type: 'mcq', text: 'x',
			options_json: '["A","B"]',
			option_images: ['/x.png', '/y.png'],
			answer: 'A',
		};
		const first = normalizeKidQuestion(raw);
		expect(first.option_images).toEqual(['/x.png', '/y.png']);
		const second = normalizeKidQuestion(first);
		expect(second.option_images).toEqual(['/x.png', '/y.png']);
		expect(second.option_images).toEqual(first.option_images);
		expect(JSON.parse(second.options_json)).toEqual(['A', 'B']);
	});

	it('keeps non-mcq questions playing fine (fill-blank stays label-based)', () => {
		const out = normalizeKidQuestion({
			id: 'q10', type: 'fill-blank', text: 'Le mot caché est ((1)).',
			options_json: JSON.stringify([{ text: 'tour', image: '/x.png' }, { text: 'clé', image: '/y.png' }]),
			answer: 'tour',
		});
		expect(out.option_images).toEqual(['/x.png', '/y.png']);
		expect(out.type).toBe('fill-blank');
	});
});
