"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveSpotifySync } from "@/app/songs/spotify-actions";
import {
  barIndexAt,
  buildTimeline,
  firstBarOfItem,
  type Timeline,
  type TimelineBar,
} from "@/lib/song/playback";
import { beatsPerBar, type SongRow } from "@/lib/song/types";
import {
  getDevices,
  getPlayerState,
  pausePlayback,
  playTrack,
  resumePlayback,
  seek,
  SpotifyApiError,
  type SpotifyDevice,
} from "@/lib/spotify/api";
import {
  barIndexAtMs,
  beatToMs,
  normalizeSync,
  withAnchor,
  withNudgedAnchor,
  withoutAnchor,
  type SpotifySyncData,
} from "@/lib/spotify/sync";
import { getAccessToken, invalidateAccessToken } from "@/lib/spotify/token";

export type SpotifyStatus = "stopped" | "playing" | "paused";

export interface SpotifyPlayback {
  timeline: Timeline;
  status: SpotifyStatus;
  /** Playhead: the bar sounding in the recording right now, or null. */
  current: TimelineBar | null;
  barNumber: number;
  /** Extrapolated recording position (second granularity) for the readout. */
  positionMs: number | null;
  durationMs: number | null;
  /** null = not checked yet; false = show the Connect button. */
  connected: boolean | null;
  error: string | null;
  devices: SpotifyDevice[];
  deviceId: string | null;
  sync: SpotifySyncData;

  play: () => void;
  playFromItem: (arrIdx: number) => void;
  /** Seek the recording to timeline bar `idx`'s downbeat and play. */
  playFromBar: (idx: number) => void;
  playFromChord: (arrIdx: number, li: number, bi: number, ci: number) => void;
  toggle: () => void;
  stop: () => void;
  skipSection: (dir: -1 | 1) => void;
  pickDevice: (id: string) => void;
  refreshDevices: () => void;

  /** Calibration: while on, map taps ARM a bar instead of seeking. */
  calibrating: boolean;
  setCalibrating: (on: boolean) => void;
  /** Beat of the bar being calibrated (bar 1 = 0), or null. */
  armedBeat: number | null;
  armBeat: (beat: number) => void;
  /** Seek a few seconds before the armed bar's estimated downbeat. */
  playBeforeArmed: () => void;
  /** Stamp "the armed bar's downbeat is sounding right NOW". */
  stampArmed: () => void;
  nudgeAnchor: (index: number, deltaMs: number) => void;
  removeAnchor: (index: number) => void;
}

const POLL_MS = 1000;
const TICK_MS = 150;
/** Lead-in before an armed bar so the ear can lock onto its downbeat. */
const PREROLL_MS = 3000;
const SAVE_DEBOUNCE_MS = 800;

/**
 * Spotify verification playback for one song: seeks the linked recording to
 * tapped bars via the anchor mapping (lib/spotify/sync.ts), follows the
 * playhead by polling the player and extrapolating between polls, and owns
 * the calibration state. Audio plays on whatever Spotify Connect device the
 * user has open — this hook only sends commands.
 */
