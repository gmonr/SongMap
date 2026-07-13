import { describe, expect, it } from "vitest";
import {
  chordMoveTarget,
  deleteChord,
  evenBeats,
  insertChord,
  moveChord,
  nearestChordSym,
  renameChord,
  setBeatBoundary,
} from "../chords";
import { bar, line, lyricsOf } from "./helpers";
import type { Bar, Line } from "../types";

/** Bar with explicit per-chord beats: split("Am", 2, "F", 1) → Am:2 F:1. */
const split = (...pairs: (string | number)[]): Bar => {
  const chords = [];
  for (let i = 0; i < pairs.length; i += 2) {
    chords.push({ sym: pairs[i] as string, beats: pairs[i + 1] as number });
  }
  return { chords };
};

const chordsOf = (l: Line) =>
  l.bars.map((b) => b.chords.map((c) => `${c.sym || "·"}:${c.beats}`));

describe("evenBeats", () => {
  it("matches the import parser's even-split rule", () => {
    expect(evenBeats(1, 4)).toEqual([4]);
    expect(evenBeats(2, 4)).toEqual([2, 2]);
    expect(evenBeats(2, 3)).toEqual([1, 2]);
    expect(evenBeats(3, 4)).toEqual([1, 1, 2]);
    expect(evenBeats(4, 3)).toEqual([1, 1, 1, 1]); // over-full bar: min 1 each
  });
});

describe("moveChord", () => {
  it("replaces an empty neighbor's placeholder, source keeps full beats", () => {
    const rows = [line([bar("Am", "F"), bar()], { 0: "la" })];
    const out = moveChord(rows, 0, 0, 1, 1, 4);
    expect(chordsOf(out[0])).toEqual([["Am:4"], ["F:4"]]);
  });

  it("forms a split bar with direction-correct insertion", () => {
    const right = moveChord([line([bar("Am", "F"), bar("G")])], 0, 0, 1, 1, 4);
    expect(chordsOf(right[0])).toEqual([["Am:4"], ["F:2", "G:2"]]);
    const left = moveChord([line([bar("Am"), bar("F", "G")])], 0, 1, 0, -1, 4);
    expect(chordsOf(left[0])).toEqual([["Am:2", "F:2"], ["G:4"]]);
  });

  it("moving a bar's only chord leaves the empty-bar placeholder", () => {
    const out = moveChord([line([bar("Am"), bar("G")])], 0, 0, 0, 1, 4);
    expect(chordsOf(out[0])).toEqual([["·:4"], ["Am:2", "G:2"]]);
  });

  it("re-splits the destination's beats to the time signature (3/4)", () => {
    const rows = [line([split("Am", 2, "F", 1), bar("G")])];
    const out = moveChord(rows, 0, 0, 1, 1, 3);
    expect(chordsOf(out[0])).toEqual([["Am:3"], ["F:1", "G:2"]]);
  });

  it("the source hands the moved chord's beats over, keeping custom splits", () => {
    // A:1 B:2 C:1 — moving C out must not flatten A/B back to an even split.
    const rows = [line([split("A", 1, "B", 2, "C", 1), bar("G")])];
    const out = moveChord(rows, 0, 0, 2, 1, 4);
    expect(chordsOf(out[0])).toEqual([["A:1", "B:3"], ["C:2", "G:2"]]);
    // Moving the bar's first chord: the new first chord absorbs the beats.
    const first = moveChord([line([bar("X"), split("A", 1, "B", 3)])], 0, 1, 0, -1, 4);
    expect(chordsOf(first[0])).toEqual([["X:2", "A:2"], ["B:4"]]);
  });

  it("crosses row boundaries and leaves lyric spans untouched", () => {
    const rows = [
      line([bar("C"), bar("Am", "F")], { 0: "one", 1: "two" }),
      line([bar("G")], { 0: "three" }),
    ];
    const out = moveChord(rows, 0, 1, 1, 1, 4);
    expect(chordsOf(out[0])).toEqual([["C:4"], ["Am:4"]]);
    expect(chordsOf(out[1])).toEqual([["F:2", "G:2"]]);
    expect(lyricsOf(out[0])).toEqual(["one", "two"]);
    expect(lyricsOf(out[1])).toEqual(["three"]);
    const back = moveChord(out, 1, 0, 0, -1, 4);
    expect(chordsOf(back[0])).toEqual([["C:4"], ["Am:2", "F:2"]]);
    expect(chordsOf(back[1])).toEqual([["G:4"]]);
  });

  it("no-ops return the same reference", () => {
    const rows = [line([bar("C"), bar("Am", "F", "G", "E")])];
    expect(moveChord(rows, 0, 0, 0, 1, 4)).toBe(rows); // dest at chord cap
    expect(moveChord(rows, 0, 0, 0, -1, 4)).toBe(rows); // first bar, left
    expect(moveChord(rows, 0, 1, 3, 1, 4)).toBe(rows); // last bar, right
    const ph = [line([bar(), bar("C")])];
    expect(moveChord(ph, 0, 0, 0, 1, 4)).toBe(ph); // placeholder chord
    expect(moveChord(ph, 0, 5, 0, 1, 4)).toBe(ph); // bad coords
  });

  it("chordMoveTarget reports where the chord actually lands", () => {
    const rows = [line([bar("Am", "F"), bar("G")]), line([bar("C", "E")])];
    // Right into occupied bar: prepends at 0.
    expect(chordMoveTarget(rows, 0, 0, 1, 1, 4)).toEqual({
      li: 0,
      bi: 1,
      ci: 0,
    });
    const moved = moveChord(rows, 0, 0, 1, 1, 4);
    expect(moved[0].bars[1].chords[0].sym).toBe("F");
    // Left into occupied bar (cross-row): appends at old length.
    expect(chordMoveTarget(rows, 1, 0, 0, -1, 4)).toEqual({
      li: 0,
      bi: 1,
      ci: 1,
    });
    const left = moveChord(rows, 1, 0, 0, -1, 4);
    expect(left[0].bars[1].chords[1].sym).toBe("C");
  });
});

