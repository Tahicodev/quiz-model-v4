// @vitest-environment jsdom
/**
 * Step 5 "Ready to publish?" — the checklist, the kid preview and the inline
 * PIN. The publish call is mocked end to end, so this suite proves the
 * post-publish screen without ever writing a game row to the database.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../kids-games-management.js');

const QUESTIONS = [
	{ id: 'q1', type: 'multiple-choice', text: 'A?', options_json: '[]', answer: 'x' },
	{ id: 'q2', type: 'multiple-choice', text: 'B?', options_json: '[]', answer: 'y' },
	{ id: 'q3', type: 'multiple-choice', text: 'C?', options_json: '[]', answer: 'z' },
];

function buildDom() {
	document.body.innerHTML = `
		<button type="button" data-games-studio-tab="kids-championships">🏆 Kids Championships</button>
		<div id="kidsGameWizardModal" class="modal">
			<form id="kidsGameWizardForm">
				<div id="kidsWizardProgress">
					${[1, 2, 3, 4, 5].map((n) => `<li class="kw-step" data-step="${n}"><span class="kw-num">${n}</span></li>`).join('')}
				</div>
				<div class="kids-wizard-body">
					${[1, 2, 3, 4, 5].map((n) => `<div class="kw-step-panel" data-step="${n}"></div>`).join('')}
					<div class="kids-pub">
						<div id="kidsPublishChecklist"></div>
						<div class="kids-wizard-preview" id="kidsWizardPreview"></div>
						<div id="kidsPublishResult" hidden></div>
						<div id="kidsPublishChamp" hidden></div>
					</div>
				</div>
				<div id="kidsWizardTitle"></div>
				<div id="kidsWizardStepHint"></div>
				<input type="hidden" id="kidsGameWizardStep" value="1" />
				<input type="hidden" id="kidsGameWizardId" />
				<input type="text" id="kidsGameName" value="Dev Game" />
				<input type="text" id="kidsGameSubject" value="Maths" />
				<textarea id="kidsGameDescription"></textarea>
				<input type="number" id="kidsGameTimePerQ" value="15" />
				<input type="number" id="kidsGameMaxHints" value="1" />
				<select id="kidsGameMascotTheme"><option value=""></option></select>
				<input type="checkbox" id="kidsGameAllowReplay" checked />
				<input type="checkbox" id="kidsGameShowExplanations" checked />
				<select id="kidsAIGrade"><option value="cp" selected>cp</option></select>
				<div class="form-group" id="kidsMqLevelsGroup" hidden>
					<div id="kidsMqLevelsList"></div>
					<button type="button" id="kidsMqAddLevel">+ Add level</button>
					<button type="button" id="kidsMqResetLevels">Reset to one level</button>
				</div>
				<button type="button" id="kidsWizardBackBtn">Back</button>
				<button type="button" id="kidsWizardNextBtn">Next</button>
				<button type="button" id="kidsWizardPublishBtn" hidden>Publish</button>
			</form>
		</div>
		<div id="kidsGameShareModal" class="modal"></div>
	`;
}

beforeEach(() => {
	buildDom();
	localStorage.clear();
	vi.restoreAllMocks();
	window.showToast = vi.fn();
	window.API = { raw: () => Promise.resolve({}), list: () => Promise.resolve({ data: [] }) };
	window.Auth = { getCurrentUser: () => ({ id: 'u1', role: 'admin' }) };
	window.eval(readFileSync(SRC, 'utf8'));
});

/** Step 5 with an unfinished draft: the header steps are clickable but walking
 * forward through Next would (correctly) refuse to leave step 1, so the test
 * fast-forwards to step 4 and then uses the real click-ahead path. */
function step5FromHeader() {
	const st = window.KidsGames.state;
	st.wizardStep = 4;
	st.maxWizardStep = 5;
	window.kidsWizardGoToStep(5);
	expect(st.wizardStep).toBe(5);
	return st;
}

