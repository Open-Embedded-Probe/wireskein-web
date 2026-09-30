# wireskein-web

English | [日本語](README.ja.md)

**Public links:** [Viewer](https://open-embedded-probe.github.io/wireskein-web/) ·
[npm package](https://www.npmjs.com/package/wireskein-web) ·
[Changelog](CHANGELOG.md) ·
[WireSkein](https://github.com/Open-Embedded-Probe/wireskein)

The browser side of [WireSkein](https://github.com/Open-Embedded-Probe/wireskein): read logic-analyzer capture files
(`.wsc`) and show them. The analysis (decoding, checks, capture from probes) runs in the `wireskein` Python package; its
`wireskein gui` command serves a build of this library.

Status: **beta**.

## Viewer

Open the [viewer](https://open-embedded-probe.github.io/wireskein-web/) and drop a `.wsc` file. The file stays in the
browser. You get:

- logic and analog lanes on a time axis; zoom with the wheel or + −, scroll in time with Shift + wheel, a trackpad
  swipe, drag or ← →, double-click or Home to fit, and an overview strip of the whole capture;
- hover a logic lane to measure the pulse under the mouse and the next one: widths, period, frequency and duty;
  hover an analog lane for the sample's value;
- dots on the samples the probe really took; a channel recorded at a lower rate (a probe that decimates some channels)
  shows only its own samples, and a shaded band before each of its edges shows where the change happened;
- the capture's metadata, each channel's acquisition settings (pin, input range, reference, ...), attachments and notes.

## Library

```sh
npm install wireskein-web
```

```js
import { readWsc, levelAt, edges, volts, analogTick } from 'wireskein-web';

const cap = await readWsc(new Uint8Array(await file.arrayBuffer()));
for (const ch of cap.channels) {
  if (ch.kind === 'logic') console.log(ch.name, ch.step, edges(ch).slice(0, 5));   // edge ticks
  else console.log(ch.name, ch.rateHz, volts(ch)?.slice(0, 5));                     // volts, if convertible
}
```

- `readWsc(bytes)` returns the tick clock (`tickHz`, a `[numerator, denominator]` pair), the length in ticks, the
  channels, `skipped` (channels of encodings this version does not read), `meta`, `attachments` and `notes`.
- Logic channels hold one bit per sample (`levelAt(ch, k)`); sample k is at tick `phase + k * step`.
- Analog channels hold raw values (`encoding: "analog"`, with `zero` / `scaleNv`) or volts (`"analog-f32"`); sample k
  is at tick `analogTick(ch, cap.tickHz, k)`.
- No dependencies. Deflate is undone with the platform's `DecompressionStream` (current browsers, Node.js 22 or later).

The file format is specified in WireSkein's [docs/wsc-format.ja.md](https://github.com/Open-Embedded-Probe/wireskein/blob/main/docs/wsc-format.ja.md).

## Development

```sh
npm install
npm run check        # tests and type checking (JavaScript with JSDoc types, checked by tsc)
npm run serve        # the viewer at http://localhost:4173/
```

Release: see [docs/release.md](docs/release.md).

## License

MIT
