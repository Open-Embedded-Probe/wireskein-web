// @ts-check
/**
 * Time alignment stored by `wireskein align` (attach/alignment.json, wireskein-format §5.1): per analog
 * channel, an offset and a time scale against the logic ticks. A stored time t (ticks) becomes
 * offsetTicks + scale * t. The samples and their stored times are not changed; a viewer chooses to use it.
 */

import { analogTick } from './fileformat.js';

/** @typedef {import('./fileformat.js').Capture} Capture */
/** @typedef {import('./fileformat.js').AnalogChannel} AnalogChannel */
/** @typedef {import('./fileformat.js').Ratio} Ratio */

export const ALIGNMENT_FORMAT = 'wireskein-alignment/0';

/**
 * @typedef {object} Alignment
 * @property {number} offsetTicks
 * @property {number} scale
 * @property {string} reference        the logic channel it was aligned to
 * @property {string} via              the analog channel whose edges were matched
 * @property {Record<string, unknown>} raw   the stored entry, as it is
 */

/**
 * The alignment in a capture's attachments: channel name -> Alignment. null when there is none, or when
 * its format is not one this version reads (it must not be used then).
 * @param {Capture} cap
 * @returns {Map<string, Alignment> | null}
 */
export function readAlignment(cap) {
  const data = cap.attachments.get('alignment.json');
  if (!data) return null;
  let doc;
  try { doc = JSON.parse(new TextDecoder().decode(data)); } catch { return null; }
  if (doc?.format !== ALIGNMENT_FORMAT || typeof doc.channels !== 'object') return null;
  const out = new Map();
  for (const [name, c] of Object.entries(doc.channels)) {
    if (typeof c?.offset_ticks !== 'number' || typeof c?.scale !== 'number') continue;
    out.set(name, { offsetTicks: c.offset_ticks, scale: c.scale, reference: String(c.reference ?? ''),
                    via: String(c.via ?? ''), raw: c });
  }
  return out.size ? out : null;
}

/**
 * The tick of sample k of an analog channel, aligned when `a` is given.
 * @param {AnalogChannel} ch @param {Ratio} tickHz @param {number} k @param {Alignment | null | undefined} [a]
 */
export function alignedTick(ch, tickHz, k, a) {
  const t = analogTick(ch, tickHz, k);
  return a ? a.offsetTicks + a.scale * t : t;
}
