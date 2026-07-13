import { describe, expect, it } from "vitest";
import { mergeLineWithNext, splitLine } from "../lines";
import { bar, line, lyricsOf } from "./helpers";

describe("splitLine / mergeLineWithNext", () => {
  const rows = [
    line([bar("C"), bar("F"), bar("G"), bar("Am")], {
      0: "one",
      2: "three",
      3: "four",
    }),
  ];

  it("split re-maps lyric indices to the new rows", () => {
    const out = splitLine(rows, 0, 2);
    expect(out).toHaveLength(2);
    expect(lyricsOf(out[0])).toEqual(["one", ""]);
    expect(lyricsOf(out[1])).toEqual(["three", "four"]);
  });

  it("merge after split round-trips bars and lyric attachment", () => {
    const back = mergeLineWithNext(splitLine(rows, 0, 2), 0);
    expect(back).toHaveLength(1);
    expect(back[0].bars.map((b) => b.chords[0].sym)).toEqual([
      "C",
      "F",
      "G",
      "Am",
    ]);
    expect(lyricsOf(back[0])).toEqual(["one", "", "three", "four"]);
  });

  it("no-ops return the same reference", () => {
    expect(splitLine(rows, 0, 0)).toBe(rows);
    expect(splitLine(rows, 0, 4)).toBe(rows);
    expect(splitLine(rows, 5, 1)).toBe(rows);
    expect(mergeLineWithNext(rows, 0)).toBe(rows); // last row
    expect(mergeLineWithNext(rows, -1)).toBe(rows);
  });
});
