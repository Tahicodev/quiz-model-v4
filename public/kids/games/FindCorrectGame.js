/**
 * public/kids/games/FindCorrectGame.js
 *
 * Core Renderer: Find the Correct Target or Odd One Out.
 */

import { GameRegistry } from '../engine/GameRegistry.js';

export class FindCorrectGame {
  constructor({ container, levelData, onSubmit, onHint }) {
    this.container = container;
    this.levelData = levelData;
    this.content = levelData.content;
    this.onSubmit = onSubmit;
    this.onHint = onHint;
  }

  render() {
    this.container.innerHTML = `
      <div class="game-instruction">${this.content.instruction}</div>
      <div class="game-question-banner">${this.content.question}</div>
      <div class="mc-options-grid" id="find-grid"></div>
    `;

    const grid = this.container.querySelector('#find-grid');
    (this.content.items || []).forEach(item => {
      const card = document.createElement('button');
      card.className = 'kids-option-card';
      card.type = 'button';
      card.innerHTML = `
        ${item.emoji ? `<span class="opt-emoji">${item.emoji}</span>` : ''}
        <span class="opt-value">${item.value}</span>
      `;

      card.addEventListener('click', () => {
        card.classList.add('card-tap');
        this.onSubmit(item.id);
      });

      grid.appendChild(card);
    });
  }

  onWrongAnswer() {
    const grid = this.container.querySelector('#find-grid');
    if (grid) {
      grid.classList.add('retry-shake');
      setTimeout(() => grid.classList.remove('retry-shake'), 500);
    }
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

GameRegistry.register('find_correct', FindCorrectGame);
