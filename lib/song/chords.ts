/**
 * Pure chord ops for the reshape view's Chords mode: walk a chord one bar at
 * a time (including across a row boundary, since a section's rows are just a
 * partition of one bar sequence), insert or delete a chord, and move the
 * beat boundary between two chords of a split bar.
 *
 * Every op returns the same reference on no-op so callers can detect
 * "nothing changed" cheaply. There is deliberately no separate "pull" op:
 * pulling a neighbor's chord into a bar is selecting that chord and moving
 * it toward the bar.
 */
import type { Bar, ChordCell, Line } from "./types";

export interface ChordCoord {
  li: number;
  bi: number;
  ci: number;
}

/**
 * Distribute `total` beats evenly over `n` chords: floor split, last chord
 * takes the remainder, every chord at least 1. Mirrors the import parser's
 * fallback in lib/song/import.ts (parsePipeLine).
 */
export function evenBeats(n: number, total: number): number[] {
  const per = Math.max(1, Math.floor(total / n));
  const out: number[] = [];
  let left = total;
  for (let i = 0; i < n; i++) {
    out.push(i === n - 1 ? Math.max(1, left) : per);
    left -= per;
  }
  return out;
}

/**
 * Where chord `ci` of bar `bi` in line `li` lands if moved one bar in `dir`,
 * or null when the move is impossible: placeholder chord (sym ""), no
 * neighbor bar in that direction, or the destination already holds
 * `totalBeats` chords (the same cap the editor's split uses). The returned
 * coordinates are the chord's position *after* the move, so the UI can keep
 * it selected while walking it across bars.
 */
export function chordMoveTarget(
  lines: Line[],
  li: number,
  bi: number,
  ci: number,
  dir: -1 | 1,
  totalBeats: number
): ChordCoord | null {
  const chord = lines[li]?.bars[bi]?.chords[ci];
  if (!chord || chord.sym === "") return null;
  let nli = li;
  let nbi = bi + dir;
  if (nbi < 0) {
    nli = li - 1;
    if (nli < 0) return null;
    nbi = lines[nli].bars.length - 1;
  } else if (nbi >= lines[li].bars.length) {
    nli = li + 1;
    if (nli >= lines.length) return null;
    nbi = 0;
  }
  const dest = lines[nli]?.bars[nbi];
  if (!dest) return null;
  const placeholder = dest.chords.length === 1 && dest.chords[0].sym === "";
  if (!placeholder && dest.chords.length >= totalBeats) return null;
  // Moving right the chord is temporally earliest in its new bar (prepend);
  // moving left it is latest (append). A lone placeholder is replaced.
  const nci = placeholder || dir === 1 ? 0 : dest.chords.length;
  return { li: nli, bi: nbi, ci: nci };
}

/**
 * Move chord `ci` of bar `bi` in line `li` one bar in `dir`. Both touched
 * bars get their beats re-split evenly (evenBeats); a source bar left with
 * no chords becomes the editor's empty-bar shape (one "" chord spanning the
 * bar). Lyric spans are untouched — bars keep their positions, only their
 * `chords` arrays change. Same-reference no-op when chordMoveTarget is null.
 */
export function moveChord(
  lines: Line[],
  li: number,
  bi: number,
  ci: number,
  dir: -1 | 1,
  totalBeats: number
): Line[] {
  const target = chordMoveTarget(lines, li, bi, ci, dir, totalBeats);
  if (!target) return lines;

  const rebalance = (chords: ChordCell[]): ChordCell[] => {
    const beats = evenBeats(chords.length, totalBeats);
    return chords.map((c, i) => ({ ...c, beats: beats[i] }));
  };

  const moved = { ...lines[li].bars[bi].chords[ci] };
  const out = lines.map((l) => ({ ...l, bars: [...l.bars] }));

  // The source bar hands the moved chord's beats to its left neighbor (or
  // the new first chord when the moved chord led the bar) instead of an even
  // re-split, so hand-tuned beat splits survive the move.
  const srcChords = out[li].bars[bi].chords.filter((_, j) => j !== ci);
  const heir = Math.max(0, ci - 1);
  out[li].bars[bi] = {
    chords:
      srcChords.length === 0
        ? [{ sym: "", beats: totalBeats }]
        : srcChords.map((c, j) =>
            j === heir ? { ...c, beats: c.beats + moved.beats } : { ...c }
          ),
  };

  const dest = out[target.li].bars[target.bi];
  const placeholder = dest.chords.length === 1 && dest.chords[0].sym === "";
  const destChords = placeholder
    ? [moved]
    : dir === 1
      ? [moved, ...dest.chords]
      : [...dest.chords, moved];
  out[target.li].bars[target.bi] = { chords: rebalance(destChords) };
  return out;
}