export function useSpotifyPlayback(
  song: SongRow,
  trackId: string | null,
  initialSync: SpotifySyncData | null,
  active: boolean
): SpotifyPlayback {
  const fallbackBeats = beatsPerBar(song.time_signature);
  const timeline = useMemo(
    () => buildTimeline(song.data, fallbackBeats),
    [song.data, fallbackBeats]
  );
  const tempo = song.tempo || 100;

  const [status, setStatus] = useState<SpotifyStatus>("stopped");
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [posSec, setPosSec] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sync, setSync] = useState<SpotifySyncData>(() =>
    normalizeSync(initialSync)
  );
  const [calibrating, setCalibrating] = useState(false);
  const [armedBeat, setArmedBeat] = useState<number | null>(null);

  // Relinking to a different recording invalidates its anchors.
  const prevTrack = useRef(trackId);
  useEffect(() => {
    if (prevTrack.current !== trackId) {
      prevTrack.current = trackId;
      setSync(normalizeSync(initialSync));
      setArmedBeat(null);
    }
  }, [trackId, initialSync]);

  /** Last poll result + when it arrived, for extrapolation between polls. */
  const lastPoll = useRef<{
    positionMs: number;
    at: number;
    isPlaying: boolean;
    ourTrack: boolean;
  } | null>(null);

  // Latest values for the timers/commands without re-arming them.
  const live = useRef({ sync, deviceId, trackId, tempo, status });
  live.current = { sync, deviceId, trackId, tempo, status };

  const estimateNow = (): number | null => {
    const p = lastPoll.current;
    if (!p || !p.ourTrack) return null;
    return p.positionMs + (p.isPlaying ? performance.now() - p.at : 0);
  };

  const fail = (e: unknown) => {
    if (e instanceof SpotifyApiError) {
      if (e.reason === "NOT_CONNECTED") {
        invalidateAccessToken();
        setConnected(false);
        return;
      }
      if (e.reason === "PREMIUM_REQUIRED") {
        setError("Spotify Premium is required to control playback.");
        return;
      }
      if (e.reason === "NO_ACTIVE_DEVICE") {
        setError("Open Spotify on a device, then pick it under devices ⟳.");
        return;
      }
    }
    setError("Couldn't reach Spotify — try again in a moment.");
  };

  const token = async (): Promise<string | null> => {
    const t = await getAccessToken();
    setConnected(t !== null);
    return t;
  };

  // ---- Playhead poll + extrapolation ------------------------------------

  const applyPoll = (
    state: Awaited<ReturnType<typeof getPlayerState>>
  ): void => {
    const ours = state !== null && state.trackId === live.current.trackId;
    lastPoll.current = ours
      ? {
          positionMs: state.positionMs,
          at: performance.now(),
          isPlaying: state.isPlaying,
          ourTrack: true,
        }
      : null;
    setDurationMs(ours ? state.durationMs : null);
    if (!ours) {
      // Nothing playing, or the user switched tracks in the Spotify app.
      setStatus("stopped");
      setCurrentIdx(null);
      setPosSec(null);
    } else {
      setStatus(state.isPlaying ? "playing" : "paused");
    }
  };

  useEffect(() => {
    if (!active || !trackId) return;

    let disposed = false;
    const poll = async () => {
      const t = await getAccessToken();
      if (disposed) return;
      if (!t) {
        setConnected(false);
        return;
      }
      setConnected(true);
      try {
        const state = await getPlayerState(t);
        if (!disposed) applyPoll(state);
      } catch (e) {
        // Keep the last estimate through transient failures/429s; a 401
        // means the grant died and the UI should offer Connect again.
        if (e instanceof SpotifyApiError && e.reason === "NOT_CONNECTED") {
          invalidateAccessToken();
          if (!disposed) setConnected(false);
        }
      }
    };

    void poll();
    void refreshDevices();
    const pollTimer = setInterval(() => void poll(), POLL_MS);

    // Extrapolate between polls; only touch state when the bar/second flips.
    const tick = () => {
      const est = estimateNow();
      if (est === null) return;
      const idx = barIndexAtMs(
        timeline,
        live.current.sync,
        est,
        live.current.tempo
      );
      setCurrentIdx((prev) => (prev === idx ? prev : idx));
      const sec = Math.floor(est / 1000);
      setPosSec((prev) => (prev === sec ? prev : sec));
    };
    const tickTimer = setInterval(tick, TICK_MS);

    // Tab throttling pauses the timers; re-sync the moment we're visible.
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      clearInterval(pollTimer);
      clearInterval(tickTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, trackId, timeline]);

  // ---- Commands ----------------------------------------------------------

  const refreshDevices = async (): Promise<SpotifyDevice[]> => {
    const t = await token();
    if (!t) return [];
    try {
      const list = await getDevices(t);
      setDevices(list);
      // Follow Spotify's notion of the active device unless the user chose.
      if (!live.current.deviceId) {
        const activeDev = list.find((d) => d.isActive) ?? null;
        if (activeDev) setDeviceId(activeDev.id);
      }
      return list;
    } catch (e) {
      fail(e);
      return [];
    }
  };

  /** Start our track at `ms`, seeking in place when it's already up. */
  const startAtMs = async (ms: number): Promise<void> => {
    const id = live.current.trackId;
    if (!id) return;
    const t = await token();
    if (!t) return;
    setError(null);
    try {
      const p = lastPoll.current;
      if (p?.ourTrack) {
        // Already on our track: an in-place seek is faster than /play and
        // keeps the queue; resume if it was paused.
        await seek(t, ms);
        if (!p.isPlaying) await resumePlayback(t);
      } else {
        await playTrack(t, id, ms, live.current.deviceId ?? undefined);
      }
      // Optimistic playhead so the map responds before the next poll.
      lastPoll.current = {
        positionMs: ms,
        at: performance.now(),
        isPlaying: true,
        ourTrack: true,
      };
      setStatus("playing");
    } catch (e) {
      // No active device but exactly one is available: just use it.
      if (e instanceof SpotifyApiError && e.reason === "NO_ACTIVE_DEVICE") {
        const list = await refreshDevices();
        if (list.length === 1) {
          setDeviceId(list[0].id);
          try {
            await playTrack(t, id, ms, list[0].id);
            lastPoll.current = {
              positionMs: ms,
              at: performance.now(),
              isPlaying: true,
              ourTrack: true,
            };
            setStatus("playing");
            return;
          } catch (retryErr) {
            fail(retryErr);
            return;
          }
        }
      }
      fail(e);
    }
  };

  const playFromBeat = (beat: number) =>
    void startAtMs(beatToMs(live.current.sync, beat, live.current.tempo));

  const playFromItem = (arrIdx: number) => {
    const idx = firstBarOfItem(timeline, arrIdx);
    if (idx !== -1) playFromBeat(timeline.bars[idx].startBeat);
  };

  const playFromChord = (
    arrIdx: number,
    li: number,
    bi: number,
    ci: number
  ) => {
    const idx = barIndexAt(timeline, arrIdx, li, bi);
    if (idx === -1) return;
    const chord = timeline.bars[idx].chords[ci];
    playFromBeat(chord?.startBeat ?? timeline.bars[idx].startBeat);
  };

  const pause = async () => {
    const t = await token();
    if (!t) return;
    try {
      await pausePlayback(t);
      const p = lastPoll.current;
      if (p?.ourTrack) {
        lastPoll.current = {
          ...p,
          positionMs: estimateNow() ?? p.positionMs,
          at: performance.now(),
          isPlaying: false,
        };
      }
      setStatus("paused");
    } catch (e) {
      fail(e);
    }
  };

  const resume = async () => {
    const t = await token();
    if (!t) return;
    try {
      await resumePlayback(t);
      const p = lastPoll.current;
      if (p?.ourTrack) {
        lastPoll.current = { ...p, at: performance.now(), isPlaying: true };
      }
      setStatus("playing");
    } catch (e) {
      fail(e);
    }
  };

  const toggle = () => {
    if (live.current.status === "playing") void pause();
    else if (live.current.status === "paused") void resume();
    else playFromBeat(0);
  };

  const stop = () => {
    if (live.current.status === "playing") void pause();
    lastPoll.current = null;
    setStatus("stopped");
    setCurrentIdx(null);
    setPosSec(null);
  };

  const skipSection = (dir: -1 | 1) => {
    const fromArr =
      currentIdx !== null ? timeline.bars[currentIdx]?.arrIdx ?? -1 : -1;
    const arrCount = song.data.arrangement.length;
    let arrIdx = fromArr + dir;
    while (arrIdx >= 0 && arrIdx < arrCount) {
      if (firstBarOfItem(timeline, arrIdx) !== -1) {
        playFromItem(arrIdx);
        return;
      }
      arrIdx += dir;
    }
    if (dir === -1) playFromBeat(0);
  };

  // ---- Calibration -------------------------------------------------------

  // Debounced persistence; the timer ref also lets unmount flush it.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<SpotifySyncData | null>(null);
  const scheduleSave = (next: SpotifySyncData) => {
    pendingSave.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const toSave = pendingSave.current;
      pendingSave.current = null;
      if (toSave) {
        saveSpotifySync(song.id, toSave)
          .then((r) => {
            if (!r.ok) setError("Couldn't save calibration — anchors may be lost on reload.");
          })
          .catch(() => {
            setError("Couldn't save calibration — anchors may be lost on reload.");
          });
      }
    }, SAVE_DEBOUNCE_MS);
  };
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingSave.current) {
        saveSpotifySync(song.id, pendingSave.current).catch(() => {
          // Unmounting: nowhere left to surface the failure.
        });
      }
    },
    [song.id]
  );

  const updateSync = (next: SpotifySyncData) => {
    setSync(next);
    scheduleSave(next);
  };

  const playBeforeArmed = () => {
    if (armedBeat === null) return;
    const target = beatToMs(live.current.sync, armedBeat, live.current.tempo);
    void startAtMs(Math.max(0, target - PREROLL_MS));
  };

  const stampArmed = () => {
    if (armedBeat === null) return;
    const est = estimateNow();
    if (est === null) {
      setError("Play the track first, then tap on the downbeat.");
      return;
    }
    setError(null);
    updateSync(withAnchor(live.current.sync, armedBeat, est));
  };

  const nudgeAnchor = (index: number, deltaMs: number) => {
    const target = live.current.sync.anchors[index];
    const next = withNudgedAnchor(live.current.sync, index, deltaMs);
    if (!target || next === live.current.sync) return;
    updateSync(next);
    // Audition the correction: jump right to the nudged downbeat.
    const moved = next.anchors.find((a) => a.beat === target.beat);
    if (moved) void startAtMs(moved.ms);
  };

  const removeAnchor = (index: number) => {
    updateSync(withoutAnchor(live.current.sync, index));
  };

  const current =
    currentIdx !== null ? timeline.bars[currentIdx] ?? null : null;

  return {
    timeline,
    status,
    current,
    barNumber: currentIdx !== null ? currentIdx + 1 : 0,
    positionMs: posSec !== null ? posSec * 1000 : null,
    durationMs,
    connected,
    error,
    devices,
    deviceId,
    sync,
    play: () => playFromBeat(0),
    playFromItem,
    playFromBar: (idx) => {
      const bar = timeline.bars[idx];
      if (bar) playFromBeat(bar.startBeat);
    },
    playFromChord,
    toggle,
    stop,
    skipSection,
    pickDevice: setDeviceId,
    refreshDevices: () => void refreshDevices(),
    calibrating,
    setCalibrating: (on) => {
      setCalibrating(on);
      if (on && armedBeat === null) setArmedBeat(0);
    },
    armedBeat,
    armBeat: setArmedBeat,
    playBeforeArmed,
    stampArmed,
    nudgeAnchor,
    removeAnchor,
  };
}
