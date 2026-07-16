import { describe, expect, it } from "vitest";
import {
  anchorsAfterRetype,
  lineWordLayout,
  setBarLyric,
  setLead,
  setWordBoundary,
  shiftLyric,
} from "../lyrics";
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

describe("word→beat anchors across lyric ops", () => {
  it("setWordBoundary keeps staying words' anchors, reindexing the right bar", () => {
    const l = line([bar("C"), bar("F")], {
      0: { text: "oh what a", anchors: [{ word: 1, beat: 2 }] },
      1: { text: "night we had", anchors: [{ word: 1, beat: 1 }] },
    });
    // Boundary moves right by one: "night" transfers to the left bar.
    const next = setWordBoundary(l, 1, 4);
    expect(next.lyrics.find((s) => s.bar === 0)?.anchors).toEqual([
      { word: 1, beat: 2 }, // "what" stayed put
    ]);
    expect(next.lyrics.find((s) => s.bar === 1)?.anchors).toEqual([
      { word: 0, beat: 1 }, // "we" reindexed from word 1 to 0
    ]);
  });

  it("setWordBoundary un-anchors words that changed bars", () => {
    const l = line([bar("C"), bar("F")], {
      0: { text: "oh what a", anchors: [{ word: 2, beat: 3 }] },
      1: "night",
    });
    // "a" moves into the right bar: its beat belonged to the left bar.
    const next = setWordBoundary(l, 1, 2);
    expect(next.lyrics.find((s) => s.bar === 0)?.anchors).toBeUndefined();
    expect(next.lyrics.find((s) => s.bar === 1)?.anchors).toBeUndefined();
  });

  it("setBarLyric keeps anchors on a same-word-count retype, drops otherwise", () => {
    const l = line([bar("C")], {
      0: { text: "oh whut a night", anchors: [{ word: 1, beat: 1 }] },
    });
    const fixed = setBarLyric(l, 0, "oh what a night");
    expect(fixed.lyrics[0].anchors).toEqual([{ word: 1, beat: 1 }]);
    const rewritten = setBarLyric(l, 0, "completely different words here now");
    expect(rewritten.lyrics[0].anchors).toBeUndefined();
  });

  it("shiftLyric carries a phrase's anchors to its new bar", () => {
    const l = line([bar("C"), bar("F")], {
      0: { text: "hey now", anchors: [{ word: 1, beat: 2 }] },
    });
    const next = shiftLyric(l, 0, 1);
    expect(next.lyrics).toEqual([
      { text: "hey now", bar: 1, anchors: [{ word: 1, beat: 2 }] },
    ]);
  });
});

describe("anchorsAfterRetype", () => {
  it("keeps word pins and in-range syllable pins, drops the rest", () => {
    expect(
      anchorsAfterRetype(
        [
          { word: 0, beat: 0 },
          { word: 1, beat: 2, char: 4 },
        ],
        ["oh", "night"]
      )
    ).toEqual([
      { word: 0, beat: 0 },
      { word: 1, beat: 2, char: 4 },
    ]);
    // The retyped word got shorter than the syllable offset.
    expect(
      anchorsAfterRetype([{ word: 1, beat: 2, char: 4 }], ["oh", "hey"])
    ).toBeUndefined();
  });
});

describe("setLead (anacrusis)", () => {
  const l = line([bar("C"), bar("F")], { 0: "y como te he soñado" });

  it("marks and clears the pickup, dropping pins on pickup words", () => {
    const withPin = line([bar("C")], {
      0: {
        text: "y como te he soñado",
        anchors: [
          { word: 0, beat: 0 },
          { word: 2, beat: 2 },
        ],
      },
    });
    const led = setLead(withPin, 0, 2);
    expect(led.lyrics[0].lead).toBe(2);
    // The word-0 pin sat on a pickup word — it un-pins.
    expect(led.lyrics[0].anchors).toEqual([{ word: 2, beat: 2 }]);
    const cleared = setLead(led, 0, 0);
    expect(cleared.lyrics[0].lead).toBeUndefined();
  });

  it("no-ops by reference on bad targets", () => {
    expect(setLead(l, 1, 1)).toBe(l); // bar 1 has no lyric
    expect(setLead(l, 0, 5)).toBe(l); // every word can't be pickup
    expect(setLead(l, 0, -1)).toBe(l);
    expect(setLead(l, 0, 0)).toBe(l); // already no pickup
  });

  it("survives ops that keep the phrase's words", () => {
    const led = setLead(l, 0, 1);
    expect(shiftLyric(led, 0, 1).lyrics[0]).toEqual({
      text: "y como te he soñado",
      bar: 1,
      lead: 1,
    });
    expect(setBarLyric(led, 0, "y como te he sonado").lyrics[0].lead).toBe(1);
    expect(
      setBarLyric(led, 0, "different words").lyrics[0].lead
    ).toBeUndefined();
  });

  it("setWordBoundary shifts the downbeat marker with transferred words", () => {
    const two = line([bar("C"), bar("F")], {
      0: "oh what",
      1: { text: "a night we", lead: 1 },
    });
    // One word moves left→right: the pickup grows to cover it.
    const grown = setWordBoundary(two, 1, 1);
    expect(grown.lyrics.find((s) => s.bar === 1)?.lead).toBe(2);
    // Words moving right→left shrink it to nothing.
    const shrunk = setWordBoundary(two, 1, 3);
    expect(shrunk.lyrics.find((s) => s.bar === 1)?.lead).toBeUndefined();
  });
});
