"use client";

import { useState } from "react";
import { lookupSyncedLyrics } from "@/app/songs/lyrics-actions";
import {
  alignLyrics,
  placementMismatches,
  songWordStream,
  suggestPhraseFill,
  type PhraseFill,
  type PlacementMismatch,
} from "@/lib/lyrics-sync/align";
import { applyPhraseFill } from "@/lib/lyrics-sync/apply";
import { buildTimeline } from "@/lib/song/playback";
import { beatsPerBar, type SongData, type SongRow } from "@/lib/song/types";
import {
  emptySync,
  type SpotifySyncData,
} from "@/lib/spotify/sync";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "result";
      matchedTitle: string;
      matchedArtist: string;
      fills: PhraseFill[];
      mismatches: PlacementMismatch[];
    };

const MISMATCH_PREVIEW = 6;

/**
 * Reshape's Lyrics-mode bridge to LRCLIB: an explicit "check" tap (the
 * lookup sends title/artist off-box, so it never auto-fires) that either
 * offers to fill empty bars from the synced lyrics — applied through the
 * host's applyData, so it's one undoable step — or reports which lines
 * are sung in a different bar than they're placed. Nothing applies
 * without a tap, and existing lyrics are never overwritten.
 */
export function PhraseSyncBanner({
  song,
  data,
  sync,
  onApplyFills,
}: {
  song: SongRow;
  /** The current draft (not the saved row) so suggestions track edits. */
  data: SongData;
  sync: SpotifySyncData | null;
  onApplyFills: (next: SongData) => void;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  const check = async () => {
    setState({ kind: "loading" });
    let res;
    try {
      res = await lookupSyncedLyrics(
        song.artist ?? "",
        song.title,
        sync?.track?.durationMs ?? null
      );
    } catch {
      res = { ok: false as const, error: "Lookup failed — try again." };
    }
    if (!res.ok) {
      setState({ kind: "error", message: res.error });
      return;
    }
    const timeline = buildTimeline(data, beatsPerBar(song.time_signature));
    const effSync = sync ?? emptySync();
    const bpm = song.tempo || 100;
    const { fills } = suggestPhraseFill(data, timeline, effSync, bpm, res.lines);
    const mismatches = placementMismatches(
      alignLyrics(songWordStream(data, timeline), res.lines),
      timeline,
      effSync,
      bpm
    );
    setState({
      kind: "result",
      matchedTitle: res.matchedTitle,
      matchedArtist: res.matchedArtist,
      fills,
      mismatches,
    });
  };

  if (state.kind === "idle" || state.kind === "loading") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        Compare the map against the recording&apos;s synced lyrics.{" "}
        <button
          type="button"
          onClick={check}
          disabled={state.kind === "loading"}
          title="Sends the title/artist to LRCLIB's public API"
          className="font-semibold text-blue-600 hover:underline disabled:text-slate-300"
        >
          {state.kind === "loading"
            ? "checking…"
            : "Check synced lyrics (LRCLIB)"}
        </button>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        {state.message}{" "}
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="font-semibold text-blue-600 hover:underline"
        >
          ok
        </button>
      </div>
    );
  }

  const { matchedTitle, matchedArtist, fills, mismatches } = state;
  return (
    <div className="space-y-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-slate-600">
      <p>
        LRCLIB matched{" "}
        <b className="font-semibold">
          {matchedTitle} — {matchedArtist}
        </b>
        {fills.length > 0
          ? `: ${fills.length} empty bar${
              fills.length === 1 ? "" : "s"
            } could take its lines (timing is rough — vocal onsets, not downbeats).`
          : mismatches.length > 0
            ? "."
            : ": the lyrics already agree with the recording's timing."}{" "}
        {fills.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onApplyFills(applyPhraseFill(data, fills));
              setState({ kind: "idle" });
            }}
            className="rounded-md bg-blue-600 px-2 py-0.5 font-bold text-white hover:bg-blue-700"
          >
            Fill {fills.length} bar{fills.length === 1 ? "" : "s"}
          </button>
        )}{" "}
        <button
          type="button"
          onClick={() => setState({ kind: "idle" })}
          className="text-slate-400 hover:underline"
        >
          dismiss
        </button>
      </p>
      {mismatches.length > 0 && (
        <div>
          <p className="font-semibold text-slate-700">
            {mismatches.length} line{mismatches.length === 1 ? "" : "s"} sung
            in a different bar than placed:
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {mismatches.slice(0, MISMATCH_PREVIEW).map((m) => (
              <li key={m.lineIdx} className="truncate">
                “{m.text}” — placed in bar {m.currentBarNumber}, sung in bar{" "}
                {m.suggestedBarNumber}
              </li>
            ))}
            {mismatches.length > MISMATCH_PREVIEW && (
              <li className="text-slate-400">
                …and {mismatches.length - MISMATCH_PREVIEW} more
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
