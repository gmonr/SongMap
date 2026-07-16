import { describe, expect, it } from "vitest";
import { markRuns, toggleWordMark, validMarks } from "../marks";
import { bar, line } from "./helpers";

describe("validMarks", () => {
  const words = ["oh", "what", "a", "night"];

  it("accepts sorted, unique, in-range marks", () => {
    expect(validMarks([], words)).toBe(true);
    expect(validMarks([{ word: 0 }, { word: 3, char: 2 }], words)).toBe(true);
    expect(
      validMarks([{ word: 1 }, { word: 1, char: 2 }], words)
    ).toBe(true);
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
});

describe("toggleWordMark", () => {
  const l = line([bar("C"), bar("F")], { 0: "oh what a night" });

  it("adds a mark, sorted into place, and removes it on the second toggle", () => {
    const one = toggleWordMark(l, 0, 2);
    expect(one.lyrics[0].marks).toEqual([{ word: 2 }]);
    const two = toggleWordMark(one, 0, 0);
    expect(two.lyrics[0].marks).toEqual([{ word: 0 }, { word: 2 }]);
    const cleared = toggleWordMark(two, 0, 2);
    expect(cleared.lyrics[0].marks).toEqual([{ word: 0 }]);
    const empty = toggleWordMark(cleared, 0, 0);
    expect(empty.lyrics[0].marks).toBeUndefined();
  });

  it("marks a syllable via char, independent of the whole-word mark", () => {
    const syl = toggleWordMark(l, 0, 3, 2);
    expect(syl.lyrics[0].marks).toEqual([{ word: 3, char: 2 }]);
    const both = toggleWordMark(syl, 0, 3);
    expect(both.lyrics[0].marks).toEqual([{ word: 3 }, { word: 3, char: 2 }]);
  });

  it("no-ops by reference on bad targets", () => {
    expect(toggleWordMark(l, 1, 0)).toBe(l); // bar 1 has no lyric
    expect(toggleWordMark(l, 0, 9)).toBe(l); // no such word
    expect(toggleWordMark(l, 0, 0, 5)).toBe(l); // char past "oh"
    expect(toggleWordMark(l, 0, 0, -1)).toBe(l);
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

  it("two marks in one word split it at the second's char", () => {
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
