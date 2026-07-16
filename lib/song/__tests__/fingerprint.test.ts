import { describe, expect, it } from "vitest";
import {
  barFingerprint,
  barHasChord,
  detectSectionMatches,
  findMatchingBars,
  linkChords,
  linkSourceOf,
  mergeSections,
  propagateBarChords,
  sectionChordFingerprint,
  sectionContentFingerprint,
  syncLinkedChords,
} from "../fingerprint";
import type { SectionDef, SongData } from "../types";
import { bar, line } from "./helpers";

const section = (
  label: string,
  lines: SectionDef["lines"]
): SectionDef => ({ label, color: "blue", lines });

const song = (
  sections: Record<string, SectionDef>,
  arrangement: SongData["arrangement"]
): SongData => ({ sections, arrangement });

describe("fingerprints", () => {
  it("barFingerprint reflects syms and beats", () => {
    expect(barFingerprint(bar("C"))).toBe("C:4");
    expect(barFingerprint(bar("C", "G"))).toBe("C:2|G:2");
    expect(barFingerprint(bar())).toBe(":4");
  });

  it("chord fingerprint ignores row layout, content fingerprint sees lyrics", () => {
    const oneRow = section("A", [line([bar("C"), bar("G")], { 0: "hey" })]);
    const twoRows = section("B", [
      line([bar("C")], { 0: "hey" }),
      line([bar("G")]),
    ]);
    expect(sectionChordFingerprint(oneRow)).toBe(
      sectionChordFingerprint(twoRows)
    );
    expect(sectionContentFingerprint(oneRow)).toBe(
      sectionContentFingerprint(twoRows)
    );
    const otherWords = section("C", [
      line([bar("C"), bar("G")], { 0: "different" }),
    ]);
    expect(sectionChordFingerprint(otherWords)).toBe(
      sectionChordFingerprint(oneRow)
    );
    expect(sectionContentFingerprint(otherWords)).not.toBe(
      sectionContentFingerprint(oneRow)
    );
  });
});

describe("detectSectionMatches", () => {
  const chorus = () => section("Coro", [line([bar("C"), bar("G")], { 0: "la la" })]);
  const verseWords = (words: string) =>
    section("Estrofa", [line([bar("Am"), bar("F")], { 0: words })]);

  it("classifies exact duplicates and chord-only matches", () => {
    const data = song(
      {
        c1: chorus(),
        c2: chorus(),
        v1: verseWords("primera letra"),
        v2: verseWords("segunda letra"),
      },
      [
        { ref: "v1", instanceLabel: "Estrofa" },
        { ref: "c1", instanceLabel: "Coro" },
        { ref: "v2", instanceLabel: "Estrofa 2" },
        { ref: "c2", instanceLabel: "Coro 2" },
      ]
    );
    const m = detectSectionMatches(data);
    expect(m.exact).toEqual([["c1", "c2"]]);
    expect(m.chordOnly).toEqual([["v1", "v2"]]);
  });

  it("skips placeholder sections and already-linked members", () => {
    const empty = () => section("X", [line([bar(), bar()])]);
    const data = song(
      {
        e1: empty(),
        e2: empty(),
        v1: verseWords("una"),
        v2: verseWords("dos"),
      },
      [
        { ref: "e1", instanceLabel: "X" },
        { ref: "e2", instanceLabel: "X2" },
        { ref: "v1", instanceLabel: "Estrofa" },
        { ref: "v2", instanceLabel: "Estrofa 2", sameChordsAs: "v1" },
      ]
    );
    const m = detectSectionMatches(data);
    expect(m.exact).toEqual([]);
    expect(m.chordOnly).toEqual([]);
  });
});