describe("insertChord", () => {
  it("inserts at the start, end, and between, with an even re-split", () => {
    const rows = [line([bar("C")])];
    const start = insertChord(rows, 0, 0, 0, "G", 4);
    expect(chordsOf(start[0])).toEqual([["G:2", "C:2"]]);
    const end = insertChord(rows, 0, 0, 1, "G", 4);
    expect(chordsOf(end[0])).toEqual([["C:2", "G:2"]]);
    const mid = insertChord([line([bar("C", "E")])], 0, 0, 1, "G", 4);
    expect(chordsOf(mid[0])).toEqual([["C:1", "G:1", "E:2"]]);
  });

  it("replaces a lone placeholder, keeping the bar's span", () => {
    const rows = [line([{ chords: [{ sym: "", beats: 3 }] }])];
    const out = insertChord(rows, 0, 0, 0, "Am", 3);
    expect(chordsOf(out[0])).toEqual([["Am:3"]]);
  });

  it("no-ops at the chord cap and on bad input", () => {
    const full = [line([bar("A", "B", "C", "D")])];
    expect(insertChord(full, 0, 0, 2, "G", 4)).toBe(full); // at totalBeats cap
    const rows = [line([bar("C")])];
    expect(insertChord(rows, 0, 0, 2, "G", 4)).toBe(rows); // pos out of range
    expect(insertChord(rows, 0, 0, 0, "", 4)).toBe(rows); // empty sym
    expect(insertChord(rows, 0, 5, 0, "G", 4)).toBe(rows); // bad coords
  });

  it("leaves lyric spans untouched", () => {
    const rows = [line([bar("C"), bar("F")], { 0: "one", 1: "two" })];
    const out = insertChord(rows, 0, 0, 1, "G", 4);
    expect(lyricsOf(out[0])).toEqual(["one", "two"]);
  });
});