/** A wizard that reached step 5 the way a teacher does. */
function wizardAtStep5(type = 'math-quest', questions = QUESTIONS) {
	window.openKidsGameWizard();
	window.selectKidsGameType(type);
	document.getElementById('kidsGameName').value = 'Dev Game';
	window.KidsGames.state.wizard.questions = questions.slice();
	window.kidsWizardNextStep(); // 1 → 2
	window.kidsWizardNextStep(); // 2 → 3
	window.kidsWizardNextStep(); // 3 → 4
	window.kidsWizardNextStep(); // 4 → 5 (validates the name and the level plan)
	expect(window.KidsGames.state.wizardStep).toBe(5);
}

describe('step 5 checklist', () => {
	it('points every unfinished item at the step that fixes it', () => {
		window.openKidsGameWizard();
		// the wizard resets the form, so the name is typed after it opens
		document.getElementById('kidsGameName').value = 'Dev Game';
		step5FromHeader();
		const box = document.getElementById('kidsPublishChecklist');
		const rows = [...box.querySelectorAll('.kids-pub-check')];
		// no type, no questions yet: two blockers, and the name is already filled
		expect(rows.map((r) => r.querySelector('.kids-pub-check-label').textContent))
			.toEqual(['Game type', 'Game name', 'Questions', 'Play rules']);
		const todo = rows.filter((r) => r.classList.contains('todo'));
		expect(todo.length).toBe(2);
		expect(rows[0].querySelector('.kids-pub-check-mark').textContent).toBe('!');
		expect(rows[1].classList.contains('ok')).toBe(true);
		// rules always have a sane default, so they report green with their values
		expect(rows[3].classList.contains('ok')).toBe(true);
		expect(rows[3].querySelector('.kids-pub-check-value').textContent).toBe('15s per question · 1 hint · replay on · explanations on');
		// the header says how many things are left, in plain words
		expect(box.querySelector('.kids-pub-flag.wait').textContent).toContain('2 things to fix');
		// each Fix button carries the step it jumps to (all ≤ 4 → a free walk back)
		const fixes = [...box.querySelectorAll('.kids-pub-fix')];
		expect(fixes.map((b) => b.getAttribute('data-jump'))).toEqual(['1', '3']);
		expect(fixes[0].textContent).toContain('Choose a game');
		expect(Number(fixes[0].getAttribute('data-jump'))).toBeLessThan(5);
		expect(Number(fixes[1].getAttribute('data-jump'))).toBeLessThan(5);
		// tapping Fix moves the wizard to that step
		fixes[0].click();
		expect(document.getElementById('kidsGameWizardStep').value).toBe('1');
	});

	it('flags a Math Quest level with no questions instead of letting kids hit a dead map', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('math-quest');
		window.KidsGames.state.wizard.questions = QUESTIONS.slice();		// two levels, no questions assigned yet — the split-then-import case
		window.KidsGames.state.wizard.mqLevels = [
			{ id: 'lv-a', name: 'Level 1', count: 0, pass_stars: 1 },
			{ id: 'lv-b', name: 'Level 2', count: 0, pass_stars: 2 },
		];
		window.renderPublishChecklist();
		const box = document.getElementById('kidsPublishChecklist');
		const level = [...box.querySelectorAll('.kids-pub-check')].pop();
		expect(level.querySelector('.kids-pub-check-label').textContent).toBe('Adventure levels');
		expect(level.classList.contains('todo')).toBe(true);
		expect(level.querySelector('.kids-pub-check-value').textContent).toContain('empty level');
		expect(level.querySelector('.kids-pub-fix').getAttribute('data-jump')).toBe('3');
		// a healthy plan reports green and offers no Fix button
		window.KidsGames.state.wizard.mqLevels = [
			{ id: 'lv-a', name: 'Level 1', count: 2, pass_stars: 1 },
			{ id: 'lv-b', name: 'Level 2', count: 1, pass_stars: 2 },
		];
		window.renderPublishChecklist();
		const level2 = [...box.querySelectorAll('.kids-pub-check')].pop();
		expect(level2.classList.contains('ok')).toBe(true);
		expect(level2.querySelector('.kids-pub-check-value').textContent).toBe('2 levels with questions');
		expect(level2.querySelector('.kids-pub-fix')).toBeNull();
	});
});

