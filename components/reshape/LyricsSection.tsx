"use client";

import { sectionColor } from "@/lib/song/colors";
import { lineWordLayout, setWordBoundary } from "@/lib/song/lyrics";
import { wordIntervals, wordRuns } from "@/lib/song/marks";
import { reshapeBarDomId } from "@/lib/song/selection";
import type { Line, SectionDef } from "@/lib/song/types";
import type { ReshapeSelection } from "./ReshapeView";

/**
 * Lyrics mode: redistribute the song's words across its bars without
 * retyping. Each bar shows its chord(s) above its words. Selectable things:
 *
 * - The │ break between two bars: tap to pick it up, then ◀ ▶ in the docked
 *   SelectionBar move it one word at a time, or tap one of the word gaps
 *   that light up (only the two bars the break sits between) to place it
 *   there exactly. One break, one explicit target — a gap tap can never
 *   surprise by folding words the other way.
 * - The seam at the start of a row (boundary 0): same gesture, but its left
 *   neighbor is the previous row's — or previous section's — last bar, so
 *   ◀ ▶ and the lit word gaps (in both adjacent bars, across the row or
 *   section boundary) walk words over it. Lyrics are a song-wide
 *   continuous string; rows and sections just partition it.
 * - A bar's chord header: tap to pick up its whole phrase; ◀ ▶ shift it a
 *   bar at a time (occupied neighbors ripple into the row's first empty
 *   bar) and ✎ retypes its words.
 * - A word chip: tap to pick the word up, then toggle highlights on it in
 *   the SelectionBar. Chips render highlights exactly as the song map does
 *   (bold, section accent).
 */
