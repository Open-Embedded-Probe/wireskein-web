"""The WireSkein fixtures, written by wireskein (Python): run from this repository with wireskein beside it,

    uv run --project ../wireskein python test/fixtures/make.py

mixed / probeA / probeB keep their channels, ids, attachments and notes (they were written before parts,
wireskein-format §3.4: moved into one part here, read back by wireskein to check); events, timeline and segments
are made here."""

import json
import zipfile
from pathlib import Path

from wireskein import fileformat as wf

HERE = Path(__file__).parent


def into_one_part(path: Path) -> None:
    """A file of the layout before parts -> the same capture in one part, as wireskein writes it now."""
    with zipfile.ZipFile(path) as z:
        items = {i.filename: z.read(i) for i in z.infolist()}
    head = json.loads(items["capture.json"])
    if "parts" in head:
        return
    part_meta = {k: head["meta"].pop(k) for k in wf.PART_META if k in head["meta"]}
    chans = []
    for k, c in enumerate(head.pop("channels")):
        new = f"part/0/ch/{k}.{c['file'].rsplit('.', 1)[1]}"
        items[new] = items.pop(c["file"])
        chans.append({**c, "file": new})
    ticks = head.pop("ticks")
    head = {"id": head["id"], "tick_hz": head["tick_hz"], "layout": "timeline", "complete": True,
            "parts": [{"ticks": ticks, "tick0": 0, "channels": chans, "meta": part_meta}], "meta": head["meta"]}
    items["capture.json"] = json.dumps(head, indent=1).encode()
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo(wf.IDENT, (1980, 1, 1, 0, 0, 0)), items.pop(wf.IDENT), zipfile.ZIP_STORED)
        z.writestr(wf.CAPTURE, items.pop(wf.CAPTURE))
        for name, data in items.items():
            z.writestr(name, data)
    wf.read(path)                                    # wireskein reads it


def events() -> None:
    """One line at full resolution as events (step 1), one at step 4 with quanta of 1, 2 and 127+ changes, and a bit
    channel beside them."""
    n = 64
    fast = wf.events("FAST", [3, 10, 11, 40], [1, 0, 1, 0], [1, 1, 1, 1], n, 1, 0, 0, pin=5)
    #  quantum 2 (ticks 8-11): one change to 1; quantum 5: two changes, back at 1; quantum 9: at least 127, ends 0
    slow = wf.events("SLOW", [2, 5, 9, 200], [1, 1, 0, 1], [1, 2, 127, 1], 256, 4, 0, 0, pin=6)
    clk = wf.Channel("CLK", wf.pack(bytes((k >> 2) & 1 for k in range(n))), n)
    wf.write(HERE / "events.wireskein", 1_000_000, [clk, fast, slow], trigger_tick=12)


def timeline() -> None:
    """A stream cut by a loss: part 0 (ticks 0-99), 50 ticks lost, part 1 (tick0 150) - a failed capture."""
    def part(k0):
        return [wf.Channel("A", wf.pack(bytes(((k0 + k) >> 3) & 1 for k in range(100))), 100)]
    wf.write(HERE / "timeline.wireskein", 1_000_000,
             parts=[wf.Part(part(0), {"start_ns": 1000}, 0), wf.Part(part(150), {"start_ns": 151000}, 150)],
             layout="timeline", lost=[{"after_part": 0, "ticks": 50, "reason": "probe dropped a segment (no room)",
                                       "stopped": False}])


def segments() -> None:
    """Three triggers, one acquisition each (OEP rearm): each part its own trigger and time."""
    parts = []
    for k in range(3):
        ch = wf.Channel("A", wf.pack(bytes(1 if 20 <= j < 20 + 10 * (k + 1) else 0 for j in range(80))), 80)
        parts.append(wf.Part([ch], {"start_ns": 10_000_000 * k, "trigger_tick": 20}, None))
    wf.write(HERE / "segments.wireskein", 1_000_000, parts=parts, layout="segments")


for name in ("mixed", "probeA", "probeB"):
    into_one_part(HERE / f"{name}.wireskein")
events()
timeline()
segments()
(HERE / "intervals.wireskein").unlink(missing_ok=True)   # interval-any / -latch: gone from the format (events instead)
