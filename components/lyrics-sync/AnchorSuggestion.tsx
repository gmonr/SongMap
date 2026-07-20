"use client";

import { useState } from "react";
import { lookupSyncedLyrics } from "@/app/songs/lyrics-actions";
import {
  alignLyrics,
  songWordStream,
  suggestAnchors,
} from "@/lib/lyrics-sync/align";
import type { SongRow } from "@/lib/song/types";
import type { SyncAnchor } from "@/lib/spotify/sync";
import { smallBtn } from "@/components/song-map/transport-types";
import type { SpotifyPlayback } from "@/components/song-map/useSpotifyPlayback";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "offer";
      matchedTitle: string;
      matchedArtist: string;
      anchors: SyncAnchor[];
      fittedBpm: number | null;
    }
  | { kind: "applied"; count: number; prev: SyncAnchor[] };

/**
 * Calibration bootstrap from synced lyrics: look the song up on LRCLIB,
 * align the timed lines with the map's words, and offer the derived
 * anchors as a confirm-to-use suggestion (Deezer-chip pattern — the match
 * is named, nothing applies silently, and applying leaves an undo chip so
 * hand-tapped anchors are never silently lost). Rough by nature: LRC
 * times are vocal onsets, so the nudge tools finish the job.
 */
export function AnchorSuggestion({
  sp,
  song,
}: {
  sp: SpotifyPlayback;
  song: SongRow;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const lookup = async () => {
    setState({ kind: "loading" });
    let res;
    try {
      res = await lookupSyncedLyrics(
        song.artist ?? "",
        song.title,
        sp.sync.track?.durationMs ?? null
      );
    } catch {
      res = { ok: false as const, error: "Lookup failed — try again." };
    }
    if (!res.ok) {
      setState({ kind: "error", message: res.error });
      return;
    }
    const suggestion = suggestAnchors(
      alignLyrics(songWordStream(song.data, sp.timeline), res.lines)
    );
    if (suggestion.anchors.length === 0) {
      setState({
        kind: "error",
        message: `LRCLIB matched “${res.matchedTitle}” but its lines couldn't be aligned with this song's lyrics.`,
      });
      return;
    }
    setState({
      kind: "offer",
      matchedTitle: res.matchedTitle,
      matchedArtist: res.matchedArtist,
      anchors: suggestion.anchors,
      fittedBpm: suggestion.fittedBpm,
    });
  };

  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <button
        type="button"
        onClick={lookup}
        disabled={state.kind === "loading"}
        title="Look the song up on LRCLIB and derive anchors from its synced lyrics (sends title/artist to LRCLIB)"
        className={`${smallBtn} disabled:text-slate-300`}
      >
        {state.kind === "loading" ? "looking up…" : "✨ Suggest from lyrics"}
      </button>
    );
  }

  if (state.kind === "error") {
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
        {state.message}
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="text-blue-600 hover:underline"
        >
          ok
        </button>
      </span>
    );
  }

  if (state.kind === "applied") {
    return (
      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
        Applied {state.count} suggested anchor
        {state.count === 1 ? "" : "s"} — nudge to taste.
        <button
          type="button"
          onClick={() => {
            sp.setAnchors(state.prev);
            setState({ kind: "idle" });
          }}
          className="font-semibold text-blue-600 hover:underline"
        >
          undo
        </button>
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="text-slate-400 hover:underline"
        >
          done
        </button>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
      LRCLIB matched “{state.matchedTitle} — {state.matchedArtist}”: proposes{" "}
      {state.anchors.length} anchor{state.anchors.length === 1 ? "" : "s"}
      {state.fittedBpm !== null &&
        ` (fits ♩≈${state.fittedBpm}${
          song.tempo ? `; song says ${song.tempo}` : ""
        })`}
      , rough to within a beat.
      <button
        type="button"
        onClick={() => {
          const prev = sp.sync.anchors;
          sp.setAnchors(state.anchors);
          setState({ kind: "applied", count: state.anchors.length, prev });
        }}
        className="rounded-md bg-green-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-green-700"
      >
        Use
      </button>
      <button
        type="button"
        onClick={() => setState({ kind: "idle" })}
        className="text-slate-400 hover:underline"
      >
        dismiss
      </button>
    </span>
  );
}
