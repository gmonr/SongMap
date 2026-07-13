"use client";

import { useMemo, useState } from "react";
import { SectionCard } from "@/components/song-map/SectionCard";
import { shuffledOrder } from "@/lib/song/practice";
import type { Notation } from "@/lib/song/theory";
import type { SongRow } from "@/lib/song/types";

/**
 * Interleaved practice: steps through the arrangement's sections one at a
 * time in shuffled order, so recall doesn't lean on the song's usual
 * sequence. "Reshuffle" draws a new order and jumps back to the first card.
 */
export function ShuffledSectionsView({ song }: { song: SongRow }) {
  const songKey = song.key || "C";
  const [notation, setNotation] = useState<Notation>("letters");
  const [showLyrics, setShowLyrics] = useState(true);
  const [seed, setSeed] = useState(0);
  const [position, setPosition] = useState(0);

  const arrangement = song.data.arrangement;
  const order = useMemo(
    () => shuffledOrder(seed, arrangement.length),
    [seed, arrangement.length]
  );

  if (arrangement.length === 0) {
    return <p className="text-sm text-slate-500">This song has no arrangement yet.</p>;
  }

  const reshuffle = () => {
    setSeed((s) => s + 1);
    setPosition(0);
  };

  const arrIndex = order[position];
  const item = arrangement[arrIndex];
  const def = song.data.sections[item.ref];
  // Always show the full card standalone — collapsing to "same as X" only
  // makes sense with the referenced section visible nearby, which it isn't
  // here.
  const cardItem = { ...item, sameChordsAs: undefined };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-sm font-medium text-slate-500">
          Card {position + 1} of {arrangement.length}
        </span>

        <button
          type="button"
          onClick={reshuffle}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ⤾ Reshuffle
        </button>

        <span className="flex-1" />

        <div
          role="group"
          aria-label="Notation"
          className="flex overflow-hidden rounded-md border border-slate-300"
        >
          {(
            [
              { value: "letters", label: "C" },
              { value: "roman", label: "I" },
              { value: "nashville", label: "1" },
            ] as const
          ).map((n) => (
            <button
              key={n.value}
              type="button"
              onClick={() => setNotation(n.value)}
              className={`px-3 py-1 text-sm font-semibold ${
                notation === n.value
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {n.label}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showLyrics}
            onChange={(e) => setShowLyrics(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          Lyrics
        </label>
      </div>

      {def ? (
        <SectionCard
          key={arrIndex}
          def={def}
          item={cardItem}
          songKey={songKey}
          displayKey={songKey}
          notation={notation}
          showLyrics={showLyrics}
        />
      ) : (
        <p className="text-sm text-slate-500">Missing section data.</p>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={position === 0}
          onClick={() => setPosition((p) => p - 1)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Prev
        </button>
        <button
          type="button"
          disabled={position === arrangement.length - 1}
          onClick={() => setPosition((p) => p + 1)}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
