// @ts-check
import { analogTick, edges, levelAt, readWireskein, VERSION, volts } from './wireskein-web.js';

/** @typedef {import('../src/fileformat.js').Capture} Capture */
/** @typedef {import('../src/fileformat.js').LogicChannel} LogicChannel */
/** @typedef {import('../src/fileformat.js').AnalogChannel} AnalogChannel */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const LOGIC_H = 56;
const ANALOG_H = 150;
const RULER_H = 36;
const OVERVIEW_H = 16;
const DOT_PX = 6;          // draw sample dots when samples are at least this far apart
const LABEL_PX = 110;      // about this many pixels between time labels

/**
 * @typedef {object} View
 * @property {Capture} cap
 * @property {number} t0                         left edge, in ticks
 * @property {number} t1                         right edge, in ticks
 * @property {number | null} cursor              tick under the mouse
 * @property {number | null} lane                channel under the mouse
 * @property {number[][]} edges                  per logic channel, its edge ticks
 * @property {(Float64Array | null)[]} volts     per analog channel, volts when convertible
 */

/** @type {View | null} */
let state = null;

const hz = (/** @type {[number, number]} */ r) => r[0] / r[1];

// ---- formatting ----

/** @param {number} s seconds @param {number} [digits] */
function fmtTime(s, digits = 3) {
  const a = Math.abs(s);
  if (a === 0) return '0 s';
  if (a >= 1) return `${s.toFixed(digits)} s`;
  if (a >= 1e-3) return `${(s * 1e3).toFixed(digits)} ms`;
  if (a >= 1e-6) return `${(s * 1e6).toFixed(digits)} µs`;
  return `${(s * 1e9).toFixed(Math.max(0, digits - 2))} ns`;
}

function fmtHz(/** @type {number} */ f) {
  if (!Number.isFinite(f)) return '-';
  return f >= 1e6 ? `${(f / 1e6).toPrecision(5)} MHz` : f >= 1e3 ? `${(f / 1e3).toPrecision(5)} kHz` : `${f.toPrecision(5)} Hz`;
}

/** A 1-2-5 step, in seconds, for a label about every LABEL_PX pixels. @param {number} spanS @param {number} widthPx */
function niceStep(spanS, widthPx) {
  const raw = (spanS * LABEL_PX) / Math.max(1, widthPx);
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5]) if (m * p >= raw * 0.999) return m * p;
  return 10 * p;
}

/** The label of a multiple of `step` seconds, in the unit that fits the step. @param {number} s @param {number} step */
function fmtTick(s, step) {
  const [unit, name] = step >= 1 ? [1, 's'] : step >= 1e-3 ? [1e-3, 'ms'] : step >= 1e-6 ? [1e-6, 'µs'] : [1e-9, 'ns'];
  const digits = Math.max(0, -Math.floor(Math.log10(step / unit) + 1e-9));
  return `${(s / unit).toFixed(digits)} ${name}`;
}

// ---- loading ----

