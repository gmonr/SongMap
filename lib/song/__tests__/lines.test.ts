import { describe, expect, it } from "vitest";
import { deleteBar, insertBar, mergeLineWithNext, splitLine } from "../lines";
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

describe("insertBar", () => {
  const rows = [
    line([bar("C"), bar("F")], { 0: "hello", 1: "world" }),
    line([bar("G")], { 0: "solo" }),
  ];

  it("inserts an empty placeholder bar and re-maps lyric indices", () => {
    const out = insertBar(rows, 0, 1, 4);
    expect(out[0].bars.map((b) => b.chords)).toEqual([
      [{ sym: "C", beats: 4 }],
      [{ sym: "", beats: 4 }],
      [{ sym: "F", beats: 4 }],
    ]);
    expect(lyricsOf(out[0])).toEqual(["hello", "", "world"]);
    expect(out[1]).toBe(rows[1]); // untouched rows are shared
  });

  it("inserts at the start and past the end", () => {
    expect(lyricsOf(insertBar(rows, 0, 0, 4)[0])).toEqual([
      "",
      "hello",
      "world",
    ]);
    expect(lyricsOf(insertBar(rows, 0, 2, 4)[0])).toEqual([
      "hello",
      "world",
      "",
    ]);
  });

  it("spans the new bar with totalBeats", () => {
    expect(insertBar(rows, 1, 0, 3)[1].bars[0].chords).toEqual([
      { sym: "", beats: 3 },
    ]);
  });

  it("no-ops return the same reference", () => {
    expect(insertBar(rows, 0, -1, 4)).toBe(rows);
    expect(insertBar(rows, 0, 3, 4)).toBe(rows);
    expect(insertBar(rows, 5, 0, 4)).toBe(rows);
  });
});

describe("deleteBar", () => {
  const rows = [
    line([bar("C"), bar("F"), bar("G")], { 0: "one", 1: "two", 2: "three" }),
    line([bar("Am")], { 0: "solo" }),
  ];

  it("merges the deleted bar's lyric into the previous bar's", () => {
    const out = deleteBar(rows, 0, 1);
    expect(out[0].bars.map((b) => b.chords[0].sym)).toEqual(["C", "G"]);
    expect(lyricsOf(out[0])).toEqual(["one two", "three"]);
  });

  it("deleting the first bar pushes its lyric onto the next", () => {
    expect(lyricsOf(deleteBar(rows, 0, 0)[0])).toEqual(["one two", "three"]);
  });

  it("keeps lyric spans sparse when the deleted bar had no lyric", () => {
    const sparse = [line([bar("C"), bar("F")], { 1: "words" })];
    const out = deleteBar(sparse, 0, 1);
    expect(lyricsOf(out[0])).toEqual(["words"]);
    const empty = deleteBar([line([bar("C"), bar("F")])], 0, 0);
    expect(empty[0].lyrics).toEqual([]);
  });

  it("deleting a row's only bar removes the row", () => {
    const out = deleteBar(rows, 1, 0);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(rows[0]);
  });

  it("no-ops return the same reference", () => {
    expect(deleteBar(rows, 0, -1)).toBe(rows);
    expect(deleteBar(rows, 0, 3)).toBe(rows);
    expect(deleteBar(rows, 5, 0)).toBe(rows);
  });
});
