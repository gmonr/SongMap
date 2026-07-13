import { describe, expect, it } from "vitest";
import { lineWordLayout, setWordBoundary, shiftLyric } from "../lyrics";
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
