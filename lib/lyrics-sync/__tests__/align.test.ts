import { describe, expect, it } from "vitest";
import { buildTimeline } from "@/lib/song/playback";
import type { Line, SongData } from "@/lib/song/types";
import { emptySync } from "@/lib/spotify/sync";
import {
  alignLyrics,
  normalizeWord,
  placementMismatches,
  songWordStream,
  suggestAnchors,
  suggestPhraseFill,
} from "../align";
import { applyPhraseFill, applyPlacementShifts } from "../apply";
import type { LrcLine } from "../lrc";

const BPM = 120; // 500 ms/beat; a 4-beat bar spans 2000 ms.

function bar(sym: string) {
  return { chords: [{ sym, beats: 4 }] };
}

function line(syms: string[], lyrics: (string | null)[]): Line {
  return {
    bars: syms.map(bar),
    lyrics: lyrics
      .map((text, i) => ({ text: text ?? "", bar: i }))
      .filter((s) => s.text !== ""),
  };
}

/** Verse (2 bars, lyrics), chorus (2 bars, lyrics) played twice. */
function demoSong(): SongData {
  return {
    sections: {
      verse: {
        label: "Verse",
        color: "blue",
        lines: [line(["C", "G"], ["hold me close", "never let go"])],
      },
      chorus: {
        label: "Chorus",
        color: "amber",
        lines: [line(["F", "C"], ["sing it loud", "sing it proud"])],
      },
    },
    arrangement: [
      { ref: "verse", instanceLabel: "Verse 1" },
      { ref: "chorus", instanceLabel: "Chorus", repeat: 2 },
    ],
  };
}

const PERFECT_LRC: LrcLine[] = [
  { ms: 0, text: "hold me close" },
  { ms: 2000, text: "never let go" },
  { ms: 4000, text: "sing it loud" },
  { ms: 6000, text: "sing it proud" },
  { ms: 8000, text: "sing it loud" },
  { ms: 10000, text: "sing it proud" },
];

describe("normalizeWord", () => {
  it("strips case, diacritics, and punctuation", () => {
    expect(normalizeWord("Soñado,")).toBe("sonado");
    expect(normalizeWord("don't")).toBe("dont");
    expect(normalizeWord("¡…!")).toBe("");
  });
});

describe("songWordStream", () => {
  it("walks the unrolled timeline with definition addresses", () => {
    const data = demoSong();
    const words = songWordStream(data, buildTimeline(data));
    // 6 words in the definitions + 6 replayed on the chorus's second pass.
    expect(words).toHaveLength(18);
    expect(words[0]).toMatchObject({
      text: "hold",
      sectionId: "verse",
      bar: 0,
      wordIdx: 0,
      startBeat: 0,
      firstPass: true,
    });
    const secondPass = words.slice(12);
    expect(secondPass.every((w) => !w.firstPass)).toBe(true);
    expect(secondPass[0]).toMatchObject({
      sectionId: "chorus",
      bar: 0,
      startBeat: 16,
    });
  });
});

describe("alignLyrics", () => {
  it("binds an exact match with full confidence", () => {
    const data = demoSong();
    const matches = alignLyrics(
      songWordStream(data, buildTimeline(data)),
      PERFECT_LRC
    );
    expect(matches).toHaveLength(6);
    for (const m of matches) expect(m.confidence).toBe(1);
    expect(matches[1].firstSongWord).toMatchObject({
      sectionId: "verse",
      bar: 1,
      startBeat: 4,
    });
    // The repeated chorus binds each pass to its own occurrence.
    expect(matches[4].firstSongWord?.startBeat).toBe(16);
  });

  it("survives typos and skips ad-lib lines", () => {
    const data = demoSong();
    const lrc: LrcLine[] = [
      { ms: 0, text: "hold me clse" }, // typo
      { ms: 1500, text: "yeah yeah yeah" }, // ad-lib, not on the map
      { ms: 2000, text: "never let go" },
    ];
    const matches = alignLyrics(songWordStream(data, buildTimeline(data)), lrc);
    expect(matches[0].confidence).toBe(1);
    expect(matches[1].confidence).toBe(0);
    expect(matches[1].firstSongWord).toBeNull();
    expect(matches[2].confidence).toBe(1);
  });

  it("ignores a line whose own first word failed to bind", () => {
    const data = demoSong();
    const lrc: LrcLine[] = [{ ms: 0, text: "oh hold me close" }];
    const matches = alignLyrics(songWordStream(data, buildTimeline(data)), lrc);
    expect(matches[0].firstSongWord).toBeNull();
    expect(matches[0].matchedCount).toBe(3);
  });
});

