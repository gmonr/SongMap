/**
 * Word-granularity lyric redistribution within one Line, for the reshape
 * view's Lyrics mode. Imports get the words right far more often than the
 * word→bar grouping, so these ops move words between neighboring bars without
 * ever retyping text.
 *
 * A "word" is a whitespace-delimited token; rebuilding joins with a single
 * space, so runs of internal whitespace are normalized away. Every function
 * returns the *same Line reference* when the op is a no-op, so callers can
 * cheaply detect "nothing changed" (the reshape view uses this to keep stray
 * taps from dirtying the save state).
 */
import { fromDense, toDense } from "./lines";
import type { Line } from "./types";

export interface WordLayout {
  /** Every word in the row, in order. */
  words: string[];
  /** Per bar: its words and the global index of its first word. */
  bars: { words: string[]; start: number }[];
}

/** Split a lyric phrase into words. */
export function lyricWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** How the row's words are currently distributed over its bars. */
export function lineWordLayout(line: Line): WordLayout {
  const words: string[] = [];
  const bars = toDense(line).map((cell) => {
    const w = lyricWords(cell.lyric);
    const start = words.length;
    words.push(...w);
    return { words: w, start };
  });
  return { words, bars };
}

/**
 * Move the boundary between bars `boundary - 1` and `boundary` so that
 * exactly `gap` words (counted from the start of the row) sit to its left.
 * Words transfer only between those two bars — every other bar keeps its
 * word count — so `gap` is clamped to the range the pair spans. Either bar
 * of the pair may end up with zero words (its lyric span disappears).
 */
export function setWordBoundary(
  line: Line,
  boundary: number,
  gap: number
): Line {
  if (boundary < 1 || boundary >= line.bars.length) return line;
  const layout = lineWordLayout(line);
  const left = layout.bars[boundary - 1];
  const right = layout.bars[boundary];
  const lo = left.start;
  const hi = right.start + right.words.length;
  const target = Math.min(Math.max(gap, lo), hi);
  if (target === right.start) return line;
  const pair = layout.words.slice(lo, hi);
  const cells = toDense(line);
  cells[boundary - 1] = {
    ...cells[boundary - 1],
    lyric: pair.slice(0, target - lo).join(" "),
  };
  cells[boundary] = {
    ...cells[boundary],
    lyric: pair.slice(target - lo).join(" "),
  };
  return fromDense(cells);
}

/**
 * Move the whole lyric of bar `from` one bar over in `dir`. If the target
 * bar already has a lyric, the occupied chain starting there shifts one bar
 * along in the same direction, into the first empty bar of the row. No-op
 * (same reference) when `from` has no lyric, the move would leave the row,
 * or there is no empty bar to absorb the chain.
 */
export function shiftLyric(line: Line, from: number, dir: -1 | 1): Line {
  const cells = toDense(line);
  const src = cells[from];
  if (!src || src.lyric === "") return line;
  const to = from + dir;
  if (to < 0 || to >= cells.length) return line;
  // Walk past the occupied chain to the empty cell that will absorb it.
  let end = to;
  while (end >= 0 && end < cells.length && cells[end].lyric !== "") end += dir;
  if (end < 0 || end >= cells.length) return line;
  const out = cells.map((c) => ({ ...c }));
  for (let i = end; i !== to; i -= dir) out[i].lyric = out[i - dir].lyric;
  out[to].lyric = src.lyric;
  out[from].lyric = "";
  return fromDense(out);
}
