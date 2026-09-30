// @ts-check
/**
 * wireskein-web: the browser side of WireSkein - reading capture files (.wsc)
 * and showing them. The analysis runs in the wireskein Python package; its
 * `wireskein gui` serves a build of this library.
 */

export const VERSION = '0.0.1';

export { ENCODINGS, FORMAT, analogTick, edges, levelAt, readWsc, volts } from './wsc.js';
export { listEntries, readEntry } from './zip.js';
