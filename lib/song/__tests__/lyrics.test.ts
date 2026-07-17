import { describe, expect, it } from "vitest";
import {
  barBeforeSeam,
  lineWordLayout,
  marksAfterRetype,
  moveSeamWord,
  setBarLyric,
  setWordBoundary,
  shiftLyric,
} from "../lyrics";
import type { SongData } from "../types";
import { bar, line, lyricsOf } from "./helpers";

describe("lineWordLayout", () => {
  it("computes cumulative starts, empty bars yielding []", () => {
    const l = line([bar("C"), bar("F"), bar("G")], {
      0: "hello world",
      2: "again",
    });
    const layout = lineWordLayout(l);
    expect(layout.words).toEqual(["hello", "world", "again"]);
    expect(layout.bars).toEqual([
      { words: ["hello", "world"], start: 0 },
      { words: [], start: 2 },
      { words: ["again"], start: 2 },
    ]);
  });
});

describe("setWordBoundary", () => {
  const l = line([bar("C"), bar("F")], { 0: "oh what a", 1: "night we had" });

  it("moves words right to left across the boundary", () => {
    expect(lyricsOf(setWordBoundary(l, 1, 4))).toEqual([
      "oh what a night",
      "we had",
    ]);
  });

  it("moves words left to right across the boundary", () => {
    expect(lyricsOf(setWordBoundary(l, 1, 1))).toEqual([
      "oh",
      "what a night we had",
    ]);
  });

  it("can empty either bar of the pair (span dropped)", () => {
    const left = setWordBoundary(l, 1, 0);
    expect(lyricsOf(left)).toEqual(["", "oh what a night we had"]);
    expect(left.lyrics).toHaveLength(1);
    const right = setWordBoundary(l, 1, 6);
    expect(lyricsOf(right)).toEqual(["oh what a night we had", ""]);
  });

  it("clamps gap to the pair's word range", () => {
    const three = line([bar("C"), bar("F"), bar("G")], {
      0: "a b",
      1: "c",
      2: "d e",
    });
    // Boundary 2 can't move left of bar 1's start (gap 2) — bar 0 untouched.
    expect(lyricsOf(setWordBoundary(three, 2, 0))).toEqual(["a b", "", "c d e"]);
    // Nor right of bar 2's end (gap 5).
    expect(lyricsOf(setWordBoundary(three, 2, 99))).toEqual(["a b", "c d e", ""]);
  });

  it("moves words into an empty middle bar", () => {
    const three = line([bar("C"), bar("F"), bar("G")], { 0: "a b c", 2: "d" });
    expect(lyricsOf(setWordBoundary(three, 1, 2))).toEqual(["a b", "c", "d"]);
  });

  it("no-ops return the same reference", () => {
    expect(setWordBoundary(l, 0, 1)).toBe(l); // invalid boundary
    expect(setWordBoundary(l, 2, 1)).toBe(l);
    expect(setWordBoundary(l, 1, 3)).toBe(l); // boundary already at gap 3
    const empty = line([bar("C"), bar("F")]);
    expect(setWordBoundary(empty, 1, 1)).toBe(empty); // zero-word row
  });

  it("normalizes internal whitespace of the touched bars", () => {
    const messy = line([bar("C"), bar("F")], { 0: "a   b  c", 1: "d" });
    expect(lyricsOf(setWordBoundary(messy, 1, 2))).toEqual(["a b", "c d"]);
  });
});

describe("setBarLyric", () => {
  const l = line([bar("C"), bar("F")], { 0: "oh what" });

  it("replaces one bar's lyric, leaving the others alone", () => {
    expect(lyricsOf(setBarLyric(l, 0, "oh when"))).toEqual(["oh when", ""]);
    expect(lyricsOf(setBarLyric(l, 1, "a night"))).toEqual([
      "oh what",
      "a night",
    ]);
  });

  it("normalizes whitespace and clears the span on empty text", () => {
    expect(lyricsOf(setBarLyric(l, 0, "  oh   when "))).toEqual(["oh when", ""]);
    const cleared = setBarLyric(l, 0, "");
    expect(lyricsOf(cleared)).toEqual(["", ""]);
    expect(cleared.lyrics).toHaveLength(0);
    expect(lyricsOf(setBarLyric(l, 0, "   "))[0]).toBe("");
  });

  it("no-ops return the same reference", () => {
    expect(setBarLyric(l, 0, "oh what")).toBe(l); // unchanged
    expect(setBarLyric(l, 0, " oh  what ")).toBe(l); // unchanged once normalized
    expect(setBarLyric(l, 1, "")).toBe(l); // already empty
    expect(setBarLyric(l, 2, "x")).toBe(l); // bad bar index
    expect(setBarLyric(l, -1, "x")).toBe(l);
  });
});

