import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/lib/song/playback";
import { bar, line } from "@/lib/song/__tests__/helpers";
import {
  barIndexAtMs,
  beatToMs,
  emptySync,
  msToBeat,
  normalizeSync,
  withAnchor,
  withNudgedAnchor,
  withoutAnchor,
  type SpotifySyncData,
} from "../sync";

function sync(anchors: { beat: number; ms: number }[]): SpotifySyncData {
  return { anchors };
}

describe("beatToMs", () => {
  it("counts from 0:00 at the fallback BPM with no anchors", () => {
    // 120 BPM → 500 ms per beat.
    expect(beatToMs(emptySync(), 0, 120)).toBe(0);
    expect(beatToMs(emptySync(), 8, 120)).toBe(4000);
  });

  it("offsets by a single bar-1 anchor, slope from the fallback BPM", () => {
    const s = sync([{ beat: 0, ms: 3200 }]);
    expect(beatToMs(s, 0, 120)).toBe(3200);
    expect(beatToMs(s, 4, 120)).toBe(5200);
  });

  it("works from a single mid-song anchor, including beats before it", () => {
    const s = sync([{ beat: 16, ms: 10000 }]);
    expect(beatToMs(s, 16, 120)).toBe(10000);
    expect(beatToMs(s, 20, 120)).toBe(12000);
    expect(beatToMs(s, 12, 120)).toBe(8000);
  });

  it("derives the slope from the anchors with two of them", () => {
    // 16 beats spanning 8s → 500 ms/beat regardless of the (wrong) fallback.
    const s = sync([
      { beat: 0, ms: 1000 },
      { beat: 16, ms: 9000 },
    ]);
    expect(beatToMs(s, 8, 999)).toBe(5000);
  });

  it("interpolates piecewise and extrapolates ends with ≥3 anchors", () => {
    // Segment 1: 500 ms/beat; segment 2: 250 ms/beat.
    const s = sync([
      { beat: 8, ms: 4000 },
      { beat: 16, ms: 8000 },
      { beat: 24, ms: 10000 },
    ]);
    expect(beatToMs(s, 12, 60)).toBe(6000); // inside segment 1
    expect(beatToMs(s, 20, 60)).toBe(9000); // inside segment 2
    expect(beatToMs(s, 4, 60)).toBe(2000); // before first: segment-1 slope
    expect(beatToMs(s, 28, 60)).toBe(11000); // after last: segment-2 slope
  });

  it("guards degenerate fallback BPM", () => {
    // Falls back to 100 BPM → 600 ms per beat.
    expect(beatToMs(emptySync(), 1, 0)).toBe(600);
    expect(beatToMs(emptySync(), 1, NaN)).toBe(600);
  });
});

describe("msToBeat", () => {
  it("round-trips beatToMs across anchor counts", () => {
    const cases = [
      emptySync(),
      sync([{ beat: 0, ms: 3200 }]),
      sync([
        { beat: 0, ms: 1000 },
        { beat: 16, ms: 9000 },
      ]),
      sync([
        { beat: 8, ms: 4000 },
        { beat: 16, ms: 8000 },
        { beat: 24, ms: 10000 },
      ]),
    ];
    for (const s of cases) {
      for (const beat of [0, 3, 8, 15, 22, 30]) {
        expect(msToBeat(s, beatToMs(s, beat, 72), 72)).toBeCloseTo(beat, 6);
      }
    }
  });

  it("maps pre-anchor intro time to negative beats", () => {
    const s = sync([{ beat: 0, ms: 4000 }]);
    expect(msToBeat(s, 2000, 120)).toBe(-4);
  });
});

