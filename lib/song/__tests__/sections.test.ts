import { describe, expect, it } from "vitest";
import { duplicateSection, renumberSections, splitSection } from "../sections";
import type { SectionDef, SongData } from "../types";
import { bar, line } from "./helpers";

const section = (
  label: string,
  lines: SectionDef["lines"],
  color = "blue"
): SectionDef => ({ label, color, lines });

const song = (
  sections: Record<string, SectionDef>,
  arrangement: SongData["arrangement"]
): SongData => ({ sections, arrangement });

describe("renumberSections", () => {
  it("numbers a group of differing same-name sections in arrangement order", () => {
    const data = song(
      {
        c1: section("Chorus", [line([bar("C")], { 0: "la" })]),
        c2: section("Chorus", [line([bar("G")], { 0: "na" })]),
        c3: section("Chorus", [line([bar("Am")], { 0: "oh" })]),
      },
      [
        { ref: "c2", instanceLabel: "Chorus" },
        { ref: "c1", instanceLabel: "Chorus" },
        { ref: "c3", instanceLabel: "Chorus" },
      ]
    );
    const out = renumberSections(data);
    expect(out.sections.c2.label).toBe("Chorus 1");
    expect(out.sections.c1.label).toBe("Chorus 2");
    expect(out.sections.c3.label).toBe("Chorus 3");
    expect(out.arrangement.map((a) => a.instanceLabel)).toEqual([
      "Chorus 1",
      "Chorus 2",
      "Chorus 3",
    ]);
  });

  it("keeps an existing unique number and fills the rest around it", () => {
    const data = song(
      {
        a: section("Chorus 5", [line([bar("C")], { 0: "la" })]),
        b: section("Chorus", [line([bar("G")], { 0: "na" })]),
      },
      [
        { ref: "a", instanceLabel: "Chorus 5" },
        { ref: "b", instanceLabel: "Chorus" },
      ]
    );
    const out = renumberSections(data);
    expect(out.sections.a.label).toBe("Chorus 5");
    expect(out.sections.b.label).toBe("Chorus 1");
  });

  it("renumbers a duplicated number too, since it no longer uniquely identifies a member", () => {
    const data = song(
      {
        a: section("Chorus 2", [line([bar("C")], { 0: "la" })]),
        b: section("Chorus 2", [line([bar("G")], { 0: "na" })]),
        c: section("Chorus", [line([bar("Am")], { 0: "oh" })]),
      },
      [
        { ref: "a", instanceLabel: "Chorus 2" },
        { ref: "b", instanceLabel: "Chorus 2" },
        { ref: "c", instanceLabel: "Chorus" },
      ]
    );
    const out = renumberSections(data);
    const labels = ["a", "b", "c"].map((id) => out.sections[id].label);
    expect(new Set(labels).size).toBe(3);
    expect(labels).toEqual(["Chorus 1", "Chorus 2", "Chorus 3"]);
  });

  it("leaves identical-content groups alone (merge candidates, not renumber candidates)", () => {
    const data = song(
      {
        a: section("Chorus", [line([bar("C")], { 0: "la" })]),
        b: section("Chorus", [line([bar("C")], { 0: "la" })]),
      },
      [
        { ref: "a", instanceLabel: "Chorus" },
        { ref: "b", instanceLabel: "Chorus 2" },
      ]
    );
    expect(renumberSections(data)).toBe(data);
  });

  it("updates an instance label that matched the old label, leaves a custom one alone", () => {
    const data = song(
      {
        a: section("Chorus", [line([bar("C")], { 0: "la" })]),
        b: section("Chorus", [line([bar("G")], { 0: "na" })]),
      },
      [
        { ref: "a", instanceLabel: "Chorus" },
        { ref: "b", instanceLabel: "Big finish" },
      ]
    );
    const out = renumberSections(data);
    expect(out.arrangement[0].instanceLabel).toBe(out.sections.a.label);
    expect(out.arrangement[1].instanceLabel).toBe("Big finish");
  });

  it("groups case-insensitively but keeps each member's own base casing", () => {
    const data = song(
      {
        a: section("chorus", [line([bar("C")], { 0: "la" })]),
        b: section("Chorus", [line([bar("G")], { 0: "na" })]),
      },
      [
        { ref: "a", instanceLabel: "chorus" },
        { ref: "b", instanceLabel: "Chorus" },
      ]
    );
    const out = renumberSections(data);
    expect(out.sections.a.label).toBe("chorus 1");
    expect(out.sections.b.label).toBe("Chorus 2");
  });

  it("no-ops by reference when nothing needs renumbering", () => {
    const data = song({ a: section("Verse", [line([bar("C")])]) }, [
      { ref: "a", instanceLabel: "Verse" },
    ]);
    expect(renumberSections(data)).toBe(data);
  });
});

