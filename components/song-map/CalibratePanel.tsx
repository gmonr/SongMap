"use client";

import { formatMs } from "@/lib/spotify/search";
import type { SongRow } from "@/lib/song/types";
import { AnchorSuggestion } from "@/components/lyrics-sync/AnchorSuggestion";
import type { SpotifyPlayback } from "./useSpotifyPlayback";
import { smallBtn } from "./transport-types";

/**
 * The calibrate disclosure of the Spotify transport: arm a bar, play into
 * it, stamp its downbeat, then nudge anchors by ±ms until the recording and
 * the map agree.
 */
export function CalibratePanel({
  sp,
  song,
  onUnlink,
}: {
  sp: SpotifyPlayback;
  song: SongRow;
  /** Unlink the track; omit to hide the action. */
  onUnlink?: () => void;
}) {
  const labelOfBeat = (beat: number): string => {
    const idx = sp.timeline.bars.findIndex(
      (b) => beat >= b.startBeat && beat < b.startBeat + b.beats
    );
    const bar = sp.timeline.bars[idx];
    if (!bar) return `beat ${beat}`;
    const section = song.data.arrangement[bar.arrIdx]?.instanceLabel;
    return `bar ${idx + 1}${section ? ` · ${section}` : ""}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-2 border-t border-slate-100 px-4 py-2">
      <p className="text-[11px] text-slate-500">
        Tap a bar on the map to arm it (bar 1 is armed by default), play into
        it, then stamp the moment you hear its downbeat. Nudge until the
        click of your ear and the map agree.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-700">
          {sp.armedBeat !== null
            ? `armed: ${labelOfBeat(sp.armedBeat)}`
            : "tap a bar to arm it"}
        </span>
        <button
          type="button"
          onClick={sp.playBeforeArmed}
          disabled={sp.armedBeat === null}
          className={`${smallBtn} disabled:text-slate-300`}
        >
          ▶ play into it
        </button>
        <button
          type="button"
          onClick={sp.stampArmed}
          disabled={sp.armedBeat === null}
          className="rounded-md bg-green-600 px-3 py-1 text-xs font-bold text-white hover:bg-green-700 disabled:bg-slate-200"
        >
          ⏺ downbeat is NOW
        </button>
        <AnchorSuggestion sp={sp} song={song} />
      </div>
      {sp.sync.anchors.length > 0 && (
        <ul className="space-y-1">
          {sp.sync.anchors.map((a, i) => (
            <li
              key={`${a.beat}`}
              className="flex flex-wrap items-center gap-1.5 text-xs"
            >
              <span className="w-36 truncate font-semibold text-slate-700">
                {labelOfBeat(a.beat)}
              </span>
              <span className="w-14 tabular-nums text-slate-500">
                {formatMs(a.ms)}.{String(a.ms % 1000).padStart(3, "0")}
              </span>
              {[-250, -50, +50, +250].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => sp.nudgeAnchor(i, d)}
                  className={smallBtn}
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => sp.removeAnchor(i)}
                aria-label="Delete anchor"
                className="rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {onUnlink && (
        <button
          type="button"
          onClick={onUnlink}
          className="text-[11px] text-slate-400 hover:text-red-600 hover:underline"
        >
          unlink this track
        </button>
      )}
    </div>
  );
}