async function open(/** @type {File | { name: string, arrayBuffer: () => Promise<ArrayBuffer> }} */ file) {
  try {
    const cap = await readWireskein(new Uint8Array(await file.arrayBuffer()));
    state = {
      cap, t0: 0, t1: Math.max(1, cap.ticks), cursor: null, lane: null,
      edges: cap.channels.map((ch) => (ch.kind === 'logic' ? edges(ch) : [])),
      volts: cap.channels.map((ch) => (ch.kind === 'analog' ? volts(ch) : null)),
    };
    const params = new URLSearchParams(location.search);
    const view = params.get('view')?.split(',').map(Number);          // &view=T0,T1 in ticks
    if (view?.length === 2 && view.every(Number.isFinite) && view[1] > view[0]) [state.t0, state.t1] = view;
    const cursor = params.get('cursor')?.split(',');                  // &cursor=TICK[,CHANNEL] (screenshots)
    if (cursor && Number.isFinite(Number(cursor[0]))) {
      state.cursor = Number(cursor[0]);
      const k = cap.channels.findIndex((c) => c.name === cursor[1]);
      state.lane = k >= 0 ? k : null;
    }
    showSummary(file.name, cap);
    buildLanes(cap);
    draw();
  } catch (error) {
    $('summary').hidden = false;
    $('summary').textContent = `${file.name}: ${error instanceof Error ? error.message : error}`;
  }
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

/** A row: a name cell and a canvas. @param {string} label @param {string} sub @param {number} height @param {string} role */
function row(label, sub, height, role) {
  const lane = document.createElement('div');
  lane.className = `lane ${role}`;
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = label;
  if (sub) {
    const small = document.createElement('small');
    small.textContent = sub;
    name.append(small);
  }
  const canvas = document.createElement('canvas');
  canvas.dataset.role = role;
  canvas.style.height = `${height}px`;          // a fixed CSS size; draw() sets the backing store
  lane.append(name, canvas);
  return { lane, canvas };
}

function buildLanes(/** @type {Capture} */ cap) {
  const lanes = $('lanes');
  lanes.innerHTML = '';
  $('view').hidden = false;
  $('drop').hidden = true;
  const tick = hz(cap.tickHz);
  const ruler = row('time', '', RULER_H, 'ruler');
  const overview = row('', '', OVERVIEW_H, 'overview');
  lanes.append(ruler.lane, overview.lane);
  attachInput(ruler.canvas, null);
  attachOverview(overview.canvas);
  for (const [i, ch] of cap.channels.entries()) {
    const sub = ch.kind === 'logic'
      ? `${fmtHz(tick / ch.step)}${ch.step > 1 ? ` (1/${ch.step})` : ''}`
      : `${fmtHz(hz(ch.rateHz))} ${ch.encoding === 'analog' && !state?.volts[i] ? 'raw' : ch.unit}`;
    const { lane, canvas } = row(ch.name, sub, ch.kind === 'logic' ? LOGIC_H : ANALOG_H, 'channel');
    canvas.dataset.index = String(i);
    lanes.append(lane);
    attachInput(canvas, i);
  }
}

// ---- measuring ----

/** The last index with a[i] <= x, or -1. @param {number[]} a @param {number} x */
function floorIndex(a, x) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= x) lo = m + 1; else hi = m; }
  return lo - 1;
}

/**
 * The pulse of a logic channel at a tick: its level, the edge that began it and the one that ends it
 * (null: the capture's start or end), and the edge that ends the pulse after it.
 * @param {LogicChannel} ch @param {number[]} e @param {number} tick
 */
function pulseAt(ch, e, tick) {
  const i = floorIndex(e, tick);
  const k = Math.min(ch.n - 1, Math.max(0, Math.floor((tick - ch.phase) / ch.step)));
  return {
    level: levelAt(ch, k),
    start: i >= 0 ? e[i] : null,
    end: i + 1 < e.length ? e[i + 1] : null,
    nextEnd: i + 2 < e.length ? e[i + 2] : null,
  };
}

/** The tooltip's lines. @param {View} v @param {number} index @param {number} tick */
function measure(v, index, tick) {
  const cap = v.cap;
  const t = hz(cap.tickHz);
  const ch = cap.channels[index];
  if (ch.kind === 'logic') {
    if (tick < ch.phase || tick >= ch.phase + ch.n * ch.step) return [`${ch.name}: no samples here`];
    const p = pulseAt(ch, v.edges[index], tick);
    const name = (/** @type {number} */ lv) => (lv ? 'high' : 'low');
    const err = ch.step > 1 ? ` ± ${fmtTime(ch.step / t)}` : '';
    const out = [`${ch.name}: ${name(p.level)}`];
    if (p.start === null || p.end === null) {
      out.push(`${name(p.level)} ${p.start === null ? 'since the first sample' : 'until the last sample'}`);
      return out;
    }
    const width = (p.end - p.start) / t;
    out.push(`this ${name(p.level)}: ${fmtTime(width)}${err}`);
    if (p.nextEnd !== null) {
      const next = (p.nextEnd - p.end) / t;
      const period = width + next;
      const high = p.level ? width : next;
      out.push(`next ${name(1 - p.level)}: ${fmtTime(next)}${err}`);
      out.push(`period ${fmtTime(period)} · ${fmtHz(1 / period)} · duty ${((high / period) * 100).toFixed(1)} %`);
    }
    return out;
  }
  const per = t / hz(ch.rateHz);
  const k = Math.min(ch.n - 1, Math.max(0, Math.round((tick - analogTick(ch, cap.tickHz, 0)) / per)));
  const vv = v.volts[index];
  const value = vv ? `${vv[k].toFixed(4)} ${ch.unit}` + (ch.encoding === 'analog' ? ` (raw ${ch.values[k]})` : '')
    : `raw ${ch.values[k]}`;
  return [`${ch.name}: ${value}`, `sample ${k} at ${fmtTime(analogTick(ch, cap.tickHz, k) / t, 4)}`];
}

