/**
 * public/kids/components/OrderTrack.js
 *
 * The numbered answer row used by the ordering games: word_order and sequence.
 *
 * It used to be a dashed box that grew as tiles were dropped in, with the
 * position printed as raw text inside the tile — "#2 4+4". A child could not
 * tell how many answers were still needed, where the next one would go, or that
 * a tile could be taken back without starting over.
 *
 * This renders a fixed row of slots, one per expected item, so the answer has a
 * shape from the first second. Every slot is numbered, filled or not, and the
 * numbers are what a child reads to decide what to do next.
 *
 * It owns no game data. The caller passes what is placed and where it sends
 * things back, so word_order (which submits the rebuilt word) and sequence
 * (which submits the item ids) can share the same screen.
 */

/** A child's ordinal for a position: 1st, 2nd, 3rd, then 4th. */
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export class OrderTrack {
  /**
   * @param {{
   *   zone: HTMLElement,
   *   total: number,
   *   placed: Array<object>,
   *   emptyLabel?: string,
   *   hint?: string,
   *   onSendBack: (id: any) => void,
   *   onClear?: () => void,
   * }} options
   */
  constructor({ zone, total, placed, emptyLabel, hint, onSendBack, onClear }) {
    this.zone = zone;
    this.total = Math.max(0, total | 0);
    this.placed = placed;
    this.emptyLabel = emptyLabel || 'Place the pieces here';
    this.hint = hint || 'Tap a piece to put it back';
    this.onSendBack = onSendBack;
    this.onClear = onClear;
  }

  render() {
    const { zone, total, placed } = this;
    zone.innerHTML = '';
    zone.classList.add('kids-order-track');

    // How far along the child is, in words. A progress bar shows it too, but a
    // child who cannot yet read a bar needs this line.
    const status = document.createElement('p');
    status.className = 'kids-order-status';
    status.innerHTML = total === 0
      ? '<span class="kids-order-status-empty">Nothing to place</span>'
      : `<strong>${placed.length}</strong> of <strong>${total}</strong> in place`;
    zone.appendChild(status);

    const row = document.createElement('ol');
    row.className = 'kids-order-slots';

    for (let i = 0; i < total; i += 1) {
      const item = placed[i];
      const li = document.createElement('li');
      li.className = 'kids-order-slot';

      const badge = document.createElement('span');
      badge.className = 'kids-order-badge';
      badge.textContent = String(i + 1);
      // The number is decoration for a screen reader: the slot itself is
      // labelled "Position 1, CHAT" below, so the badge would only be read
      // twice.
      badge.setAttribute('aria-hidden', 'true');
      li.appendChild(badge);

      if (item) {
        li.classList.add('is-filled');
        const value = document.createElement('span');
        value.className = 'kids-order-value';
        if (item.emoji) {
          const emoji = document.createElement('span');
          emoji.className = 'kids-order-emoji';
          emoji.setAttribute('aria-hidden', 'true');
          emoji.textContent = item.emoji;
          value.appendChild(emoji);
        }
        // textContent, not innerHTML: the value came from a model or a teacher,
        // and a level is not a place to interpret markup.
        value.appendChild(document.createTextNode(String(item.value ?? '')));
        li.appendChild(value);

        // A real button, so it is reachable by keyboard and announced as an
        // action rather than as decoration.
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'kids-order-remove';
        back.textContent = '↩';
        back.title = `Take back ${item.value ?? ''}`;
        back.setAttribute('aria-label', `Take back ${item.value ?? ''} and put it back in the pool`);
        back.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onSendBack(item.id);
        });
        li.appendChild(back);

        li.setAttribute('aria-label', `Position ${i + 1}, ${item.value ?? ''}`);
      } else {
        li.classList.add('is-empty');
        // The very first empty slot carries the instruction instead of an
        // ordinal: told once, in the place the child is already looking.
        const isFirst = i === 0 && placed.length === 0;
        if (isFirst) li.classList.add('is-first-empty');
        const empty = document.createElement('span');
        empty.className = 'kids-order-empty';
        empty.textContent = isFirst ? this.emptyLabel : ordinal(i + 1);
        empty.setAttribute('aria-hidden', 'true');
        li.appendChild(empty);
        li.setAttribute('aria-label', `Position ${i + 1}, empty`);
      }

      row.appendChild(li);
    }

    zone.appendChild(row);

    if (placed.length > 0) {
      const tools = document.createElement('div');
      tools.className = 'kids-order-tools';
      const hint = document.createElement('span');
      hint.className = 'kids-order-hint';
      hint.textContent = this.hint;
      tools.appendChild(hint);

      if (this.onClear && placed.length > 1) {
        // Only offered once there is more than one thing to undo, so a child
        // does not clear a single placed piece by reflex.
        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'kids-btn kids-btn-sm kids-order-clear';
        clear.textContent = '↺ Start again';
        clear.addEventListener('click', () => this.onClear());
        tools.appendChild(clear);
      }
      zone.appendChild(tools);
    }
  }
}
