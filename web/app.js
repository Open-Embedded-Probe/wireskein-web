// @ts-check
import { alignedTick, clipEnds, edges, eventEdges, eventIndex, fileAlignment, levelAt, onto, partOf, readAlignment, readAnnotations, readCapture, readMarkers, selectPart, VERSION, volts } from './wireskein-web.js';

/** @typedef {import('../src/fileformat.js').Capture} Capture */
/** @typedef {import('../src/fileformat.js').LogicChannel} LogicChannel */
/** @typedef {import('../src/fileformat.js').AnalogChannel} AnalogChannel */
/** @typedef {import('../src/fileformat.js').EventsChannel} EventsChannel */
/** @typedef {import('../src/fileformat.js').Channel} Channel */
/** @typedef {import('../src/parts.js').Marker} Marker */
/** @typedef {import('../src/parts.js').AnnotationRow} AnnotationRow */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const LOGIC_H = 56;
const ANALOG_H = 150;
const RULER_H = 36;
const OVERVIEW_H = 16;
const ANNOTATION_H = 24;
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
 * @property {number | null} trigger             tick of the trigger, when the probe reported one
 * @property {Map<string, import('../src/align.js').Alignment> | null} alignment   from attach/alignment.json
 * @property {boolean} aligned                    draw the analog channels on the aligned time
 * @property {AnnotationRow[]} rows               decoding annotations shown: this part's and the added files' (sorted by start)
 * @property {AnnotationRow[]} ownRows            this file's decoding annotations, every part's
 * @property {number | null} row                  annotation row under the mouse
 * @property {Marker[]} markers                  this file's, every part's (each names its part)
 * @property {Marker[]} otherMarkers              markers of added files, on this time (shown, not saved here)
 * @property {AnnotationRow[]} otherRows           annotation rows of added files, on this time
 * @property {boolean} dirty                      markers changed since loaded / saved
 * @property {string | null} server               the file's path on `wireskein gui` (null: no server)
 * @property {string} name                        the file's name
 * @property {Capture} base                       the file itself, at the part shown (cap adds the channels of added files)
 * @property {Other[]} others                      added files
 */

/**
 * Another probe's file, on this file's ticks (those of its part 0, where the alignment is made): its channels,
 * annotation rows and markers; shown on another part shifted by that part's tick0 (timeline), not on a part
 * whose place is not known (segments without tick0).
 * @typedef {object} Other
 * @property {string} name
 * @property {string} prefix
 * @property {Record<string, any> | null} entry
 * @property {string} why
 * @property {Channel[]} channels
 * @property {AnnotationRow[]} rows
 * @property {Marker[]} markers
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

/**
 * Where the trigger was, in ticks: meta.trigger_tick, else an analog channel's (acquisition.trigger_index), else
 * the group's trigger_ns against start_ns. null: no trigger reported.
 * @param {Capture} cap
 */
function triggerTick(cap, /** @type {View | null} */ v = null) {
  const meta = /** @type {Record<string, any>} */ (cap.meta);
  if (typeof meta.trigger_tick === 'number') return meta.trigger_tick;
  for (const c of cap.channels) {
    const k = c.acquisition.trigger_index;
    if (c.kind === 'analog' && typeof k === 'number') return alignedTick(c, cap.tickHz, k, v ? alignmentOf(v, c.name) : null);
  }
  const ns = meta.probe?.trigger_ns, start = meta.start_ns;
  if (typeof ns === 'number' && typeof start === 'number') return ((ns - start) * cap.tickHz[0]) / (cap.tickHz[1] * 1e9);
  return null;
}

/**
 * @param {File | { name: string, arrayBuffer: () => Promise<ArrayBuffer> }} file
 * @param {string | null} [rel]   its path on `wireskein gui` (/files/<rel>), when it came from there
 */
async function open(file, rel = null) {
  try {
    const cap = await readCapture(new Uint8Array(await file.arrayBuffer()));
    state = {
      cap, t0: 0, t1: Math.max(1, cap.ticks), cursor: null, lane: null, trigger: null,
      alignment: readAlignment(cap), aligned: true, rows: [], ownRows: [], row: null,
      markers: readMarkers(cap) ?? [], dirty: false, server: null, name: file.name, base: cap, others: [], otherMarkers: [], otherRows: [],
      edges: [], volts: [],
    };
    const params = new URLSearchParams(location.search);
    const part = Number(params.get('part'));                           // &part=K: that part first
    if (Number.isInteger(part) && part > 0 && part < cap.parts.length) state.base = selectPart(cap, part);
    compose(state);
    state.aligned = params.get('aligned') !== '0';                    // &aligned=0: the probe's times
    state.trigger = triggerTick(cap, state);
    const view = params.get('view')?.split(',').map(Number);          // &view=T0,T1 in ticks
    if (view?.length === 2 && view.every(Number.isFinite) && view[1] > view[0]) [state.t0, state.t1] = view;
    const cursor = params.get('cursor')?.split(',');                  // &cursor=TICK[,CHANNEL] (screenshots)
    if (cursor && Number.isFinite(Number(cursor[0]))) {
      state.cursor = Number(cursor[0]);
      const k = state.cap.channels.findIndex((c) => c.name === cursor[1]);
      state.lane = k >= 0 ? k : null;
    }
    state.server = rel && (await hasServer()) ? rel : null;
    state.trigger = triggerTick(state.cap, state);
    setRows(state, readAnnotations(cap) ?? []);
    showSummary(file.name, state.cap);
    buildLanes(state.cap);
    showMarkers();
    draw();
    if (state.server) loadFromServer(state);
    for (const withFile of params.getAll('with')) {                  // &with=/files/B.wireskein: another probe's capture
      const u = new URL(withFile, location.href);
      if (u.origin !== location.origin) continue;
      const r = await fetch(u);
      const rel = u.pathname.startsWith('/files/') ? decodeURIComponent(u.pathname.slice(7)) : null;
      if (r.ok) await addFile(state, { name: decodeURIComponent(u.pathname.split('/').pop() ?? 'other'), arrayBuffer: () => r.arrayBuffer() }, rel);
    }
  } catch (error) {
    $('summary').hidden = false;
    $('summary').textContent = `${file.name}: ${error instanceof Error ? error.message : error}`;
  }
}

