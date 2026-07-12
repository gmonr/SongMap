"use client";

import { useState } from "react";
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
}: {
  def: SectionDef;
  item: ArrangementItem;
  sameAsLabel?: string;
  songKey: string;
  displayKey: string;
  notation: Notation;
  showLyrics: boolean;
}) {
  const [expanded, setExpanded] = useState(!item.sameChordsAs);
  const color = sectionColor(def.color);

  return (
    <section
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
