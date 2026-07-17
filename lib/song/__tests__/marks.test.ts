import { describe, expect, it } from "vitest";
import {
  markRuns,
  toggleWordRange,
  validMarks,
  wordIntervals,
  wordRuns,
} from "../marks";
import { bar, line } from "./helpers";

describe("validMarks", () => {
  const words = ["oh", "what", "a", "night"];

  it("accepts sorted, unique, in-range marks", () => {
    expect(validMarks([], words)).toBe(true);
    expect(validMarks([{ word: 0 }, { word: 3, char: 2 }], words)).toBe(true);
    expect(
      validMarks([{ word: 1 }, { word: 1, char: 2 }], words)
    ).toBe(true);
    expect(
      validMarks([{ word: 3, char: 1, end: 3 }], words)
    ).toBe(true);
    expect(validMarks([{ word: 3, end: 5 }], words)).toBe(true); // = word end
  });

  it("rejects out-of-range, duplicate, or misordered marks", () => {
    expect(validMarks([{ word: 4 }], words)).toBe(false);
    expect(validMarks([{ word: 0, char: 2 }], words)).toBe(false); // "oh" has no char 2
    expect(validMarks([{ word: 1 }, { word: 1 }], words)).toBe(false);
    expect(validMarks([{ word: 2 }, { word: 1 }], words)).toBe(false);
    expect(
      validMarks([{ word: 1, char: 3 }, { word: 1, char: 1 }], words)
    ).toBe(false);
  });

  it("rejects a bad end: past the word, or not after char", () => {
    expect(validMarks([{ word: 3, end: 6 }], words)).toBe(false);
    expect(validMarks([{ word: 3, char: 2, end: 2 }], words)).toBe(false);
    expect(validMarks([{ word: 3, char: 2, end: 1 }], words)).toBe(false);
    expect(validMarks([{ word: 3, end: 2.5 }], words)).toBe(false);
  });
});

describe("wordIntervals", () => {
  it("reads [char, end) per mark, defaulting to whole-word bounds", () => {
    expect(wordIntervals([{ word: 0 }], 0, 6)).toEqual([[0, 6]]);
    expect(wordIntervals([{ word: 0, char: 2 }], 0, 6)).toEqual([[2, 6]]);
    expect(wordIntervals([{ word: 0, char: 2, end: 4 }], 0, 6)).toEqual([
      [2, 4],
    ]);
    expect(wordIntervals([{ word: 1 }], 0, 6)).toEqual([]);
  });

  it("merges overlapping marks (legacy stacked no-end marks)", () => {
    expect(
      wordIntervals([{ word: 0 }, { word: 0, char: 2 }], 0, 6)
    ).toEqual([[0, 6]]);
    expect(
      wordIntervals(
        [{ word: 0, char: 1, end: 3 }, { word: 0, char: 3, end: 5 }],
        0,
        6
      )
    ).toEqual([[1, 5]]);
  });
});