// ---- drawing ----

function colors() {
  const s = getComputedStyle(document.body);
  const c = (/** @type {string} */ n) => s.getPropertyValue(n).trim();
  return { line: c('--line'), band: c('--band'), grid: c('--grid'), muted: c('--muted'), cursor: c('--cursor'),
           pulse: c('--pulse'), window: c('--window'), track: c('--track') };
}
/** @typedef {ReturnType<typeof colors>} Colors */

let queued = false;
/** Redraw on the next frame (mouse moves come faster than frames). */
function redraw() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; draw(); });
}

function draw() {
  if (!state) return;
  const v = state;
  const col = colors();
  const t = hz(v.cap.tickHz);
  for (const canvas of /** @type {NodeListOf<HTMLCanvasElement>} */ (document.querySelectorAll('#lanes canvas'))) {
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    g.scale(ratio, ratio);
    const role = canvas.dataset.role;
    if (role === 'overview') { drawOverview(g, v, w, h, col); continue; }
    const x = (/** @type {number} */ tick) => ((tick - v.t0) / (v.t1 - v.t0)) * w;
    // grid lines (and on the ruler, labels) every 1, 2 or 5 of a unit
    const step = niceStep((v.t1 - v.t0) / t, w);
    g.strokeStyle = col.grid;
    g.fillStyle = col.muted;
    g.lineWidth = 1;
    g.font = '12px system-ui, sans-serif';
    for (let m = Math.ceil(v.t0 / t / step); m * step * t <= v.t1; m++) {
      const px = Math.round(x(m * step * t)) + 0.5;
      g.beginPath(); g.moveTo(px, role === 'ruler' ? h - 8 : 0); g.lineTo(px, h); g.stroke();
      if (role === 'ruler') g.fillText(fmtTick(m * step, step), px + 3, h - 10);
    }
    if (role === 'ruler') {
      if (v.cursor !== null) drawCursorTime(g, x(v.cursor), w, fmtTime(v.cursor / t), col);
      continue;
    }
    const index = Number(canvas.dataset.index);
    const ch = v.cap.channels[index];
    if (ch.kind === 'logic') drawLogic(g, v, index, ch, x, w, h, col);
    else drawAnalog(g, v, index, ch, x, w, h, col);
    if (v.cursor !== null) {
      const px = Math.round(x(v.cursor)) + 0.5;
      g.strokeStyle = col.cursor;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(px, 0); g.lineTo(px, h); g.stroke();
    }
  }
  drawTip();
}

/** @param {CanvasRenderingContext2D} g @param {number} px @param {number} w @param {string} label @param {Colors} col */
function drawCursorTime(g, px, w, label, col) {
  const tw = g.measureText(label).width + 10;
  const left = Math.min(Math.max(0, px - tw / 2), w - tw);
  g.fillStyle = col.cursor;
  g.fillRect(left, 1, tw, 17);
  g.fillStyle = '#fff';
  g.fillText(label, left + 5, 14);
}

/**
 * @param {CanvasRenderingContext2D} g @param {View} v @param {number} index @param {LogicChannel} ch
 * @param {(t: number) => number} x @param {number} w @param {number} h @param {Colors} col
 */