describe("shiftLyric", () => {
  it("moves a phrase into an empty neighbor", () => {
    const l = line([bar("C"), bar("F")], { 0: "hey" });
    expect(lyricsOf(shiftLyric(l, 0, 1))).toEqual(["", "hey"]);
  });

  it("ripples an occupied chain into the first empty bar", () => {
    const l = line([bar("C"), bar("F"), bar("G"), bar("Am")], {
      0: "a",
      1: "b",
      2: "c",
    });
    expect(lyricsOf(shiftLyric(l, 0, 1))).toEqual(["", "a", "b", "c"]);
    const back = line([bar("C"), bar("F"), bar("G")], { 1: "b", 2: "c" });
    expect(lyricsOf(shiftLyric(back, 2, -1))).toEqual(["b", "c", ""]);
  });

  it("no-ops return the same reference", () => {
    const full = line([bar("C"), bar("F")], { 0: "a", 1: "b" });
    expect(shiftLyric(full, 0, 1)).toBe(full); // no empty bar to absorb
    const l = line([bar("C"), bar("F")], { 0: "a" });
    expect(shiftLyric(l, 0, -1)).toBe(l); // would leave the row
    expect(shiftLyric(l, 1, 1)).toBe(l); // no lyric at source
  });
});

describe("highlights across lyric ops", () => {
  it("setWordBoundary keeps marks with their words, reindexing across the pair", () => {
    const l = line([bar("C"), bar("F")], {
      0: { text: "oh what a", marks: [{ word: 1 }] },
      1: { text: "night we had", marks: [{ word: 1 }] },
    });
    // Boundary moves right by one: "night" transfers to the left bar.
    const next = setWordBoundary(l, 1, 4);
    expect(next.lyrics.find((s) => s.bar === 0)?.marks).toEqual([
      { word: 1 }, // "what" stayed put
    ]);
    expect(next.lyrics.find((s) => s.bar === 1)?.marks).toEqual([
      { word: 0 }, // "we" reindexed from word 1 to 0
    ]);
  });

  it("setWordBoundary carries a marked word into its new bar", () => {
    const l = line([bar("C"), bar("F")], {
      0: { text: "oh what a", marks: [{ word: 2 }] },
      1: "night",
    });
    // "a" moves into the right bar — its highlight travels with it.
    const next = setWordBoundary(l, 1, 2);
    expect(next.lyrics.find((s) => s.bar === 0)?.marks).toBeUndefined();
    expect(next.lyrics.find((s) => s.bar === 1)?.marks).toEqual([{ word: 0 }]);
  });

  it("setBarLyric keeps marks on a same-word-count retype, drops otherwise", () => {
    const l = line([bar("C")], {
      0: { text: "oh whut a night", marks: [{ word: 1 }] },
    });
    const fixed = setBarLyric(l, 0, "oh what a night");
    expect(fixed.lyrics[0].marks).toEqual([{ word: 1 }]);
    const rewritten = setBarLyric(l, 0, "completely different words here now");
    expect(rewritten.lyrics[0].marks).toBeUndefined();
  });

  it("shiftLyric carries a phrase's marks to its new bar", () => {
    const l = line([bar("C"), bar("F")], {
      0: { text: "hey now", marks: [{ word: 1 }] },
    });
    const next = shiftLyric(l, 0, 1);
    expect(next.lyrics).toEqual([
      { text: "hey now", bar: 1, marks: [{ word: 1 }] },
    ]);
  });
});

describe("marksAfterRetype", () => {
  it("keeps word marks and in-range syllable marks, drops the rest", () => {
    expect(
      marksAfterRetype([{ word: 0 }, { word: 1, char: 4 }], ["oh", "night"])
    ).toEqual([{ word: 0 }, { word: 1, char: 4 }]);
    // The retyped word got shorter than the syllable offset.
    expect(
      marksAfterRetype([{ word: 1, char: 4 }], ["oh", "hey"])
    ).toBeUndefined();
  });

  it("an end past the shorter retyped word falls back to the word's end", () => {
    expect(
      marksAfterRetype([{ word: 0, char: 1, end: 5 }], ["hey"])
    ).toEqual([{ word: 0, char: 1 }]);
    expect(
      marksAfterRetype([{ word: 0, char: 1, end: 3 }], ["hey"])
    ).toEqual([{ word: 0, char: 1, end: 3 }]);
  });
});

