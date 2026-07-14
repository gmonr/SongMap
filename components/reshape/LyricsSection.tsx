"use client";

import {
  lineWordLayout,
  setWordBoundary,
  type WordLayout,
} from "@/lib/song/lyrics";
import type { Line, SectionDef } from "@/lib/song/types";
import type { ReshapeSelection } from "./ReshapeView";

/**
 * Which boundary a tap at global word position `gap` (inside bar `bi`'s word
 * group) should move there: the nearer of the bar's two edges that would
 * actually change (tie → left). Null means the tap would be a pure no-op, so
 * no button is rendered at that position.
 */
function boundaryFor(
  layout: WordLayout,
  bi: number,
  gap: number
): number | null {
  const candidates: number[] = [];
  if (bi > 0) candidates.push(bi);
  if (bi < layout.bars.length - 1) candidates.push(bi + 1);
  const moved = candidates.filter((b) => layout.bars[b].start !== gap);
  if (moved.length === 0) return null;
  moved.sort(
    (a, b) =>
      Math.abs(layout.bars[a].start - gap) -
        Math.abs(layout.bars[b].start - gap) || a - b
  );
  return moved[0];
}

/**
 * Lyrics mode: redistribute a row's words across its bars without retyping.
 * Each bar shows its chord(s) above its words; tapping the slim gap between
 * two words moves the nearest bar break there. Tapping a bar's chord header
 * selects its whole phrase; the docked SelectionBar's ◀ ▶ shift it a bar at
 * a time (occupied neighbors ripple into the row's first empty bar). Word
 * moves are row-local: to move words between rows, merge the rows in Rows
 * mode first.
 */
export function LyricsSection({
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
  const applyToLine = (li: number, fn: (line: Line) => Line) =>
    apply((lines) => {
      const next = fn(lines[li]);
      return next === lines[li]
        ? lines
        : lines.map((l, i) => (i === li ? next : l));
    });

  return (
    <div className="space-y-2">
      {def.lines.map((line, li) => {
        const layout = lineWordLayout(line);

        // Slim 1px seam with a ~24px invisible hit box: the button is wider
        // than the layout space it takes (negative margins), floating above
        // the inert word chips beside it so mis-taps still land on it.
        const gapButton = (bi: number, gapInBar: number) => {
          const gap = layout.bars[bi].start + gapInBar;
          const boundary = boundaryFor(layout, bi, gap);
          if (boundary === null) return null;
          return (
            <button
              type="button"
              onClick={() =>
                applyToLine(li, (l) => setWordBoundary(l, boundary, gap))
              }
              title="Move bar break here"
              aria-label="Move bar break here"
              className="group relative z-10 -mx-1.5 flex w-6 shrink-0 items-center justify-center self-stretch"
            >
              <span className="h-4 w-px bg-slate-200 transition-all group-hover:w-1 group-hover:bg-blue-400" />
            </button>
          );
        };

        return (
          <div key={li} className="flex flex-wrap items-stretch gap-y-2">
            {layout.bars.map((b, bi) => {
              const chordLabel =
                line.bars[bi].chords
                  .map((c) => c.sym)
                  .filter(Boolean)
                  .join(" ") || "—";
              const selected =
                sel?.kind === "phrase" &&
                sel.sectionId === sectionId &&
                sel.li === li &&
                sel.bar === bi;
              const hasLyric = b.words.length > 0;
              return (
                <div key={bi} className="flex max-w-full items-stretch">
                  {bi > 0 && (
                    <span
                      className="mx-0.5 w-0.5 shrink-0 self-stretch rounded bg-slate-300"
                      aria-hidden
                    />
                  )}
                  <div
                    className={`flex min-w-0 flex-col gap-0.5 rounded-md px-1 py-0.5 ${
                      selected ? "bg-blue-50 ring-1 ring-blue-300" : ""
                    }`}
                  >
                    <button
                      type="button"
                      disabled={!hasLyric}
                      onClick={() =>
                        onSelect(
                          selected
                            ? null
                            : { kind: "phrase", sectionId, li, bar: bi }
                        )
                      }
                      title={hasLyric ? "Select phrase to shift it" : undefined}
                      className={`min-h-5 self-start text-[10px] font-bold ${
                        hasLyric
                          ? "text-slate-400 hover:text-blue-600"
                          : "cursor-default text-slate-300"
                      }`}
                    >
                      {chordLabel}
                    </button>
                    {/* flex-wrap: a long phrase folds to more rows instead of
                        clipping under the section card's overflow-hidden. */}
                    <div className="flex min-h-6 max-w-full flex-wrap items-center gap-y-1">
                      {hasLyric ? (
                        <>
                          {gapButton(bi, 0)}
                          {b.words.map((w, wi) => (
                            <span key={wi} className="flex items-stretch">
                              <span className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs">
                                {w}
                              </span>
                              {gapButton(bi, wi + 1)}
                            </span>
                          ))}
                        </>
                      ) : (
                        <span className="px-2 text-xs text-slate-300">·</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
