// @ts-check
/**
 * Reading WireSkein files (.wireskein, format wireskein/1): a capture and what
 * goes with it. The format is specified in the wireskein repository,
 * docs/wireskein-format.ja.md. Files are told apart by their content
 * (wireskein.json), not their name.
 *
 * Time is counted in ticks of one clock per file (tickHz, a fraction). A
 * capture is one or more parts (§3.4): runs of ticks without a gap, either one
 * acquisition cut by its gaps (layout "timeline", each part placed at its
 * tick0) or independent acquisitions (layout "segments", one per trigger). A
 * logic channel has a sample every `step` ticks from `phase` (bits) or its
 * changes per quantum of `step` ticks (events); an analog channel has its own
 * rate and first-sample time (t0Ticks). Only the samples a probe took are
 * stored, so a viewer can show exactly those. A capture that lost data
 * (complete false) is a failure: a reader says so.
 */

import { listEntries, readEntry } from './zip.js';

export const FORMAT = 'wireskein/1';
/** Encodings this version reads; channels of others are skipped (wireskein-format §3.2). */
export const ENCODINGS = new Set(['bits', 'events', 'analog', 'analog-f32']);

/** @typedef {[number, number]} Ratio  numerator, denominator */

/**
 * @typedef {object} LogicChannel
 * @property {'logic'} kind
 * @property {string} name
 * @property {number} n            samples
 * @property {number} step         ticks per sample
 * @property {number} phase        tick of the first sample
 * @property {Record<string, unknown>} acquisition
 * @property {Uint8Array} bits     one bit per sample, least significant bit first
 */

/**
 * A logic line kept as its changes (wireskein-format §4.4; OEP capture format 1's events): quantum k is ticks
 * [phase + k * step, phase + (k + 1) * step); an event is a quantum where the line changed, with the level at its
 * end and how many times it changed in it (127: at least 127). Quanta without an event kept the level.
 * @typedef {object} EventsChannel
 * @property {'events'} kind
 * @property {string} name
 * @property {number} n            quanta (the channel ends at tick phase + n * step)
 * @property {number} step         ticks per quantum
 * @property {number} phase        tick where quantum 0 starts
 * @property {0 | 1} startLevel    the level before quantum 0
 * @property {Record<string, unknown>} acquisition
 * @property {Float64Array} quanta per event, its quantum (increasing)
 * @property {Uint8Array} levels   per event, the level at the quantum's end
 * @property {Uint8Array} counts   per event, the changes in the quantum (1-127; 127 at least)
 */

/**
 * @typedef {object} AnalogChannel
 * @property {'analog'} kind
 * @property {string} name
 * @property {'analog' | 'analog-f32'} encoding
 * @property {number} n
 * @property {Ratio} rateHz
 * @property {Ratio} t0Ticks
 * @property {number} width         bits per raw value (encoding "analog")
 * @property {number | null} valueBits
 * @property {number | null} zero
 * @property {number | null} scaleNv
 * @property {string} unit
 * @property {Record<string, unknown>} acquisition
 * @property {Float64Array} values  raw values ("analog") or volts ("analog-f32")
 */

/** @typedef {LogicChannel | EventsChannel | AnalogChannel} Channel */

/**
 * A part (wireskein-format §3.4): ticks 0 .. ticks - 1 of its own, with every channel gapless in it.
 * @typedef {object} Part
 * @property {number} ticks
 * @property {number | null} tick0        where its tick 0 is from the first part's (timeline: always; segments: when known)
 * @property {Record<string, unknown>} meta   the part's own facts (start_ns, trigger_tick, ...)
 * @property {Channel[]} channels
 */

/**
 * What was lost while capturing (wireskein-format §3.4): a capture with any is a failure.
 * @typedef {object} Loss
 * @property {number} afterPart          the part it came after (-1: before the first)
 * @property {number | null} ticks       how long, when known
 * @property {string} reason
 * @property {boolean} stopped           the capture stopped there
 */

