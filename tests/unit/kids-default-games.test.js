// @vitest-environment jsdom
/**
 * tests/unit/kids-default-games.test.js
 *
 * Contract tests for the built-in Kids Games catalog (kids-default-games.js,
 * ported from the standalone kids-learning-games demo). These games are
 * offered in wizard Step 1 under French / Arabic / Math, and must play
 * through the EXISTING pipeline, so:
 *  - every game points at a real Kids game type and a real subject card,
 *  - every question type matches what that game's renderer submits
 *    (BubblePop → option label, BuildATower → labels joined with ",",
 *    MagicWords → single word),
 *  - every answer grades correct against the server's checkAnswer with the
 *    exact payload the renderer sends,
 *  - a wrong payload does NOT grade correct (no accidental aliases),
 *  - the wizard's normalizeKidQuestion round-trip preserves type/answer.
 *
 * Bank compatibility (the same questions must be editable in the quiz app):
 *  - every subject card carries its own palette + a mascot that ships,
 *  - every game names an axis, and axis/subject names are unique school-wide,
 *  - every question carries an explanation that survives toBankQuestion,
 *  - counting questions show exactly as many objects as their answer.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
	normalizeKidQuestion,
	checkAnswer,
	toBankQuestion,
} from '../../src/frontend/services/KidsGameService.js';

const FILE = path.resolve(__dirname, '../../kids-default-games.js');

// Mirrors kids-games-management.js isQuestionCompatible (client gate).
const COMPAT = {
	'bubble-pop': (q) => q.type === 'multiple-choice' && !q.allowMultipleAnswers && q._opts.length >= 2,
	'star-collector': (q) => q.type === 'multiple-choice' && q.allowMultipleAnswers && q._opts.length >= 2,
	'leap-frog': (q) => q.type === 'true-false',
	'sort-it-out': (q) => q.type === 'odd-one-out' && q._opts.length >= 3,
	'pair-party': (q) => q.type === 'matching' && q._opts.length >= 2,
	'build-a-tower': (q) => q.type === 'draggable' && q._opts.length >= 2,
	'magic-words': (q) => q.type === 'fill-blank',
	'code-explorer': (q) => q.type === 'code',
	'math-quest': () => true,
};

// Loaded at module level: describe() bodies run during collection, before
// any lifecycle hook, and they iterate the catalog to generate one test
// per game.
window.eval(readFileSync(FILE, 'utf8'));
const catalog = window.KidsDefaultGames;
if (!catalog) throw new Error('kids-default-games.js did not register window.KidsDefaultGames');
const games = catalog.list();

describe('kids-default-games catalog shape', () => {
	it('groups the 15 ported games under three subject cards', () => {
		expect(catalog.subjects.map((s) => s.id)).toEqual(['French', 'Arabic', 'Math']);
		expect(games).toHaveLength(15);
		expect(new Set(games.map((g) => g.id)).size).toBe(15);
		catalog.subjects.forEach((s) => {
			expect(catalog.bySubject(s.id), `games of ${s.id}`).toHaveLength(5);
		});
		games.forEach((g) => {
			expect(g.name, `name of ${g.id}`).toBeTruthy();
			expect(g.description, `description of ${g.id}`).toBeTruthy();
			expect(['French', 'Arabic', 'Math'], `subject of ${g.id}`).toContain(g.subject);
			expect(['maternelle', 'cp', 'ce1', 'ce2', 'cm1', 'cm2'], `grade of ${g.id}`).toContain(g.grade);
			expect(catalog.get(g.id), `lookup of ${g.id}`).toBe(g);
		});
	});

	it('uses only real Kids game types', () => {
		games.forEach((g) => {
			expect(COMPAT, `game type of ${g.id}`).toHaveProperty(g.game_type);
		});
	});

	it('gives every subject card its own palette and a mascot that ships', () => {
		catalog.subjects.forEach((s) => {
			expect(s.blurb, `blurb of ${s.id}`).toBeTruthy();
			['accent', 'accentSoft', 'tint'].forEach((key) => {
				expect(/^#[0-9a-f]{6}$/i.test(s[key]), `${key} of ${s.id} = ${s[key]}`).toBe(true);
			});
			expect(s.mascot, `mascot of ${s.id}`).toMatch(/^\/kids\/assets\//);
			expect(existsSync(path.resolve(__dirname, '../../public', s.mascot.slice(1))), `mascot file of ${s.id}`).toBe(true);
		});
		// The three subjects must not look alike (that was the whole complaint).
		expect(new Set(catalog.subjects.map((s) => s.accent)).size).toBe(catalog.subjects.length);
	});

	it('files each game on its own axis with kid-facing preview chips', () => {
		const names = [];
		games.forEach((g) => {
			expect(g.axis, `axis of ${g.id}`).toBeTruthy();
			expect(g.icon, `icon of ${g.id}`).toBeTruthy();
			expect(['easy', 'medium', 'hard'], `difficulty of ${g.id}`).toContain(g.difficulty);
			expect(Array.isArray(g.preview) && g.preview.filter(Boolean).length, `preview of ${g.id}`).toBeGreaterThan(0);
			expect(catalog.bankPath(g.id), `bank path of ${g.id}`).toEqual([g.subject, g.axis]);
			names.push(g.axis);
		});
		// Category names are unique per SCHOOL (schema @@unique([school_id,
		// name])), so no two axes — and no axis vs. subject — may share a name,
		// or the bank would file two subjects' content in one category.
		const all = names.concat(catalog.subjects.map((s) => s.name));
		expect(new Set(all).size).toBe(all.length);
		all.forEach((name) => expect(name.startsWith('Kids · ')).toBe(false));
	});

	it('counts exactly the objects its counting questions show', () => {
		// Regression guard: an earlier draft said "3 apples" while showing two.
		const longestRun = (text) => {
			let best = 0;
			let run = 0;
			let prev = '';
			for (const ch of Array.from(String(text))) {
				if (ch.codePointAt(0) <= 0x2100) { run = 0; prev = ''; continue; }
				run = ch === prev ? run + 1 : 1;
				prev = ch;
				if (run > best) best = run;
			}
			return best;
		};
		games.forEach((g) => g.questions.forEach((q, i) => {
			const run = longestRun(q.text);
			if (run < 2 || !/^\d+$/.test(String(q.answer).trim())) return;
			expect(run, `${g.id} q${i} shows ${run} objects but answers ${q.answer}`).toBe(Number(q.answer));
		}));
	});

	it('carries an explanation on every question so the bank row is complete', () => {
		games.forEach((g) => g.questions.forEach((raw, i) => {
			expect(String(raw.explanation || '').trim().length, `${g.id} q${i} explanation`).toBeGreaterThan(3);
			const row = toBankQuestion(normalizeKidQuestion(Object.assign({}, raw, { id: `kgd-${g.id}-${i}-x` })), {
				schoolId: 's', teacherId: 't', categoryId: 'c', gameId: 'g',
			});
			expect(row.explanation, `${g.id} q${i} bank explanation`).toBeTruthy();
			expect(row.tags).toContain('kids:g');
		}));
	});
});

describe('kids-default-games questions grade through the server pipeline', () => {
	games.forEach((g) => {
		it(g.id, () => {
			expect(g.questions.length).toBeGreaterThanOrEqual(3);
			g.questions.forEach((raw, i) => {
				// Wizard round-trip: normalizeKidQuestion must preserve the shape.
				const q = normalizeKidQuestion(Object.assign({}, raw, { id: `kgd-${g.id}-${i}-abc` }));
				expect(q.type, `${g.id} q${i} type`).toBe(raw.type);
				expect(q.answer, `${g.id} q${i} answer`).toBe(String(raw.answer).trim());
				expect(q.text, `${g.id} q${i} text`).toBeTruthy();

				const opts = JSON.parse(q.options_json);
				expect(Array.isArray(opts), `${g.id} q${i} options`).toBe(true);
				// Choice-style options must be unique; order blocks may repeat
				// labels (syllables like to-ma-to), and order grading is
				// position-based so duplicates stay unambiguous.
				if (q.type !== 'draggable') {
					expect(new Set(opts).size, `${g.id} q${i} duplicate options`).toBe(opts.length);
				}

				// The wizard gate must accept the question for its own game type.
				expect(COMPAT[g.game_type](Object.assign({}, q, { _opts: opts })), `${g.id} q${i} incompatible with ${g.game_type}`).toBe(true);

				// Exact payload each renderer submits, graded by the real
				// server checkAnswer against the stored question.
				let submitted;
				switch (q.type) {
					case 'multiple-choice':
					case 'odd-one-out':
						// Bubbles/tiles submit the tapped label — it must exist.
						expect(opts, `${g.id} q${i} answer not among options`).toContain(q.answer);
						submitted = q.answer;
						break;
					case 'true-false':
						expect(['true', 'false']).toContain(String(q.answer).toLowerCase());
						submitted = String(q.answer).toLowerCase();
						break;
					case 'draggable': {
						// BuildATower submits the shuffled labels joined with ","
						// — grading is case/space sensitive, so the answer must
						// reuse the EXACT option strings (multiset equality).
						const tokens = String(q.answer).split(',');
						expect(tokens.filter(Boolean).sort(), `${g.id} q${i} order tokens`).toEqual([...opts].sort());
						// The exact correct order must grade true…
						expect(checkAnswer(q, String(q.answer)), `${g.id} q${i} order payload`).toBe(true);
						// …and every different permutation must grade false.
						const reversed = [...opts].reverse().join(',');
						if (reversed !== String(q.answer)) {
							expect(checkAnswer(q, reversed), `${g.id} q${i} reversed order must grade false`).toBe(false);
						}
						submitted = String(q.answer);
						break;
					}
					case 'fill-blank':
						// MagicWords submits the tapped bank word (or typed text).
						if (opts.length) expect(opts, `${g.id} q${i} answer not in bank`).toContain(q.answer);
						submitted = q.answer;
						break;
					default:
						submitted = q.answer;
				}
				expect(checkAnswer(q, submitted), `${g.id} q${i} correct payload must grade true`).toBe(true);
				// And a deliberately wrong payload must not grade correct.
				if (q.type !== 'draggable') {
					const wrong = opts.find((o) => String(o).toLowerCase() !== String(q.answer).toLowerCase()) || null;
					if (wrong != null) {
						expect(checkAnswer(q, wrong), `${g.id} q${i} wrong payload must grade false`).toBe(false);
					}
				}

				// Publish round-trip: the bank-row mapper must not choke.
				const row = toBankQuestion(q, { schoolId: 's', teacherId: 't', categoryId: 'c', gameId: 'g' });
				expect(row.text).toBeTruthy();
				expect(row.answer).toContain(String(q.answer).split(',')[0]);
			});
		});
	});
});
