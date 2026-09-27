/**
 * src/backend/services/ImageGenService.js
 *
 * Auto-generates REAL images for AI-created image-option questions.
 *
 * The AI (LLM) only outputs text, so the structured generator asks it to
 * describe each option as a self-contained image-generation prompt. This
 * service then turns those prompts into actual picture files:
 *
 *   - OpenAI     → POST https://api.openai.com/v1/images/generations
 *   - OpenRouter → POST https://openrouter.ai/api/v1/images/generations
 *   - Google     → POST https://generativelanguage.googleapis.com/v1beta/
 *                  models/<image-model>:generateContent  (Nano Banana, …)
 *
 * When an image-only model (e.g. google/gemini-2.5-flash-image — "Nano
 * Banana") was auto-paired by AIService for the question text, the original
 * image model is carried on `config._imageOnlyOriginalModel` and used here to
 * render the option pictures; a plain google model_id also works when the
 * config itself names the image model.
 *
 * Generated files are written into the app's `uploads/` folder (the same one
 * the manual editor uses) and the option becomes
 * `{ text: "image-N", image: "/uploads/<file>", isImageOnly: true }` — the
 * exact format manual image questions use, so training / exams / games all
 * render them identically with zero extra work.
 *
 * STRICT policy (no placeholders): image options are only produced when the
 * selected provider can generate images AND every option image was actually
 * generated. If the provider cannot generate images, an option fails, or the
 * model did not describe the options — the question falls back to plain text
 * options (using the option labels). No half-filled image slots are shipped.
 *
 * Env knobs (all optional):
 *   AI_IMAGE_MODEL       default image model per provider (gpt-image-1 /
 *                        openai/gpt-image-1)
 *   AI_IMAGE_QUESTION_MODEL  text model used to WRITE questions when an
 *                        image-only model is selected (defaults to a
 *                        per-provider sibling, e.g. google → gemini-2.5-flash)
 *   AI_IMAGE_SIZE        "1024x1024" (default), "1536x1024", "1024x1536"
 *   AI_IMAGE_MAX_TOTAL   hard cap of images generated per request (default 20)
 *   AI_IMAGE_CONCURRENCY parallel provider calls per question (default 2)
 *   AI_IMAGE_FAKE=1      local/test mode — returns a real 1×1 PNG instead of
 *                        calling a provider, so the whole pipeline is
 *                        verifiable without an API key
 */

import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { isImageOnlyModel } from './AIService.js';

const IMAGE_PROVIDERS = new Set(['openai', 'openrouter']);
const DEFAULT_MODEL = { openai: 'gpt-image-1', openrouter: 'openai/gpt-image-1' };
const DEFAULT_SIZE = '1024x1024';
const MAX_BYTES = 15 * 1024 * 1024; // generous guard — providers may return big PNGs
const HTTP_TIMEOUT = 60000;

