/**
 * public/kids/engine/GameEngine.js
 *
 * Core coordinator for the Kids Space frontend:
 * - Lifecycle state machine
 * - Renderer mounting and unmounting
 * - Audio & visual feedback integration
 * - Answer submission and level transitions
 */

import { GameEventEmitter } from './GameEvents.js';
import { GameStateManager, GAME_STATES } from './GameState.js';
import { GameRegistry } from './GameRegistry.js';
import { ThemeEngine } from './ThemeEngine.js';
import { FeedbackEngine } from './FeedbackEngine.js';
import { RewardEngine } from './RewardEngine.js';
import { ProgressionEngine } from './ProgressionEngine.js';
import { SoundManager } from './SoundManager.js';
import { HintBubble } from '../components/HintBubble.js';

export class GameEngine {
  constructor({ viewportElement, onAnswerSubmit, onHintRequest, onActivityComplete, onExit }) {
    this.viewport = viewportElement;
    this.onAnswerSubmit = onAnswerSubmit;
    this.onHintRequest = onHintRequest;
    this.onActivityComplete = onActivityComplete;
    this.onExit = onExit;

    this.events = new GameEventEmitter();
    this.state = new GameStateManager(GAME_STATES.IDLE, this.events);
    this.feedback = new FeedbackEngine(document.body);

    this.activity = null;
    this.session = null;
    this.currentLevel = null;
    this.currentRenderer = null;
    this.currentHint = null;
    this.levelStartTime = 0;
  }

  /** Public entry point for the footer hint button. */
  requestHint() {
    return this.handleHint();
  }

  /** Public entry point for the footer sound toggle. */
  toggleSound() {
    SoundManager.enabled = !SoundManager.enabled;
    const button = document.getElementById('kids-sound-button');
    if (button) {
      button.textContent = SoundManager.enabled ? '🔊' : '🔇';
      button.setAttribute('aria-pressed', String(SoundManager.enabled));
    }
    return SoundManager.enabled;
  }

  /** Leave the activity without wiping the student's saved progress. */
  exit() {
    this.currentHint?.remove();
    this.currentHint = null;
    if (this.currentRenderer && typeof this.currentRenderer.destroy === 'function') {
      this.currentRenderer.destroy();
    }
    this.currentRenderer = null;
    this.currentLevel = null;
    this.state.reset();
    if (typeof this.onExit === 'function') this.onExit();
  }

  /**
   * Load activity and session data into the engine.
   */
  loadActivity(activityData, sessionData, initialLevel) {
    this.activity = activityData;
    this.session = sessionData;
    this.currentLevel = initialLevel;

    // Apply theme and age styling
    ThemeEngine.applyTheme(activityData.theme || 'jungle');
    ThemeEngine.applyAgeProfile(activityData.age_min, activityData.age_max);

    // Update global UI headers if present
    const titleEl = document.getElementById('activity-title');
    if (titleEl) titleEl.textContent = activityData.title;

    this.updateStatsDisplay();

    if (this.currentLevel) {
      this.mountLevel(this.currentLevel);
    } else if (sessionData && sessionData.completed) {
      this.showCelebration(sessionData.score, sessionData.stars, sessionData.best_streak || sessionData.streak || 0);
    }
  }

  updateStatsDisplay() {
    const starsEl = document.getElementById('stars-count');
    if (starsEl) starsEl.textContent = this.session?.stars ?? 0;

    const scoreEl = document.getElementById('score-count');
    if (scoreEl) scoreEl.textContent = this.session?.score ?? 0;

    const totalLevels = this.activity?.totalLevels || 1;
    const currentIdx = (this.session?.current_level ?? 0) + 1;
    const fillPercent = Math.min(100, Math.round(((currentIdx - 1) / totalLevels) * 100));

    const progressFill = document.getElementById('progress-bar-fill');
    if (progressFill) progressFill.style.width = `${fillPercent}%`;

    const levelIndicator = document.getElementById('level-indicator');
    if (levelIndicator) {
      levelIndicator.textContent = `Étape ${Math.min(currentIdx, totalLevels)} / ${totalLevels}`;
    }
  }

  /**
   * Mount a level renderer into the viewport.
   */
  mountLevel(level) {
    this.currentLevel = level;
    this.state.transitionTo(GAME_STATES.LOADING);

    // Clear previous renderer
    this.currentHint?.remove();
    this.currentHint = null;
    if (this.currentRenderer && typeof this.currentRenderer.destroy === 'function') {
      this.currentRenderer.destroy();
    }
    this.viewport.innerHTML = '';

    const RendererClass = GameRegistry.get(level.level_type);
    if (!RendererClass) {
      this.viewport.innerHTML = `
        <div class="kids-error-card">
          <h3>Oups ! 🎨</h3>
          <p>Le jeu pour cette étape (${level.level_type}) est en cours de préparation.</p>
        </div>
      `;
      this.state.transitionTo(GAME_STATES.ERROR);
      return;
    }

    // Story narration if present
    if (level.narrative?.storyText) {
      const storyBanner = document.createElement('div');
      storyBanner.className = 'kids-story-banner';
      storyBanner.innerHTML = `
        <span class="story-emoji">${level.narrative.sceneEmoji || '📖'}</span>
        <span class="story-text">${level.narrative.storyText}</span>
      `;
      this.viewport.appendChild(storyBanner);
    }

    const gameContainer = document.createElement('div');
    gameContainer.className = `kids-game-board game-${level.level_type}`;
    this.viewport.appendChild(gameContainer);

    this.currentRenderer = new RendererClass({
      container: gameContainer,
      levelData: level,
      onSubmit: (answer) => this.handleAnswer(answer),
      onHint: () => this.handleHint(),
    });

    this.currentRenderer.render();
    this.levelStartTime = Date.now();
    this.state.transitionTo(GAME_STATES.PLAYING);
  }

