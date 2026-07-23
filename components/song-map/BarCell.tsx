"use client";

import { useEffect, useRef, useState } from "react";
import { markRuns } from "@/lib/song/marks";
import type { Bar, LyricSpan } from "@/lib/song/types";
import type { Notation } from "@/lib/song/theory";
import { ChordPopover } from "./ChordPopover";
import { ChordSym } from "./ChordSym";

// Viewport-fraction thresholds for the playhead-follow scroll (shared by
// BarCell and ReshapeView's equivalent effect). Keeping the bottom band at
// ~55% rather than the old ~75% guarantees that whenever the row is
// centered, the lower half of the screen is left showing what's next.
const ROW_TOP_BAND = 0.12;
const ROW_BOTTOM_BAND = 0.55;

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
  emphasisColor = "text-slate-900",
  masked = false,
  onReveal,
  flash = false,
  playhead = false,
  onChordTap,
}: {
  bar: Bar;
  /** This bar's lyric phrase (with any word/syllable highlights). */
  span?: LyricSpan;
  showLyrics: boolean;
  songKey: string;
  displayKey: string;
  notation: Notation;
  borderColor: string;
  /** Text color class for highlighted words/syllables (the section's accent). */
  emphasisColor?: string;
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

  // The flash animation's fill-mode keeps its final keyframe (transparent
  // ring, white bg) applied as long as the class is on the element, and
  // animated properties override normal ones — which would blank out the
  // .bar-playhead ring whenever playback later reaches this bar. Drop the
  // class the moment the animation completes.
  const [flashDone, setFlashDone] = useState(false);

  // Follow the playhead, but only scroll when the row leaves the middle
  // band of the viewport — centering on every bar would judder constantly.
  // Center the *row* (the line's grid, via SectionCard's data-songmap-row),
  // not just the sounding bar: a bar can sit comfortably mid-viewport while
  // the next line is still off-screen, and it's the next line the player
  // needs to see coming. Bars sharing a row then trigger at most one scroll,
  // since centering the row also settles the bar well inside the band.
  useEffect(() => {
    if (!playhead) return;
    const el = flashRef.current;
    if (!el) return;
    const row = el.closest("[data-songmap-row]") ?? el;
    const r = row.getBoundingClientRect();
    const h = window.innerHeight;
    // Top band matches the old bar-following threshold. The bottom band is
    // intentionally tighter and sits above the docked transport bar (~7rem,
    // see SongMap's h-28 clearance): centering the row here always leaves
    // the lower half of the screen free to show the line that's coming up,
    // instead of just clearing the fold.
    if (r.top < h * ROW_TOP_BAND || r.bottom > h * ROW_BOTTOM_BAND) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
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
        onAnimationEnd={(e) => {
          if (e.animationName === "bar-flash") setFlashDone(true);
        }}
        className={`flex items-stretch justify-around rounded-md border ${borderColor} bg-white px-1 py-1.5 ${
          flash && !flashDone ? "bar-flash" : ""
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
      {showLyrics && (
        // One flowing block of lyric per bar; highlighted words/syllables
        // render bold in the section accent so the singer can tie them to
        // the chords by eye — never repositioned or split by the beats.
        <p className="mt-1 min-h-4 px-0.5 text-[11px] leading-tight text-slate-600 sm:text-xs">
          {markRuns(span).map((run, i) =>
            run.emph ? (
              <b key={i} className={`font-bold ${emphasisColor}`}>
                {run.text}
              </b>
            ) : (
              <span key={i}>{run.text}</span>
            )
          )}
        </p>
      )}
    </div>
  );
}
