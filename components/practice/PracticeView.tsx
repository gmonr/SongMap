"use client";

import Link from "next/link";
import { useState } from "react";
import type { SongRow } from "@/lib/song/types";
import { ProgressiveHideView } from "./ProgressiveHideView";
import { ShuffledSectionsView } from "./ShuffledSectionsView";

type Mode = "hide" | "shuffle";

const MODES: { value: Mode; label: string; description: string }[] = [
  {
    value: "hide",
    label: "Progressive hiding",
    description: "Bars hide behind a click-to-reveal card. Ramp up the %.",
  },
  {
    value: "shuffle",
    label: "Shuffled sections",
    description: "One section at a time, in randomized order.",
  },
];

/** The memorization practice screen: mode picker + song title, above the active drill. */
export function PracticeView({ song, songHref }: { song: SongRow; songHref: string }) {
  const [mode, setMode] = useState<Mode>("hide");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <Link href={songHref} className="text-xs text-slate-500 hover:underline">
            ← Back to song map
          </Link>
          <h1 className="truncate text-xl font-bold leading-tight">
            {song.title} <span className="font-normal text-slate-400">· Practice</span>
          </h1>
        </div>
        <span className="flex-1" />
        <div
          role="group"
          aria-label="Practice mode"
          className="flex overflow-hidden rounded-md border border-slate-300"
        >
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              title={m.description}
              onClick={() => setMode(m.value)}
              className={`px-3 py-1.5 text-sm font-semibold ${
                mode === m.value
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "hide" ? (
        <ProgressiveHideView song={song} />
      ) : (
        <ShuffledSectionsView song={song} />
      )}
    </div>
  );
}
