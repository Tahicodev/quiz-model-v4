/**
 * src/backend/services/exam-doc/text.js
 *
 * Text and media helpers shared by the three document renderers
 * (HTML preview, PDF, DOCX).
 */

// ─── Point formatting ────────────────────────────────────────────────────────
/** French-style point label: 2 → "2", 2.5 → "2,5", 1.25 → "1,25". */
export function formatPoints(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 100) / 100;
  const text = rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return text.replace('.', ',');
}

/** "(2,5 pts)" / "(1 pt)" — the marker appended to a question heading. */
export function formatPointsBadge(value) {
  const n = Number(value);
  const unit = n === 1 ? 'pt' : 'pts';
  return `(${formatPoints(value)} ${unit})`;
}

// ─── Option labels ───────────────────────────────────────────────────────────
/** 0 → 'A', 1 → 'B', … 26 → 'AA'. */
export function optionLetter(index) {
  let i = Math.max(0, Math.floor(Number(index) || 0));
  let label = '';
  do {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return label;
}

// ─── Fill-in-the-blank numbering ─────────────────────────────────────────────
/**
 * A fill-blank stem hides its gaps behind whatever token the teacher typed —
 * `____`, `…`, `...`, `( )`, `-  `, `[ ]`. The same pattern is used both to count
 * the blanks (questionRenderers) and to number them on paper (renderers), so a
 * count and its numbered markers can never drift apart.
 */
export const BLANK_TOKEN_RE = /_{2,}|\.\.\.|…|\(\s{2,}\)|- {2,}|\[[\s]*\]/g;

/**
 * Rewrite a fill-blank stem so every gap becomes a numbered marker followed by a
 * short rule — the "numéro + petit trait" style, e.g. `La (1) ____ est grande.`.
 * The student writes the real answer on the matching numbered line of the
 * "Réponses" block printed under the question, so the inline trait only marks
 * where each gap sits. Numbering restarts at 1 for every question. Returns the
 * rewritten stem and how many blanks were labelled.
 *
 * `numbered: false` prints the gaps as plain rules (`La ____ est grande.`).
 * The inline answer style needs it: there the student writes the OPTION NUMBER
 * straight into the space, so a `(1)` marker is a second numbering of the same
 * sentence competing with the `1. 2  2. 8  3. 0` bank below it.
 */
export function numberBlankGaps(text, { numbered = true } = {}) {
  let n = 0;
  const out = String(text ?? '').replace(BLANK_TOKEN_RE, () => {
    n += 1;
    return numbered ? ` (${n}) ____` : '____';
  });
  return { text: out, count: n };
}

/**
 * The printed stem of a fill-blank question, gaps numbered for the surface in
 * use. One helper for the PDF, Word and the preview, so the three sheets can
 * never disagree about whether the gaps carry a `(n)` marker.
 */
export function blankStem(block, { inline = false } = {}) {
  const raw = String(block?.text ?? '');
  if (block?.kind !== 'blanks') return raw;
  const hasBank = Array.isArray(block.bank) && block.bank.length > 0;
  return numberBlankGaps(raw, { numbered: !(inline && hasBank) }).text;
}

/**
 * Circled option number for the fill-blank bank: 1 → ①, 2 → ② … 20 → ⑳.
 * Kept for legacy callers; the exam sheet now prints plain bold "N." labels
 * (the circles read poorly at small sizes on paper).
 */
export function circledNumber(n) {
  const i = Math.floor(Number(n));
  if (i >= 1 && i <= 20) return String.fromCodePoint(0x2460 + i - 1);
  return `${i}.`;
}

// ─── WinAnsi sanitising for PDF ──────────────────────────────────────────────
// pdfkit's built-in standard fonts are WinAnsi-encoded (cp1252): all French
// accents plus œ/Œ/smart quotes/– — … are directly encodable. Anything else
// (math operators, Greek, Arabic) has no glyph and must be transliterated —
// and the substitution is reported instead of silently mangling the paper.
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const TRANSLITERATE = {
  '≤': '<=',
  '≥': '>=',
  '≠': '!=',
  '≈': '~=',
  '≡': '==',
  '→': '->',
  '←': '<-',
  '↔': '<->',
  '√': 'sqrt',
  '∛': 'cbrt',
  '∞': 'inf',
  '∑': 'sum',
  '∏': 'prod',
  '∫': 'int',
  '∂': 'd',
  '∈': 'in',
  '∉': 'not in',
  '⊂': 'subset',
  '⊕': '(+)',
  '∘': 'o',
  'α': 'alpha',
  'β': 'beta',
  'γ': 'gamma',
  'δ': 'delta',
  'Δ': 'Delta',
  'λ': 'lambda',
  'μ': 'micro',
  'π': 'pi',
  'Π': 'Pi',
  'θ': 'theta',
  'σ': 'sigma',
  'φ': 'phi',
  'ω': 'omega',
  'Ω': 'Omega',
  '°': ' deg',
  '□': '[ ]',
  '■': '[X]',
  '○': '( )',
  '●': '(X)',
  '✓': 'v',
  '✗': 'x',
  '⇒': '=>',
  '⇔': '<=>',
  '…': '...',
  '\u00ad': '',
};

function isWinAnsi(codePoint) {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true; // printable ASCII
  if (codePoint >= 0xa0 && codePoint <= 0xff) return true; // Latin-1 block
  return CP1252_EXTRA.has(codePoint);
}

/**
 * Convert text to the WinAnsi glyph set.
 * @returns {{ text: string, substitutions: string[] }} `substitutions` lists
 *   the distinct source characters that had to be replaced.
 */
export function toWinAnsi(input) {
  const raw = String(input ?? '');
  const substitutions = new Set();
  let out = '';
  for (const ch of raw) {
    const cp = ch.codePointAt(0);
    if (cp === 0x0a || cp === 0x0d || cp === 0x09) {
      out += ch;
      continue;
    }
    if (isWinAnsi(cp)) {
      out += ch;
      continue;
    }
    if (cp < 0x20) continue; // drop control characters
    const mapped = TRANSLITERATE[ch];
    if (mapped !== undefined) {
      substitutions.add(ch);
      out += mapped;
      continue;
    }
    // Unknown script (Arabic, CJK, …): a replacement marker is the honest
    // option — the warning tells the teacher to switch to Word export or to
    // provide EXAM_DOC_FONT_TTF.
    substitutions.add(ch);
    out += '?';
  }
  return { text: out, substitutions: [...substitutions] };
}

// ─── Image resolution ────────────────────────────────────────────────────────
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const MAGIC = [
  { format: 'png', test: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { format: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
];

function detectFormat(buffer) {
  for (const entry of MAGIC) if (entry.test(buffer)) return entry.format;
  return null;
}

/**
 * Whether the pixel data of a PNG can actually be inflated.
 *
 * pdfkit parses the header synchronously but inflates the image through an
 * async stream, so a truncated upload fails outside every try/catch: the
 * request would hang instead of producing a paper. Inflating once here turns
 * an undecodable file into the same honest `image-skipped` warning as any other
 * unsupported picture.
 */
function pngDataDecodes(buffer) {
  const payloads = [];
  let offset = 8; // signature
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    if (!Number.isFinite(length) || length < 0 || start + length > buffer.length) return false;
    if (type === 'IDAT') payloads.push(buffer.subarray(start, start + length));
    offset = start + length + 4; // skip the CRC
    if (type === 'IEND') break;
  }
  if (!payloads.length) return false;
  try {
    inflateSync(Buffer.concat(payloads));
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Resolve a stored image reference (`/uploads/x.png`, `http…/uploads/x.png` or
 * a `data:image/...;base64,` URL) into embeddable bytes.
 *
 * pdfkit and Word both accept PNG/JPEG; GIF/WEBP and unreachable files are
 * skipped, and the caller records a warning — a missing picture must never
 * break a printed exam.
 *
 * @returns {{ buffer: Buffer, format: 'png'|'jpg', source: string }|null}
 */
export function resolveImage(src, { uploadsDir, fetchImpl = null } = {}) {
  const ref = String(src ?? '').trim();
  if (!ref) return null;
  try {
    const dataUrl = /^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i.exec(ref);
    if (dataUrl) {
      const buffer = Buffer.from(dataUrl[2].replace(/\s+/g, ''), 'base64');
      const format = detectFormat(buffer);
      if (format === 'png' && !pngDataDecodes(buffer)) return null;
      return format ? { buffer, format, source: 'data-url' } : null;
    }
    if (/^https?:\/\//i.test(ref)) {
      // Offline/LAN classrooms have no outbound network: only our own uploads
      // folder is trusted, everything else is skipped (never a silent stall).
      if (!ref.includes('/uploads/') || !fetchImpl) return null;
      return null;
    }
    if (ref.startsWith('/uploads/') || ref.startsWith('uploads/')) {
      const name = ref.replace(/^\/?uploads\//, '');
      const abs = `${uploadsDir || 'uploads'}/${name}`;
      if (!existsSync(abs)) return null;
      const buffer = readFileSync(abs);
      const format = detectFormat(buffer);
      if (format === 'png' && !pngDataDecodes(buffer)) return null;
      return format ? { buffer, format, source: abs } : null;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Natural pixel size of a PNG/JPEG buffer. Word needs explicit dimensions in
 * its image transformation (pdfkit reads them itself), and no image library is
 * worth adding for two header formats.
 * @returns {{ width: number, height: number }|null}
 */
export function imageDimensions(buffer, format) {
  if (!buffer || buffer.length < 24) return null;
  if (format === 'png') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (format === 'jpg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      const length = buffer.readUInt16BE(offset + 2);
      if (isSof) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

/**
 * Deterministic pseudo-shuffle (stable across regenerations of the same exam)
 * used for the right-hand column of matching exercises on the student paper.
 */
export function seededShuffle(items, seedText) {
  const list = [...(items || [])];
  let seed = 2166136261;
  const seedStr = String(seedText ?? '');
  for (let i = 0; i < seedStr.length; i++) {
    seed ^= seedStr.charCodeAt(i);
    seed = Math.imul(seed, 16777619) >>> 0;
  }
  const rand = () => {
    // xorshift32 — no external randomness, same exam → same layout.
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5; seed >>>= 0;
    return seed / 0x100000000;
  };
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