function drawLogic(g, v, index, ch, x, w, h, col) {
  const { t0, t1 } = v;
  const e = v.edges[index];
  const y = (/** @type {number} */ lv) => (lv ? 10 : h - 10);
  const end = ch.phase + ch.n * ch.step;
  if (v.cursor !== null && v.lane === index && v.cursor >= ch.phase && v.cursor < end) {   // the pulse under the mouse
    const p = pulseAt(ch, e, v.cursor);
    const a = x(p.start ?? ch.phase), b = x(p.end ?? end);
    g.fillStyle = col.pulse;
    g.fillRect(a, 0, b - a, h);
  }
  const k0 = Math.max(0, Math.floor((t0 - ch.phase) / ch.step) - 1);
  const k1 = Math.min(ch.n - 1, Math.ceil((t1 - ch.phase) / ch.step) + 1);
  const pxPerSample = (ch.step / (t1 - t0)) * w;
  g.strokeStyle = col.line;
  g.fillStyle = col.line;
  g.lineWidth = 1.5;
  if (pxPerSample < 0.5) {
    // many samples per pixel: per pixel column, low, high, or both when an edge falls in it
    for (let px = 0; px < w; px++) {
      const a = t0 + (px / w) * (t1 - t0), b = t0 + ((px + 1) / w) * (t1 - t0);
      if (b < ch.phase || a > ch.phase + (ch.n - 1) * ch.step) continue;
      const i = floorIndex(e, a);
      const both = i + 1 < e.length && e[i + 1] <= b;
      const lv = levelAt(ch, Math.min(ch.n - 1, Math.max(0, Math.floor((a - ch.phase) / ch.step))));
      if (both) g.fillRect(px, y(1) - 0.75, 1, y(0) - y(1) + 1.5);
      else g.fillRect(px, y(lv) - 0.75, 1, 1.5);
    }
    return;
  }
  g.beginPath();
  let prev = levelAt(ch, k0);
  g.moveTo(x(ch.phase + k0 * ch.step), y(prev));
  for (let k = k0 + 1; k <= k1; k++) {
    const lv = levelAt(ch, k);
    const tick = ch.phase + k * ch.step;
    if (lv !== prev) {
      if (ch.step > 1) {                 // the change happened somewhere in the step before this sample
        g.save(); g.fillStyle = col.band; g.fillRect(x(tick - ch.step), 0, x(tick) - x(tick - ch.step), h); g.restore();
      }
      g.lineTo(x(tick), y(prev));
      g.lineTo(x(tick), y(lv));
      prev = lv;
    }
  }
  g.lineTo(x(ch.phase + (k1 + 1) * ch.step), y(prev));
  g.stroke();
  if (pxPerSample >= DOT_PX) {           // the samples the probe took
    for (let k = k0; k <= k1; k++) {
      g.beginPath();
      g.arc(x(ch.phase + k * ch.step), y(levelAt(ch, k)), 2.2, 0, 2 * Math.PI);
      g.fill();
    }
  }
}

/**
 * @param {CanvasRenderingContext2D} g @param {View} v @param {number} index @param {AnalogChannel} ch
 * @param {(t: number) => number} x @param {number} w @param {number} h @param {Colors} col
 */
