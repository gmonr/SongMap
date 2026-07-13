"use client";

import type { Line, SectionDef } from "@/lib/song/types";
import { BarChip, lyricFor } from "./BarChip";
import type { ReshapeSelection } from "./ReshapeView";

/**
 * Chords mode: tap a chord (or an empty "—" bar) to pick it up; the docked
 * SelectionBar carries the actions — ◀ ▶ walk it one bar at a time (across
 * row boundaries too, since rows just partition the section's bar sequence),
 * ＋ inserts a copy beside it, 🗑 deletes it, and the beat-dot strip moves
 * the beat split inside its bar. Selection follows the chord so repeated
 * taps keep walking. Selection state lives in ReshapeView so nothing here
 * reflows when a chord is picked up.
 */
export function ChordsSection({
  def,
  sectionId,
  sel,
  onSelect,
}: {
  def: SectionDef;
  sectionId: string;
  sel: ReshapeSelection | null;
  onSelect: (sel: ReshapeSelection | null) => void;
}) {
  return (
    <div className="space-y-1">
      {def.lines.map((line: Line, li) => (
        <div key={li} className="flex flex-wrap items-start gap-y-1">
          {line.bars.map((bar, bi) => {
            const selectedHere =
              sel?.kind === "chord" &&
              sel.sectionId === sectionId &&
              sel.li === li &&
              sel.bi === bi;
            return (
              <div key={bi} className="flex items-start px-0.5">
                <BarChip
                  bar={bar}
                  lyric={lyricFor(line, bi)}
                  selectedChord={selectedHere ? sel.ci : null}
                  onChordTap={(ci) =>
                    onSelect(
                      selectedHere && sel.ci === ci
                        ? null
                        : { kind: "chord", sectionId, li, bi, ci }
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
