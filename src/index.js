// @ts-check
/**
 * wireskein-web: the browser side of WireSkein - reading WireSkein files (.wireskein) and sigrok .sr
 * and showing them. The analysis runs in the wireskein Python package; its
 * `wireskein gui` serves a build of this library.
 */

export const VERSION = '0.0.1';

export { ENCODINGS, FORMAT, analogTick, edges, levelAt, readWireskein, volts } from './fileformat.js';
export { readCapture, sniff } from './open.js';
export { readSr } from './sr.js';
export { listEntries, readEntry } from './zip.js';