function drawAnalog(g, v, index, ch, x, w, h, col) {
  const { cap, t0, t1 } = v;
  const vals = v.volts[index] ?? ch.values;
  if (!vals.length) return;
  let lo = Infinity, hi = -Infinity;
  for (const s of vals) { if (Number.isFinite(s)) { lo = Math.min(lo, s); hi = Math.max(hi, s); } }
  if (hi === lo) { hi += 1; lo -= 1; }
  const pad = 12;
  const y = (/** @type {number} */ s) => h - pad - ((s - lo) / (hi - lo)) * (h - 2 * pad);
  const unit = v.volts[index] ? ` ${ch.unit}` : '';
  g.fillStyle = col.muted;
  g.font = '11px system-ui, sans-serif';
  g.fillText(`${+hi.toPrecision(4)}${unit}`, 4, pad - 2);
  g.fillText(`${+lo.toPrecision(4)}${unit}`, 4, h - 2);
  const per = hz(cap.tickHz) / hz(ch.rateHz);
  const start = analogTick(ch, cap.tickHz, 0);
  const k0 = Math.max(0, Math.floor((t0 - start) / per) - 1);
  const k1 = Math.min(vals.length - 1, Math.ceil((t1 - start) / per) + 1);
  g.strokeStyle = col.line;
  g.fillStyle = col.line;
  g.lineWidth = 1.5;
  g.beginPath();
  let drawing = false;
  for (let k = k0; k <= k1; k++) {
    if (!Number.isFinite(vals[k])) { drawing = false; continue; }
    const px = x(start + k * per);
    if (drawing) g.lineTo(px, y(vals[k])); else g.moveTo(px, y(vals[k]));
    drawing = true;
  }
  g.stroke();
  if ((per / (t1 - t0)) * w >= DOT_PX) {
    for (let k = k0; k <= k1; k++) {
      if (!Number.isFinite(vals[k])) continue;
      g.beginPath();
      g.arc(x(start + k * per), y(vals[k]), 2.2, 0, 2 * Math.PI);
      g.fill();
    }
  }
  if (v.cursor !== null && v.lane === index) {              // the sample the tooltip reads
    const k = Math.min(ch.n - 1, Math.max(0, Math.round((v.cursor - start) / per)));
    if (Number.isFinite(vals[k])) {
      g.strokeStyle = col.cursor;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x(start + k * per), y(vals[k]), 4.5, 0, 2 * Math.PI);
      g.stroke();
    }
  }
}

/** The whole capture, and where the view is in it. @param {CanvasRenderingContext2D} g @param {View} v @param {number} w @param {number} h @param {Colors} col */
function drawOverview(g, v, w, h, col) {
  const total = Math.max(1, v.cap.ticks);
  g.fillStyle = col.track;
  g.fillRect(0, 3, w, h - 6);
  const a = Math.max(0, (v.t0 / total) * w), b = Math.min(w, (v.t1 / total) * w);
  g.fillStyle = col.window;
  g.fillRect(Math.min(a, w - 4), 1, Math.max(4, b - a), h - 2);
}

function drawTip() {
  const tip = $('tip');
  if (!state || state.cursor === null || state.lane === null) { tip.hidden = true; return; }
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.querySelector(`#lanes canvas[data-index="${state.lane}"]`));
  if (!canvas) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.innerHTML = '';
  for (const [i, line] of measure(state, state.lane, state.cursor).entries()) {
    const d = document.createElement(i ? 'div' : 'b');
    d.textContent = line;
    tip.append(d);
  }
  const r = canvas.getBoundingClientRect();
  const px = r.left + ((state.cursor - state.t0) / (state.t1 - state.t0)) * r.width;
  const left = px + 16 + tip.offsetWidth > document.documentElement.clientWidth ? px - 16 - tip.offsetWidth : px + 16;
  tip.style.left = `${left + window.scrollX}px`;
  tip.style.top = `${r.bottom + window.scrollY + 4}px`;
}

// ---- input ----

/** Zoom by f around the tick `at`. @param {number} f @param {number} at */
function zoom(f, at) {
  if (!state) return;
  const span = Math.min(Math.max(4, (state.t1 - state.t0) * f), Math.max(8, state.cap.ticks * 4));
  state.t0 = at - (at - state.t0) * (span / (state.t1 - state.t0));
  state.t1 = state.t0 + span;
}

/** Scroll by a share of the visible span. @param {number} share */
function pan(share) {
  if (!state) return;
  const dt = share * (state.t1 - state.t0);
  state.t0 += dt;
  state.t1 += dt;
}

function fit() {
  if (!state) return;
  state.t0 = 0;
  state.t1 = Math.max(1, state.cap.ticks);
}