describe('step 5 kid preview', () => {
	it('shows the game as a kid meets it, with the rules that change how it feels', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('math-quest');
		document.getElementById('kidsGameName').value = 'Jungle Maths';
		document.getElementById('kidsGameSubject').value = 'Maths';
		window.KidsGames.state.wizard.questions = QUESTIONS.slice();
		step5FromHeader();

		const prev = document.getElementById('kidsWizardPreview');
		expect(prev.querySelector('.kids-pub-kid-title').textContent).toBe('Jungle Maths');
		// label · grade · subject, exactly one separator each
		expect(prev.querySelector('.kids-pub-kid-sub').textContent).toBe('Math Quest · CP · Maths');
		expect(prev.querySelector('.kids-pub-kid-count').textContent).toBe('3 questions');
		const rules = [...prev.querySelectorAll('.kids-pub-kid-rules span')].map((s) => s.textContent);
		expect(rules).toEqual(['⏱ 15s', '💡 1 hint', '🔁 replay', '💬 explanations']);
		// the theme colour lands on the card, so the preview really previews
		expect(prev.querySelector('.kids-pub-kid').getAttribute('style')).toContain('background:');
		expect(prev.querySelector('.kids-pub-note').textContent).toContain('What the kids see');
	});

	it('keeps the rules honest when replay or explanations are switched off', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('bubble-pop');
		document.getElementById('kidsGameName').value = 'Dev Game';
		step5FromHeader();
		document.getElementById('kidsGameAllowReplay').checked = false;
		document.getElementById('kidsGameShowExplanations').checked = false;
		document.getElementById('kidsGameMaxHints').value = '0';
		window.updateKidsWizardPreview();
		const rules = [...document.querySelectorAll('#kidsWizardPreview .kids-pub-kid-rules span')]
			.map((s) => s.textContent);
		expect(rules).toEqual(['⏱ 15s', '💡 no hints', '🚫 no replay', '🙈 no explanations']);
	});

	it('draws the Math Quest level path with the star gate for each level', () => {
		wizardAtStep5();
		// a second level, so the path has something to draw
		document.getElementById('kidsMqAddLevel').click();
		window.updateKidsWizardPreview();
		const plan = window.KidsGames.state.wizard.mqLevels;
		expect(plan.length).toBe(2);
		const levels = [...document.querySelectorAll('#kidsWizardPreview .kids-pub-level')];
		expect(levels.length).toBe(plan.length);
		expect(levels.map((l) => l.querySelector('.kids-pub-level-name').textContent))
			.toEqual(['Level 1', 'Level 2']);
		// the preview text is derived from the plan, not a second hand-kept copy
		levels.forEach((l, i) => {
			const meta = l.querySelector('.kids-pub-level-meta').textContent;
			expect(meta).toContain(plan[i].count + ' q');
			expect(meta).toContain(plan[i].pass_stars + '⭐');
			expect(meta).toContain(i === plan.length - 1 ? 'final' : 'to pass');
		});
		// the arrow between levels is decorative, and there is one fewer than levels
		expect(document.querySelectorAll('#kidsWizardPreview .kids-pub-arrow').length).toBe(plan.length - 1);
		// a plain quiz type has no level path at all
		window.selectKidsGameType('bubble-pop');
		window.updateKidsWizardPreview();
		expect(document.querySelectorAll('#kidsWizardPreview .kids-pub-level').length).toBe(0);
	});
});