describe("toggleWordRange", () => {
  const l = line([bar("C"), bar("F")], { 0: "oh what a night" });

  it("adds a whole-word mark and removes it on the second toggle", () => {
    const one = toggleWordRange(l, 0, 2, 0, 1);
    expect(one.lyrics[0].marks).toEqual([{ word: 2 }]);
    const two = toggleWordRange(one, 0, 0, 0, 2);
    expect(two.lyrics[0].marks).toEqual([{ word: 0 }, { word: 2 }]);
    const cleared = toggleWordRange(two, 0, 2, 0, 1);
    expect(cleared.lyrics[0].marks).toEqual([{ word: 0 }]);
    const empty = toggleWordRange(cleared, 0, 0, 0, 2);
    expect(empty.lyrics[0].marks).toBeUndefined();
  });

  it("marks an inner syllable with an explicit end", () => {
    const syl = toggleWordRange(l, 0, 3, 2, 4);
    expect(syl.lyrics[0].marks).toEqual([{ word: 3, char: 2, end: 4 }]);
  });

  it("toggling a covered sub-range splits the covering mark", () => {
    const whole = toggleWordRange(l, 0, 3, 0, 5); // "night"
    const hole = toggleWordRange(whole, 0, 3, 2, 4);
    expect(hole.lyrics[0].marks).toEqual([
      { word: 3, end: 2 },
      { word: 3, char: 4 },
    ]);
  });

  it("toggling an uncovered range merges with highlights it touches", () => {
    const a = toggleWordRange(l, 0, 3, 0, 2);
    const b = toggleWordRange(a, 0, 3, 2, 5);
    expect(b.lyrics[0].marks).toEqual([{ word: 3 }]);
  });

  it("turns a legacy no-end mark's sub-range off correctly", () => {
    const legacy = line([bar("C")], {
      0: { text: "soñado", marks: [{ word: 0, char: 2 }] },
    });
    const next = toggleWordRange(legacy, 0, 0, 4, 6);
    expect(next.lyrics[0].marks).toEqual([{ word: 0, char: 2, end: 4 }]);
  });

  it("no-ops by reference on bad targets", () => {
    expect(toggleWordRange(l, 1, 0, 0, 1)).toBe(l); // bar 1 has no lyric
    expect(toggleWordRange(l, 0, 9, 0, 1)).toBe(l); // no such word
    expect(toggleWordRange(l, 0, 0, 0, 5)).toBe(l); // range past "oh"
    expect(toggleWordRange(l, 0, 0, 1, 1)).toBe(l); // empty range
    expect(toggleWordRange(l, 0, 0, -1, 1)).toBe(l);
  });
});

describe("markRuns", () => {
  it("no span or no marks → a single plain run", () => {
    expect(markRuns(undefined)).toEqual([]);
    expect(markRuns({ text: "oh what a night", bar: 0 })).toEqual([
      { text: "oh what a night", emph: false },
    ]);
  });

  it("highlights whole words in place, spaces staying plain", () => {
    expect(
      markRuns({ text: "oh what a night", bar: 0, marks: [{ word: 1 }] })
    ).toEqual([
      { text: "oh ", emph: false },
      { text: "what", emph: true },
      { text: " a night", emph: false },
    ]);
  });

  it("a syllable mark highlights from its char to the word's end", () => {
    expect(
      markRuns({ text: "y como te he soñado", bar: 0, marks: [{ word: 4, char: 2 }] })
    ).toEqual([
      { text: "y como te he so", emph: false },
      { text: "ñado", emph: true },
    ]);
  });

  it("an end-bounded mark highlights an inner syllable only", () => {
    expect(
      markRuns({
        text: "soñado",
        bar: 0,
        marks: [{ word: 0, char: 2, end: 4 }],
      })
    ).toEqual([
      { text: "so", emph: false },
      { text: "ña", emph: true },
      { text: "do", emph: false },
    ]);
  });

  it("legacy stacked marks in one word still render as one merged run", () => {
    expect(
      markRuns({
        text: "soñado",
        bar: 0,
        marks: [{ word: 0 }, { word: 0, char: 2 }],
      })
    ).toEqual([{ text: "soñado", emph: true }]);
    expect(
      markRuns({
        text: "ayer soñado",
        bar: 0,
        marks: [{ word: 1, char: 2 }, { word: 1, char: 4 }],
      })
    ).toEqual([
      { text: "ayer so", emph: false },
      { text: "ñado", emph: true },
    ]);
  });

  it("adjacent marked words merge into one emphasized run", () => {
    expect(
      markRuns({
        text: "oh what a",
        bar: 0,
        marks: [{ word: 0 }, { word: 1 }],
      })
    ).toEqual([
      { text: "oh", emph: true },
      { text: " ", emph: false },
      { text: "what", emph: true },
      { text: " a", emph: false },
    ]);
  });
});

describe("wordRuns", () => {
  it("slices one word into plain/emph runs from its intervals", () => {
    expect(wordRuns("soñado", [])).toEqual([
      { text: "soñado", emph: false },
    ]);
    expect(wordRuns("soñado", [[2, 4]])).toEqual([
      { text: "so", emph: false },
      { text: "ña", emph: true },
      { text: "do", emph: false },
    ]);
    expect(wordRuns("soñado", [[0, 6]])).toEqual([
      { text: "soñado", emph: true },
    ]);
  });
});
