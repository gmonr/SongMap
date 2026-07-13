import type { Bar, Line } from "../types";

/** Bar with the given chord syms, beats split naively (tests fix as needed). */
export function bar(...syms: string[]): Bar {
  if (syms.length === 0) return { chords: [{ sym: "", beats: 4 }] };
  return { chords: syms.map((sym) => ({ sym, beats: 4 / syms.length })) };
}

/** Line from bars plus a sparse lyric map { barIndex: text }. */
export function line(bars: Bar[], lyrics: Record<number, string> = {}): Line {
  return {
    bars,
    lyrics: Object.entries(lyrics).map(([bi, text]) => ({
      bar: Number(bi),
      text,
    })),
  };
}

/** The line's lyrics as a dense array of strings, "" for lyric-less bars. */
export function lyricsOf(l: Line): string[] {
  return l.bars.map((_, i) => l.lyrics.find((s) => s.bar === i)?.text ?? "");
}
