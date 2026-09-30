// @ts-check
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { levelAt, readCapture, sniff, volts } from '../src/index.js';
import { zipSync } from './zipwriter.js';

const fixture = readFileSync(new URL('./fixtures/mixed.sr', import.meta.url));   // written by wireskein (Python)

const levels = (/** @type {any} */ ch) => Array.from({ length: ch.n }, (_, k) => levelAt(ch, k));

test('a .sr written by wireskein gets its channels back at their own rates', async () => {
  assert.equal(await sniff(fixture), 'sr');
  const cap = await readCapture(fixture);
  assert.equal(cap.source, 'sr');
  assert.deepEqual(cap.tickHz, [20000000, 1]);
  assert.deepEqual(cap.channels.map((c) => c.name), ['CLK', 'SLOW', 'VBUS', 'SINE']);
  const [clk, slow, vbus, sine] = /** @type {any[]} */ (cap.channels);
  assert.deepEqual(levels(clk), Array.from({ length: 80 }, (_, k) => (k >> 1) & 1));
  assert.deepEqual(clk.acquisition, { pin: 47 });
  assert.equal(slow.step, 4);                                    // only the samples the probe took
  assert.deepEqual(levels(slow), Array.from({ length: 20 }, (_, k) => Math.floor(k / 3) & 1));
  assert.equal(vbus.encoding, 'analog');                         // the raw values come back
  assert.deepEqual(Array.from(vbus.values), [10, 20, 30, 40]);
  assert.deepEqual(vbus.t0Ticks, [5, 1]);
  assert.deepEqual(Array.from(volts(vbus) ?? []), [0.01, 0.02, 0.03, 0.04]);
  assert.equal(sine.encoding, 'analog-f32');
  assert.deepEqual(Array.from(sine.values), [0.25, -0.5]);
  assert.equal(new TextDecoder().decode(cap.attachments.get('setup.txt')), 'sr fixture');
  assert.equal(cap.notes[0].content, 'fixture for wireskein-web (.sr)');
  assert.deepEqual(/** @type {any} */ (cap.meta).probe, { chip: 'esp32p4' });
});

test('a plain .sr: named probes at the file rate, analog as volts', async () => {
  const f = new Float32Array([1.5, 2.5]);
  const bytes = zipSync({
    version: '2',
    metadata: '[device 1]\ncapturefile=logic-1\ntotal probes=8\nsamplerate=1 MHz\ntotal analog=1\n'
      + 'probe1=A\nprobe3=C\nanalog9=V\nunitsize=1\n',
    'logic-1-1': new Uint8Array([0b001, 0b100, 0b101]),
    'analog-1-9-1': new Uint8Array(f.buffer),
  });
  assert.equal(await sniff(bytes), 'sr');
  const cap = await readCapture(bytes);
  assert.deepEqual(cap.tickHz, [1000000, 1]);
  assert.deepEqual(cap.channels.map((c) => c.name), ['A', 'C', 'V']);
  assert.deepEqual(levels(cap.channels[0]), [1, 0, 1]);
  assert.deepEqual(levels(cap.channels[1]), [0, 1, 1]);
  assert.deepEqual(Array.from(/** @type {any} */ (cap.channels[2]).values), [1.5, 2.5]);
});

test('other files are refused', async () => {
  assert.equal(await sniff(new TextEncoder().encode('hello')), null);
  const zip = zipSync({ 'readme.txt': 'hi' });
  assert.equal(await sniff(zip), null);
  await assert.rejects(readCapture(zip), /neither a WireSkein file nor a sigrok session/);
});
