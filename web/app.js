// @ts-check
import { analogTick, levelAt, readWsc, VERSION, volts } from './wireskein-web.js';

/** @typedef {import('../src/wsc.js').Capture} Capture */
/** @typedef {import('../src/wsc.js').LogicChannel} LogicChannel */
/** @typedef {import('../src/wsc.js').AnalogChannel} AnalogChannel */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const LOGIC_H = 40;
const ANALOG_H = 80;
const DOT_PX = 6;          // draw sample dots when samples are at least this far apart

/** @type {{ cap: Capture, t0: number, t1: number } | null} */
let state = null;

async function open(/** @type {File | { name: string, arrayBuffer: () => Promise<ArrayBuffer> }} */ file) {
  try {
    const cap = await readWsc(new Uint8Array(await file.arrayBuffer()));
    state = { cap, t0: 0, t1: Math.max(1, cap.ticks) };
    const view = new URLSearchParams(location.search).get('view')?.split(',').map(Number);   // &view=T0,T1 in ticks
    if (view?.length === 2 && view.every(Number.isFinite) && view[1] > view[0]) [state.t0, state.t1] = view;
    showSummary(file.name, cap);
    buildLanes(cap);
    draw();
  } catch (error) {
    $('summary').hidden = false;
    $('summary').textContent = `${file.name}: ${error instanceof Error ? error.message : error}`;
  }
}

const hz = (/** @type {[number, number]} */ r) => r[0] / r[1];

function fmtTime(/** @type {number} */ s) {
  const a = Math.abs(s);
  if (a >= 1) return `${s.toFixed(3)} s`;
  if (a >= 1e-3) return `${(s * 1e3).toFixed(3)} ms`;
  if (a >= 1e-6) return `${(s * 1e6).toFixed(3)} µs`;
  return `${(s * 1e9).toFixed(1)} ns`;
}

function fmtHz(/** @type {number} */ f) {
  return f >= 1e6 ? `${(f / 1e6).toPrecision(6)} MHz` : f >= 1e3 ? `${(f / 1e3).toPrecision(6)} kHz` : `${f.toPrecision(6)} Hz`;
}

function showSummary(/** @type {string} */ name, /** @type {Capture} */ cap) {
  const tick = hz(cap.tickHz);
  const el = $('summary');
  el.hidden = false;
  el.innerHTML = '';
  const h = document.createElement('div');
  h.innerHTML = `<b></b> · ${cap.channels.length} channels · ${fmtTime(cap.ticks / tick)} · tick ${fmtHz(tick)}`;
  /** @type {HTMLElement} */ (h.querySelector('b')).textContent = name;
  el.append(h);
  if (cap.skipped.length) {
    const s = document.createElement('div');
    s.textContent = `Not shown (encodings this viewer does not read): ${cap.skipped.map((/** @type {{name: string, encoding: string}} */ c) => `${c.name} (${c.encoding})`).join(', ')}`;
    el.append(s);
  }
  const d = $('details');
  d.hidden = false;
  d.innerHTML = '';
  const rows = [['meta', JSON.stringify(cap.meta)]];
  for (const c of cap.channels) {
    if (Object.keys(c.acquisition).length) rows.push([`${c.name} acquisition`, JSON.stringify(c.acquisition)]);
  }
  for (const [n, data] of cap.attachments) rows.push([`attach/${n}`, `${data.length} bytes`]);
  cap.notes.forEach((/** @type {Capture['notes'][number]} */ n, /** @type {number} */ k) => rows.push([`note ${k + 1} ${n.time}`, typeof n.content === 'string' ? n.content : JSON.stringify(n.content)]));
  const table = document.createElement('table');
  for (const [k, v] of rows) {
    const tr = table.insertRow();
    tr.insertCell().textContent = k;
    const code = document.createElement('code');
    code.textContent = v;
    tr.insertCell().append(code);
  }
  d.append(table);
}

