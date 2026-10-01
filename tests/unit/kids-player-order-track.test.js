/**
 * tests/unit/kids-player-order-track.test.js
 *
 * The ordering games printed their positions as raw text inside each tile:
 * "#2 4+4". That read as part of the answer rather than as a position, and a
 * child had no way to see how many pieces the answer needed, where the next one
 * went, or how to take a piece back.
 *
 * The track now draws a fixed row of numbered slots. These tests pin the parts a
 * child depends on: a slot per expected piece, visible numbers, a way to take a
 * piece back, and a way to start again.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrderTrack } from '../../public/kids/components/OrderTrack.js';

let zone;

beforeEach(() => {
  document.body.innerHTML = '<div id="track"></div>';
  zone = document.getElementById('track');
});

afterEach(() => {
  vi.useRealTimers();
});

const letters = values => values.map((value, i) => ({ id: `n${i + 1}`, value }));

function render({ total, placed, onSendBack, onClear } = {}) {
  const track = new OrderTrack({
    zone,
    total: total ?? 4,
    placed: placed ?? [],
    emptyLabel: '👇 Touche une pièce',
    onSendBack: onSendBack ?? (() => {}),
    onClear,
  });
  track.render();
  return track;
}

const slots = () => [...zone.querySelectorAll('.kids-order-slot')];
const badges = () => [...zone.querySelectorAll('.kids-order-badge')].map(b => b.textContent);
const values = () => [...zone.querySelectorAll('.kids-order-value')].map(v => v.textContent);

describe('the answer has a shape before anything is placed', () => {
  it('draws one slot per expected piece, empty', () => {
    // A box that only grows cannot answer "how many letters does this word
    // have?", and that is the first question a child asks.
    render({ total: 4 });
    expect(slots()).toHaveLength(4);
    expect(slots().every(s => s.classList.contains('is-empty'))).toBe(true);
  });

  it('numbers every slot from one, filled or not', () => {
    render({ total: 4, placed: letters(['C', 'H']) });
    expect(badges()).toEqual(['1', '2', '3', '4']);
  });

  it('never prints a number into the answer text', () => {
    // The old tile rendered "#2 4+4": a child reading the answer aloud would
    // have read the position as part of it.
    render({ total: 3, placed: letters(['4+4', '2+2']) });
    const text = zone.textContent;
    expect(text).not.toMatch(/#\d/);
    expect(values()).toEqual(['4+4', '2+2']);
  });

  it('says the instruction in the first empty slot only', () => {
    render({ total: 3 });
    expect(zone.querySelector('.is-first-empty .kids-order-empty').textContent).toBe('👇 Touche une pièce');
    // Once something is placed the slots are back to being positions, so the
    // instruction does not follow the child around the row.
    render({ total: 3, placed: letters(['A']) });
    expect(zone.querySelector('.is-first-empty')).toBeNull();
  });

  it('reports how far along the child is, in words', () => {
    render({ total: 4 });
    expect(zone.querySelector('.kids-order-status').textContent.replace(/\s+/g, ' ')).toBe('0 of 4 in place');
    render({ total: 4, placed: letters(['A', 'B']) });
    expect(zone.querySelector('.kids-order-status').textContent.replace(/\s+/g, ' ')).toBe('2 of 4 in place');
  });

  it('handles a level with nothing to order without drawing a broken row', () => {
    render({ total: 0 });
    expect(slots()).toHaveLength(0);
    expect(zone.textContent).toContain('Nothing to place');
  });
});

describe('a child can take a piece back', () => {
  it('offers a button on a placed piece that sends it back', () => {
    const sent = [];
    render({ total: 3, placed: letters(['C', 'H']), onSendBack: id => sent.push(id) });
    const backs = [...zone.querySelectorAll('.kids-order-remove')];
    expect(backs).toHaveLength(2);
    backs[0].click();
    expect(sent).toEqual(['n1']);
  });

  it('names the piece in the button, so it is not a mystery arrow', () => {
    render({ total: 2, placed: letters(['C', 'H']) });
    const [first] = [...zone.querySelectorAll('.kids-order-remove')];
    expect(first.getAttribute('aria-label')).toContain('C');
    expect(first.title).toContain('C');
  });

  it('tells a screen reader which position holds what', () => {
    render({ total: 3, placed: letters(['C']) });
    expect(slots()[0].getAttribute('aria-label')).toBe('Position 1, C');
    expect(slots()[1].getAttribute('aria-label')).toBe('Position 2, empty');
  });

  it('offers a way to start again, but only once there is more than one piece', () => {
    // Clearing a single placed piece by reflex would be a mis-tap, not a
    // decision, so the control appears when undoing is worth offering.
    render({ total: 4, placed: letters(['A']), onClear: () => {} });
    expect(zone.querySelector('.kids-order-clear')).toBeNull();
    render({ total: 4, placed: letters(['A', 'B']), onClear: () => {} });
    expect(zone.querySelector('.kids-order-clear')).not.toBeNull();
  });

  it('starts again on request', () => {
    let cleared = 0;
    render({ total: 4, placed: letters(['A', 'B']), onClear: () => { cleared += 1; } });
    zone.querySelector('.kids-order-clear').click();
    expect(cleared).toBe(1);
  });

  it('hides the undo controls when nothing is placed', () => {
    render({ total: 4, placed: [], onClear: () => {} });
    expect(zone.querySelector('.kids-order-tools')).toBeNull();
  });
});

describe('a piece is never treated as markup', () => {
  it('shows a value containing tags as the words themselves', () => {
    // Values come from a model or a teacher. A level is not a place to
    // interpret HTML, and one that injected a tag would break the row silently.
    render({ total: 1, placed: [{ id: 'n1', value: '<img src=x onerror=alert(1)>' }] });
    expect(zone.querySelectorAll('img')).toHaveLength(0);
    expect(zone.querySelector('.kids-order-value').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('keeps an emoji out of what is announced', () => {
    render({ total: 1, placed: [{ id: 'n1', value: 'CHAT', emoji: '🐱' }] });
    const emoji = zone.querySelector('.kids-order-emoji');
    expect(emoji.textContent).toBe('🐱');
    expect(emoji.getAttribute('aria-hidden')).toBe('true');
  });
});
