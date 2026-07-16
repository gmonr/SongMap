import { describe, expect, it } from "vitest";
import {
  anchorSegments,
  barTotalBeats,
  setBarBeatBoundary,
  setWordAnchor,
  validAnchors,
} from "../anchors";
import type { Bar } from "../types";
import { bar, line } from "./helpers";

/** A 4-beat bar split C(2) G(2), the typical resize subject. */
const splitBar: Bar = {
  chords: [
    { sym: "C", beats: 2 },
    { sym: "G", beats: 2 },
  ],
};

describe("barTotalBeats", () => {
  it("sums the chords' beats", () => {
    expect(barTotalBeats(bar("C"))).toBe(4);
    expect(barTotalBeats(splitBar)).toBe(4);
  });
});

describe("validAnchors", () => {
  const words = ["oh", "what", "a"];

  it("accepts sorted, in-range, strictly increasing anchors", () => {
    expect(
      validAnchors(
        [
          { word: 0, beat: 0 },
          { word: 2, beat: 2 },
        ],
        words,
        4
      )
    ).toBe(true);
    expect(validAnchors([], [], 4)).toBe(true);
  });

  it("rejects out-of-range, duplicate, or misordered anchors", () => {
    expect(validAnchors([{ word: 3, beat: 0 }], words, 4)).toBe(false);
    expect(validAnchors([{ word: 0, beat: 4 }], words, 4)).toBe(false);
    expect(validAnchors([{ word: 0, beat: 1.5 }], words, 4)).toBe(false);
    expect(
      validAnchors(
        [
          { word: 0, beat: 2 },
          { word: 1, beat: 1 },
        ],
        words,
        4
      )
    ).toBe(false);
    expect(
      validAnchors(
        [
          { word: 1, beat: 0 },
          { word: 1, beat: 2 },
        ],
        words,
        4
      )
    ).toBe(false);
  });

  it("orders same-word syllable anchors by char and bounds char by length", () => {
    expect(
      validAnchors(
        [
          { word: 1, beat: 0 },
          { word: 1, beat: 2, char: 2 },
        ],
        words,
        4
      )
    ).toBe(true);
    expect(
      validAnchors(
        [
          { word: 1, beat: 0, char: 2 },
          { word: 1, beat: 2 },
        ],
        words,
        4
      )
    ).toBe(false); // char 2 can't precede char 0
    expect(validAnchors([{ word: 0, beat: 0, char: 2 }], words, 4)).toBe(
      false
    ); // "oh" has no char 2
  });
});

describe("setWordAnchor", () => {
  const l = line([splitBar, bar("F")], { 0: "oh what a night" });

  it("sets, replaces, and clears an anchor", () => {
    const set = setWordAnchor(l, 0, 2, 2);
    expect(set.lyrics[0].anchors).toEqual([{ word: 2, beat: 2 }]);
    expect(set.bars).toBe(l.bars);

    const moved = setWordAnchor(set, 0, 2, 3);
    expect(moved.lyrics[0].anchors).toEqual([{ word: 2, beat: 3 }]);

    const cleared = setWordAnchor(moved, 0, 2, null);
    expect(cleared.lyrics[0].anchors).toBeUndefined();
  });

  it("no-ops by reference on bad targets and redundant sets", () => {
    expect(setWordAnchor(l, 1, 0, 0)).toBe(l); // bar 1 has no lyric
    expect(setWordAnchor(l, 0, 4, 0)).toBe(l); // word out of range
    expect(setWordAnchor(l, 0, 0, 4)).toBe(l); // beat out of range
    expect(setWordAnchor(l, 0, 0, null)).toBe(l); // nothing to clear
    const set = setWordAnchor(l, 0, 2, 2);
    expect(setWordAnchor(set, 0, 2, 2)).toBe(set); // already there
  });

  it("rejects anchors that would break word/beat ordering", () => {
    const set = setWordAnchor(l, 0, 2, 2);
    // Word 3 can't sing before word 2's beat.
    expect(setWordAnchor(set, 0, 3, 1)).toBe(set);
    expect(setWordAnchor(set, 0, 3, 2)).toBe(set); // nor on the same beat
    // Word 1 can't sing after word 2's beat.
    expect(setWordAnchor(set, 0, 1, 3)).toBe(set);
    // But a consistent second anchor is fine.
    expect(
      setWordAnchor(set, 0, 3, 3).lyrics[0].anchors
    ).toEqual([
      { word: 2, beat: 2 },
      { word: 3, beat: 3 },
    ]);
  });
});

describe("anchorSegments", () => {
  it("renders an unanchored phrase as one full-width segment", () => {
    const l = line([splitBar], { 0: "oh what a night" });
    expect(anchorSegments(splitBar, l.lyrics[0])).toEqual([
      { text: "oh what a night", startBeat: 0, grow: 4, anchored: false, emphLen: 0 },
    ]);
    expect(anchorSegments(splitBar, undefined)).toEqual([
      { text: "", startBeat: 0, grow: 4, anchored: false, emphLen: 0 },
    ]);
  });

  it("splits at anchored words, leading words first", () => {
    const l = line([splitBar], {
      0: { text: "oh what a night", anchors: [{ word: 2, beat: 2 }] },
    });
    expect(anchorSegments(splitBar, l.lyrics[0])).toEqual([
      { text: "oh what", startBeat: 0, grow: 2, anchored: false, emphLen: 0 },
      { text: "a night", startBeat: 2, grow: 2, anchored: true, emphLen: 1 },
    ]);
  });

  it("emits an empty spacer when the first anchor is past beat 0", () => {
    const l = line([splitBar], {
      0: { text: "night", anchors: [{ word: 0, beat: 3 }] },
    });
    expect(anchorSegments(splitBar, l.lyrics[0])).toEqual([
      { text: "", startBeat: 0, grow: 3, anchored: false, emphLen: 0 },
      { text: "night", startBeat: 3, grow: 1, anchored: true, emphLen: 5 },
    ]);
  });

  it("skips the leading segment when the phrase starts anchored at beat 0", () => {
    const l = line([splitBar], {
      0: {
        text: "oh what a night",
        anchors: [
          { word: 0, beat: 0 },
          { word: 2, beat: 2 },
        ],
      },
    });
    expect(anchorSegments(splitBar, l.lyrics[0])).toEqual([
      { text: "oh what", startBeat: 0, grow: 2, anchored: true, emphLen: 2 },
      { text: "a night", startBeat: 2, grow: 2, anchored: true, emphLen: 1 },
    ]);
  });
});

