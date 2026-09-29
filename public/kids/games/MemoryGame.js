/**
 * public/kids/games/MemoryGame.js
 *
 * Core Renderer: Memory Card Matching.
 * Tapping a card flips it over; match pairs to clear the board.
 */

import { GameRegistry } from '../engine/GameRegistry.js';

export class MemoryGame {
  constructor({ container, levelData, onSubmit, onHint }) {
    this.container = container;
    this.levelData = levelData;
    this.content = levelData.content;
    this.onSubmit = onSubmit;
    this.onHint = onHint;

    // Shuffle cards
    this.cards = [...(this.content.cards || [])].sort(() => Math.random() - 0.5);
    this.flippedCards = []; // max 2
    this.matchedPairs = []; // [{ card1Id, card2Id }]
    this.locked = false;
  }

  render() {
    this.container.innerHTML = `
      <div class="game-instruction">${this.content.instruction}</div>
      <div class="memory-grid" id="memory-grid"></div>
    `;

    const grid = this.container.querySelector('#memory-grid');
    this.cards.forEach(card => {
      const cardEl = document.createElement('div');
      cardEl.className = 'memory-card';
      cardEl.dataset.cardId = card.id;
      cardEl.innerHTML = `<span class="card-back-icon">❓</span>`;

      cardEl.addEventListener('click', () => this.handleCardClick(card, cardEl));
      grid.appendChild(cardEl);
    });
  }

  handleCardClick(card, cardEl) {
    if (this.locked) return;
    if (this.flippedCards.some(f => f.card.id === card.id)) return;
    if (cardEl.classList.contains('is-matched')) return;

    // Flip card
    cardEl.classList.add('is-flipped');
    cardEl.innerHTML = `<span>${card.emoji || card.value}</span>`;
    this.flippedCards.push({ card, cardEl });

    if (this.flippedCards.length === 2) {
      this.locked = true;
      const [first, second] = this.flippedCards;

      if (first.card.matchId === second.card.matchId) {
        // Match!
        setTimeout(() => {
          first.cardEl.classList.add('is-matched');
          second.cardEl.classList.add('is-matched');
          this.matchedPairs.push({
            card1Id: first.card.id,
            card2Id: second.card.id,
          });
          this.flippedCards = [];
          this.locked = false;

          // Check if all pairs found
          if (this.matchedPairs.length >= this.cards.length / 2) {
            this.onSubmit(this.matchedPairs);
          }
        }, 600);
      } else {
        // No match: flip back
        setTimeout(() => {
          first.cardEl.classList.remove('is-flipped');
          first.cardEl.innerHTML = `<span class="card-back-icon">❓</span>`;
          second.cardEl.classList.remove('is-flipped');
          second.cardEl.innerHTML = `<span class="card-back-icon">❓</span>`;
          this.flippedCards = [];
          this.locked = false;
        }, 1000);
      }
    }
  }

  onWrongAnswer() {
    this.render();
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

GameRegistry.register('memory', MemoryGame);