/** `lines` with bar `bi` of line `li` replaced, everything else shared. */
function withBar(lines: Line[], li: number, bi: number, bar: Bar): Line[] {
  return lines.map((l, i) =>
    i === li ? { ...l, bars: l.bars.map((b, j) => (j === bi ? bar : b)) } : l
  );
}

/**
 * Insert a new chord with symbol `sym` at position `pos` (0..chords.length)
 * of bar `bi` in line `li`. A lone "" placeholder is replaced outright (the
 * new chord takes its full span); otherwise the bar's beats re-split evenly
 * over the grown chord list, capped at `totalBeats` chords (the same cap the
 * editor's split and moveChord use). Same-reference no-op on bad coords, an
 * empty `sym`, an out-of-range `pos`, or a full bar.
 */
export function insertChord(
  lines: Line[],
  li: number,
  bi: number,
  pos: number,
  sym: string,
  totalBeats: number
): Line[] {
  const bar = lines[li]?.bars[bi];
  if (!bar || sym === "") return lines;
  if (bar.chords.length === 1 && bar.chords[0].sym === "") {
    return withBar(lines, li, bi, {
      chords: [{ sym, beats: bar.chords[0].beats }],
    });
  }
  if (bar.chords.length >= totalBeats) return lines;
  if (pos < 0 || pos > bar.chords.length) return lines;
  const grown = [
    ...bar.chords.slice(0, pos),
    { sym, beats: 1 },
    ...bar.chords.slice(pos),
  ];
  const beats = evenBeats(grown.length, totalBeats);
  return withBar(lines, li, bi, {
    chords: grown.map((c, i) => ({ ...c, beats: beats[i] })),
  });
}

/**
 * Delete chord `ci` of bar `bi` in line `li`. Its beats go to the left
 * neighbor (or the new first chord when it led the bar) — the mirror of the
 * editor's removeChord — so the rest of the bar's split survives. Deleting a
 * bar's only chord leaves the editor's empty-bar shape (one "" chord keeping
 * the bar's span). Same-reference no-op on bad coords or a "" placeholder.
 */
export function deleteChord(
  lines: Line[],
  li: number,
  bi: number,
  ci: number
): Line[] {
  const bar = lines[li]?.bars[bi];
  const chord = bar?.chords[ci];
  if (!bar || !chord || chord.sym === "") return lines;
  if (bar.chords.length === 1) {
    return withBar(lines, li, bi, {
      chords: [{ sym: "", beats: chord.beats }],
    });
  }
  const rest = bar.chords.filter((_, j) => j !== ci);
  const heir = Math.max(0, ci - 1);
  return withBar(lines, li, bi, {
    chords: rest.map((c, j) =>
      j === heir ? { ...c, beats: c.beats + chord.beats } : { ...c }
    ),
  });
}

/**
 * Move the beat boundary between chord `ci` and `ci + 1` of `bar` so that
 * chord `ci` holds `beats` of the pair's combined span (each side keeps
 * ≥ 1 beat; the pair's total is preserved). Same-reference no-op when the
 * pair doesn't exist, `beats` is out of range or fractional, or the
 * boundary is already there.
 */
export function setBeatBoundary(bar: Bar, ci: number, beats: number): Bar {
  const a = bar.chords[ci];
  const b = bar.chords[ci + 1];
  if (!a || !b) return bar;
  const pair = a.beats + b.beats;
  if (!Number.isInteger(beats) || beats < 1 || beats > pair - 1) return bar;
  if (beats === a.beats) return bar;
  return {
    chords: bar.chords.map((c, j) =>
      j === ci
        ? { ...c, beats }
        : j === ci + 1
          ? { ...c, beats: pair - beats }
          : c
    ),
  };
}

/**
 * The symbol an empty "—" bar at (li, bi) stands for: the nearest real chord
 * before it in reading order (last chord of the closest earlier bar that has
 * one), falling forward to the next real chord when nothing precedes it.
 * Null when the lines hold no chords at all. Used by select-and-add to seed
 * the chord it materializes in an empty bar.
 */
export function nearestChordSym(
  lines: Line[],
  li: number,
  bi: number
): string | null {
  const flat: string[][] = [];
  let at = -1;
  lines.forEach((l, i) =>
    l.bars.forEach((b, j) => {
      if (i === li && j === bi) at = flat.length;
      flat.push(b.chords.map((c) => c.sym).filter(Boolean));
    })
  );
  if (at === -1) return null;
  for (let k = at - 1; k >= 0; k--) {
    if (flat[k].length) return flat[k][flat[k].length - 1];
  }
  for (let k = at + 1; k < flat.length; k++) {
    if (flat[k].length) return flat[k][0];
  }
  return null;
}
