// @ts-check
/**
 * The defined parts of a WireSkein file (wireskein-format §5.2, §5.3): markers and decoding annotations.
 * A part of a format this version does not know is not used (null).
 */

/** @typedef {import('./fileformat.js').Capture} Capture */

export const MARKERS_FORMAT = 'wireskein-markers/1';
export const ANNOTATIONS_FORMAT = 'wireskein-annotations/1';

/**
 * @typedef {object} Marker
 * @property {number} t          ticks
 * @property {number} [end]      ticks: a span when given
 * @property {string} label
 * @property {string} [note]
 * @property {string} [by]
 * @property {string} [time]
 * @property {number} [part]     the part its ticks are of (wireskein-format §5.2; none: part 0)
 */

/**
 * @typedef {object} AnnotationItem
 * @property {number} s
 * @property {number} [e]
 * @property {string} text
 * @property {'ok' | 'warn' | 'error'} [level]
 * @property {unknown} [detail]
 */

/**
 * @typedef {object} AnnotationRow
 * @property {string} name
 * @property {string} [near]     the channel it goes under
 * @property {string} [verdict]  how sure the analysis is ("confirmed", "likely", ...)
 * @property {number} [score]    0..1
 * @property {number} [part]     the part its ticks are of (wireskein-format §5.3; none: part 0)
 * @property {AnnotationItem[]} items
 */

/** @param {Uint8Array | undefined} data */
function json(data) {
  if (!data) return null;
  try { return JSON.parse(new TextDecoder().decode(data)); } catch { return null; }
}

/**
 * The markers in markers/markers.json ([] when there are none; null when of an unknown format).
 * @param {Capture} cap
 * @returns {Marker[] | null}
 */
export function readMarkers(cap) {
  const doc = json(cap.entries?.get('markers/markers.json'));
  if (doc === null) return cap.entries?.has('markers/markers.json') ? null : [];
  if (doc.format !== MARKERS_FORMAT || !Array.isArray(doc.markers)) return null;
  const out = doc.markers.filter((/** @type {any} */ m) => typeof m?.t === 'number' && typeof m?.label === 'string'
    && (m.part === undefined || Number.isInteger(m.part)));
  inParts(out, cap.parts.length, 'markers');
  return out;
}

/**
 * The rows in decode/annotations.json, or null.
 * @param {Capture | { format?: string, rows?: unknown }} source   a capture, or an annotations document
 * @returns {AnnotationRow[] | null}
 */
export function readAnnotations(source) {
  const doc = 'entries' in source ? json(/** @type {Capture} */ (source).entries?.get('decode/annotations.json')) : source;
  if (!doc || doc.format !== ANNOTATIONS_FORMAT || !Array.isArray(doc.rows)) return null;
  const out = doc.rows.filter((/** @type {any} */ r) => typeof r?.name === 'string' && Array.isArray(r.items)
    && (r.part === undefined || Number.isInteger(r.part)));
  if ('entries' in source) inParts(out, /** @type {Capture} */ (source).parts.length, 'annotation rows');
  return out;
}

/**
 * Every item of a part the file has (wireskein-format §5.2, §5.3: one of a part it does not have is refused).
 * @param {{ part?: number }[]} items @param {number} n @param {string} what
 */
function inParts(items, n, what) {
  const bad = items.filter((x) => (x.part ?? 0) < 0 || (x.part ?? 0) >= n);
  if (bad.length) throw new Error(`${what} of a part the file does not have (it has ${n}): ${bad.map(partOf).join(', ')}`);
}

/**
 * The part a marker or an annotation row belongs to (none: part 0).
 * @param {{ part?: number }} x
 */
export function partOf(x) {
  return x.part ?? 0;
}
