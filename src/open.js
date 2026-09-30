// @ts-check
/**
 * Opening a file by its content, not its name: a WireSkein file or a sigrok
 * session (.sr), both read into the same Capture.
 */

import { readWireskein } from './fileformat.js';
import { readSr } from './sr.js';
import { listEntries, readEntry } from './zip.js';

/** @typedef {import('./fileformat.js').Capture} Capture */

/**
 * What a file is: "wireskein", "sr" or null (wireskein-format §2.3).
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {Promise<'wireskein' | 'sr' | null>}
 */
export async function sniff(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) return null;
  let entries;
  try { entries = listEntries(bytes); } catch { return null; }
  const ident = entries.get('wireskein.json');
  if (ident) {                             // (a .sr written by wireskein has one too, "wireskein-sr-extra/0")
    try {
      const format = JSON.parse(new TextDecoder().decode(await readEntry(bytes, ident))).format;
      if (typeof format === 'string' && format.startsWith('wireskein/')) return 'wireskein';
    } catch { /* not ours */ }
  }
  return entries.has('version') && entries.has('metadata') ? 'sr' : null;
}

/**
 * Read a WireSkein file or a sigrok .sr, whatever its name.
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {Promise<Capture & { source: 'wireskein' | 'sr' }>}
 */
export async function readCapture(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const kind = await sniff(bytes);
  if (kind === 'wireskein') return { ...(await readWireskein(bytes)), source: kind };
  if (kind === 'sr') return { ...(await readSr(bytes)), source: kind };
  throw new Error('neither a WireSkein file nor a sigrok session (.sr)');
}
