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

/**
 * A Socket.IO emit that is answered by a callback, with a deadline.
 *
 * Socket.IO has no acknowledgement timeout of its own: if the reply never comes
 * — the server restarted, the connection dropped mid-flight, the handler died
 * before it could answer — the promise simply never settles. The game then sits
 * in its "evaluating" state for good, and because the engine ignores any answer
 * that is not asked for while playing, every later attempt is dropped without a
 * word. That is one of the ways the Vérifier button came to look stuck, and it
 * has no error message to show because nothing ever failed.
 */
const ACK_TIMEOUT_MS = 8000;

function emitWithAck(event, payload, { timeoutMs = ACK_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new Error('Le jeu n\'a pas répondu à temps.'));
    }, timeoutMs);
    socket.emit(event, payload, (res) => finish(resolve, res));
  });
}

/** Why a submit failed, so the child is told something true. */
function submitFailure(message, { status } = {}) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function showKidsToast(message, type = 'error') {
  let region = document.getElementById('kids-toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'kids-toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const toast = document.createElement('div');
  toast.className = `kids-toast kids-toast-${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  region.appendChild(toast);
  setTimeout(() => toast.classList.add('is-leaving'), 3600);
  setTimeout(() => toast.remove(), 3900);
}

/** Records an answer over HTTP, used whenever the socket is not available. */
async function submitOverRest({ levelId, answer, timeMs, attempts }) {
  const token = getAuthToken();
  let resp;
  try {
    resp = await fetch(`/api/v1/kids/play/session/${activeSessionId}/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ level_id: levelId, answer, time_ms: timeMs, attempts }),
    });
  } catch (err) {
    // fetch only rejects when the request never reached the server.
    throw submitFailure('Pas de connexion. Vérifie internet puis réessaie.', { status: 0 });
  }

  if (resp.status === 401) {
    throw submitFailure('Ta session a expiré. Reconnecte-toi pour continuer.', { status: 401 });
  }
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    // Keep the status: "check your internet" was shown for a 404, a 401 and a
    // server fault alike, so nothing the child was told could be trusted.
    throw submitFailure(body.message || 'Le jeu n\'a pas pu enregistrer ta réponse.', { status: resp.status });
  }
  return resp.json();
}

