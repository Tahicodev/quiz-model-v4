/**
 * public/kids/engine/FeedbackEngine.js
 *
 * Child-friendly audiovisual feedback: celebratory animations,
 * positive reinforcement messages, and gentle encouragement.
 */

const PRAISE_MESSAGES = [
  'Bravo ! 🌟',
  'Super travail ! 🎉',
  'Génial ! 🚀',
  'Tu es un champion ! 🏆',
  'Incroyable ! ⭐',
  'Magnifique ! 🎈',
  'C’est exactement ça ! 👏',
];

const ENCOURAGE_MESSAGES = [
  'Presque ! Regarde bien et réessaie ! 💪',
  'Ce n’est pas grave, tu vas y arriver ! ✨',
  'Courage ! Essaie encore ! 🎯',
  'Prends ton temps, tu peux le faire ! 💡',
];

export class FeedbackEngine {
  constructor(container = document.body) {
    this.container = container;
    this.audioCtx = null;
  }

  #getAudioContext() {
    if (!this.audioCtx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  playSuccessSound() {
    try {
      const ctx = this.#getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc1.frequency.setValueAtTime(783.99, now + 0.2); // G5
      osc1.frequency.setValueAtTime(1046.50, now + 0.3); // C6

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(261.63, now); // C4

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);
    } catch (_) {}
  }

  playErrorSound() {
    try {
      const ctx = this.#getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.setValueAtTime(220, now + 0.15);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (_) {}
  }

  showSuccess(points = 10, streak = 0) {
    this.playSuccessSound();

    const overlay = document.createElement('div');
    overlay.className = 'kids-feedback-overlay success-pop';
    const message = PRAISE_MESSAGES[Math.floor(Math.random() * PRAISE_MESSAGES.length)];

    let streakBadge = '';
    if (streak >= 3) {
      streakBadge = `<div class="kids-streak-badge">🔥 Série de ${streak} !</div>`;
    }

    overlay.innerHTML = `
      <div class="kids-feedback-card">
        <div class="kids-feedback-emoji">⭐</div>
        <div class="kids-feedback-text">${message}</div>
        <div class="kids-feedback-points">+${points} points</div>
        ${streakBadge}
      </div>
    `;

    this.container.appendChild(overlay);

    setTimeout(() => {
      overlay.classList.add('fade-out');
      setTimeout(() => overlay.remove(), 400);
    }, 1400);
  }

  showEncouragement(explanation = null) {
    this.playErrorSound();

    const overlay = document.createElement('div');
    overlay.className = 'kids-feedback-overlay retry-shake';
    const message = ENCOURAGE_MESSAGES[Math.floor(Math.random() * ENCOURAGE_MESSAGES.length)];

    overlay.innerHTML = `
      <div class="kids-feedback-card retry-card">
        <div class="kids-feedback-emoji">💡</div>
        <div class="kids-feedback-text">${message}</div>
        ${explanation ? `<div class="kids-feedback-explanation">${explanation}</div>` : ''}
      </div>
    `;

    this.container.appendChild(overlay);

    setTimeout(() => {
      overlay.classList.add('fade-out');
      setTimeout(() => overlay.remove(), 400);
    }, 1800);
  }
}