/** The shift from the file's ticks (part 0's) to the part shown: its tick0, or null when not known. @param {View} v */
function partShift(v) {
  return v.base.part === 0 ? 0 : v.base.parts[v.base.part].tick0;
}

/**
 * The view's capture: the part shown and the added files' channels on it, with their edges and volts, and the
 * annotation rows and markers of that part.
 * @param {View} v
 */
function compose(v) {
  const s = partShift(v);
  const shown = s === null ? [] : v.others;
  const by = s ?? 0;
  /** @type {(ch: Channel) => Channel} */
  const shift = (ch) => (ch.kind === 'analog' ? { ...ch, t0Ticks: [ch.t0Ticks[0] - by * ch.t0Ticks[1], ch.t0Ticks[1]] }
    : { ...ch, phase: ch.phase - by });
  const extra = shown.flatMap((o) => o.channels.map(shift));
  const ends = extra.map((c) => (c.kind !== 'analog' ? c.phase + c.n * c.step
    : c.t0Ticks[0] / c.t0Ticks[1] + (c.n * v.base.tickHz[0] * c.rateHz[1]) / (v.base.tickHz[1] * c.rateHz[0])));
  v.cap = { ...v.base, channels: [...v.base.channels, ...extra], ticks: Math.max(v.base.ticks, ...ends) };
  v.edges = v.cap.channels.map((ch) => (ch.kind === 'logic' ? edges(ch) : ch.kind === 'events' ? eventEdges(ch) : []));
  v.volts = v.cap.channels.map((ch) => (ch.kind === 'analog' ? volts(ch) : null));
  const at = (/** @type {number} */ t) => t - by;
  v.otherRows = shown.flatMap((o) => o.rows.map((r) => ({ ...r, items: r.items.map((it) => ({ ...it, s: at(it.s), e: it.e !== undefined ? at(it.e) : undefined })) })));
  v.otherMarkers = shown.flatMap((o) => o.markers.map((m) => ({ ...m, t: at(m.t), end: m.end !== undefined ? at(m.end) : undefined })));
  v.rows = [...v.ownRows.filter((r) => partOf(r) === v.base.part), ...v.otherRows];
}

/** This file's markers on the part shown. @param {View} v */
const partMarkers = (v) => v.markers.filter((m) => partOf(m) === v.base.part);

/** Show part k (wireskein-format §3.4): its own time from 0, its trigger, markers and annotations. @param {View} v @param {number} k */
function showPart(v, k) {
  if (k < 0 || k >= v.base.parts.length || k === v.base.part) return;
  v.base = selectPart(v.base, k);
  compose(v);
  v.t0 = 0;
  v.t1 = Math.max(1, v.cap.ticks);
  v.trigger = triggerTick(v.cap, v);
  showSummary(v.name, v.cap);
  buildLanes(v.cap);
  showMarkers();
  draw();
  if (v.server) loadFromServer(v);
}

/** The parts as tabs, with what was lost between them (a timeline's gaps). @param {View} v @param {HTMLElement} el */
function partTabs(v, el) {
  const parts = v.base.parts;
  if (parts.length < 2) return;
  const t = hz(v.base.tickHz);
  const bar = document.createElement('div');
  bar.className = 'parts';
  bar.append(v.base.layout === 'segments' ? `${parts.length} acquisitions: ` : `${parts.length} parts: `);
  const start0 = parts[0].meta.start_ns;
  for (const [k, p] of parts.entries()) {
    const b = document.createElement('button');
    const sns = p.meta.start_ns;
    const when = v.base.layout === 'timeline' && p.tick0 !== null ? `at ${fmtTime(p.tick0 / t, 4)}`
      : typeof sns === 'number' && typeof start0 === 'number' ? `+${fmtTime((sns - start0) / 1e9, 4)}` : '';
    b.textContent = `${v.base.layout === 'segments' ? '#' : ''}${k + 1}` + (when ? ` · ${when}` : '') + ` · ${fmtTime(p.ticks / t)}`
      + (typeof p.meta.trigger_tick === 'number' ? ' · T' : '');
    b.className = k === v.base.part ? 'current' : '';
    b.title = 'Show this part ([ and ] move between parts)';
    b.addEventListener('click', () => showPart(v, k));
    bar.append(b);
    for (const x of v.base.lost.filter((l) => l.afterPart === k)) {
      const gap = document.createElement('span');
      gap.className = 'lost';
      gap.textContent = `lost ${x.ticks !== null ? fmtTime(x.ticks / t) : '(length unknown)'}${x.stopped ? ', stopped' : ''}`;
      gap.title = x.reason;
      bar.append(gap);
    }
    if (v.base.layout === 'timeline' && k + 1 < parts.length && !v.base.lost.some((l) => l.afterPart === k)
        && p.tick0 !== null && parts[k + 1].tick0 !== null) {
      const gap = /** @type {number} */ (parts[k + 1].tick0) - p.tick0 - p.ticks;
      if (gap > 0) {
        const span = document.createElement('span');
        span.className = 'gap';
        span.textContent = `not taken ${fmtTime(gap / t)}`;
        bar.append(span);
      }
    }
  }
  el.append(bar);
}

/**
 * A capture that lost data is a failure (wireskein-format §3.4): said first, with what was lost.
 * @param {Capture} cap @param {HTMLElement} el
 */
