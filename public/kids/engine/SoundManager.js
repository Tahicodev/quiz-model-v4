/** Lightweight, opt-in Web Audio feedback. No media asset or network request needed. */
export class SoundManager {
  static enabled = true;
  static play(kind) {
    if (!this.enabled) return;
    try {
      const files = { success: 'sfx-correct.mp3', retry: 'sfx-retry.mp3', celebrate: 'sfx-celebration.mp3', hint: 'sfx-hint.mp3' };
      if (files[kind]) {
        const sound = new Audio(`/kids/assets/sounds/${files[kind]}`);
        sound.volume = .38;
        sound.play().catch(() => this.#synth(kind));
        return;
      }
      this.#synth(kind);
    } catch (_) {}
  }
  static #synth(kind) {
    try {
      const ctx = this.ctx || (this.ctx = new AudioContext()); const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = kind === 'success' ? 660 : kind === 'celebrate' ? 880 : 220;
      gain.gain.setValueAtTime(.07, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .16);
      osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .16);
    } catch (_) {}
  }
}
