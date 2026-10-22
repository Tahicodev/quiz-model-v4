// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '../../kids-games-management.js');

beforeEach(() => {
	document.body.innerHTML = `
		<div id="kidsGameWizardModal" class="modal">
			<form id="kidsGameWizardForm">
				<div id="kidsWizardProgress">
					${[1, 2, 3, 4, 5].map((n) => `<li class="kw-step" data-step="${n}"><span class="kw-num">${n}</span></li>`).join('')}
				</div>
				${[1, 2, 3, 4, 5].map((n) => `<div class="kw-step-panel" data-step="${n}"></div>`).join('')}
				<input type="hidden" id="kidsGameWizardStep" value="1" />
				<input type="text" id="kidsGameName" value="Dev Game" />
				<input type="text" id="kidsGameSubject" />
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
		<div id="kidsWizardPreview"></div>
	`;
	window.showToast = () => {};
	window.API = { raw: () => Promise.resolve({}), list: () => Promise.resolve({ data: [] }) };
	window.Auth = { getCurrentUser: () => ({ id: 'u1', role: 'admin' }) };
	window.eval(readFileSync(SRC, 'utf8'));
});

describe('Math Quest wizard levels editor', () => {
	it('syncs the plan when questions were added AFTER type selection, then +Add level works', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('math-quest');
		expect(document.getElementById('kidsMqLevelsGroup').hidden).toBe(false);
		document.getElementById('kidsGameName').value = 'Dev Game';
		// teacher adds 3 questions in step 3 — the regression path: they
		// arrive AFTER the plan was initialized (empty) at type selection
		window.KidsGames.state.wizard.questions = [
			{ id: 'q1', type: 'multiple-choice', text: 'A?', options_json: '[]', answer: 'x' },
			{ id: 'q2', type: 'multiple-choice', text: 'B?', options_json: '[]', answer: 'y' },
			{ id: 'q3', type: 'multiple-choice', text: 'C?', options_json: '[]', answer: 'z' },
		];
		// walk 1 → 4 like a real teacher (forward jump is gated by maxWizardStep)
		window.kidsWizardNextStep(); window.kidsWizardNextStep(); window.kidsWizardNextStep();
		expect(window.KidsGames.state.wizardStep).toBe(4);
		// entering step 4 re-syncs: 1 level covering all 3 questions
		const rows = document.querySelectorAll('#kidsMqLevelsList .kids-mq-level');
		expect(rows.length).toBe(1);
		expect(document.querySelectorAll('#kidsMqLevelsList .kids-mq-chip').length).toBe(3);

		// "+ Add level" steals the last question → 2 levels
		document.getElementById('kidsMqAddLevel').click();
		const rows2 = document.querySelectorAll('#kidsMqLevelsList .kids-mq-level');
		expect(rows2.length).toBe(2);
		const chips = [...document.querySelectorAll('#kidsMqLevelsList .kids-mq-level .kids-mq-chip')];
		expect(chips.length).toBe(3); // no chips lost
		// preview sees the new plan
		window.updateKidsWizardPreview();
		expect(document.getElementById('kidsWizardPreview').textContent).toContain('2 level(s)');
	});

	it('split and merge keep every question assigned exactly once', () => {
		window.openKidsGameWizard();
		window.selectKidsGameType('math-quest');
		document.getElementById('kidsGameName').value = 'Dev Game';
		window.KidsGames.state.wizard.questions = [
			{ id: 'q1', type: 'multiple-choice', text: 'A?', options_json: '[]', answer: 'x' },
			{ id: 'q2', type: 'multiple-choice', text: 'B?', options_json: '[]', answer: 'y' },
			{ id: 'q3', type: 'multiple-choice', text: 'C?', options_json: '[]', answer: 'z' },
		];
		window.kidsWizardNextStep(); window.kidsWizardNextStep(); window.kidsWizardNextStep();
		expect(window.KidsGames.state.wizardStep).toBe(4);
		// split level 1 in two
		const splitBtn = document.querySelector('#kidsMqLevelsList [data-act="split"]');
		expect(splitBtn).toBeTruthy();
		splitBtn.click();
		expect(document.querySelectorAll('#kidsMqLevelsList .kids-mq-level').length).toBe(2);
		expect(document.querySelectorAll('#kidsMqLevelsList .kids-mq-chip').length).toBe(3);
		// merge back into level 1
		const mergeBtn = document.querySelector('#kidsMqLevelsList [data-act="merge"]');
		mergeBtn.click();
		expect(document.querySelectorAll('#kidsMqLevelsList .kids-mq-level').length).toBe(1);
		const chips = document.querySelectorAll('#kidsMqLevelsList .kids-mq-chip');
		expect(chips.length).toBe(3);
	});

	it('edit hydration: existing 2-level plan keeps stable ids and names', async () => {
		const game = {
			id: 'game-abc', game_type: 'math-quest', theme: 'jungle', grade: 'cp', name: 'Saved',
			questions_json: JSON.stringify([
				{ id: 'q1', type: 'multiple-choice', text: 'A?', options_json: '[]', answer: 'x' },
				{ id: 'q2', type: 'multiple-choice', text: 'B?', options_json: '[]', answer: 'y' },
				{ id: 'q3', type: 'multiple-choice', text: 'C?', options_json: '[]', answer: 'z' },
			]),
			config_json: JSON.stringify({
				levels: [
					{ id: 'lv-keep-1', name: 'Jungle Trail', questions: ['q1', 'q2'], pass_stars: 1, art: 'home' },
					{ id: 'lv-keep-2', name: 'Temple', questions: ['q3'], pass_stars: 2, art: 'temple' },
				],
			}),
		};
		// kidsApi uses window.API.raw(method, '/kids' + path, body)
		window.API = {
			raw: (method, path) => (path === '/kids/game-abc' ? Promise.resolve(game) : Promise.resolve({})),
			list: () => Promise.resolve({ data: [] }),
		};
		window.openKidsGameWizard('game-abc');
		// wait for the mocked GET to resolve + hydrate
		await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
		const names = [...document.querySelectorAll('#kidsMqLevelsList .kids-mq-name')].map((el) => el.value);
		expect(names).toEqual(['Jungle Trail', 'Temple']);
	});
});
