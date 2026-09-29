/**
 * public/kids/engine/GameEvents.js
 *
 * Lightweight typed event emitter for the Kids Game Engine.
 */

export class GameEventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  once(event, callback) {
    const unbind = this.on(event, (...args) => {
      unbind();
      callback(...args);
    });
    return unbind;
  }

  off(event, callback) {
    const list = this._listeners.get(event);
    if (list) {
      list.delete(callback);
      if (list.size === 0) this._listeners.delete(event);
    }
  }

  emit(event, ...args) {
    const list = this._listeners.get(event);
    if (list) {
      for (const cb of Array.from(list)) {
        try {
          cb(...args);
        } catch (err) {
          console.error(`[GameEvents] Error in listener for "${event}":`, err);
        }
      }
    }
  }

  clear() {
    this._listeners.clear();
  }
}
