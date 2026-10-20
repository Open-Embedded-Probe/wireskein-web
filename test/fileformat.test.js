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
  const head = { tick_hz: [1000, 1], layout: 'timeline', complete: true, meta: {},
                 parts: [{ ticks: 8, tick0: 0, meta: {},
                           channels: [{ name: 'A', file: 'part/0/ch/0.bits', encoding: 'bits', n: 8, step: 1, phase: 0 },
                                      { name: 'E', file: 'part/0/ch/1.x', encoding: 'edges', n: 1 }] }] };
  const bytes = zipSync({ 'wireskein.json': '{"format": "wireskein/1"}', 'capture.json': JSON.stringify(head),
                          'part/0/ch/0.bits': new Uint8Array([0b10100101]), 'part/0/ch/1.x': new Uint8Array(4) });
  const cap = await readWireskein(bytes);
  assert.deepEqual(cap.channels.map((c) => c.name), ['A']);
  assert.deepEqual(cap.skipped, [{ name: 'E', encoding: 'edges' }]);
});

test('another format is refused', async () => {
  const { zipSync } = await import('./zipwriter.js');
  await assert.rejects(readWireskein(zipSync({ 'wireskein.json': '{"format": "wireskein/9"}' })), /wireskein\/9/);
  await assert.rejects(readWireskein(zipSync({ 'wireskein.json': '{"format": "wireskein/0"}' })), /a beta WireSkein file/);
  await assert.rejects(readWireskein(zipSync({ 'capture.json': '{"format": "wireskein-capture/0"}' })), /not a WireSkein file/);
  await assert.rejects(readWireskein(zipSync({ 'wireskein.json': '{"format": "wireskein/1"}' })), /no capture/);
  await assert.rejects(readWireskein(zipSync({ 'wireskein.json': '{"format": "wireskein/1"}',
                                               'capture.json': '{"tick_hz": [1, 1], "ticks": 0, "channels": []}' })), /no parts/);
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

test('a capture from another probe goes onto the reference ticks', async () => {
  const { fileAlignment, onto, edges: edgesOf } = await import('../src/index.js');
  const A = await readWireskein(readFileSync(new URL('./fixtures/probeA.wireskein', import.meta.url)));
  const B = await readWireskein(readFileSync(new URL('./fixtures/probeB.wireskein', import.meta.url)));
  const { entry, why } = await fileAlignment(B, A, 'probeA.wireskein');
  assert.ok(entry, why);
  const [sync, v] = /** @type {any[]} */ (onto(A, B, entry, 'B:'));
  assert.equal(sync.name, 'B:SYNC');
  const a = edgesOf(/** @type {any} */ (A.channels[0]));
  const b = edgesOf(sync);
  // each of B's edges lands within a sample or two of A's (A: 0.5 us ticks, B: 1 us samples)
  for (const e of b.slice(0, 20)) {
    const near = a.reduce((m, x) => Math.min(m, Math.abs(x - e)), Infinity);
    assert.ok(near <= 3, `B edge at ${e} is ${near} ticks from A's`);
  }
  assert.ok(Math.abs(v.t0Ticks[0] / v.t0Ticks[1] - (entry.offset_ticks + entry.scale * 5000)) < 1e-3);
  assert.equal((await fileAlignment(B, B, 'probeA.wireskein')).entry, null);     // another file under that name
});

test('events channels: changes per quantum, and the trigger in the part', async () => {
  const { eventEdges, levelAfter } = await import('../src/index.js');
  const cap = await readWireskein(readFileSync(new URL('./fixtures/events.wireskein', import.meta.url)));   // wireskein (Python)
  const [clk, fast, slow] = cap.channels;
  assert.ok(clk.kind === 'logic' && fast.kind === 'events' && slow.kind === 'events');
  assert.deepEqual([fast.step, fast.n, fast.startLevel], [1, 64, 0]);
  assert.deepEqual([...fast.quanta], [3, 10, 11, 40]);
  assert.deepEqual(eventEdges(fast), [3, 10, 11, 40]);          // at step 1, a bit channel's edges
  assert.deepEqual([slow.step, slow.n], [4, 256]);
  assert.deepEqual([...slow.quanta], [2, 5, 9, 200]);
  assert.deepEqual([...slow.levels], [1, 1, 0, 1]);
  assert.deepEqual([...slow.counts], [1, 2, 127, 1]);
  assert.deepEqual(eventEdges(slow), [11, 39, 803]);             // each quantum's last tick; quantum 5 changed twice: back
  assert.deepEqual([levelAfter(slow, 1), levelAfter(slow, 2), levelAfter(slow, 8), levelAfter(slow, 9)], [0, 1, 1, 0]);
  assert.deepEqual(slow.acquisition, { pin: 6 });
  assert.equal(cap.meta.trigger_tick, 12);
});

test('an events channel whose data does not follow is refused', async () => {
  const { zipSync } = await import('./zipwriter.js');
  const file = (/** @type {number[]} */ data, events = 1) => zipSync({ 'wireskein.json': '{"format": "wireskein/1"}',
    'capture.json': JSON.stringify({ tick_hz: [1, 1], layout: 'timeline', complete: true, meta: {}, parts: [{ ticks: 8, tick0: 0, meta: {},
      channels: [{ name: 'E', file: 'part/0/ch/0.events', encoding: 'events', n: 8, step: 1, phase: 0, start_level: 0, events }] }] }),
    'part/0/ch/0.events': new Uint8Array(data) });
  assert.equal((await readWireskein(file([2, 0x81]))).channels.length, 1);    // quantum 2: one change to 1
  await assert.rejects(readWireskein(file([2, 0x01])), /does not follow/);   // one change from 0 cannot end at 0
  await assert.rejects(readWireskein(file([9, 0x81])), /does not follow/);   // past the channel's 8 quanta
  await assert.rejects(readWireskein(file([2])), /ends inside event 0/);
  await assert.rejects(readWireskein(file([2, 0x81, 0])), /bytes past its 1 events/);
});

test('a timeline cut by a loss: two parts at their tick0, the capture failed', async () => {
  const { selectPart } = await import('../src/index.js');
  const cap = await readWireskein(readFileSync(new URL('./fixtures/timeline.wireskein', import.meta.url)));
  assert.equal(cap.layout, 'timeline');
  assert.equal(cap.complete, false);
  assert.deepEqual(cap.lost, [{ afterPart: 0, ticks: 50, reason: 'probe dropped a segment (no room)', stopped: false }]);
  assert.deepEqual(cap.parts.map((p) => [p.ticks, p.tick0]), [[100, 0], [100, 150]]);
  assert.equal(cap.part, 0);
  assert.equal(cap.meta.start_ns, 1000);
  const second = selectPart(cap, 1);
  assert.equal(second.meta.start_ns, 151000);
  const a = /** @type {any} */ (second.channels[0]);
  assert.deepEqual([0, 1, 2].map((k) => levelAt(a, k)), [0, 0, 1]);     // (150 + k) >> 3 & 1: 18, 18, 19
  assert.throws(() => selectPart(cap, 2), /part 2/);
});

test('segments: each acquisition its own part, trigger and time', async () => {
  const { selectPart } = await import('../src/index.js');
  const cap = await readWireskein(readFileSync(new URL('./fixtures/segments.wireskein', import.meta.url)));
  assert.equal(cap.layout, 'segments');
  assert.equal(cap.complete, true);
  assert.equal(cap.parts.length, 3);
  for (let k = 0; k < 3; k++) {
    const p = selectPart(cap, k);
    assert.equal(p.meta.trigger_tick, 20);
    assert.equal(p.meta.start_ns, 10_000_000 * k);
    assert.deepEqual(edges(/** @type {any} */ (p.channels[0])), [20, 30 + 10 * k]);
  }
});

test('markers and annotation rows name their part (none: part 0)', async () => {
  const { partOf, readAnnotations, readMarkers } = await import('../src/index.js');
  const cap = await readWireskein(readFileSync(fixture));
  const enc = (/** @type {unknown} */ o) => new TextEncoder().encode(JSON.stringify(o));
  cap.entries.set('markers/markers.json', enc({ format: 'wireskein-markers/0', markers: [
    { t: 5, label: 'a' }, { t: 7, label: 'b', part: 2 }, { t: 9, label: 'c', part: 'x' }] }));
  assert.deepEqual(readMarkers(cap)?.map((m) => [m.label, partOf(m)]), [['a', 0], ['b', 2]]);
  const rows = readAnnotations({ format: 'wireskein-annotations/0', rows: [{ name: 'uart', part: 1, items: [] }] });
  assert.deepEqual(rows?.map(partOf), [1]);
});

test('edges skip whole bytes without a change', () => {
  const n = 8 * 1000 + 3;
  const bits = new Uint8Array(Math.ceil(n / 8));
  bits.fill(0xff, 500, 700);                       // high from sample 4000 to 5600
  bits[1000] = 0b101;
  const ch = /** @type {any} */ ({ kind: 'logic', name: 'X', n, step: 2, phase: 1, acquisition: {}, bits });
  assert.deepEqual(edges(ch), [1 + 4000 * 2, 1 + 5600 * 2, 1 + 8000 * 2, 1 + 8001 * 2, 1 + 8002 * 2]);
});