describe("barIndexAtMs", () => {
  // Two 4-beat bars then one 4-beat bar: total 12 beats.
  const t = buildTimeline({
    sections: {
      v: { label: "V", color: "blue", lines: [line([bar("C"), bar("G")])] },
      c: { label: "C", color: "amber", lines: [line([bar("F")])] },
    },
    arrangement: [
      { ref: "v", instanceLabel: "V" },
      { ref: "c", instanceLabel: "C" },
    ],
  });

  it("finds the sounding bar at 120 BPM with a bar-1 anchor", () => {
    const s = sync([{ beat: 0, ms: 1000 }]);
    expect(barIndexAtMs(t, s, 1000, 120)).toBe(0);
    expect(barIndexAtMs(t, s, 2999, 120)).toBe(0);
    expect(barIndexAtMs(t, s, 3000, 120)).toBe(1);
    expect(barIndexAtMs(t, s, 5100, 120)).toBe(2);
  });

  it("returns null before bar 1 and after the song ends", () => {
    const s = sync([{ beat: 0, ms: 1000 }]);
    expect(barIndexAtMs(t, s, 500, 120)).toBeNull();
    expect(barIndexAtMs(t, s, 7000, 120)).toBeNull();
  });
});

describe("normalizeSync", () => {
  it("returns empty sync for junk", () => {
    for (const raw of [null, undefined, 42, "x", [], {}]) {
      expect(normalizeSync(raw)).toEqual({ anchors: [] });
    }
  });

  it("keeps valid track metadata and drops malformed", () => {
    expect(
      normalizeSync({
        track: { title: "T", artist: "A", durationMs: 1234.6 },
        anchors: [],
      }).track
    ).toEqual({ title: "T", artist: "A", durationMs: 1235 });
    expect(
      normalizeSync({ track: { title: "T" }, anchors: [] }).track
    ).toBeUndefined();
  });

  it("sorts anchors by beat and drops invalid entries", () => {
    const s = normalizeSync({
      anchors: [
        { beat: 16, ms: 9000 },
        { beat: 0, ms: 1000.4 },
        { beat: NaN, ms: 5 },
        { beat: -1, ms: 5 },
        { beat: 4, ms: -5 },
        "junk",
      ],
    });
    expect(s.anchors).toEqual([
      { beat: 0, ms: 1000 },
      { beat: 16, ms: 9000 },
    ]);
  });

  it("drops anchors whose ms goes backwards", () => {
    const s = normalizeSync({
      anchors: [
        { beat: 0, ms: 1000 },
        { beat: 8, ms: 500 },
        { beat: 16, ms: 9000 },
      ],
    });
    expect(s.anchors).toEqual([
      { beat: 0, ms: 1000 },
      { beat: 16, ms: 9000 },
    ]);
  });

  it("keeps the first of duplicate-beat anchors", () => {
    const s = normalizeSync({
      anchors: [
        { beat: 0, ms: 1000 },
        { beat: 8, ms: 5000 },
        { beat: 8, ms: 6000 },
      ],
    });
    expect(s.anchors).toEqual([
      { beat: 0, ms: 1000 },
      { beat: 8, ms: 5000 },
    ]);
  });
});

describe("anchor editing", () => {
  it("withAnchor replaces the anchor at the same beat", () => {
    const s = withAnchor(sync([{ beat: 0, ms: 1000 }]), 0, 1500);
    expect(s.anchors).toEqual([{ beat: 0, ms: 1500 }]);
  });

  it("withAnchor drops neighbors the new ms makes inconsistent", () => {
    const s = withAnchor(
      sync([
        { beat: 0, ms: 1000 },
        { beat: 16, ms: 9000 },
      ]),
      8,
      9500 // later than the beat-16 anchor → that anchor must go
    );
    expect(s.anchors).toEqual([
      { beat: 0, ms: 1000 },
      { beat: 8, ms: 9500 },
    ]);
  });

  it("withNudgedAnchor shifts one anchor and clamps at zero", () => {
    const s = sync([
      { beat: 0, ms: 100 },
      { beat: 16, ms: 9000 },
    ]);
    expect(withNudgedAnchor(s, 0, -250).anchors[0]).toEqual({
      beat: 0,
      ms: 0,
    });
    expect(withNudgedAnchor(s, 1, 50).anchors[1]).toEqual({
      beat: 16,
      ms: 9050,
    });
    expect(withNudgedAnchor(s, 5, 50)).toBe(s);
  });

  it("withoutAnchor removes by index", () => {
    const s = withoutAnchor(
      sync([
        { beat: 0, ms: 1000 },
        { beat: 16, ms: 9000 },
      ]),
      0
    );
    expect(s.anchors).toEqual([{ beat: 16, ms: 9000 }]);
  });
});
