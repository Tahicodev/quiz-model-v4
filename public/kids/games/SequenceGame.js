/**
 * public/kids/games/SequenceGame.js
 *
 * Core Renderer: Sequence & Chronology.
 * Students arrange elements in a sequence from left to right.
 *
 * The positions used to be printed as raw text inside each tile — "#2 4+4" —
 * which read as part of the answer and gave no sense of how many steps the
 * sequence needed. They are now the numbered track from components/OrderTrack.js,
 * the same one word_order uses, so the child sees the shape of the answer and
 * each step's place before placing anything.
 */

import { GameRegistry } from '../engine/GameRegistry.js';
import { DraggableItem } from '../components/DraggableItem.js';
import { OrderTrack } from '../components/OrderTrack.js';

export class SequenceGame {
  constructor({ container, levelData, onSubmit, onHint }) {
    this.container = container;
    this.levelData = levelData;
    this.content = levelData.content;
    this.onSubmit = onSubmit;
    this.onHint = onHint;

    this.poolItems = [...(this.content.items || [])].sort(() => Math.random() - 0.5);
    this.orderedSlots = [];
  }

  render() {
    this.container.innerHTML = `
      <div class="game-instruction">${this.content.instruction}</div>
      <div id="sequence-slots"></div>
      <div class="kids-pool-zone">
        <p class="kids-pool-label">Étapes à placer</p>
        <div class="word-order-source-pool" id="sequence-pool"></div>
      </div>
      <div class="word-order-actions">
        <button id="btn-validate-sequence" class="kids-btn kids-btn-primary kids-btn-lg" style="display: none;">Vérifier la Suite ➡️</button>
      </div>
    `;

    this.renderSlotsAndPool();

    const validateBtn = this.container.querySelector('#btn-validate-sequence');
    validateBtn.addEventListener('click', () => {
      const order = this.orderedSlots.map(i => i.id);
      this.onSubmit(order);
    });
  }

  renderSlotsAndPool() {
    const slotsEl = this.container.querySelector('#sequence-slots');
    const poolEl = this.container.querySelector('#sequence-pool');
    const validateBtn = this.container.querySelector('#btn-validate-sequence');

    poolEl.innerHTML = '';

    this.track = new OrderTrack({
      zone: slotsEl,
      total: this.poolItems.length + this.orderedSlots.length,
      placed: this.orderedSlots,
      emptyLabel: '👇 Touche une étape pour la placer',
      hint: '👆 Touche une étape pour la remettre ici',
      onSendBack: (id) => this.moveToPool(id),
      onClear: () => this.clearAll(),
    });
    this.track.render();

    if (this.poolItems.length === 0) {
      poolEl.innerHTML = '<span class="kids-pool-empty">Toutes les étapes sont placées 🎉</span>';
    }

    this.poolItems.forEach(item => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'kids-tile';
      if (item.emoji) {
        const emoji = document.createElement('span');
        emoji.className = 'kids-order-emoji';
        emoji.setAttribute('aria-hidden', 'true');
        emoji.textContent = item.emoji;
        tile.appendChild(emoji);
      }
      tile.appendChild(document.createTextNode(String(item.value ?? '')));
      tile.setAttribute('aria-label', `Place ${item.value ?? ''}`);
      tile.addEventListener('click', () => this.moveToSlots(item.id));
      DraggableItem.attach(tile, { data: item, dropZonesSelector: '#sequence-slots' });
      poolEl.appendChild(tile);
    });

    DraggableItem.setupDropZone(slotsEl, (zone, data) => {
      this.moveToSlots(data.id);
    });

    const ready = this.poolItems.length === 0 && this.orderedSlots.length > 0;
    validateBtn.style.display = ready ? 'inline-flex' : 'none';
    if (ready) {
      validateBtn.textContent = 'Vérifier la Suite ➡️';
    }
  }

  moveToSlots(id) {
    const idx = this.poolItems.findIndex(i => i.id === id);
    if (idx !== -1) {
      const [item] = this.poolItems.splice(idx, 1);
      this.orderedSlots.push(item);
      this.renderSlotsAndPool();
    }
  }

  moveToPool(id) {
    const idx = this.orderedSlots.findIndex(i => i.id === id);
    if (idx !== -1) {
      const [item] = this.orderedSlots.splice(idx, 1);
      this.poolItems.push(item);
      this.renderSlotsAndPool();
    }
  }

  /** Send every placed step back to the pool. */
  clearAll() {
    this.poolItems = [...this.orderedSlots, ...this.poolItems];
    this.orderedSlots = [];
    this.renderSlotsAndPool();
  }

  onWrongAnswer() {
    const slotsEl = this.container.querySelector('#sequence-slots');
    if (slotsEl) {
      slotsEl.classList.add('retry-shake');
      setTimeout(() => slotsEl.classList.remove('retry-shake'), 500);
    }
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

GameRegistry.register('sequence', SequenceGame);
