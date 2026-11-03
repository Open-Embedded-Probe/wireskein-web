"""The WireSkein fixtures, written by wireskein (Python): run from this repository with wireskein beside it,

    uv run --project ../wireskein python test/fixtures/make.py

mixed / probeA / probeB are kept as they are (their channels, ids, attachments, notes and the alignment between the
probes are what the tests read); events, timeline and segments are made here."""

from pathlib import Path

from wireskein import capture as wc

HERE = Path(__file__).parent


def events() -> None:
    """One line at full resolution as events (step 1), one at step 4 with quanta of 1, 2 and 127+ changes, and a bit
    channel beside them."""
    n = 64
    fast = wc.events("FAST", [3, 10, 11, 40], [1, 0, 1, 0], [1, 1, 1, 1], n, 1, 0, 0, pin=5)
    #  quantum 2 (ticks 8-11): one change to 1; quantum 5: two changes, back at 1; quantum 9: at least 127, ends 0
    slow = wc.events("SLOW", [2, 5, 9, 200], [1, 1, 0, 1], [1, 2, 127, 1], 256, 4, 0, 0, pin=6)
    clk = wc.Channel("CLK", wc.pack(bytes((k >> 2) & 1 for k in range(n))), n)
    wc.write(HERE / "events.wireskein", wc.Capture(1_000_000, [wc.Part(1024, [clk, fast, slow], {"trigger_tick": 12}, 0)]))


def timeline() -> None:
    """A stream cut by a loss: part 0 (ticks 0-99), 50 ticks lost, part 1 (tick0 150) - a failed capture."""
    def part(k0):
        return [wc.Channel("A", wc.pack(bytes(((k0 + k) >> 3) & 1 for k in range(100))), 100)]
    wc.write(HERE / "timeline.wireskein", wc.Capture(
        1_000_000, [wc.Part(100, part(0), {"start_ns": 1000}, 0), wc.Part(100, part(150), {"start_ns": 151000}, 150)],
        lost=[{"after_part": 0, "ticks": 50, "reason": "probe dropped a segment (no room)", "stopped": False}]))


def segments() -> None:
    """Three triggers, one acquisition each (OEP rearm): each part its own trigger and time."""
    parts = []
    for k in range(3):
        ch = wc.Channel("A", wc.pack(bytes(1 if 20 <= j < 20 + 10 * (k + 1) else 0 for j in range(80))), 80)
        parts.append(wc.Part(80, [ch], {"start_ns": 10_000_000 * k, "trigger_tick": 20}, None))
    wc.write(HERE / "segments.wireskein", wc.Capture(1_000_000, parts, layout="segments"))


events()
timeline()
segments()
