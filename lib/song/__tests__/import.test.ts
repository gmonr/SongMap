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
