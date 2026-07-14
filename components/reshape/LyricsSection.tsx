"use client";

import { lineWordLayout, setWordBoundary } from "@/lib/song/lyrics";
import { reshapeBarDomId } from "@/lib/song/selection";
import type { Line, SectionDef } from "@/lib/song/types";
import type { ReshapeSelection } from "./ReshapeView";

/**
 * Lyrics mode: redistribute a row's words across its bars without retyping.
 * Each bar shows its chord(s) above its words. Two selectable things:
 *
 * - The │ break between two bars: tap to pick it up, then ◀ ▶ in the docked
 *   SelectionBar move it one word at a time, or tap one of the word gaps
 *   that light up (only the two bars the break sits between) to place it
 *   there exactly. One break, one explicit target — a gap tap can never
 *   surprise by folding words the other way.
 * - A bar's chord header: tap to pick up its whole phrase; ◀ ▶ shift it a
 *   bar at a time (occupied neighbors ripple into the row's first empty
 *   bar) and ✎ retypes its words.
 *
 * Word moves are row-local: to move words between rows, merge the rows in
 * Rows mode first.
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
        const selBreak =
          sel?.kind === "break" && sel.sectionId === sectionId && sel.li === li
            ? sel.boundary
            : null;

        // Placement slots for the picked-up break: every word gap in the two
        // bars it sits between, except where it already is. Slim 1px seam
        // with a ~24px invisible hit box (wider than its layout space via
        // negative margins, floating above the inert word chips beside it).
        const gapButton = (bi: number, gapInBar: number) => {
          if (selBreak === null || (bi !== selBreak - 1 && bi !== selBreak)) {
            return null;
          }
          const gap = layout.bars[bi].start + gapInBar;
          if (gap === layout.bars[selBreak].start) return null;
          return (
            <button
              type="button"
              onClick={() =>
                applyToLine(li, (l) => setWordBoundary(l, selBreak, gap))
              }
              title="Move the bar break here"
              aria-label="Move the bar break here"
              className="group relative z-10 -mx-1.5 flex w-6 shrink-0 items-center justify-center self-stretch"
            >
              <span className="h-4 w-px bg-blue-300 transition-all group-hover:w-1 group-hover:bg-blue-400" />
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
                <div
                  key={bi}
                  id={reshapeBarDomId({ sectionId, li, bi })}
                  className="flex max-w-full items-stretch"
                >
                  {bi > 0 && (
                    // The bar break itself: a tap target with a ~24px
                    // invisible hit box around the slim visible divider.
                    <button
                      type="button"
                      onClick={() =>
                        onSelect(
                          selBreak === bi
                            ? null
                            : { kind: "break", sectionId, li, boundary: bi }
                        )
                      }
                      title="Pick up this bar break"
                      aria-label={`Pick up the bar break before bar ${bi + 1}`}
                      aria-pressed={selBreak === bi}
                      className="group relative z-10 -mx-1 flex w-6 shrink-0 justify-center self-stretch"
                    >
                      <span
                        className={`self-stretch rounded transition-all ${
                          selBreak === bi
                            ? "w-1 bg-blue-500"
                            : "w-0.5 bg-slate-300 group-hover:bg-blue-400"
                        }`}
                      />
                    </button>
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
