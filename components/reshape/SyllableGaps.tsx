"use client";

import { Fragment, useState } from "react";
import { wordIntervals } from "@/lib/song/marks";
import type { WordMark } from "@/lib/song/types";

/**
 * WYSIWYG highlight picker for the selected word, docked in the
 * SelectionBar. The word renders exactly as the song map will show it —
 * highlighted stretches bold in the section's accent color — divided into
 * segments by tappable letter gaps. Tap a gap to split the word there
 * (tap again to remove the split); tap the wide zone above a segment (or
 * its letters) to toggle that segment's highlight — the zone spans the
 * whole segment, so on a phone there's a big target that can't be
 * confused with the dividers. Edges of existing highlights always show
 * as splits, so what's on can always be turned off segment by segment.
 */
export function SyllableGaps({
  word,
  wordIndex,
  marks,
  accentClass,
  onToggleRange,
}: {
  word: string;
  /** The word's index in its phrase (marks are phrase-wide). */
  wordIndex: number;
  /** The phrase's marks; this word's highlights are read from them. */
  marks: WordMark[] | undefined;
  /** Text color class the song map uses for highlights (section accent). */
  accentClass: string;
  /** Toggle the highlight on chars [from, to) of this word. */
  onToggleRange: (from: number, to: number) => void;
}) {
  // Gaps the user opened by hand while this word is picked up; highlight
  // edges are derived splits on top of these.
  const [cuts, setCuts] = useState<ReadonlySet<number>>(new Set());

  const intervals = wordIntervals(marks, wordIndex, word.length);
  const isEmph = (at: number) =>
    intervals.some(([a, b]) => a <= at && at < b);

  const bounds = new Set<number>([0, word.length]);
  for (const c of cuts) if (c > 0 && c < word.length) bounds.add(c);
  for (const [a, b] of intervals) {
    bounds.add(a);
    bounds.add(b);
  }
  const sorted = [...bounds].sort((x, y) => x - y);
  const segments: [number, number][] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    segments.push([sorted[i], sorted[i + 1]]);
  }

  // Split on code points so accented letters stay whole; gaps are
  // addressed by code-unit offset, matching how highlights slice the word.
  const letters: { ch: string; at: number }[] = [];
  let offset = 0;
  for (const ch of Array.from(word)) {
    letters.push({ ch, at: offset });
    offset += ch.length;
  }

  const gapButton = (at: number) => {
    const split = bounds.has(at);
    return (
      <button
        type="button"
        onClick={() =>
          setCuts((prev) => {
            const next = new Set(prev);
            if (next.has(at)) next.delete(at);
            else next.add(at);
            return next;
          })
        }
        title={split ? "Remove this split" : "Split the word here"}
        aria-label={split ? "Remove this split" : "Split the word here"}
        aria-pressed={split}
        className="group relative z-10 flex h-11 w-4 shrink-0 items-center justify-center"
      >
        <span
          className={`rounded transition-all ${
            split
              ? "h-5 w-1 bg-blue-600"
              : "h-3 w-px bg-slate-300 group-hover:w-1 group-hover:bg-blue-400"
          }`}
        />
      </button>
    );
  };

  return (
    <div className="flex min-w-0 items-end overflow-x-auto px-1">
      {segments.map(([a, b], si) => {
        const emph = isEmph(a);
        const seg = word.slice(a, b);
        const toggleTitle = emph
          ? `Remove the highlight on “${seg}”`
          : `Highlight “${seg}” on the song map`;
        return (
          <Fragment key={a}>
            {si > 0 && gapButton(a)}
            <div className="flex shrink-0 flex-col items-stretch">
              {/* The big per-segment target: a bar spanning the segment. */}
              <button
                type="button"
                onClick={() => onToggleRange(a, b)}
                title={toggleTitle}
                aria-label={toggleTitle}
                aria-pressed={emph}
                className={`flex h-7 items-center justify-center rounded-md px-0.5 hover:bg-slate-100 ${
                  emph ? accentClass : "text-slate-300 hover:text-slate-400"
                }`}
              >
                <span className="h-1.5 w-full min-w-5 rounded-full bg-current" />
              </button>
              <div className="flex items-center justify-center">
                {letters
                  .filter((l) => l.at >= a && l.at < b)
                  .map((l, j) => (
                    <Fragment key={l.at}>
                      {j > 0 && gapButton(l.at)}
                      <button
                        type="button"
                        onClick={() => onToggleRange(a, b)}
                        title={toggleTitle}
                        className={`h-11 shrink-0 text-sm ${
                          emph
                            ? `font-bold ${accentClass}`
                            : "font-medium text-slate-600"
                        } hover:bg-slate-100`}
                      >
                        {l.ch}
                      </button>
                    </Fragment>
                  ))}
              </div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
