/**
 * tests/unit/kids-player-submit-failures.test.js
 *
 * The reported bug: a child chose the correct answer and got
 * "Connexion interrompue. Vérifie internet puis essaie encore."
 *
 * The message was a guess. handleAnswer's catch reported every failure the same
 * way — a dropped socket, an expired session, a level that no longer exists and
 * a fault on the server all produced "check your internet", so a child could
 * never do anything about it. And because the engine stayed in EVALUATING, every
 * later answer was ignored in silence, which is a second way the Vérifier button
 * reads as stuck.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine } from '../../public/kids/engine/GameEngine.js';
import { FeedbackEngine } from '../../public/kids/engine/FeedbackEngine.js';
import { WordOrderGame } from '../../public/kids/games/WordOrderGame.js';

vi.mock('../../public/kids/engine/SoundManager.js', () => ({ SoundManager: { play: () => {} } }));
vi.mock('../../public/kids/engine/ThemeEngine.js', () => ({
  ThemeEngine: { applyTheme: () => {}, applyAgeProfile: () => {}, setMascotReaction: () => {} },
}));
vi.mock('../../public/kids/engine/RewardEngine.js', () => ({
  RewardEngine: { badges: () => [], reaction: () => 'happy' },
}));
vi.mock('../../public/kids/engine/ProgressionEngine.js', () => ({ ProgressionEngine: { suggest: () => 'easy' } }));

const LEVEL = {
  id: 'lv1',
  level_type: 'word_order',
  points: 10,
  content: {
    instruction: 'Remets les lettres dans l\'ordre.',
    items: [{ id: 'n1', value: 'C' }, { id: 'n2', value: 'H' }],
  },
  narrative: null,
};

let engine;
let onAnswerSubmit;

beforeEach(() => {
  document.body.innerHTML = `
    <div class="kids-mascot"></div>
    <div class="kids-star-counter"></div>
    <div class="kids-score-badge"></div>
    <div class="kids-level-indicator"></div>
    <div class="kids-progress-bar"></div>
    <main class="kids-main"><div id="kids-game-viewport" class="kids-game-viewport"></div></main>
  `;
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  onAnswerSubmit = vi.fn();
  engine = new GameEngine({ viewportElement: document.getElementById('kids-game-viewport'), onAnswerSubmit });
  engine.feedback = new FeedbackEngine(document.body);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  engine.destroy?.();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const mount = () => engine.loadActivity({ id: 'a1', difficulty: 'easy' }, { id: 's1', score: 0, stars: 0, current_level: 0 }, LEVEL);
const board = () => document.querySelector('.kids-game-board');
const validateBtn = () => board().querySelector('#btn-validate-order');
const placeAll = () => [...board().querySelectorAll('#source-pool .kids-tile')]
  .forEach(t => t.dispatchEvent(new Event('click', { bubbles: true })));
const shownText = () => [...document.querySelectorAll('.kids-hint-bubble, .kids-hint')].map(el => el.textContent).join(' ');
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

// A fresh page for each case: the engine and the board are built per fixture.
function freshPage() {
  document.body.innerHTML = `
    <div class="kids-mascot"></div>
    <div class="kids-star-counter"></div>
    <div class="kids-score-badge"></div>
    <div class="kids-level-indicator"></div>
    <div class="kids-progress-bar"></div>
    <main class="kids-main"><div id="kids-game-viewport" class="kids-game-viewport"></div></main>
  `;
  engine = new GameEngine({ viewportElement: document.getElementById('kids-game-viewport'), onAnswerSubmit });
  engine.feedback = new FeedbackEngine(document.body);
  return engine;
}

describe('a submit that fails says what actually happened', () => {
  it('does not tell the child to check their internet for every failure', async () => {
    // The message has to name the cause, or it is not advice, it is a guess.
    const cases = [
      { err: Object.assign(new Error('Pas de connexion. Vérifie internet puis réessaie.'), { status: 0 }) },
      { err: Object.assign(new Error('Ta session a expiré. Reconnecte-toi pour continuer.'), { status: 401 }) },
      { err: Object.assign(new Error('Niveau introuvable'), { status: 404 }) },
      { err: Object.assign(new Error('Erreur interne du serveur'), { status: 500 }) },
    ];
    for (const { err } of cases) {
      onAnswerSubmit.mockRejectedValue(err);
      freshPage();
      mount();
      placeAll();
      validateBtn().click();
      await settle();
      expect(shownText()).toContain(err.message);
      expect(shownText()).not.toContain('Connexion interrompue');
    }
  });

  it('still says something when the failure carries no reason at all', async () => {
    onAnswerSubmit.mockRejectedValue(new Error(''));
    mount();
    placeAll();
    validateBtn().click();
    await settle();
    expect(shownText().length).toBeGreaterThan(0);
    expect(shownText()).not.toContain('Connexion interrompue');
  });
});

describe('a failed submit leaves the child able to try again', () => {
  it('goes back to playing, so a second answer is not ignored', async () => {
    // handleAnswer drops any answer that is not asked for while PLAYING, so an
    // engine left in EVALUATING discards everything that follows, silently.
    onAnswerSubmit.mockRejectedValue(new Error('Réseau coupé'));
    mount();
    placeAll();
    validateBtn().click();
    await settle();
    expect(engine.state.is('playing')).toBe(true);

    onAnswerSubmit.mockResolvedValue({ correct: true, earnedPoints: 10, streak: 1, stars: 1, completed: false, nextLevel: { ...LEVEL, id: 'lv2' } });
    validateBtn().click();
    await settle();
    // The second attempt was really sent, and really graded.
    expect(onAnswerSubmit).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.kids-feedback-overlay')).not.toBeNull();
  });

  it('survives repeated failures without wedging', async () => {
    onAnswerSubmit.mockRejectedValue(new Error('Réseau coupé'));
    mount();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      placeAll();
      validateBtn().click();
      await settle();
      expect(engine.state.is('playing')).toBe(true);
      expect(onAnswerSubmit).toHaveBeenCalledTimes(attempt);
    }
  });

  it('does not show praise for an answer that was never recorded', async () => {
    // Showing the praise would add points the server never awarded, and move a
    // child past a level whose answer was lost.
    onAnswerSubmit.mockRejectedValue(new Error('Réseau coupé'));
    mount();
    placeAll();
    validateBtn().click();
    await settle();
    expect(document.querySelector('.kids-feedback-overlay')).toBeNull();
    expect(document.querySelector('.kids-streak-badge')).toBeNull();
  });
});