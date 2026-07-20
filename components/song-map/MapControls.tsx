"use client";

import { KEYS, parseKey, shiftKey, type Notation } from "@/lib/song/theory";

export const NOTATIONS: { value: Notation; label: string; title: string }[] = [
  { value: "letters", label: "C", title: "Chord letters" },
  { value: "roman", label: "I", title: "Roman numerals" },
  { value: "nashville", label: "1", title: "Nashville numbers" },
];

/**
 * The shared view controls of every song-map rendering surface (map,
 * practice drills): transpose − / key / + / reset, the notation toggle, and
 * the structure-only Lyrics checkbox. Owning state stays in the host — this
 * only renders the cluster, so each surface keeps its own defaults.
 */
export function MapControls({
  songKey,
  displayKey,
  onDisplayKey,
  notation,
  onNotation,
  showLyrics,
  onShowLyrics,
}: {
  /** The song's stored key — the transpose "reset" target. */
  songKey: string;
  displayKey: string;
  onDisplayKey: (key: string) => void;
  notation: Notation;
  onNotation: (n: Notation) => void;
  showLyrics: boolean;
  onShowLyrics: (show: boolean) => void;
}) {
  const { tonic: displayTonic, minor } = parseKey(displayKey);

  return (
    <>
      {/* Key selector + semitone transpose */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Transpose down"
          onClick={() => onDisplayKey(shiftKey(displayKey, -1))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
        >
          −
        </button>
        <select
          aria-label="Key"
          value={displayTonic}
          onChange={(e) => onDisplayKey(e.target.value + (minor ? "m" : ""))}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold"
        >
          {KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
              {minor ? "m" : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Transpose up"
          onClick={() => onDisplayKey(shiftKey(displayKey, 1))}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
        >
          +
        </button>
        {displayKey !== songKey && (
          <button
            type="button"
            onClick={() => onDisplayKey(songKey)}
            className="ml-1 text-xs text-blue-600 hover:underline"
          >
            reset
          </button>
        )}
      </div>

      {/* Letters / Roman / Nashville toggle */}
      <div
        role="group"
        aria-label="Notation"
        className="flex overflow-hidden rounded-md border border-slate-300"
      >
        {NOTATIONS.map((n) => (
          <button
            key={n.value}
            type="button"
            title={n.title}
            onClick={() => onNotation(n.value)}
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

      {/* Structure-only mode: hide lyrics */}
      <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={showLyrics}
          onChange={(e) => onShowLyrics(e.target.checked)}
          className="h-4 w-4 accent-blue-600"
        />
        Lyrics
      </label>
    </>
  );
}
