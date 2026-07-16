import { describe, expect, it } from "vitest";
import { normalizeSongData } from "../normalize";
import type { SongData } from "../types";
import { bar, line } from "./helpers";

function songWith(l: ReturnType<typeof line>): SongData {
  return {
    sections: { v: { label: "Verse", color: "blue", lines: [l] } },
    arrangement: [{ ref: "v", instanceLabel: "Verse 1" }],
  };
}

describe("normalizeSongData", () => {
  it("returns pre-anchor blobs by reference", () => {
    const data = songWith(line([bar("C"), bar("F")], { 0: "hello world" }));
    expect(normalizeSongData(data)).toBe(data);
  });

  it("returns already-valid anchored blobs by reference", () => {
    const data = songWith(
      line([bar("C")], {
        0: { text: "oh what a night", anchors: [{ word: 2, beat: 2 }] },
      })
    );
    expect(normalizeSongData(data)).toBe(data);
  });

  it("drops out-of-range and misordered anchors, keeping valid ones", () => {
    const data = songWith(
      line([bar("C")], {
        0: {
          text: "oh what a night",
          anchors: [
            { word: 1, beat: 2 },
            { word: 2, beat: 1 }, // beat goes backwards → dropped
            { word: 3, beat: 9 }, // beat past the bar → dropped
          ],
        },
      })
    );
    const out = normalizeSongData(data);
    expect(out).not.toBe(data);
    expect(out.sections.v.lines[0].lyrics[0].anchors).toEqual([
      { word: 1, beat: 2 },
    ]);
  });

  it("sorts anchors by word and removes the field when none survive", () => {
    const sortable = songWith(
      line([bar("C")], {
        0: {
          text: "oh what a night",
          anchors: [
            { word: 2, beat: 2 },
            { word: 0, beat: 0 },
          ],
        },
      })
    );
    expect(
      normalizeSongData(sortable).sections.v.lines[0].lyrics[0].anchors
    ).toEqual([
      { word: 0, beat: 0 },
      { word: 2, beat: 2 },
    ]);

    const hopeless = songWith(
      line([bar("C")], {
        0: { text: "hi", anchors: [{ word: 5, beat: 0 }] },
      })
    );
    expect(
      normalizeSongData(hopeless).sections.v.lines[0].lyrics[0].anchors
    ).toBeUndefined();
  });

  it("re-syncs linked sections saved before links shared chords, then cleans anchors against the synced bars", () => {
    // p claims "chords same as v" but drifted: different chords, and an
    // anchor only valid against its stale 4-beat bar (v's bar has 2 beats).
    const data: SongData = {
      sections: {
        v: {
          label: "Verse",
          color: "blue",
          lines: [line([{ chords: [{ sym: "C", beats: 2 }] }])],
        },
        p: {
          label: "Pre",
          color: "teal",
          lines: [
            line([bar("Am")], {
              0: { text: "oh what a night", anchors: [{ word: 2, beat: 3 }] },
            }),
          ],
        },
      },
      arrangement: [
        { ref: "v", instanceLabel: "Verse 1" },
        { ref: "p", instanceLabel: "Pre", sameChordsAs: "v" },
      ],
    };
    const out = normalizeSongData(data);
    expect(out.sections.p.lines[0].bars[0]).toEqual({
      chords: [{ sym: "C", beats: 2 }],
    });
    // The beat-3 anchor is out of range for the synced 2-beat bar.
    expect(out.sections.p.lines[0].lyrics[0].anchors).toBeUndefined();
    expect(out.sections.p.lines[0].lyrics[0].text).toBe("oh what a night");
  });
});
