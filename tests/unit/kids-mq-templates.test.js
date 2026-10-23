// @vitest-environment jsdom
/**
 * tests/unit/kids-mq-templates.test.js
 *
 * Stage 2–3 Math Quest presentation layer:
 *  - story-cards template renders its scroll + card composition (distinct
 *    from the game renderers) and drives the platform pipeline ONLY through
 *    engine.answer() (selection → confirm, one submission),
 *  - feedback: correct card glow + mq-star reward art; wrong answers still
 *    advance the run,
 *  - duplicate prevention: second confirm / second answer is swallowed,
 *  - fallback: missing template → legacy star-collector renderer mounts,
 *  - multi-select MCQ never uses the template (mapping check at runtime),
 *  - cleanup: advancing to the next question destroys the previous
 *    template instance (engine.mountRenderer contract).
 *
 * Stage 4 adds art-pick (image cards), gate-choose (true/false gates),
 * pair-match (matching pairs) and rune-word (fill-in-the-blank), plus the
 * order-cards fix — every one of them: engine.answer() only, one
 * submission, destroy() cleanup, and a legacy-renderer fallback on refuse.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KIDS = path.resolve(__dirname, '../../public/kids');
const SCRIPTS = [
	'kids-player.js',
	'games/BubblePopGame.js',
	'games/StarCollectorGame.js',
	'games/LeapFrogGame.js',
	'games/SortItOutGame.js',
	'games/PairPartyGame.js',
	'games/BuildATowerGame.js',
	'games/MagicWordsGame.js',
	'games/CodeExplorerGame.js',
	'games/math-quest-core.js',
	'games/MathQuestTemplates.js',
	'games/MathQuestGame.js',
];

const QUESTIONS = [
	{ id: 'q1', type: 'multiple-choice', text: '7 + 5 = ?', options_json: '["11","12","13","14"]', answer: '12', points: 1 },
	{ id: 'q2', type: 'multiple-choice', text: '12 − 4 = ?', options_json: '["6","7","8","9"]', answer: '8', points: 1 },
	{ id: 'q3', type: 'multiple-choice', text: 'Double of 6 = ?', options_json: '["10","12","14","16"]', answer: '12', points: 1 },
];
const ORDER_Q = {
	id: 'q4', type: 'draggable',
	text: 'Remettez dans l’ordre les étapes du calcul du débit PCM.',
	options_json: '["Multiplier par le nombre de canaux","A step","B step","C step"]',
	answer: 'A step,B step,C step,Multiplier par le nombre de canaux',
	points: 1,
};
// stage-4 variant questions (one per template)
const TF_Q = {
	id: 'qtf', type: 'true-false', text: '7 + 5 = 12 ?',
	options_json: '["Vrai","Faux"]', answer: 'Vrai', points: 1,
};
const MATCH_Q = {
	id: 'qm', type: 'matching', text: 'Relie chaque pierre à sa rune.',
	options_json: '[]', answer: 'A-->1,B-->2', points: 1,
};
const FILL_Q = {
	id: 'qf', type: 'fill-blank', text: 'La clef ouvre ((1)) du temple.',
	options_json: '["tour","portail","chute"]', answer: 'portail', points: 1,
};
const FILL_TYPED_Q = {
	id: 'qft', type: 'fill-blank', text: 'Le gardien dit ((1)).',
	options_json: '[]', answer: 'bonjour', points: 1,
};
const FILL_MULTI_Q = {
	id: 'qfm', type: 'fill-blank', text: 'On ((1)) et ((2)) la clef.',
	options_json: '["prends","tourne"]', answer: '1:prends|2:tourne', points: 1,
};
const ART_Q = {
	id: 'qa', type: 'multiple-choice', text: 'Which one is the ruby?',
	options_json: '["ruby","leaf"]', option_images: ['a.png', 'b.png'], answer: 'ruby', points: 1,
};
function gameVariant(v) {
	if (v === 'order') return [ORDER_Q];
	if (v === 'tf') return [TF_Q];
	if (v === 'matching') return [MATCH_Q];
	if (v === 'fill') return [FILL_Q];
	if (v === 'fill-typed') return [FILL_TYPED_Q];
	if (v === 'fill-multi') return [FILL_MULTI_Q];
	if (v === 'art') return [ART_Q];
	return QUESTIONS;
}
const PLAN = { id: 'l1', name: 'Jungle Trail', questions: QUESTIONS.map((q) => q.id) };

function fakeJwt() {
	const b64 = (o) => window.btoa(JSON.stringify(o)).replace(/=+$/, '');
	return [b64({ alg: 'HS256', typ: 'JWT' }), b64({ id: 'user-mqt', role: 'student', school_id: 'school-test', exp: Math.floor(Date.now() / 1000) + 3600 }), 'sig'].join('.');
}

function gamePayload(v) {
	const qs = gameVariant(v);
	return {
		id: 'game-mqts', name: 'MQ Templates Quest', game_type: 'math-quest',
		theme: 'jungle', grade: 'cp', subject: 'Maths',
		questions: qs,
		config: { time_per_q: 20, levels: [{ id: 'l1', name: 'Jungle Trail', questions: qs.map((q) => q.id) }] },
	};
}

function serveFetch(v) {
	let sessionCounter = 0;
	const qs = gameVariant(v);
	return vi.fn(async (url, opts = {}) => {
		const u = String(url);
		const json = (obj, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => obj });
		if (u.includes('/api/v1/kids/play/MQTS') && !opts.method) return json(gamePayload(v));
		if (u.includes('/api/v1/kids/games/game-mqts/quest-progress')) {
			return json({
				game_id: 'game-mqts',
				levels: [{ index: 0, id: 'l1', name: 'Jungle Trail', question_count: qs.length, pass_stars: 1, best_stars: 0, passed: false, unlocked: true }],
			});
		}
		if (u.includes('/api/v1/kids/games/game-mqts/session')) {
			return json({ session: { id: 'sess-' + (++sessionCounter) }, totalPoints: qs.length });
		}
		if (u.includes('/api/v1/kids/play/session/')) {
			const parsed = opts.body ? JSON.parse(opts.body) : {};
			const answers = JSON.parse(parsed.answers_json || '[]');
			return json({ score: qs.length, stars: 3, percent: 100, answers, quest: { level_id: 'l1', level_name: 'Jungle Trail', level_total_points: qs.length } });
		}
		throw new Error('unexpected fetch ' + u);
	});
}

function loadScripts() {
	for (const f of SCRIPTS) window.eval(readFileSync(path.join(KIDS, f), 'utf8'));
}

async function settle(times = 12) { for (let i = 0; i < times; i++) await Promise.resolve(); }

async function boot(v) {
	vi.useFakeTimers();
	window.history.replaceState(null, '', '/kids/play/MQTS');
	localStorage.clear();
	sessionStorage.clear();
	localStorage.setItem('quizAuthToken:student', fakeJwt());
	window.fetch = serveFetch(v || 'mcq');
	loadScripts();
	document.dispatchEvent(new window.Event('DOMContentLoaded'));
	// init → load → welcome(auto) → createSession → quest map
	await settle();
	await vi.advanceTimersByTimeAsync(10);
	await settle(20);
	// enter the level (single-level plan → straight to the quiz)
	document.querySelector('.mq-level-node .mq-node-btn').click();
	await settle(24);
	return window.KidsPlayerEngine;
}

/** Answer the current question through the template interaction. */
async function answer(val) {
	const card = document.querySelector('.mq-card-opt[data-opt="' + val + '"]');
	if (!card) throw new Error('no card for ' + val);
	card.click();
	document.querySelector('.mq-confirm').click();
	await vi.advanceTimersByTimeAsync(300);
	await settle(24);
	await vi.advanceTimersByTimeAsync(1650);
	await settle(24);
}