function buildLanes(/** @type {Capture} */ cap) {
  const lanes = $('lanes');
  lanes.innerHTML = '';
  $('view').hidden = false;
  $('drop').hidden = true;
  const tick = hz(cap.tickHz);
  for (const [i, ch] of cap.channels.entries()) {
    const lane = document.createElement('div');
    lane.className = 'lane';
    lane.style.height = `${ch.kind === 'logic' ? LOGIC_H : ANALOG_H}px`;
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = ch.name;
    const small = document.createElement('small');
    small.textContent = ch.kind === 'logic'
      ? `${fmtHz(tick / ch.step)}${ch.step > 1 ? ` (1/${ch.step})` : ''}`
      : `${fmtHz(hz(ch.rateHz))} ${ch.encoding === 'analog' ? 'raw' : ch.unit}`;
    name.append(small);
    const canvas = document.createElement('canvas');
    canvas.dataset.index = String(i);
    canvas.style.height = lane.style.height;       // a fixed CSS size; draw() sets the backing store
    lane.append(name, canvas);
    lanes.append(lane);
    attachInput(canvas);
  }
}

function draw() {
  if (!state) return;
  const { cap, t0, t1 } = state;
  for (const canvas of /** @type {NodeListOf<HTMLCanvasElement>} */ (document.querySelectorAll('#lanes canvas'))) {
    const ch = cap.channels[Number(canvas.dataset.index)];
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    g.scale(ratio, ratio);
    const style = getComputedStyle(document.body);
    const line = style.getPropertyValue('--line').trim();
    const band = style.getPropertyValue('--band').trim();
    const x = (/** @type {number} */ t) => ((t - t0) / (t1 - t0)) * w;
    if (ch.kind === 'logic') drawLogic(g, ch, x, t0, t1, w, h, line, band);
    else drawAnalog(g, ch, cap, x, t0, t1, w, h, line);
  }
}

/**
 * @param {CanvasRenderingContext2D} g @param {LogicChannel} ch @param {(t: number) => number} x
 * @param {number} t0 @param {number} t1 @param {number} w @param {number} h @param {string} line @param {string} band
 */
