/**
 * public/kids/games/WordOrderGame.js
 *
 * Core Renderer: Word and Letter Ordering.
 * Clicking or dragging a letter/word tile moves it into the answer row.
 *
 * The answer row is the numbered track from components/OrderTrack.js: the
 * positions are visible before anything is placed, which is what makes "how
 * many letters does this word have?" answerable by looking rather than guessing.
 */

import { GameRegistry } from '../engine/GameRegistry.js';
import { DraggableItem } from '../components/DraggableItem.js';
import { OrderTrack } from '../components/OrderTrack.js';

export class WordOrderGame {
  constructor({ container, levelData, onSubmit, onHint }) {
    this.container = container;
    this.levelData = levelData;
    this.content = levelData.content;
    this.onSubmit = onSubmit;
    this.onHint = onHint;

    // Scramble tiles initially
    this.poolItems = [...(this.content.items || [])].sort(() => Math.random() - 0.5);
    this.placedItems = [];
  }

  render() {
    this.container.innerHTML = `
      <div class="game-instruction">${this.content.instruction}</div>
      <div id="target-slots"></div>
      <div class="kids-pool-zone">
        <p class="kids-pool-label">Pièces à placer</p>
        <div class="word-order-source-pool" id="source-pool"></div>
      </div>
      <div class="word-order-actions">
        <button id="btn-validate-order" class="kids-btn kids-btn-primary kids-btn-lg" style="display: none;">Valider 🚀</button>
      </div>
    `;

    this.renderTiles();

    // Setup drop zones
    const targetSlots = this.container.querySelector('#target-slots');
    DraggableItem.setupDropZone(targetSlots, (zone, data) => {
      this.moveItemToTarget(data.id);
    });

    const sourcePool = this.container.querySelector('#source-pool');
    DraggableItem.setupDropZone(sourcePool, (zone, data) => {
      this.moveItemToPool(data.id);
    });

    const validateBtn = this.container.querySelector('#btn-validate-order');
    validateBtn.addEventListener('click', () => {
      const answer = this.placedItems.map(i => i.value).join('');
      this.onSubmit(answer);
    });
  }

  renderTiles() {
    const targetSlots = this.container.querySelector('#target-slots');
    const sourcePool = this.container.querySelector('#source-pool');
    const validateBtn = this.container.querySelector('#btn-validate-order');

    sourcePool.innerHTML = '';

    // One slot per letter, always drawn: the answer has a visible shape from the
    // moment the game opens, so a child knows how many pieces to find.
    this.track = new OrderTrack({
      zone: targetSlots,
      total: this.poolItems.length + this.placedItems.length,
      placed: this.placedItems,
      emptyLabel: '👇 Touche une pièce pour la placer',
      hint: '👆 Touche une lettre pour la remettre ici',
      onSendBack: (id) => this.moveItemToPool(id),
      onClear: () => this.clearAll(),
    });
    this.track.render();

    if (this.poolItems.length === 0) {
      sourcePool.innerHTML = '<span class="kids-pool-empty">Toutes les pièces sont placées 🎉</span>';
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
      tile.addEventListener('click', () => this.moveItemToTarget(item.id));
      DraggableItem.attach(tile, { data: item, dropZonesSelector: '#target-slots' });
      sourcePool.appendChild(tile);
    });

    // The answer only exists once every piece is in place, so the button appears
    // then — but it says what it is, rather than appearing as a surprise.
    const ready = this.poolItems.length === 0 && this.placedItems.length > 0;
    validateBtn.style.display = ready ? 'inline-flex' : 'none';
    if (ready) {
      validateBtn.textContent = `Vérifier « ${this.placedItems.map(i => i.value).join('')} » ✅`;
    }
  }

  moveItemToTarget(id) {
    const idx = this.poolItems.findIndex(i => i.id === id);
    if (idx !== -1) {
      const [item] = this.poolItems.splice(idx, 1);
      this.placedItems.push(item);
      this.renderTiles();
    }
  }

  moveItemToPool(id) {
    const idx = this.placedItems.findIndex(i => i.id === id);
    if (idx !== -1) {
      const [item] = this.placedItems.splice(idx, 1);
      this.poolItems.push(item);
      this.renderTiles();
    }
  }

  /** Send every placed piece back, keeping the order the pool was scrambled in. */
  clearAll() {
    this.poolItems = [...this.placedItems, ...this.poolItems];
    this.placedItems = [];
    this.renderTiles();
  }

  onWrongAnswer() {
    const targetSlots = this.container.querySelector('#target-slots');
    if (targetSlots) {
      targetSlots.classList.add('retry-shake');
      setTimeout(() => targetSlots.classList.remove('retry-shake'), 500);
    }
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

GameRegistry.register('word_order', WordOrderGame);
