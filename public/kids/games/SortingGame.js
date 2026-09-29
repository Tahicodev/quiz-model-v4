/**
 * public/kids/games/SortingGame.js
 *
 * Core Renderer: Category Sorting.
 * Drag or tap items into the correct category basket.
 */

import { GameRegistry } from '../engine/GameRegistry.js';
import { DraggableItem } from '../components/DraggableItem.js';

export class SortingGame {
  constructor({ container, levelData, onSubmit, onHint }) {
    this.container = container;
    this.levelData = levelData;
    this.content = levelData.content;
    this.onSubmit = onSubmit;
    this.onHint = onHint;

    this.unassignedItems = [...(this.content.items || [])];
    this.sortedItems = new Map(); // categoryId -> Item[]
    (this.content.categories || []).forEach(c => this.sortedItems.set(c.id, []));
  }

  render() {
    this.container.innerHTML = `
      <div class="game-instruction">${this.content.instruction}</div>
      <div class="word-order-source-pool" id="sorting-pool"></div>
      <div class="sorting-baskets-row" id="baskets-row"></div>
      <div class="sorting-actions" style="margin-top: 20px;">
        <button id="btn-validate-sorting" class="kids-btn kids-btn-primary" style="display: none;">Valider le Tri 🧺</button>
      </div>
    `;

    this.renderPool();
    this.renderBaskets();

    const validateBtn = this.container.querySelector('#btn-validate-sorting');
    validateBtn.addEventListener('click', () => {
      const submission = [];
      this.sortedItems.forEach((items, categoryId) => {
        items.forEach(item => {
          submission.push({ itemId: item.id, categoryId });
        });
      });
      this.onSubmit(submission);
    });
  }

  renderPool() {
    const pool = this.container.querySelector('#sorting-pool');
    pool.innerHTML = '';

    this.unassignedItems.forEach(item => {
      const tile = document.createElement('div');
      tile.className = 'kids-tile';
      tile.innerHTML = `${item.emoji ? `<span>${item.emoji}</span> ` : ''}${item.value}`;

      DraggableItem.attach(tile, { data: item, dropZonesSelector: '.sorting-basket' });
      pool.appendChild(tile);
    });

    const validateBtn = this.container.querySelector('#btn-validate-sorting');
    if (this.unassignedItems.length === 0) {
      validateBtn.style.display = 'inline-flex';
    } else {
      validateBtn.style.display = 'none';
    }
  }

  renderBaskets() {
    const row = this.container.querySelector('#baskets-row');
    row.innerHTML = '';

    (this.content.categories || []).forEach(cat => {
      const basket = document.createElement('div');
      basket.className = 'sorting-basket';
      basket.dataset.categoryId = cat.id;
      basket.innerHTML = `
        <div class="basket-title">${cat.emoji ? `<span>${cat.emoji}</span> ` : ''}${cat.label}</div>
        <div class="basket-items-wrap" id="basket-${cat.id}"></div>
      `;

      const itemsWrap = basket.querySelector(`#basket-${cat.id}`);
      const itemsInBasket = this.sortedItems.get(cat.id) || [];
      itemsInBasket.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'kids-tile in-basket';
        itemEl.innerHTML = `${item.emoji ? `<span>${item.emoji}</span> ` : ''}${item.value}`;
        itemEl.addEventListener('click', () => {
          // Remove back to pool
          const idx = itemsInBasket.findIndex(i => i.id === item.id);
          if (idx !== -1) {
            itemsInBasket.splice(idx, 1);
            this.unassignedItems.push(item);
            this.renderPool();
            this.renderBaskets();
          }
        });
        itemsWrap.appendChild(itemEl);
      });

      DraggableItem.setupDropZone(basket, (zone, data) => {
        this.addItemToBasket(cat.id, data);
      });

      row.appendChild(basket);
    });
  }

  addItemToBasket(categoryId, item) {
    const poolIdx = this.unassignedItems.findIndex(i => i.id === item.id);
    if (poolIdx !== -1) {
      this.unassignedItems.splice(poolIdx, 1);
      this.sortedItems.get(categoryId).push(item);
      this.renderPool();
      this.renderBaskets();
    }
  }

  onWrongAnswer() {
    const row = this.container.querySelector('#baskets-row');
    if (row) {
      row.classList.add('retry-shake');
      setTimeout(() => row.classList.remove('retry-shake'), 500);
    }
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

GameRegistry.register('sorting', SortingGame);