describe("mergeSections", () => {
  const dup = () => section("Coro", [line([bar("C")], { 0: "la" })]);
  const data = song(
    { c1: dup(), c2: dup(), v: section("V", [line([bar("Am")])]) },
    [
      { ref: "c1", instanceLabel: "Coro" },
      { ref: "v", instanceLabel: "V", sameChordsAs: "c2" },
      { ref: "c2", instanceLabel: "Coro 2" },
    ]
  );

  it("repoints refs and sameChordsAs, deletes dropped sections", () => {
    const out = mergeSections(data, "c1", ["c2"]);
    expect(Object.keys(out.sections)).toEqual(["c1", "v"]);
    expect(out.arrangement).toEqual([
      { ref: "c1", instanceLabel: "Coro" },
      { ref: "v", instanceLabel: "V", sameChordsAs: "c1" },
      { ref: "c1", instanceLabel: "Coro 2", sameChordsAs: undefined },
    ]);
  });

  it("clears links that would point at the section itself", () => {
    const linked = song(
      { c1: dup(), c2: dup() },
      [
        { ref: "c1", instanceLabel: "Coro" },
        { ref: "c2", instanceLabel: "Coro 2", sameChordsAs: "c1" },
      ]
    );
    const out = mergeSections(linked, "c1", ["c2"]);
    expect(out.arrangement[1]).toEqual({
      ref: "c1",
      instanceLabel: "Coro 2",
      sameChordsAs: undefined,
    });
  });

  it("no-ops by reference when there is nothing to merge", () => {
    expect(mergeSections(data, "c1", [])).toBe(data);
    expect(mergeSections(data, "c1", ["c1"])).toBe(data);
    expect(mergeSections(data, "missing", ["c2"])).toBe(data);
    expect(mergeSections(data, "c1", ["missing"])).toBe(data);
  });
});

describe("linkChords", () => {
  const data = song(
    {
      v1: section("Estrofa", [line([bar("Am")])]),
      v2: section("Estrofa 2", [line([bar("Am")])]),
    },
    [
      { ref: "v1", instanceLabel: "Estrofa" },
      { ref: "v2", instanceLabel: "Estrofa 2" },
    ]
  );

  it("links every instance of the targets", () => {
    const out = linkChords(data, ["v2"], "v1");
    expect(out.arrangement[1].sameChordsAs).toBe("v1");
    expect(out.sections).toBe(data.sections);
  });

  it("no-ops by reference when already linked or self-targeted", () => {
    const linked = linkChords(data, ["v2"], "v1");
    expect(linkChords(linked, ["v2"], "v1")).toBe(linked);
    expect(linkChords(data, ["v1"], "v1")).toBe(data);
  });
});