const FAKE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function detectMime(buffer) {
  if (!buffer || buffer.length < 12) return 'image/png';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  // GIF: GIF87a / GIF89a
  if (String(buffer.subarray(0, 4)) === 'GIF8') return 'image/gif';
  // WebP: RIFF....WEBP
  if (String(buffer.subarray(0, 4)) === 'RIFF' && String(buffer.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

const MIME_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export class ImageGenService {
  constructor(options = {}) {
    this.uploadsDir = options.uploadsDir || config.uploadsDir;
    this._logger = options.logger || logger;
  }

  /** Whether a stored provider config can produce real option images. */
  isImageProvider(provider) {
    return IMAGE_PROVIDERS.has(String(provider || '').toLowerCase());
  }

  /**
   * Turn AIService draft questions (options as `{ label, image: <prompt> }`)
   * into either real image-option questions or plain text questions. Images
   * are saved to `uploads/` only after a whole question's options succeeded,
   * so a failed question never leaves orphan files behind.
   *
   * @param {object} opts
   * @param {object} opts.config     - stored provider config ({ provider, api_key, ... })
   * @param {Array}  opts.questions  - drafts from AIService.generateWithProvider
   * @returns {Promise<{ questions: Array, note?: string }>}
   */
  async render({ config: providerConfig, questions }) {
    const provider = String(providerConfig?.provider || '').toLowerCase();
    // When AIService auto-paired an image-only model (e.g. google Nano
    // Banana) with a text sibling, the option IMAGES must be rendered with the
    // ORIGINAL image model, not the text one AIService put in place.
    const imageModel = String(providerConfig?._imageOnlyOriginalModel || providerConfig?.model_id || '').trim();
    const canImage = this.isImageProvider(provider) || (provider === 'google' && isImageOnlyModel(imageModel));
    const imageDrafts = (questions || []).filter((q) => q && q.imageMode);
    const others = (questions || []).filter((q) => !(q && q.imageMode));

    if (!imageDrafts.length) {
      return {
        questions,
        note: canImage
          ? 'Image options were requested but the model returned text-only questions — options kept as text.'
          : 'Generated with text options (image options require an OpenAI, OpenRouter or Google image model).',
      };
    }

    if (!canImage && imageDrafts.some((q) => q.requireImages)) {
      throw new Error(`The selected ${provider || 'unknown'} model is not configured as an image-generation model.`);
    }
    if (!canImage) {
      const downgraded = imageDrafts.map((q) => this.#downgradeToText(q));
      return {
        questions: [...others, ...downgraded],
        note: `Provider "${provider || '?'}" cannot generate images — ${downgraded.length} image question(s) fell back to text options. Use an OpenAI, OpenRouter or Google image (e.g. Nano Banana) model for option images.`,
      };
    }

    const apiKey = String(providerConfig?.api_key || '').trim();
    if (!apiKey && !this.#fakeMode() && imageDrafts.some((q) => q.requireImages)) {
      throw new Error(`The selected ${provider} config has no API key for image generation.`);
    }
    if (!apiKey && !this.#fakeMode()) {
      const downgraded = imageDrafts.map((q) => this.#downgradeToText(q));
      return {
        questions: [...others, ...downgraded],
        note: `The selected ${provider} config has no API key — image questions fell back to text options.`,
      };
    }

    const maxTotal = Math.max(0, Number.parseInt(process.env.AI_IMAGE_MAX_TOTAL, 10) || 20);
    const concurrency = Math.max(1, Number.parseInt(process.env.AI_IMAGE_CONCURRENCY, 10) || 2);
    const requiredDraft = imageDrafts.find((q) => q.requireImages);
    if (requiredDraft && (requiredDraft.options || []).length > maxTotal) {
      throw new Error(`This question has ${(requiredDraft.options || []).length} image options, above the configured limit of ${maxTotal}. Reduce the options or increase AI_IMAGE_MAX_TOTAL.`);
    }
    let budget = maxTotal;
    let generated = 0;
    let fellBack = 0;

    const rendered = [];
    for (const draft of imageDrafts) {
      const expected = (draft.options || []).length;
      if (expected > budget && draft.requireImages) {
        throw new Error(`This question needs ${expected} option images, but only ${budget} remain in the configured image-generation limit.`);
      }
      if (expected > budget) {
        fellBack += 1;
        rendered.push(this.#downgradeToText(draft));
        continue;
      }

      // Generate all option images for this question first.
      let buffers = [];
      try {
        buffers = await this.#runPool(draft.options, concurrency, async (option) => {
          return this.#generateImage({ provider, apiKey, model: imageModel }, String(option.image || '').trim());
        });
      } catch (err) {
        this._logger.warn('Image option generation failed, falling back to text', {
          provider,
          model: imageModel,
          error: err.message,
        });
        fellBack += 1;
        // Manual image questions must never appear successful after silently
        // replacing every requested image with labels. Structured bulk
        // generation can retain its text fallback policy.
        if (draft.requireImages) throw err;
        rendered.push(this.#downgradeToText(draft));
        continue;
      }

      // Only now persist — a whole-question success means zero orphan files.
      const options = draft.options.map((option, oIdx) => {
        const { buffer, mime } = buffers[oIdx];
        const url = this.#saveImage(buffer, mime);
        return { text: `image-${oIdx + 1}`, image: url, isImageOnly: true };
      });

      generated += options.length;
      budget -= options.length;
      rendered.push({
        ...draft,
        imageMode: true,
        options,
        answer: this.#remapAnswer(draft, options),
      });
    }

    let note;
    if (generated) {
      const via = provider === 'google' ? `${imageModel} (google)` : provider;
      note = `Auto-generated ${generated} option image(s) via ${via}. Please review them before publishing.`;
    } else {
      note = 'Could not generate any option images — all image questions fell back to text options.';
    }
    if (fellBack) note += ` ${fellBack} image question(s) fell back to text options.`;
    return { questions: [...others, ...rendered], note, imagesGenerated: generated };
  }

  // ── Draft -> text (strict fallback, no placeholders) ─────────────────────

  #downgradeToText(draft) {
    const labels = (draft.options || [])
      .map((o, i) => String(o.label || o.text || `image-${i + 1}`).trim())
      .filter(Boolean);
    return {
      ...draft,
      imageMode: false,
      options: labels,
      answer: this.#remapToLabels(draft, labels),
    };
  }

  /**
   * Rewrite an image draft's answer (labels, possibly joined) into the final
   * token form using the rendered options ("image-1", ...):
   *   single     "cherry"          → "image-3"
   *   multi      "apple|cherry"    → "image-1|image-3"
   *   draggable  "alpha,beta,..."  → "image-1,image-2,..."
   */
  #remapAnswer(question, options) {
    const indexByLabel = new Map(
      (question.options || []).map((o, i) => [String(o.label || o.text || '').trim().toLowerCase(), i]),
    );
    const mapToken = (token) => {
      const t = String(token || '').trim().toLowerCase();
      if (indexByLabel.has(t)) return `image-${indexByLabel.get(t) + 1}`;
      const numeric = Number.parseInt(t, 10);
      if (Number.isFinite(numeric) && String(numeric) === t && numeric >= 1 && numeric <= options.length) {
        return `image-${numeric}`;
      }
      const letter = t.match(/^([a-h])$/i);
      if (letter) {
        const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) return `image-${idx + 1}`;
      }
      return token;
    };
    const raw = String(question.answer || '').trim();
    if (!raw) return raw;
    if (question.type === 'draggable') return raw.split(',').map(mapToken).join(',');
    if (question.type === 'multiple-choice-multi') return raw.split(/[,|]/).map(mapToken).join('|');
    return mapToken(raw.split(/[,|]/)[0]);
  }

  /** Keep a draft usable as plain text (labels in, labels out). */
  #remapToLabels(question, labels) {
    const raw = String(question.answer || '').trim();
    const mapToken = (token) => {
      const t = String(token || '').trim();
      if (labels.includes(t)) return t;
      const numeric = Number.parseInt(t, 10);
      if (Number.isFinite(numeric) && String(numeric) === t && numeric >= 1 && numeric <= labels.length) {
        return labels[numeric - 1];
      }
      return t;
    };
    if (!raw) return raw;
    if (question.type === 'draggable') return raw.split(',').map(mapToken).join(',');
    if (question.type === 'multiple-choice-multi') return raw.split(/[,|]/).map(mapToken).join('|');
    return mapToken(raw.split(/[,|]/)[0]);
  }

  // ── Provider calls ────────────────────────────────────────────────────────

  #fakeMode() {
    return process.env.AI_IMAGE_FAKE === '1';
  }

  async #generateImage(providerCfg, prompt) {
    if (!prompt) throw new Error('Empty image prompt');
    if (this.#fakeMode()) return { buffer: FAKE_PNG, mime: 'image/png' };
    if (providerCfg.provider === 'openrouter') return this.#generateOpenRouter(providerCfg.apiKey, prompt);
    if (providerCfg.provider === 'google') return this.#generateGoogle(providerCfg.apiKey, prompt, providerCfg.model);
    return this.#generateOpenAI(providerCfg.apiKey, prompt);
  }

  async #generateOpenAI(apiKey, prompt) {
    const data = await this.#postJSON('https://api.openai.com/v1/images/generations', {
      headers: { Authorization: `Bearer ${apiKey}` },
      body: {
        model: process.env.AI_IMAGE_MODEL || DEFAULT_MODEL.openai,
        prompt,
        n: 1,
        size: process.env.AI_IMAGE_SIZE || DEFAULT_SIZE,
        output_format: 'png',
      },
    });
    return this.#fromItem(data?.data?.[0]);
  }

  async #generateOpenRouter(apiKey, prompt) {
    const data = await this.#postJSON('https://openrouter.ai/api/v1/images/generations', {
      headers: { Authorization: `Bearer ${apiKey}` },
      body: {
        model: process.env.AI_IMAGE_MODEL || DEFAULT_MODEL.openrouter,
        prompt,
        n: 1,
      },
    });
    return this.#fromItem(data?.data?.[0]);
  }

  async #postJSON(url, { headers = {}, body }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`${url} returned ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // Google Generative Language image models (gemini-2.5-flash-image "Nano
  // Banana", gemini-2.0-flash-preview-image-generation, …). Text prompt in →
  // inline image out via the same Google API key.
  async #generateGoogle(apiKey, prompt, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const data = await this.#postJSON(url, {
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          // Gemini image models return the generated image as inlineData;
          // request text+image so the API can include its accompanying text
          // part while still requiring an image part below.
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: this.#aspectRatio() },
        },
      },
    });
    const part =
      data?.candidates?.[0]?.content?.parts?.find((p) => p && p.inlineData && p.inlineData.data) || null;
    if (!part) {
      const block = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || 'no_image';
      const detail = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join(' ').slice(0, 240);
      throw new Error(`Google image model returned no image (${block})${detail ? `: ${detail}` : ''}`);
    }
    const b64 = String(part.inlineData.data || '').replace(/\s+/g, '');
    if (!b64) throw new Error('Google image model returned an empty image payload');
    const mime = ['image/jpeg', 'image/png', 'image/webp'].includes(part.inlineData.mimeType)
      ? part.inlineData.mimeType
      : 'image/png';
    return { buffer: this.#guard(Buffer.from(b64, 'base64')), mime };
  }

  // Map AI_IMAGE_SIZE ("1536x1024" …) onto Google's imageConfig.aspectRatio.
  #aspectRatio() {
    const size = String(process.env.AI_IMAGE_SIZE || DEFAULT_SIZE);
    const n = size.split('x').map((v) => Number.parseInt(v, 10));
    if (n[0] > n[1]) return '3:2';
    if (n[0] < n[1]) return '2:3';
    return '1:1';
  }

  async #fromItem(item) {
    if (!item) throw new Error('Provider returned no image');
    const buffer = await this.#imageBuffer(item);
    return { buffer, mime: detectMime(buffer) };
  }

  async #imageBuffer(item) {
    if (typeof item.b64_json === 'string' && item.b64_json) {
      return this.#guard(Buffer.from(item.b64_json.replace(/\s+/g, ''), 'base64'));
    }
    if (typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT);
      try {
        const res = await fetch(item.url, { redirect: 'follow', signal: controller.signal });
        if (!res.ok) throw new Error(`Image download failed (${res.status})`);
        return this.#guard(Buffer.from(await res.arrayBuffer()));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error('Provider returned no image data (missing b64_json / url)');
  }

  #guard(buffer) {
    if (!buffer.length) throw new Error('Provider returned an empty image payload');
    if (buffer.length > MAX_BYTES) throw new Error(`Generated image too large (${buffer.length} bytes)`);
    return buffer;
  }

  // ── Persistence into uploads/ ─────────────────────────────────────────────

  #saveImage(buffer, mime) {
    const ext = MIME_EXT[mime] || 'png';
    mkdirSync(this.uploadsDir, { recursive: true });
    const name = `${randomBytes(16).toString('hex')}.${ext}`;
    writeFileSync(join(this.uploadsDir, name), buffer);
    return `/uploads/${name}`;
  }

  /** Best-effort removal of files written under uploads/ (used by cleanup). */
  removeFile(url) {
    const name = String(url || '').replace('/uploads/', '');
    if (!name || !/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp)$/i.test(name)) return;
    const target = normalize(join(this.uploadsDir, name));
    if (!target.startsWith(join(normalize(this.uploadsDir)) + sep)) return;
    if (existsSync(target)) {
      try {
        rmSync(target);
        return true;
      } catch (_) {
        /* best-effort */
      }
    }
    return false;
  }

  // ── Concurrency helper ────────────────────────────────────────────────────

  async #runPool(items, concurrency, worker) {
    let index = 0;
    const results = new Array(items.length);
    const runners = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
      while (index < items.length) {
        const at = index;
        index += 1;
        results[at] = await worker(items[at]);
      }
    });
    await Promise.all(runners);
    return results;
  }
}
