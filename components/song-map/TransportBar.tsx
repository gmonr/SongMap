"use client";

import { usePathname } from "next/navigation";
import { MusicNote, MusicNotes } from "@/components/icons";
import { formatMs } from "@/lib/spotify/search";
import type { SongRow } from "@/lib/song/types";
import { CalibratePanel } from "./CalibratePanel";
import { SpotifyKnobs } from "./SpotifyKnobs";
import { SynthKnobs } from "./SynthKnobs";
import { TransportRow } from "./TransportRow";
import { squareBtn, type TransportSource } from "./transport-types";
import type { Playback } from "./usePlayback";
import type { SpotifyPlayback } from "./useSpotifyPlayback";

/**
 * The one docked playback transport. Row one is the shared transport
 * (play/pause, stop, section skips, readout, close); row two starts with
 * the source segment (♪ Synth / ♫ Spotify — the in-bar engine switch,
 * shown when both engines are available) followed by the active source's
 * knobs; the calibrate disclosure docks below when open.
 */
export function TransportBar({
  source,
  pb,
  sp,
  song,
  onSwitchSource,
  onClose,
  onUnlink,
  showCalibrate = true,
  docked = true,
}: {
  source: TransportSource;
  /** Synth engine; omit where only Spotify is hosted (reshape). */
  pb?: Playback;
  /** Spotify engine; omit where only the synth is hosted. */
  sp?: SpotifyPlayback;
  song: SongRow;
  /** Hand off between engines mid-song; omit to hide the source segment. */
  onSwitchSource?: (target: TransportSource) => void;
  onClose: () => void;
  /** Unlink the Spotify track; omit to hide the action. */
  onUnlink?: () => void;
  /** Hide the calibrate tools where anchor edits don't belong (reshape). */
  showCalibrate?: boolean;
  /** false renders the rows without the fixed-bottom shell, for hosts that
   *  stack this bar with others inside their own docked wrapper. */
  docked?: boolean;
}) {
  const pathname = usePathname();

  const sectionLabelOf = (t: Playback | SpotifyPlayback): string | null =>
    t.current
      ? song.data.arrangement[t.current.arrIdx]?.instanceLabel ?? null
      : null;

  const segment = onSwitchSource && (
    <div
      role="group"
      aria-label="Playback source"
      className="flex shrink-0 overflow-hidden rounded-md border border-slate-300"
    >
      <button
        type="button"
        onClick={() => onSwitchSource("synth")}
        aria-pressed={source === "synth"}
        title="Built-in synth: metronome + chord strikes"
        className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold ${
          source === "synth"
            ? "bg-blue-600 text-white"
            : "bg-white text-slate-500 hover:bg-slate-50"
        }`}
      >
        <MusicNote className="h-4 w-4" /> Synth
      </button>
      <button
        type="button"
        onClick={() => onSwitchSource("spotify")}
        aria-pressed={source === "spotify"}
        title="The linked Spotify recording, from the same bar"
        className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold ${
          source === "spotify"
            ? "bg-green-600 text-white"
            : "bg-white text-slate-500 hover:bg-slate-50"
        }`}
      >
        <MusicNotes className="h-4 w-4" /> Spotify
      </button>
    </div>
  );

  const shell = docked
    ? "fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur"
    : undefined;
  const knobRow =
    "mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1.5 px-4 pb-2";

  if (source === "synth" && pb) {
    const totalBars = pb.timeline.bars.length;
    return (
      <div className={shell}>
        <TransportRow
          t={pb}
          source="synth"
          onClose={onClose}
          readout={
            pb.countingIn ? (
              <p className="animate-pulse text-sm font-bold text-blue-600">
                count-in…
              </p>
            ) : pb.current ? (
              <>
                <p className="truncate text-sm font-bold">
                  {sectionLabelOf(pb)}
                </p>
                <p className="text-[11px] text-slate-400">
                  bar {pb.barNumber}/{totalBars}
                </p>
              </>
            ) : (
              <p className="truncate text-[11px] text-slate-400">
                {totalBars} bars · ▶ to play
              </p>
            )
          }
        />
        <div className={knobRow}>
          {segment}
          <SynthKnobs pb={pb} />
        </div>
      </div>
    );
  }

  if (source !== "spotify" || !sp) return null;

  if (sp.connected === false) {
    return (
      <div className={shell}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-slate-600">
            Connect Spotify to play the recording from any bar (Premium
            required for playback control).
          </p>
          {segment}
          <a
            href={`/api/spotify/login?next=${encodeURIComponent(pathname)}`}
            className="shrink-0 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Connect Spotify
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close playback"
            className={`${squareBtn} text-slate-400 hover:bg-slate-100 hover:text-slate-600`}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  const totalBars = sp.timeline.bars.length;
  return (
    <div className={shell}>
      {sp.error && (
        <p className="mx-auto max-w-5xl px-4 pt-2 text-xs font-medium text-red-600">
          {sp.error}
        </p>
      )}
      <TransportRow
        t={sp}
        source="spotify"
        onClose={onClose}
        readout={
          sp.current ? (
            <>
              <p className="truncate text-sm font-bold">{sectionLabelOf(sp)}</p>
              <p className="text-[11px] tabular-nums text-slate-400">
                bar {sp.barNumber}/{totalBars}
                {sp.positionMs !== null &&
                  ` · ${formatMs(sp.positionMs)}${
                    sp.durationMs ? ` / ${formatMs(sp.durationMs)}` : ""
                  }`}
              </p>
            </>
          ) : (
            <p className="truncate text-[11px] text-slate-400">
              {sp.sync.track
                ? `♫ ${sp.sync.track.title} — ${sp.sync.track.artist}`
                : "♫ Spotify"}
              {sp.positionMs !== null && ` · ${formatMs(sp.positionMs)}`}
            </p>
          )
        }
      />
      <div className={knobRow}>
        {segment}
        <SpotifyKnobs sp={sp} showCalibrate={showCalibrate} />
      </div>
      {showCalibrate && sp.calibrating && (
        <CalibratePanel sp={sp} song={song} onUnlink={onUnlink} />
      )}
    </div>
  );
}
