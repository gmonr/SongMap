"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseFocus } from "@/lib/song/selection";
import type { SongRow } from "@/lib/song/types";
import {
  KEYS,
  parseKey,
  shiftKey,
  type Notation,
} from "@/lib/song/theory";
import { clearSpotifyLink } from "@/app/songs/spotify-actions";
import { barIndexAt } from "@/lib/song/playback";
import { isSpotifyConfigured } from "@/lib/spotify/env";
import { normalizeSync, type SpotifySyncData } from "@/lib/spotify/sync";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { PlaybackBar } from "./PlaybackBar";
import { SectionCard } from "./SectionCard";
import { SpotifyBar } from "./SpotifyBar";
import { SpotifyLinkDialog } from "./SpotifyLinkDialog";
import { usePlayback } from "./usePlayback";
import { useSpotifyPlayback } from "./useSpotifyPlayback";

/** Which engine the docked transport is driving. */
type PlaybackSource = null | "synth" | "spotify";

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
  practiceHref,
  reshapeHref,
  focus,
}: {
  song: SongRow;
  editHref?: string;
  practiceHref?: string;
  reshapeHref?: string;
  /** ?focus= handoff from reshape: scroll to this bar and flash it. */
  focus?: string;
}) {
  const songKey = song.key || "C";
  const [displayKey, setDisplayKey] = useState(songKey);
  const [notation, setNotation] = useState<Notation>("letters");
  const [showLyrics, setShowLyrics] = useState(true);
  const [source, setSource] = useState<PlaybackSource>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  // The Spotify link, locally editable so linking/unlinking applies without
  // waiting for a server re-render of the song row.
  const [link, setLink] = useState<{
    trackId: string | null;
    sync: SpotifySyncData | null;
  }>(() => ({
    trackId: song.spotify_track_id ?? null,
    sync: song.spotify_sync ? normalizeSync(song.spotify_sync) : null,
  }));
  const pb = usePlayback(song, displayKey);
  const sp = useSpotifyPlayback(
    song,
    link.trackId,
    link.sync,
    source === "spotify"
  );
  // Spotify mode needs somewhere to save the link/anchors.
  const spotifyEnabled = isSpotifyConfigured && isSupabaseConfigured;

  const openSynth = () => {
    if (source === "spotify") sp.stop();
    setSource("synth");
  };
  const openSpotify = () => {
    if (source === "synth") pb.stop();
    setSource("spotify");
  };
  const closePlayback = () => {
    if (source === "synth") pb.stop();
    if (source === "spotify") sp.stop();
    setSource(null);
  };

  // Engine hand-offs from the docked bars: no scrolling back to the header,
  // and mid-song the other engine picks up from the same bar. Read the
  // position BEFORE stop() — it nulls the playhead. When idle/paused the
  // other transport just opens stopped.
  const switchToSpotify = () => {
    if (!link.trackId) {
      setLinkDialogOpen(true);
      return;
    }
    const idx = pb.barNumber - 1;
    const wasPlaying = pb.status === "playing";
    pb.stop();
    setSource("spotify");
    if (wasPlaying && idx >= 0) sp.playFromBar(idx);
  };
  const switchToSynth = () => {
    const idx = sp.barNumber - 1;
    const wasPlaying = sp.status === "playing";
    sp.stop();
    setSource("synth");
    // No count-in: the hand-off continues playback, it doesn't restart it.
    if (wasPlaying && idx >= 0) pb.playFromBar(idx, { noCountIn: true });
  };

  const { tonic: displayTonic, minor } = parseKey(displayKey);

  // "same as Verse 1" labels: first arrangement instance of each section.
  const firstInstanceLabel = new Map<string, string>();
  for (const item of song.data.arrangement) {
    if (!firstInstanceLabel.has(item.ref)) {
      firstInstanceLabel.set(item.ref, item.instanceLabel);
    }
  }

  // Landing back from reshape: flash the bar in the section's first
  // full instance (prefer it over same-as instances, which are the
  // derived copies).
  const focusAnchor = parseFocus(focus);
  let focusIndex = -1;
  if (focusAnchor) {
    const items = song.data.arrangement;
    focusIndex = items.findIndex(
      (it) => it.ref === focusAnchor.sectionId && !it.sameChordsAs
    );
    if (focusIndex === -1) {
      focusIndex = items.findIndex((it) => it.ref === focusAnchor.sectionId);
    }
  }

  // One flash per handoff: drop ?focus= so refresh/back doesn't replay it.
  useEffect(() => {
    if (focus) window.history.replaceState(null, "", window.location.pathname);
  }, [focus]);

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

        <button
          type="button"
          onClick={() => {
            openSynth();
            if (pb.status === "stopped") pb.play();
          }}
          className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
        >
          ▶ Play
        </button>

        {spotifyEnabled && (
          <button
            type="button"
            title="Play the real recording to verify the map"
            onClick={() => {
              if (link.trackId) openSpotify();
              else setLinkDialogOpen(true);
            }}
            className="rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-100"
          >
            ♫ Spotify
          </button>
        )}

        {practiceHref && (
          <Link
            href={practiceHref}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Practice
          </Link>
        )}

        {reshapeHref && (
          <Link
            href={reshapeHref}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Reshape
          </Link>
        )}

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
            focusBar={
              i === focusIndex && focusAnchor
                ? { li: focusAnchor.li, bi: focusAnchor.bi }
                : undefined
            }
            playheadBar={(() => {
              const cur = source === "spotify" ? sp.current : pb.current;
              return cur && cur.arrIdx === i
                ? { li: cur.li, bi: cur.bi }
                : undefined;
            })()}
            onPlayFromHere={
              source === "spotify"
                ? () => sp.playFromItem(i)
                : source === "synth"
                  ? () => pb.playFromItem(i)
                  : undefined
            }
            onChordTap={(li, bi, ci) => {
              if (source === "spotify") {
                // Calibrating: a tap ARMS the bar for anchoring instead of
                // seeking, so you can pick a target without losing position.
                if (sp.calibrating) {
                  const idx = barIndexAt(sp.timeline, i, li, bi);
                  if (idx !== -1) sp.armBeat(sp.timeline.bars[idx].startBeat);
                } else {
                  sp.playFromChord(i, li, bi, ci);
                }
              } else {
                openSynth();
                pb.playFromChord(i, li, bi, ci);
              }
            }}
          />
        );
      })}

      {/* Clearance so the docked transport never hides the last section. */}
      {source !== null && <div className="h-28" aria-hidden />}
      {source === "synth" && (
        <PlaybackBar
          pb={pb}
          sectionLabel={
            pb.current
              ? song.data.arrangement[pb.current.arrIdx]?.instanceLabel ?? null
              : null
          }
          onClose={closePlayback}
          onSwitch={spotifyEnabled ? switchToSpotify : undefined}
        />
      )}
      {source === "spotify" && (
        <SpotifyBar
          sp={sp}
          song={song}
          onClose={closePlayback}
          onSwitch={switchToSynth}
          onUnlink={() => {
            if (!window.confirm("Unlink this track and delete its anchors?")) {
              return;
            }
            closePlayback();
            setLink({ trackId: null, sync: null });
            void clearSpotifyLink(song.id);
          }}
        />
      )}

      {linkDialogOpen && (
        <SpotifyLinkDialog
          songId={song.id}
          title={song.title}
          artist={song.artist}
          onClose={() => setLinkDialogOpen(false)}
          onLinked={(trackId, sync) => {
            setLink({ trackId, sync });
            setLinkDialogOpen(false);
            openSpotify();
          }}
        />
      )}
    </div>
  );
}
