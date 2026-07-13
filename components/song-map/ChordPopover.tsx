"use client";

import { useEffect, useRef, useState } from "react";
import { pianoChordFor } from "@/lib/song/piano";
import { transposeChord, type Notation } from "@/lib/song/theory";
import { ChordSym } from "./ChordSym";
import { PianoDiagram } from "./PianoDiagram";

/**
 * Wraps a chord symbol so clicking it opens a popover showing the chord's
 * notes on a piano keyboard. Purely a display aid — closes on outside click
 * or Escape, and renders nothing extra when the symbol isn't a real chord.
 */
export function ChordPopover({
  sym,
  songKey,
  displayKey,
  notation,
  className,
}: {
  sym: string;
  songKey: string;
  displayKey: string;
  notation: Notation;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const transposed = transposeChord(sym, songKey, displayKey);
  const chord = pianoChordFor(transposed);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => chord.valid && setOpen((v) => !v)}
        className={`m-0 inline-flex border-0 bg-transparent p-0 leading-none ${
          chord.valid ? "cursor-pointer" : "cursor-default"
        }`}
        aria-haspopup={chord.valid ? "dialog" : undefined}
        aria-expanded={chord.valid ? open : undefined}
      >
        <ChordSym
          sym={sym}
          songKey={songKey}
          displayKey={displayKey}
          notation={notation}
          className={className}
        />
      </button>
      {open && chord.valid && (
        <div className="absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 shadow-lg">
          <PianoDiagram
            toneChromas={chord.toneChromas}
            rootChroma={chord.rootChroma}
          />
          <p className="mt-1.5 whitespace-nowrap text-center text-xs font-medium text-slate-500">
            {chord.notes.join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