function lossBanner(cap, el) {
  if (cap.complete) return;
  const t = hz(cap.tickHz);
  const d = document.createElement('div');
  d.className = 'incomplete';
  const b = document.createElement('b');
  b.textContent = 'INCOMPLETE: data was lost while capturing. This capture failed; what was taken is kept.';
  d.append(b);
  const shown = cap.lost.length <= 4 ? cap.lost : [...cap.lost.slice(0, 3), cap.lost[cap.lost.length - 1]];
  for (const [i, x] of shown.entries()) {
    if (cap.lost.length > 4 && i === 3) {
      const more = document.createElement('div');
      const sum = cap.lost.reduce((a, l) => a + (l.ticks ?? 0), 0);
      more.textContent = `… ${cap.lost.length - 4} more (${cap.lost.length} losses, ${fmtTime(sum / t)} known in all)`;
      d.append(more);
    }
    const line = document.createElement('div');
    line.textContent = `${x.afterPart < 0 ? 'before the first part' : `after part ${x.afterPart + 1}`}: `
      + `${x.ticks !== null ? fmtTime(x.ticks / t) : 'length unknown'} · ${x.reason}${x.stopped ? ' · the capture stopped there' : ''}`;
    d.append(line);
  }
  el.append(d);
}

function showSummary(/** @type {string} */ name, /** @type {Capture} */ cap) {
  const tick = hz(cap.tickHz);
  const el = $('summary');
  el.hidden = false;
  el.innerHTML = '';
  lossBanner(cap, el);
  const h = document.createElement('div');
  const many = cap.parts.length > 1 ? ` · ${cap.layout === 'segments' ? 'acquisition' : 'part'} ${cap.part + 1} of ${cap.parts.length}` : '';
  h.innerHTML = `<b></b>${many} · ${cap.channels.length} channels · ${fmtTime(cap.ticks / tick)} · tick ${fmtHz(tick)}`
    + (state?.trigger != null ? ` · trigger at ${fmtTime(state.trigger / tick, 4)}` : '');
  /** @type {HTMLElement} */ (h.querySelector('b')).textContent = name;
  el.append(h);
  if (state) partTabs(state, el);
  const v0 = state;
  if (v0) {
    if (v0.others.length && partShift(v0) === null) {
      const d = document.createElement('div');
      d.className = 'other unaligned';
      d.textContent = 'The added files are not shown on this acquisition: its place on their time is not known (no tick0).';
      el.append(d);
    }
    for (const o of v0.others) {
      const d = document.createElement('div');
      d.className = o.entry ? 'other' : 'other unaligned';
      const tick = hz(v0.base.tickHz);
      d.textContent = o.entry
        ? `+ ${o.name} as ${o.prefix}… on this time: aligned via ${o.entry.via} → ${o.entry.reference} (tick 0 at `
          + `${fmtTime(o.entry.offset_ticks / tick, 4)}, clock ${(o.entry.scale_ppm ?? 0) >= 0 ? '+' : ''}`
          + `${Number(o.entry.scale_ppm ?? 0).toFixed(2)} ppm, residual ${fmtTime((o.entry.residual_ticks ?? 0) / tick)})`
        : `+ ${o.name} as ${o.prefix}… NOT aligned: its start is drawn at this file's start. ${o.why}`;
      el.append(d);
    }
    const add = document.createElement('label');
    add.className = 'add-file';
    add.innerHTML = '<span>Add another probe\'s file…</span>';
    const input = document.createElement('input');
    input.type = 'file';
    input.hidden = true;
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (f) addFile(v0, f).catch((error) => { add.textContent = `${f.name}: ${error instanceof Error ? error.message : error}`; });
    });
    add.append(input);
    el.append(add);
  }
  const alignment = state?.alignment;
  if (state && alignment) {                   // attach/alignment.json from `wireskein align`
    const v = state;
    const label = document.createElement('label');
    label.className = 'aligned';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = v.aligned;
    box.addEventListener('change', () => {
      v.aligned = box.checked;
      v.trigger = triggerTick(v.cap, v);
      draw();
    });
    const first = [...alignment.values()][0];
    const r = first.raw;
    const us = (/** @type {unknown} */ x) => (typeof x === 'number' ? `${x >= 0 ? '+' : ''}${x.toFixed(1)} µs` : '?');
    const text = document.createElement('span');
    text.textContent = ` Analog aligned to ${first.reference} (via ${first.via}: start ${us(r.start_shift_us)}, `
      + `${first.scale >= 1 ? '+' : ''}${((first.scale - 1) * 1e6).toFixed(1)} ppm`
      + (typeof r.residual_ticks === 'number' ? `, residual ${fmtTime(r.residual_ticks / tick)}` : '')
      + `) · ${[...alignment.keys()].join(', ')}`;
    label.append(box, text);
    el.append(label);
  }
  if (cap.skipped.length) {
    const s = document.createElement('div');
    s.textContent = `Not shown (encodings this viewer does not read): ${cap.skipped.map((/** @type {{name: string, encoding: string}} */ c) => `${c.name} (${c.encoding})`).join(', ')}`;
    el.append(s);
  }
  showDetails(cap);
}

/** Metadata, acquisition settings, attachments and notes. @param {Capture} cap */
function showDetails(cap) {
  const d = $('details');
  d.hidden = false;
  d.innerHTML = '';
  const rows = [['meta', JSON.stringify(cap.fileMeta)]];
  if (cap.parts.length > 1 || Object.keys(cap.parts[cap.part].meta).length) rows.push([`part ${cap.part + 1} meta`, JSON.stringify(cap.parts[cap.part].meta)]);
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
      ? `${fmtHz(tick / ch.step)}${ch.step > 1 && Number.isInteger(ch.step) ? ` (1/${ch.step})` : ''}`
      : ch.kind === 'events'
        ? `changes per ${fmtTime(ch.step / tick)}` + (ch.step > 1 ? ` (1/${ch.step})` : '')
        : `${fmtHz(hz(ch.rateHz))} ${ch.encoding === 'analog' && !state?.volts[i] ? 'raw' : ch.unit}`;
    const { lane, canvas } = row(ch.name, sub, ch.kind === 'analog' ? ANALOG_H : LOGIC_H, 'channel');
    canvas.dataset.index = String(i);
    lanes.append(lane);
    attachInput(canvas, i);
    state?.rows.forEach((r, k) => { if (r.near === ch.name) annotationLane(lanes, r, k); });
  }
  const names = new Set(cap.channels.map((c) => c.name));
  state?.rows.forEach((r, k) => { if (!r.near || !names.has(r.near)) annotationLane(lanes, r, k); });
}

