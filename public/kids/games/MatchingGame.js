/**
 * public/kids/games/MatchingGame.js
 *
 * Core Renderer: Connect / Match Pairs.
 * Student taps an item on the left, then taps the corresponding item on the right.
 */

import { GameRegistry } from '../engine/GameRegistry.js';

export class MatchingGame {
  constructor({ container, levelData, onSubmit, onHint }) {
    this.container = container;
    this.levelData = levelData;
    this.content = levelData.content;
    this.onSubmit = onSubmit;
    this.onHint = onHint;

    this.selectedLeft = null;
    this.matchedPairs = []; // [{ leftId, rightId }]
    this.leftItems = [...(this.content.leftItems || [])];
    this.rightItems = [...(this.content.rightItems || [])];
  }

  render() {
    this.container.innerHTML = `
      <div class="game-instruction">${this.content.instruction}</div>
      <div class="matching-board">
        <div class="matching-col" id="col-left"></div>
        <div class="matching-col" id="col-right"></div>
      </div>
    `;

    this.renderColumns();
  }

  renderColumns() {
    const colLeft = this.container.querySelector('#col-left');
    const colRight = this.container.querySelector('#col-right');

    colLeft.innerHTML = '';
    colRight.innerHTML = '';

    const matchedLeftIds = new Set(this.matchedPairs.map(p => p.leftId));
    const matchedRightIds = new Set(this.matchedPairs.map(p => p.rightId));

    this.leftItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'matching-item';
      if (matchedLeftIds.has(item.id)) card.classList.add('is-paired');
      if (this.selectedLeft === item.id) card.classList.add('is-selected');

      card.innerHTML = `${item.emoji ? `<span>${item.emoji}</span> ` : ''}${item.text}`;
      card.addEventListener('click', () => {
        if (matchedLeftIds.has(item.id)) return;
        this.selectedLeft = item.id;
        this.renderColumns();
      });
      colLeft.appendChild(card);
    });

    this.rightItems.forEach(item => {
      const card = document.createElement('div');
      card.className = 'matching-item';
      if (matchedRightIds.has(item.id)) card.classList.add('is-paired');

      card.innerHTML = `${item.emoji ? `<span>${item.emoji}</span> ` : ''}${item.text}`;
      card.addEventListener('click', () => {
        if (matchedRightIds.has(item.id) || !this.selectedLeft) return;

        this.matchedPairs.push({
          leftId: this.selectedLeft,
          rightId: item.id,
        });
        this.selectedLeft = null;
        this.renderColumns();

        // Check if all pairs are matched
        if (this.matchedPairs.length === this.leftItems.length) {
          setTimeout(() => {
            this.onSubmit(this.matchedPairs);
          }, 300);
        }
      });
      colRight.appendChild(card);
    });
  }

  onWrongAnswer() {
    this.matchedPairs = [];
    this.selectedLeft = null;
    this.renderColumns();
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

GameRegistry.register('matching', MatchingGame);