beforeEach(() => {
	document.body.className = 'kid-body';
	document.body.innerHTML = `
		<div class="kid-wrap">
			<div class="kid-header">
				<div id="kidMascot" class="kid-mascot" aria-hidden="true">🦊</div>
				<div class="kid-title"><h1 id="kidGameName"></h1><p id="kidGameSub"></p></div>
				<div class="spacer"></div>
				<button id="kidSoundBtn" class="kid-sound-btn" aria-label="sound">🔊</button>
			</div>
			<div class="kid-progress" id="kidProgress" hidden>
				<span id="kidProgressLabel">1/1</span>
				<div class="kid-progress-bar"><div id="kidProgressFill" class="kid-progress-fill"></div></div>
				<div class="kid-timer"><div class="kid-timer-ring" id="kidTimerRing"><span id="kidTimerNum">15</span></div></div>
			</div>
			<div id="kidScreen"></div>
		</div>
		<div class="kid-stars-rain" id="kidStarsRain" hidden></div>
	`;
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('story-cards template (stage 3, end to end through the engine)', () => {
	it('composes scroll + cards and requires select-then-confirm', async () => {
		await boot();
		expect(document.querySelector('.mq-panel .mq-scroll')).toBeTruthy();
		expect(document.querySelector('.mq-scroll-dino img')).toBeTruthy();    // unused asset now on duty
		expect(document.querySelector('.mq-scroll-gem img')).toBeTruthy();     // crystal accent
		expect(document.querySelectorAll('.mq-card-opt').length).toBe(4);
		expect(document.querySelectorAll('.kid-bubble').length).toBe(0);       // NOT the game-renderer composition
		// confirm disabled until a card is selected
		expect(document.querySelector('.mq-confirm').disabled).toBe(true);
		// options are real buttons (keyboard focusable, a11y semantics)
		expect(document.querySelector('.mq-card-opt').tagName).toBe('BUTTON');
		const card = document.querySelector('.mq-card-opt[data-opt="12"]');
		card.click();
		expect(card.getAttribute('aria-pressed')).toBe('true');
		const confirm = document.querySelector('.mq-confirm');
		expect(confirm.disabled).toBe(false);
		confirm.click();
		// submission counted exactly once, feedback live
		expect(window.KidsPlayerEngine.answers).toHaveLength(1);
		expect(window.KidsPlayerEngine.answers[0]).toMatchObject({ question_id: 'q1', given: '12', correct: true });
		expect(window.KidsPlayerEngine.locked).toBe(true);
		expect(document.querySelector('.mq-card-opt.mq-correct')).toBeTruthy();
		expect(document.querySelector('.mq-card-star')).toBeTruthy();
		expect(confirm.disabled).toBe(true);
		// duplicate: another confirm press + engine.answer are both swallowed
		confirm.click();
		window.KidsPlayerEngine.answer('11');
		expect(window.KidsPlayerEngine.answers).toHaveLength(1);
	});

	it('marks the chosen card wrong and still advances the run', async () => {
		const engine = await boot();
		const wrongOpt = JSON.parse(QUESTIONS[0].options_json).filter((o) => o !== QUESTIONS[0].answer)[0];
		await answer(wrongOpt);
		expect(engine.answers[0].correct).toBe(false);
		expect(engine.score).toBe(0);
		// auto-advance landed on the next question with a fresh template
		expect(document.querySelector('.mq-panel')).toBeTruthy();
		await answer(QUESTIONS[1].answer);
		expect(engine.answers).toHaveLength(2);
		expect(engine.answers[1].correct).toBe(true);
	});

	it('advances question-by-question, destroying the previous template', async () => {
		const engine = await boot();
		const first = engine.renderer;
		await answer('12'); // q1 ✔
		const second = engine.renderer;
		expect(second).not.toBe(first);
		expect(first.destroyed).toBe(true);
		// exactly one team's preferred direction: one panel in the screen
		expect(document.querySelectorAll('.mq-panel').length).toBe(1);
		expect(document.getElementById('kidProgressLabel').textContent).toContain('2/3');
	});

	it('falls back to the legacy bubble renderer when templates are unavailable', async () => {
		await boot();
		delete window.MQTemplates['story-cards'];
		const screen = document.getElementById('kidScreen');
		const wrapper = new window.KidsGameRenderers['math-quest'](window.KidsPlayerEngine, screen, QUESTIONS[1], {});
		wrapper.render();
		expect(document.querySelector('.kid-bubble')).toBeTruthy();  // legacy bubble-pop composition
		expect(document.querySelector('.mq-panel')).toBeNull();      // NOT the template
	});

	it('multi-select MCQ never mounts the template (platform renderer instead)', async () => {
		await boot();
		const multi = Object.assign({}, QUESTIONS[0], { allowMultipleAnswers: true });
		const screen = document.getElementById('kidScreen');
		const wrapper = new window.KidsGameRenderers['math-quest'](window.KidsPlayerEngine, screen, multi, {});
		wrapper.render();
		expect(document.querySelector('.kid-star')).toBeTruthy();   // multi → star-collector delegate
		expect(document.querySelector('.mq-panel')).toBeNull();
	});
});

/** Greedy arrange helper: drives the template's ▲▼ buttons until the
 * visible sequence matches the requested one (shuffle starts random). */
function arrange(labels) {
	const seq = document.querySelector('.mq-seq');
	if (!seq) throw new Error('no sequence on screen');
	const read = () => Array.from(seq.querySelectorAll('.mq-seq-row .mq-seq-label')).map((e) => e.textContent);
	for (let pos = 0; pos < labels.length; pos++) {
		let guard = labels.length * labels.length;
		while (read()[pos] !== labels[pos] && guard-- > 0) {
			const idx = read().indexOf(labels[pos]);
			const dir = idx > pos ? 'up' : 'down';
			const btn = seq.querySelector('.mq-seq-btn[data-move="' + dir + '"][data-i="' + idx + '"]');
			if (!btn || btn.disabled) throw new Error('stuck arranging ' + labels.join('|'));
			btn.click();
		}
		if (read()[pos] !== labels[pos]) throw new Error('arrange failed at ' + pos);
	}
}

describe('order-cards template (stage 3, arrange-the-steps)', () => {
	it('mounts the sequence builder instead of bubbles and submits the joined order once', async () => {
		const engine = await boot('order');
		// the real complaint: 'order' questions used to fall through to bubbles
		expect(document.querySelector('.mq-seq')).toBeTruthy();
		expect(document.querySelectorAll('.kid-bubble').length).toBe(0);
		expect(document.querySelectorAll('.mq-seq-row').length).toBe(4);
		// confirm is available immediately (there is nothing to pre-pick)
		expect(document.querySelector('.mq-confirm').disabled).toBe(false);
		// move 'A step' to the top, then assert the visible order + puts in place
		arrange(['A step', 'Multiplier par le nombre de canaux', 'B step', 'C step']);
		// labels are shuffled at mount — drive toward the answer
		arrange(['A step', 'B step', 'C step', 'Multiplier par le nombre de canaux']);
		document.querySelector('.mq-confirm').click();
		expect(engine.answers).toHaveLength(1);
		expect(engine.answers[0]).toMatchObject({ given: 'A step,B step,C step,Multiplier par le nombre de canaux', correct: true });
		expect(engine.locked).toBe(true);
		expect(document.querySelectorAll('.mq-seq-row.mq-correct').length).toBe(4);
		// duplicate submits (second confirm + engine.answer) are swallowed
		document.querySelector('.mq-confirm').click();
		engine.answer('A step');
		expect(engine.answers).toHaveLength(1);
	});

	it('marks misplaced steps after a wrong submission', async () => {
		const engine = await boot('order');
		// misplace: swap the first two steps of the answer
		arrange(['A step', 'B step', 'C step', 'Multiplier par le nombre de canaux']);
		// get 'A step, B step' pair reversed → 'B step' first
		arrange(['B step', 'A step', 'C step', 'Multiplier par le nombre de canaux']);
		document.querySelector('.mq-confirm').click();
		expect(engine.answers[0].correct).toBe(false);
		const wrongRows = document.querySelectorAll('.mq-seq-row.mq-wrong');
		const rightRows = document.querySelectorAll('.mq-seq-row.mq-correct');
		expect(wrongRows.length).toBe(2);   // positions 0+1 hold each other's step
		expect(rightRows.length).toBe(2);   // positions 2+3 are untouched
	});

	it('falls back to the platform tower renderer when the template is missing', async () => {
		await boot();
		delete window.MQTemplates['order-cards'];
		const q = Object.assign({}, QUESTIONS[0], { type: 'draggable', options_json: JSON.stringify(['x1', 'x2', 'x3']), answer: 'x2,x1,x3' });
		const screen = document.getElementById('kidScreen');
		const wrapper = new window.KidsGameRenderers['math-quest'](window.KidsPlayerEngine, screen, q, {});
		wrapper.render();
		expect(document.querySelector('.kid-block')).toBeTruthy(); // build-a-tower composition
		expect(document.querySelector('.mq-seq')).toBeNull();
	});
});

/* ── stage 4: art-pick — image answer cards ────────────────────────────── */
describe('art-pick template (stage 4, image answer cards)', () => {
	it('mounts framed picture cards with captions and submits the LABEL once', async () => {
		const engine = await boot('art');
		expect(document.querySelector('.mq-art-cards')).toBeTruthy();
		expect(document.querySelectorAll('.mq-art-card').length).toBe(2);
		expect(document.querySelectorAll('.mq-art-frame img').length).toBe(2);
		expect(document.querySelector('.mq-art-frame img').getAttribute('src')).toBe('a.png'); // direct src assignment
		expect(document.querySelectorAll('.kid-bubble').length).toBe(0);   // NOT the bubble composition
		// captions: art never replaces the text (playable while images load/fail)
		document.querySelectorAll('.mq-art-card').forEach((card) => {
			expect(card.querySelector('.mq-card-text').textContent.length).toBeGreaterThan(0);
		});
		// confirm disabled until a picture is picked
		expect(document.querySelector('.mq-confirm').disabled).toBe(true);
		const card = document.querySelector('.mq-art-card[data-opt="ruby"]');
		card.click();
		expect(card.getAttribute('aria-pressed')).toBe('true');
		const confirm = document.querySelector('.mq-confirm');
		expect(confirm.disabled).toBe(false);
		confirm.click();
		expect(engine.answers).toHaveLength(1);
		expect(engine.answers[0]).toMatchObject({ question_id: 'qa', given: 'ruby', correct: true });
		expect(engine.locked).toBe(true);
		expect(card.classList.contains('mq-correct')).toBe(true);
		expect(card.querySelector('.mq-card-star')).toBeTruthy();
		expect(confirm.disabled).toBe(true);
		// duplicate guards: second confirm AND a direct engine.answer both swallowed
		confirm.click();
		engine.answer('leaf');
		expect(engine.answers).toHaveLength(1);
	});

	it('refuses misaligned art and falls BACK to story-cards', async () => {
		await boot();
		const q = Object.assign({}, ART_Q, { option_images: ['only-one.png'] }); // 1 image for 2 options
		const screen = document.getElementById('kidScreen');
		const wrapper = new window.KidsGameRenderers['math-quest'](window.KidsPlayerEngine, screen, q, {});
		wrapper.render();
		expect(document.querySelector('.mq-art-cards')).toBeNull();    // art-pick refused the bad data…
		expect(document.querySelector('.mq-card-opt')).toBeTruthy();   // …and story-cards took over
		expect(document.querySelector('.kid-bubble')).toBeNull();
	});

	it('falls through to the bubble renderer when the template is missing', async () => {
		await boot();
		delete window.MQTemplates['art-pick'];
		const screen = document.getElementById('kidScreen');
		const wrapper = new window.KidsGameRenderers['math-quest'](window.KidsPlayerEngine, screen, ART_Q, {});
		wrapper.render();
		expect(document.querySelector('.kid-bubble')).toBeTruthy();
		expect(document.querySelector('.mq-art-cards')).toBeNull();
	});
});

/* ── stage 4: gate-choose — true/false as two temple gates ─────────────── */
describe('gate-choose template (stage 4, true/false gates)', () => {
	it('mounts two gates and commits on the first tap (right answer)', async () => {
		const engine = await boot('tf');
		expect(document.querySelector('.mq-gates')).toBeTruthy();
		expect(document.querySelectorAll('.mq-gate-btn').length).toBe(2);
		expect(document.querySelectorAll('.kid-pad').length).toBe(0);  // NOT the leap-frog composition
		// both gates carry the gate artwork (second mirrors it)
		document.querySelectorAll('.mq-gate-art img').forEach((img) => {
			expect(img.getAttribute('src')).toContain('mq-gate.png');
		});
		const right = document.querySelector('.mq-gate-btn[data-opt="Vrai"]');
		right.click();
		expect(engine.answers).toHaveLength(1);
		expect(engine.answers[0]).toMatchObject({ question_id: 'qtf', given: 'Vrai', correct: true });
		expect(engine.locked).toBe(true);
		expect(right.classList.contains('mq-correct')).toBe(true);
		expect(right.querySelector('.mq-card-star')).toBeTruthy();
		// duplicate guards: second gate tap AND a direct engine.answer both swallowed
		document.querySelector('.mq-gate-btn[data-opt="Faux"]').click();
		engine.answer('Faux');
		expect(engine.answers).toHaveLength(1);
	});

	it('marks the chosen gate wrong and reveals the true one', async () => {
		const engine = await boot('tf');
		const wrong = document.querySelector('.mq-gate-btn[data-opt="Faux"]');
		wrong.click();
		expect(engine.answers[0].correct).toBe(false);
		expect(engine.score).toBe(0);
		expect(wrong.classList.contains('mq-wrong')).toBe(true);
		const vrai = document.querySelector('.mq-gate-btn[data-opt="Vrai"]');
		expect(vrai.classList.contains('mq-correct')).toBe(true);
	});

	it('falls back to the leap-frog renderer when the template is missing', async () => {
		await boot();
		delete window.MQTemplates['gate-choose'];
		const screen = document.getElementById('kidScreen');
		const wrapper = new window.KidsGameRenderers['math-quest'](window.KidsPlayerEngine, screen, TF_Q, {});
		wrapper.render();
		expect(document.querySelector('.kid-pad')).toBeTruthy();  // legacy leap-frog composition
		expect(document.querySelector('.mq-gates')).toBeNull();
	});
});

/* ── stage 4: pair-match — matching pairs with breakable link chips ───── */
function tapStone(kind, label) {
	const b = document.querySelector('.mq-pair-' + kind + '[data-' + kind + '="' + label + '"]');
	if (!b) throw new Error('no ' + kind + ' stone for ' + label);
	b.click();
}

describe('pair-match template (stage 4, matching pairs)', () => {
	it('mounts stones, links pairs and submits the RAW tokens once', async () => {
		const engine = await boot('matching');
		expect(document.querySelector('.mq-pair-board')).toBeTruthy();
		expect(document.querySelectorAll('.mq-pair-stone').length).toBe(4); // 2 left + 2 right
		expect(document.querySelectorAll('.mq-pair-left').length).toBe(2);
		expect(document.querySelectorAll('.mq-pair-right').length).toBe(2);
		expect(document.querySelectorAll('.mq-pair-chip').length).toBe(0);
		expect(document.querySelectorAll('.kid-pair-item').length).toBe(0); // NOT pair-party composition
		// right side before a left pick → a nudge, never a strand
		tapStone('right', '1');
		expect(engine.answers).toHaveLength(0);
		expect(document.querySelectorAll('.mq-pair-chip').length).toBe(0);
		tapStone('left', 'A'); tapStone('right', '1');
		tapStone('left', 'B'); tapStone('right', '2');
		expect(document.querySelectorAll('.mq-pair-chip').length).toBe(2);
		const confirm = document.querySelector('.mq-confirm');
		confirm.click();
		expect(engine.answers).toHaveLength(1);
		// byte-exact with the canonical matching answer (raw tokens, comma-joined)
		expect(engine.answers[0]).toMatchObject({ question_id: 'qm', given: 'A-->1,B-->2', correct: true });
		expect(engine.locked).toBe(true);
		expect(document.querySelectorAll('.mq-pair-chip.mq-correct').length).toBe(2);
		expect(document.querySelector('.mq-pair-chip .mq-card-star')).toBeTruthy();
		// duplicate guards
		confirm.click();
		engine.answer('A-->1');
		expect(engine.answers).toHaveLength(1);
	});

	it('refuses to confirm an incomplete link set (nudge, no submission)', async () => {
		const engine = await boot('matching');
		tapStone('left', 'A'); tapStone('right', '1');
		document.querySelector('.mq-confirm').click();
		expect(engine.answers).toHaveLength(0);
		// completing it afterwards confirms fine
		tapStone('left', 'B'); tapStone('right', '2');
		document.querySelector('.mq-confirm').click();
		expect(engine.answers).toHaveLength(1);
	});

	it('ties a chip back with ✕ and lets the stones be relinked', async () => {
		const engine = await boot('matching');
		tapStone('left', 'A'); tapStone('right', '1');
		expect(document.querySelectorAll('.mq-pair-chip').length).toBe(1);
		expect(document.querySelector('.mq-pair-left[data-left="A"]').classList.contains('mq-used')).toBe(true);
		document.querySelector('.mq-pair-undo').click();
		expect(document.querySelectorAll('.mq-pair-chip').length).toBe(0);
		expect(document.querySelector('.mq-pair-left[data-left="A"]').classList.contains('mq-used')).toBe(false);
		tapStone('left', 'A'); tapStone('right', '1');
		tapStone('left', 'B'); tapStone('right', '2');
		expect(document.querySelectorAll('.mq-pair-chip').length).toBe(2);
		document.querySelector('.mq-confirm').click();
		expect(engine.answers[0].given).toBe('A-->1,B-->2');
	});

	it('refuses cross combinations the question never paired (no strand, no submission)', async () => {
		const engine = await boot('matching');
		tapStone('left', 'A');
		tapStone('right', '2');          // A↔2 does not exist in the question data
		expect(document.querySelectorAll('.mq-pair-chip').length).toBe(0);  // refused, nothing bound
		// the failed attempt releases the pick: a left stone must be chosen again
		tapStone('left', 'A');
		tapStone('right', '1');          // correct partner
		expect(document.querySelectorAll('.mq-pair-chip').length).toBe(1);
		expect(document.querySelector('.mq-pair-chip .mq-pair-undo')).toBeTruthy();
		tapStone('left', 'B'); tapStone('right', '2');
		document.querySelector('.mq-confirm').click();
		expect(engine.answers).toHaveLength(1);
		expect(engine.answers[0].given).toBe('A-->1,B-->2');
		expect(engine.answers[0].correct).toBe(true);
	});

	it('falls back to pair-party when the template is missing', async () => {
		await boot();
		delete window.MQTemplates['pair-match'];
		const screen = document.getElementById('kidScreen');
		const wrapper = new window.KidsGameRenderers['math-quest'](window.KidsPlayerEngine, screen, MATCH_Q, {});
		wrapper.render();
		expect(document.querySelector('.kid-pair-item')).toBeTruthy(); // legacy pair-party composition
		expect(document.querySelector('.mq-pair-board')).toBeNull();
	});
});

/* ── stage 4: rune-word — fill-in-the-blank on a carved scroll ─────────── */
describe('rune-word template (stage 4, fill-in-the-blank)', () => {
	it('mounts the bank + carved blank and submits the single word once', async () => {
		const engine = await boot('fill');
		expect(document.querySelector('.mq-rune-bank')).toBeTruthy();
		expect(document.querySelectorAll('.mq-rune-key').length).toBe(3);
		expect(document.querySelectorAll('.mq-rune-slot').length).toBe(1);     // ((1)) → one blank
		expect(document.querySelectorAll('.kid-word').length).toBe(0);         // NOT magic-words composition
		expect(document.querySelector('.mq-rune-input')).toBeNull();
		const key = document.querySelector('.mq-rune-key[data-w="portail"]');
		key.click();
		const slot = document.querySelector('.mq-rune-slot');
		expect(slot.classList.contains('mq-filled')).toBe(true);
		expect(slot.textContent).toBe('portail');
		// confirm refuses half-filled blanks — nothing filled yet is impossible now,
		// but a second tap-into-full case is handled by the used-state guard
		expect(key.classList.contains('mq-used')).toBe(true);
		const confirm = document.querySelector('.mq-confirm');
		confirm.click();
		expect(engine.answers).toHaveLength(1);
		expect(engine.answers[0]).toMatchObject({ question_id: 'qf', given: 'portail', correct: true });
		expect(engine.locked).toBe(true);
		expect(slot.classList.contains('mq-correct')).toBe(true);
		expect(slot.querySelector('.mq-card-star')).toBeTruthy();
		// duplicate guards: second confirm AND a direct engine.answer both swallowed
		confirm.click();
		engine.answer('tour');
		expect(engine.answers).toHaveLength(1);
	});

	it('falls back to a typed word when the bank is empty', async () => {
		const engine = await boot('fill-typed');
		expect(document.querySelector('.mq-rune-bank')).toBeNull();
		const input = document.querySelector('.mq-rune-input');
		expect(input).toBeTruthy();
		// empty submit → nudge, no submission
		input.value = '';
		document.querySelector('.mq-confirm').click();
		expect(engine.answers).toHaveLength(0);
		input.value = '  Bonjour ';
		document.querySelector('.mq-confirm').click();
		expect(engine.answers).toHaveLength(1);
		expect(engine.answers[0].given).toBe('Bonjour');   // trimmed; grading lowercases
		expect(engine.answers[0].correct).toBe(true);
		expect(input.disabled).toBe(true);                 // lock() freezes the typed input
	});

	it('submits 1:w|2:w for a two-blank spell (magic-words parity)', async () => {
		const engine = await boot('fill-multi');
		expect(document.querySelectorAll('.mq-rune-slot').length).toBe(2);
		document.querySelector('.mq-rune-key[data-w="prends"]').click();
		document.querySelector('.mq-rune-key[data-w="tourne"]').click();
		expect(document.querySelectorAll('.mq-rune-key.mq-used').length).toBe(2);
		document.querySelector('.mq-confirm').click();
		expect(engine.answers).toHaveLength(1);
		expect(engine.answers[0].given).toBe('1:prends|2:tourne');
		expect(engine.answers[0].correct).toBe(true);
	});

	it('marks the wrong blanks individually (one word misplaced)', async () => {
		const engine = await boot('fill-multi');
		document.querySelector('.mq-rune-key[data-w="tourne"]').click();  // slot 1 wrong
		document.querySelector('.mq-rune-key[data-w="prends"]').click();  // slot 2 wrong
		document.querySelector('.mq-confirm').click();
		expect(engine.answers[0].correct).toBe(false);
		const slots = document.querySelectorAll('.mq-rune-slot');
		expect(slots[0].classList.contains('mq-wrong')).toBe(true);   // wanted 'prends'
		expect(slots[1].classList.contains('mq-wrong')).toBe(true);   // wanted 'tourne'
		expect(document.querySelectorAll('.mq-rune-slot.mq-correct').length).toBe(0);
	});

	it('returns a word to the bank once its blank is cleared', async () => {
		await boot('fill');
		document.querySelector('.mq-rune-key[data-w="tour"]').click();
		const slot = document.querySelector('.mq-rune-slot');
		slot.click(); // empty it
		expect(slot.classList.contains('mq-filled')).toBe(false);
		expect(slot.textContent).toBe('✧?');
		const back = document.querySelector('.mq-rune-key[data-w="tour"]');
		expect(back.classList.contains('mq-used')).toBe(false);
		expect(back.getAttribute('data-slot')).toBe(null);
		// and the engine still has no submission (nothing was answered yet)
		expect(window.KidsPlayerEngine.answers).toHaveLength(0);
	});

	it('falls back to magic-words when the template is missing', async () => {
		await boot();
		delete window.MQTemplates['rune-word'];
		const screen = document.getElementById('kidScreen');
		const wrapper = new window.KidsGameRenderers['math-quest'](window.KidsPlayerEngine, screen, FILL_Q, {});
		wrapper.render();
		expect(document.querySelector('.kid-word')).toBeTruthy(); // legacy magic-words composition
		expect(document.querySelector('.mq-rune-bank')).toBeNull();
	});
});
