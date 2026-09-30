# Changelog

## Unreleased

- (EN) Another probe's capture on the same time axis: `fileAlignment(other, reference, name)` (checks the reference's capture.json SHA-256) and `onto(reference, other, entry, prefix)`; the viewer's "Add another probe's file" (and `&with=URL`) draws its channels under a `name:` prefix, aligned when the file holds an alignment from `wireskein align --to`, else from this file's start and marked NOT aligned.
- (JA) 別のプローブのキャプチャを同じ時間軸に: `fileAlignment(other, reference, name)`（基準の capture.json の SHA-256 を確かめる）と `onto(reference, other, entry, prefix)`。ビューアの「Add another probe's file」（と `&with=URL`）は、そのチャンネルを `名前:` を付けて描く。`wireskein align --to` の合わせ込みがあればそれで合わせ、なければこのファイルの開始にそろえ、合わせていないと示す。
- (EN) Markers and decoding annotations (wireskein-format §5.2, §5.3): `readMarkers(cap)`, `readAnnotations(cap or document)`, and `cap.parts` (the file's markers/ and decode/ entries). The viewer draws annotation rows under their data line (boxes with text where it fits, coloured by level; hover for the details), and markers across the rows (M puts one at the mouse; a panel goes to or removes them).
- (JA) マーカーと復号の注釈（wireskein-format §5.2、§5.3）: `readMarkers(cap)`、`readAnnotations(cap または文書)`、`cap.parts`（ファイルの markers/ と decode/ の項目）。ビューアは、注釈の行をデータの線の下に描き（入る所は文字付きの箱、レベルで色分け、マウスで詳細）、マーカーを行をまたいで描く（M でマウスの位置に付け、一覧から移動・削除）。
- (EN) Under `wireskein gui`: annotations decoded on request (with a button to store them in the file), the run's check results for a capture in a recorded run, markers saved into the file, and a form that appends a note.
- (JA) `wireskein gui` 経由のとき: その場での復号（ファイルに入れるボタン付き）、記録した run の中のキャプチャの照合結果、マーカーのファイルへの保存、メモを追記する欄。
## 0.0.4

- (EN) Time alignment from `wireskein align` (attach/alignment.json, `wireskein-alignment/0`): `readAlignment(cap)` and `alignedTick(ch, tickHz, k, a)`. The viewer draws analog channels on the aligned time, with a checkbox (and `&aligned=0`) for the probe's times; the summary shows the reference, the start shift, the scale and the residual. An alignment of an unknown format is not used.
- (JA) `wireskein align` の時刻の合わせ込み（attach/alignment.json、`wireskein-alignment/0`）: `readAlignment(cap)` と `alignedTick(ch, tickHz, k, a)`。ビューアは、アナログのチャンネルを合わせた時刻で描く（チェックボックスと `&aligned=0` で、プローブの時刻に戻せる）。概要に、基準、開始のずれ、倍率、残りの誤差を出す。知らない形式の合わせ込みは使わない。
## 0.0.3

- (EN) Viewer: the trigger is drawn as a dashed line marked T across the rows, and its time is in the summary. It comes from the logic segment's `trigger_index` (meta), an analog channel's `acquisition.trigger_index`, or `meta.probe.trigger_ns` against `meta.start_ns`.
- (JA) ビューア: トリガの位置を、行をまたぐ T の付いた破線で示し、その時刻を概要に出す。ロジックの区画の `trigger_index`（meta）、アナログのチャンネルの `acquisition.trigger_index`、または `meta.probe.trigger_ns` と `meta.start_ns` から求める。
## 0.0.2

- (EN) Reads sigrok `.sr` too: `readCapture(bytes)` opens a WireSkein file or a `.sr` by content (`sniff(bytes)`, `readSr(bytes)`), and so does the viewer. A `.sr` written by wireskein gets its channels back at their own rates (the real step, the raw analog values, the metadata, attachments and notes); any other `.sr` has every named channel at the file's rate, analog as volts.
- (JA) sigrok の `.sr` も読む: `readCapture(bytes)` は、中身で WireSkein のファイルか `.sr` かを見分けて読む（`sniff(bytes)`、`readSr(bytes)`）。ビューアも同じ。wireskein が書いた `.sr` は、チャンネルを自分のレートに戻す（本当の `step`、アナログの生の値、メタ情報、添付、メモ）。ほかの `.sr` は、名前の付いたチャンネルをファイルのレートで、アナログは電圧で読む。
- (EN) **Breaking: reads the `.wireskein` format (`wireskein/0`, wireskein 0.0.8 or later)** instead of `.wsc` (`wireskein-capture/0`), whose extension is Windows Script Component's. `readWsc` is now `readWireskein`. Files are told apart by their content (`wireskein.json`), not their name; other files, newer versions and files without a capture are refused with a clear message.
- (JA) **互換のない変更: `.wsc`（`wireskein-capture/0`）に代えて、`.wireskein`（`wireskein/0`、wireskein 0.0.8 以降）を読む**（`.wsc` は Windows Script Component の拡張子）。`readWsc` は `readWireskein` にした。ファイルは名前ではなく中身（`wireskein.json`）で見分ける。ほかのファイル、新しい版、キャプチャのないファイルは、分かるメッセージで断る。
- (EN) Viewer: a time axis with 1-2-5 labels and grid lines across the lanes; an overview strip of the whole capture (click or drag to move there); taller lanes. Hover a logic lane to measure: the width of the pulse under the mouse and of the next one, the period, the frequency and the duty (± one sample on a decimated channel), with the pulse highlighted; hover an analog lane for the sample's value. Scroll in time with Shift + wheel, a trackpad swipe, drag or ← →; + − zoom, Home fits. `&cursor=TICK,CHANNEL` puts the cursor there (screenshots).
- (JA) ビューア: 1-2-5 の目盛りの時間軸と、行をまたぐ格子線。キャプチャ全体の帯（押すかドラッグでその位置へ移動）。行を高くした。ロジックの行にマウスを重ねると、その位置のパルスと次のパルスの幅、周期、周波数、デューティを示す（間引いたチャンネルは ± 1 サンプル）。そのパルスは色を付けて示す。アナログの行では、サンプルの値を示す。時間方向の移動は、Shift + ホイール、トラックパッドの横スワイプ、ドラッグ、← →。拡大・縮小は + −、Home で全体に戻る。`&cursor=TICK,CHANNEL` でカーソルを置ける（スクリーンショット用）。

## 0.0.1

- (EN) First release. Read WireSkein capture files (`.wsc`, format `wireskein-capture/0`) in the browser or Node.js: logic channels with their own sample step, analog channels (raw values with the linear conversion, or volts) with their own rate and start, acquisition settings, metadata, attachments and notes; channels of encodings this version does not read are skipped and named, never misread. No dependencies: deflate is undone with the platform's `DecompressionStream`.
- (JA) 最初のリリース。WireSkein のキャプチャのファイル（`.wsc`、形式 `wireskein-capture/0`）を、ブラウザか Node.js で読む。自分のサンプルの間隔を持つロジックのチャンネル、自分のレートと開始時刻を持つアナログのチャンネル（生の値と 1 次式、または電圧）、取得の設定、メタ情報、添付、メモ。この版が読めない形のチャンネルは、読み飛ばして名前を示す（誤って読まない）。依存なし（deflate はブラウザ標準の `DecompressionStream` で展開）。
- (EN) A viewer page (GitHub Pages, and the `site/` directory in the npm package for `wireskein gui`): open or drop a `.wsc`, see logic and analog lanes, zoom and pan, dots on the samples the probe really took, shaded bands where an edge of a decimated channel happened, and the metadata, acquisition settings, attachments and notes. The file stays in the browser. `?file=URL` (same origin) opens a capture and `&view=T0,T1` sets the range in ticks, for `wireskein gui` and links.
- (JA) ビューアのページ（GitHub Pages と、`wireskein gui` 用に npm の配布物に入れる `site/`）: `.wsc` を開くか落とすと、ロジックとアナログの行を表示し、拡大と移動、プローブが実際に取ったサンプルの点、間引いたチャンネルのエッジが起きた区間の帯、メタ情報、取得の設定、添付、メモを見られる。ファイルはブラウザの外に出ない。`?file=URL`（同じ origin）でキャプチャを開き、`&view=T0,T1` で表示の範囲を刻みで指定できる（`wireskein gui` やリンク用）。
