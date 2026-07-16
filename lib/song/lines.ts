/**
 * Structural row (Line) edits for the reshape view: merge a row into the next,
 * break a row in two at a bar boundary, or add/remove a bar within a row.
 * Merge + break together cover any row layout, since a section's bars are a
 * fixed sequence and "rows" are just where that sequence is partitioned;
 * insert/delete change the sequence itself.
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
import type { Line, LyricSpan, WordAnchor } from "./types";

export interface DenseCell {
  bar: Line["bars"][number];
  /** The lyric under this bar, "" when none. */
  lyric: string;
  /** The lyric's word→beat anchors, riding along with the text. Ops that
   *  rewrite `lyric` must update (or drop) these themselves — fromDense
   *  reattaches whatever is here. */
  anchors?: WordAnchor[];
}

/** Pair every bar with its lyric text (sparse spans -> one entry per bar). */
export function toDense(line: Line): DenseCell[] {
  const byBar = new Map<number, LyricSpan>();
  for (const s of line.lyrics) byBar.set(s.bar, s);
  return line.bars.map((bar, i) => {
    const span = byBar.get(i);
    return { bar, lyric: span?.text ?? "", anchors: span?.anchors };
  });
}

/** Rebuild a Line from dense cells, re-deriving the sparse lyric spans. */
export function fromDense(cells: DenseCell[]): Line {
  const lyrics = cells
    .map((c, i) => {
      const span: LyricSpan = { text: c.lyric, bar: i };
      if (c.anchors && c.anchors.length > 0) span.anchors = c.anchors;
      return span;
    })
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

/**
 * Insert a new empty placeholder bar (one "" chord spanning `totalBeats` —
 * the editor's empty-bar shape, rendered "—") at index `bi` of line `li`.
 * `bi` may be 0..bars.length, so "before the first bar" and "after the last"
 * both work. Lyric indices re-map via toDense/fromDense. Same-reference
 * no-op on bad coords.
 */
export function insertBar(
  lines: Line[],
  li: number,
  bi: number,
  totalBeats: number
): Line[] {
  const line = lines[li];
  if (!line || bi < 0 || bi > line.bars.length) return lines;
  const cells = toDense(line);
  cells.splice(bi, 0, {
    bar: { chords: [{ sym: "", beats: totalBeats }] },
    lyric: "",
  });
  const out = [...lines];
  out.splice(li, 1, fromDense(cells));
  return out;
}

/**
 * Delete bar `bi` of line `li`. Its lyric merges into the previous bar's
 * (appended after a space); deleting the row's first bar pushes the lyric
 * onto the following bar instead, so words never vanish while the row still
 * has bars. Deleting a row's only bar removes the whole row (and whatever
 * lyric it carried — the chip shows it, and undo restores it). Same-reference
 * no-op on bad coords.
 */
export function deleteBar(lines: Line[], li: number, bi: number): Line[] {
  const line = lines[li];
  if (!line || bi < 0 || bi >= line.bars.length) return lines;
  const out = [...lines];
  if (line.bars.length === 1) {
    out.splice(li, 1);
    return out;
  }
  const cells = toDense(line);
  const [removed] = cells.splice(bi, 1);
  if (removed.lyric !== "") {
    const heir = Math.max(0, bi - 1);
    const joined =
      heir < bi
        ? [cells[heir].lyric, removed.lyric]
        : [removed.lyric, cells[heir].lyric];
    // Two phrases just became one: the word indexes its anchors pointed at
    // no longer mean the same thing, so the merged span starts unanchored
    // (undo restores them).
    cells[heir] = {
      ...cells[heir],
      lyric: joined.filter((t) => t !== "").join(" "),
      anchors: undefined,
    };
  }
  out.splice(li, 1, fromDense(cells));
  return out;
}