export function LyricsSection({
  def,
  sectionId,
  apply,
  sel,
  onSelect,
  hasPrecedingBars,
  seamLeftAt,
  onSeamGap,
}: {
  def: SectionDef;
  sectionId: string;
  apply: (fn: (lines: Line[]) => Line[]) => void;
  sel: ReshapeSelection | null;
  onSelect: (sel: ReshapeSelection | null) => void;
  /** Whether any bar exists before this section in the song's display
   *  order, i.e. whether the first row's leading seam has a left side. */
  hasPrecedingBars: boolean;
  /** When the selected seam's *left* bar is in this section: its address,
   *  so its word gaps light up as placement targets too. (The seam itself
   *  may be selected in a later section's component.) */
  seamLeftAt?: { li: number; bi: number } | null;
  /** Place the selected seam via a gap tap: move `count` words across it,
   *  dir 1 pulling them up out of the seam's row, dir -1 pushing the
   *  previous row's tail down into it. */
  onSeamGap?: (dir: -1 | 1, count: number) => void;
}) {
  const color = sectionColor(def.color);
  const applyToLine = (li: number, fn: (line: Line) => Line) =>
    apply((lines) => {
      const next = fn(lines[li]);
      return next === lines[li]
        ? lines
        : lines.map((l, i) => (i === li ? next : l));
    });

  // The seam before row `li` exists when some bar precedes it anywhere.
  const seamBefore = (li: number) =>
    hasPrecedingBars ||
    def.lines.slice(0, li).some((l) => l.bars.length > 0);

  return (
    <div className="space-y-2">
      {def.lines.map((line, li) => {
        const layout = lineWordLayout(line);
        const selBreak =
          sel?.kind === "break" && sel.sectionId === sectionId && sel.li === li
            ? sel.boundary
            : null;

        // Placement slots for the picked-up boundary: every word gap in the
        // two bars it sits between, except where it already is. A mid-row
        // break's pair is in this row; a row-start seam's pair straddles
        // the seam — bar 0 of its own row plus the previous row's (maybe
        // another section's) last bar, which `seamLeftAt` points at. Slim
        // 1px seam with a ~24px invisible hit box (wider than its layout
        // space via negative margins, floating above the inert word chips
        // beside it).
        const gapButton = (bi: number, gapInBar: number) => {
          let onTap: (() => void) | null = null;
          if (
            selBreak !== null &&
            selBreak > 0 &&
            (bi === selBreak - 1 || bi === selBreak)
          ) {
            const gap = layout.bars[bi].start + gapInBar;
            if (gap === layout.bars[selBreak].start) return null;
            onTap = () =>
              applyToLine(li, (l) => setWordBoundary(l, selBreak, gap));
          } else if (selBreak === 0 && bi === 0 && gapInBar > 0 && onSeamGap) {
            // Right side of the selected seam: the words before this gap
            // move up across it. gapInBar 0 is the seam itself.
            onTap = () => onSeamGap(1, gapInBar);
          } else if (
            onSeamGap &&
            seamLeftAt &&
            seamLeftAt.li === li &&
            seamLeftAt.bi === bi &&
            gapInBar < layout.bars[bi].words.length
          ) {
            // Left side of the selected seam: the words after this gap
            // move down across it. The gap after the last word is the
            // seam itself.
            onTap = () => onSeamGap(-1, layout.bars[bi].words.length - gapInBar);
          }
          if (!onTap) return null;
          const isBreak = selBreak !== null && selBreak > 0;
          return (
            <button
              type="button"
              onClick={onTap}
              title={isBreak ? "Move the bar break here" : "Move the seam here"}
              aria-label={
                isBreak ? "Move the bar break here" : "Move the seam here"
              }
              className="group relative z-10 -mx-1.5 flex w-6 shrink-0 items-center justify-center self-stretch"
            >
              <span className="h-4 w-px bg-blue-300 transition-all group-hover:w-1 group-hover:bg-blue-400" />
            </button>
          );
        };

        // The │ boundary before bar `bi`: a mid-row bar break, or (bi 0)
        // the row's leading seam. Same tap target, same selection kind.
        const breakButton = (bi: number) => (
          <button
            type="button"
            onClick={() =>
              onSelect(
                selBreak === bi
                  ? null
                  : { kind: "break", sectionId, li, boundary: bi }
              )
            }
            title={
              bi === 0
                ? "Pick up this row seam (moves words across rows)"
                : "Pick up this bar break"
            }
            aria-label={
              bi === 0
                ? "Pick up the seam before this row"
                : `Pick up the bar break before bar ${bi + 1}`
            }
            aria-pressed={selBreak === bi}
            className="group relative z-10 -mx-1 flex w-6 shrink-0 justify-center self-stretch"
          >
            <span
              className={`self-stretch rounded transition-all ${
                selBreak === bi
                  ? "w-1 bg-blue-500"
                  : bi === 0
                    ? "w-0.5 border-l border-dashed border-slate-400 group-hover:border-blue-400"
                    : "w-0.5 bg-slate-300 group-hover:bg-blue-400"
              }`}
            />
          </button>
        );

        return (
          <div key={li} className="flex flex-wrap items-stretch gap-y-2">
            {layout.bars.map((b, bi) => {
              const span = line.lyrics.find((s) => s.bar === bi);
              const selWord =
                sel?.kind === "word" &&
                sel.sectionId === sectionId &&
                sel.li === li &&
                sel.bar === bi
                  ? sel.word
                  : null;
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
                  {(bi > 0 || seamBefore(li)) && breakButton(bi)}
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
                              <button
                                type="button"
                                onClick={() =>
                                  onSelect(
                                    selWord === wi
                                      ? null
                                      : {
                                          kind: "word",
                                          sectionId,
                                          li,
                                          bar: bi,
                                          word: wi,
                                        }
                                  )
                                }
                                title="Pick up this word to highlight it"
                                aria-pressed={selWord === wi}
                                className={`flex items-center gap-1 rounded border px-1 py-0.5 text-xs ${
                                  selWord === wi
                                    ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300"
                                    : "border-slate-200 bg-white hover:border-blue-300"
                                }`}
                              >
                                {/* WYSIWYG: highlights render here exactly
                                    as the song map shows them. */}
                                <span>
                                  {wordRuns(
                                    w,
                                    wordIntervals(span?.marks, wi, w.length)
                                  ).map((run, ri) =>
                                    run.emph ? (
                                      <b
                                        key={ri}
                                        className={`font-bold ${color.label}`}
                                      >
                                        {run.text}
                                      </b>
                                    ) : (
                                      <span key={ri}>{run.text}</span>
                                    )
                                  )}
                                </span>
                              </button>
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
