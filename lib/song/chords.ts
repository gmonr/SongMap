/**
 * Chord redistribution across bar boundaries, for the reshape view's Chords
 * mode. Imports sometimes leave a split bar holding a chord that belongs in
 * the neighboring bar; these ops walk a chord one bar at a time — including
 * across a row boundary, since a section's rows are just a partition of one
 * bar sequence.
 *
 * Both ops return the same reference on no-op so callers can detect
 * "nothing changed" cheaply. There is deliberately no separate "pull" op:
 * pulling a neighbor's chord into a bar is selecting that chord and moving
 * it toward the bar.
 */
import type { ChordCell, Line } from "./types";

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

  const srcChords = out[li].bars[bi].chords.filter((_, j) => j !== ci);
  out[li].bars[bi] = {
    chords:
      srcChords.length === 0
        ? [{ sym: "", beats: totalBeats }]
        : rebalance(srcChords),
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
