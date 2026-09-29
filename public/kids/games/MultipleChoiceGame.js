/**
 * public/kids/games/MultipleChoiceGame.js
 *
 * Core Renderer: Multiple Choice with colorful cards and emojis.
 */

import { GameRegistry } from '../engine/GameRegistry.js';

export class MultipleChoiceGame {
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
      ${this.levelData.media_url ? `<div class="kids-media-wrap"><img src="${this.levelData.media_url}" class="kids-media-img" alt="Illustration" /></div>` : ''}
      <div class="mc-options-grid"></div>
    `;

    const grid = this.container.querySelector('.mc-options-grid');
    (this.content.options || []).forEach(opt => {
      const card = document.createElement('button');
      card.className = 'kids-option-card';
      card.type = 'button';
      card.innerHTML = `
        ${opt.emoji ? `<span class="opt-emoji">${opt.emoji}</span>` : ''}
        <span class="opt-value">${opt.value}</span>
      `;

      card.addEventListener('click', () => {
        card.classList.add('card-tap');
        this.onSubmit(opt.id);
      });

      grid.appendChild(card);
    });
  }

  onWrongAnswer() {
    // Visual shake on options
    const grid = this.container.querySelector('.mc-options-grid');
    if (grid) {
      grid.classList.add('retry-shake');
      setTimeout(() => grid.classList.remove('retry-shake'), 500);
    }
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

GameRegistry.register('multiple_choice', MultipleChoiceGame);
