import { describe, expect, it } from "vitest";
import { importChordSheet } from "../import";
import type { Line } from "../types";

/** Lines of the only section, for single-section sheets. */
function linesOf(text: string): Line[] {
  const imp = importChordSheet(text, 4);
  const section = imp.data.sections[imp.data.arrangement[0].ref];
  return section.lines;
}

describe("importChordSheet lyric spacing", () => {
  it("keeps the space when a chord sits above a word boundary", () => {
    // "A" is above the space between "he" and "soñado" — the lyric must not
    // collapse into "hesoñado".
    const [line] = linesOf(
      "Bm                 A\n" + "no sabes como te he soñado"
    );
    expect(line.bars.map((b) => b.chords[0].sym)).toEqual(["Bm", "A"]);
    expect(line.lyrics.map((s) => s.text)).toEqual([
      "no sabes como te he",
      "soñado",
    ]);
  });

  it("keeps word boundaries under the last chord of a multi-chord line", () => {
    const [line] = linesOf("Bm      G      A\n" + "no me digas que no");
    expect(line.lyrics.map((s) => s.text)).toEqual(["no me digas", "que", "no"]);
  });

  it("keeps the boundary when lyrics continue past the last chord", () => {
    const [line] = linesOf(
      "Bm                 A\n" + "Conmigo tu hasta el fin de el mundo"
    );
    expect(line.lyrics.map((s) => s.text)).toEqual([
      "Conmigo tu hasta el",
      "fin de el mundo",
    ]);
  });

  it("still rejoins words genuinely split by a mid-word chord change", () => {
    // "A" is above the "s" of "deseo": the split chunks "de" + "seo" must be
    // rejoined and stay with the bar where the word starts.
    const [line] = linesOf(
      "Bm                 A\n" + "No sabes como te deseo"
    );
    expect(line.lyrics.map((s) => s.text)).toEqual(["No sabes como te deseo"]);
  });
});

describe("importChordSheet Spanish section headers", () => {
  it("opens sections for [I Estrofa]/[Coro]-style headers", () => {
    const imp = importChordSheet(
      [
        "[I Estrofa]",
        "Bm                 A",
        "No sabes como te deseo",
        "",
        "[Coro]",
        "D                 A",
        "Oye mi amor",
        "",
        "[II Estrofa]",
        "Bm                 A",
        "Conmigo tu alucinarias",
      ].join("\n"),
      4
    );
    expect(imp.warnings).toEqual([]);
    const labels = imp.data.arrangement.map(
      (item) => imp.data.sections[item.ref].label
    );
    expect(labels).toEqual(["I Estrofa", "Coro", "II Estrofa"]);
  });

  it("maps Spanish labels to the matching section colors", () => {
    const imp = importChordSheet(
      ["[Coro]", "C", "la", "", "[Puente]", "G", "la", "", "[Pre-Coro]", "F", "la"].join(
        "\n"
      ),
      4
    );
    const colors = imp.data.arrangement.map(
      (item) => imp.data.sections[item.ref].color
    );
    expect(colors).toEqual(["amber", "purple", "teal"]);
  });

  it("re-references an earlier section on a bare repeated header", () => {
    const imp = importChordSheet(
      ["[Coro]", "C  G", "la la", "", "[Estrofa]", "D", "words", "", "[Coro]"].join(
        "\n"
      ),
      4
    );
    const refs = imp.data.arrangement.map((item) => item.ref);
    expect(refs).toEqual(["coro", "estrofa", "coro"]);
    expect(Object.keys(imp.data.sections)).toHaveLength(2);
  });

  it("leaves prose comments alone", () => {
    const imp = importChordSheet(
      ["[Estrofa]", "C", "la", "[repite suave hasta el final]", "G", "laa"].join("\n"),
      4
    );
    expect(imp.data.arrangement).toHaveLength(1);
    const section = imp.data.sections[imp.data.arrangement[0].ref];
    expect(section.label).toBe("Estrofa");
    expect(section.lines).toHaveLength(2);
  });
});

describe("importChordSheet renumbers distinct same-named sections", () => {
  it("numbers two different [Chorus] bodies distinctly", () => {
    const imp = importChordSheet(
      [
        "{start_of_chorus}",
        "[C]La la la",
        "{end_of_chorus}",
        "{start_of_verse}",
        "[Dm]Some verse",
        "{end_of_verse}",
        "{start_of_chorus}",
        "[G]Na na na na",
        "{end_of_chorus}",
      ].join("\n"),
      4
    );
    expect(Object.keys(imp.data.sections).length).toBeGreaterThanOrEqual(3);
    const chorusLabels = imp.data.arrangement
      .map((item) => imp.data.sections[item.ref].label)
      .filter((label) => label.startsWith("Chorus"));
    expect(chorusLabels.sort()).toEqual(["Chorus 1", "Chorus 2"]);
  });

  it("leaves a bare repeated [Chorus] header alone (same section, not renumbered)", () => {
    const imp = importChordSheet(
      ["[Coro]", "C  G", "la la", "", "[Estrofa]", "D", "words", "", "[Coro]"].join(
        "\n"
      ),
      4
    );
    const labels = imp.data.arrangement.map(
      (item) => imp.data.sections[item.ref].label
    );
    expect(labels).toEqual(["Coro", "Estrofa", "Coro"]);
  });
});
