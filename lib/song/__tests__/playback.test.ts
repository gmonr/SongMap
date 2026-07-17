import { describe, expect, it } from "vitest";
import {
  barIndexAt,
  barIndexForSection,
  buildTimeline,
  firstBarOfItem,
  sectionLoopRange,
} from "../playback";
import type { SongData } from "../types";
import { bar, line } from "./helpers";

/** Two-section song: verse (2 bars) then a chorus (1 bar) played ×2. */
function song(): SongData {
  return {
    sections: {
      v: { label: "Verse", color: "blue", lines: [line([bar("C"), bar("G")])] },
      c: {
        label: "Chorus",
        color: "amber",
        lines: [line([bar("F", "C")])],
      },
    },
    arrangement: [
      { ref: "v", instanceLabel: "Verse 1" },
      { ref: "c", instanceLabel: "Chorus", repeat: 2 },
    ],
  };
}

describe("buildTimeline", () => {
  it("flattens the arrangement with absolute beat offsets", () => {
    const t = buildTimeline(song());
    expect(t.bars.map((b) => [b.arrIdx, b.pass, b.li, b.bi])).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 1],
      [1, 0, 0, 0],
      [1, 1, 0, 0],
    ]);
    expect(t.bars.map((b) => b.startBeat)).toEqual([0, 4, 8, 12]);
    expect(t.totalBeats).toBe(16);
  });

  it("gives split-bar chords their in-bar beat offsets", () => {
    const t = buildTimeline(song());
    const split = t.bars[2];
    expect(split.chords.map((c) => [c.sym, c.beats, c.startBeat])).toEqual([
      ["F", 2, 8],
      ["C", 2, 10],
    ]);
  });

  it("carries the previous chord into empty placeholder bars", () => {
    const data: SongData = {
      sections: {
        v: {
          label: "V",
          color: "blue",
          lines: [line([bar("Am"), bar(""), bar("N.C."), bar("")])],
        },
      },
      arrangement: [{ ref: "v", instanceLabel: "V" }],
    };
    const t = buildTimeline(data);
    expect(t.bars.map((b) => b.chords[0].sym)).toEqual([
      "Am",
      "Am",
      "N.C.",
      "N.C.",
    ]);
  });

  it("carries chords across section boundaries, and leading empties stay empty", () => {
    const data: SongData = {
      sections: {
        a: { label: "A", color: "blue", lines: [line([bar(""), bar("D")])] },
        b: { label: "B", color: "rose", lines: [line([bar("")])] },
      },
      arrangement: [
        { ref: "a", instanceLabel: "A" },
        { ref: "b", instanceLabel: "B" },
      ],
    };
    const t = buildTimeline(data);
    expect(t.bars.map((b) => b.chords[0].sym)).toEqual(["", "D", "D"]);
  });

  it("sums varying bar lengths into startBeat", () => {
    const data: SongData = {
      sections: {
        v: {
          label: "V",
          color: "blue",
          lines: [
            {
              bars: [
                { chords: [{ sym: "C", beats: 3 }] },
                { chords: [{ sym: "G", beats: 2 }] },
              ],
              lyrics: [],
            },
          ],
        },
      },
      arrangement: [{ ref: "v", instanceLabel: "V" }],
    };
    const t = buildTimeline(data);
    expect(t.bars.map((b) => [b.startBeat, b.beats])).toEqual([
      [0, 3],
      [3, 2],
    ]);
    expect(t.totalBeats).toBe(5);
  });

  it("skips arrangement items whose section is missing", () => {
    const data = song();
    data.arrangement.splice(1, 0, { ref: "gone", instanceLabel: "?" });
    const t = buildTimeline(data);
    expect(t.bars).toHaveLength(4);
    expect(firstBarOfItem(t, 1)).toBe(-1);
    expect(firstBarOfItem(t, 2)).toBe(2);
  });
});

describe("sectionLoopRange", () => {
  it("spans every repeat pass of the arrangement item", () => {
    const t = buildTimeline(song());
    expect(sectionLoopRange(t, 0)).toEqual([0, 2]);
    expect(sectionLoopRange(t, 1)).toEqual([0, 2]);
    expect(sectionLoopRange(t, 2)).toEqual([2, 4]);
    expect(sectionLoopRange(t, 3)).toEqual([2, 4]);
  });
});

describe("firstBarOfItem", () => {
  it("finds the first timeline bar of an arrangement item", () => {
    const t = buildTimeline(song());
    expect(firstBarOfItem(t, 0)).toBe(0);
    expect(firstBarOfItem(t, 1)).toBe(2);
  });
});

describe("barIndexAt", () => {
  it("maps section-relative bar coordinates to a timeline index", () => {
    const t = buildTimeline(song());
    expect(barIndexAt(t, 0, 0, 0)).toBe(0);
    expect(barIndexAt(t, 0, 0, 1)).toBe(1);
    expect(barIndexAt(t, 1, 0, 0)).toBe(2);
  });

  it("targets the first repeat pass and rejects unknown coordinates", () => {
    const t = buildTimeline(song());
    expect(t.bars[barIndexAt(t, 1, 0, 0)].pass).toBe(0);
    expect(barIndexAt(t, 0, 0, 9)).toBe(-1);
    expect(barIndexAt(t, 5, 0, 0)).toBe(-1);
  });
});

describe("barIndexForSection", () => {
  it("maps a section-addressed bar to its first arrangement instance", () => {
    const data = song();
    const t = buildTimeline(data);
    expect(barIndexForSection(t, data.arrangement, "v", 0, 1)).toBe(1);
    expect(barIndexForSection(t, data.arrangement, "c", 0, 0)).toBe(2);
  });

  it("uses the first instance when a section is arranged twice", () => {
    const data = song();
    data.arrangement.push({ ref: "v", instanceLabel: "Verse 2" });
    const t = buildTimeline(data);
    expect(barIndexForSection(t, data.arrangement, "v", 0, 0)).toBe(0);
  });

  it("rejects unarranged sections and missing bars", () => {
    const data = song();
    const t = buildTimeline(data);
    expect(barIndexForSection(t, data.arrangement, "bridge", 0, 0)).toBe(-1);
    expect(barIndexForSection(t, data.arrangement, "v", 0, 9)).toBe(-1);
  });
});
