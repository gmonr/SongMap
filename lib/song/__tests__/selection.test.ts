import { describe, expect, it } from "vitest";
import {
  encodeFocus,
  mapSelection,
  parseFocus,
  selectionAnchor,
  type ReshapeSelection,
} from "../selection";
import type { Line, SongData } from "../types";
import { bar, line } from "./helpers";

/** One-section SongData; selections in the tests all point at "verse". */
function song(lines: Line[]): SongData {
  return {
    sections: { verse: { label: "Verse", color: "blue", lines } },
    arrangement: [{ ref: "verse", instanceLabel: "Verse 1" }],
  };
}

// Two rows: [C(hello), G, —] / [F(world), Am]. The empty bar has one "" chord.
const DATA = song([
  line([bar("C"), bar("G"), bar()], { 0: "hello there" }),
  line([bar("F"), bar("Am")], { 0: "world" }),
]);

const chordSel: ReshapeSelection = {
  kind: "chord",
  sectionId: "verse",
  li: 0,
  bi: 1,
  ci: 0,
};
const barSel: ReshapeSelection = {
  kind: "bar",
  sectionId: "verse",
  li: 0,
  bi: 0,
};
const phraseSel: ReshapeSelection = {
  kind: "phrase",
  sectionId: "verse",
  li: 0,
  bar: 0,
};
const breakSel: ReshapeSelection = {
  kind: "break",
  sectionId: "verse",
  li: 0,
  boundary: 1,
};

describe("selectionAnchor", () => {
  it("uses the selection's bar index per kind", () => {
    expect(selectionAnchor(chordSel, DATA)).toEqual({
      sectionId: "verse",
      li: 0,
      bi: 1,
    });
    expect(selectionAnchor(phraseSel, DATA)).toEqual({
      sectionId: "verse",
      li: 0,
      bi: 0,
    });
  });

  it("resolves a break to the bar on its right", () => {
    expect(selectionAnchor(breakSel, DATA)?.bi).toBe(1);
  });

  it("clamps a bar index past the end of the line", () => {
    expect(
      selectionAnchor({ ...barSel, li: 1, bi: 7 }, DATA)?.bi
    ).toBe(1);
  });

  it("is null for a missing section, missing line, or null selection", () => {
    expect(selectionAnchor({ ...barSel, sectionId: "nope" }, DATA)).toBeNull();
    expect(selectionAnchor({ ...barSel, li: 9 }, DATA)).toBeNull();
    expect(selectionAnchor(null, DATA)).toBeNull();
  });
});

describe("mapSelection", () => {
  it("maps chord/phrase/break to the bar in rows mode", () => {
    expect(mapSelection(chordSel, "rows", DATA)).toEqual({
      kind: "bar",
      sectionId: "verse",
      li: 0,
      bi: 1,
    });
    expect(mapSelection(phraseSel, "rows", DATA)).toEqual({
      kind: "bar",
      sectionId: "verse",
      li: 0,
      bi: 0,
    });
    expect(mapSelection(breakSel, "rows", DATA)).toEqual({
      kind: "bar",
      sectionId: "verse",
      li: 0,
      bi: 1,
    });
  });

  it("maps into chords mode at ci 0, including on an empty — bar", () => {
    expect(mapSelection(barSel, "chords", DATA)).toEqual({
      kind: "chord",
      sectionId: "verse",
      li: 0,
      bi: 0,
      ci: 0,
    });
    const emptyBarSel: ReshapeSelection = { ...barSel, bi: 2 };
    expect(mapSelection(emptyBarSel, "chords", DATA)).toEqual({
      kind: "chord",
      sectionId: "verse",
      li: 0,
      bi: 2,
      ci: 0,
    });
  });

  it("maps into lyrics mode only when the bar has words", () => {
    expect(mapSelection(barSel, "lyrics", DATA)).toEqual({
      kind: "phrase",
      sectionId: "verse",
      li: 0,
      bar: 0,
    });
    // G bar has no lyric; — bar neither.
    expect(mapSelection(chordSel, "lyrics", DATA)).toBeNull();
    expect(mapSelection({ ...barSel, bi: 2 }, "lyrics", DATA)).toBeNull();
  });

  it("treats a whitespace-only lyric as no lyric", () => {
    const blank = song([line([bar("C")], { 0: "   " })]);
    expect(
      mapSelection({ ...barSel, bi: 0 }, "lyrics", blank)
    ).toBeNull();
  });

  it("returns the selection unchanged in its home mode", () => {
    expect(mapSelection(barSel, "rows", DATA)).toBe(barSel);
    expect(mapSelection(chordSel, "chords", DATA)).toBe(chordSel);
    expect(mapSelection(phraseSel, "lyrics", DATA)).toBe(phraseSel);
    expect(mapSelection(breakSel, "lyrics", DATA)).toBe(breakSel);
  });

  it("clamps a stale bar index and rejects a stale line", () => {
    expect(mapSelection({ ...barSel, bi: 9 }, "chords", DATA)).toEqual({
      kind: "chord",
      sectionId: "verse",
      li: 0,
      bi: 2,
      ci: 0,
    });
    expect(mapSelection({ ...barSel, li: 9 }, "chords", DATA)).toBeNull();
    expect(mapSelection(null, "rows", DATA)).toBeNull();
  });
});

describe("focus param round-trip", () => {
  it("encodes and parses back", () => {
    const a = { sectionId: "verse-1", li: 2, bi: 5 };
    expect(parseFocus(encodeFocus(a))).toEqual(a);
  });

  it("survives a section id containing colons", () => {
    const a = { sectionId: "a:b:c", li: 1, bi: 0 };
    expect(parseFocus(encodeFocus(a))).toEqual(a);
  });

  it("rejects malformed input", () => {
    expect(parseFocus(undefined)).toBeNull();
    expect(parseFocus("")).toBeNull();
    expect(parseFocus("verse")).toBeNull();
    expect(parseFocus("verse:1")).toBeNull();
    expect(parseFocus("verse:x:1")).toBeNull();
    expect(parseFocus("verse:1:-2")).toBeNull();
    expect(parseFocus(":1:2")).toBeNull();
  });
});
