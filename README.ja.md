# wireskein-web

[English](README.md) | 日本語

**公開先:** [ビューア](https://open-embedded-probe.github.io/wireskein-web/) ·
[npm](https://www.npmjs.com/package/wireskein-web) ·
[変更履歴](CHANGELOG.md) ·
[WireSkein](https://github.com/Open-Embedded-Probe/wireskein)

[WireSkein](https://github.com/Open-Embedded-Probe/wireskein) のブラウザ側です。ロジックアナライザのキャプチャのファイル（`.wsc`）を読んで表示します。解析（復号、照合、プローブからの取得）は、Python の `wireskein` が行います。`wireskein gui` のコマンドは、このライブラリのビルドを同梱して表示します。

状態: **β 版**です。

## ビューア

[ビューア](https://open-embedded-probe.github.io/wireskein-web/) を開き、`.wsc` を落とします。ファイルは、ブラウザの外に出ません。次のものが見られます。

- ロジックとアナログの行。ホイールで拡大・縮小、ドラッグで移動、ダブルクリックで全体に戻ります。
- プローブが実際に取ったサンプルの点。
  - 低いレートで記録したチャンネル（一部のチャンネルを間引くプローブ）は、自分のサンプルだけを見せます。
  - そのチャンネルのエッジの前には、変化が起きた可能性のある区間を、薄い帯で示します。
- キャプチャのメタ情報、チャンネルごとの取得の設定（ピン、入力範囲、基準電圧など）、添付、メモ。

## ライブラリ

```sh
npm install wireskein-web
```

```js
import { readWsc, levelAt, edges, volts, analogTick } from 'wireskein-web';

const cap = await readWsc(new Uint8Array(await file.arrayBuffer()));
for (const ch of cap.channels) {
  if (ch.kind === 'logic') console.log(ch.name, ch.step, edges(ch).slice(0, 5));   // エッジの刻み
  else console.log(ch.name, ch.rateHz, volts(ch)?.slice(0, 5));                     // 電圧（換算できれば）
}
```

- `readWsc(bytes)` は、次のものを返します。
  - 刻みの周波数（`tickHz`、`[分子, 分母]`）と、刻みで数えた長さ
  - チャンネルの一覧
  - `skipped`（この版が読めない形のチャンネル）
  - `meta`、`attachments`、`notes`
- ロジックのチャンネルは、1 サンプル 1 ビットです（`levelAt(ch, k)`）。サンプル k は、刻み `phase + k * step` にあります。
- アナログのチャンネルは、生の値（`encoding: "analog"`。`zero` と `scaleNv` 付き）か、電圧（`"analog-f32"`）です。サンプル k は、刻み `analogTick(ch, cap.tickHz, k)` にあります。
- 依存はありません。deflate は、ブラウザ標準の `DecompressionStream` で展開します（今のブラウザ、Node.js 22 以降）。

形式の仕様は、WireSkein の [docs/wsc-format.ja.md](https://github.com/Open-Embedded-Probe/wireskein/blob/main/docs/wsc-format.ja.md) にあります。

## 開発

```sh
npm install
npm run check        # テストと型のチェック（JavaScript と JSDoc の型を tsc で確かめる）
npm run serve        # ビューアを http://localhost:4173/ で開く
```

リリースの手順: [docs/release.ja.md](docs/release.ja.md)

## ライセンス

MIT
