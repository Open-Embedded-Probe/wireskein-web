// @ts-check
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analogTick, edges, levelAt, readWireskein, VERSION, volts } from '../src/index.js';

const fixture = new URL('./fixtures/mixed.wireskein', import.meta.url);   // written by wireskein (Python)

test('reads logic channels with their own step', async () => {
  const cap = await readWireskein(readFileSync(fixture));
  assert.deepEqual(cap.tickHz, [20000000, 1]);
  assert.equal(cap.ticks, 2088);
  const [clk, slow] = cap.channels;
  assert.ok(clk.kind === 'logic' && slow.kind === 'logic');
  assert.deepEqual(clk.acquisition, { pin: 47 });
  assert.deepEqual([...Array(12).keys()].map((k) => levelAt(clk, k)), [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0]);
  assert.equal(slow.step, 4);
  assert.equal(slow.n, 50);
  assert.deepEqual(edges(slow).slice(0, 2), [12, 24]);          // sample 3 and 6, four ticks each
});

test('reads analog channels, raw and volts', async () => {
  const cap = await readWireskein(readFileSync(fixture));
  const vbus = cap.channels[2];
  const sine = cap.channels[3];
  assert.ok(vbus.kind === 'analog' && sine.kind === 'analog');
  assert.deepEqual([...vbus.values], [0, 1000, 4095, 2048, 7]);
  assert.deepEqual([vbus.valueBits, vbus.zero, vbus.scaleNv, vbus.width], [12, 12, 805860, 16]);
  assert.deepEqual(vbus.rateHz, [80000000, 1667]);
  assert.deepEqual(vbus.t0Ticks, [7, 2]);
  assert.equal(analogTick(vbus, cap.tickHz, 1), 3.5 + 416.75);
  assert.ok(Math.abs(/** @type {Float64Array} */ (volts(vbus))[2] - (4095 - 12) * 805860e-9) < 1e-9);
  assert.equal(sine.encoding, 'analog-f32');
  assert.deepEqual([...sine.values], [0, 0.5, -0.25, 1.5]);
});

test('meta, attachments and notes', async () => {
  const cap = await readWireskein(readFileSync(fixture));
  assert.equal(cap.meta.start_ns, 123456789);
  assert.equal(new TextDecoder().decode(cap.attachments.get('setup.txt')), '10k pull-ups');
  assert.equal(cap.notes[0].content, 'fixture for wireskein-web');
  assert.deepEqual(cap.skipped, []);
});

test('channels of unknown encodings are skipped, not misread', async () => {
  const { zipSync } = await import('./zipwriter.js');
  const head = { tick_hz: [1000, 1], ticks: 8,
                 channels: [{ name: 'A', file: 'ch/0.bits', encoding: 'bits', n: 8, step: 1, phase: 0 },
                            { name: 'E', file: 'ch/1.x', encoding: 'edges', n: 1 }], meta: {} };
  const bytes = zipSync({ 'wireskein.json': '{"format": "wireskein/0"}', 'capture.json': JSON.stringify(head), 'ch/0.bits': new Uint8Array([0b10100101]), 'ch/1.x': new Uint8Array(4) });
  const cap = await readWireskein(bytes);
  assert.deepEqual(cap.channels.map((c) => c.name), ['A']);
  assert.deepEqual(cap.skipped, [{ name: 'E', encoding: 'edges' }]);
});

test('another format is refused', async () => {
  const { zipSync } = await import('./zipwriter.js');
  await assert.rejects(readWireskein(zipSync({ 'wireskein.json': '{"format": "wireskein/9"}' })), /wireskein\/9/);
  await assert.rejects(readWireskein(zipSync({ 'capture.json': '{"format": "wireskein-capture/0"}' })), /not a WireSkein file/);
  await assert.rejects(readWireskein(zipSync({ 'wireskein.json': '{"format": "wireskein/0"}' })), /no capture/);
});

test('VERSION matches package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(VERSION, pkg.version);
});

test('an alignment from wireskein align is read, an unknown one is not', async () => {
  const { readAlignment, alignedTick } = await import('../src/index.js');
  const cap = await readWireskein(readFileSync(fixture));
  assert.equal(readAlignment(cap), null);
  const enc = (/** @type {unknown} */ o) => new TextEncoder().encode(JSON.stringify(o));
  cap.attachments.set('alignment.json', enc({ format: 'wireskein-alignment/0', channels: {
    VBUS: { offset_ticks: 100, scale: 1.001, reference: 'CLK', via: 'VBUS' } } }));
  const a = readAlignment(cap);
  assert.equal(a?.get('VBUS')?.scale, 1.001);
  const vbus = /** @type {any} */ (cap.channels.find((c) => c.name === 'VBUS'));
  assert.equal(alignedTick(vbus, cap.tickHz, 0, a?.get('VBUS')), 100 + 1.001 * 3.5);     // t0_ticks 7/2
  cap.attachments.set('alignment.json', enc({ format: 'wireskein-alignment/9', channels: {} }));
  assert.equal(readAlignment(cap), null);
});
