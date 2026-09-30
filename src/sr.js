// @ts-check
/**
 * Reading sigrok session files (.sr) into the same Capture as readWireskein.
 *
 * A .sr has one sample rate for all channels: logic samples interleaved,
 * `unitsize` bytes per sample (bit k = probe k+1), analog as float32 volts. A
 * .sr written by wireskein also holds wireskein.json ("wireskein-sr-extra/0"):
 * each channel's real step / phase, the exact tick clock, the metadata and the
 * raw analog values. With it, the channels get their own rate back (only the
 * samples the probe took); without it, every channel is at the .sr's rate.
 */

import { listEntries, readEntry } from './zip.js';

/** @typedef {import('./fileformat.js').Capture} Capture */
/** @typedef {import('./fileformat.js').LogicChannel} LogicChannel */
/** @typedef {import('./fileformat.js').AnalogChannel} AnalogChannel */
/** @typedef {import('./fileformat.js').Ratio} Ratio */

const UNITS = /** @type {Record<string, number>} */ ({ hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 });

/** @param {string} text e.g. "20 MHz" */
function parseRate(text) {
  const m = /^\s*([\d.]+)\s*([kmg]?hz)\s*$/i.exec(text);
  if (!m) throw new Error(`unknown samplerate ${JSON.stringify(text)}`);
  return Number(m[1]) * UNITS[m[2].toLowerCase()];
}

/** The [device 1] section of the metadata (an INI file). @param {string} text */
function device(text) {
  /** @type {Record<string, string>} */
  const out = {};
  let inside = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) { inside = line === '[device 1]'; continue; }
    const eq = line.indexOf('=');
    if (inside && eq > 0) out[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
  }
  return out;
}

/** The number at the end of a chunk name ("logic-1-12" -> 12; "logic-1" -> 0). @param {string} name */
const part = (name) => Number(/-(\d+)$/.exec(name)?.[1] ?? 0);

/** @param {Uint8Array[]} chunks */
function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** @param {number} x @returns {Ratio} */
function ratio(x) {
  if (Number.isInteger(x)) return [x, 1];
  for (let d = 1; d <= 1e6; d *= 10) if (Number.isInteger(x * d)) return [Math.round(x * d), d];
  return [Math.round(x), 1];
}

/**
 * Read a sigrok session file.
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {Promise<Capture>}
 */
