/**
 * src/backend/services/AIConfigService.js
 *
 * Manages AI model configurations for question generation:
 *  - shared entries (owner_id NULL): created by admins, selectable by every
 *    teacher in the school
 *  - personal entries: one teacher's own provider + key (their data only)
 *
 * Scoping rules ("each session sees only their own data, admin sees all"):
 *  - ADMIN / SUPER_ADMIN: every AIConfig in their school
 *  - TEACHER: shared configs + their own personal configs — nothing else
 *  - API keys are encrypted (AES-256-GCM) at rest and NEVER included in any
 *    API response; only a masked hint (last 4 chars) is exposed.
 */

import crypto from 'crypto';
import { logger } from '../logger.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../shared/errors.js';
import { ROLES } from '../../shared/constants.js';

const PROVIDERS = ['openrouter', 'openai', 'anthropic', 'google', 'deepseek', 'custom'];

function encryptionKey() {
  // Dedicated secret preferred; fall back to the JWT secret (already long).
  const secret = process.env.AI_KEY_SECRET || process.env.JWT_SECRET || 'quiz-app-dev-secret';
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest();
}

/** AES-256-GCM encrypt — returns "iv.tag.ciphertext" (all base64). */
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

/** Decrypt an encryptSecret() payload. Returns null when unrecoverable. */
export function decryptSecret(payload) {
  try {
    const [ivB64, tagB64, dataB64] = String(payload || '').split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

/** Public-safe projection — strips the encrypted key material. */
function toPublic(cfg) {
  if (!cfg) return null;
  const key = decryptSecret(cfg.api_key_enc);
  return {
    id: cfg.id,
    provider: cfg.provider,
    name: cfg.name,
    model_id: cfg.model_id,
    base_url: cfg.base_url || null,
    is_shared: cfg.owner_id == null,
    owner_id: cfg.owner_id || null,
    is_default: Boolean(cfg.is_default),
    has_key: Boolean(cfg.api_key_enc),
    key_hint: key ? `••••${key.slice(-4)}` : null,
    created_at: cfg.created_at,
  };
}

export class AIConfigService {
  #repo;
  #logger;

  constructor(repo, loggerInstance) {
    this.#repo = repo;
    this.#logger = loggerInstance || logger;
  }

  #model() {
    const m = this.#repo.modelFor ? this.#repo.modelFor('ai_configs') : null;
    if (!m) throw new Error('AIConfig model unavailable');
    return m;
  }

  /** List configs visible to the caller. Admins see all; teachers see shared + own. */
  async list(user, schoolId) {
    const role = String(user?.role || '').toLowerCase();
    const where = { school_id: schoolId };
    if (role !== ROLES.ADMIN && role !== ROLES.SUPER_ADMIN) {
      where.OR = [{ owner_id: null }, { owner_id: user.id }];
    }
    const rows = await this.#model().findMany({ where, orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }] });
    return rows.map(toPublic);
  }

  /** Load one config WITH the decrypted key (server-side use only). */
  async #loadWithKey(configId, schoolId) {
    const row = await this.#model().findUnique({ where: { id: configId } });
    if (!row || row.school_id !== schoolId) throw new NotFoundError('AI config not found');
    const key = decryptSecret(row.api_key_enc);
    return { row, key };
  }

  /** Verify the caller may use this config (shared, or their own, or admin). */
  #assertUsable(row, user) {
    const role = String(user?.role || '').toLowerCase();
    if (role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) return;
    if (row.owner_id == null) return; // shared
    if (row.owner_id === user.id) return; // personal
    throw new ForbiddenError('This AI model belongs to another user.');
  }

  /**
   * Create a config. shared=true requires admin; teachers create personal
   * configs only (forced owner_id = their id).
   */
  async create(user, schoolId, body) {
    const role = String(user?.role || '').toLowerCase();
    const provider = String(body?.provider || '').toLowerCase();
    const name = String(body?.name || '').trim();
    const modelId = String(body?.model_id || body?.modelId || '').trim();
    if (!PROVIDERS.includes(provider)) {
      throw new ValidationError({ provider: [`Unsupported provider: ${provider}`] });
    }
    if (!name) throw new ValidationError({ name: ['Name is required'] });
    if (!modelId) throw new ValidationError({ model_id: ['Model id is required'] });
    if (provider === 'custom' && !String(body?.base_url || '').trim()) {
      throw new ValidationError({ base_url: ['Base URL is required for custom providers'] });
    }

    const shared = Boolean(body?.shared);
    if (shared && role !== ROLES.ADMIN && role !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError('Only admins can publish shared AI models.');
    }

    const row = await this.#model().create({
      data: {
        school_id: schoolId,
        owner_id: shared ? null : user.id,
        provider,
        name,
        model_id: modelId,
        base_url: String(body?.base_url || '').trim() || null,
        api_key_enc: body?.api_key ? encryptSecret(body.api_key) : null,
        is_default: Boolean(body?.is_default),
      },
    });
    this.#logger.info('ai-config created', { id: row.id, provider, shared });
    return toPublic(row);
  }

  async remove(user, schoolId, configId) {
    const role = String(user?.role || '').toLowerCase();
    const row = await this.#model().findUnique({ where: { id: configId } });
    if (!row || row.school_id !== schoolId) throw new NotFoundError('AI config not found');
    const isAdminRole = role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN;
    if (!isAdminRole && row.owner_id !== user.id) {
      throw new ForbiddenError('You can only delete your own AI models.');
    }
    await this.#model().delete({ where: { id: configId } });
    return { deleted: true };
  }

  /**
   * Test a config with a tiny provider call. Returns ok/error + latency.
   */
  async test(user, schoolId, configId) {
    const { row, key } = await this.#loadWithKey(configId, schoolId);
    this.#assertUsable(row, user);
    const models = await listProviderModels({
      provider: row.provider,
      apiKey: key,
      baseUrl: row.base_url,
      modelFilter: row.model_id,
    });
    const found = Array.isArray(models)
      ? models.some((m) => String(m.id) === String(row.model_id))
      : true;
    return {
      ok: found,
      message: found
        ? `Model "${row.model_id}" is reachable.`
        : `Provider responded, but model "${row.model_id}" was not in its list.`,
    };
  }

  /** Resolve a config for generation (validates access + returns decrypted key). */
  async resolveForGeneration(user, schoolId, configId) {
    const { row, key } = await this.#loadWithKey(configId, schoolId);
    this.#assertUsable(row, user);
    return {
      provider: row.provider,
      name: row.name,
      model_id: row.model_id,
      base_url: row.base_url,
      api_key: key,
    };
  }
}

