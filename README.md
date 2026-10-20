# wireskein-web

English | [日本語](README.ja.md)

**Public links:** [Viewer](https://open-embedded-probe.github.io/wireskein-web/) ·
[npm package](https://www.npmjs.com/package/wireskein-web) ·
[Changelog](CHANGELOG.md) ·
[WireSkein](https://github.com/Open-Embedded-Probe/wireskein)

The browser side of [WireSkein](https://github.com/Open-Embedded-Probe/wireskein): read WireSkein files
(`.wireskein`, logic-analyzer captures) and show them. The analysis (decoding, checks, capture from probes) runs in the `wireskein` Python package; its
`wireskein gui` command serves a build of this library.

Status: **beta**.

## Viewer

Open the [viewer](https://open-embedded-probe.github.io/wireskein-web/) and drop a `.wireskein` file or a sigrok `.sr` (told
apart by content, not by name). The file stays in the browser. You get:

- a capture that lost data (`complete: false`) first says so in red: it failed, what was taken is kept, and what was
  lost (after which part, how long, why);
- a capture in parts (wireskein-format §3.4): a stream cut by its gaps (timeline) on one time axis, where data was
  lost shaded red (also in the overview strip) and time not taken grey, the tabs going to a part (a checkbox shows one
  part at a time instead, `&joined=0`); one acquisition per trigger (segments) as tabs; [ and ] move between parts,
  `&part=K` opens one; markers and decoding annotations belong to their part (on one axis, a row's parts in one lane);
- logic and analog lanes on a time axis; zoom with the wheel or + −, scroll in time with Shift + wheel, a trackpad
  swipe, drag or ← →, double-click or Home to fit, and an overview strip of the whole capture;
- hover a logic lane to measure the pulse under the mouse and the next one: widths, period, frequency and duty;
  hover an analog lane for the sample's value;
- dots on the samples the probe really took; a channel recorded at a lower rate (a probe that decimates some channels)
  shows only its own samples, and a shaded band before each of its edges shows where the change happened; a line kept
  as its changes (events, OEP capture format 1) shows a band over each quantum it changed in, darker with the count
  where it changed more than once, and the tooltip says only what is known (the changes, the levels around them);
- analog channels on the aligned time when the file has an alignment from `wireskein align` (a checkbox switches
  back to the probe's times);
- decoding annotations (I2C transactions, UART characters, ...) in rows under their data line, from the file's
  `decode/annotations.json` (`wireskein annotate --save`) or, under `wireskein gui`, decoded on request;
- another probe's capture on the same time axis ("Add another probe's file", or `&with=`): aligned when it holds an
  alignment onto this file from `wireskein align --to`, else drawn from this file's start and marked so;
- markers: M puts one at the mouse, the panel goes to or removes them; they are saved into the file under
  `wireskein gui`;
- under `wireskein gui`, the run's check results for a capture of a recorded run (OK / NG and why), and a form that
  appends a note to the file;
- the capture's metadata, each channel's acquisition settings (pin, input range, reference, ...), attachments and notes.

## Library

```sh
npm install wireskein-web
```

```js
import { readCapture, levelAt, edges, volts, analogTick } from 'wireskein-web';

const cap = await readCapture(new Uint8Array(await file.arrayBuffer()));
for (const ch of cap.channels) {
  if (ch.kind === 'logic') console.log(ch.name, ch.step, edges(ch).slice(0, 5));   // edge ticks
  else console.log(ch.name, ch.rateHz, volts(ch)?.slice(0, 5));                     // volts, if convertible
}
```

- `readCapture(bytes)` reads a WireSkein file or a sigrok `.sr`, whatever its name (`sniff(bytes)` tells which;
  `readWireskein` and `readSr` read one kind). A `.sr` written by wireskein gets its channels back at their own rates
  (the real step, the raw analog values, the metadata); any other `.sr` has every channel at the file's rate.
- It returns the capture seen at its first part: the tick clock (`tickHz`, a `[numerator, denominator]` pair), the
  part's length in ticks, channels and `meta` (the capture's with the part's on top), and for the whole file `parts`,
  `layout` (`"timeline"` / `"segments"`), `complete`, `lost`, `skipped` (channels of encodings this version does not
  read), `attachments` and `notes`. `selectPart(cap, k)` shows part k.
- `complete: false` means data was lost while capturing (`lost`: after which part, how many ticks, why): the capture
  failed and a reader says so.
- Logic channels hold one bit per sample (`levelAt(ch, k)`); sample k is at tick `phase + k * step`.
- Events channels (`kind: "events"`, OEP capture format 1) hold a line's changes per quantum of `step` ticks from
  `phase`: per event its quantum (`quanta`), the level at its end (`levels`) and how many times it changed in it
  (`counts`, 127 = at least 127), with `startLevel` before quantum 0. `eventEdges(ch)` gives the ticks of the changes
  that moved it (each quantum's last tick, as wireskein counts), `levelAfter(ch, q)` the level at quantum q's end.
- Analog channels hold raw values (`encoding: "analog"`, with `zero` / `scaleNv`) or volts (`"analog-f32"`); sample k
  is at tick `analogTick(ch, cap.tickHz, k)`.
- No dependencies. Deflate is undone with the platform's `DecompressionStream` (current browsers, Node.js 22 or later).
- The public API is what the package root exports (`import ... from 'wireskein-web'`); files under `src/` are not an
  entry point.
- JavaScript names are camelCase; the keys in the file (and in Python) are snake_case:

  | JavaScript | In the file |
  | --- | --- |
  | `tickHz`, `rateHz`, `t0Ticks` | `tick_hz`, `rate_hz`, `t0_ticks` |
  | `valueBits`, `scaleNv` | `value_bits`, `scale_nv` |
  | `id` | `capture.json` `id` |
  | `startLevel` (events) | `start_level` |
  | `afterPart` (lost) | `after_part` |
  | `offsetTicks` (alignment) | `offset_ticks` |

The file format is specified in WireSkein's [docs/wireskein-format.ja.md](https://github.com/Open-Embedded-Probe/wireskein/blob/main/docs/wireskein-format.ja.md).

## Development

```sh
npm install
npm run check        # tests and type checking (JavaScript with JSDoc types, checked by tsc)
npm run serve        # the viewer at http://localhost:4173/
```

Release: see [docs/release.md](docs/release.md).

## License

MIT
