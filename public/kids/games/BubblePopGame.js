/**
 * public/kids/games/BubblePopGame.js
 *
 * Core Renderer: Bubble Pop.
 * Colorful bubbles float upward; children tap the correct bubble to pop it.
 */

import { GameRegistry } from '../engine/GameRegistry.js';

export class BubblePopGame {
  constructor({ container, levelData, onSubmit, onHint }) {
    this.container = container;
    this.levelData = levelData;
    this.content = levelData.content;
    this.onSubmit = onSubmit;
    this.onHint = onHint;
    this.animationTimer = null;
  }

  render() {
    this.container.innerHTML = `
      <div class="game-instruction">${this.content.instruction}</div>
      <div class="game-question-banner">Cible : <strong>${this.content.target.value}</strong></div>
      <div class="bubble-pop-arena" id="bubble-arena"></div>
    `;

    const arena = this.container.querySelector('#bubble-arena');
    const bubbles = this.content.bubbles || [];

    bubbles.forEach((b, idx) => {
      const bubbleEl = document.createElement('div');
      bubbleEl.className = 'floating-bubble';
      bubbleEl.textContent = b.value;

      // Stagger random horizontal position and animation delay
      const leftPos = Math.max(5, Math.min(85, (idx * 28 + Math.random() * 15) % 85));
      const animDelay = (idx * 0.8) % 4;
      const animDuration = 4 + (idx % 3) * 1.5;

      bubbleEl.style.left = `${leftPos}%`;
      bubbleEl.style.animationDelay = `${animDelay}s`;
      bubbleEl.style.animationDuration = `${animDuration}s`;

      bubbleEl.addEventListener('click', () => {
        // Pop effect
        bubbleEl.style.transform = 'scale(1.4)';
        bubbleEl.style.opacity = '0';
        setTimeout(() => {
          bubbleEl.remove();
          this.onSubmit(b.id);
        }, 180);
      });

      arena.appendChild(bubbleEl);
    });
  }

  onWrongAnswer() {
    const arena = this.container.querySelector('#bubble-arena');
    if (arena) {
      arena.classList.add('retry-shake');
      setTimeout(() => arena.classList.remove('retry-shake'), 500);
    }
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

GameRegistry.register('bubble_pop', BubblePopGame);
