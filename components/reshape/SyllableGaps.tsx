"use client";

import { useState, type ReactNode } from "react";
import { wordIntervals } from "@/lib/song/marks";
import type { WordMark } from "@/lib/song/types";

/**
 * WYSIWYG highlight picker for the selected word, docked in the
 * SelectionBar. The word renders exactly as the song map will show it —
 * highlighted stretches bold in the section's accent color — divided into
 * segments by tappable letter gaps. Tap a gap to split the word there
 * (tap again to remove the split); tap a segment's letters to toggle that
 * segment's highlight. Edges of existing highlights always show as
 * splits, so what's on can always be turned off segment by segment.
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
  const segmentAt = (at: number): [number, number] => {
    let a = 0;
    let b = word.length;
    for (const s of sorted) {
      if (s <= at) a = s;
      else {
        b = s;
        break;
      }
    }
    return [a, b];
  };

  // Split on code points so accented letters stay whole; gaps are
  // addressed by code-unit offset, matching how highlights slice the word.
  const letters = Array.from(word);
  const nodes: ReactNode[] = [];
  let offset = 0;
  letters.forEach((letter, i) => {
    if (i > 0) {
      const at = offset;
      const split = bounds.has(at);
      nodes.push(
        <button
          key={`g${at}`}
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
    }
    const [a, b] = segmentAt(offset);
    const emph = isEmph(offset);
    nodes.push(
      <button
        key={`l${offset}`}
        type="button"
        onClick={() => onToggleRange(a, b)}
        title={
          emph
            ? `Remove the highlight on “${word.slice(a, b)}”`
            : `Highlight “${word.slice(a, b)}” on the song map`
        }
        className={`h-11 shrink-0 text-sm ${
          emph ? `font-bold ${accentClass}` : "font-medium text-slate-600"
        } hover:bg-slate-100`}
      >
        {letter}
      </button>
    );
    offset += letter.length;
  });

  return (
    <div className="flex min-w-0 items-center overflow-x-auto px-1">
      {nodes}
    </div>
  );
}