describe("duplicateSection", () => {
  const makeData = (): SongData =>
    song(
      { v: section("Verse", [line([bar("C"), bar("G")], { 0: "la", 1: "na" })]) },
      [
        { ref: "v", instanceLabel: "Verse 1" },
        { ref: "v", instanceLabel: "Verse 1 repeat" },
      ]
    );

  it("deep-copies the section so mutating the copy never touches the original", () => {
    const data = makeData();
    const out = duplicateSection(data, "v", "v2");
    out.sections.v2.lines[0].bars[0].chords[0].sym = "Dm";
    out.sections.v2.lines[0].lyrics[0].text = "changed";
    expect(data.sections.v.lines[0].bars[0].chords[0].sym).toBe("C");
    expect(data.sections.v.lines[0].lyrics[0].text).toBe("la");
    expect(out.sections.v2.lines[0]).not.toBe(data.sections.v.lines[0]);
    expect(out.sections.v2.lines[0].bars[0]).not.toBe(data.sections.v.lines[0].bars[0]);
    expect(out.sections.v2.lines[0].bars[0].chords[0]).not.toBe(
      data.sections.v.lines[0].bars[0].chords[0]
    );
  });

  it("gives the copy the next free number and inserts right after the source's last instance", () => {
    const data = makeData();
    const out = duplicateSection(data, "v", "v2");
    expect(out.sections.v2.label).toBe("Verse 2");
    expect(out.sections.v2.color).toBe("blue");
    expect(out.arrangement.map((a) => a.ref)).toEqual(["v", "v", "v2"]);
    expect(out.arrangement[2].instanceLabel).toBe("Verse 2");
  });

  it("appends at the end when the source has no arrangement instance", () => {
    const data = song(
      {
        v: section("Verse", [line([bar("C")])]),
        w: section("Bridge", [line([bar("Am")])]),
      },
      [{ ref: "v", instanceLabel: "Verse" }]
    );
    const out = duplicateSection(data, "w", "w2");
    expect(out.arrangement.map((a) => a.ref)).toEqual(["v", "w2"]);
  });

  it("no-ops by reference when the source id doesn't exist", () => {
    const data = makeData();
    expect(duplicateSection(data, "missing", "v2")).toBe(data);
  });
});

describe("splitSection", () => {
  const makeData = (): SongData =>
    song(
      {
        v: section("Verse", [
          line([bar("C")], { 0: "one" }),
          line([bar("G")], { 0: "two" }),
          line([bar("Am")], { 0: "three" }),
        ]),
        p: section("Pre", [
          line([bar("C")], { 0: "x" }),
          line([bar("G")], { 0: "y" }),
          line([bar("Am")], { 0: "z" }),
        ]),
      },
      [
        { ref: "v", instanceLabel: "Verse 1" },
        { ref: "v", instanceLabel: "Verse 2", repeat: 2 },
        { ref: "p", instanceLabel: "Pre", sameChordsAs: "v" },
      ]
    );

  it("partitions lines at the split point", () => {
    const out = splitSection(makeData(), "v", 1, "v2");
    expect(out.sections.v.lines).toHaveLength(1);
    expect(out.sections.v2.lines).toHaveLength(2);
    expect(out.sections.v.lines[0].lyrics[0].text).toBe("one");
    expect(out.sections.v2.lines[0].lyrics[0].text).toBe("two");
    expect(out.sections.v2.lines[1].lyrics[0].text).toBe("three");
    expect(out.sections.v2.label).toBe("Verse 2");
    expect(out.sections.v2.color).toBe(out.sections.v.color);
  });

  it("inserts the new section after every instance, expanding repeats into pairs", () => {
    const out = splitSection(makeData(), "v", 1, "v2");
    const vAndV2 = out.arrangement.filter((a) => a.ref === "v" || a.ref === "v2");
    expect(vAndV2.map((a) => a.ref)).toEqual(["v", "v2", "v", "v2", "v", "v2"]);
    expect(out.arrangement.every((a) => a.ref !== "v" || a.repeat === undefined)).toBe(
      true
    );
    // The third entry ("Verse 2" x2) expanded into two pairs.
    expect(vAndV2[2].instanceLabel).toBe("Verse 2");
    expect(vAndV2[4].instanceLabel).toBe("Verse 2");
  });

  it("severs sameChordsAs links whose bar count no longer matches", () => {
    const out = splitSection(makeData(), "v", 1, "v2");
    const pItem = out.arrangement.find((a) => a.ref === "p");
    expect(pItem?.sameChordsAs).toBeUndefined();
  });

  it("no-ops by reference for an invalid split index", () => {
    const data = makeData();
    expect(splitSection(data, "v", 0, "v2")).toBe(data);
    expect(splitSection(data, "v", 3, "v2")).toBe(data);
    expect(splitSection(data, "v", -1, "v2")).toBe(data);
    expect(splitSection(data, "missing", 1, "v2")).toBe(data);
  });
});
