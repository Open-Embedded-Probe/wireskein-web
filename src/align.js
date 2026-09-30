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

/**
 * The alignment of `other` onto a reference file (wireskein-format §5.1.1): the entry in other's alignment.json
 * for `referenceName`, when its capture_sha256 matches the reference's capture.json. null otherwise, with why.
 * @param {Capture} other @param {Capture} reference @param {string} referenceName
 * @returns {Promise<{ entry: Record<string, any> | null, why: string }>}
 */
export async function fileAlignment(other, reference, referenceName) {
  const data = other.attachments.get('alignment.json');
  let doc = null;
  try { doc = data ? JSON.parse(new TextDecoder().decode(data)) : null; } catch { doc = null; }
  const entry = doc?.format === ALIGNMENT_FORMAT ? doc.files?.[referenceName] : undefined;
  if (!entry || typeof entry.offset_ticks !== 'number' || typeof entry.scale !== 'number') {
    return { entry: null, why: `no alignment onto ${referenceName} in the file (wireskein align --to)` };
  }
  if (!reference.captureJson) return { entry: null, why: `${referenceName} has no capture.json to compare` };
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {Uint8Array<ArrayBuffer>} */ (reference.captureJson)));
  const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex !== entry.capture_sha256) return { entry: null, why: `the alignment is for another file named ${referenceName}` };
  return { entry, why: '' };
}

/** A Ratio close to x. @param {number} x @returns {Ratio} */
const ratio = (x) => [Math.round(x * 1e6), 1e6];

/**
 * Other's channels on the reference's ticks, their names prefixed. With no entry, other's tick 0 is put at the
 * reference's tick 0 and only the rates are converted.
 * @param {Capture} reference @param {Capture} other @param {Record<string, any> | null} entry @param {string} prefix
 * @returns {(import('./fileformat.js').LogicChannel | AnalogChannel)[]}
 */
export function onto(reference, other, entry, prefix) {
  const hzOf = (/** @type {Ratio} */ r) => r[0] / r[1];
  const a = entry ? entry.offset_ticks : 0;
  const b = entry ? entry.scale : hzOf(reference.tickHz) / hzOf(other.tickHz);
  const own = readAlignment(other);                         // other's analog onto its own logic, first
  return other.channels.map((ch) => {
    if (ch.kind === 'logic') return { ...ch, name: prefix + ch.name, phase: a + b * ch.phase, step: b * ch.step };
    const al = own?.get(ch.name);
    const t0 = alignedTick(ch, other.tickHz, 0, al);
    const per = (hzOf(other.tickHz) / hzOf(ch.rateHz)) * (al ? al.scale : 1);
    return { ...ch, name: prefix + ch.name, t0Ticks: ratio(a + b * t0), rateHz: ratio(hzOf(reference.tickHz) / (b * per)) };
  });
}
