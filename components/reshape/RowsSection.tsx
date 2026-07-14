import { mergeLineWithNext, splitLine } from "@/lib/song/lines";
import type { Line, SectionDef } from "@/lib/song/types";
import { BarChip, lyricFor } from "./BarChip";
import type { ReshapeSelection } from "./ReshapeView";

/**
 * Rows mode: merge or break a section's rows, and add or remove bars. Tapping
 * the seam between two bars breaks the row there; tapping the "merge" seam
 * between two rows joins them. Tapping a bar chip picks up the *bar* — the
 * docked SelectionBar then adds an empty bar beside it or deletes it. All
 * plain taps, so the interaction is identical on mobile and desktop.
 */
export function RowsSection({
  def,
  sectionId,
  apply,
  sel,
  onSelect,
}: {
  def: SectionDef;
  sectionId: string;
  apply: (fn: (lines: Line[]) => Line[]) => void;
  sel: ReshapeSelection | null;
  onSelect: (sel: ReshapeSelection | null) => void;
}) {
  return (
    <div className="space-y-1">
      {def.lines.map((line, li) => (
        <div key={li}>
          <div className="flex flex-wrap items-start">
            {line.bars.map((bar, bi) => {
              const selectedHere =
                sel?.kind === "bar" &&
                sel.sectionId === sectionId &&
                sel.li === li &&
                sel.bi === bi;
              return (
                <div key={bi} className="flex items-stretch">
                  <BarChip
                    bar={bar}
                    lyric={lyricFor(line, bi)}
                    selected={selectedHere}
                    onTap={() =>
                      onSelect(
                        selectedHere ? null : { kind: "bar", sectionId, li, bi }
                      )
                    }
                  />
                  {bi < line.bars.length - 1 && (
                    // Slim seam, ~32px invisible hit box (wider than its
                    // layout slot via negative margins, floating above the
                    // bar chips).
                    <button
                      type="button"
                      onClick={() =>
                        apply((lines) => splitLine(lines, li, bi + 1))
                      }
                      title="Break row here"
                      aria-label={`Break row after bar ${bi + 1}`}
                      className="group relative z-10 -mx-1.5 flex w-8 shrink-0 items-center justify-center self-stretch"
                    >
                      <span className="h-10 w-px bg-slate-200 transition-all group-hover:w-1 group-hover:bg-blue-400" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {li < def.lines.length - 1 && (
            <div className="flex items-center gap-2 py-1">
              <span className="h-px flex-1 bg-slate-200" />
              <button
                type="button"
                onClick={() => apply((lines) => mergeLineWithNext(lines, li))}
                title="Merge these two rows"
                aria-label={`Merge row ${li + 1} with row ${li + 2}`}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-400 hover:border-blue-400 hover:text-blue-600"
              >
                merge ⤢
              </button>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