  /**
   * Handles student answer submission and server response.
   */
  async handleAnswer(answer) {
    if (!this.state.is(GAME_STATES.PLAYING)) return;

    this.state.transitionTo(GAME_STATES.EVALUATING);
    const timeMs = Date.now() - this.levelStartTime;

    try {
      const result = await this.onAnswerSubmit({
        levelId: this.currentLevel.id,
        answer,
        timeMs,
        attempts: 1,
      });

      if (result.correct) {
        SoundManager.play(result.completed ? 'celebrate' : 'success');
        this.session.badges = RewardEngine.badges({ streak: result.streak, stars: result.stars, completed: result.completed });
        const mascot = document.querySelector('.kids-mascot');
        if (mascot) { const reaction = RewardEngine.reaction({ streak: result.streak, correct: true }); ThemeEngine.setMascotReaction(reaction); mascot.dataset.reaction = reaction; mascot.classList.add('mascot-react'); setTimeout(() => { mascot.classList.remove('mascot-react'); ThemeEngine.setMascotReaction('idle'); }, 900); }
        this.session.suggestedDifficulty = ProgressionEngine.suggest({ streak: result.streak, attempts: 1, difficulty: this.activity.difficulty });
        this.feedback.showSuccess(result.earnedPoints, result.streak);
        this.session.score = result.newScore;
        this.session.stars = result.stars;
        this.updateStatsDisplay();

        if (result.completed) {
          setTimeout(() => {
            this.showCelebration(result.newScore, result.stars, result.streak);
            if (this.onActivityComplete) this.onActivityComplete(result);
          }, 1500);
        } else if (result.nextLevel) {
          setTimeout(() => {
            this.session.current_level = (this.session.current_level || 0) + 1;
            this.updateStatsDisplay();
            this.mountLevel(result.nextLevel);
          }, 1500);
        }
      } else {
        SoundManager.play('retry');
        const mascot = document.querySelector('.kids-mascot');
        if (mascot) { ThemeEngine.setMascotReaction('encourage'); mascot.dataset.reaction = 'encourage'; mascot.classList.add('mascot-react'); setTimeout(() => { mascot.classList.remove('mascot-react'); ThemeEngine.setMascotReaction('idle'); }, 900); }
        this.feedback.showEncouragement(result.explanation);
        this.state.transitionTo(GAME_STATES.PLAYING);
        if (this.currentRenderer && typeof this.currentRenderer.onWrongAnswer === 'function') {
          this.currentRenderer.onWrongAnswer();
        }
      }
    } catch (err) {
      console.error('Answer submission failed:', err);
      this.state.transitionTo(GAME_STATES.PLAYING);
    }
  }

  async handleHint() {
    if (!this.currentLevel) return;
    const button = document.getElementById('kids-hint-button');
    if (button) button.disabled = true;
    try {
      const hintData = await this.onHintRequest(this.currentLevel.id);
      SoundManager.play('hint');
      this.showHint(hintData?.hint || 'Regarde bien les images et les indices !');
    } catch (err) {
      console.error('Hint request failed:', err);
      this.showHint('Pas d’indice disponible pour cette étape.');
    } finally {
      if (button) button.disabled = false;
    }
  }

  /**
   * Render a hint bubble. None of the core mechanics implement showHint(), so
   * the engine owns the bubble itself and only delegates when a renderer opts in.
   */
  showHint(hint) {
    this.currentHint?.remove();
    const bubble = HintBubble.create({ text: hint });
    this.currentHint = bubble;
    this.viewport.appendChild(bubble);
    if (this.currentRenderer && typeof this.currentRenderer.showHint === 'function') {
      this.currentRenderer.showHint(hint);
    }
  }

  /**
   * Final celebration view when activity is completed.
   */
  showCelebration(score, stars = 3, streak = 0) {
    this.state.transitionTo(GAME_STATES.ACTIVITY_COMPLETE);
    ThemeEngine.setMascotReaction('celebrate');
    this.viewport.innerHTML = `
      <div class="kids-celebration-card">
        <div class="kids-trophy-burst">🏆</div>
        <h2>Mission Accomplie ! 🎉</h2>
        <p>Tu as terminé toute l'activité avec succès !</p>
        <div class="kids-stars-reward">
          ${'⭐'.repeat(Math.max(1, stars))}
        </div>
        <div class="kids-award-badges">
          <img class="kids-award-badge" src="/kids/assets/badge-finish.png" alt="Badge de fin" />
          ${stars === 3 ? '<img class="kids-award-badge" src="/kids/assets/badge-star-master.png" alt="Badge maître des étoiles" />' : ''}
          ${streak >= 5 ? '<img class="kids-award-badge" src="/kids/assets/badge-streak-hero.png" alt="Badge héros de série" />' : ''}
        </div>
        <div class="kids-final-score">Score Total : <strong>${score} points</strong></div>
        <button id="btn-replay" class="kids-btn-primary">Rejouer 🔄</button>
      </div>
    `;

    document.getElementById('btn-replay')?.addEventListener('click', () => {
      window.location.reload();
    });
  }
}