describe("setBarBeatBoundary", () => {
  const anchoredLine = line([splitBar, bar("F")], {
    0: {
      text: "oh what a night",
      anchors: [
        { word: 0, beat: 0 },
        { word: 2, beat: 2 },
      ],
    },
  });

  it("moves the beat split and drags the anchor sitting on it", () => {
    const next = setBarBeatBoundary(anchoredLine, 0, 0, 3);
    expect(next.bars[0].chords.map((c) => c.beats)).toEqual([3, 1]);
    expect(next.lyrics[0].anchors).toEqual([
      { word: 0, beat: 0 },
      { word: 2, beat: 3 }, // followed the boundary from beat 2 to 3
    ]);
    expect(next.lyrics[0].text).toBe("oh what a night");
  });

  it("leaves anchors not on the boundary at their absolute beats", () => {
    const l = line([splitBar], {
      0: { text: "oh what a night", anchors: [{ word: 3, beat: 3 }] },
    });
    const next = setBarBeatBoundary(l, 0, 0, 1);
    expect(next.bars[0].chords.map((c) => c.beats)).toEqual([1, 3]);
    expect(next.lyrics[0].anchors).toEqual([{ word: 3, beat: 3 }]);
  });

  it("un-anchors words the moved anchor leapfrogs", () => {
    const l = line([{ chords: [{ sym: "C", beats: 1 }, { sym: "G", beats: 3 }] }], {
      0: {
        text: "oh what a night",
        anchors: [
          { word: 1, beat: 1 }, // on the boundary
          { word: 2, beat: 2 },
        ],
      },
    });
    const next = setBarBeatBoundary(l, 0, 0, 3);
    expect(next.bars[0].chords.map((c) => c.beats)).toEqual([3, 1]);
    // Word 1 followed the boundary to beat 3; word 2's beat-2 anchor now
    // sits behind an earlier word, so it un-pins.
    expect(next.lyrics[0].anchors).toEqual([{ word: 1, beat: 3 }]);
  });

  it("no-ops by reference like setBeatBoundary", () => {
    expect(setBarBeatBoundary(anchoredLine, 0, 0, 2)).toBe(anchoredLine);
    expect(setBarBeatBoundary(anchoredLine, 5, 0, 2)).toBe(anchoredLine);
    expect(setBarBeatBoundary(anchoredLine, 0, 0, 0)).toBe(anchoredLine);
  });

  it("still resizes bars whose lyric has no anchors", () => {
    const l = line([splitBar], { 0: "plain words" });
    const next = setBarBeatBoundary(l, 0, 0, 1);
    expect(next.bars[0].chords.map((c) => c.beats)).toEqual([1, 3]);
    expect(next.lyrics).toBe(l.lyrics);
  });
});

describe("syllable (char) anchors", () => {
  it("setWordAnchor pins a syllable alongside the word's own anchor", () => {
    const l = line([splitBar], { 0: "como te he soñado" });
    const wordPin = setWordAnchor(l, 0, 3, 2);
    const both = setWordAnchor(wordPin, 0, 3, 3, 2);
    expect(both.lyrics[0].anchors).toEqual([
      { word: 3, beat: 2 },
      { word: 3, beat: 3, char: 2 },
    ]);
    // Clearing targets the exact (word, char) pin.
    expect(setWordAnchor(both, 0, 3, null, 2).lyrics[0].anchors).toEqual([
      { word: 3, beat: 2 },
    ]);
  });

  it("anchorSegments cuts mid-word and emphasizes the syllable", () => {
    const l = line([splitBar], {
      0: { text: "como te he soñado", anchors: [{ word: 3, beat: 2, char: 2 }] },
    });
    expect(anchorSegments(splitBar, l.lyrics[0])).toEqual([
      { text: "como te he so", startBeat: 0, grow: 2, anchored: false, emphLen: 0 },
      { text: "ñado", startBeat: 2, grow: 2, anchored: true, emphLen: 4 },
    ]);
  });

  it("two anchors inside one word emphasize up to the next cut", () => {
    const word = "soñado";
    const l = line([splitBar], {
      0: {
        text: word,
        anchors: [
          { word: 0, beat: 0 },
          { word: 0, beat: 2, char: 2 },
        ],
      },
    });
    expect(anchorSegments(splitBar, l.lyrics[0])).toEqual([
      { text: "so", startBeat: 0, grow: 2, anchored: true, emphLen: 2 },
      { text: "ñado", startBeat: 2, grow: 2, anchored: true, emphLen: 4 },
    ]);
  });
});
