/**
 * public/kids/engine/GameState.js
 *
 * State Machine for Kids gameplay lifecycle.
 */

export const GAME_STATES = Object.freeze({
  IDLE:              'idle',
  LOADING:           'loading',
  INTRO:             'intro',
  PLAYING:           'playing',
  EVALUATING:        'evaluating',
  FEEDBACK:          'feedback',
  LEVEL_COMPLETE:    'level_complete',
  ACTIVITY_COMPLETE: 'activity_complete',
  PAUSED:            'paused',
  ERROR:             'error',
});

export class GameStateManager {
  constructor(initialState = GAME_STATES.IDLE, emitter = null) {
    this._state = initialState;
    this._emitter = emitter;
    this._history = [initialState];
  }

  get current() {
    return this._state;
  }

  is(state) {
    return this._state === state;
  }

  transitionTo(newState, payload = {}) {
    const previous = this._state;
    if (previous === newState) return;

    this._state = newState;
    this._history.push(newState);
    if (this._history.length > 50) this._history.shift();

    if (this._emitter) {
      this._emitter.emit('state:change', {
        from: previous,
        to: newState,
        payload,
      });
    }
  }

  reset() {
    this.transitionTo(GAME_STATES.IDLE);
  }
}