describe('step 5 inline PIN', () => {
	it('has no PIN block until the game is actually published', () => {
		wizardAtStep5();
		const result = document.getElementById('kidsPublishResult');
		expect(result.hidden).toBe(true);
		expect(document.getElementById('kidsPublishPin')).toBeNull();
		expect(document.getElementById('kidsPublishChamp').hidden).toBe(true);
		expect(document.getElementById('kidsPublishChecklist').querySelector('.kids-pub-flag.wait')).toBeNull();
	});

	it('publishes from step 5: PIN, QR, share actions — and the wizard stays open', async () => {
		wizardAtStep5();
		const game = { id: 'g-pub-1', pin: 'B7K2', name: 'Dev Game', game_type: 'math-quest', theme: 'jungle' };
		const calls = [];
		window.API = {
			raw: (method, url, body) => {
				calls.push({ method, url, body });
				if (method === 'POST' && /\/publish$/.test(url)) return Promise.resolve(game);
				return Promise.resolve(game);
			},
			list: () => Promise.resolve({ data: [] }),
		};
		window.KidsGames.state.editingId = 'game-abc-1234';
		window.KidsChampionships = { openCreate: vi.fn() };

		await window.publishKidsGame();

		// the wizard is NOT closed and the share modal was NOT stacked on top
		const wizard = document.getElementById('kidsGameWizardModal');
		expect(wizard.classList.contains('active')).toBe(true);
		expect(document.getElementById('kidsGameShareModal').classList.contains('active')).toBe(false);
		// the PIN is inline, big, and copy-pasteable
		const result = document.getElementById('kidsPublishResult');
		expect(result.hidden).toBe(false);
		expect(document.getElementById('kidsPublishPin').textContent).toBe('B7K2');
		expect(document.getElementById('kidsPublishUrl').getAttribute('href')).toContain('/kids/play/B7K2');
		// no qrcode lib in jsdom → the QR block falls back to the plain link
		expect(document.getElementById('kidsPublishQR').innerHTML).toContain('/kids/play/B7K2');
		// every share action the modal used to offer is reachable from the step
		['kidsPublishCopyBtn', 'kidsPublishCopyUrlBtn', 'kidsPublishPrintBtn', 'kidsPublishPreviewBtn', 'kidsPublishShareBtn']
			.forEach((id) => expect(document.getElementById(id)).toBeTruthy());
		// the checklist turns green and says so
		const checklist = document.getElementById('kidsPublishChecklist');
		expect(checklist.querySelectorAll('.kids-pub-check.todo').length).toBe(0);
		expect(checklist.querySelector('.kids-pub-flag.ok').textContent).toContain('Published');
		// footer button becomes the way out, and the hint carries the PIN too
		const pubBtn = document.getElementById('kidsWizardPublishBtn');
		expect(pubBtn.textContent).toBe('Done ✓');
		expect(pubBtn.className).toBe('btn btn-secondary');
		expect(document.getElementById('kidsWizardStepHint').textContent).toContain('PIN B7K2');
	});

	it('offers the one-tap championship with this game already selected', async () => {
		wizardAtStep5();
		const game = { id: 'g-pub-1', pin: 'B7K2', name: 'Dev Game', game_type: 'math-quest', theme: 'jungle' };
		window.API = { raw: () => Promise.resolve(game), list: () => Promise.resolve({ data: [] }) };
		window.KidsGames.state.editingId = 'game-abc-1234';
		const openCreate = vi.fn();
		window.KidsChampionships = { openCreate };
		const tab = document.querySelector('[data-games-studio-tab="kids-championships"]');
		const tabClick = vi.fn();
		tab.addEventListener('click', tabClick);

		await window.publishKidsGame();

		const champ = document.getElementById('kidsPublishChamp');
		expect(champ.hidden).toBe(false);
		expect(champ.textContent).toContain('Turn it into a championship?');
		const btn = document.getElementById('kidsPublishChampBtn');
		expect(btn).toBeTruthy();
		btn.click();
		// the studio switches pane, then opens the wizard pre-filled
		expect(tabClick).toHaveBeenCalledTimes(1);
		expect(openCreate).toHaveBeenCalledWith({ gameIds: ['g-pub-1'], name: 'Dev Game Championship' });
	});

	it('a second press of "Done ✓" closes the wizard', async () => {
		wizardAtStep5();
		const game = { id: 'g-pub-1', pin: 'B7K2', name: 'Dev Game', game_type: 'math-quest', theme: 'jungle' };
		window.API = { raw: () => Promise.resolve(game), list: () => Promise.resolve({ data: [] }) };
		window.KidsGames.state.editingId = 'game-abc-1234';
		await window.publishKidsGame();
		expect(document.getElementById('kidsGameWizardModal').classList.contains('active')).toBe(true);
		await window.publishKidsGame();
		expect(document.getElementById('kidsGameWizardModal').classList.contains('active')).toBe(false);
	});
});
