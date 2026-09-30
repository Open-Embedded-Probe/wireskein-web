// @ts-check
/**
 * Reading WireSkein files (.wireskein, format wireskein/0): a capture and what
 * goes with it. The format is specified in the wireskein repository,
 * docs/wireskein-format.ja.md. Files are told apart by their content
 * (wireskein.json), not their name.
 *
 * Time is counted in ticks of one clock per file (tickHz, a fraction). A logic
 * channel has a sample every `step` ticks from `phase`; an analog channel has
 * its own rate and first-sample time (t0Ticks). Only the samples a probe took
 * are stored, so a viewer can show exactly those.
 */

import { listEntries, readEntry } from './zip.js';

export const FORMAT = 'wireskein/0';
/** Encodings this version reads; channels of others are skipped (wireskein-format §3.2). */
export const ENCODINGS = new Set(['bits', 'analog', 'analog-f32']);

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

/**
 * @typedef {object} Capture
 * @property {Ratio} tickHz
 * @property {number} ticks
 * @property {Record<string, unknown>} meta
 * @property {(LogicChannel | AnalogChannel)[]} channels
 * @property {{ name: string, encoding: string }[]} skipped   channels of encodings this version does not read
 * @property {Map<string, Uint8Array>} attachments           attach/<name>
 * @property {{ time: string, content: unknown, [key: string]: unknown }[]} notes
 */

/**
 * Read a WireSkein file (any name). Throws on other files, on a format this
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
  if (format !== FORMAT) {
    throw new Error(`format ${JSON.stringify(format)}, this version reads ${JSON.stringify(FORMAT)} (a newer wireskein-web may read it)`);
  }
  if (!entries.has('capture.json')) throw new Error('the file holds no capture');
  const head = JSON.parse(await text('capture.json'));
  /** @type {(LogicChannel | AnalogChannel)[]} */
  const channels = [];
  const skipped = [];
  for (const c of head.channels) {
    if (!ENCODINGS.has(c.encoding)) {
      skipped.push({ name: c.name, encoding: c.encoding });
      continue;
    }
    const entry = entries.get(c.file);
    if (!entry) throw new Error(`${c.name}: ${c.file} is missing`);
    const data = await readEntry(bytes, entry);
    if (c.encoding === 'bits') {
      if (data.length !== Math.ceil(c.n / 8)) throw new Error(`${c.name}: ${data.length} bytes for ${c.n} samples`);
      channels.push({ kind: 'logic', name: c.name, n: c.n, step: c.step, phase: c.phase,
                      acquisition: c.acquisition ?? {}, bits: data });
    } else {
      channels.push({ kind: 'analog', name: c.name, encoding: c.encoding, n: c.n, rateHz: c.rate_hz,
                      t0Ticks: c.t0_ticks, width: c.width ?? 16, valueBits: c.value_bits ?? null,
                      zero: c.zero ?? null, scaleNv: c.scale_nv ?? null, unit: c.unit ?? 'V',
                      acquisition: c.acquisition ?? {}, values: analogValues(c, data) });
    }
  }
  /** @type {Map<string, Uint8Array>} */
  const attachments = new Map();
  const notes = [];
  for (const [name, entry] of entries) {
    if (name.startsWith('attach/')) attachments.set(name.slice(7), await readEntry(bytes, entry));
  }
  for (const name of [...entries.keys()].filter((x) => x.startsWith('notes/')).sort()) {
    notes.push(JSON.parse(await text(name)));
  }
  return { tickHz: head.tick_hz, ticks: head.ticks, meta: head.meta ?? {}, channels, skipped, attachments, notes };
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
 * @param {LogicChannel} ch
 * @returns {number[]}
 */
export function edges(ch) {
  const out = [];
  for (let k = 1; k < ch.n; k++) {
    if (levelAt(ch, k) !== levelAt(ch, k - 1)) out.push(ch.phase + k * ch.step);
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