export async function readSr(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const entries = listEntries(bytes);
  const read = async (/** @type {string} */ name) => {
    const entry = entries.get(name);
    if (!entry) throw new Error(`${name} is missing`);
    return readEntry(bytes, entry);
  };
  const text = async (/** @type {string} */ name) => new TextDecoder().decode(await read(name));
  if (!entries.has('metadata')) throw new Error('not a sigrok session (no metadata)');
  const dev = device(await text('metadata'));
  if (!dev.samplerate) throw new Error('the .sr has no samplerate');
  const unitsize = Number(dev.unitsize ?? 1);
  const prefix = dev.capturefile ?? 'logic-1';
  const extra = entries.has('wireskein.json') ? JSON.parse(await text('wireskein.json')) : {};
  /** @type {Ratio} */
  const tickHz = extra.tick_hz ?? ratio(parseRate(dev.samplerate));

  const names = new Map();                 // bit -> name, of the named probes
  const anames = new Map();                // analog index -> name
  for (const [k, v] of Object.entries(dev)) {
    if (/^probe\d+$/.test(k)) names.set(Number(k.slice(5)) - 1, v);
    if (/^analog\d+$/.test(k)) anames.set(Number(k.slice(6)), v);
  }
  const chunks = [...entries.keys()].filter((n) => n === prefix || n.startsWith(`${prefix}-`)).sort((a, b) => part(a) - part(b));
  const logic = concat(await Promise.all(chunks.map(read)));
  const nSamples = Math.floor(logic.length / unitsize);

  /** @type {Map<number, Float32Array>} */
  const avals = new Map();
  for (const idx of anames.keys()) {
    const parts = [...entries.keys()].filter((n) => n.startsWith(`analog-1-${idx}-`)).sort((a, b) => part(a) - part(b));
    const data = concat(await Promise.all(parts.map(read)));
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const v = new Float32Array(Math.floor(data.length / 4));
    for (let k = 0; k < v.length; k++) v[k] = view.getFloat32(k * 4, true);
    avals.set(idx, v);
  }
  const ticks = nSamples || Math.max(0, ...[...avals.values()].map((v) => v.length));

  // Every declared probe is a channel when none is named; when some are, only those (sigrok names the ones it took).
  const total = Number(dev['total probes'] ?? unitsize * 8);
  const bits = names.size ? [...names.keys()].sort((a, b) => a - b)
    : [...Array(Math.min(total, unitsize * 8)).keys()];
  /** @type {(LogicChannel | AnalogChannel)[]} */
  const channels = [];
  for (const bit of bits) {
    if (bit >= unitsize * 8) continue;
    const name = names.get(bit) ?? `bit${bit}`;
    const own = extra.channels?.[name] ?? {};
    const step = Number(own.step ?? 1), phase = Number(own.phase ?? 0);
    const n = Math.max(0, Math.ceil((nSamples - phase) / step));
    const out = new Uint8Array(Math.ceil(n / 8));
    const byte = bit >> 3, mask = 1 << (bit & 7);
    for (let k = 0; k < n; k++) {
      if (logic[(phase + k * step) * unitsize + byte] & mask) out[k >> 3] |= 1 << (k & 7);
    }
    channels.push({ kind: 'logic', name, n, step, phase, acquisition: own.acquisition ?? {}, bits: out });
  }
  for (const [idx, name] of [...anames].sort((a, b) => a[0] - b[0])) {
    const info = extra.analog?.[name];
    const base = { kind: /** @type {'analog'} */ ('analog'), name, width: 16, valueBits: null, zero: null, scaleNv: null,
                   unit: 'V', acquisition: {} };
    if (info?.file && entries.has(info.file)) {            // written by wireskein: the raw values come back
      const data = await read(info.file);
      const size = info.width / 8;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const values = new Float64Array(Math.floor(data.length / size));
      for (let k = 0; k < values.length; k++) {
        values[k] = size === 1 ? view.getUint8(k) : size === 2 ? view.getUint16(k * 2, true) : view.getUint32(k * 4, true);
      }
      channels.push({ ...base, encoding: 'analog', n: values.length, rateHz: info.rate_hz, t0Ticks: info.t0_ticks,
                      width: info.width, valueBits: info.value_bits ?? null, zero: info.zero ?? null,
                      scaleNv: info.scale_nv ?? null, acquisition: info.acquisition ?? {}, values });
    } else if (info) {                                     // volts written by wireskein: its own rate again
      const per = Math.round((tickHz[0] * info.rate_hz[1]) / (tickHz[1] * info.rate_hz[0]));
      const t0 = Math.round(info.t0_ticks[0] / info.t0_ticks[1]);
      const all = avals.get(idx) ?? new Float32Array(0);
      const values = new Float64Array(info.n);
      for (let k = 0; k < info.n; k++) values[k] = all[t0 + k * per] ?? NaN;
      channels.push({ ...base, encoding: 'analog-f32', n: info.n, rateHz: info.rate_hz, t0Ticks: info.t0_ticks,
                      unit: info.unit ?? 'V', acquisition: info.acquisition ?? {}, values });
    } else {
      const values = Float64Array.from(avals.get(idx) ?? []);
      channels.push({ ...base, encoding: 'analog-f32', n: values.length, rateHz: tickHz, t0Ticks: [0, 1], values });
    }
  }

  /** @type {Map<string, Uint8Array>} */
  const attachments = new Map();
  const notes = [];
  for (const name of entries.keys()) {
    if (name.startsWith('attach/')) attachments.set(name.slice(7), await read(name));
  }
  for (const name of [...entries.keys()].filter((x) => x.startsWith('notes/')).sort()) notes.push(JSON.parse(await text(name)));
  const meta = { ...(extra.meta ?? {}), sr: { samplerate: dev.samplerate, unitsize } };
  return { tickHz, ticks, meta, channels, skipped: [], attachments, notes };
}