/**
 * A capture, seen at one of its parts (`part`; selectPart() shows another): `ticks`, `channels` and `meta` (the
 * capture's meta with the part's on top) are that part's.
 * @typedef {object} Capture
 * @property {Ratio} tickHz
 * @property {number} ticks
 * @property {Record<string, unknown>} meta
 * @property {Channel[]} channels
 * @property {number} part                                   which part this is (0 ..)
 * @property {Part[]} parts
 * @property {'timeline' | 'segments'} layout
 * @property {boolean} complete                              false: data was lost (a failed capture, kept as far as it got)
 * @property {Loss[]} lost
 * @property {Record<string, unknown>} fileMeta              the capture's own meta (without a part's)
 * @property {{ name: string, encoding: string }[]} skipped   channels of encodings this version does not read
 * @property {Map<string, Uint8Array>} attachments           attach/<name>
 * @property {Map<string, Uint8Array>} entries               markers/ and decode/ entries (wireskein-format §5.2, §5.3)
 * @property {string | null} id                              the capture's id (capture.json "id"; other files refer to it, §5.1.1)
 * @property {{ time: string, content: unknown, [key: string]: unknown }[]} notes
 */

/**
 * Read a WireSkein file (any name), seen at its first part. Throws on other files, on a format this
 * version does not know (a newer one) and on a file holding no capture.
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {Promise<Capture>}
 */
export async function readWireskein(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = listEntries(bytes);
  const text = async (/** @type {string} */ name) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`${name} is missing`);
    return new TextDecoder().decode(await readEntry(bytes, entry));
  };
  if (!entries.has('wireskein.json')) throw new Error('not a WireSkein file (no wireskein.json)');
  const format = JSON.parse(await text('wireskein.json')).format;
  if (format === 'wireskein/0') {
    throw new Error(`a beta WireSkein file (wireskein/0, from wireskein 0.0.8-0.0.12); this version reads ${FORMAT} only`);
  }
  if (format !== FORMAT) {
    throw new Error(`format ${JSON.stringify(format)}, this version reads ${JSON.stringify(FORMAT)} (a newer wireskein-web may read it)`);
  }
  if (!entries.has('capture.json')) throw new Error('the file holds no capture');
  const head = JSON.parse(await text('capture.json'));
  if (!Array.isArray(head.parts) || !head.parts.length) {
    throw new Error('capture.json has no parts (a file from before wireskein-format §3.4: written by an older wireskein)');
  }
  /** @type {{ name: string, encoding: string }[]} */
  const skipped = [];
  const seen = new Set();
  /** @type {Part[]} */
  const parts = [];
  for (const p of head.parts) {
    /** @type {Channel[]} */
    const channels = [];
    for (const c of p.channels) {
      if (!ENCODINGS.has(c.encoding)) {
        if (!seen.has(c.name)) skipped.push({ name: c.name, encoding: c.encoding });
        seen.add(c.name);
        continue;
      }
      const entry = entries.get(c.file);
      if (!entry) throw new Error(`${c.name}: ${c.file} is missing`);
      channels.push(channelOf(c, await readEntry(bytes, entry)));
    }
    parts.push({ ticks: p.ticks, tick0: typeof p.tick0 === 'number' ? p.tick0 : null, meta: p.meta ?? {}, channels });
  }
  /** @type {Map<string, Uint8Array>} */
  const attachments = new Map();
  const notes = [];
  /** @type {Map<string, Uint8Array>} */
  const extra = new Map();
  for (const [name, entry] of entries) {
    if (name.startsWith('attach/')) attachments.set(name.slice(7), await readEntry(bytes, entry));
    if (name.startsWith('markers/') || name.startsWith('decode/')) extra.set(name, await readEntry(bytes, entry));
  }
  for (const name of [...entries.keys()].filter((x) => x.startsWith('notes/')).sort()) {
    notes.push(JSON.parse(await text(name)));
  }
  const lost = (Array.isArray(head.lost) ? head.lost : []).map((/** @type {any} */ x) => ({
    afterPart: x.after_part, ticks: typeof x.ticks === 'number' ? x.ticks : null, reason: String(x.reason ?? ''),
    stopped: x.stopped === true }));
  /** @type {Capture} */
  const cap = { tickHz: head.tick_hz, ticks: 0, meta: {}, channels: [], part: 0, parts,
                layout: head.layout === 'segments' ? 'segments' : 'timeline', complete: head.complete !== false && !lost.length,
                lost, fileMeta: head.meta ?? {}, skipped, attachments, entries: extra, notes,
                id: typeof head.id === 'string' ? head.id : null };
  return selectPart(cap, 0);
}

/**
 * The capture seen at part k: its ticks, channels and meta (the capture's meta with the part's on top).
 * @param {Capture} cap @param {number} k
 * @returns {Capture}
 */
