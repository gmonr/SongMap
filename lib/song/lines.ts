/**
 * Structural row (Line) edits for the editor: move a bar to another row,
 * merge a row into the next, split a row in two.
 *
 * The subtlety these all share is that `LyricSpan.bar` is a *positional index*
 * into its line's `bars` array (see lib/song/types.ts) — a lyric is glued to a
 * bar only by position, with no stable id. So any op that adds, removes, or
 * moves a bar has to re-map lyric indices in both the source and destination
 * line, or lyrics silently reattach to whatever bar lands on the old index.
 *
 * To keep that from being error-prone, every function here converts the line
 * to a *dense* `{ bar, lyric }[]` (each bar paired with its lyric text),
 * manipulates that, and converts back — so the index bookkeeping lives in one
 * place (`toDense`/`fromDense`) instead of being re-derived per operation.
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

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Move the bar at (`li`, `bi`) to index `targetBi` in line `targetLi`, carrying
 * its lyric. `targetBi` is the destination index at the moment of insertion
 * (i.e. after the bar has been removed from its source line) and is clamped to
 * the valid range. Returns `lines` unchanged if the source bar doesn't exist.
 */
export function moveBar(
  lines: Line[],
  li: number,
  bi: number,
  targetLi: number,
  targetBi: number
): Line[] {
  if (!lines[li] || !lines[targetLi]) return lines;

  if (li === targetLi) {
    const cells = toDense(lines[li]);
    if (bi < 0 || bi >= cells.length) return lines;
    const [moved] = cells.splice(bi, 1);
    cells.splice(clamp(targetBi, 0, cells.length), 0, moved);
    return lines.map((l, i) => (i === li ? fromDense(cells) : l));
  }

  const src = toDense(lines[li]);
  if (bi < 0 || bi >= src.length) return lines;
  const [moved] = src.splice(bi, 1);
  const dst = toDense(lines[targetLi]);
  dst.splice(clamp(targetBi, 0, dst.length), 0, moved);
  return lines.map((l, i) =>
    i === li ? fromDense(src) : i === targetLi ? fromDense(dst) : l
  );
}

/** Move the bar at (`li`, `bi`) to the end of the previous row. */
export function moveBarToPrevLine(lines: Line[], li: number, bi: number): Line[] {
  if (li <= 0 || !lines[li - 1]) return lines;
  return moveBar(lines, li, bi, li - 1, lines[li - 1].bars.length);
}

/** Move the bar at (`li`, `bi`) to the start of the next row. */
export function moveBarToNextLine(lines: Line[], li: number, bi: number): Line[] {
  if (li >= lines.length - 1) return lines;
  return moveBar(lines, li, bi, li + 1, 0);
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
