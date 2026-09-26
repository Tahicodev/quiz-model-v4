/**
 * REST-backed exam session page.
 *
 * Exam sessions are authoritative Prisma records. Answers therefore use the
 * dedicated session endpoints and continue to work when Socket.IO is offline.
 */

import { getContainer } from '../../../container.js';
import { logger } from '../../../utils/logger.js';
import { safeSetHTML } from '../../../utils/sanitize.js';

let activeSession = null;
let questions = [];
let currentIndex = 0;
let answers = {};
let heartbeatTimer = null;

export function initSessionPage(sessionId) {
  safeSetHTML(document.getElementById('app'), '<div class="student-runtime-card"><p>Loading your attempt…</p></div>');
  loadSession(sessionId).catch((err) => {
    logger.error('Failed to load exam session', err);
    safeSetHTML(document.getElementById('app'), `<div class="student-runtime-card"><h2>Unable to load this attempt</h2><p>${escapeHtml(err.message || 'Please try again.')}</p></div>`);
  });
}

async function loadSession(sessionId) {
  const c = getContainer();
  activeSession = await c.repo.getById('exam_sessions', sessionId);
  const exam = await c.repo.getExamWithQuestions(activeSession.exam_id);
  activeSession = { ...activeSession, exam };
  questions = Array.isArray(exam?.questions) ? exam.questions : [];
  answers = parseAnswers(activeSession.answers_json);
  currentIndex = Math.min(Number(activeSession.current_question_index) || 0, Math.max(questions.length - 1, 0));
  render();
  heartbeatTimer = window.setInterval(() => c.sessionSvc.heartbeat(activeSession.id).catch(() => {}), 30000);
  window.addEventListener('beforeunload', stopHeartbeat, { once: true });
}

function render() {
  const question = questions[currentIndex];
  if (!question) {
    safeSetHTML(document.getElementById('app'), '<div class="student-runtime-card"><h2>No questions found</h2><p>This exam is not ready yet. Please contact your teacher.</p></div>');
    return;
  }
  const options = parseOptions(question.options_json || question.options);
  const selected = answers[question.id];
  const optionMarkup = options.length
    ? options.map((option, index) => {
        const value = escapeAttribute(option.text || String(index + 1));
        const optionKey = String(selected ?? '') === option.text;
        const inner = option.image
          ? `<div class="student-option-image"><img src="${escapeAttribute(option.image)}" alt="${escapeAttribute(option.text || 'Option image')}"></div>${option.text ? `<div class="student-option-caption">${escapeHtml(option.text)}</div>` : ''}`
          : `<span>${escapeHtml(option.text)}</span>`;
        return `<label class="student-answer-option"><input type="radio" name="answer" value="${value}" ${optionKey ? 'checked' : ''}> ${inner}</label>`;
      }).join('')
    : `<input class="form-control" name="answer" value="${escapeAttribute(selected || '')}" autocomplete="off">`;
  safeSetHTML(document.getElementById('app'), `
    <section class="student-runtime-card">
      <div class="student-runtime-header"><div><span class="eyebrow">Exam in progress</span><h1>${escapeHtml(activeSession.exam?.name || 'Exam')}</h1></div><span class="student-runtime-progress">${currentIndex + 1} / ${questions.length}</span></div>
      <div class="student-runtime-progress-bar"><span style="width:${Math.round(((currentIndex + 1) / questions.length) * 100)}%"></span></div>
      <p class="student-runtime-question">${escapeHtml(question.text || question.question || '')}</p>
      <form id="student-session-answer" class="student-runtime-form">${optionMarkup}<div class="student-runtime-actions"><button type="submit" class="btn btn-primary">${currentIndex === questions.length - 1 ? 'Submit exam' : 'Save & continue'}</button></div></form>
    </section>
  `);
  document.getElementById('student-session-answer')?.addEventListener('submit', handleAnswer);
}

async function handleAnswer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const value = form.elements.answer?.value?.trim() || '';
  if (!value) return;
  const c = getContainer();
  const question = questions[currentIndex];
  await c.sessionSvc.saveAnswer({ sessionId: activeSession.id, questionId: question.id, answer: value });
  answers[question.id] = value;
  if (currentIndex >= questions.length - 1) {
    stopHeartbeat();
    const result = await c.sessionSvc.completeSession(activeSession.id, c.resultSvc);
    window.location.hash = `#/results/${encodeURIComponent(result.id)}`;
    return;
  }
  currentIndex += 1;
  render();
}

function stopHeartbeat() {
  if (heartbeatTimer) window.clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function parseAnswers(value) {
  try { return typeof value === 'string' ? JSON.parse(value || '{}') : (value || {}); } catch (_) { return {}; }
}

function parseOptions(value) {
  if (Array.isArray(value)) return value.map(normalizeOption).filter((o) => o && (o.text || o.image));
  try { return JSON.parse(value || '[]').map(normalizeOption).filter((o) => o && (o.text || o.image)); } catch (_) { return []; }
}

function normalizeOption(option) {
  if (option && typeof option === 'object' && !Array.isArray(option)) {
    const text = String(option.text ?? option.label ?? option.value ?? '').trim();
    const image = String(option.image ?? option.imageUrl ?? option.src ?? '').trim();
    return { text, image };
  }
  return { text: String(option ?? '').trim(), image: '' };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function escapeAttribute(value) { return escapeHtml(value); }
