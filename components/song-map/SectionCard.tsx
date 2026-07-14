"use client";

import { useEffect, useRef, useState } from "react";
import { sectionColor } from "@/lib/song/colors";
import type { ArrangementItem, SectionDef } from "@/lib/song/types";
import type { Notation } from "@/lib/song/theory";
import { BarCell } from "./BarCell";

/**
 * A color-coded section card: label header, chord grid (equal-width bar
 * cells wrapping at 4 on mobile / 8 on desktop) with lyrics aligned under
 * each bar. Instances marked `sameChordsAs` collapse to a one-line
 * "chords same as X" reference, expandable on demand.
 */
export function SectionCard({
  def,
  item,
  sameAsLabel,
  songKey,
  displayKey,
  notation,
  showLyrics,
  isBarMasked,
  onRevealBar,
  focusBar,
}: {
  def: SectionDef;
  item: ArrangementItem;
  sameAsLabel?: string;
  songKey: string;
  displayKey: string;
  notation: Notation;
  showLyrics: boolean;
  /** Practice mode: whether the bar at (lineIndex, barIndex) is hidden. */
  isBarMasked?: (lineIndex: number, barIndex: number) => boolean;
  /** Practice mode: reveal the bar at (lineIndex, barIndex). */
  onRevealBar?: (lineIndex: number, barIndex: number) => void;
  /** Landing back from reshape: scroll to this bar and flash it. */
  focusBar?: { li: number; bi: number };
}) {
  const [expanded, setExpanded] = useState(!item.sameChordsAs || !!focusBar);
  const color = sectionColor(def.color);
  const sectionRef = useRef<HTMLElement>(null);

  // The focus indexes can be stale (reshaping was discarded after deleting
  // bars/rows): a bad line falls back to scrolling the section card itself,
  // a bad bar clamps to the line's last bar (in the BarCell flash below).
  const focusLine = focusBar ? def.lines[focusBar.li] : undefined;
  useEffect(() => {
    if (focusBar && !focusLine) {
      sectionRef.current?.scrollIntoView({ block: "start" });
    }
    // Run once on mount: the focus handoff only exists on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      ref={sectionRef}
      className={`overflow-hidden rounded-xl border border-slate-200 ${color.card} shadow-sm`}
    >
      <div className="flex items-center gap-3 px-4 pt-3">
        <span className={`h-5 w-1.5 rounded-full ${color.accent}`} aria-hidden />
        <h2
          className={`text-sm font-bold uppercase tracking-wide ${color.label}`}
        >
          {item.instanceLabel || def.label}
        </h2>
        {item.repeat && item.repeat > 1 && (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
            ×{item.repeat}
          </span>
        )}
        {item.sameChordsAs && sameAsLabel && (
          <span className="text-xs text-slate-500">
            ⟳ chords same as {sameAsLabel}
          </span>
        )}
        <span className="flex-1" />
        {item.sameChordsAs && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            {expanded ? "collapse ▴" : "expand ▾"}
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-4 px-4 pb-4 pt-3">
          {def.lines.map((line, li) => {
            const lyricByBar = new Map(
              line.lyrics.map((s) => [s.bar, s.text])
            );
            return (
              <div
                key={li}
                className="grid grid-cols-4 gap-x-1.5 gap-y-2 md:grid-cols-8 md:gap-x-2"
              >
                {line.bars.map((bar, bi) => (
                  <BarCell
                    key={bi}
                    bar={bar}
                    lyric={lyricByBar.get(bi)}
                    showLyrics={showLyrics}
                    songKey={songKey}
                    displayKey={displayKey}
                    notation={notation}
                    borderColor={color.barBorder}
                    masked={isBarMasked?.(li, bi) ?? false}
                    onReveal={() => onRevealBar?.(li, bi)}
                    flash={
                      !!focusBar &&
                      li === focusBar.li &&
                      bi === Math.min(focusBar.bi, line.bars.length - 1)
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
      {!expanded && <div className="pb-3" />}
    </section>
  );
}