export function selectPart(cap, k) {
  const p = cap.parts[k];
  if (!p) throw new RangeError(`part ${k}: the capture has ${cap.parts.length}`);
  return { ...cap, part: k, ticks: p.ticks, channels: p.channels, meta: { ...cap.fileMeta, ...p.meta } };
}

/**
 * One channel of capture.json and its data.
 * @param {Record<string, any>} c @param {Uint8Array} data
 * @returns {Channel}
 */
function channelOf(c, data) {
  const acquisition = c.acquisition ?? {};
  if (c.encoding === 'bits') {
    if (data.length !== Math.ceil(c.n / 8)) throw new Error(`${c.name}: ${data.length} bytes for ${c.n} samples`);
    return { kind: 'logic', name: c.name, n: c.n, step: c.step, phase: c.phase, acquisition, bits: data };
  }
  if (c.encoding === 'events') {
    return { kind: 'events', name: c.name, n: c.n, step: c.step, phase: c.phase, startLevel: c.start_level ? 1 : 0,
             acquisition, ...eventsOf(c, data) };
  }
  return { kind: 'analog', name: c.name, encoding: c.encoding, n: c.n, rateHz: c.rate_hz, t0Ticks: c.t0_ticks,
           width: c.width ?? 16, valueBits: c.value_bits ?? null, zero: c.zero ?? null, scaleNv: c.scale_nv ?? null,
           unit: c.unit ?? 'V', acquisition, values: analogValues(c, data) };
}

/**
 * An events channel's data (wireskein-format §4.4): per event, the quantum's distance from the last one's less 1
 * (unsigned LEB128; the first: its quantum), then a byte - bit 7 the level at the quantum's end, bits 0-6 the changes.
 * @param {{ name: string, n: number, events: number, start_level?: number }} c @param {Uint8Array} data
 */
function eventsOf(c, data) {
  const count = c.events;
  const quanta = new Float64Array(count), levels = new Uint8Array(count), counts = new Uint8Array(count);
  let i = 0, q = -1, level = c.start_level ? 1 : 0;
  for (let k = 0; k < count; k++) {
    let gap = 0, scale = 1, b;
    do {
      if (i >= data.length) throw new Error(`${c.name}: the data ends inside event ${k} of ${count}`);
      b = data[i++];
      gap += (b & 0x7f) * scale;                  // in multiplications: a gap past 2^31 stays exact
      scale *= 128;
    } while (b & 0x80);
    if (i >= data.length) throw new Error(`${c.name}: the data ends inside event ${k} of ${count}`);
    q += gap + 1;
    const state = data[i++];
    const lv = state >> 7, changes = state & 0x7f;
    if (q >= c.n || changes < 1 || (changes < 127 && lv !== (level ^ (changes & 1)))) {
      throw new Error(`${c.name}: event ${k} (quantum ${q}, level ${lv}, ${changes} changes) does not follow`);
    }
    quanta[k] = q;
    levels[k] = lv;
    counts[k] = changes;
    level = lv;
  }
  if (i !== data.length) throw new Error(`${c.name}: ${data.length - i} bytes past its ${count} events`);
  return { quanta, levels, counts };
}

/**
 * @param {{ name: string, encoding: string, n: number, width?: number }} c
 * @param {Uint8Array} data
 */
function analogValues(c, data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = new Float64Array(c.n);
  if (c.encoding === 'analog-f32') {
    if (data.length !== c.n * 4) throw new Error(`${c.name}: ${data.length} bytes for ${c.n} float32 samples`);
    for (let k = 0; k < c.n; k++) out[k] = view.getFloat32(k * 4, true);
    return out;
  }
  const width = c.width ?? 16;
  const size = width / 8;
  if (![1, 2, 4].includes(size) || data.length !== c.n * size) throw new Error(`${c.name}: ${data.length} bytes for ${c.n} ${width}-bit samples`);
  for (let k = 0; k < c.n; k++) {
    out[k] = size === 1 ? view.getUint8(k) : size === 2 ? view.getUint16(k * 2, true) : view.getUint32(k * 4, true);
  }
  return out;
}

/**
 * The level (0 or 1) of sample k of a logic channel.
 * @param {LogicChannel} ch
 * @param {number} k
 */
export function levelAt(ch, k) {
  return (ch.bits[k >> 3] >> (k & 7)) & 1;
}

