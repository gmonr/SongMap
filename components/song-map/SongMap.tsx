"use client";

import Link from "next/link";
import { useState } from "react";
import type { SongRow } from "@/lib/song/types";
import {
  KEYS,
  parseKey,
  shiftKey,
  type Notation,
} from "@/lib/song/theory";
import { SectionCard } from "./SectionCard";

const NOTATIONS: { value: Notation; label: string; title: string }[] = [
  { value: "letters", label: "C", title: "Chord letters" },
  { value: "roman", label: "I", title: "Roman numerals" },
  { value: "nashville", label: "1", title: "Nashville numbers" },
];

/**
 * The Song Map: header with key/transpose/notation controls, then the
 * arrangement rendered as a vertical stack of color-coded section cards.
 */
export function SongMap({
  song,
  editHref,
}: {
  song: SongRow;
  editHref?: string;
}) {
  const songKey = song.key || "C";
  const [displayKey, setDisplayKey] = useState(songKey);
  const [notation, setNotation] = useState<Notation>("letters");
  const [showLyrics, setShowLyrics] = useState(true);

  const { tonic: displayTonic, minor } = parseKey(displayKey);

  // "same as Verse 1" labels: first arrangement instance of each section.
  const firstInstanceLabel = new Map<string, string>();
  for (const item of song.data.arrangement) {
    if (!firstInstanceLabel.has(item.ref)) {
      firstInstanceLabel.set(item.ref, item.instanceLabel);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-tight">
            {song.title}
          </h1>
          <p className="truncate text-sm text-slate-500">
            {song.artist}
            {song.tempo ? ` · ♩=${song.tempo}` : ""}
            {song.time_signature ? ` · ${song.time_signature}` : ""}
            {song.capo ? ` · capo ${song.capo}` : ""}
          </p>
        </div>
        <span className="flex-1" />

        {/* Key selector + semitone transpose */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Transpose down"
            onClick={() => setDisplayKey((k) => shiftKey(k, -1))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
          >
            −
          </button>
          <select
            aria-label="Key"
            value={displayTonic}
            onChange={(e) =>
              setDisplayKey(e.target.value + (minor ? "m" : ""))
            }
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
            onClick={() => setDisplayKey((k) => shiftKey(k, 1))}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"
          >
            +
          </button>
          {displayKey !== songKey && (
            <button
              type="button"
              onClick={() => setDisplayKey(songKey)}
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

        {/* Structure-only mode: hide lyrics */}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showLyrics}
            onChange={(e) => setShowLyrics(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          Lyrics
        </label>

        {editHref && (
          <Link
            href={editHref}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Edit
          </Link>
        )}
      </header>

      {song.data.arrangement.map((item, i) => {
        const def = song.data.sections[item.ref];
        if (!def) return null;
        const sameAsLabel = item.sameChordsAs
          ? firstInstanceLabel.get(item.sameChordsAs)
          : undefined;
        return (
          <SectionCard
            key={i}
            def={def}
            item={item}
            sameAsLabel={sameAsLabel}
            songKey={songKey}
            displayKey={displayKey}
            notation={notation}
            showLyrics={showLyrics}
          />
        );
      })}
    </div>
  );
}