function drawLogic(g, ch, x, t0, t1, w, h, line, band) {
  const y = (/** @type {number} */ v) => (v ? 4 : h - 4);
  const k0 = Math.max(0, Math.floor((t0 - ch.phase) / ch.step) - 1);
  const k1 = Math.min(ch.n - 1, Math.ceil((t1 - ch.phase) / ch.step) + 1);
  const pxPerSample = (ch.step / (t1 - t0)) * w;
  g.strokeStyle = line;
  g.fillStyle = line;
  g.lineWidth = 1.5;
  if (pxPerSample < 0.5) {
    // many samples per pixel: per pixel column, low / high / both
    for (let px = 0; px < w; px++) {
      const a = Math.max(k0, Math.floor((t0 + (px / w) * (t1 - t0) - ch.phase) / ch.step));
      const b = Math.min(k1, Math.ceil((t0 + ((px + 1) / w) * (t1 - t0) - ch.phase) / ch.step));
      let lo = 1, hi = 0;
      for (let k = a; k <= b; k++) { const v = levelAt(ch, k); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (b < a) continue;
      g.fillRect(px, y(hi) - 0.75, 1, y(lo) - y(hi) + 1.5);
    }
    return;
  }
  g.beginPath();
  let prev = levelAt(ch, k0);
  g.moveTo(x(ch.phase + k0 * ch.step), y(prev));
  for (let k = k0 + 1; k <= k1; k++) {
    const v = levelAt(ch, k);
    const t = ch.phase + k * ch.step;
    if (v !== prev) {
      if (ch.step > 1) {                 // the change happened somewhere in the step before this sample
        g.save(); g.fillStyle = band; g.fillRect(x(t - ch.step), 0, x(t) - x(t - ch.step), h); g.restore();
      }
      g.lineTo(x(t), y(prev));
      g.lineTo(x(t), y(v));
      prev = v;
    }
  }
  g.lineTo(x(ch.phase + (k1 + 1) * ch.step), y(prev));
  g.stroke();
  if (pxPerSample >= DOT_PX) {           // the samples the probe took
    for (let k = k0; k <= k1; k++) {
      g.beginPath();
      g.arc(x(ch.phase + k * ch.step), y(levelAt(ch, k)), 2, 0, 2 * Math.PI);
      g.fill();
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} g @param {AnalogChannel} ch @param {Capture} cap @param {(t: number) => number} x
 * @param {number} t0 @param {number} t1 @param {number} w @param {number} h @param {string} line
 */
function drawAnalog(g, ch, cap, x, t0, t1, w, h, line) {
  const v = volts(ch) ?? ch.values;
  if (!v.length) return;
  let lo = Infinity, hi = -Infinity;
  for (const s of v) { if (Number.isFinite(s)) { lo = Math.min(lo, s); hi = Math.max(hi, s); } }
  if (hi === lo) { hi += 1; lo -= 1; }
  const y = (/** @type {number} */ s) => h - 4 - ((s - lo) / (hi - lo)) * (h - 8);
  const per = hz(cap.tickHz) / hz(ch.rateHz);
  const start = analogTick(ch, cap.tickHz, 0);
  const k0 = Math.max(0, Math.floor((t0 - start) / per) - 1);
  const k1 = Math.min(v.length - 1, Math.ceil((t1 - start) / per) + 1);
  g.strokeStyle = line;
  g.fillStyle = line;
  g.lineWidth = 1.5;
  g.beginPath();
  let drawing = false;
  for (let k = k0; k <= k1; k++) {
    if (!Number.isFinite(v[k])) { drawing = false; continue; }
    const px = x(start + k * per);
    if (drawing) g.lineTo(px, y(v[k])); else g.moveTo(px, y(v[k]));
    drawing = true;
  }
  g.stroke();
  if ((per / (t1 - t0)) * w >= DOT_PX) {
    for (let k = k0; k <= k1; k++) {
      if (!Number.isFinite(v[k])) continue;
      g.beginPath();
      g.arc(x(start + k * per), y(v[k]), 2, 0, 2 * Math.PI);
      g.fill();
    }
  }
}

function attachInput(/** @type {HTMLCanvasElement} */ canvas) {
  canvas.addEventListener('wheel', (event) => {
    if (!state) return;
    event.preventDefault();
    const at = state.t0 + (event.offsetX / canvas.clientWidth) * (state.t1 - state.t0);
    const f = event.deltaY > 0 ? 1.25 : 0.8;
    const span = Math.max(4, (state.t1 - state.t0) * f);
    state.t0 = at - (at - state.t0) * (span / (state.t1 - state.t0));
    state.t1 = state.t0 + span;
    draw();
  }, { passive: false });
  let from = /** @type {number | null} */ (null);
  canvas.addEventListener('pointerdown', (event) => { from = event.clientX; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointerup', () => { from = null; });
  canvas.addEventListener('pointermove', (event) => {
    if (!state || from === null) return;
    const dt = ((from - event.clientX) / canvas.clientWidth) * (state.t1 - state.t0);
    state.t0 += dt;
    state.t1 += dt;
    from = event.clientX;
    draw();
  });
  canvas.addEventListener('dblclick', () => {
    if (!state) return;
    state.t0 = 0;
    state.t1 = Math.max(1, state.cap.ticks);
    draw();
  });
}

const drop = $('drop');
for (const target of [document.body]) {
  target.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('over'); });
  target.addEventListener('dragleave', () => drop.classList.remove('over'));
  target.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('over');
    const file = event.dataTransfer?.files[0];
    if (file) open(file);
  });
}
$('file').addEventListener('change', (event) => {
  const file = /** @type {HTMLInputElement} */ (event.target).files?.[0];
  if (file) open(file);
});
window.addEventListener('resize', draw);

// ?file=URL opens that capture (same origin), e.g. from `wireskein gui`
const fileParam = new URLSearchParams(location.search).get('file');
if (fileParam) {
  const url = new URL(fileParam, location.href);
  if (url.origin === location.origin) {
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return open({ name: url.pathname.split('/').pop() ?? 'capture.wsc', arrayBuffer: () => r.arrayBuffer() });
    }).catch((error) => { $('summary').hidden = false; $('summary').textContent = `${fileParam}: ${error.message}`; });
  }
}
document.title = `WireSkein viewer ${VERSION}`;
