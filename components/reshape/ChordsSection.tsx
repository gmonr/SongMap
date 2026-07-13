"use client";

import { useState } from "react";
import { chordMoveTarget, moveChord, type ChordCoord } from "@/lib/song/chords";
import type { Line, SectionDef } from "@/lib/song/types";
import { BarChip, lyricFor } from "./BarChip";

/**
 * Chords mode: fix split bars whose chord belongs in a neighboring bar. Tap
 * a chord to pick it up, then ◀ ▶ to walk it one bar at a time — across row
 * boundaries too, since rows just partition the section's bar sequence. An
 * empty bar absorbs the chord; an occupied bar becomes a split bar; beats
 * re-split evenly. Selection follows the chord so repeated taps keep walking.
 */
export function ChordsSection({
  def,
  apply,
  beats,
}: {
  def: SectionDef;
  apply: (fn: (lines: Line[]) => Line[]) => void;
  beats: number;
}) {
  const [sel, setSel] = useState<ChordCoord | null>(null);

  const arrow = (dir: -1 | 1) => {
    if (!sel) return null;
    const target = chordMoveTarget(def.lines, sel.li, sel.bi, sel.ci, dir, beats);
    return (
      <button
        type="button"
        disabled={!target}
        onClick={() => {
          if (!target) return;
          apply((lines) => moveChord(lines, sel.li, sel.bi, sel.ci, dir, beats));
          setSel(target);
        }}
        title={dir === 1 ? "Move chord into next bar" : "Move chord into previous bar"}
        aria-label={
          dir === 1 ? "Move chord into next bar" : "Move chord into previous bar"
        }
        className="flex h-10 w-7 shrink-0 items-center justify-center rounded-md text-sm font-bold text-blue-600 hover:bg-blue-100 disabled:cursor-default disabled:text-slate-300"
      >
        {dir === 1 ? "▶" : "◀"}
      </button>
    );
  };

  return (
    <div className="space-y-1">
      {def.lines.map((line, li) => (
        <div key={li} className="flex flex-wrap items-start gap-y-1">
          {line.bars.map((bar, bi) => {
            const selectedHere = sel !== null && sel.li === li && sel.bi === bi;
            return (
              <div key={bi} className="flex items-start px-0.5">
                {selectedHere && arrow(-1)}
                <BarChip
                  bar={bar}
                  lyric={lyricFor(line, bi)}
                  selectedChord={selectedHere ? sel.ci : null}
                  onChordTap={(ci) =>
                    setSel(
                      selectedHere && sel.ci === ci ? null : { li, bi, ci }
                    )
                  }
                />
                {selectedHere && arrow(1)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