const engine = new GameEngine({
  viewportElement: viewport,
  onAnswerSubmit: async ({ levelId, answer, timeMs, attempts }) => {
    // No session means the game was never really joined, and answering anyway
    // posted to /session/null/answer. That came back 404 and the child was told
    // to check their internet, which was never the problem.
    if (!activeSessionId) {
      throw submitFailure('La partie n\'a pas démarré. Recharge la page.');
    }

    // Try Socket.IO first if connected
    if (socket && socket.connected) {
      let res;
      try {
        res = await emitWithAck('kids:answer', { sessionId: activeSessionId, levelId, answer, timeMs, attempts });
      } catch (err) {
        // A dropped or unanswered socket is a transport problem, not a wrong
        // answer, and the answer has not been recorded yet. Try it over REST
        // once rather than making the child press the button again.
        return submitOverRest({ levelId, answer, timeMs, attempts });
      }
      if (res && res.success) return res.data;
      throw submitFailure(res?.error || 'Erreur lors de la réponse', { status: 502 });
    }

    return submitOverRest({ levelId, answer, timeMs, attempts });
  },

  onHintRequest: async (levelId) => {
    if (socket && socket.connected && activeSessionId) {
      try {
        const res = await emitWithAck('kids:hint_request', { sessionId: activeSessionId, levelId });
        return res?.data || { hint: 'Indice indisponible' };
      } catch (err) {
        // A hint is not worth failing over: fall through to HTTP.
      }
    }

    const resp = await fetch(`/api/v1/kids/play/session/${activeSessionId}/hint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
      },
      body: JSON.stringify({ level_id: levelId }),
    });
    if (!resp.ok) return { hint: 'Indice indisponible' };
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
    showWelcome();
    document.getElementById('activity-title').textContent = 'Espace Kids';
    document.getElementById('score-count').textContent = '0';
    document.getElementById('stars-count').textContent = '0';
    document.getElementById('progress-bar-fill').style.width = '0%';
  },
});

// Exposed so the static footer controls in kids-player.html can drive the engine.
window.__kidsEngine = engine;

// ── Games the teacher gave to this student's class ─────────────────────────
// The join code is still the fallback, but a student should not have to be given
// a six-character code for a game their teacher already handed to their class.
async function renderMyGames(container) {
  const token = getAuthToken();
  if (!token) return;
  let items = [];
  try {
    const res = await fetch('/api/v1/kids/activities/for-me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    items = data.items || [];
  } catch (_) {
    return; // offline or signed out: the join code still works
  }
  if (!items.length) return;

  const list = document.createElement('div');
  list.className = 'kids-my-games';
  list.innerHTML =
    '<h3>Mes jeux</h3>' +
    items
      .map((a) => {
        // The endpoint returns Prisma's `_count.levels`, not a `level_count`.
        const levels = a._count?.levels;
        return `<button type="button" class="kids-my-game" data-code="${escapeHtml(a.join_code || '')}"${a.join_code ? '' : ' disabled'}>
          <b>${escapeHtml(a.title || 'Jeu')}</b>
          <small>${escapeHtml(a.subject || '')}${a.grade ? ' · ' + escapeHtml(a.grade) : ''}${levels ? ' · ' + levels + ' niveaux' : ''}</small>
          ${a.join_code ? '<em>Jouer</em>' : '<em class="kids-my-game-locked">Pas encore de code</em>'}
        </button>`;
      })
      .join('');
  list.querySelectorAll('.kids-my-game[data-code]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.getAttribute('data-code');
      if (code) joinActivityByCode(code);
    });
  });
  container.appendChild(list);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Reuse the same welcome card in both places that need it: the first page load
// and the "onExit" return from a finished game.
function showWelcome() {
  const welcome = document.createElement('div');
  welcome.className = 'kids-welcome-card';
  welcome.innerHTML = '<h2>À bientôt ! 👋</h2><p>Ta progression est enregistrée. Tu peux rejouer quand tu veux.</p><div class="kids-join-form"><input type="text" id="join-code-input" maxlength="6" placeholder="CODE (ex: ABC123)" class="kids-input-code"><button id="btn-join-code" class="kids-btn-primary">C\'est parti ! 🚀</button></div>';
  const gamesSlot = document.createElement('div');
  gamesSlot.id = 'kids-my-games-slot';
  welcome.appendChild(gamesSlot);
  viewport.innerHTML = '';
  viewport.appendChild(welcome);
  document.getElementById('btn-join-code')?.addEventListener('click', () => {
    joinActivityByCode(document.getElementById('join-code-input').value);
  });
  document.getElementById('join-code-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinActivityByCode(e.target.value);
  });
  renderMyGames(gamesSlot);
}

function getAuthToken() {
  return localStorage.getItem('quizAuthToken') || '';
}

async function joinActivityByCode(code) {
  try {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) return showKidsToast('Entre le code de jeu donné par ton professeur.', 'info');

    // Socket join
    if (socket && socket.connected) {
      let res;
      try {
        res = await emitWithAck('kids:join', { joinCode: cleanCode });
      } catch (err) {
        // Unanswered, not refused: go over HTTP rather than leave the child on
        // a blank screen with no session and no explanation.
        return fallbackJoinViaRest(cleanCode);
      }
      if (res && res.success) {
        activeSessionId = res.data.session.id;
        window.__kidsActivityId = res.data.activity?.id || null;
        engine.loadActivity(res.data.activity, res.data.session, res.data.currentLevel);
      } else {
        fallbackJoinViaRest(cleanCode);
      }
    } else {
      await fallbackJoinViaRest(cleanCode);
    }
  } catch (err) {
    showKidsToast(err.message || 'Impossible de rejoindre l’activité');
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
        showKidsToast(data?.message || data?.error?.message || 'Impossible de démarrer la partie.');
      }
    })
    // A shared /kids?code= link that is opened before signing in used to fail
    // silently in the console; surface it so the student knows what to do.
    .catch((err) => showKidsToast(err.message || 'Impossible de démarrer la partie.'));
} else {
  // No code and no link: show the games this student's class was given so the
  // join screen is not an empty box for anyone who is actually assigned a game.
  const slot = document.getElementById('kids-my-games-slot') || viewport;
  renderMyGames(slot);
}