/** A lane for one row of decoding annotations. @param {HTMLElement} lanes @param {AnnotationRow} r @param {number} k */
function annotationLane(lanes, r, k) {
  const sure = !r.verdict || r.verdict === 'confirmed';
  const how = sure ? '' : ` · ${r.verdict}${typeof r.score === 'number' ? ` ${r.score.toFixed(2)}` : ''}`;
  const { lane, canvas } = row(r.name, `${r.items.length} items${how}`, ANNOTATION_H, 'annotation');
  if (!sure) lane.classList.add('unsure');
  canvas.dataset.row = String(k);
  lanes.append(lane);
  attachInput(canvas, null, k);
}

// ---- another probe's capture, on this one's time (wireskein-format §5.1.1) ----

/**
 * Add another file's channels, on this file's ticks when it holds an alignment onto this file (wireskein align --to);
 * its decoding annotations and markers come along on the same time.
 * @param {View} v @param {{ name: string, arrayBuffer: () => Promise<ArrayBuffer> }} file
 * @param {string | null} [rel]   its path on `wireskein gui`, to decode it there when it holds no annotations
 */
async function addFile(v, file, rel = null) {
  const other = await readCapture(new Uint8Array(await file.arrayBuffer()));
  const { entry, why } = await fileAlignment(other, selectPart(v.base, 0), v.name);
  const stem = file.name.replace(/\.[^.]*$/, '');
  const prefix = `${stem}:`;
  const reference = selectPart(v.base, 0);                  // the alignment is onto this file's ticks (part 0's)
  const channels = onto(reference, other, entry, prefix);
  const a = entry ? entry.offset_ticks : 0;
  const b = entry ? entry.scale : hz(v.base.tickHz) / hz(other.tickHz);
  const at = (/** @type {number} */ t) => a + b * t;
  let rows = readAnnotations(other)?.filter((r) => partOf(r) === other.part) ?? null;
  if (!rows && rel && v.server) {
    try {
      const r = await fetch(api('/api/annotations', rel));
      if (r.ok) rows = readAnnotations(await r.json());
    } catch { /* shown without them */ }
  }
  v.others.push({
    name: file.name, prefix, entry, why, channels,
    rows: (rows ?? []).map((r) => ({ ...r, name: prefix + r.name, near: r.near ? prefix + r.near : undefined, part: undefined,
                                     items: r.items.map((it) => ({ ...it, s: at(it.s), e: it.e !== undefined ? at(it.e) : undefined }))
                                       .sort((x, y) => x.s - y.s) })),
    markers: (readMarkers(other) ?? []).filter((m) => partOf(m) === other.part)
      .map((m) => ({ ...m, label: prefix + m.label, t: at(m.t), end: m.end !== undefined ? at(m.end) : undefined, part: undefined })),
  });
  compose(v);
  showSummary(v.name, v.cap);
  buildLanes(v.cap);
  draw();
}

// ---- wireskein gui: annotations, checks, notes, markers ----

/** Whether this page is served by `wireskein gui` (its API answers). */
async function hasServer() {
  try {
    const r = await fetch('/api/version');
    return r.ok && typeof (await r.json()).api === 'number';
  } catch { return false; }
}

/** @param {string} path @param {string} rel @param {number | null} [part]   a part of a file of several (wireskein-format §3.4) */
const api = (path, rel, part = null) => `${path}?file=${encodeURIComponent(rel)}${part !== null ? `&part=${part}` : ''}`;

/** The part to name to the server: the one shown, when the file has several. @param {View} v */
const serverPart = (v) => (v.base.parts.length > 1 ? v.base.part : null);

