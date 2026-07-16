import type { Bar, Line, WordAnchor } from "../types";

/** Bar with the given chord syms, beats split naively (tests fix as needed). */
export function bar(...syms: string[]): Bar {
  if (syms.length === 0) return { chords: [{ sym: "", beats: 4 }] };
  return { chords: syms.map((sym) => ({ sym, beats: 4 / syms.length })) };
}

/** Line from bars plus a sparse lyric map { barIndex: text }; a value may
 *  also carry word→beat anchors. */
export function line(
  bars: Bar[],
  lyrics: Record<number, string | { text: string; anchors: WordAnchor[] }> = {}
): Line {
  return {
    bars,
    lyrics: Object.entries(lyrics).map(([bi, v]) =>
      typeof v === "string"
        ? { bar: Number(bi), text: v }
        : { bar: Number(bi), text: v.text, anchors: v.anchors }
    ),
  };
}

/** The line's lyrics as a dense array of strings, "" for lyric-less bars. */
export function lyricsOf(l: Line): string[] {
  return l.bars.map((_, i) => l.lyrics.find((s) => s.bar === i)?.text ?? "");
}
