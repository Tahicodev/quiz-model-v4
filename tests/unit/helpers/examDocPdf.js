/**
 * tests/unit/helpers/examDocPdf.js
 *
 * Reading back a generated PDF in a test has to cost less than adding a PDF
 * parser dependency, so this helper does the two things the exam-document tests
 * actually need, from the raw bytes:
 *
 *  - count pages (`/Type /Page` dictionaries, i.e. what a viewer will show);
 *  - recover the visible text (inflate the content streams, then decode the
 *    hex string fragments pdfkit writes for the WinAnsi standard fonts).
 *
 * pdfkit splits a line into kerned fragments (`[<4c> 55 <7963e96520> 45 …] TJ`),
 * so the fragments are concatenated in stream order: that rebuilds the printed
 * sentence and lets a test assert on real wording instead of byte noise.
 */

import { inflateSync } from 'node:zlib';

function decodeWinAnsi(bytes) {
  try {
    return new TextDecoder('windows-1252').decode(bytes);
  } catch (_) {
    return Buffer.from(bytes).toString('latin1');
  }
}

/** All inflated content streams of the document, in page order. */
export function pdfStreams(buffer) {
  const raw = buffer.toString('latin1');
  const streams = [];
  const cursor = /stream/g;
  let match;
  while ((match = cursor.exec(raw))) {
    let start = match.index + 'stream'.length;
    while (start < buffer.length && (raw[start] === '\r' || raw[start] === '\n')) start += 1;
    const end = raw.indexOf('endstream', start);
    if (end < 0) continue;
    let stop = end;
    while (stop > start && (raw[stop - 1] === '\n' || raw[stop - 1] === '\r')) stop -= 1;
    const body = buffer.subarray(start, stop);
    try {
      streams.push(inflateSync(body).toString('latin1'));
    } catch (_) {
      // Not a compressed stream (font file, image, or the `endstream` keyword
      // itself): nothing printable to recover.
    }
  }
  return streams;
}

/** Visible text of the whole document, fragments concatenated. */
export function pdfText(buffer) {
  let out = '';
  for (const stream of pdfStreams(buffer)) {
    const hex = /<([0-9A-Fa-f]+)>/g;
    let match;
    while ((match = hex.exec(stream))) {
      out += decodeWinAnsi(Buffer.from(match[1], 'hex'));
    }
    const literal = /\(((?:\\.|[^()\\])*)\)/g;
    while ((match = literal.exec(stream))) {
      out += decodeWinAnsi(Buffer.from(match[1].replace(/\\([nrt()\\])/g, '$1'), 'latin1'));
    }
  }
  return out;
}

/** Number of page objects the file really declares. */
export function pdfPageCount(buffer) {
  return (buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
}
