"use client";

import { useEffect, useRef } from "react";
import { anchorSegments } from "@/lib/song/anchors";
import type { Bar, LyricSpan } from "@/lib/song/types";
import type { Notation } from "@/lib/song/theory";
import { ChordPopover } from "./ChordPopover";
import { ChordSym } from "./ChordSym";

function BeatDots({ count }: { count: number }) {
  return (
    <span className="flex items-center justify-center gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-slate-400"
          aria-hidden
        />
      ))}
    </span>
  );
}

/**
 * One bar of the chord grid: chord symbol(s) on top, one beat dot per beat
 * underneath (so a split bar like "F · · | C · ·" is visually obvious), and
 * the lyric phrase for this bar below. Each chord opens a piano-diagram
 * popover on click. In practice mode a masked bar renders as a blank
 * click-to-reveal placeholder instead.
 */
export function BarCell({
  bar,
  span,
  showLyrics,
  songKey,
  displayKey,
  notation,
  borderColor,
  masked = false,
  onReveal,
  flash = false,
  playhead = false,
  onChordTap,
}: {
  bar: Bar;
  /** This bar's lyric phrase (with any word→beat anchors). */
  span?: LyricSpan;
  showLyrics: boolean;
  songKey: string;
  displayKey: string;
  notation: Notation;
  borderColor: string;
  masked?: boolean;
  onReveal?: () => void;
  /** Landing back from reshape: scroll here and flash once. */
  flash?: boolean;
  /** Playback: this bar is sounding right now. */
  playhead?: boolean;
  /**
   * Playback: start playing from chord `ci` of this bar. When given, chord
   * taps seek playback instead of opening the piano-diagram popover.
   */
  onChordTap?: (ci: number) => void;
}) {
  const flashRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (flash) flashRef.current?.scrollIntoView({ block: "center" });
  }, [flash]);

  // Follow the playhead, but only scroll when the bar leaves the middle
  // band of the viewport — centering on every bar would judder constantly.
  useEffect(() => {
    if (!playhead) return;
    const el = flashRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const h = window.innerHeight;
    if (r.top < h * 0.15 || r.bottom > h * 0.75) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [playhead]);

  if (masked) {
    return (
      <button
        type="button"
        onClick={onReveal}
        className="flex min-w-0 flex-col text-left"
      >
        <div
          className={`flex items-center justify-center rounded-md border border-dashed ${borderColor} bg-slate-50 px-1 py-1.5 hover:bg-slate-100`}
        >
          <span className="text-sm font-bold text-slate-300">?</span>
        </div>
        {showLyrics && (
          <p className="mt-1 min-h-4 px-0.5 text-[11px] leading-tight text-slate-300 sm:text-xs">
            •••
          </p>
        )}
      </button>
    );
  }

  return (
    <div ref={flashRef} className="flex min-w-0 flex-col">
      <div
        className={`flex items-stretch justify-around rounded-md border ${borderColor} bg-white px-1 py-1.5 ${
          flash ? "bar-flash" : ""
        } ${playhead ? "bar-playhead" : ""}`}
      >
        {bar.chords.map((chord, i) => (
          <div
            key={i}
            className="flex min-w-0 flex-col items-center justify-between gap-0.5"
            style={{ flexGrow: Math.max(chord.beats, 1) }}
          >
            {onChordTap ? (
              <button
                type="button"
                onClick={() => onChordTap(i)}
                aria-label={`Play from ${chord.sym.trim() || "this bar"}`}
                title="Play from here"
                className="m-0 inline-flex cursor-pointer border-0 bg-transparent p-0 leading-none"
              >
                <ChordSym
                  sym={chord.sym}
                  songKey={songKey}
                  displayKey={displayKey}
                  notation={notation}
                  className="truncate text-sm font-bold sm:text-base"
                />
              </button>
            ) : (
              <ChordPopover
                sym={chord.sym}
                songKey={songKey}
                displayKey={displayKey}
                notation={notation}
                className="truncate text-sm font-bold sm:text-base"
              />
            )}
            <BeatDots count={Math.max(chord.beats, 1)} />
          </div>
        ))}
      </div>
      {showLyrics &&
        (span?.anchors?.length ? (
          // Anchored lyric: segments mirror the chord row's beat-weighted
          // flex layout, so each anchored word starts where its beat does.
          <div className="mt-1 flex min-h-4 px-0.5 text-[11px] leading-tight text-slate-600 sm:text-xs">
            {anchorSegments(bar, span).map((seg, i) => (
              <span
                key={i}
                className="min-w-0"
                style={{ flexGrow: seg.grow, flexBasis: 0 }}
              >
                {seg.text}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 min-h-4 px-0.5 text-[11px] leading-tight text-slate-600 sm:text-xs">
            {span?.text ?? ""}
          </p>
        ))}
    </div>
  );
}