/** Two sections of two rows each, one bar per row, one word per bar. */
function seamSong(): SongData {
  return {
    sections: {
      a: {
        label: "A",
        color: "blue",
        lines: [
          line([bar("C"), bar("F")], { 0: "one", 1: "two" }),
          line([bar("G")], { 0: "three" }),
        ],
      },
      b: {
        label: "B",
        color: "red",
        lines: [line([bar("Am")], { 0: "four" })],
      },
    },
    arrangement: [
      { ref: "a", instanceLabel: "A" },
      { ref: "b", instanceLabel: "B" },
    ],
  };
}
const ORDER = ["a", "b"];
const lyricAt = (d: SongData, id: string, li: number, bi: number) =>
  d.sections[id].lines[li].lyrics.find((s) => s.bar === bi)?.text ?? "";

describe("barBeforeSeam", () => {
  it("finds the previous row's last bar within a section", () => {
    expect(barBeforeSeam(seamSong(), ORDER, "a", 1)).toEqual({
      sectionId: "a",
      li: 0,
      bi: 1,
    });
  });

  it("crosses into the previous section for a section's first row", () => {
    expect(barBeforeSeam(seamSong(), ORDER, "b", 0)).toEqual({
      sectionId: "a",
      li: 1,
      bi: 0,
    });
  });

  it("skips bar-less rows and returns null before the first bar", () => {
    const d = seamSong();
    d.sections.b.lines.unshift({ bars: [], lyrics: [] });
    expect(barBeforeSeam(d, ORDER, "b", 1)).toEqual({
      sectionId: "a",
      li: 1,
      bi: 0,
    });
    expect(barBeforeSeam(seamSong(), ORDER, "a", 0)).toBeNull();
  });
});

describe("moveSeamWord", () => {
  it("moves a word down across a row boundary and back", () => {
    const d = seamSong();
    const down = moveSeamWord(d, ORDER, "a", 1, -1);
    expect(lyricAt(down, "a", 0, 1)).toBe("");
    expect(lyricAt(down, "a", 1, 0)).toBe("two three");
    const back = moveSeamWord(down, ORDER, "a", 1, 1);
    expect(lyricAt(back, "a", 0, 1)).toBe("two");
    expect(lyricAt(back, "a", 1, 0)).toBe("three");
  });

  it("moves a word across a section boundary, both ways", () => {
    const d = seamSong();
    const down = moveSeamWord(d, ORDER, "b", 0, -1);
    expect(lyricAt(down, "a", 1, 0)).toBe("");
    expect(lyricAt(down, "b", 0, 0)).toBe("three four");
    const up = moveSeamWord(d, ORDER, "b", 0, 1);
    expect(lyricAt(up, "a", 1, 0)).toBe("three four");
    expect(lyricAt(up, "b", 0, 0)).toBe("");
  });

  it("carries highlights with the word and reindexes the rest", () => {
    const d = seamSong();
    d.sections.a.lines[0].lyrics = [
      { text: "one", bar: 0 },
      { text: "oh two", bar: 1, marks: [{ word: 1, char: 1, end: 2 }] },
    ];
    d.sections.a.lines[1].lyrics = [
      { text: "three", bar: 0, marks: [{ word: 0 }] },
    ];
    const down = moveSeamWord(d, ORDER, "a", 1, -1);
    const target = down.sections.a.lines[1].lyrics.find((s) => s.bar === 0);
    expect(target?.text).toBe("two three");
    expect(target?.marks).toEqual([
      { word: 0, char: 1, end: 2 }, // rode along with "two"
      { word: 1 }, // "three" shifted right
    ]);
  });

  it("no-ops by reference when the donor bar has no words or nothing precedes", () => {
    const d = seamSong();
    expect(moveSeamWord(d, ORDER, "a", 0, -1)).toBe(d); // no seam before first bar
    d.sections.a.lines[0].lyrics = d.sections.a.lines[0].lyrics.filter(
      (s) => s.bar !== 1
    );
    expect(moveSeamWord(d, ORDER, "a", 1, -1)).toBe(d); // left bar empty
    const e = seamSong();
    e.sections.a.lines[1].lyrics = [];
    expect(moveSeamWord(e, ORDER, "a", 1, 1)).toBe(e); // right bar empty
  });
});
