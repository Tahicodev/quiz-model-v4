/**
 * public/kids/games/WordOrderGame.js
 *
 * Core Renderer: Word and Letter Ordering.
 * Clicking or dragging a letter/word tile moves it into the answer slot.
 */

import { GameRegistry } from '../engine/GameRegistry.js';
import { DraggableItem } from '../components/DraggableItem.js';

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
      <div class="word-order-target-slots" id="target-slots"></div>
      <div class="word-order-source-pool" id="source-pool"></div>
      <div class="word-order-actions">
        <button id="btn-validate-order" class="kids-btn kids-btn-primary" style="display: none;">Valider 🚀</button>
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

    targetSlots.innerHTML = '';
    sourcePool.innerHTML = '';

    if (this.placedItems.length === 0) {
      targetSlots.innerHTML = '<span class="slots-placeholder">Touche ou glisse les éléments ici 👇</span>';
    } else {
      this.placedItems.forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'kids-tile';
        tile.textContent = item.value;
        tile.addEventListener('click', () => this.moveItemToPool(item.id));
        DraggableItem.attach(tile, { data: item, dropZonesSelector: '#source-pool' });
        targetSlots.appendChild(tile);
      });
    }

    this.poolItems.forEach(item => {
      const tile = document.createElement('div');
      tile.className = 'kids-tile';
      tile.textContent = item.value;
      tile.addEventListener('click', () => this.moveItemToTarget(item.id));
      DraggableItem.attach(tile, { data: item, dropZonesSelector: '#target-slots' });
      sourcePool.appendChild(tile);
    });

    // Show button when all items are placed
    if (this.poolItems.length === 0 && this.placedItems.length > 0) {
      validateBtn.style.display = 'inline-flex';
    } else {
      validateBtn.style.display = 'none';
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
