import type { Timeline, TimelineBar } from "@/lib/song/playback";

/**
 * The transport subset both playback hooks expose (usePlayback and
 * useSpotifyPlayback satisfy this structurally — no adapters), so one
 * TransportRow can drive either engine.
 */
export interface TransportControls {
  timeline: Timeline;
  status: "stopped" | "playing" | "paused";
  current: TimelineBar | null;
  barNumber: number;
  toggle: () => void;
  stop: () => void;
  skipSection: (dir: -1 | 1) => void;
}

/** Which engine a transport surface is driving. */
export type TransportSource = "synth" | "spotify";

export const squareBtn =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg disabled:cursor-default disabled:text-slate-300";

export const smallBtn =
  "rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50";

/** Pill-toggle classes in the source's accent color. */
export function toggleCls(on: boolean, source: TransportSource): string {
  const onCls =
    source === "spotify"
      ? "bg-green-50 text-green-700 ring-green-200"
      : "bg-blue-50 text-blue-700 ring-blue-200";
  return `rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
    on ? onCls : "bg-white text-slate-400 ring-slate-200"
  }`;
}
