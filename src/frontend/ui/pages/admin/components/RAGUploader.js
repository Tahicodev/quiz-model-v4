/**
 * src/frontend/ui/pages/admin/components/RAGUploader.js
 *
 * RAG document uploader UI for the admin dashboard.
 * Provides:
 *   - Document upload (text pasting)
 *   - Document list with delete
 *   - RAG query interface
 *
 * All calls go through the api() helper (auth token auto-injected).
 */

import { api } from './api.js';
import { safeSetHTML, escapeHTML } from '../../../../utils/sanitize.js';
import { withError, EventBus } from '../../../../utils/eventBus.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Open the RAG uploader & query panel inside a given host element.
 * @param {HTMLElement} host  - DOM element to render into
 */
export async function initRAGUploader(host) {
  if (!host) return;
  host.replaceChildren();

  safeSetHTML(host, `
    <div class="rag-panel">
      <h2>RAG Document Store</h2>

      <div class="rag-section">
        <h3>Upload Document</h3>
        <textarea id="rag-content" rows="5" placeholder="Paste document text here..."></textarea>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
          <input id="rag-filename" type="text" placeholder="filename.txt" style="flex:1;" />
          <button id="rag-upload-btn" class="btn btn-primary">Upload</button>
        </div>
      </div>

      <div class="rag-section">
        <h3>Ingested Documents</h3>
        <div id="rag-doc-list"><p class="ai-empty">Loading...</p></div>
      </div>

      <hr/>

      <div class="rag-section">
        <h3>Query Documents</h3>
        <div style="display:flex;gap:0.5rem;">
          <input id="rag-query-input" type="text" placeholder="Ask a question about your documents..." style="flex:1;" />
          <button id="rag-query-btn" class="btn btn-primary">Ask</button>
        </div>
        <div id="rag-answer" class="rag-answer"></div>
        <div id="rag-sources" class="rag-sources"></div>
      </div>
    </div>
  `);

  // Wire upload
  document.getElementById('rag-upload-btn')?.addEventListener('click', () => handleUpload());
  document.getElementById('rag-query-btn')?.addEventListener('click', () => handleQuery());

  // Load document list
  await refreshDocList();
}

async function handleUpload() {
  const content = document.getElementById('rag-content')?.value.trim();
  const filename = document.getElementById('rag-filename')?.value.trim() || 'document.txt';
  if (!content) {
    EventBus.emit('app:warning', { message: 'Paste document text first.' });
    return;
  }

  await withError(async () => {
    const result = await api('POST', '/api/v1/ai/rag/ingest', { content, filename });
    document.getElementById('rag-content').value = '';
    await refreshDocList();
  }, `Document ingested (${filename})`);
}

async function handleQuery() {
  const question = document.getElementById('rag-query-input')?.value.trim();
  if (!question) {
    EventBus.emit('app:warning', { message: 'Enter a question.' });
    return;
  }

  const answerEl = document.getElementById('rag-answer');
  const sourcesEl = document.getElementById('rag-sources');
  if (answerEl) answerEl.innerHTML = '<p class="ai-loading">Searching documents…</p>';

  await withError(async () => {
    const result = await api('POST', '/api/v1/ai/rag/query', { question });
    if (answerEl) {
      safeSetHTML(answerEl, `
        <h4>Answer</h4>
        <p>${result.answer ? escapeHTML(result.answer) : 'No answer generated (AI_API_KEY may be missing).'}</p>
      `);
    }
    if (sourcesEl) {
      const sources = result.sources || [];
      if (sources.length === 0) {
        sourcesEl.innerHTML = '<p class="ai-empty">No relevant documents found.</p>';
      } else {
        safeSetHTML(sourcesEl, `
          <h4>Sources (${sources.length})</h4>
          <ul>${sources.map(s => `<li><strong>${escapeHTML(s.filename)}</strong> (score: ${s.score})<br/><em>${escapeHTML(s.text.slice(0, 200))}...</em></li>`).join('')}</ul>
        `);
      }
    }
  });
}

async function refreshDocList() {
  const listEl = document.getElementById('rag-doc-list');
  if (!listEl) return;

  try {
    const result = await api('GET', '/api/v1/ai/rag/documents');
    const docs = result?.data || [];
    if (docs.length === 0) {
      listEl.innerHTML = '<p class="ai-empty">No documents ingested yet.</p>';
      return;
    }
    safeSetHTML(listEl, `
      <table class="data-table">
        <thead><tr><th>Filename</th><th>Chunks</th><th>Actions</th></tr></thead>
        <tbody>
          ${docs.map(d => `
            <tr>
              <td>${escapeHTML(d.filename)}</td>
              <td>${d.chunkCount}</td>
              <td><button class="btn btn-danger btn-sm rag-delete-btn" data-id="${d.documentId}">Delete</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `);
    // Wire delete buttons
    for (const btn of listEl.querySelectorAll('.rag-delete-btn')) {
      btn.addEventListener('click', () => handleDelete(btn.getAttribute('data-id')));
    }
  } catch (err) {
    logger.error('Failed to load doc list', err);
    listEl.innerHTML = '<p class="ai-empty">Error loading documents.</p>';
  }
}

async function handleDelete(documentId) {
  await withError(async () => {
    await api('DELETE', `/api/v1/ai/rag/documents/${documentId}`);
    await refreshDocList();
  }, 'Document deleted');
}
