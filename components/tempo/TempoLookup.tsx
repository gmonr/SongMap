"use client";

import { useState, useTransition } from "react";
import { lookupTempo } from "@/app/songs/tempo-actions";

/**
 * "Look up ♩" button + suggestion chip. The lookup never writes the tempo
 * itself — Deezer's bpm is audio-analysis derived and sometimes wrong (or a
 * wrong match entirely), so the chip shows what was matched and the user
 * applies it with a tap. When the suggestion equals the current value the
 * chip reads as a confirmation instead.
 */
export function TempoLookup({
  artist,
  title,
  currentTempo,
  onUse,
}: {
  artist: string;
  title: string;
  /** The tempo field's current value, if any. */
  currentTempo: number | null;
  onUse: (bpm: number) => void;
}) {
  const [result, setResult] = useState<
    | { kind: "bpm"; bpm: number; matched: string }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [looking, startLooking] = useTransition();

  const look = () => {
    if (looking) return;
    setResult(null);
    startLooking(async () => {
      const r = await lookupTempo(artist, title);
      setResult(
        r.ok
          ? {
              kind: "bpm",
              bpm: r.bpm,
              matched: [r.matchedTitle, r.matchedArtist]
                .filter(Boolean)
                .join(" — "),
            }
          : { kind: "error", message: r.error }
      );
    });
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={look}
        disabled={looking || !title.trim()}
        title="Look the tempo up on Deezer"
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      >
        {looking ? "…" : "Look up ♩"}
      </button>
      {result?.kind === "error" && (
        <span className="text-xs text-rose-600">{result.message}</span>
      )}
      {result?.kind === "bpm" &&
        (result.bpm === currentTempo ? (
          <span className="text-xs text-emerald-700">
            Deezer agrees: ♩={result.bpm} (“{result.matched}”)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
            Deezer: ♩={result.bpm} (“{result.matched}”)
            <button
              type="button"
              onClick={() => onUse(result.bpm)}
              className="font-semibold underline hover:no-underline"
            >
              Use
            </button>
          </span>
        ))}
    </span>
  );
}