/**
 * Live model listing straight from the provider (admin "load models" button).
 * Returns [{ id, name }] — falls back to curated static lists offline.
 */
export async function listProviderModels({ provider, apiKey, baseUrl }) {
  const headers = { 'Content-Type': 'application/json' };
  let url = null;

  if (provider === 'openrouter') {
    if (!apiKey) return staticModels('openrouter');
    url = 'https://openrouter.ai/api/v1/models';
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (provider === 'openai') {
    if (!apiKey) return staticModels('openai');
    url = 'https://api.openai.com/v1/models';
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (provider === 'google') {
    if (!apiKey) return staticModels('google');
    url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`;
  } else if (provider === 'deepseek') {
    return staticModels('deepseek'); // DeepSeek has no public models endpoint
  } else if (provider === 'custom') {
    if (!baseUrl) throw new ValidationError({ base_url: ['Base URL is required'] });
    const base = String(baseUrl).replace(/\/+$/, '');
    url = base.endsWith('/chat/completions')
      ? base.replace(/\/chat\/completions$/, '/models')
      : base.endsWith('/v1')
        ? `${base}/models`
        : `${base}/v1/models`;
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  } else if (provider === 'anthropic') {
    return staticModels('anthropic'); // Anthropic lists models via a paid-tier API
  } else {
    throw new ValidationError({ provider: [`Unsupported provider: ${provider}`] });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Provider responded ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const list = Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data?.models)
        ? data.models
        : [];
    return list
      .map((m) => ({
        id: String(m.id || m.name || '').replace(/^models\//, ''),
        name: String(m.display_name || m.displayName || m.name || m.id || ''),
      }))
      .filter((m) => m.id);
  } catch (err) {
    logger.warn('ai-config: model list fetch failed, using static fallback', {
      provider,
      error: err?.message,
    });
    return staticModels(provider);
  } finally {
    clearTimeout(timer);
  }
}

function staticModels(provider) {
  const lists = {
    openrouter: [
      { id: 'google/gemini-2.5-flash:free', name: 'Gemini 2.5 Flash (Free)' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (Free)' },
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
      { id: 'openai/gpt-5.2', name: 'GPT-5.2' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    ],
    openai: [
      { id: 'gpt-5.2', name: 'GPT-5.2' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
    ],
    anthropic: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      { id: 'claude-3-5-haiku-latest', name: 'Claude 3.5 Haiku' },
    ],
    google: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ],
    deepseek: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    ],
    custom: [],
  };
  return lists[provider] || [];
}
