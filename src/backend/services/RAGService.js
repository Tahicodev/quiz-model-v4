/**
 * src/backend/services/RAGService.js
 *
 * Retrieval-Augmented Generation service.
 * Ingests documents (PDF/docx/txt), chunks them into passages, stores them,
 * and retrieves relevant passages for question answering.
 *
 * For SQLite/local mode: in-memory document store with simple keyword matching.
 * For PostgreSQL mode: can be extended with pgvector for semantic search.
 *
 * Environment:
 *   RAG_STORAGE=memory|pgvector
 *   AI_API_KEY (shared with AIService for answer generation)
 */

import { config } from '../config.js';
import { logger } from '../logger.js';
import { ValidationError, NotFoundError } from '../../shared/errors.js';
import crypto from 'crypto';

// Simple in-memory document store (used in local/SQLite mode)
const memoryStore = new Map(); // key: schoolId, value: { chunks: Array, documents: Array }

export class RAGService {
  #repo;
  #logger;

  constructor(repo, loggerInstance) {
    this.#repo = repo;
    this.#logger = loggerInstance || logger;
  }

  /**
   * Ingest a document: extract text, chunk, embed (simulated), store.
   * @param {object} params
   * @param {string} params.content   - raw text content of the document
   * @param {string} params.filename  - original filename
   * @param {string} [params.schoolId=null]
   * @returns {{ chunks: number, status: string, documentId: string }}
   */
  async ingestDocument({ content, filename, schoolId = null }) {
    if (!content || !content.trim()) {
      throw new ValidationError({ content: ['Document content is required'] });
    }

    const documentId = crypto.randomUUID();
    const chunks = this.#chunkText(content);
    const chunkedDocs = chunks.map((text, i) => ({
      id: crypto.randomUUID(),
      documentId,
      filename: filename || 'unnamed',
      text,
      index: i,
      schoolId,
      ingestedAt: new Date().toISOString(),
    }));

    // Store in memory
    if (!memoryStore.has(schoolId)) {
      memoryStore.set(schoolId, { chunks: [], documents: [] });
    }
    const store = memoryStore.get(schoolId);
    store.chunks.push(...chunkedDocs);
    store.documents.push({ documentId, filename: filename || 'unnamed', chunkCount: chunks.length, schoolId });

    this.#logger.info(`Ingested "${filename}" — ${chunks.length} chunks`);

    return { chunks: chunks.length, status: 'ingested', documentId };
  }

  /**
   * Query the store with a question and retrieve relevant chunks.
   * @param {object} params
   * @param {string} params.question
   * @param {string} [params.schoolId=null]
   * @returns {{ answer: string|null, sources: Array<{ text: string, filename: string, score: number }> }}
   */
  async query({ question, schoolId = null }) {
    if (!question || !question.trim()) {
      throw new ValidationError({ question: ['Question is required'] });
    }

    const store = memoryStore.get(schoolId);
    if (!store || store.chunks.length === 0) {
      return { answer: null, sources: [] };
    }

    // Simple keyword-based retrieval (TF-IDF light)
    const queryTokens = this.#tokenize(question);
    const results = store.chunks.map(chunk => {
      const chunkTokens = this.#tokenize(chunk.text);
      const matches = queryTokens.filter(t => chunkTokens.includes(t)).length;
      const score = queryTokens.length > 0 ? matches / queryTokens.length : 0;
      return { ...chunk, score };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

    const sources = results.map(r => ({
      text: r.text.slice(0, 500),
      filename: r.filename,
      score: Math.round(r.score * 100) / 100,
    }));

    // Optionally generate an answer using LLM
    let answer = null;
    if (results.length > 0 && process.env.AI_API_KEY) {
      const context = results.map(r => r.text).join('\n\n');
      answer = await this.#generateAnswer(question, context);
    }

    return { answer, sources };
  }

  /**
   * List all ingested documents for a school.
   * @param {string} schoolId
   * @returns {Array<{ documentId: string, filename: string, chunkCount: number }>}
   */
  async listDocuments(schoolId = null) {
    const store = memoryStore.get(schoolId);
    return store?.documents ?? [];
  }

  /**
   * Delete a document and its chunks.
   * @param {string} documentId
   * @param {string} [schoolId=null]
   */
  async deleteDocument(documentId, schoolId = null) {
    const store = memoryStore.get(schoolId);
    if (!store) throw new NotFoundError('Document');
    const docIdx = store.documents.findIndex(d => d.documentId === documentId);
    if (docIdx === -1) throw new NotFoundError('Document');
    store.documents.splice(docIdx, 1);
    store.chunks = store.chunks.filter(c => c.documentId !== documentId);
    this.#logger.info(`Deleted document ${documentId}`);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  #chunkText(text, chunkSize = 500, overlap = 50) {
    const chunks = [];
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i += chunkSize - overlap) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim()) chunks.push(chunk);
    }
    return chunks.length > 0 ? chunks : [text];
  }

  #tokenize(text) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  }

  async #generateAnswer(question, context) {
    try {
      const apiKey = process.env.AI_API_KEY;
      const model = process.env.AI_MODEL || 'gpt-4o-mini';
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Answer the question based solely on the provided context. If the context lacks sufficient information, say "I cannot determine this from the provided documents."' },
            { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.choices?.[0]?.message?.content || null;
    } catch (err) {
      this.#logger.warn('Answer generation failed', err);
      return null;
    }
  }
}

const STOP_WORDS = new Set([
  'the','and','for','are','but','not','you','all','can','had','her','was','one',
  'our','out','has','have','been','some','them','than','that','this','with',
  'what','which','their','from','they','would','about','there','could','should',
  'when','where','how','each','after','into','over','such','only','other',
  'more','very','just','also','than','these','those','because','before',
]);
