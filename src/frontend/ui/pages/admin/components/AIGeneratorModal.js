/**
 * src/frontend/ui/pages/admin/components/AIGeneratorModal.js
 *
 * AI Question Generator modal for the admin dashboard.
 * Calls POST /api/v1/ai/generate (and /generate/text) to produce questions
 * via LLM, then allows the user to preview and bulk-import them.
 */

import { Modal } from '../../../components/Modal.js';
import { api } from './api.js';
import { safeSetHTML, escapeHTML } from '../../../../utils/sanitize.js';
import { withError, EventBus } from '../../../../utils/eventBus.js';
import { logger } from '../../../../utils/logger.js';
import { getContainer } from '../../../../container.js';
import { QUESTION_TYPES, DIFFICULTY } from '../../../../../shared/constants.js';

/**
 * Open the AI generator modal.
 * After questions are generated, calls onImport(questions) if the user
 * chooses to import them into the question bank.
 *
 * @param {(questions: Array<object>) => Promise<void>} [onImport]
 */
export function openAIGeneratorModal(onImport) {
  let questions = [];

  const fieldsHTML = `
    <div class="ai-generator">
      <div class="form-field">
        <label for="ai-topic">Topic <span class="req">*</span></label>
        <input id="ai-topic" type="text" placeholder="e.g. World War II, Photosynthesis, Python lists" />
      </div>
      <div class="form-field">
        <label for="ai-count">Number of questions</label>
        <input id="ai-count" type="number" min="1" max="20" value="3" />
      </div>
      <div class="form-field">
        <label for="ai-type">Type</label>
        <select id="ai-type">${Object.entries(QUESTION_TYPES).map(([k,v]) => `<option value="${v}">${k}</option>`).join('')}</select>
      </div>
      <div class="form-field">
        <label for="ai-difficulty">Difficulty</label>
        <select id="ai-difficulty">${Object.entries(DIFFICULTY).map(([k,v]) => `<option value="${v}">${k}</option>`).join('')}</select>
      </div>
      <hr/>
      <div class="form-field">
        <label for="ai-source-text">Or: provide source text to extract questions from</label>
        <textarea id="ai-source-text" rows="4" placeholder="Paste text here to extract questions from content..."></textarea>
      </div>
      <button type="button" class="btn btn-primary" id="ai-generate-btn">Generate</button>
      <div id="ai-results" class="ai-results"></div>
    </div>
  `;

  const modal = new Modal({
    title: 'AI Question Generator',
    contentHTML: fieldsHTML,
    confirmText: 'Import selected',
    cancelText: 'Cancel',
    isDangerous: false,
    onConfirm: () => {},
    onCancel: () => {},
  });

  modal.show();

  // Modal invokes its lifecycle callback after removing the DOM. Read the
  // selected checkboxes before closing so generated questions can actually
  // be imported.
  const confirmBtn = modal.element.querySelector('.confirm-btn');
  confirmBtn.type = 'button';
  confirmBtn.onclick = async () => {
    const selected = [...modal.element.querySelectorAll('.ai-q-checkbox:checked')]
      .map(cb => questions[Number.parseInt(cb.value, 10)])
      .filter(Boolean);
    if (selected.length === 0) {
      EventBus.emit('app:warning', { message: 'Select at least one question to import.' });
      return;
    }
    confirmBtn.disabled = true;
    try {
      await onImport?.(selected);
      modal.close(true);
    } catch (err) {
      confirmBtn.disabled = false;
      throw err;
    }
  };

  // Wire the generate button after the modal renders
  setTimeout(() => {
    const btn = document.getElementById('ai-generate-btn');
    if (!btn) return;
    btn.addEventListener('click', () => handleGenerate(modal, onImport));
  }, 50);
}

async function handleGenerate(modal, onImport) {
  const topic = document.getElementById('ai-topic')?.value.trim();
  const count = parseInt(document.getElementById('ai-count')?.value || '3', 10);
  const type = document.getElementById('ai-type')?.value || 'mcq';
  const difficulty = document.getElementById('ai-difficulty')?.value || 'medium';
  const sourceText = document.getElementById('ai-source-text')?.value.trim();
  const resultsEl = document.getElementById('ai-results');

  if (!resultsEl) return;

  safeSetHTML(resultsEl, '<p class="ai-loading">Generating questions…</p>', true);

  await withError(async () => {
    let data;
    if (sourceText) {
      data = await api('POST', '/api/v1/ai/generate/text', { text: sourceText, count, type });
    } else if (topic) {
      data = await api('POST', '/api/v1/ai/generate', { topic, count, type, difficulty });
    } else {
      EventBus.emit('app:warning', { message: 'Enter a topic or source text.' });
      resultsEl.replaceChildren();
      return;
    }

    questions = data?.data || [];
    renderResults(resultsEl, questions);
  }, `Generated ${questions.length} question(s)`);
}

function renderResults(container, questions) {
  if (!questions || questions.length === 0) {
    safeSetHTML(container, '<p class="ai-empty">No questions generated. Try a different topic.</p>', true);
    return;
  }

  const html = `
    <p class="ai-count">${questions.length} question(s) generated</p>
    <div class="ai-question-list">
      ${questions.map((q, i) => `
        <div class="ai-question-item">
          <label class="ai-q-label">
            <input type="checkbox" class="ai-q-checkbox" value="${i}" checked />
            <strong>Q${i + 1}:</strong> ${escapeHTML(q.text || '')}
            <span class="badge badge--${q.type}">${q.type}</span>
            <span class="badge badge--${q.difficulty || 'medium'}">${q.difficulty || 'medium'}</span>
          </label>
        </div>
      `).join('')}
    </div>
  `;
    safeSetHTML(container, html, true);
}
