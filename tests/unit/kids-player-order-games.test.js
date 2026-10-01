/**
 * tests/unit/kids-player-order-games.test.js
 *
 * The two ordering games, rendered for real in a DOM.
 *
 * The bug this pins: SequenceGame printed the position as text inside the tile
 * ("#2 4+4"), and both games drew the answer row as a dashed box that only grew
 * as pieces were dropped in. A child could not tell how many pieces the answer
 * needed, and the number in the tile read as part of the answer.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WordOrderGame } from '../../public/kids/games/WordOrderGame.js';
import { SequenceGame } from '../../public/kids/games/SequenceGame.js';

let container;
let submitted;

beforeEach(() => {
  document.body.innerHTML = '<div id="game"></div>';
  container = document.getElementById('game');
  submitted = [];
  // The games shuffle, so a fixed random keeps the pool order predictable here.
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const wordLevel = {
  content: {
    instruction: 'Remets les lettres dans l\'ordre.',
    items: [{ id: 'n1', value: 'C' }, { id: 'n2', value: 'H' }, { id: 'n3', value: 'A' }, { id: 'n4', value: 'T' }],
  },
};

const sequenceLevel = {
  content: {
    instruction: 'Mets les étapes dans l\'ordre.',
    items: [
      { id: 's1', value: '4+4', emoji: '🧮' },
      { id: 's2', value: '2+2' },
      { id: 's3', value: '6+6' },
    ],
  },
};

const mount = (Klass, level) => {
  const game = new Klass({ container, levelData: level, onSubmit: a => submitted.push(a), onHint: () => {} });
  game.render();
  return game;
};

const zoneOf = () => container.querySelector('.kids-order-track');
const slotCount = () => container.querySelectorAll('.kids-order-slot').length;
const poolValues = () => [...container.querySelectorAll('#source-pool .kids-tile, #sequence-pool .kids-tile')].map(t => t.textContent);
const fill = (game, place) => [...game.poolItems].forEach(item => place(game, item.id));

// The track styles its own box, so the zone must not also carry the old
// .word-order-target-slots box: two sets of display/padding rules on one
// element fight, and the row comes out centred and clipped rather than a grid
// of slots.
const ownsItsBox = () => expect(zoneOf().classList.contains('word-order-target-slots')).toBe(false);

// Fill every slot. Iterating a copy, because placing an item removes it from
// the pool, and a forEach over the live array would skip every other piece.
const fillOrder = game => fill(game, (g, id) => g.moveItemToTarget(id));
const fillSteps = game => fill(game, (g, id) => g.moveToSlots(id));

describe('word order', () => {
  it('draws a slot per letter before anything is placed', () => {
    mount(WordOrderGame, wordLevel);
    expect(slotCount()).toBe(4);
    // The old row was an empty dashed box: no count, no positions.
    expect(container.querySelector('.kids-order-status').textContent.replace(/\s+/g, ' ')).toBe('0 of 4 in place');
    ownsItsBox();
  });

  it('shows the letter in a numbered slot, with no number inside the text', () => {
    const game = mount(WordOrderGame, wordLevel);
    game.moveItemToTarget('n1');
    const slot = container.querySelector('.kids-order-slot');
    expect(slot.querySelector('.kids-order-value').textContent).toBe('C');
    expect(slot.querySelector('.kids-order-badge').textContent).toBe('1');
    // A child reading the answer aloud must not read the position as part of it.
    expect(zoneOf().textContent).not.toMatch(/#\d/);
  });

  it('offers Validate only once every letter is placed, naming the word', () => {
    const game = mount(WordOrderGame, wordLevel);
    const btn = container.querySelector('#btn-validate-order');
    expect(btn.style.display).toBe('none');
    fillOrder(game);
    expect(btn.style.display).toBe('inline-flex');
    // The button says what it will check, so it is not a leap of faith.
    expect(btn.textContent).toContain(game.placedItems.map(i => i.value).join(''));
  });

  it('submits the rebuilt word', () => {
    const game = mount(WordOrderGame, wordLevel);
    fillOrder(game);
    container.querySelector('#btn-validate-order').click();
    expect(submitted).toEqual([game.placedItems.map(i => i.value).join('')]);
  });

  it('takes one letter back without losing the rest', () => {
    const game = mount(WordOrderGame, wordLevel);
    fillOrder(game);
    const backs = [...container.querySelectorAll('.kids-order-remove')];
    backs[1].click();
    expect(game.placedItems.map(i => i.id)).toEqual(['n1', 'n3', 'n4']);
    expect(game.poolItems.map(i => i.id)).toEqual(['n2']);
    expect(slotCount()).toBe(4);
  });

  it('starts again on request', () => {
    const game = mount(WordOrderGame, wordLevel);
    fillOrder(game);
    container.querySelector('.kids-order-clear').click();
    expect(game.placedItems).toHaveLength(0);
    // Nothing is lost: the letters are all back in the pool.
    expect(game.poolItems).toHaveLength(4);
    expect(poolValues()).toHaveLength(4);
  });

  it('says the pool is empty instead of leaving a blank gap', () => {
    const game = mount(WordOrderGame, wordLevel);
    fillOrder(game);
    expect(container.querySelector('.kids-pool-empty')).not.toBeNull();
  });
});

describe('sequence', () => {
  it('draws a slot per step before anything is placed', () => {
    mount(SequenceGame, sequenceLevel);
    expect(slotCount()).toBe(3);
    ownsItsBox();
  });

  it('puts the position in a badge, never in the step text', () => {
    // This is the reported bug: the tile read "#2 4+4".
    const game = mount(SequenceGame, sequenceLevel);
    fillSteps(game);
    const slots = [...container.querySelectorAll('.kids-order-slot')];
    expect(slots.map(s => s.querySelector('.kids-order-badge').textContent)).toEqual(['1', '2', '3']);
    // The step is the words on their own: the emoji is decoration beside them
    // and the position lives in the badge, not in the text a child would read.
    const stepText = s => [...s.querySelectorAll('.kids-order-value')].map(v => v.textContent).join('');
    expect(slots.map(stepText)).toEqual(['🧮4+4', '2+2', '6+6']);
    expect(slots[0].querySelector('.kids-order-value').lastChild.textContent).toBe('4+4');
    expect(zoneOf().textContent).not.toMatch(/#\d/);
  });

  it('keeps an emoji beside the step, out of the announced text', () => {
    const game = mount(SequenceGame, sequenceLevel);
    fillSteps(game);
    const emoji = container.querySelector('.kids-order-emoji');
    expect(emoji.textContent).toBe('🧮');
    expect(emoji.getAttribute('aria-hidden')).toBe('true');
  });

  it('submits the step ids, in the order they were placed', () => {
    const game = mount(SequenceGame, sequenceLevel);
    game.moveToSlots('s2');
    game.moveToSlots('s1');
    game.moveToSlots('s3');
    container.querySelector('#btn-validate-sequence').click();
    expect(submitted).toEqual([['s2', 's1', 's3']]);
  });

  it('takes a step back to its place in the pool', () => {
    const game = mount(SequenceGame, sequenceLevel);
    fillSteps(game);
    container.querySelectorAll('.kids-order-remove')[0].click();
    expect(game.orderedSlots.map(i => i.id)).toEqual(['s2', 's3']);
    expect(game.poolItems.map(i => i.id)).toEqual(['s1']);
  });

  it('still drops a dragged step onto the row', () => {
    // The pointer path and the tap path both have to keep working.
    const game = mount(SequenceGame, sequenceLevel);
    const tile = container.querySelector('#sequence-pool .kids-tile');
    expect(tile.getAttribute('draggable')).toBe('true');
    const drop = new Event('drop', { bubbles: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: () => JSON.stringify(game.poolItems[0]) } });
    container.querySelector('#sequence-slots').dispatchEvent(drop);
    expect(game.orderedSlots).toHaveLength(1);
  });
});