describe("syncLinkedChords", () => {
  // v (source) and p (linked pre-chorus): same 4-bar chord sequence, but p
  // has its own lyrics and a different row layout (2+2 instead of 4).
  const makeData = (): SongData =>
    song(
      {
        v: section("Verse", [
          line([bar("Em"), bar("D"), bar("G"), bar("C")], {
            0: "you call me",
            2: { text: "tellin me", marks: [{ word: 1 }] },
          }),
        ]),
        p: section("Pre", [
          line([bar("Em"), bar("D")], { 0: "otra letra" }),
          line([bar("G"), bar("C")], {
            0: { text: "mas palabras", marks: [{ word: 1 }] },
          }),
        ]),
      },
      [
        { ref: "v", instanceLabel: "Verse 1" },
        { ref: "p", instanceLabel: "Pre-Chorus", sameChordsAs: "v" },
        { ref: "p", instanceLabel: "Pre-Chorus 2", sameChordsAs: "v" },
      ]
    );

  it("linkSourceOf needs every instance on the same source", () => {
    const data = makeData();
    expect(linkSourceOf(data, "p")).toBe("v");
    expect(linkSourceOf(data, "v")).toBeUndefined();
    const partial: SongData = {
      ...data,
      arrangement: [
        data.arrangement[0],
        data.arrangement[1],
        { ref: "p", instanceLabel: "Pre-Chorus 2" },
      ],
    };
    expect(linkSourceOf(partial, "p")).toBeUndefined();
  });

  it("no-ops by reference when already in sync", () => {
    const data = makeData();
    expect(syncLinkedChords(data)).toBe(data);
    expect(syncLinkedChords(data, "v")).toBe(data);
    expect(syncLinkedChords(data, "p")).toBe(data);
  });

  it("a source edit flows to the linked section, keeping its lyrics and rows", () => {
    const data = makeData();
    const edited: SongData = {
      ...data,
      sections: {
        ...data.sections,
        v: section("Verse", [
          line([bar("Em"), bar("D"), bar("G", "G/B"), bar("C")], {
            0: "you call me",
            2: { text: "tellin me", marks: [{ word: 1 }] },
          }),
        ]),
      },
    };
    const out = syncLinkedChords(edited, "v");
    expect(barFingerprint(out.sections.p.lines[1].bars[0])).toBe("G:2|G/B:2");
    // Unchanged bars, lyrics, marks, and row layout survive by reference.
    expect(out.sections.p.lines[0]).toBe(edited.sections.p.lines[0]);
    expect(out.sections.p.lines[1].lyrics).toBe(
      edited.sections.p.lines[1].lyrics
    );
    expect(out.sections.p.lines.length).toBe(2);
    // Fresh cell copies — the sections never share chord objects.
    expect(out.sections.p.lines[1].bars[0].chords[0]).not.toBe(
      edited.sections.v.lines[0].bars[2].chords[0]
    );
  });

  it("an edit in the linked section pushes to the source and its siblings", () => {
    const data: SongData = {
      ...makeData(),
      sections: {
        ...makeData().sections,
        q: section("Bridge", [
          line([bar("Em"), bar("D"), bar("G"), bar("C")]),
        ]),
      },
      arrangement: [
        ...makeData().arrangement,
        { ref: "q", instanceLabel: "Bridge", sameChordsAs: "v" },
      ],
    };
    const edited: SongData = {
      ...data,
      sections: {
        ...data.sections,
        p: section("Pre", [
          line([bar("Em7"), bar("D")], { 0: "otra letra" }),
          data.sections.p.lines[1],
        ]),
      },
    };
    const out = syncLinkedChords(edited, "p");
    expect(barFingerprint(out.sections.v.lines[0].bars[0])).toBe("Em7:4");
    expect(barFingerprint(out.sections.q.lines[0].bars[0])).toBe("Em7:4");
    // The edited section itself is left as the user typed it.
    expect(out.sections.p).toBe(edited.sections.p);
    expect(out.sections.v.lines[0].lyrics).toBe(data.sections.v.lines[0].lyrics);
  });

  it("severs the link when the bar counts no longer match", () => {
    const data = makeData();
    const edited: SongData = {
      ...data,
      sections: {
        ...data.sections,
        p: section("Pre", [
          line([bar("Em"), bar("D")], { 0: "otra letra" }),
          line([bar("G"), bar("C"), bar()]),
        ]),
      },
    };
    const out = syncLinkedChords(edited, "p");
    expect(out.arrangement.map((a) => a.sameChordsAs)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(out.arrangement.every((a) => !("sameChordsAs" in a))).toBe(true);
    // Nobody's chords were touched.
    expect(out.sections).toBe(edited.sections);
  });

  it("follows link chains to the root and survives cycles", () => {
    const chained: SongData = {
      sections: {
        a: section("A", [line([bar("C")])]),
        b: section("B", [line([bar("Am")])]),
        c: section("C", [line([bar("F")])]),
      },
      arrangement: [
        { ref: "a", instanceLabel: "A" },
        { ref: "b", instanceLabel: "B", sameChordsAs: "a" },
        { ref: "c", instanceLabel: "C", sameChordsAs: "b" },
      ],
    };
    const out = syncLinkedChords(chained);
    expect(barFingerprint(out.sections.b.lines[0].bars[0])).toBe("C:4");
    expect(barFingerprint(out.sections.c.lines[0].bars[0])).toBe("C:4");

    const cyclic: SongData = {
      ...chained,
      arrangement: [
        { ref: "a", instanceLabel: "A", sameChordsAs: "c" },
        { ref: "b", instanceLabel: "B", sameChordsAs: "a" },
        { ref: "c", instanceLabel: "C", sameChordsAs: "b" },
      ],
    };
    expect(syncLinkedChords(cyclic)).toBe(cyclic);
  });
});

describe("bar propagation", () => {
  // v: [G][C] / [G][D] — "G:4" appears twice in v (plus once in c).
  const makeData = (): SongData =>
    song(
      {
        v: section("Estrofa", [
          line([bar("G"), bar("C")], { 0: "una", 1: "letra" }),
          line([bar("G"), bar("D")], {
            0: { text: "dos palabras", marks: [{ word: 1 }] },
          }),
        ]),
        c: section("Coro", [line([bar("Am"), bar("G")])]),
      },
      [
        { ref: "v", instanceLabel: "Estrofa" },
        { ref: "c", instanceLabel: "Coro" },
      ]
    );

  it("barHasChord is false only for placeholder bars", () => {
    expect(barHasChord(bar("G"))).toBe(true);
    expect(barHasChord(bar("", "C"))).toBe(true);
    expect(barHasChord(bar())).toBe(false);
    expect(barHasChord({ chords: [{ sym: "  ", beats: 4 }] })).toBe(false);
  });

  it("findMatchingBars scans every section, excluding the edited bar", () => {
    const data = makeData();
    expect(findMatchingBars(data, "G:4")).toEqual([
      { sectionId: "v", li: 0, bi: 0 },
      { sectionId: "v", li: 1, bi: 0 },
      { sectionId: "c", li: 0, bi: 1 },
    ]);
    expect(
      findMatchingBars(data, "G:4", { sectionId: "v", li: 0, bi: 0 })
    ).toEqual([
      { sectionId: "v", li: 1, bi: 0 },
      { sectionId: "c", li: 0, bi: 1 },
    ]);
    expect(findMatchingBars(data, "F#m:4")).toEqual([]);
  });

  it("propagates the source bar's chords, leaving lyrics and marks alone", () => {
    const data = makeData();
    // The user re-split v[0][0] into G:2|G/B:2; stamp the two other "G:4"s.
    const edited: SongData = {
      ...data,
      sections: {
        ...data.sections,
        v: {
          ...data.sections.v,
          lines: [
            line(
              [{ chords: [{ sym: "G", beats: 2 }, { sym: "G/B", beats: 2 }] }, bar("C")],
              { 0: "una", 1: "letra" }
            ),
            data.sections.v.lines[1],
          ],
        },
      },
    };
    const source = { sectionId: "v", li: 0, bi: 0 };
    const out = propagateBarChords(
      edited,
      source,
      findMatchingBars(edited, "G:4", source)
    );

    expect(barFingerprint(out.sections.v.lines[1].bars[0])).toBe("G:2|G/B:2");
    expect(barFingerprint(out.sections.c.lines[0].bars[1])).toBe("G:2|G/B:2");
    // Untouched bars and every lyric span (marks included) survive as-is.
    expect(out.sections.v.lines[0]).toBe(edited.sections.v.lines[0]);
    expect(out.sections.c.lines[0].bars[0]).toBe(
      edited.sections.c.lines[0].bars[0]
    );
    expect(out.sections.v.lines[1].lyrics).toBe(
      edited.sections.v.lines[1].lyrics
    );
    // Fresh cell copies: mutating a stamped bar can't reach the source.
    expect(out.sections.v.lines[1].bars[0].chords[0]).not.toBe(
      edited.sections.v.lines[0].bars[0].chords[0]
    );
  });

  it("no-ops by reference on empty/self/already-matching/missing targets", () => {
    const data = makeData();
    const source = { sectionId: "v", li: 0, bi: 0 };
    expect(propagateBarChords(data, source, [])).toBe(data);
    expect(propagateBarChords(data, source, [source])).toBe(data);
    // Targets that already fingerprint like the source are skipped.
    expect(
      propagateBarChords(data, source, [{ sectionId: "c", li: 0, bi: 1 }])
    ).toBe(data);
    expect(
      propagateBarChords(data, source, [{ sectionId: "x", li: 0, bi: 0 }])
    ).toBe(data);
    expect(
      propagateBarChords(data, { sectionId: "x", li: 0, bi: 0 }, [
        { sectionId: "v", li: 1, bi: 0 },
      ])
    ).toBe(data);
  });
});
