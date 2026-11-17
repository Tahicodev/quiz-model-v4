// @vitest-environment jsdom
/**
 * tests/unit/kids-play-templates.test.js
 *
 * Wizard Step 2 — "Choose how to play".
 *  - only presentations that can actually play the selected question types
 *    are offered (single vs multi answer, intent-specific Count & Tap and
 *    Number Balance),
 *  - the choice is serialized into config_json.play_template and hydrated
 *    back when a game is edited,
 *  - a stale/incompatible saved choice silently falls back to Auto,
 *  - Math Quest keeps its per-level template choice and offers Auto only.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../kids-games-management.js');

function buildDom() {
	document.body.innerHTML = `
		<div id="kidsGameWizardModal" class="modal">
			<form id="kidsGameWizardForm">
				<div id="kidsWizardProgress">
					${[1, 2, 3, 4, 5].map((n) => `<li class="kw-step" data-step="${n}"><span class="kw-num">${n}</span></li>`).join('')}
				</div>
				<div class="kids-wizard-body">
					${[1, 2, 3, 4, 5].map((n) => `<div class="kw-step-panel" data-step="${n}"></div>`).join('')}
					<div id="kidsThemeGrid"></div>
					<section class="kids-template-picker">
						<div class="kids-template-grid" id="kidsPlayTemplateGrid"></div>
						<p class="kids-template-note" id="kidsPlayTemplateNote"></p>
					</section>
					<div id="kidsWizardPreview"></div>
					<div id="kidsPublishChecklist"></div>
					<div id="kidsPublishResult" hidden></div>
					<div id="kidsPublishChamp" hidden></div>
					<div id="kidsSelectedQuestionsList"></div>
					<span id="kidsSelectedCount">0</span>
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

function mcQuestion(over = {}) {
	return Object.assign({
		id: 'q-' + Math.random().toString(36).slice(2, 8),
		type: 'multiple-choice',
		text: 'Quelle est la bonne réponse ?',
		options_json: '["a","b","c"]',
		answer: 'a',
	}, over);
}

async function flush() {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

function offeredIds() {
	return [...document.querySelectorAll('#kidsPlayTemplateGrid .kids-template-card')]
		.map((c) => c.dataset.template);
}

beforeEach(() => {
	buildDom();
	localStorage.clear();
	vi.restoreAllMocks();
	window.showToast = vi.fn();
	window.API = {
		raw: vi.fn(() => Promise.resolve({})),
		list: vi.fn(() => Promise.resolve({ data: [] })),
	};
	window.Auth = { getCurrentUser: () => ({ id: 'u1', role: 'teacher' }) };
	window.eval(readFileSync(SRC, 'utf8'));
});

describe('wizard Step 2 template compatibility', () => {
	it('offers only presentations a single-answer multiple-choice deck can play', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('bubble-pop');
		// no questions yet: candidates fall back to the game type's kid type
		expect(offeredIds()).toEqual(['auto', 'bubble-pop', 'subj-choice']);
		// the picker is a radiogroup-like button set, not a native select
		const cards = [...document.querySelectorAll('#kidsPlayTemplateGrid .kids-template-card')];
		expect(cards.every((c) => c.tagName === 'BUTTON' && c.type === 'button')).toBe(true);
		expect(cards.every((c) => c.getAttribute('aria-pressed') !== null)).toBe(true);
		expect(cards[0].getAttribute('aria-pressed')).toBe('true'); // Auto by default
	});

	it('never offers a multi-answer template for single-answer questions and vice versa', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('bubble-pop');
		window.KidsGames.state.wizard.questions = [mcQuestion()];
		window.renderKidsWizardSelectedQuestions();
		expect(offeredIds()).not.toContain('star-collector');
		expect(offeredIds()).toContain('bubble-pop');

		window.selectKidsGameType('star-collector');
		window.KidsGames.state.wizard.questions = [mcQuestion({ allowMultipleAnswers: true })];
		window.renderKidsWizardSelectedQuestions();
		expect(offeredIds()).toContain('star-collector');
		expect(offeredIds()).not.toContain('bubble-pop');
		expect(offeredIds()).not.toContain('subj-choice');
	});

	it('hides Count & Tap and Number Balance unless every question matches their intent', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('bubble-pop');
		window.KidsGames.state.wizard.questions = [
			mcQuestion({ text: 'Combien de pommes ? 🍎🍎🍎', options_json: '["2","3","4"]', answer: '3' }),
			mcQuestion({ text: 'Combien de poissons ? 🐟🐟', options_json: '["2","5"]', answer: '2' }),
		];
		window.renderKidsWizardSelectedQuestions();
		expect(offeredIds()).toContain('count-tap');
		expect(offeredIds()).not.toContain('num-balance');

		window.KidsGames.state.wizard.questions = [
			mcQuestion({ text: 'Compare : 3 … 5', options_json: '["<","=",">"]', answer: '<' }),
			mcQuestion({ text: 'Compare : 7 … 2', options_json: '["<","=",">"]', answer: '>' }),
		];
		window.renderKidsWizardSelectedQuestions();
		expect(offeredIds()).toContain('num-balance');
		expect(offeredIds()).not.toContain('count-tap');

		// one plain question in the deck drops both intent-only styles
		window.KidsGames.state.wizard.questions.push(mcQuestion());
		window.renderKidsWizardSelectedQuestions();
		expect(offeredIds()).not.toContain('num-balance');
		expect(offeredIds()).not.toContain('count-tap');
	});

	it('only ever advertises templates the player can actually render', () => {
		const playerSrc = readFileSync(path.resolve(__dirname, '../../public/kids/kids-player.js'), 'utf8');
		const supported = new Set(['auto']);
		const match = playerSrc.match(/var supported = \{([\s\S]*?)\};/);
		expect(match).toBeTruthy();
		for (const m of match[1].matchAll(/'([a-z0-9-]+)':/g)) supported.add(m[1]);

		window.openKidsGameWizard();
		window.selectKidsGameType('bubble-pop');
		window.KidsGames.state.wizard.questions = [
			mcQuestion({ text: 'Combien ? 🍎🍎', options_json: '["2","3"]' }),
		];
		window.renderKidsWizardSelectedQuestions();
		const ids = offeredIds();
		expect(ids.length).toBeGreaterThan(1);
		// every advertised choice is routable, and the removed Treasure Trail
		// (which had no renderer) never comes back
		ids.forEach((id) => expect(supported.has(id)).toBe(true));
		expect(ids).not.toContain('treasure-trail');
	});
});

describe('wizard Step 2 serialization + edit hydration', () => {
	it('writes the chosen style into config_json.play_template', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('bubble-pop');
		document.querySelector('#kidsPlayTemplateGrid [data-template="subj-choice"]').click();
		expect(window.KidsGames.state.wizard.playTemplate).toBe('subj-choice');
		const payload = window.KidsGames.collectPayload();
		expect(JSON.parse(payload.config_json).play_template).toBe('subj-choice');
		// the chosen card is the pressed one
		const selected = document.querySelector('#kidsPlayTemplateGrid .kids-template-card.selected');
		expect(selected.dataset.template).toBe('subj-choice');
		expect(selected.getAttribute('aria-pressed')).toBe('true');
	});

	it('falls back to auto when an incompatible or unknown style is chosen', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('bubble-pop');
		window.KidsGames.selectPlayTemplate('leap-frog'); // true-false only
		expect(window.KidsGames.state.wizard.playTemplate).toBe('auto');
		// a hand-edited/legacy value never reaches the payload
		window.KidsGames.state.wizard.playTemplate = 'not-a-template';
		expect(JSON.parse(window.KidsGames.collectPayload().config_json).play_template).toBe('auto');
	});

	it('restores the saved style when editing a game', async () => {
		const game = {
			id: 'game-1', name: 'Jungle Words', game_type: 'bubble-pop', theme: 'jungle',
			subject: 'Français', grade: 'cp',
			questions_json: JSON.stringify([mcQuestion({ text: 'Choisis le mot juste', id: 'q-1' })]),
			config_json: JSON.stringify({ play_template: 'subj-choice', time_per_q: 20 }),
		};
		window.API.raw = vi.fn(() => Promise.resolve(game));
		await window.openKidsGameWizard('game-1');
		await flush();
		expect(window.KidsGames.state.wizard.playTemplate).toBe('subj-choice');
		const selected = document.querySelector('#kidsPlayTemplateGrid .kids-template-card.selected');
		expect(selected).toBeTruthy();
		expect(selected.dataset.template).toBe('subj-choice');
		expect(document.getElementById('kidsPlayTemplateNote').textContent)
			.toContain('Choice Board');
	});

	it('drops a stale saved style that no longer fits the questions', async () => {
		const game = {
			id: 'game-2', name: 'Old Game', game_type: 'bubble-pop', theme: 'jungle',
			questions_json: JSON.stringify([mcQuestion({ id: 'q-2' })]),
			config_json: JSON.stringify({ play_template: 'leap-frog' }),
		};
		window.API.raw = vi.fn(() => Promise.resolve(game));
		await window.openKidsGameWizard('game-2');
		await flush();
		expect(window.KidsGames.state.wizard.playTemplate).toBe('auto');
		expect(document.querySelector('#kidsPlayTemplateGrid .kids-template-card.selected').dataset.template)
			.toBe('auto');
	});

	it('resets the style to auto when the game type changes', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('bubble-pop');
		window.KidsGames.selectPlayTemplate('subj-choice');
		expect(window.KidsGames.state.wizard.playTemplate).toBe('subj-choice');
		window.selectKidsGameType('pair-party');
		expect(window.KidsGames.state.wizard.playTemplate).toBe('auto');
	});
});

describe('wizard Step 2 — Math Quest keeps its own level templates', () => {
	it('offers Auto only and says so', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('math-quest');
		expect(offeredIds()).toEqual(['auto']);
		expect(document.getElementById('kidsPlayTemplateNote').textContent)
			.toContain('Math Quest keeps its own template choice on each adventure level.');
	});

	it('still serializes the level plan untouched next to play_template', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('math-quest');
		window.KidsGames.state.wizard.questions = [mcQuestion({ id: 'q-a' }), mcQuestion({ id: 'q-b' })];
		const cfg = window.KidsGames.buildConfig();
		expect(cfg.play_template).toBe('auto');
		expect(Array.isArray(cfg.levels)).toBe(true);
		expect(cfg.levels[0].questions).toEqual(['q-a', 'q-b']);
	});
});

describe('publish preview shows the chosen style', () => {
	it('names the play style on the kid preview card', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('bubble-pop');
		window.KidsGames.state.wizard.questions = [mcQuestion()];
		window.KidsGames.selectPlayTemplate('bubble-pop');
		window.updateKidsWizardPreview();
		const templateLine = document.querySelector('#kidsWizardPreview .kids-pub-kid-template');
		expect(templateLine.textContent).toContain('Bubble Pop');
	});
});
