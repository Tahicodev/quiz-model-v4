/**
 * public/kids/engine/GameRegistry.js
 *
 * Client-side registry mapping game mechanic and template keys
 * to their renderer implementations.
 */

export class GameRegistry {
  static #renderers = new Map();

  static register(type, rendererClass) {
    this.#renderers.set(type, rendererClass);
  }

  static get(type) {
    return this.#renderers.get(type) || null;
  }

  static has(type) {
    return this.#renderers.has(type);
  }

  static getAllTypes() {
    return Array.from(this.#renderers.keys());
  }
}
