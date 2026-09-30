// @ts-check
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mod = await import(pathToFileURL(join(root, 'dist', 'wireskein-web.js')).href);
const cap = await mod.readWireskein(readFileSync(join(root, 'test', 'fixtures', 'mixed.wireskein')));
if (cap.channels.length !== 4 || cap.channels[0].name !== 'CLK') throw new Error('dist smoke: .wireskein read failed');
const sr = await mod.readCapture(readFileSync(join(root, 'test', 'fixtures', 'mixed.sr')));
if (sr.source !== 'sr' || sr.channels[1].step !== 4) throw new Error('dist smoke: .sr read failed');
console.log(`dist smoke ok (v${mod.VERSION})`);
