/**
 * public/kids/games/DragDropGame.js
 *
 * Core Renderer: Fill-in-the-blanks drag and drop.
 */

import { GameRegistry } from '../engine/GameRegistry.js';
import { DraggableItem } from '../components/DraggableItem.js';

export class DragDropGame {
  constructor({ container, levelData, onSubmit, onHint }) {
    this.container = container;
    this.levelData = levelData;
    this.content = levelData.content;
    this.onSubmit = onSubmit;
    this.onHint = onHint;

    this.choices = [...(this.content.choices || [])];
    this.filledBlanks = new Map(); // position -> choice
  }

  render() {
    this.container.innerHTML = `
      <div class="game-instruction">${this.content.instruction}</div>
      <div class="dragdrop-template-area" id="template-area"></div>
      <div class="word-order-source-pool" id="choices-pool"></div>
      <div class="dragdrop-actions">
        <button id="btn-validate-dragdrop" class="kids-btn kids-btn-primary" style="display: none;">Vérifier ✨</button>
      </div>
    `;

    this.renderTemplate();
    this.renderChoices();

    const validateBtn = this.container.querySelector('#btn-validate-dragdrop');
    validateBtn.addEventListener('click', () => {
      const submission = [];
      this.filledBlanks.forEach((choice, position) => {
        submission.push({ position, answer: choice.value });
      });
      this.onSubmit(submission);
    });
  }

  renderTemplate() {
    const area = this.container.querySelector('#template-area');
    const templateText = this.content.template;
    // Replace {blank} or _ with dropzones
    const parts = templateText.split(/(\{blank\}|_)/);
    area.innerHTML = '';

    let blankIdx = 0;
    parts.forEach(part => {
      if (part === '{blank}' || part === '_') {
        const position = blankIdx++;
        const blank = document.createElement('span');
        blank.className = 'kids-blank-zone';
        blank.dataset.position = position;

        const currentChoice = this.filledBlanks.get(position);
        if (currentChoice) {
          blank.textContent = currentChoice.value;
          blank.classList.add('is-filled');
          blank.addEventListener('click', () => {
            this.filledBlanks.delete(position);
            this.choices.push(currentChoice);
            this.renderTemplate();
            this.renderChoices();
          });
        } else {
          blank.textContent = '___';
          DraggableItem.setupDropZone(blank, (zone, data) => {
            this.fillBlank(position, data);
          });
        }

        area.appendChild(blank);
      } else if (part) {
        const textSpan = document.createElement('span');
        textSpan.textContent = part;
        area.appendChild(textSpan);
      }
    });
  }

  renderChoices() {
    const pool = this.container.querySelector('#choices-pool');
    const validateBtn = this.container.querySelector('#btn-validate-dragdrop');
    pool.innerHTML = '';

    this.choices.forEach(choice => {
      const tile = document.createElement('div');
      tile.className = 'kids-tile';
      tile.textContent = choice.value;

      // Tap-to-fill first empty blank
      tile.addEventListener('click', () => {
        const emptyBlank = this.container.querySelector('.kids-blank-zone:not(.is-filled)');
        if (emptyBlank) {
          const pos = parseInt(emptyBlank.dataset.position, 10);
          this.fillBlank(pos, choice);
        }
      });

      DraggableItem.attach(tile, { data: choice, dropZonesSelector: '.kids-blank-zone' });
      pool.appendChild(tile);
    });

    const totalBlanks = (this.content.blanks || []).length;
    if (this.filledBlanks.size === totalBlanks && totalBlanks > 0) {
      validateBtn.style.display = 'inline-flex';
    } else {
      validateBtn.style.display = 'none';
    }
  }

  fillBlank(position, choice) {
    const choiceIdx = this.choices.findIndex(c => c.id === choice.id);
    if (choiceIdx !== -1) {
      this.choices.splice(choiceIdx, 1);
      this.filledBlanks.set(position, choice);
      this.renderTemplate();
      this.renderChoices();
    }
  }

  onWrongAnswer() {
    const area = this.container.querySelector('#template-area');
    if (area) {
      area.classList.add('retry-shake');
      setTimeout(() => area.classList.remove('retry-shake'), 500);
    }
  }

  destroy() {
    this.container.innerHTML = '';
  }
}

GameRegistry.register('drag_drop', DragDropGame);
