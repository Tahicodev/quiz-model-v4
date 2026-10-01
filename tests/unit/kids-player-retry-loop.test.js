/**
 * tests/unit/kids-player-retry-loop.test.js
 *
 * The reported bug: "the Vérifier button is stuck when I give a wrong answer
 * multiple times."
 *
 * A wrong answer used to put the same full-screen overlay up as the praise, and
 * hold it there for its timer. Every tap in that time landed on the overlay, so
 * the button looked stuck; answering wrong again started the whole wait over, so
 * it stayed stuck. This drives the real engine and the real game so the symptom
 * is measured rather than assumed.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameEngine } from '../../public/kids/engine/GameEngine.js';
import { GameRegistry } from '../../public/kids/engine/GameRegistry.js';
import { FeedbackEngine } from '../../public/kids/engine/FeedbackEngine.js';
import { WordOrderGame } from '../../public/kids/games/WordOrderGame.js';

// The engine pulls in audio, themes and rewards; none of them is what broke, and
// all of them need a browser the test does not have.
vi.mock('../../public/kids/engine/SoundManager.js', () => ({ SoundManager: { play: () => {} } }));
vi.mock('../../public/kids/engine/ThemeEngine.js', () => ({
  ThemeEngine: {
    applyTheme: () => {},
    applyAgeProfile: () => {},
    setMascotReaction: () => {},
  },
}));
vi.mock('../../public/kids/engine/RewardEngine.js', () => ({ RewardEngine: { badges: () => [], reaction: () => 'happy' } }));
vi.mock('../../public/kids/engine/ProgressionEngine.js', () => ({ ProgressionEngine: { suggest: () => 'easy' } }));

let engine;
let onAnswerSubmit;

const LEVEL = {
  id: 'lv1',
  level_type: 'word_order',
  points: 10,
  content: {
    instruction: 'Remets les lettres dans l\'ordre.',
    items: [
      { id: 'n1', value: 'C' },
      { id: 'n2', value: 'H' },
      { id: 'n3', value: 'A' },
      { id: 'n4', value: 'T' },
    ],
  },
  narrative: null,
};

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
});

afterEach(() => {
  if (engine) engine.destroy?.();
  engine = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** An engine whose answer is always wrong, and which never advances. */
function mountEngine(result) {
  onAnswerSubmit.mockResolvedValue(result);
  const viewportElement = document.getElementById('kids-game-viewport');
  engine = new GameEngine({ viewportElement, onAnswerSubmit });
  engine.feedback = new FeedbackEngine(document.body);
  engine.loadActivity(
    { id: 'a1', difficulty: 'easy' },
    { id: 's1', score: 0, stars: 0, current_level: 0 },
    LEVEL,
  );
  return engine;
}

const mountWrongAnswerEngine = () => mountEngine({ correct: false, explanation: 'Pas tout à fait.', streak: 0 });

const board = () => document.querySelector('.kids-game-board');
const validateBtn = () => board().querySelector('#btn-validate-order');
const placeAll = () => [...board().querySelectorAll('#source-pool .kids-tile')]
  .forEach(t => t.dispatchEvent(new Event('click', { bubbles: true })));

/**
 * Is the button actually usable? Not merely present in the DOM.
 *
 * jsdom does no layout, so this cannot measure whether something is painted over
 * the button. What it CAN check is the two things that actually broke: that no
 * full-screen overlay is standing over the game, and that pressing the button
 * still reaches the engine. A real screen needs a real browser to confirm the
 * overlay is not visible; that is what the tablet check is for.
 */
const isReachable = () => {
  const btn = validateBtn();
  if (!btn || btn.disabled) return false;
  if (document.querySelector('.kids-feedback-overlay')) return false;
  const before = onAnswerSubmit.mock.calls.length;
  btn.click();
  return onAnswerSubmit.mock.calls.length > before;
};

describe('a child can keep trying after a wrong answer', () => {
  it('leaves the Vérifier button pressable, straight away', async () => {
    // No timer advanced: the complaint is that the button is dead *now*, not
    // that it comes back later.
    mountWrongAnswerEngine();
    placeAll();
    validateBtn().click();
    await Promise.resolve();
    await Promise.resolve();
    expect(onAnswerSubmit).toHaveBeenCalledTimes(1);
    expect(isReachable()).toBe(true);
  });

  it('stays pressable when the same wrong answer is given again and again', async () => {
    // This is the reported loop: answer wrong, press again, and the wait starts
    // over. Three wrong answers in a row used to leave the button unreachable.
    mountWrongAnswerEngine();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      placeAll();
      expect(isReachable()).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(onAnswerSubmit).toHaveBeenCalledTimes(attempt);
    }
  });

  it('leaves the pieces the child needs to correct the answer in reach', async () => {
    // Being able to press the button is no use if the answer cannot be changed.
    mountWrongAnswerEngine();
    placeAll();
    validateBtn().click();
    await Promise.resolve();
    await Promise.resolve();
    // A placed letter can be taken back, and the pool can be refilled from it.
    expect(board().querySelectorAll('.kids-order-remove').length).toBe(4);
    board().querySelector('.kids-order-remove').click();
    expect(board().querySelectorAll('#source-pool .kids-tile').length).toBe(1);
    expect(isReachable()).toBe(true);
  });

  it('still says what went wrong, without covering the question', async () => {
    mountWrongAnswerEngine();
    placeAll();
    validateBtn().click();
    await Promise.resolve();
    await Promise.resolve();
    // The explanation is the point of a retry, and it is still there...
    expect(document.querySelector('.kids-feedback-banner-why').textContent).toBe('Pas tout à fait.');
    // ...and it is not a dialog covering the game.
    expect(document.querySelector('.kids-feedback-overlay')).toBeNull();
  });

  it('keeps the game in a state that accepts another answer', async () => {
    // The engine guards handleAnswer with the PLAYING state, so a wrong answer
    // that left it elsewhere would silently ignore every later attempt.
    mountWrongAnswerEngine();
    placeAll();
    validateBtn().click();
    await Promise.resolve();
    await Promise.resolve();
    expect(engine.state.is('playing')).toBe(true);
    placeAll();
    validateBtn().click();
    await Promise.resolve();
    await Promise.resolve();
    expect(onAnswerSubmit).toHaveBeenCalledTimes(2);
  });
});

describe('a correct answer still stops the game until the child is ready', () => {
  it('holds the praise up rather than rushing to the next level', async () => {
    mountEngine({ correct: true, earnedPoints: 10, streak: 1, stars: 1, completed: false, nextLevel: { ...LEVEL, id: 'lv2' } });
    placeAll();
    validateBtn().click();
    await Promise.resolve();
    await Promise.resolve();
    // The praise is a dialog on purpose: a level change really is behind it.
    expect(document.querySelector('.kids-feedback-overlay')).not.toBeNull();
    expect(document.querySelector('.kids-feedback-action')).not.toBeNull();
  });
});
