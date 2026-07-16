"use client";

import type { ReactNode } from "react";
import type { Bar } from "@/lib/song/types";

/**
 * The selected word's bar as a strip of beat dots (grouped per chord like
 * BeatDots, boundaries as solid markers), docked in the SelectionBar's
 * tools. Every beat is a tap target that pins the word there; the beat the
 * word is currently anchored to renders as a ring. Tapping the anchored
 * beat again un-pins it.
 */
export function AnchorDots({
  bar,
  anchorBeat,
  onSet,
}: {
  bar: Bar;
  /** The selected word's current anchor beat, if any. */
  anchorBeat: number | null;
  onSet: (beat: number | null) => void;
}) {
  const starts: number[] = [];
  let total = 0;
  for (const c of bar.chords) {
    starts.push(total);
    total += c.beats;
  }

  const nodes: ReactNode[] = [];
  for (let b = 0; b < total; b++) {
    if (b > 0) {
      nodes.push(
        starts.includes(b) ? (
          <span
            key={`g${b}`}
            className="mx-1 h-4 w-0.5 shrink-0 rounded bg-slate-500"
            aria-hidden
          />
        ) : (
          <span key={`g${b}`} className="w-2 shrink-0" aria-hidden />
        )
      );
    }
    let ci = 0;
    while (ci + 1 < starts.length && starts[ci + 1] <= b) ci++;
    const anchored = anchorBeat === b;
    nodes.push(
      <button
        key={`d${b}`}
        type="button"
        onClick={() => onSet(anchored ? null : b)}
        title={anchored ? "Un-pin this word" : `Pin this word to beat ${b + 1}`}
        aria-label={
          anchored ? "Un-pin this word" : `Pin this word to beat ${b + 1}`
        }
        aria-pressed={anchored}
        className="group relative z-10 flex h-11 w-6 shrink-0 items-center justify-center"
      >
        <span
          className={`rounded-full transition-all ${
            anchored
              ? "h-3.5 w-3.5 bg-blue-600 ring-2 ring-blue-300"
              : `h-2 w-2 group-hover:h-3 group-hover:w-3 ${
                  ci % 2 === 0 ? "bg-blue-500" : "bg-slate-400"
                }`
          }`}
        />
      </button>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center overflow-x-auto">
      {nodes}
    </div>
  );
}
