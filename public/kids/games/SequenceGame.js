/**
 * public/kids/games/SequenceGame.js
 *
 * Core Renderer: Sequence & Chronology.
 * Students arrange elements in a sequence from left to right.
 */

import { GameRegistry } from '../engine/GameRegistry.js';
import { DraggableItem } from '../components/DraggableItem.js';

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
      <div class="word-order-target-slots" id="sequence-slots"></div>
      <div class="word-order-source-pool" id="sequence-pool"></div>
      <div style="margin-top: 20px;">
        <button id="btn-validate-sequence" class="kids-btn kids-btn-primary" style="display: none;">Vérifier la Suite ➡️</button>
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

    slotsEl.innerHTML = '';
    poolEl.innerHTML = '';

    if (this.orderedSlots.length === 0) {
      slotsEl.innerHTML = '<span class="slots-placeholder">Place les étapes dans l’ordre ici 👉</span>';
    } else {
      this.orderedSlots.forEach((item, idx) => {
        const tile = document.createElement('div');
        tile.className = 'kids-tile';
        tile.innerHTML = `<span>#${idx + 1}</span> ${item.emoji ? `<span>${item.emoji}</span> ` : ''}${item.value}`;
        tile.addEventListener('click', () => this.moveToPool(item.id));
        slotsEl.appendChild(tile);
      });
    }

    this.poolItems.forEach(item => {
      const tile = document.createElement('div');
      tile.className = 'kids-tile';
      tile.innerHTML = `${item.emoji ? `<span>${item.emoji}</span> ` : ''}${item.value}`;
      tile.addEventListener('click', () => this.moveToSlots(item.id));
      DraggableItem.attach(tile, { data: item, dropZonesSelector: '#sequence-slots' });
      poolEl.appendChild(tile);
    });

    DraggableItem.setupDropZone(slotsEl, (zone, data) => {
      this.moveToSlots(data.id);
    });

    if (this.poolItems.length === 0 && this.orderedSlots.length > 0) {
      validateBtn.style.display = 'inline-flex';
    } else {
      validateBtn.style.display = 'none';
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
