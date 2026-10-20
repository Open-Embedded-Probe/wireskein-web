# Changelog

## Unreleased

- (EN) A timeline's parts on one time axis (the default for a stream cut by its gaps): each lane draws every part's channel at its tick0, where data was lost shaded red (and marked in the overview strip), time not taken grey; the tooltip there says LOST and why. Tabs and [ ] go to a part; a checkbox (`&joined=0`) shows one part at a time. Markers, annotation rows (one lane per row across the parts) and the trigger are put on the same axis; under `wireskein gui` every part is decoded.
- (JA) timeline の区間を 1 本の時間軸に並べる（隙間で区切ったストリームの既定）: 各レーンは、区間ごとのチャンネルをその tick0 に描く。データが落ちた所は赤く（全体の帯にも印）、取っていない所は灰色にし、そこでのマウスの説明は LOST とその理由を出す。タブと [ ] はその区間へ移る。チェックボックス（`&joined=0`）で 1 区間ずつにも見られる。マーカー、注釈の行（区間をまたいで 1 行）、トリガも同じ時間軸に載せる。`wireskein gui` 経由では、すべての区間を復号する。
- (EN) **Breaking (follows wireskein's file layout; the format name stays `wireskein/1` until its official release):** a capture is one or more parts (wireskein-format §3.4). `readWireskein` returns the capture seen at its first part (`ticks`, `channels`, `meta` are the part's; the capture's own meta is `fileMeta`) with `parts`, `layout` (`timeline` / `segments`), `complete` and `lost`; `selectPart(cap, k)` shows another part. The markers / decode entries map is now `entries` (`parts` is the parts). A file without parts (written before) is refused with a clear message.
- (JA) **互換のない変更（wireskein のファイルの配置に合わせる。形式の名前は、公式リリースまで `wireskein/1` のまま）:** キャプチャは 1 つ以上の区間（wireskein-format §3.4）。`readWireskein` は、最初の区間から見たキャプチャを返す（`ticks`、`channels`、`meta` はその区間のもの。キャプチャ自身の meta は `fileMeta`）。あわせて `parts`、`layout`（`timeline` / `segments`）、`complete`、`lost` を持つ。`selectPart(cap, k)` で別の区間から見る。マーカーと復号の項目の Map は `entries` に改めた（`parts` は区間）。区間の無いファイル（前の書き手のもの）は、分かるメッセージで断る。
- (EN) A capture that lost data is shown as a failure: a red INCOMPLETE banner first, with what was lost (after which part, how long, why; the first three and the last of many). Parts are tabs (a timeline's losses and gaps between them); [ and ] move between them and `&part=K` opens one.
- (JA) データが落ちたキャプチャは、失敗として示す: 最初に赤い INCOMPLETE の帯を出し、何が落ちたか（どの区間の後、長さ、理由。多いときは最初の 3 件と最後の 1 件）を添える。区間はタブで切り替える（timeline では、タブの間に落ちた長さと取っていない長さ）。[ と ] で移り、`&part=K` でその区間を開く。
- (EN) Events channels (`encoding: "events"`, OEP capture format 1, wireskein-format §4.4) are read as `kind: "events"` (`quanta`, `levels`, `counts`, `startLevel`; `eventEdges`, `eventIndex`, `levelAfter`); data that does not follow (a level against its count's parity, past the channel, cut short) is refused. The viewer draws a band over each quantum the line changed in, darker with the count where it changed more than once, and measures pulses between changes (± a quantum).
- (JA) events のチャンネル（`encoding: "events"`、OEP の形式 1、wireskein-format §4.4）を `kind: "events"`（`quanta`、`levels`、`counts`、`startLevel`。`eventEdges`、`eventIndex`、`levelAfter`）として読む。辻褄の合わないデータ（回数の偶奇とレベルが合わない、チャンネルを越える、途中で切れる）は断る。ビューアは、線が変わった刻みを帯で描き、2 回以上変わった刻みは濃くして回数を添え、変化と変化の間のパルスを（± 刻み 1 つで）測る。
- (EN) Markers and annotation rows name their part (`part`, wireskein-format §5.2 / §5.3; none: part 0): shown on that part; a marker put in a file of several parts records it. Under `wireskein gui`, decoding and checks are asked for the part shown (`&part=K`). Another probe's file goes onto a timeline's other parts shifted by their tick0 (not onto a segment whose place is unknown).
- (JA) マーカーと注釈の行は、どの区間のものかを持つ（`part`、wireskein-format §5.2 / §5.3。無ければ区間 0）。その区間を見せているときに描く。区間が 2 つ以上のファイルで付けたマーカーは、区間を記録する。`wireskein gui` 経由では、見せている区間の復号と照合を頼む（`&part=K`）。別のプローブのファイルは、timeline のほかの区間では tick0 だけずらして載せる（場所の分からない segments の区間には載せない）。
- (EN) Interval channels (`interval-any` / `interval-latch`) are gone, as from the format: OEP's multirate became format 1's events.
- (JA) 区間の要約のチャンネル（`interval-any` / `interval-latch`）はやめた。形式から外れたため（OEP の multirate は形式 1 の events になった）。
- (EN) `edges()` passes whole bytes without a change (a long, quiet line is not read sample by sample).
- (JA) `edges()` は、変化の無いバイトを丸ごと飛ばす（長くて静かな線を、1 サンプルずつ見ない）。
- (EN) The trigger line is drawn at the part's `meta.trigger_tick` (ticks; wireskein 0.0.17 writes it instead of `trigger_index`).
- (JA) トリガの線は、区間の `meta.trigger_tick`（刻み。wireskein 0.0.17 は `trigger_index` に代えてこれを書く）に引く。

- (EN) Raw analog samples at the converter's end codes (0 and 2^valueBits − 1) are clipped, not voltages (OEP capture §1.2): `clipEnds(ch)` gives the end codes and voltages; the viewer marks clipped samples in red and the tooltip reads "≥ 2.450 V: clipped at the high end (raw 4095)".
- (JA) 生の値のアナログで、変換器の端の値（0 と 2^valueBits − 1）は電圧ではなく「切れた」（OEP capture §1.2）: `clipEnds(ch)` が端の値とその電圧を返す。ビューアは切れたサンプルを赤で示し、マウスで「≥ 2.450 V: clipped at the high end (raw 4095)」と出す。
## 0.0.6

- (EN) **Breaking (WireSkein's decisions toward a freeze; not frozen yet):** reads the `wireskein/1` format (wireskein 0.0.13 or later); beta `wireskein/0` files are refused with a clear message. `Capture.id` (the capture's id) replaces `captureJson`; `fileAlignment` matches another file by its id (`capture_id`), so a converted reference still matches. A .sr's sidecar is `wireskein/sr-extra.json` (`wireskein-sr-extra/1`). The package exports only its root (`./src/*` is gone); the README lists the JavaScript names against the file's keys.
- (JA) **互換のない変更（WireSkein の凍結に向けた決定。まだ凍結していない）:** `wireskein/1` の形式を読む（wireskein 0.0.13 以降）。β の `wireskein/0` のファイルは、分かるメッセージで断る。`captureJson` に代えて `Capture.id`（キャプチャの ID）。`fileAlignment` は別のファイルを ID（`capture_id`）で見分けるので、基準を変換しても合う。.sr の付加情報は `wireskein/sr-extra.json`（`wireskein-sr-extra/1`）。パッケージが出すのは入口だけ（`./src/*` はやめた）。README に、JavaScript の名前とファイルのキーの対応を載せた。
## 0.0.5

- (EN) Annotation rows show how sure the analysis is: a row not "confirmed" is faded, with its verdict and score by its name.
- (JA) 注釈の行に、判定の確かさを示す: "confirmed" でない行は薄く描き、名前の横に判定と点を出す。
- (EN) An added file's decoding annotations (stored, or decoded under `wireskein gui`) and markers come along on the same time: rows under its channels with its prefix, markers dashed (shown, not saved into this file).
- (JA) 足したファイルの復号の注釈（入っているもの、または `wireskein gui` でその場で復号したもの）とマーカーも、同じ時間に載せる。行はそのチャンネルの下に接頭辞付きで、マーカーは破線（表示だけで、このファイルには保存しない）。
- (EN) `&with=` may be given more than once (several probes' files); file names from URLs are decoded.
- (JA) `&with=` を複数回与えられる（複数のプローブのファイル）。URL から取ったファイル名は、デコードして使う。
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
