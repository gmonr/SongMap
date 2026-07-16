import { describe, expect, it } from "vitest";
import { normalizeSongData } from "../normalize";
import type { LyricSpan, SongData } from "../types";
import { bar, line } from "./helpers";

function songWith(l: ReturnType<typeof line>): SongData {
  return {
    sections: { v: { label: "Verse", color: "blue", lines: [l] } },
    arrangement: [{ ref: "v", instanceLabel: "Verse 1" }],
  };
}

describe("normalizeSongData", () => {
  it("returns unmarked blobs by reference", () => {
    const data = songWith(line([bar("C"), bar("F")], { 0: "hello world" }));
    expect(normalizeSongData(data)).toBe(data);
  });

  it("returns already-valid marked blobs by reference", () => {
    const data = songWith(
      line([bar("C")], {
        0: { text: "oh what a night", marks: [{ word: 2 }] },
      })
    );
    expect(normalizeSongData(data)).toBe(data);
  });

  it("drops out-of-range and duplicate marks, keeping valid ones", () => {
    const data = songWith(
      line([bar("C")], {
        0: {
          text: "oh what a night",
          marks: [
            { word: 1 },
            { word: 1 }, // duplicate → dropped
            { word: 9 }, // no such word → dropped
            { word: 0, char: 7 }, // char past "oh" → dropped
          ],
        },
      })
    );
    const out = normalizeSongData(data);
    expect(out).not.toBe(data);
    expect(out.sections.v.lines[0].lyrics[0].marks).toEqual([{ word: 1 }]);
  });

  it("sorts marks by word and removes the field when none survive", () => {
    const sortable = songWith(
      line([bar("C")], {
        0: {
          text: "oh what a night",
          marks: [{ word: 2 }, { word: 0 }],
        },
      })
    );
    expect(
      normalizeSongData(sortable).sections.v.lines[0].lyrics[0].marks
    ).toEqual([{ word: 0 }, { word: 2 }]);

    const hopeless = songWith(
      line([bar("C")], { 0: { text: "hi", marks: [{ word: 5 }] } })
    );
    expect(
      normalizeSongData(hopeless).sections.v.lines[0].lyrics[0].marks
    ).toBeUndefined();
  });

  it("migrates legacy word→beat anchors and pickup counts to plain highlights", () => {
    const legacySpan = {
      text: "y como te he soñado",
      bar: 0,
      anchors: [
        { word: 2, beat: 0 },
        { word: 4, beat: 2, char: 2 },
      ],
      lead: 2,
    } as LyricSpan;
    const data = songWith({ bars: [bar("C")], lyrics: [legacySpan] });
    const out = normalizeSongData(data);
    const span = out.sections.v.lines[0].lyrics[0];
    expect(span).toEqual({
      text: "y como te he soñado",
      bar: 0,
      marks: [{ word: 2 }, { word: 4, char: 2 }],
    });
    expect("anchors" in span).toBe(false);
    expect("lead" in span).toBe(false);
  });
});
