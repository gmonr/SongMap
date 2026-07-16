/**
 * The SongMap data model.
 *
 * The atomic unit is the BAR, not the chord-over-character position used by
 * ChordPro/Ultimate Guitar. Every chord carries a beat count within its bar,
 * so "two bars of C" and "C for 2 beats then G for 2 beats in one bar" are
 * both representable. Roman/Nashville numbers are derived at render time from
 * `key` + chord symbol, never stored.
 */

/** One chord within a bar, e.g. { sym: "Am7", beats: 4 }. */
export interface ChordCell {
  /** Chord symbol as text: "C", "Am7", "F/C", "Bb", "N.C." */
  sym: string;
  /** How many beats of the bar this chord occupies. */
  beats: number;
}

/** One bar (measure). Usually holds a single chord filling every beat. */
export interface Bar {
  chords: ChordCell[];
}

/**
 * Highlight one word (or the syllable starting mid-word) of a lyric
 * phrase, so the singer can mentally tie it to the bar's chords/beats.
 * Purely visual — no beat is stored, and playback ignores marks. Within a
 * span, marks are sorted by (word, char) and unique.
 */
export interface WordMark {
  /** Index into the phrase's words (whitespace-split, see lyricWords). */
  word: number;
  /**
   * Character offset within the word where the highlight starts
   * (0/absent = the whole word). Lets a highlight land mid-word:
   * "so·ñado" marked at char 2 highlights "ñado".
   */
  char?: number;
}

/** A lyric phrase aligned to a bar (by index within its line). */
export interface LyricSpan {
  text: string;
  /** Index into the line's `bars` array. */
  bar: number;
  /** Highlighted words/syllables; absent = plain text. */
  marks?: WordMark[];
}

/** One row of bars in the grid, with lyrics aligned underneath. */
export interface Line {
  bars: Bar[];
  lyrics: LyricSpan[];
}

/** A reusable section definition (Verse, Chorus, Bridge...). */
export interface SectionDef {
  label: string;
  /** Named accent color; see lib/song/colors.ts for the palette. */
  color: string;
  lines: Line[];
}

/** One entry in the song's arrangement: a section instance. */
export interface ArrangementItem {
  /** Key into `sections`. */
  ref: string;
  /** Display label for this instance, e.g. "Verse 2". */
  instanceLabel: string;
  /** Play this section N times in a row ("×2"). */
  repeat?: number;
  /**
   * Section id whose chords this instance shares. Rendered collapsed as
   * "chords same as <first instance of that section>".
   */
  sameChordsAs?: string;
}

/** The jsonb `data` blob stored per song. */
export interface SongData {
  sections: Record<string, SectionDef>;
  arrangement: ArrangementItem[];
}

/** A row of the `songs` table (flat columns + the data blob). */
export interface SongRow {
  id: string;
  title: string;
  artist: string | null;
  key: string | null;
  time_signature: string | null;
  tempo: number | null;
  capo: number | null;
  data: SongData;
  source_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export function emptySongData(): SongData {
  const verseId = "verse-1";
  return {
    sections: {
      [verseId]: {
        label: "Verse",
        color: "blue",
        lines: [
          {
            bars: [
              { chords: [{ sym: "", beats: 4 }] },
              { chords: [{ sym: "", beats: 4 }] },
              { chords: [{ sym: "", beats: 4 }] },
              { chords: [{ sym: "", beats: 4 }] },
            ],
            lyrics: [],
          },
        ],
      },
    },
    arrangement: [{ ref: verseId, instanceLabel: "Verse 1" }],
  };
}

/** Beats per bar from a "4/4"-style time signature (defaults to 4). */
export function beatsPerBar(timeSignature: string | null | undefined): number {
  const n = parseInt((timeSignature ?? "4/4").split("/")[0] ?? "4", 10);
  return Number.isFinite(n) && n > 0 && n <= 16 ? n : 4;
}
