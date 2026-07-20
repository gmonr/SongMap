"use client";

import { useState } from "react";
import { MapControls } from "@/components/song-map/MapControls";
import { SectionCard } from "@/components/song-map/SectionCard";
import { isMasked } from "@/lib/song/practice";
import type { Notation } from "@/lib/song/theory";
import { firstInstanceLabels, type SongRow } from "@/lib/song/types";

const MASK_LEVELS = [0, 25, 50, 75, 100] as const;

/**
 * Progressive hiding: a chosen percentage of bars render as click-to-reveal
 * placeholders instead of their chord/lyric content, so you can test recall
 * before checking yourself. "Shuffle" re-randomizes which bars are hidden at
 * the current level; raising the level is how you ramp up difficulty.
 */
export function ProgressiveHideView({ song }: { song: SongRow }) {
  const songKey = song.key || "C";
  const [displayKey, setDisplayKey] = useState(songKey);
  const [notation, setNotation] = useState<Notation>("letters");
  const [showLyrics, setShowLyrics] = useState(true);
  const [maskPercent, setMaskPercent] = useState<number>(50);
  const [seed, setSeed] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const reshuffle = () => {
    setSeed((s) => s + 1);
    setRevealed(new Set());
  };

  const setLevel = (percent: number) => {
    setMaskPercent(percent);
    setRevealed(new Set());
  };

  const firstInstanceLabel = firstInstanceLabels(song.data.arrangement);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-500">Hide</span>
          <div
            role="group"
            aria-label="Hide percentage"
            className="flex overflow-hidden rounded-md border border-slate-300"
          >
            {MASK_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setLevel(level)}
                className={`px-2.5 py-1 text-sm font-semibold ${
                  maskPercent === level
                    ? "bg-slate-800 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {level}%
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={reshuffle}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          ⤾ Shuffle
        </button>

        <span className="flex-1" />

        <MapControls
          songKey={songKey}
          displayKey={displayKey}
          onDisplayKey={setDisplayKey}
          notation={notation}
          onNotation={setNotation}
          showLyrics={showLyrics}
          onShowLyrics={setShowLyrics}
        />
      </div>

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
            isBarMasked={(li, bi) => {
              const key = `${i}-${li}-${bi}`;
              return !revealed.has(key) && isMasked(seed, key, maskPercent);
            }}
            onRevealBar={(li, bi) => {
              const key = `${i}-${li}-${bi}`;
              setRevealed((prev) => new Set(prev).add(key));
            }}
          />
        );
      })}
    </div>
  );
}
