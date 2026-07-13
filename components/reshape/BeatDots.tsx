"use client";

import type { ReactNode } from "react";
import type { Bar } from "@/lib/song/types";

/**
 * Which chord pair's boundary a tap at `k` beats (inside a gap that isn't a
 * boundary already) should move there: among the pairs whose span contains
 * `k` (each side keeps ≥ 1 beat), the one whose current boundary is nearest
 * (tie → left) — the same rule as the word gaps in Lyrics mode. Null means
 * no boundary can reach `k`, so the gap renders inert.
 */
function pairFor(starts: number[], total: number, k: number): number | null {
  let best: number | null = null;
  for (let i = 0; i < starts.length - 1; i++) {
    const end = i + 2 < starts.length ? starts[i + 2] : total;
    if (k <= starts[i] || k >= end) continue;
    if (best === null || Math.abs(starts[i + 1] - k) < Math.abs(starts[best + 1] - k)) {
      best = i;
    }
  }
  return best;
}

/**
 * The selected bar's beats as a strip of dots grouped per chord, docked in
 * the SelectionBar's chord tools. Dots alternate color by chord so the
 * grouping reads without numbers; the current boundaries render as solid
 * markers, and every other between-dot gap a boundary can legally reach is a
 * tap target that moves the nearest boundary there. Single-chord bars render
 * inert dots (insert a chord to get a boundary to move).
 */
export function BeatDots({
  bar,
  onSet,
}: {
  bar: Bar;
  onSet: (ci: number, beats: number) => void;
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
      const boundary = starts.indexOf(b, 1);
      const pair = boundary === -1 ? pairFor(starts, total, b) : null;
      nodes.push(
        boundary !== -1 ? (
          <span
            key={`g${b}`}
            className="mx-1 h-4 w-0.5 shrink-0 rounded bg-slate-500"
            aria-hidden
          />
        ) : pair !== null ? (
          // Slim mark, ~24px invisible hit box floating over the inert dots.
          <button
            key={`g${b}`}
            type="button"
            onClick={() => onSet(pair, b - starts[pair])}
            title="Move the beat split here"
            aria-label={`Move the beat split to after beat ${b}`}
            className="group relative z-10 -mx-1.5 flex h-11 w-6 shrink-0 items-center justify-center"
          >
            <span className="h-3 w-px bg-slate-200 transition-all group-hover:w-1 group-hover:bg-blue-400" />
          </button>
        ) : (
          <span key={`g${b}`} className="w-2 shrink-0" aria-hidden />
        )
      );
    }
    // Chord owning beat b: the last chord starting at or before it.
    let ci = 0;
    while (ci + 1 < starts.length && starts[ci + 1] <= b) ci++;
    nodes.push(
      <span
        key={`d${b}`}
        className={`h-2 w-2 shrink-0 rounded-full ${
          ci % 2 === 0 ? "bg-blue-500" : "bg-slate-400"
        }`}
        aria-hidden
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center justify-center overflow-x-auto">
      {nodes}
    </div>
  );
}