describe("deleteChord", () => {
  it("hands the deleted chord's beats to its left neighbor", () => {
    const rows = [line([split("A", 2, "B", 1, "C", 1)])];
    const out = deleteChord(rows, 0, 0, 1);
    expect(chordsOf(out[0])).toEqual([["A:3", "C:1"]]);
  });

  it("deleting the first chord feeds the new first chord", () => {
    const out = deleteChord([line([split("A", 1, "B", 3)])], 0, 0, 0);
    expect(chordsOf(out[0])).toEqual([["B:4"]]);
  });

  it("deleting a bar's only chord leaves the empty-bar placeholder", () => {
    const out = deleteChord([line([bar("Am"), bar("G")])], 0, 0, 0);
    expect(chordsOf(out[0])).toEqual([["·:4"], ["G:4"]]);
  });

  it("no-ops on placeholders and bad coords", () => {
    const rows = [line([bar(), bar("C")])];
    expect(deleteChord(rows, 0, 0, 0)).toBe(rows); // placeholder chord
    expect(deleteChord(rows, 0, 1, 5)).toBe(rows); // bad chord index
    expect(deleteChord(rows, 2, 0, 0)).toBe(rows); // bad line index
  });
});

describe("renameChord", () => {
  it("changes the symbol, keeping the bar's beat split", () => {
    const rows = [line([split("A", 1, "B", 3), bar("G")], { 0: "la" })];
    const out = renameChord(rows, 0, 0, 1, "Bm");
    expect(chordsOf(out[0])).toEqual([["A:1", "Bm:3"], ["G:4"]]);
    expect(lyricsOf(out[0])).toEqual(["la", ""]);
  });

  it("no-ops on placeholders, empty or unchanged syms, and bad coords", () => {
    const rows = [line([bar(), bar("C")])];
    expect(renameChord(rows, 0, 0, 0, "G")).toBe(rows); // placeholder chord
    expect(renameChord(rows, 0, 1, 0, "")).toBe(rows); // empty sym
    expect(renameChord(rows, 0, 1, 0, "C")).toBe(rows); // unchanged
    expect(renameChord(rows, 0, 1, 5, "G")).toBe(rows); // bad chord index
    expect(renameChord(rows, 2, 0, 0, "G")).toBe(rows); // bad line index
  });
});

describe("setBeatBoundary", () => {
  it("moves the boundary, preserving the pair's total", () => {
    expect(setBeatBoundary(split("A", 2, "B", 2), 0, 1).chords).toEqual([
      { sym: "A", beats: 1 },
      { sym: "B", beats: 3 },
    ]);
    expect(setBeatBoundary(split("A", 2, "B", 2), 0, 3).chords).toEqual([
      { sym: "A", beats: 3 },
      { sym: "B", beats: 1 },
    ]);
  });

  it("only touches the pair in a longer bar", () => {
    const out = setBeatBoundary(split("A", 1, "B", 2, "C", 1), 1, 1);
    expect(out.chords).toEqual([
      { sym: "A", beats: 1 },
      { sym: "B", beats: 1 },
      { sym: "C", beats: 2 },
    ]);
  });

  it("no-ops when out of range, fractional, unchanged, or unpaired", () => {
    const b = split("A", 2, "B", 2);
    expect(setBeatBoundary(b, 0, 0)).toBe(b); // each side keeps ≥ 1 beat
    expect(setBeatBoundary(b, 0, 4)).toBe(b);
    expect(setBeatBoundary(b, 0, 1.5)).toBe(b);
    expect(setBeatBoundary(b, 0, 2)).toBe(b); // already there
    expect(setBeatBoundary(b, 1, 1)).toBe(b); // no chord after ci
  });
});

describe("nearestChordSym", () => {
  it("prefers the closest earlier chord, crossing rows", () => {
    const rows = [line([bar("C"), bar("Am", "F")]), line([bar(), bar("G")])];
    expect(nearestChordSym(rows, 1, 0)).toBe("F"); // last chord of the split bar
    expect(nearestChordSym(rows, 0, 1)).toBe("C");
  });

  it("falls forward when nothing precedes, null when no chords exist", () => {
    const rows = [line([bar(), bar("Dm")])];
    expect(nearestChordSym(rows, 0, 0)).toBe("Dm");
    expect(nearestChordSym([line([bar(), bar()])], 0, 1)).toBeNull();
    expect(nearestChordSym(rows, 3, 0)).toBeNull(); // bad coords
  });
});
