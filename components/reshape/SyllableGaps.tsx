"use client";

import type { ReactNode } from "react";

/**
 * The selected word's letters with a slim tappable gap between each pair,
 * docked next to the AnchorDots: tapping a gap starts the pin at that
 * character (a syllable — "so·ñado"), tapping the active gap goes back to
 * the whole word. Gaps that already carry an anchor show a dot.
 */
export function SyllableGaps({
  word,
  selChar,
  anchoredChars,
  onPick,
}: {
  word: string;
  /** The selection's current char offset (0 = whole word). */
  selChar: number;
  /** Char offsets of this word's existing anchors (excluding 0). */
  anchoredChars: Set<number>;
  onPick: (char: number) => void;
}) {
  // Split on code points so accented letters stay whole; gaps are addressed
  // by code-unit offset, matching how anchors slice the word.
  const letters = Array.from(word);
  const nodes: ReactNode[] = [];
  let offset = 0;
  letters.forEach((letter, i) => {
    if (i > 0) {
      const at = offset;
      const active = selChar === at;
      nodes.push(
        <button
          key={`g${at}`}
          type="button"
          onClick={() => onPick(active ? 0 : at)}
          title={
            active ? "Pin the whole word instead" : "Start the pin here"
          }
          aria-pressed={active}
          className="group relative z-10 flex h-11 w-4 shrink-0 items-center justify-center"
        >
          <span
            className={`rounded transition-all ${
              active
                ? "h-5 w-1 bg-blue-600"
                : anchoredChars.has(at)
                  ? "h-4 w-0.5 bg-blue-400"
                  : "h-3 w-px bg-slate-300 group-hover:w-1 group-hover:bg-blue-400"
            }`}
          />
        </button>
      );
    }
    nodes.push(
      <span key={`l${offset}`} className="shrink-0 text-sm font-medium">
        {letter}
      </span>
    );
    offset += letter.length;
  });

  return (
    <div className="flex min-w-0 items-center overflow-x-auto px-1">
      {nodes}
    </div>
  );
}
