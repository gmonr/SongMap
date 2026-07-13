"use client";

import { useState } from "react";
import {
  lineWordLayout,
  setWordBoundary,
  shiftLyric,
  type WordLayout,
} from "@/lib/song/lyrics";
import type { Line, SectionDef } from "@/lib/song/types";

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
 * selects its whole phrase, with ◀ ▶ to shift it a bar at a time (occupied
 * neighbors ripple into the row's first empty bar). Word moves are row-local:
 * to move words between rows, merge the rows in Rows mode first.
 */
export function LyricsSection({
  def,
  apply,
}: {
  def: SectionDef;
  apply: (fn: (lines: Line[]) => Line[]) => void;
}) {
  const [sel, setSel] = useState<{ li: number; bar: number } | null>(null);

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
              className="group flex w-3 shrink-0 items-center justify-center self-stretch"
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
              const selected = sel?.li === li && sel?.bar === bi;
              const hasLyric = b.words.length > 0;
              return (
                <div key={bi} className="flex items-stretch">
                  {bi > 0 && (
                    <span
                      className="mx-0.5 w-0.5 shrink-0 self-stretch rounded bg-slate-300"
                      aria-hidden
                    />
                  )}
                  <div
                    className={`flex flex-col gap-0.5 rounded-md px-0.5 py-0.5 ${
                      selected ? "bg-blue-50 ring-1 ring-blue-300" : ""
                    }`}
                  >
                    <div className="flex items-center gap-0.5">
                      {selected && (
                        <ShiftButton
                          dir={-1}
                          line={line}
                          bar={bi}
                          onShift={() =>
                            applyToLine(li, (l) => shiftLyric(l, bi, -1))
                          }
                        />
                      )}
                      <button
                        type="button"
                        disabled={!hasLyric}
                        onClick={() => setSel(selected ? null : { li, bar: bi })}
                        title={
                          hasLyric ? "Select phrase to shift it" : undefined
                        }
                        className={`text-[10px] font-bold ${
                          hasLyric
                            ? "text-slate-400 hover:text-blue-600"
                            : "cursor-default text-slate-300"
                        }`}
                      >
                        {chordLabel}
                      </button>
                      {selected && (
                        <ShiftButton
                          dir={1}
                          line={line}
                          bar={bi}
                          onShift={() =>
                            applyToLine(li, (l) => shiftLyric(l, bi, 1))
                          }
                        />
                      )}
                    </div>
                    <div className="flex min-h-6 items-center">
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

/** ◀/▶ beside a selected phrase; disabled when the shift would be a no-op. */
function ShiftButton({
  dir,
  line,
  bar,
  onShift,
}: {
  dir: -1 | 1;
  line: Line;
  bar: number;
  onShift: () => void;
}) {
  const disabled = shiftLyric(line, bar, dir) === line;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onShift}
      title={dir === 1 ? "Shift phrase right" : "Shift phrase left"}
      aria-label={dir === 1 ? "Shift phrase right" : "Shift phrase left"}
      className="rounded px-1 text-[10px] font-bold text-blue-600 hover:bg-blue-100 disabled:cursor-default disabled:text-slate-300"
    >
      {dir === 1 ? "▶" : "◀"}
    </button>
  );
}
