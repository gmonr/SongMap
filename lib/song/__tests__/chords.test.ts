import { describe, expect, it } from "vitest";
import { chordMoveTarget, evenBeats, moveChord } from "../chords";
import { bar, line, lyricsOf } from "./helpers";
import type { Line } from "../types";

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

  it("re-splits beats to the time signature (3/4)", () => {
    const out = moveChord([line([bar("Am", "F"), bar("G")])], 0, 0, 1, 1, 3);
    expect(chordsOf(out[0])).toEqual([["Am:3"], ["F:1", "G:2"]]);
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