/**
 * The ticks where a logic channel changes level (each is the tick of the first
 * sample of the new level; the change happened in the `step` ticks before it).
 * Bytes with no change in them are passed whole.
 * @param {LogicChannel} ch
 * @returns {number[]}
 */
export function edges(ch) {
  const out = [];
  if (!ch.n) return out;
  let level = ch.bits[0] & 1;
  const full = Math.floor(ch.n / 8);
  for (let b = 0; b < Math.ceil(ch.n / 8); b++) {
    const byte = ch.bits[b];
    if (b < full && byte === (level ? 0xff : 0x00)) continue;
    for (let k = b * 8; k < Math.min(ch.n, b * 8 + 8); k++) {
      const lv = (byte >> (k & 7)) & 1;
      if (lv !== level && k > 0) out.push(ch.phase + k * ch.step);
      level = lv;
    }
  }
  return out;
}

/**
 * The last event of an events channel at or before quantum q, or -1 (binary search).
 * @param {EventsChannel} ch @param {number} q
 */
export function eventIndex(ch, q) {
  let lo = 0, hi = ch.quanta.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ch.quanta[m] <= q) lo = m + 1; else hi = m; }
  return lo - 1;
}

/**
 * The level of an events channel at the end of quantum q (known there; inside a quantum with an event it is not).
 * @param {EventsChannel} ch @param {number} q
 */
export function levelAfter(ch, q) {
  const i = eventIndex(ch, q);
  return i >= 0 ? ch.levels[i] : ch.startLevel;
}

/**
 * The ticks where an events channel is known to be at a new level: the last tick of each quantum whose changes moved
 * it (an odd count), so the change happened somewhere in the `step` ticks up to it - wireskein's convention, the same
 * as a bit channel's edges at step 1. A quantum with an even count left it where it was.
 * @param {EventsChannel} ch
 * @returns {number[]}
 */
export function eventEdges(ch) {
  const out = [];
  let level = ch.startLevel;
  for (let k = 0; k < ch.quanta.length; k++) {
    if (ch.levels[k] !== level) out.push(ch.phase + ch.quanta[k] * ch.step + ch.step - 1);
    level = /** @type {0 | 1} */ (ch.levels[k]);
  }
  return out;
}

/**
 * The tick of sample k of an analog channel: t0Ticks + k * tickHz / rateHz.
 * @param {AnalogChannel} ch
 * @param {Ratio} tickHz
 * @param {number} k
 */
export function analogTick(ch, tickHz, k) {
  // one division, so whole ratios stay exact (416.75 ticks per sample, not 416.75000000000006)
  return ch.t0Ticks[0] / ch.t0Ticks[1] + (k * tickHz[0] * ch.rateHz[1]) / (tickHz[1] * ch.rateHz[0]);
}

/**
 * Volts of an analog channel, or null when the file has no conversion for it.
 * @param {AnalogChannel} ch
 * @returns {Float64Array | null}
 */
export function volts(ch) {
  if (ch.encoding === 'analog-f32') return ch.values;
  if (ch.zero === null || ch.scaleNv === null) return null;
  const zero = ch.zero;
  const scale = ch.scaleNv * 1e-9;
  return ch.values.map((v) => (v - zero) * scale);
}

/**
 * The end codes of a raw analog channel (OEP capture §1.2): the code 0 means the input was at or below the frontend's
 * low end, the top code (2^valueBits − 1) at or above its high end, so neither is a voltage. null when the file
 * cannot tell (volts only, no valueBits, or no conversion to volts).
 * @param {AnalogChannel} ch
 * @returns {{ low: number, high: number, lowV: number, highV: number } | null}   low / high: the end codes
 */
export function clipEnds(ch) {
  if (ch.encoding !== 'analog' || !ch.valueBits || ch.zero === null || ch.scaleNv === null) return null;
  const top = 2 ** ch.valueBits - 1;
  const v = (/** @type {number} */ code) => (code - /** @type {number} */ (ch.zero)) * /** @type {number} */ (ch.scaleNv) * 1e-9;
  // low / high: the codes at the low and high ends of the range; an inverting frontend (scaleNv < 0) swaps them
  return ch.scaleNv < 0 ? { low: top, high: 0, lowV: v(top), highV: v(0) } : { low: 0, high: top, lowV: v(0), highV: v(top) };
}
