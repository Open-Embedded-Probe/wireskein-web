// @ts-check
/**
 * A minimal zip reader for .wsc files: stored and deflate entries, no ZIP64.
 * Deflate is undone with the platform's DecompressionStream ("deflate-raw"),
 * available in current browsers and Node.js 22, so nothing is bundled for it.
 */

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/**
 * @typedef {object} ZipEntry
 * @property {string} name
 * @property {number} method       0 stored, 8 deflate
 * @property {number} size         compressed size
 * @property {number} length       uncompressed size
 * @property {number} offset       local header offset
 */

/**
 * The entries of a zip archive, by name.
 * @param {Uint8Array} bytes
 * @returns {Map<string, ZipEntry>}
 */
export function listEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) { end = i; break; }
  }
  if (end < 0) throw new Error('not a zip file (no end of central directory)');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (at === 0xffffffff || count === 0xffff) throw new Error('ZIP64 archives are not supported');
  const decoder = new TextDecoder();
  /** @type {Map<string, ZipEntry>} */
  const entries = new Map();
  for (let k = 0; k < count; k++) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error('broken central directory');
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const length = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.set(name, { name, method, size, length, offset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * The uncompressed bytes of one entry.
 * @param {Uint8Array} bytes
 * @param {ZipEntry} entry
 * @returns {Promise<Uint8Array>}
 */
export async function readEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== LOCAL) throw new Error(`broken local header for ${entry.name}`);
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const data = bytes.subarray(start, start + entry.size);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new Error(`${entry.name}: compression method ${entry.method} is not supported`);
  const stream = new Blob([/** @type {BlobPart} */ (data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  if (out.length !== entry.length) throw new Error(`${entry.name}: ${out.length} bytes inflated, expected ${entry.length}`);
  return out;
}
