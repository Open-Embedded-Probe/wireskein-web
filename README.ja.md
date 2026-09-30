# wireskein-web

[English](README.md) | 日本語

**公開先:** [ビューア](https://open-embedded-probe.github.io/wireskein-web/) ·
[npm](https://www.npmjs.com/package/wireskein-web) ·
[変更履歴](CHANGELOG.md) ·
[WireSkein](https://github.com/Open-Embedded-Probe/wireskein)

[WireSkein](https://github.com/Open-Embedded-Probe/wireskein) のブラウザ側です。ロジックアナライザのキャプチャのファイル（`.wireskein`）を読んで表示します。解析（復号、照合、プローブからの取得）は、Python の `wireskein` が行います。`wireskein gui` のコマンドは、このライブラリのビルドを同梱して表示します。

状態: **β 版**です。

## ビューア

[ビューア](https://open-embedded-probe.github.io/wireskein-web/) を開き、`.wireskein` か sigrok の `.sr` を落とします（名前ではなく中身で見分けます）。ファイルは、ブラウザの外に出ません。次のものが見られます。

- 時間軸つきの、ロジックとアナログの行。
  - ホイールか + − で拡大・縮小します。
  - Shift + ホイール、トラックパッドの横スワイプ、ドラッグ、← → で時間方向に移動します。
  - ダブルクリックか Home で全体に戻ります。時間軸の下の帯は、キャプチャ全体です。
- ロジックの行にマウスを重ねると、その位置のパルスと次のパルスの幅、周期、周波数、デューティを示します。アナログの行では、サンプルの値を示します。
- プローブが実際に取ったサンプルの点。
  - 低いレートで記録したチャンネル（一部のチャンネルを間引くプローブ）は、自分のサンプルだけを見せます。
  - そのチャンネルのエッジの前には、変化が起きた可能性のある区間を、薄い帯で示します。
- `wireskein align` の合わせ込みがファイルにあれば、アナログのチャンネルを合わせた時刻で表示します（チェックボックスで、プローブの時刻に戻せます）。
- 復号の注釈（I2C の取引、UART の文字など）を、データの線の下の行に示します。ファイルの `decode/annotations.json`（`wireskein annotate --save`）から読むか、`wireskein gui` 経由なら、その場で復号します。
- 別のプローブのキャプチャを、同じ時間軸に並べます（「Add another probe's file」か `&with=`）。`wireskein align --to` の合わせ込みが入っていればそれで合わせ、なければこのファイルの開始にそろえて、合わせていないと示します。
- マーカー: M でマウスの位置に付け、一覧から移動・削除できます。`wireskein gui` 経由なら、ファイルに保存できます。
- `wireskein gui` 経由では、記録した run の中のキャプチャについて、照合の結果（OK / NG と理由）を示します。メモをファイルに追記する欄もあります。
- キャプチャのメタ情報、チャンネルごとの取得の設定（ピン、入力範囲、基準電圧など）、添付、メモ。

## ライブラリ

```sh
npm install wireskein-web
```

```js
import { readCapture, levelAt, edges, volts, analogTick } from 'wireskein-web';

const cap = await readCapture(new Uint8Array(await file.arrayBuffer()));
for (const ch of cap.channels) {
  if (ch.kind === 'logic') console.log(ch.name, ch.step, edges(ch).slice(0, 5));   // エッジの刻み
  else console.log(ch.name, ch.rateHz, volts(ch)?.slice(0, 5));                     // 電圧（換算できれば）
}
```

- `readCapture(bytes)` は、名前にかかわらず、WireSkein のファイルか sigrok の `.sr` を読みます（どちらかは `sniff(bytes)` で分かります。片方だけなら `readWireskein` と `readSr`）。
  - wireskein が書いた `.sr` は、チャンネルを自分のレートに戻します（本当の `step`、アナログの生の値、メタ情報）。
  - ほかの `.sr` は、全チャンネルがファイルのレートです。
- 返すものは、次のとおりです。
  - 刻みの周波数（`tickHz`、`[分子, 分母]`）と、刻みで数えた長さ
  - チャンネルの一覧
  - `skipped`（この版が読めない形のチャンネル）
  - `meta`、`attachments`、`notes`
- ロジックのチャンネルは、1 サンプル 1 ビットです（`levelAt(ch, k)`）。サンプル k は、刻み `phase + k * step` にあります。
- アナログのチャンネルは、生の値（`encoding: "analog"`。`zero` と `scaleNv` 付き）か、電圧（`"analog-f32"`）です。サンプル k は、刻み `analogTick(ch, cap.tickHz, k)` にあります。
- 依存はありません。deflate は、ブラウザ標準の `DecompressionStream` で展開します（今のブラウザ、Node.js 22 以降）。

形式の仕様は、WireSkein の [docs/wireskein-format.ja.md](https://github.com/Open-Embedded-Probe/wireskein/blob/main/docs/wireskein-format.ja.md) にあります。

## 開発

```sh
npm install
npm run check        # テストと型のチェック（JavaScript と JSDoc の型を tsc で確かめる）
npm run serve        # ビューアを http://localhost:4173/ で開く
```

リリースの手順: [docs/release.ja.md](docs/release.ja.md)

## ライセンス

MIT
