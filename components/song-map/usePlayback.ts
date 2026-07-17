"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  barIndexAt,
  buildTimeline,
  firstBarOfItem,
  type Timeline,
  type TimelineBar,
} from "@/lib/song/playback";
import { transposeChord } from "@/lib/song/theory";
import { beatsPerBar, type SongRow } from "@/lib/song/types";
import { PlaybackEngine, type LoopMode } from "./playback-engine";

export type PlaybackStatus = "stopped" | "playing" | "paused";

export interface Playback {
  timeline: Timeline;
  status: PlaybackStatus;
  /** Playhead: current timeline bar, or null (stopped / counting in). */
  current: TimelineBar | null;
  /** True while the count-in clicks are sounding. */
  countingIn: boolean;
  /** Playhead position as "bar n of total" (1-based; 0 when idle). */
  barNumber: number;
  tempo: number;
  songTempo: number;
  clickOn: boolean;
  chordsOn: boolean;
  countInOn: boolean;
  loop: LoopMode;
  play: () => void;
  playFromItem: (arrIdx: number) => void;
  /** Start at timeline bar `idx`; `noCountIn` for engine hand-offs, where
   *  playback is continuing rather than starting fresh. */
  playFromBar: (idx: number, opts?: { noCountIn?: boolean }) => void;
  /** Start at a tapped chord: bar (arrIdx, li, bi), chord index ci. */
  playFromChord: (arrIdx: number, li: number, bi: number, ci: number) => void;
  /** Toggle pause/resume (starts from the top when stopped). */
  toggle: () => void;
  stop: () => void;
  /** Jump to the previous/next arrangement item and keep playing. */
  skipSection: (dir: -1 | 1) => void;
  setTempo: (bpm: number) => void;
  setClickOn: (on: boolean) => void;
  setChordsOn: (on: boolean) => void;
  setCountInOn: (on: boolean) => void;
  cycleLoop: () => void;
}

const LOOP_ORDER: LoopMode[] = ["off", "section", "song"];

/**
 * Playback state + engine lifecycle for one song. The engine is created on
 * Play (inside the tap, so the AudioContext unlocks on mobile) and disposed
 * on stop/unmount. Tempo, mutes, loop mode and the display key are fed to
 * the engine through refs so changes apply mid-flight without restarting.
 */
export function usePlayback(song: SongRow, displayKey: string): Playback {
  const fallbackBeats = beatsPerBar(song.time_signature);
  const timeline = useMemo(
    () => buildTimeline(song.data, fallbackBeats),
    [song.data, fallbackBeats]
  );
  const songTempo = song.tempo || 100;

  const [status, setStatus] = useState<PlaybackStatus>("stopped");
  const [currentIdx, setCurrentIdx] = useState<number | null>(null);
  const [countingIn, setCountingIn] = useState(false);
  const [tempo, setTempo] = useState(songTempo);
  const [clickOn, setClickOn] = useState(true);
  const [chordsOn, setChordsOn] = useState(true);
  const [countInOn, setCountInOn] = useState(true);
  const [loop, setLoop] = useState<LoopMode>("off");

  const engineRef = useRef<PlaybackEngine | null>(null);
  // Where the last seek landed: skips during a count-in (currentIdx is
  // null until the first bar sounds) still step from the right section.
  const anchorArr = useRef(-1);
  const live = useRef({ tempo, loop, clickOn, chordsOn, displayKey });
  live.current = { tempo, loop, clickOn, chordsOn, displayKey };
  const songKey = song.key || "C";

  const disposeEngine = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
  };
  useEffect(() => disposeEngine, []);

  const startAt = (idx: number, skipBeats = 0, noCountIn = false) => {
    if (timeline.bars.length === 0) return;
    disposeEngine();
    const engine = new PlaybackEngine(timeline, {
      getTempo: () => live.current.tempo,
      getLoop: () => live.current.loop,
      getClickOn: () => live.current.clickOn,
      getChordsOn: () => live.current.chordsOn,
      transpose: (sym) =>
        transposeChord(sym, songKey, live.current.displayKey),
      onBar: (i) => {
        setCurrentIdx(i);
        // A null index also marks the count-in start; only a real bar
        // (or the end) means the count-in clicks are over.
        if (i !== null) setCountingIn(false);
      },
      onEnd: () => {
        disposeEngine();
        setStatus("stopped");
        setCurrentIdx(null);
        setCountingIn(false);
      },
    });
    engineRef.current = engine;
    anchorArr.current = timeline.bars[idx]?.arrIdx ?? -1;
    const countIn =
      countInOn && !noCountIn ? timeline.bars[idx]?.beats ?? 0 : 0;
    // Clear the old playhead right away so a seek doesn't leave the
    // previous bar highlighted through the count-in.
    setCurrentIdx(null);
    setCountingIn(countIn > 0);
    setStatus("playing");
    engine.start(idx, countIn, skipBeats);
  };

  const stop = () => {
    disposeEngine();
    anchorArr.current = -1;
    setStatus("stopped");
    setCurrentIdx(null);
    setCountingIn(false);
  };

  const toggle = () => {
    if (status === "playing") {
      engineRef.current?.pause();
      setStatus("paused");
    } else if (status === "paused") {
      engineRef.current?.resume();
      setStatus("playing");
    } else {
      startAt(0);
    }
  };

  const playFromItem = (arrIdx: number) => {
    const idx = firstBarOfItem(timeline, arrIdx);
    if (idx !== -1) startAt(idx);
  };

  const playFromChord = (arrIdx: number, li: number, bi: number, ci: number) => {
    const idx = barIndexAt(timeline, arrIdx, li, bi);
    if (idx === -1) return;
    const chord = timeline.bars[idx].chords[ci];
    const skip = chord ? chord.startBeat - timeline.bars[idx].startBeat : 0;
    startAt(idx, skip);
  };

  const skipSection = (dir: -1 | 1) => {
    const from =
      currentIdx !== null
        ? timeline.bars[currentIdx]?.arrIdx ?? anchorArr.current
        : anchorArr.current;
    const arrCount = song.data.arrangement.length;
    let arrIdx = from + dir;
    // Skip arrangement items with no bars (empty/missing sections).
    while (arrIdx >= 0 && arrIdx < arrCount) {
      const idx = firstBarOfItem(timeline, arrIdx);
      if (idx !== -1) {
        startAt(idx);
        return;
      }
      arrIdx += dir;
    }
    // Backing out of the first section restarts it from the top.
    if (dir === -1 && from >= 0) startAt(0);
  };

  const current = currentIdx !== null ? timeline.bars[currentIdx] ?? null : null;

  return {
    timeline,
    status,
    current,
    countingIn,
    barNumber: currentIdx !== null ? currentIdx + 1 : 0,
    tempo,
    songTempo,
    clickOn,
    chordsOn,
    countInOn,
    loop,
    play: () => startAt(0),
    playFromItem,
    playFromBar: (idx, opts) => {
      if (timeline.bars[idx]) startAt(idx, 0, opts?.noCountIn ?? false);
    },
    playFromChord,
    toggle,
    stop,
    skipSection,
    setTempo: (bpm) => setTempo(Math.min(300, Math.max(20, Math.round(bpm)))),
    setClickOn,
    setChordsOn,
    setCountInOn,
    cycleLoop: () =>
      setLoop((l) => LOOP_ORDER[(LOOP_ORDER.indexOf(l) + 1) % LOOP_ORDER.length]),
  };
}
