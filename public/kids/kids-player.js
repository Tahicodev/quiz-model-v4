/**
 * public/kids/kids-player.js
 *
 * Frontend entry point for Kids Space player.
 * Supports real-time Socket.IO synchronization with automatic REST fallback.
 */

// Register all 9 core games
import './games/MultipleChoiceGame.js';
import './games/WordOrderGame.js';
import './games/DragDropGame.js';
import './games/MatchingGame.js';
import './games/MemoryGame.js';
import './games/SortingGame.js';
import './games/SequenceGame.js';
import './games/FindCorrectGame.js';
import './games/BubblePopGame.js';
import './games/NarrativeGames.js';

import { GameEngine } from './engine/GameEngine.js';

// Setup Socket.IO connection
const socket = typeof io !== 'undefined' ? io() : null;

const viewport = document.getElementById('kids-game-viewport');
let activeSessionId = null;

const engine = new GameEngine({
  viewportElement: viewport,
  onAnswerSubmit: async ({ levelId, answer, timeMs, attempts }) => {
    // Try Socket.IO first if connected
    if (socket && socket.connected && activeSessionId) {
      return new Promise((resolve, reject) => {
        socket.emit(
          'kids:answer',
          { sessionId: activeSessionId, levelId, answer, timeMs, attempts },
          (res) => {
            if (res && res.success) resolve(res.data);
            else reject(new Error(res?.error || 'Erreur lors de la réponse'));
          }
        );
      });
    }

    // Fallback: REST API
    const resp = await fetch(`/api/v1/kids/play/session/${activeSessionId}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ level_id: levelId, answer, time_ms: timeMs, attempts }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || 'Erreur réseau');
    }
    return resp.json();
  },

  onHintRequest: async (levelId) => {
    if (socket && socket.connected && activeSessionId) {
      return new Promise((resolve) => {
        socket.emit('kids:hint_request', { sessionId: activeSessionId, levelId }, (res) => {
          resolve(res?.data || { hint: 'Indice indisponible' });
        });
      });
    }

    const resp = await fetch(`/api/v1/kids/play/session/${activeSessionId}/hint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ level_id: levelId }),
    });
    return resp.json();
  },

  onActivityComplete: (result) => {
    console.log('Activity completed:', result);
  },

  onExit: () => {
    // Leave the classroom room so the teacher monitor drops us, then return the
    // student to the join screen. Progress stays saved on the server.
    if (socket && socket.connected) {
      socket.emit('kids:leave', { activityId: window.__kidsActivityId || undefined });
    }
    activeSessionId = null;
    window.__kidsActivityId = null;
    const welcome = document.createElement('div');
    welcome.className = 'kids-welcome-card';
    welcome.innerHTML = '<h2>À bientôt ! 👋</h2><p>Ta progression est enregistrée. Tu peux rejouer quand tu veux.</p><div class="kids-join-form"><input type="text" id="join-code-input" maxlength="6" placeholder="CODE (ex: ABC123)" class="kids-input-code"><button id="btn-join-code" class="kids-btn-primary">C\'est parti ! 🚀</button></div>';
    viewport.innerHTML = '';
    viewport.appendChild(welcome);
    document.getElementById('btn-join-code')?.addEventListener('click', () => {
      joinActivityByCode(document.getElementById('join-code-input').value);
    });
    document.getElementById('activity-title').textContent = 'Espace Kids';
    document.getElementById('score-count').textContent = '0';
    document.getElementById('stars-count').textContent = '0';
    document.getElementById('progress-bar-fill').style.width = '0%';
  },
});

// Exposed so the static footer controls in kids-player.html can drive the engine.
window.__kidsEngine = engine;

function getAuthToken() {
  return localStorage.getItem('quizAuthToken') || '';
}

async function joinActivityByCode(code) {
  try {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) return alert('Veuillez entrer un code à 6 caractères.');

    // Socket join
    if (socket && socket.connected) {
      socket.emit('kids:join', { joinCode: cleanCode }, (res) => {
        if (res && res.success) {
          activeSessionId = res.data.session.id;
          window.__kidsActivityId = res.data.activity?.id || null;
          engine.loadActivity(res.data.activity, res.data.session, res.data.currentLevel);
        } else {
          fallbackJoinViaRest(cleanCode);
        }
      });
    } else {
      await fallbackJoinViaRest(cleanCode);
    }
  } catch (err) {
    alert(err.message || 'Impossible de rejoindre l’activité');
  }
}

async function fallbackJoinViaRest(code) {
  const token = getAuthToken();
  const joinResp = await fetch(`/api/v1/kids/play/join/${code}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (joinResp.status === 401) {
    throw new Error('Connectez-vous avec votre compte élève avant de rejoindre une activité.');
  }
  if (!joinResp.ok) throw new Error('Code de jeu introuvable ou expiré.');
  const activitySummary = await joinResp.json();

  const startResp = await fetch(`/api/v1/kids/play/${activitySummary.id}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  if (startResp.status === 401) {
    throw new Error('Votre session a expiré. Reconnectez-vous puis rechargez le lien.');
  }
  if (!startResp.ok) throw new Error('Impossible de démarrer la partie.');
  const sessionData = await startResp.json();

  activeSessionId = sessionData.session.id;
  window.__kidsActivityId = sessionData.activity?.id || activitySummary.id;
  engine.loadActivity(sessionData.activity, sessionData.session, sessionData.currentLevel);
}

// Bind join UI
document.getElementById('btn-join-code')?.addEventListener('click', () => {
  const input = document.getElementById('join-code-input');
  if (input) joinActivityByCode(input.value);
});

document.getElementById('join-code-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    joinActivityByCode(e.target.value);
  }
});

// Auto-join from URL params if present
const params = new URLSearchParams(window.location.search);
const urlCode = params.get('code');
const urlActivityId = params.get('activityId');

if (urlCode) {
  joinActivityByCode(urlCode);
} else if (urlActivityId) {
  fetch(`/api/v1/kids/play/${urlActivityId}/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getAuthToken()}`,
    },
  })
    .then((r) => r.json())
    .then((data) => {
      if (data && data.session) {
        activeSessionId = data.session.id;
        window.__kidsActivityId = data.activity?.id || urlActivityId;
        engine.loadActivity(data.activity, data.session, data.currentLevel);
      } else {
        alert(data?.message || data?.error?.message || 'Impossible de démarrer la partie.');
      }
    })
    // A shared /kids?code= link that is opened before signing in used to fail
    // silently in the console; surface it so the student knows what to do.
    .catch((err) => alert(err.message || 'Impossible de démarrer la partie.'));
}
