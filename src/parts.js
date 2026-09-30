// @ts-check
/**
 * The defined parts of a WireSkein file (wireskein-format §5.2, §5.3): markers and decoding annotations.
 * A part of a format this version does not know is not used (null).
 */

/** @typedef {import('./fileformat.js').Capture} Capture */

export const MARKERS_FORMAT = 'wireskein-markers/0';
export const ANNOTATIONS_FORMAT = 'wireskein-annotations/0';

/**
 * @typedef {object} Marker
 * @property {number} t          ticks
 * @property {number} [end]      ticks: a span when given
 * @property {string} label
 * @property {string} [note]
 * @property {string} [by]
 * @property {string} [time]
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
  const doc = json(cap.parts?.get('markers/markers.json'));
  if (doc === null) return cap.parts?.has('markers/markers.json') ? null : [];
  if (doc.format !== MARKERS_FORMAT || !Array.isArray(doc.markers)) return null;
  return doc.markers.filter((/** @type {any} */ m) => typeof m?.t === 'number' && typeof m?.label === 'string');
}

/**
 * The rows in decode/annotations.json, or null.
 * @param {Capture | { format?: string, rows?: unknown }} source   a capture, or an annotations document
 * @returns {AnnotationRow[] | null}
 */
export function readAnnotations(source) {
  const doc = 'parts' in source ? json(/** @type {Capture} */ (source).parts?.get('decode/annotations.json')) : source;
  if (!doc || doc.format !== ANNOTATIONS_FORMAT || !Array.isArray(doc.rows)) return null;
  return doc.rows.filter((/** @type {any} */ r) => typeof r?.name === 'string' && Array.isArray(r.items));
}
