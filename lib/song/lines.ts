/**
 * Structural row (Line) edits for the reshape view: merge a row into the next,
 * or break a row in two at a bar boundary. Together these cover any row layout,
 * since a section's bars are a fixed sequence and "rows" are just where that
 * sequence is partitioned.
 *
 * The subtlety is that `LyricSpan.bar` is a *positional index* into its line's
 * `bars` array (see lib/song/types.ts) — a lyric is glued to a bar only by
 * position, with no stable id. So any op that changes how bars are grouped has
 * to re-map lyric indices, or lyrics silently reattach to whatever bar lands on
 * the old index. To keep that from being error-prone, each function converts a
 * line to a *dense* `{ bar, lyric }[]` (each bar paired with its lyric text),
 * manipulates that, and converts back — so the index bookkeeping lives in one
 * place (`toDense`/`fromDense`).
 */
import type { Line } from "./types";

interface DenseCell {
  bar: Line["bars"][number];
  /** The lyric under this bar, "" when none. */
  lyric: string;
}

/** Pair every bar with its lyric text (sparse spans -> one entry per bar). */
function toDense(line: Line): DenseCell[] {
  const byBar = new Map<number, string>();
  for (const s of line.lyrics) byBar.set(s.bar, s.text);
  return line.bars.map((bar, i) => ({ bar, lyric: byBar.get(i) ?? "" }));
}

/** Rebuild a Line from dense cells, re-deriving the sparse lyric spans. */
function fromDense(cells: DenseCell[]): Line {
  const lyrics = cells
    .map((c, i) => ({ text: c.lyric, bar: i }))
    .filter((s) => s.text !== "");
  return { bars: cells.map((c) => c.bar), lyrics };
}

/**
 * Merge line `li` with the row below it: its bars (and lyrics) append onto
 * `li`, and the lower row is removed. No-op if `li` is the last row.
 */
export function mergeLineWithNext(lines: Line[], li: number): Line[] {
  if (li < 0 || li >= lines.length - 1) return lines;
  const merged = fromDense([...toDense(lines[li]), ...toDense(lines[li + 1])]);
  const out = [...lines];
  out.splice(li, 2, merged);
  return out;
}

/**
 * Split line `li` before bar index `at` into two rows: bars `[0, at)` stay,
 * bars `[at, …)` become a new row inserted directly below. No-op unless `at`
 * lands strictly inside the row (so neither side is empty).
 */
export function splitLine(lines: Line[], li: number, at: number): Line[] {
  const line = lines[li];
  if (!line || at <= 0 || at >= line.bars.length) return lines;
  const cells = toDense(line);
  const out = [...lines];
  out.splice(li, 1, fromDense(cells.slice(0, at)), fromDense(cells.slice(at)));
  return out;
}