/** @param {string} method @param {string} url @param {unknown} body */
async function send(method, url, body) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).trim()}`);
  return r.json();
}

/** This file's annotation rows, every part's (the added files' stay). @param {View} v @param {AnnotationRow[]} rows */
function setRows(v, rows) {
  v.ownRows = rows.map((r) => ({ ...r, items: [...r.items].sort((a, b) => a.s - b.s) }));
  v.rows = [...v.ownRows.filter((r) => partOf(r) === v.base.part), ...v.otherRows];
}

/** Annotations (stored or decoded now), the run's checks for this capture, and the note form. @param {View} v */
async function loadFromServer(v) {
  const rel = /** @type {string} */ (v.server);
  showChecks(null);
  addNoteForm(v);
  try {
    const part = v.base.part;
    const r = await fetch(api('/api/annotations', rel, serverPart(v)));
    if (r.ok) {
      const doc = await r.json();
      const rows = readAnnotations(doc);
      if (rows && state === v && v.base.part === part) {     // decoded now: this part's (stored: every part's, each named)
        setRows(v, [...v.ownRows.filter((x) => partOf(x) !== part),
                    ...rows.map((x) => ({ ...x, part: x.part ?? (doc.stored === true ? undefined : part) }))
                      .filter((x) => partOf(x) === part)]);
        buildLanes(v.cap);
        draw();
        showDecodeState(v, doc.stored === true);
      }
    }
  } catch { /* no annotations: the lanes stay as they are */ }
  try {
    const r = await fetch(api('/api/checks', rel, serverPart(v)));
    if (r.ok && state === v) showChecks(await r.json());
  } catch { /* not in a run */ }
}

/** "decoded now / stored in the file", with a button to store them. @param {View} v @param {boolean} stored */
function showDecodeState(v, stored) {
  const el = $('summary');
  el.querySelector('.decode')?.remove();
  const own = v.rows.filter((r) => !v.otherRows.includes(r));
  if (!own.length) return;
  const div = document.createElement('div');
  div.className = 'decode';
  div.textContent = `Decoded: ${own.map((r) => `${r.name} (${r.items.length})`).join(', ')}`
    + (stored ? ' · stored in the file' : ' · decoded now ');
  if (!stored && v.server) {
    const b = document.createElement('button');
    b.textContent = 'Store in the file';
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await send('POST', api('/api/annotations', /** @type {string} */ (v.server), serverPart(v)), {}); showDecodeState(v, true); }
      catch (error) { b.disabled = false; b.textContent = `Failed: ${error instanceof Error ? error.message : error}`; }
    });
    div.append(b);
  }
  el.append(div);
}

/** The run's check results for this capture. @param {{ run: string | null, results: any[] } | null} doc */
function showChecks(doc) {
  const el = $('checks');
  el.innerHTML = '';
  el.hidden = !doc?.run;
  if (!doc?.run) return;
  const h = document.createElement('div');
  const ng = doc.results.filter((r) => (r.status ?? (r.ok === false ? 'ng' : '')) === 'ng').length;
  h.innerHTML = '<b>Checks</b> ';
  h.append(`run ${doc.run} · ${doc.results.length} on this capture` + (ng ? ` · ${ng} NG` : ''));
  el.append(h);
  const table = document.createElement('table');
  for (const r of doc.results) {
    const tr = table.insertRow();
    const mark = tr.insertCell();
    const status = r.status ?? (r.ok === true ? 'ok' : r.ok === false ? 'ng' : 'unchecked');
    mark.textContent = { ok: 'OK', ng: 'NG', unchecked: '--', measured: 'ME' }[/** @type {string} */ (status)] ?? '--';
    mark.className = status;
    tr.insertCell().textContent = r.path;
    tr.insertCell().textContent = r.check;
    tr.insertCell().textContent = r.reason || '';
  }
  el.append(table);
}

/** A form under the details that appends a note to the file. @param {View} v */
function addNoteForm(v) {
  const d = $('details');
  d.querySelector('.note-form')?.remove();
  const form = document.createElement('form');
  form.className = 'note-form';
  const input = document.createElement('input');
  input.placeholder = 'Add a note to the file (append-only)';
  const b = document.createElement('button');
  b.textContent = 'Add note';
  form.append(input, b);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !v.server) return;
    try {
      await send('POST', api('/api/note', v.server), { text });
      v.cap.notes.push({ time: new Date().toISOString(), content: text, by: 'viewer' });
      showDetails(v.cap);
      addNoteForm(v);
    } catch (error) { input.value = `${text}  (not added: ${error instanceof Error ? error.message : error})`; }
  });
  d.append(form);
}

/** The markers panel: go to, remove, save. */
function showMarkers() {
  const el = $('markers');
  el.innerHTML = '';
  const v = state;
  if (!v) return;
  const t = hz(v.cap.tickHz);
  el.hidden = false;
  const h = document.createElement('div');
  h.innerHTML = '<b>Markers</b> ';
  h.append(v.markers.length ? '' : 'none yet: press M to put one at the mouse position');
  if (v.dirty) {
    if (v.server) {
      const b = document.createElement('button');
      b.textContent = 'Save to the file';
      b.addEventListener('click', async () => {
        try {
          await send('PUT', api('/api/markers', /** @type {string} */ (v.server)), { markers: v.markers });
          v.dirty = false;
          showMarkers();
        } catch (error) { b.textContent = `Failed: ${error instanceof Error ? error.message : error}`; }
      });
      h.append(b);
    } else {
      h.append(' (changed here only: open the file through wireskein gui to save markers)');
    }
  }
  el.append(h);
  const sorted = [...v.markers].sort((a, b) => partOf(a) - partOf(b) || a.t - b.t);
  const many = v.base.parts.length > 1;
  for (const m of sorted) {
    const row = document.createElement('div');
    row.className = 'marker-row';
    const go = document.createElement('button');
    go.textContent = m.label;
    go.title = 'Go there';
    go.addEventListener('click', () => {
      showPart(v, partOf(m));
      const span = v.t1 - v.t0;
      const mid = m.end !== undefined ? (m.t + m.end) / 2 : m.t;
      v.t0 = mid - span / 2;
      v.t1 = mid + span / 2;
      draw();
    });
    const when = document.createElement('span');
    when.textContent = (many ? ` part ${partOf(m) + 1}:` : '') + ` ${fmtTime(m.t / t, 4)}` + (m.end !== undefined ? ` – ${fmtTime(m.end / t, 4)}` : '')
      + (m.note ? ` · ${m.note}` : '');
    const del = document.createElement('button');
    del.textContent = '×';
    del.title = 'Remove';
    del.addEventListener('click', () => {
      v.markers = v.markers.filter((x) => x !== m);
      v.dirty = true;
      showMarkers();
      draw();
    });
    row.append(go, when, del);
    el.append(row);
  }
}

/** Put a marker at a tick (asks for its name). @param {View} v @param {number} tick */
function addMarker(v, tick) {
  const label = prompt('Marker name', `M${v.markers.length + 1}`);
  if (label === null || !label.trim()) return;
  v.markers.push({ t: Math.round(tick), label: label.trim(), by: 'viewer', time: new Date().toISOString(),
                   ...(v.base.parts.length > 1 ? { part: v.base.part } : {}) });
  v.dirty = true;
  showMarkers();
  draw();
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
  if (ch.kind === 'events') return measureEvents(ch, tick, t);
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
  const { start, per } = timing(v, ch);
  const k = Math.min(ch.n - 1, Math.max(0, Math.round((tick - start) / per)));
  const vv = v.volts[index];
  const ends = clipEnds(ch);
  const raw = ch.values[k];
  let value = vv ? `${vv[k].toFixed(4)} ${ch.unit}` + (ch.encoding === 'analog' ? ` (raw ${raw})` : '')
    : `raw ${raw}`;
  if (vv && ends && raw === ends.low) value = `≤ ${ends.lowV.toFixed(3)} ${ch.unit}: clipped at the low end (raw ${raw})`;
  if (vv && ends && raw === ends.high) value = `≥ ${ends.highV.toFixed(3)} ${ch.unit}: clipped at the high end (raw ${raw})`;
  const al = alignmentOf(v, ch.name);
  return [`${ch.name}: ${value}`, `sample ${k} at ${fmtTime((start + k * per) / t, 4)}${al ? ' (aligned)' : ''}`];
}

// ---- analog timing ----

/** The alignment in use for a channel (none when switched off). @param {View} v @param {string} name */
function alignmentOf(v, name) {
  return v.aligned ? v.alignment?.get(name) ?? null : null;
}

/** First sample's tick and ticks per sample of an analog channel, aligned when in use. @param {View} v @param {AnalogChannel} ch */
function timing(v, ch) {
  const a = alignmentOf(v, ch.name);
  const start = alignedTick(ch, v.cap.tickHz, 0, a);
  const per = (hz(v.cap.tickHz) / hz(ch.rateHz)) * (a ? a.scale : 1);
  return { start, per };
}

// ---- drawing ----

function colors() {
  const s = getComputedStyle(document.body);
  const c = (/** @type {string} */ n) => s.getPropertyValue(n).trim();
  return { line: c('--line'), band: c('--band'), grid: c('--grid'), muted: c('--muted'), cursor: c('--cursor'),
           pulse: c('--pulse'), window: c('--window'), track: c('--track'), trigger: c('--trigger'),
           marker: c('--marker'), span: c('--span'), ok: c('--anno'), warn: c('--anno-warn'), error: c('--anno-error'),
           annoText: c('--anno-text'), busy: c('--busy') };
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
    drawMarkerSpans(g, v, x, h, col);
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
    if (v.trigger !== null) {                                // the trigger, across every row
      const px = Math.round(x(v.trigger)) + 0.5;
      g.strokeStyle = col.trigger;
      g.lineWidth = 1.5;
      g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(px, role === 'ruler' ? 9 : 0); g.lineTo(px, h); g.stroke();
      g.setLineDash([]);
      if (role === 'ruler') {
        g.fillStyle = col.trigger;
        g.beginPath(); g.moveTo(px - 5, 1); g.lineTo(px + 5, 1); g.lineTo(px, 9); g.fill();
        g.font = 'bold 11px system-ui, sans-serif';
        g.fillText('T', px + 6, 10);
        g.font = '12px system-ui, sans-serif';
        g.fillStyle = col.muted;
      }
    }
    drawMarkerLines(g, v, x, h, col, role === 'ruler');
    if (role === 'ruler') {
      if (v.cursor !== null) drawCursorTime(g, x(v.cursor), w, fmtTime(v.cursor / t), col);
      continue;
    }
    if (role === 'annotation') {
      drawAnnotations(g, v, v.rows[Number(canvas.dataset.row)], x, w, h, col);
      if (v.cursor !== null) {
        const px = Math.round(x(v.cursor)) + 0.5;
        g.strokeStyle = col.cursor;
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(px, 0); g.lineTo(px, h); g.stroke();
      }
      continue;
    }
    const index = Number(canvas.dataset.index);
    const ch = v.cap.channels[index];
    if (ch.kind === 'logic') drawLogic(g, v, index, ch, x, w, h, col);
    else if (ch.kind === 'events') drawEvents(g, v, index, ch, x, w, h, col);
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

/** Shaded marker spans (behind the traces). @param {CanvasRenderingContext2D} g @param {View} v @param {(t: number) => number} x @param {number} h @param {Colors} col */
function drawMarkerSpans(g, v, x, h, col) {
  g.fillStyle = col.span;
  for (const m of [...partMarkers(v), ...v.otherMarkers]) {
    if (m.end !== undefined) g.fillRect(x(m.t), 0, x(m.end) - x(m.t), h);
  }
}

/**
 * Marker lines; on the ruler, with their names.
 * @param {CanvasRenderingContext2D} g @param {View} v @param {(t: number) => number} x @param {number} h
 * @param {Colors} col @param {boolean} ruler
 */
function drawMarkerLines(g, v, x, h, col, ruler) {
  g.strokeStyle = col.marker;
  g.fillStyle = col.marker;
  g.lineWidth = 1.5;
  for (const m of [...partMarkers(v), ...v.otherMarkers]) {
    g.setLineDash(v.markers.includes(m) ? [] : [2, 3]);             // an added file's: dashed
    for (const tick of m.end !== undefined ? [m.t, m.end] : [m.t]) {
      const px = Math.round(x(tick)) + 0.5;
      g.beginPath(); g.moveTo(px, ruler ? 20 : 0); g.lineTo(px, h); g.stroke();
    }
    if (ruler) {
      g.font = 'bold 11px system-ui, sans-serif';
      g.fillText(m.label, x(m.t) + 3, 30);
    }
  }
  g.setLineDash([]);
  g.font = '12px system-ui, sans-serif';
}

/** The item of a row at a tick, or null (binary search on the start). @param {AnnotationRow} r @param {number} tick @param {number} slack ticks */
function itemAt(r, tick, slack) {
  let lo = 0, hi = r.items.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (r.items[m].s <= tick + slack) lo = m + 1; else hi = m; }
  for (let i = lo - 1; i >= 0 && i >= lo - 8; i--) {
    const it = r.items[i];
    if (tick <= (it.e ?? it.s) + slack) return it;
  }
  return null;
}

/**
 * One row of decoding annotations: boxes with their text where it fits, coloured by level.
 * @param {CanvasRenderingContext2D} g @param {View} v @param {AnnotationRow} r
 * @param {(t: number) => number} x @param {number} w @param {number} h @param {Colors} col
 */
function drawAnnotations(g, v, r, x, w, h, col) {
  if (!r) return;
  const items = r.items;
  let lo = 0, hi = items.length;                 // first item that may still be visible
  while (lo < hi) { const m = (lo + hi) >> 1; if ((items[m].e ?? items[m].s) < v.t0 - (v.t1 - v.t0)) lo = m + 1; else hi = m; }
  g.font = '11px ui-monospace, monospace';
  g.textBaseline = 'middle';
  let lastPx = -1;
  for (let i = Math.max(0, lo - 64); i < items.length; i++) {
    const it = items[i];
    if (it.s > v.t1) break;
    const a = x(it.s), b = x(it.e ?? it.s);
    if (b < 0) continue;
    const fill = it.level === 'error' ? col.error : it.level === 'warn' ? col.warn : col.ok;
    if (b - a < 3) {                               // too narrow for a box: a tick, one per pixel
      const px = Math.round(a);
      if (px === lastPx) continue;
      lastPx = px;
      g.fillStyle = fill;
      g.fillRect(px, 4, 1.5, h - 8);
      continue;
    }
    g.fillStyle = fill;
    g.fillRect(a, 3, b - a - 1, h - 6);
    g.strokeStyle = col.line;
    g.lineWidth = 0.5;
    g.strokeRect(a + 0.25, 3.25, b - a - 1.5, h - 6.5);
    const tw = g.measureText(it.text).width;
    if (tw + 6 < b - a) {
      g.fillStyle = col.annoText;
      g.fillText(it.text, Math.max(a, 0) + 3 > b - tw - 3 ? a + 3 : Math.max(a, 0) + 3, h / 2);
    }
  }
  g.textBaseline = 'alphabetic';
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
 * The steady stretch of an events channel around quantum q (none inside a quantum that changed): the quanta of the
 * events before and after it (null: the capture's start or end), and the event index before.
 * @param {EventsChannel} ch @param {number} q
 */
function eventStretch(ch, q) {
  const i = eventIndex(ch, q);
  return { i, prev: i >= 0 ? ch.quanta[i] : null, next: i + 1 < ch.quanta.length ? ch.quanta[i + 1] : null };
}

/**
 * What an events channel says at a tick (wireskein-format §4.4): the level between changes; in a quantum that
 * changed, how many times and the levels around it - never a level inside it that it does not know.
 * @param {EventsChannel} ch @param {number} tick @param {number} t ticks per second
 */
function measureEvents(ch, tick, t) {
  const q = Math.floor((tick - ch.phase) / ch.step);
  if (q < 0 || q >= ch.n) return [`${ch.name}: no samples here`];
  const name = (/** @type {number} */ lv) => (lv ? 'high' : 'low');
  const span = fmtTime(ch.step / t);
  const { i, prev, next } = eventStretch(ch, q);
  if (prev === q) {
    const before = i > 0 ? ch.levels[i - 1] : ch.startLevel;
    const c = ch.counts[i];
    return [`${ch.name}: ${c >= 127 ? 'at least 127 changes' : c === 1 ? '1 change' : `${c} changes`} in these ${span}`,
            `${name(before)} before, ${name(ch.levels[i])} at the end` + (c > 1 ? ' (the levels between: not kept)' : ''),
            `quantum ${q}: ${fmtTime((ch.phase + q * ch.step) / t, 4)} + ${span}`];
  }
  const level = i >= 0 ? ch.levels[i] : ch.startLevel;
  const out = [`${ch.name}: ${name(level)}`];
  if (prev === null || next === null) {
    out.push(`${name(level)} ${prev === null ? 'since the first sample' : 'until the last sample'}`);
    return out;
  }
  const err = ch.step > 1 ? ` ± ${span}` : '';
  const width = ((next - prev) * ch.step) / t;               // change to change, each somewhere in its quantum
  out.push(`this ${name(level)}: ${fmtTime(width)}${err}`);
  if (ch.counts[i] > 1 || ch.counts[i + 1] > 1) {
    out.push('a quantum at its end changed more than once: the pulses there are not known');
  } else if (i + 2 < ch.quanta.length && ch.counts[i + 2] === 1) {
    const after = ((ch.quanta[i + 2] - next) * ch.step) / t;
    const period = width + after;
    const high = level ? width : after;
    out.push(`next ${name(1 - level)}: ${fmtTime(after)}${err}`);
    out.push(`period ${fmtTime(period)} · ${fmtHz(1 / period)} · duty ${((high / period) * 100).toFixed(1)} %`);
  }
  return out;
}

/**
 * An events channel: the level as a line between changes; a change at step 1 as an edge; at a coarser step, a band
 * over the quantum it happened in (darker, with the count when it fits, where it changed more than once). Many
 * changes in one pixel column: one bar, full height.
 * @param {CanvasRenderingContext2D} g @param {View} v @param {number} index @param {EventsChannel} ch
 * @param {(t: number) => number} x @param {number} w @param {number} h @param {Colors} col
 */
function drawEvents(g, v, index, ch, x, w, h, col) {
  const { t0, t1 } = v;
  const y = (/** @type {number} */ lv) => (lv ? 10 : h - 10);
  const end = ch.phase + ch.n * ch.step;
  if (v.cursor !== null && v.lane === index && v.cursor >= ch.phase && v.cursor < end) {   // the stretch under the mouse
    const { prev, next } = eventStretch(ch, Math.floor((v.cursor - ch.phase) / ch.step));
    const a = x(prev === null ? ch.phase : ch.phase + prev * ch.step + (ch.step > 1 ? ch.step : 0));
    const b = x(next === null ? end : ch.phase + next * ch.step);
    g.fillStyle = col.pulse;
    g.fillRect(a, 0, b - a, h);
  }
  const q0 = Math.max(0, Math.floor((t0 - ch.phase) / ch.step));
  const q1 = Math.min(ch.n - 1, Math.ceil((t1 - ch.phase) / ch.step));
  let i = eventIndex(ch, q0 - 1) + 1;                         // the first event at or after q0
  let level = i > 0 ? ch.levels[i - 1] : ch.startLevel;
  let from = Math.max(ch.phase, t0);
  let lastPx = -Infinity;
  g.fillStyle = col.line;
  const flat = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ lv) => {
    if (b > a) g.fillRect(x(a), y(lv) - 0.75, Math.max(1, x(b) - x(a)), 1.5);
  };
  g.font = '11px system-ui, sans-serif';
  for (; i < ch.quanta.length && ch.quanta[i] <= q1; i++) {
    const q = ch.quanta[i], c = ch.counts[i], lv = ch.levels[i];
    const a = ch.phase + q * ch.step, b = a + ch.step;
    const px = Math.floor(x(a));
    if (px === lastPx) { level = lv; from = b; continue; }   // this pixel column already shows a change
    flat(from, a, level);
    lastPx = px;
    if (x(b) - x(a) < 2) {                                    // narrower than the line: a bar
      g.fillRect(px, y(1) - 0.75, 1, y(0) - y(1) + 1.5);
    } else if (ch.step === 1 && c === 1) {                    // the change at this tick
      g.fillRect(x(a) - 0.75, y(1) - 0.75, 1.5, y(0) - y(1) + 1.5);
    } else {                                                  // somewhere in this quantum
      g.fillStyle = c > 1 ? col.busy : col.band;
      g.fillRect(x(a), 4, x(b) - x(a), h - 8);
      g.fillStyle = col.line;
      g.fillRect(x(a), y(level) - 0.75, 1.5, 1.5);
      g.fillRect(x(b) - 1.5, y(lv) - 0.75, 1.5, 1.5);
      const label = c >= 127 ? '≥127' : `${c}`;
      if (c > 1 && g.measureText(label).width + 6 < x(b) - x(a)) {
        g.fillStyle = col.muted;
        g.fillText(label, x(a) + 3, h / 2 + 4);
        g.fillStyle = col.line;
      }
    }
    level = lv;
    from = b;
  }
  flat(from, Math.min(end, t1), level);
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
  const { start, per } = timing(v, ch);
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
  const ends = clipEnds(ch);
  if (ends && v.volts[index]) {                              // samples at an end of the converter: not voltages
    g.fillStyle = col.error;
    let last = -1;
    for (let k = k0; k <= k1; k++) {
      const raw = ch.values[k];
      if (raw !== ends.low && raw !== ends.high) continue;
      const px = Math.round(x(start + k * per));
      if (px === last) continue;
      last = px;
      const yy = y(vals[k]);
      const up = raw === ends.high;
      g.beginPath();                                         // a small triangle pointing past the end
      g.moveTo(px - 3.5, yy + (up ? 1 : -1));
      g.lineTo(px + 3.5, yy + (up ? 1 : -1));
      g.lineTo(px, yy + (up ? -5 : 5));
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

/** The tooltip's lines for an annotation row. @param {View} v @param {number} k @param {number} tick @param {number} slack */
function describeItem(v, k, tick, slack) {
  const r = v.rows[k];
  const it = r && itemAt(r, tick, slack);
  if (!it) return null;
  const t = hz(v.cap.tickHz);
  const out = [`${r.name}: ${it.text}`, `${fmtTime(it.s / t, 4)}` + (it.e !== undefined ? ` – ${fmtTime(it.e / t, 4)} (${fmtTime((it.e - it.s) / t)})` : '')];
  if (it.level && it.level !== 'ok') out.push(it.level);
  if (it.detail !== undefined) out.push(JSON.stringify(it.detail).slice(0, 160));
  return out;
}

function drawTip() {
  const tip = $('tip');
  if (!state || state.cursor === null || (state.lane === null && state.row === null)) { tip.hidden = true; return; }
  const sel = state.lane !== null ? `#lanes canvas[data-index="${state.lane}"]` : `#lanes canvas[data-row="${state.row}"]`;
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.querySelector(sel));
  if (!canvas) { tip.hidden = true; return; }
  const slack = ((state.t1 - state.t0) / canvas.clientWidth) * 3;
  const lines = state.lane !== null ? measure(state, state.lane, state.cursor)
    : describeItem(state, /** @type {number} */ (state.row), state.cursor, slack);
  if (!lines) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.innerHTML = '';
  for (const [i, line] of lines.entries()) {
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

/** Wheel, drag and hover on a row. @param {HTMLCanvasElement} canvas @param {number | null} index @param {number | null} [row] */
function attachInput(canvas, index, row = null) {
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
    state.row = row;
    redraw();
  });
  canvas.addEventListener('pointerleave', () => {
    if (!state || from !== null) return;
    state.cursor = null;
    state.lane = null;
    state.row = null;
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
    '[': () => { if (state) showPart(state, state.base.part - 1); },
    ']': () => { if (state) showPart(state, state.base.part + 1); },
    m: () => { if (state && state.cursor !== null) addMarker(state, state.cursor); },
    M: () => { if (state && state.cursor !== null) addMarker(state, state.cursor); },
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
      const rel = url.pathname.startsWith('/files/') ? decodeURIComponent(url.pathname.slice(7)) : null;
      return open({ name: decodeURIComponent(url.pathname.split('/').pop() ?? 'capture.wireskein'), arrayBuffer: () => r.arrayBuffer() }, rel);
    }).catch((error) => { $('summary').hidden = false; $('summary').textContent = `${fileParam}: ${error.message}`; });
  }
}
document.title = `WireSkein viewer ${VERSION}`;
