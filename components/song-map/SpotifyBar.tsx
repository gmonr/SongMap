"use client";

import { usePathname } from "next/navigation";
import { formatMs } from "@/lib/spotify/search";
import type { SongRow } from "@/lib/song/types";
import type { SpotifyPlayback } from "./useSpotifyPlayback";

/**
 * The Spotify verification transport, docked like PlaybackBar. Row one is
 * the transport + where-am-I readout; row two is the device picker and the
 * calibrate disclosure (tap-the-downbeat anchors with ±ms nudges).
 */
export function SpotifyBar({
  sp,
  song,
  onClose,
  onUnlink,
}: {
  sp: SpotifyPlayback;
  song: SongRow;
  onClose: () => void;
  onUnlink: () => void;
}) {
  const pathname = usePathname();
  const totalBars = sp.timeline.bars.length;
  const squareBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg disabled:cursor-default disabled:text-slate-300";
  const smallBtn =
    "rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50";
  const toggleCls = (on: boolean) =>
    `rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
      on
        ? "bg-green-50 text-green-700 ring-green-200"
        : "bg-white text-slate-400 ring-slate-200"
    }`;

  const labelOfBeat = (beat: number): string => {
    const idx = sp.timeline.bars.findIndex(
      (b) => beat >= b.startBeat && beat < b.startBeat + b.beats
    );
    const bar = sp.timeline.bars[idx];
    if (!bar) return `beat ${beat}`;
    const section = song.data.arrangement[bar.arrIdx]?.instanceLabel;
    return `bar ${idx + 1}${section ? ` · ${section}` : ""}`;
  };

  const sectionLabel = sp.current
    ? song.data.arrangement[sp.current.arrIdx]?.instanceLabel ?? null
    : null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
      {sp.connected === false ? (
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-slate-600">
            Connect Spotify to play the recording from any bar (Premium
            required for playback control).
          </p>
          <a
            href={`/api/spotify/login?next=${encodeURIComponent(pathname)}`}
            className="shrink-0 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Connect Spotify
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Spotify playback"
            className={`${squareBtn} text-slate-400 hover:bg-slate-100 hover:text-slate-600`}
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          {sp.error && (
            <p className="mx-auto max-w-5xl px-4 pt-2 text-xs font-medium text-red-600">
              {sp.error}
            </p>
          )}
          <div className="mx-auto flex max-w-5xl items-center gap-1.5 px-4 py-2">
            <button
              type="button"
              onClick={sp.toggle}
              aria-label={sp.status === "playing" ? "Pause" : "Play"}
              className="flex h-11 w-14 shrink-0 items-center justify-center rounded-lg bg-green-600 text-lg font-bold text-white hover:bg-green-700 active:bg-green-800"
            >
              {sp.status === "playing" ? "❙❙" : "▶"}
            </button>
            <button
              type="button"
              onClick={sp.stop}
              disabled={sp.status === "stopped"}
              aria-label="Stop"
              className={`${squareBtn} text-slate-500 hover:bg-slate-100`}
            >
              ■
            </button>
            <button
              type="button"
              onClick={() => sp.skipSection(-1)}
              disabled={sp.status === "stopped"}
              aria-label="Previous section"
              className={`${squareBtn} text-slate-500 hover:bg-slate-100`}
            >
              ⏮︎
            </button>
            <button
              type="button"
              onClick={() => sp.skipSection(1)}
              disabled={sp.status === "stopped"}
              aria-label="Next section"
              className={`${squareBtn} text-slate-500 hover:bg-slate-100`}
            >
              ⏭︎
            </button>
            <div className="min-w-0 flex-1 text-right">
              {sp.current ? (
                <>
                  <p className="truncate text-sm font-bold">{sectionLabel}</p>
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
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Spotify playback"
              className={`${squareBtn} text-slate-400 hover:bg-slate-100 hover:text-slate-600`}
            >
              ✕
            </button>
          </div>

          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1.5 px-4 pb-2">
            <select
              aria-label="Spotify device"
              value={sp.deviceId ?? ""}
              onChange={(e) => sp.pickDevice(e.target.value)}
              onFocus={() => {
                if (sp.devices.length === 0) sp.refreshDevices();
              }}
              className="max-w-40 truncate rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value="" disabled>
                {sp.devices.length === 0 ? "no devices" : "pick device"}
              </option>
              {sp.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={sp.refreshDevices}
              aria-label="Refresh devices"
              title="Refresh devices"
              className={smallBtn}
            >
              ⟳
            </button>
            <span className="flex-1" />
            {sp.sync.anchors.length === 0 && !sp.calibrating && (
              <span className="text-[11px] text-amber-600">
                not synced — calibrate bar 1
              </span>
            )}
            <button
              type="button"
              onClick={() => sp.setCalibrating(!sp.calibrating)}
              aria-pressed={sp.calibrating}
              className={toggleCls(sp.calibrating)}
            >
              calibrate
            </button>
          </div>

          {sp.calibrating && (
            <div className="mx-auto max-w-5xl space-y-2 border-t border-slate-100 px-4 py-2">
              <p className="text-[11px] text-slate-500">
                Tap a bar on the map to arm it (bar 1 is armed by default),
                play into it, then stamp the moment you hear its downbeat.
                Nudge until the click of your ear and the map agree.
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
              <button
                type="button"
                onClick={onUnlink}
                className="text-[11px] text-slate-400 hover:text-red-600 hover:underline"
              >
                unlink this track
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
