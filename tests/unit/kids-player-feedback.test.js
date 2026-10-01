/**
 * tests/unit/kids-player-feedback.test.js
 *
 * What a child is shown after answering, and whether they can carry on playing.
 *
 * Two bugs, and one of them was mine. The cards had no button, only a timer.
 * Adding one was not enough: I also made the retry card wait 6s "so the child
 * could read it", which turned a timer into a full-screen block. A child who
 * answered wrong then found the Vérifier button stuck — every tap landed on the
 * overlay — and answering wrong again started the whole wait over. The retry is
 * now a banner that blocks nothing, and the praise is a dialog because a level
 * change really is waiting behind it.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FeedbackEngine } from '../../public/kids/engine/FeedbackEngine.js';

let feedback;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
  feedback = new FeedbackEngine(document.body);
  // jsdom has no WebAudio; the sounds are a side effect, not the subject here.
  vi.spyOn(feedback, 'playSuccessSound').mockImplementation(() => {});
  vi.spyOn(feedback, 'playErrorSound').mockImplementation(() => {});
});

afterEach(() => {
  feedback.destroy();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const overlay = () => document.querySelector('.kids-feedback-overlay');
const card = () => document.querySelector('.kids-feedback-card');
const action = () => document.querySelector('.kids-feedback-action');

describe('the card is a dialog a child can be in control of', () => {
  it('is announced as a dialog, not as decoration over the game', () => {
    feedback.showSuccess(10, 0);
    expect(overlay().getAttribute('role')).toBe('dialog');
    expect(overlay().getAttribute('aria-modal')).toBe('true');
  });

  it('offers a button that closes it, so waiting is not the only way out', () => {
    feedback.showSuccess(10, 0);
    expect(action()).not.toBeNull();
    expect(action().textContent).toContain('Continuer');
    action().click();
    // The fade takes 400ms, so the card is still leaving but is on its way.
    expect(overlay().classList.contains('fade-out')).toBe(true);
  });

  it('puts the keyboard inside the dialog when it opens', () => {
    // Otherwise the focus stays behind the overlay, on the game's buttons, and a
    // keyboard or screen-reader user is answering to a card they cannot reach.
    feedback.showSuccess(10, 0);
    expect(document.activeElement).toBe(action());
  });

  it('closes on Escape', () => {
    feedback.showSuccess(10, 0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(overlay().classList.contains('fade-out')).toBe(true);
  });

  it('stops listening for Escape once it is gone', () => {
    feedback.showSuccess(10, 0);
    action().click();
    vi.runAllTimers();
    expect(overlay()).toBeNull();
    // A later Escape must not reach a removed card, or the next one closes too.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(overlay()).toBeNull();
  });

  it('never stacks two cards', () => {
    // A child who answered again quickly used to get a second overlay on top of
    // the first, hiding the one that explained the answer they had just given.
    feedback.showSuccess(10, 0);
    feedback.showSuccess(10, 1);
    expect(document.querySelectorAll('.kids-feedback-overlay')).toHaveLength(1);
  });

  it('takes a lingering card away when a retry replaces it', () => {
    // The praise is gone and the banner is in its place: a card praising the last
    // answer must not sit over a question the child is still working on.
    feedback.showSuccess(10, 0);
    feedback.showEncouragement('Presque.');
    expect(document.querySelectorAll('.kids-feedback-overlay')).toHaveLength(0);
    expect(document.querySelectorAll('.kids-feedback-banner')).toHaveLength(1);
  });
});

describe('the card says what happened', () => {
  it('shows the points that were earned', () => {
    feedback.showSuccess(25, 0);
    expect(card().querySelector('.kids-feedback-points').textContent).toContain('+25');
  });

  it('shows a streak once there is one worth showing', () => {
    feedback.showSuccess(10, 0);
    expect(card().querySelector('.kids-streak-badge')).toBeNull();
    feedback.showSuccess(10, 4);
    expect(card().querySelector('.kids-streak-badge').textContent).toContain('4');
  });

  it('shows the explanation on a retry, because that is the reason for it', () => {
    feedback.showEncouragement('Le soleil est une étoile, pas une planète.');
    const shown = document.querySelector('.kids-feedback-banner-why');
    expect(shown).not.toBeNull();
    expect(shown.textContent).toBe('Le soleil est une étoile, pas une planète.');
  });

  it('leaves out an explanation it was not given', () => {
    feedback.showEncouragement(null);
    expect(document.querySelector('.kids-feedback-banner-why')).toBeNull();
  });

  it('tells a success from a retry by its rim, and stays warm about it', () => {
    // The success is a dialog and the retry a banner, so they are told apart by
    // the class as much as by the words: one stops the game, the other does not.
    feedback.showSuccess(10, 0);
    expect(overlay().className).toContain('kids-feedback-success');
    feedback.showEncouragement();
    expect(overlay()).toBeNull();
    expect(document.querySelector('.kids-feedback-banner')).not.toBeNull();
  });
});

describe('the card leaves on its own if the child walks away', () => {
  it('goes after a moment on a success', () => {
    feedback.showSuccess(10, 0);
    vi.advanceTimersByTime(3000);
    expect(overlay()).toBeNull();
  });

  it('does not leave on a timer once the child has closed it', () => {
    feedback.showSuccess(10, 0);
    action().click();
    vi.runAllTimers();
    expect(overlay()).toBeNull();
    expect(document.querySelectorAll('.kids-feedback-overlay')).toHaveLength(0);
  });
});

describe('a retry does not stand between the child and the game', () => {
  it('takes no focus, so a child mid-answer is not moved out of the question', () => {
    // Taking focus is the other half of being stuck: the drop lands in a dialog
    // instead of on the letter the child was reaching for.
    const input = document.createElement('button');
    document.body.appendChild(input);
    input.focus();
    feedback.showEncouragement('Regarde les nombres.');
    expect(document.activeElement).toBe(input);
  });

  it('is announced politely rather than interrupting', () => {
    feedback.showEncouragement('Regarde les nombres.');
    const banner = document.querySelector('.kids-feedback-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.getAttribute('aria-live')).toBe('polite');
  });

  it('does not cover the game: nothing is full-screen and nothing traps a tap', () => {
    // The old retry was position:fixed inset:0, so every tap on the answer — the
    // pieces, the Vérifier button — landed on the overlay until its timer ended.
    feedback.showEncouragement('Regarde les nombres.');
    expect(document.querySelector('.kids-feedback-overlay')).toBeNull();
    expect(document.querySelector('.kids-feedback-banner')).not.toBeNull();
  });

  it('leaves the Vérifier button there to press again', () => {
    const game = document.createElement('div');
    game.innerHTML = '<button id="v">Vérifier</button>';
    document.body.appendChild(game);
    feedback.showEncouragement('Presque.');
    expect(game.querySelector('#v')).not.toBeNull();
    expect(game.querySelector('#v').disabled).toBe(false);
  });

  it('sits with the game it is talking about, not on the document', () => {
    // A banner left on document.body would still be up over the next level,
    // explaining an answer to a question that is no longer on screen.
    const board = document.createElement('div');
    board.className = 'kids-game-board';
    document.body.appendChild(board);
    feedback.showEncouragement('Regarde bien.');
    expect(board.querySelector('.kids-feedback-banner')).not.toBeNull();
  });

  it('goes when asked, and leaves nothing behind', () => {
    feedback.showEncouragement('Regarde bien.');
    document.querySelector('.kids-feedback-banner-close').click();
    expect(document.querySelector('.kids-feedback-banner')).toBeNull();
  });

  it('names its close button, so it is not a mystery cross', () => {
    feedback.showEncouragement('Regarde bien.');
    expect(document.querySelector('.kids-feedback-banner-close').getAttribute('aria-label')).toBe('Hide this message');
  });

  it('shows the reason it is there, as words rather than markup', () => {
    feedback.showEncouragement('<img src=x onerror=alert(1)>');
    const why = document.querySelector('.kids-feedback-banner-why');
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(why.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('replaces its own message rather than stacking a second one', () => {
    feedback.showEncouragement('Première.');
    feedback.showEncouragement('Deuxième.');
    const banners = document.querySelectorAll('.kids-feedback-banner');
    expect(banners).toHaveLength(1);
    expect(banners[0].querySelector('.kids-feedback-banner-why').textContent).toBe('Deuxième.');
  });

  it('leaves nothing behind when the engine is destroyed', () => {
    feedback.showEncouragement('Regarde bien.');
    feedback.destroy();
    expect(document.querySelector('.kids-feedback-banner')).toBeNull();
  });

  it('still tells a caller that asked to be told', () => {
    // The old retry card reported on dismissal, which was the point of the
    // callback. A banner is not waited for, so it reports at once instead of
    // never — a caller waiting forever is how a level hangs.
    let told = 0;
    feedback.showEncouragement('Regarde bien.', { onDismiss: () => { told += 1; } });
    expect(told).toBe(1);
  });
});

describe('the card tells the game when the child is ready', () => {
  it('hands the game the moment the card is gone, not before', () => {
    // The engine used to change level on a 1500ms timer while this card stayed
    // up for 2600ms, so the next question arrived underneath praise for the
    // last one, and the button could not change that.
    let advanced = 0;
    feedback.showSuccess(10, 0, { onDismiss: () => { advanced += 1; } });
    vi.advanceTimersByTime(2500);
    expect(advanced).toBe(0);
    action().click();
    expect(advanced).toBe(1);
  });

  it('counts one advance however the card was closed', () => {
    let advanced = 0;
    const onDismiss = () => { advanced += 1; };
    feedback.showSuccess(10, 0, { onDismiss });
    // Button, then a stray Escape, then the timer that the button cancelled.
    action().click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    vi.runAllTimers();
    expect(advanced).toBe(1);
  });

  it('still advances when the child walks away and the timer ends the card', () => {
    let advanced = 0;
    feedback.showSuccess(10, 0, { onDismiss: () => { advanced += 1; } });
    vi.advanceTimersByTime(2600);
    expect(advanced).toBe(1);
  });

  it('does not treat being torn down as the child dismissing the card', () => {
    let advanced = 0;
    feedback.showSuccess(10, 0, { onDismiss: () => { advanced += 1; } });
    feedback.destroy();
    expect(advanced).toBe(0);
    expect(overlay()).toBeNull();
  });

  it('drops a pending advance when the child answers again instead', () => {
    // Reaching a retry means the child is still on the same question, so the
    // praise card's advance is stale: firing it would skip the question they
    // have just tried to answer.
    let advanced = 0;
    feedback.showSuccess(10, 0, { onDismiss: () => { advanced += 1; } });
    feedback.showEncouragement('Presque.');
    expect(advanced).toBe(0);
    // And the card is gone, so it cannot be dismissed later and jump the level.
    vi.runAllTimers();
    expect(advanced).toBe(0);
  });
});
