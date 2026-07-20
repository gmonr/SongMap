"use client";

import { useState } from "react";
import { lookupSyncedLyrics } from "@/app/songs/lyrics-actions";
import {
  alignLyrics,
  effectiveLyricSync,
  MAX_SHIFT_BARS,
  placementMismatches,
  songWordStream,
  suggestPhraseFill,
  type PhraseFill,
  type PlacementMismatch,
} from "@/lib/lyrics-sync/align";
import { applyPhraseFill, applyPlacementShifts } from "@/lib/lyrics-sync/apply";
import type { LrcLine } from "@/lib/lyrics-sync/lrc";
import { buildTimeline } from "@/lib/song/playback";
import { beatsPerBar, type SongData, type SongRow } from "@/lib/song/types";
import { emptySync, type SpotifySyncData } from "@/lib/spotify/sync";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  /** Matched, but no trustworthy beats↔ms grid to compare timing against. */
  | { kind: "unsynced"; matchedTitle: string; matchedArtist: string }
  | {
      kind: "result";
      matchedTitle: string;
      matchedArtist: string;
      fills: PhraseFill[];
      /** Mismatches within the auto-shift cap. */
      mismatches: PlacementMismatch[];
      /** Lines disagreeing by more than the cap — reported, never moved. */
      farOff: number;
      /** The parsed LRC, kept so applying can re-derive against the
       *  then-current draft instead of a stale snapshot. */
      lrcLines: LrcLine[];
    };

const MISMATCH_PREVIEW = 6;

/**
 * Reshape's Lyrics-mode bridge to LRCLIB: an explicit "check" tap (the
 * lookup sends title/artist off-box, so it never auto-fires) that offers
 * to fill empty bars from the synced lyrics, and to shift mismatched
 * lines to their sung bar — both through the host's applyData, so each is
 * one undoable step. Nothing applies without a tap, existing lyrics are
 * never overwritten, and nothing at all is offered without a trustworthy
 * timing grid (real calibration, or a tempo line fitted from the lyric
 * alignment itself — see effectiveLyricSync): the naive "recording starts
 * at bar 1 at the stored BPM" assumption misplaces everything for any
 * song with an intro.
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
    const matches = alignLyrics(songWordStream(data, timeline), res.lines);
    const effSync = effectiveLyricSync(sync ?? emptySync(), matches);
    if (!effSync) {
      setState({
        kind: "unsynced",
        matchedTitle: res.matchedTitle,
        matchedArtist: res.matchedArtist,
      });
      return;
    }
    const bpm = song.tempo || 100;
    const { fills } = suggestPhraseFill(data, timeline, effSync, bpm, res.lines);
    const all = placementMismatches(matches, timeline, effSync, bpm);
    const mismatches = all.filter(
      (m) =>
        Math.abs(m.suggestedBarNumber - m.currentBarNumber) <= MAX_SHIFT_BARS
    );
    setState({
      kind: "result",
      matchedTitle: res.matchedTitle,
      matchedArtist: res.matchedArtist,
      fills,
      mismatches,
      farOff: all.length - mismatches.length,
      lrcLines: res.lines,
    });
  };

  // Recompute against the current draft at tap time — the map may have
  // been edited since the check ran, and the op no-ops when it agrees.
  const shiftToMatch = (lrcLines: LrcLine[]) => {
    const timeline = buildTimeline(data, beatsPerBar(song.time_signature));
    const effSync = effectiveLyricSync(
      sync ?? emptySync(),
      alignLyrics(songWordStream(data, timeline), lrcLines)
    );
    if (effSync) {
      const next = applyPlacementShifts(
        data,
        timeline,
        effSync,
        song.tempo || 100,
        lrcLines
      );
      if (next !== data) onApplyFills(next);
    }
    setState({ kind: "idle" });
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

  if (state.kind === "unsynced") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        LRCLIB matched{" "}
        <b className="font-semibold text-slate-600">
          {state.matchedTitle} — {state.matchedArtist}
        </b>
        , but there&apos;s no reliable timing grid to compare against yet —
        the song isn&apos;t calibrated and too few lyric lines align to
        infer one. Calibrate on the song map (♫ → calibrate, or ✨ Suggest
        from lyrics there), then re-check.{" "}
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

  const { matchedTitle, matchedArtist, fills, mismatches, farOff, lrcLines } =
    state;
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
          : mismatches.length > 0 || farOff > 0
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
            in a different bar than placed:{" "}
            <button
              type="button"
              onClick={() => shiftToMatch(lrcLines)}
              title={`Move each line's words to the bar the recording sings them in (shifts of up to ${MAX_SHIFT_BARS} bars; one undoable step)`}
              className="rounded-md bg-blue-600 px-2 py-0.5 font-bold text-white hover:bg-blue-700"
            >
              Shift them to match
            </button>
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
      {farOff > 0 && (
        <p className="text-slate-500">
          {farOff} line{farOff === 1 ? "" : "s"} disagree by more than{" "}
          {MAX_SHIFT_BARS} bars — left alone (that usually means a structure
          or calibration problem, not a misplaced phrase).
        </p>
      )}
    </div>
  );
}