describe("suggestAnchors", () => {
  it("fits a clean tempo line down to two anchors", () => {
    const data = demoSong();
    const matches = alignLyrics(
      songWordStream(data, buildTimeline(data)),
      PERFECT_LRC
    );
    const s = suggestAnchors(matches);
    expect(s.candidateCount).toBe(6);
    expect(s.fittedBpm).toBe(BPM);
    expect(s.anchors).toEqual([
      { beat: 0, ms: 0 },
      { beat: 20, ms: 10000 },
    ]);
  });

  it("absorbs vocal-onset jitter through the fit", () => {
    const data = demoSong();
    const jittered = PERFECT_LRC.map((l, i) => ({
      ...l,
      ms: l.ms + (i % 2 === 0 ? 150 : -120),
    }));
    const s = suggestAnchors(
      alignLyrics(songWordStream(data, buildTimeline(data)), jittered)
    );
    expect(s.anchors).toHaveLength(2);
    expect(s.fittedBpm).toBeGreaterThan(115);
    expect(s.fittedBpm).toBeLessThan(125);
  });

  it("drops non-monotonic evidence (misbound repeats)", () => {
    const data = demoSong();
    const lrc: LrcLine[] = [
      { ms: 4000, text: "hold me close" },
      { ms: 2000, text: "never let go" }, // earlier ms at a later beat
    ];
    const s = suggestAnchors(
      alignLyrics(songWordStream(data, buildTimeline(data)), lrc)
    );
    expect(s.anchors).toEqual([{ beat: 0, ms: 4000 }]);
  });
});

describe("suggestPhraseFill", () => {
  it("places lines on empty bars and never doubles a definition bar", () => {
    const data = demoSong();
    // Strip all lyrics: chords-only import.
    for (const def of Object.values(data.sections)) {
      def.lines = def.lines.map((l) => ({ ...l, lyrics: [] }));
    }
    const t = buildTimeline(data);
    const s = suggestPhraseFill(data, t, emptySync(), BPM, PERFECT_LRC);
    expect(s.fills).toEqual([
      { sectionId: "verse", li: 0, bar: 0, text: "hold me close" },
      { sectionId: "verse", li: 0, bar: 1, text: "never let go" },
      { sectionId: "chorus", li: 0, bar: 0, text: "sing it loud" },
      { sectionId: "chorus", li: 0, bar: 1, text: "sing it proud" },
    ]);
    // The second chorus pass replays the same definition bars.
    expect(s.unplaced).toBe(2);
  });

  it("never proposes occupied bars", () => {
    const data = demoSong();
    const t = buildTimeline(data);
    const s = suggestPhraseFill(data, t, emptySync(), BPM, PERFECT_LRC);
    expect(s.fills).toEqual([]);
    expect(s.unplaced).toBe(6);
  });
});

describe("applyPhraseFill", () => {
  it("fills empty bars and is a same-reference no-op otherwise", () => {
    const data = demoSong();
    for (const def of Object.values(data.sections)) {
      def.lines = def.lines.map((l) => ({ ...l, lyrics: [] }));
    }
    const fills = [
      { sectionId: "verse", li: 0, bar: 0, text: "hold me close" },
      { sectionId: "missing", li: 0, bar: 0, text: "nope" },
    ];
    const next = applyPhraseFill(data, fills);
    expect(next).not.toBe(data);
    expect(next.sections.verse.lines[0].lyrics).toEqual([
      { text: "hold me close", bar: 0 },
    ]);
    // Re-applying: the bar is occupied now, so nothing changes.
    expect(applyPhraseFill(next, fills)).toBe(next);
  });
});

