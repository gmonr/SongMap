"use client";

import { useRef, useState } from "react";
import { TAP_RESET_MS, tapBpm } from "@/lib/tempo/tap";

/**
 * A "tap" button: tap along with the song and the median inter-tap interval
 * becomes a BPM handed to `onTempo`. Going quiet for a couple of seconds
 * starts a fresh measurement.
 */
export function TapTempoButton({
  onTempo,
  className,
}: {
  onTempo: (bpm: number) => void;
  className?: string;
}) {
  const taps = useRef<number[]>([]);
  const [live, setLive] = useState<number | null>(null);

  const tap = () => {
    const now = performance.now();
    const t = taps.current;
    if (t.length > 0 && now - t[t.length - 1] > TAP_RESET_MS) t.length = 0;
    t.push(now);
    const bpm = t.length >= 3 ? tapBpm(t) : null;
    setLive(bpm);
    if (bpm !== null) onTempo(bpm);
  };

  return (
    <button
      type="button"
      onClick={tap}
      title="Tap along with the song to measure its tempo"
      className={
        className ??
        "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
      }
    >
      {live !== null ? `♩=${live}` : "tap"}
    </button>
  );
}
