# Changelog

## Unreleased

- (EN) Viewer: a time axis with 1-2-5 labels and grid lines across the lanes; an overview strip of the whole capture (click or drag to move there); taller lanes. Hover a logic lane to measure: the width of the pulse under the mouse and of the next one, the period, the frequency and the duty (± one sample on a decimated channel), with the pulse highlighted; hover an analog lane for the sample's value. Scroll in time with Shift + wheel, a trackpad swipe, drag or ← →; + − zoom, Home fits. `&cursor=TICK,CHANNEL` puts the cursor there (screenshots).
- (JA) ビューア: 1-2-5 の目盛りの時間軸と、行をまたぐ格子線。キャプチャ全体の帯（押すかドラッグでその位置へ移動）。行を高くした。ロジックの行にマウスを重ねると、その位置のパルスと次のパルスの幅、周期、周波数、デューティを示す（間引いたチャンネルは ± 1 サンプル）。そのパルスは色を付けて示す。アナログの行では、サンプルの値を示す。時間方向の移動は、Shift + ホイール、トラックパッドの横スワイプ、ドラッグ、← →。拡大・縮小は + −、Home で全体に戻る。`&cursor=TICK,CHANNEL` でカーソルを置ける（スクリーンショット用）。

## 0.0.1

- (EN) First release. Read WireSkein capture files (`.wsc`, format `wireskein-capture/0`) in the browser or Node.js: logic channels with their own sample step, analog channels (raw values with the linear conversion, or volts) with their own rate and start, acquisition settings, metadata, attachments and notes; channels of encodings this version does not read are skipped and named, never misread. No dependencies: deflate is undone with the platform's `DecompressionStream`.
- (JA) 最初のリリース。WireSkein のキャプチャのファイル（`.wsc`、形式 `wireskein-capture/0`）を、ブラウザか Node.js で読む。自分のサンプルの間隔を持つロジックのチャンネル、自分のレートと開始時刻を持つアナログのチャンネル（生の値と 1 次式、または電圧）、取得の設定、メタ情報、添付、メモ。この版が読めない形のチャンネルは、読み飛ばして名前を示す（誤って読まない）。依存なし（deflate はブラウザ標準の `DecompressionStream` で展開）。
- (EN) A viewer page (GitHub Pages, and the `site/` directory in the npm package for `wireskein gui`): open or drop a `.wsc`, see logic and analog lanes, zoom and pan, dots on the samples the probe really took, shaded bands where an edge of a decimated channel happened, and the metadata, acquisition settings, attachments and notes. The file stays in the browser. `?file=URL` (same origin) opens a capture and `&view=T0,T1` sets the range in ticks, for `wireskein gui` and links.
- (JA) ビューアのページ（GitHub Pages と、`wireskein gui` 用に npm の配布物に入れる `site/`）: `.wsc` を開くか落とすと、ロジックとアナログの行を表示し、拡大と移動、プローブが実際に取ったサンプルの点、間引いたチャンネルのエッジが起きた区間の帯、メタ情報、取得の設定、添付、メモを見られる。ファイルはブラウザの外に出ない。`?file=URL`（同じ origin）でキャプチャを開き、`&view=T0,T1` で表示の範囲を刻みで指定できる（`wireskein gui` やリンク用）。
