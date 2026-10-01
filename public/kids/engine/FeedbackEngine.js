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
    // At most one card on screen. Two stacked overlays used to happen when a
    // child answered again quickly, and the top one covered the other.
    this.current = null;
    this.currentBanner = null;
  }

  /**
   * Where a non-blocking banner goes.
   *
   * The game board rather than the document: the board is rebuilt for every
   * level, so a banner left in it disappears with the level it belonged to
   * instead of hanging over the next question. Falls back to the container when
   * the board is not there yet.
   */
  #bannerHost() {
    return document.querySelector('.kids-game-board') || this.container;
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

  /**
   * Show a card over the game, and take it away again.
   *
   * A child must be able to dismiss it, not just wait for it: the old card had
   * no button and only closed on a timer, so a child who wanted to read the
   * praise or the explanation had no way to move on, and one who wanted to move
   * on had to wait. The button is also what makes this a dialog rather than a
   * decoration — it is focusable, labelled, and closes on Escape.
   *
   * `onDismiss` is what makes the button worth having: it runs once, when the
   * card goes away by any route — the button, Escape, or the timer — so the
   * caller can let the child decide when the next level appears instead of
   * racing the card with a timer of its own.
   */
  #present({ tone, emoji, message, extra = '', actionLabel, autoHideMs, onDismiss }) {
    // A new card replaces the old one outright. Fading the old card out left it
    // in the document for 400ms, so two overlays were on screen at once and the
    // one still fading sat on top of the new one, hiding the answer to the
    // question the child had just been asked.
    this.#dismiss(true);

    const overlay = document.createElement('div');
    overlay.className = `kids-feedback-overlay kids-feedback-${tone}`;
    // A dialog that a child can dismiss: Escape closes it, and the button
    // inside it is where the keyboard goes.
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', message);

    const card = document.createElement('div');
    card.className = 'kids-feedback-card';

    const bubble = document.createElement('div');
    bubble.className = 'kids-feedback-emoji';
    bubble.setAttribute('aria-hidden', 'true');
    bubble.textContent = emoji;
    card.appendChild(bubble);

    const text = document.createElement('p');
    text.className = 'kids-feedback-text';
    text.textContent = message;
    card.appendChild(text);

    if (extra) {
      const extraEl = document.createElement('div');
      extraEl.className = 'kids-feedback-extra';
      extraEl.innerHTML = extra;
      card.appendChild(extraEl);
    }

    const action = document.createElement('button');
    action.type = 'button';
    action.className = `kids-btn kids-btn-lg kids-feedback-action kids-feedback-action-${tone}`;
    action.textContent = actionLabel;
    action.addEventListener('click', () => this.#dismiss());
    card.appendChild(action);

    overlay.appendChild(card);
    this.container.appendChild(overlay);
    this.current = overlay;

    // Focus the action so the keyboard and a screen reader start inside the
    // dialog rather than behind it, where the game buttons still are.
    action.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === 'Escape') this.#dismiss();
    };
    this.currentKeyHandler = onKey;
    document.addEventListener('keydown', onKey);

    this.currentTimer = setTimeout(() => this.#dismiss(), autoHideMs);
    // One card, one callback, one chance to advance.
    this.currentOnDismiss = typeof onDismiss === 'function' ? onDismiss : null;
    return overlay;
  }

  #dismiss(immediate = false, runCallback = true) {
    if (this.currentKeyHandler) {
      document.removeEventListener('keydown', this.currentKeyHandler);
      this.currentKeyHandler = null;
    }
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    const overlay = this.current;
    this.current = null;
    const onDismiss = this.currentOnDismiss;
    this.currentOnDismiss = null;
    if (overlay) {
      if (immediate) {
        overlay.remove();
      } else {
        overlay.classList.add('fade-out');
        // Removed after the fade, so the child sees it leave rather than blink.
        setTimeout(() => overlay.remove(), 400);
      }
    }
    // Runs whether or not there was a card, and after it has been cleared, so a
    // callback that itself shows a card cannot be undone by a second dismiss.
    if (runCallback && onDismiss) onDismiss();
  }

  /**
   * @param {number} points  Points just earned, shown on the card.
   * @param {number} streak  Consecutive correct answers; shown once it is a
   *                         streak worth naming.
   * @param {object} [options]
   * @param {Function} [options.onDismiss]  Runs when the card goes away, so the
   *   caller can advance when the child is ready rather than on a timer that
   *   can either cut the praise short or outlast it.
   */
  showSuccess(points = 10, streak = 0, { onDismiss } = {}) {
    this.playSuccessSound();

    const message = PRAISE_MESSAGES[Math.floor(Math.random() * PRAISE_MESSAGES.length)];

    let extra = '';
    if (streak >= 3) {
      extra += `<div class="kids-streak-badge">🔥 Série de ${streak} !</div>`;
    }
    extra += `<div class="kids-feedback-points"><span aria-hidden="true">⭐</span> +${points} points</div>`;

    return this.#present({
      tone: 'success',
      emoji: '⭐',
      message,
      extra,
      actionLabel: 'Continuer ▶',
      // Long enough to read a long message, and the child can end it sooner.
      autoHideMs: 2600,
      onDismiss,
    });
  }

  /**
   * A retry, as a banner rather than a dialog.
   *
   * This used to be the same blocking overlay as the praise, and that made the
   * Vérifier button feel stuck: a wrong answer covered the whole screen for the
   * length of the timer, so every tap was swallowed, and pressing Vérifier again
   * with the same answer started the whole wait over. A child who has been told
   * to try again needs to be able to try again *now*, so nothing is modal here:
   * no backdrop, no focus taken away mid-drag, and the game stays live.
   *
   * It is announced politely rather than focused, so a screen reader says it
   * without the child's place in the question being lost.
   */
  #presentBanner({ emoji, message, explanation }) {
    this.#clearBanner();

    const banner = document.createElement('div');
    banner.className = 'kids-feedback-banner';
    // A live region, not a dialog: said when it appears, but the focus stays on
    // the game where the child is working.
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');

    const bubble = document.createElement('span');
    bubble.className = 'kids-feedback-banner-emoji';
    bubble.setAttribute('aria-hidden', 'true');
    bubble.textContent = emoji;
    banner.appendChild(bubble);

    const words = document.createElement('span');
    words.className = 'kids-feedback-banner-text';
    words.textContent = message;
    banner.appendChild(words);

    if (explanation) {
      const why = document.createElement('span');
      why.className = 'kids-feedback-banner-why';
      // textContent: the explanation came from a teacher or a model, and it is
      // shown inside a page rather than as a page, so it is not markup.
      why.textContent = explanation;
      banner.appendChild(why);
    }

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'kids-feedback-banner-close';
    dismiss.setAttribute('aria-label', 'Hide this message');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => this.#clearBanner());
    banner.appendChild(dismiss);

    this.#bannerHost().prepend(banner);
    this.currentBanner = banner;
    return banner;
  }

  #clearBanner() {
    const banner = this.currentBanner;
    this.currentBanner = null;
    if (banner) banner.remove();
  }

  showEncouragement(explanation = null, { onDismiss } = {}) {
    this.playErrorSound();

    // A praise card still on screen is cleared without running its advance.
    // Reaching here means the child answered again, which is proof the level did
    // not move on, so honouring that advance would jump them past the question
    // they have just tried to answer.
    this.#dismiss(true, false);

    const message = ENCOURAGE_MESSAGES[Math.floor(Math.random() * ENCOURAGE_MESSAGES.length)];
    this.#presentBanner({ emoji: '💡', message, explanation });

    // The banner is not waited for, so onDismiss is immediate: a caller that
    // asked to be told when the child had read it is told at once, and one that
    // did not ask is unaffected.
    if (typeof onDismiss === 'function') onDismiss();
    return null;
  }

  destroy() {
    // Nothing to fade once the engine is gone: a card left drifting over a
    // screen that is being torn down is just a leftover. Nor does tearing down
    // count as the child dismissing it, so no advance is triggered.
    this.#clearBanner();
    this.#dismiss(true, false);
  }
}
