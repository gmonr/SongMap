"use client";

import type { ReactNode } from "react";
import { Play } from "@/components/icons";
import {
  squareBtn,
  type TransportControls,
  type TransportSource,
} from "./transport-types";

/**
 * The shared transport row of the docked playback bar: play/pause (accent
 * color per source), stop, section skips, a source-specific readout, close.
 */
export function TransportRow({
  t,
  source,
  readout,
  onClose,
}: {
  t: TransportControls;
  source: TransportSource;
  /** The flexible middle area (count-in pulse, bar/section, position). */
  readout: ReactNode;
  onClose: () => void;
}) {
  const accent =
    source === "spotify"
      ? "bg-green-600 hover:bg-green-700 active:bg-green-800"
      : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800";
  return (
    <div className="mx-auto flex max-w-5xl items-center gap-1.5 px-4 py-2">
      <button
        type="button"
        onClick={t.toggle}
        aria-label={t.status === "playing" ? "Pause" : "Play"}
        className={`flex h-11 w-14 shrink-0 items-center justify-center rounded-lg text-lg font-bold text-white ${accent}`}
      >
        {t.status === "playing" ? "❙❙" : <Play className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={t.stop}
        disabled={t.status === "stopped"}
        aria-label="Stop"
        className={`${squareBtn} text-slate-500 hover:bg-slate-100`}
      >
        ■
      </button>
      <button
        type="button"
        onClick={() => t.skipSection(-1)}
        disabled={t.status === "stopped"}
        aria-label="Previous section"
        className={`${squareBtn} text-slate-500 hover:bg-slate-100`}
      >
        ⏮︎
      </button>
      <button
        type="button"
        onClick={() => t.skipSection(1)}
        disabled={t.status === "stopped"}
        aria-label="Next section"
        className={`${squareBtn} text-slate-500 hover:bg-slate-100`}
      >
        ⏭︎
      </button>
      <div className="min-w-0 flex-1 text-right">{readout}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close playback"
        className={`${squareBtn} text-slate-400 hover:bg-slate-100 hover:text-slate-600`}
      >
        ✕
      </button>
    </div>
  );
}
