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

- logic and analog lanes on a time axis; zoom with the wheel or + −, scroll in time with Shift + wheel, a trackpad
  swipe, drag or ← →, double-click or Home to fit, and an overview strip of the whole capture;
- hover a logic lane to measure the pulse under the mouse and the next one: widths, period, frequency and duty;
  hover an analog lane for the sample's value;
- dots on the samples the probe really took; a channel recorded at a lower rate (a probe that decimates some channels)
  shows only its own samples, and a shaded band before each of its edges shows where the change happened;
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
- It returns the tick clock (`tickHz`, a `[numerator, denominator]` pair), the length in ticks, the
  channels, `skipped` (channels of encodings this version does not read), `meta`, `attachments` and `notes`.
- Logic channels hold one bit per sample (`levelAt(ch, k)`); sample k is at tick `phase + k * step`.
- Analog channels hold raw values (`encoding: "analog"`, with `zero` / `scaleNv`) or volts (`"analog-f32"`); sample k
  is at tick `analogTick(ch, cap.tickHz, k)`.
- No dependencies. Deflate is undone with the platform's `DecompressionStream` (current browsers, Node.js 22 or later).

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