/** Wheel, drag and hover on a row. @param {HTMLCanvasElement} canvas @param {number | null} index */
function attachInput(canvas, index) {
  const tickAt = (/** @type {number} */ offsetX) => {
    const v = /** @type {View} */ (state);
    return v.t0 + (offsetX / canvas.clientWidth) * (v.t1 - v.t0);
  };
  canvas.addEventListener('wheel', (event) => {
    if (!state) return;
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientWidth : 1;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      pan((event.deltaX * scale) / canvas.clientWidth);           // a trackpad swipe
    } else if (event.shiftKey) {
      pan((event.deltaY * scale) / canvas.clientWidth);           // Shift + wheel: scroll in time
    } else {
      zoom(event.deltaY > 0 ? 1.25 : 0.8, tickAt(event.offsetX));
    }
    state.cursor = tickAt(event.offsetX);
    redraw();
  }, { passive: false });
  let from = /** @type {number | null} */ (null);
  canvas.addEventListener('pointerdown', (event) => { from = event.clientX; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointerup', () => { from = null; });
  canvas.addEventListener('pointermove', (event) => {
    if (!state) return;
    if (from !== null) {
      pan((from - event.clientX) / canvas.clientWidth);
      from = event.clientX;
    }
    state.cursor = tickAt(event.offsetX);
    state.lane = index;
    redraw();
  });
  canvas.addEventListener('pointerleave', () => {
    if (!state || from !== null) return;
    state.cursor = null;
    state.lane = null;
    redraw();
  });
  canvas.addEventListener('dblclick', () => { fit(); redraw(); });
}

/** Click or drag on the overview to move the view there. @param {HTMLCanvasElement} canvas */
function attachOverview(canvas) {
  const jump = (/** @type {PointerEvent} */ event) => {
    if (!state) return;
    const span = state.t1 - state.t0;
    const center = (event.offsetX / canvas.clientWidth) * Math.max(1, state.cap.ticks);
    state.t0 = center - span / 2;
    state.t1 = center + span / 2;
    redraw();
  };
  let down = false;
  canvas.addEventListener('pointerdown', (event) => { down = true; canvas.setPointerCapture(event.pointerId); jump(event); });
  canvas.addEventListener('pointermove', (event) => { if (down) jump(event); });
  canvas.addEventListener('pointerup', () => { down = false; });
}

document.addEventListener('keydown', (event) => {
  if (!state || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement) return;
  const center = state.cursor ?? (state.t0 + state.t1) / 2;
  /** @type {Record<string, () => void>} */
  const keys = {
    ArrowLeft: () => pan(event.shiftKey ? -0.5 : -0.1),
    ArrowRight: () => pan(event.shiftKey ? 0.5 : 0.1),
    '+': () => zoom(0.8, center), '=': () => zoom(0.8, center),
    '-': () => zoom(1.25, center), _: () => zoom(1.25, center),
    Home: fit, 0: fit,
  };
  const f = keys[event.key];
  if (!f) return;
  event.preventDefault();
  f();
  redraw();
});

const drop = $('drop');
document.body.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('over'); });
document.body.addEventListener('dragleave', () => drop.classList.remove('over'));
document.body.addEventListener('drop', (event) => {
  event.preventDefault();
  drop.classList.remove('over');
  const file = event.dataTransfer?.files[0];
  if (file) open(file);
});
$('file').addEventListener('change', (event) => {
  const file = /** @type {HTMLInputElement} */ (event.target).files?.[0];
  if (file) open(file);
});
window.addEventListener('resize', redraw);

// ?file=URL opens that capture (same origin), e.g. from `wireskein gui`
const fileParam = new URLSearchParams(location.search).get('file');
if (fileParam) {
  const url = new URL(fileParam, location.href);
  if (url.origin === location.origin) {
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return open({ name: url.pathname.split('/').pop() ?? 'capture.wireskein', arrayBuffer: () => r.arrayBuffer() });
    }).catch((error) => { $('summary').hidden = false; $('summary').textContent = `${fileParam}: ${error.message}`; });
  }
}
document.title = `WireSkein viewer ${VERSION}`;