describe("applyPlacementShifts", () => {
  it("is a same-reference no-op when the recording agrees", () => {
    const data = demoSong();
    const t = buildTimeline(data);
    expect(applyPlacementShifts(data, t, emptySync(), BPM, PERFECT_LRC)).toBe(
      data
    );
  });

  it("moves a late-sung line's words to their sung bar", () => {
    // 4-bar verse, one row: words placed in bars 0 and 1, but the second
    // line is sung a bar later (bar 2).
    const data: SongData = {
      sections: {
        verse: {
          label: "Verse",
          color: "blue",
          lines: [
            line(
              ["C", "G", "Am", "F"],
              ["hold me close", "never let go", null, null]
            ),
          ],
        },
      },
      arrangement: [{ ref: "verse", instanceLabel: "Verse 1" }],
    };
    const t = buildTimeline(data);
    const lrc: LrcLine[] = [
      { ms: 0, text: "hold me close" },
      { ms: 4000, text: "never let go" },
    ];
    const next = applyPlacementShifts(data, t, emptySync(), BPM, lrc);
    expect(next).not.toBe(data);
    expect(next.sections.verse.lines[0].lyrics).toEqual([
      { text: "hold me close", bar: 0 },
      { text: "never let go", bar: 2 },
    ]);
  });

  it("moves words across rows and carries highlights along", () => {
    const data: SongData = {
      sections: {
        verse: {
          label: "Verse",
          color: "blue",
          lines: [
            {
              bars: [bar("C"), bar("G")],
              lyrics: [
                { text: "hold me close", bar: 0 },
                // "never" carries a syllable highlight that must travel.
                {
                  text: "never let go",
                  bar: 1,
                  marks: [{ word: 0, char: 0, end: 2 }],
                },
              ],
            },
            { bars: [bar("Am"), bar("F")], lyrics: [] },
          ],
        },
      },
      arrangement: [{ ref: "verse", instanceLabel: "Verse 1" }],
    };
    const t = buildTimeline(data);
    const lrc: LrcLine[] = [
      { ms: 0, text: "hold me close" },
      { ms: 4000, text: "never let go" }, // bar 2 = second row's first bar
    ];
    const next = applyPlacementShifts(data, t, emptySync(), BPM, lrc);
    expect(next.sections.verse.lines[0].lyrics).toEqual([
      { text: "hold me close", bar: 0 },
    ]);
    expect(next.sections.verse.lines[1].lyrics).toEqual([
      { text: "never let go", bar: 0, marks: [{ word: 0, char: 0, end: 2 }] },
    ]);
  });

  it("keeps the stream in order when only one line shifts", () => {
    // Lines in bars 0 and 1; the first is sung in bar 1 too. The shifted
    // words may not leapfrog the stationary ones — both end up in bar 1.
    const data: SongData = {
      sections: {
        verse: {
          label: "Verse",
          color: "blue",
          lines: [
            line(["C", "G", "Am"], ["hold me close", "never let go", null]),
          ],
        },
      },
      arrangement: [{ ref: "verse", instanceLabel: "Verse 1" }],
    };
    const t = buildTimeline(data);
    const lrc: LrcLine[] = [
      { ms: 2000, text: "hold me close" },
      { ms: 2400, text: "never let go" },
    ];
    const next = applyPlacementShifts(data, t, emptySync(), BPM, lrc);
    expect(next.sections.verse.lines[0].lyrics).toEqual([
      { text: "hold me close never let go", bar: 1 },
    ]);
  });
});

describe("placementMismatches", () => {
  it("flags lines whose sung bar disagrees with their placement", () => {
    const data = demoSong();
    const t = buildTimeline(data);
    const lrc: LrcLine[] = [
      { ms: 0, text: "hold me close" },
      { ms: 4000, text: "never let go" }, // sung a bar later than placed
    ];
    const matches = alignLyrics(songWordStream(data, t), lrc);
    const flags = placementMismatches(matches, t, emptySync(), BPM);
    expect(flags).toEqual([
      {
        lineIdx: 1,
        text: "never let go",
        ms: 4000,
        currentBarNumber: 2,
        suggestedBarNumber: 3,
      },
    ]);
  });
});
