import type { Bar } from "@/lib/song/types";
import type { Notation } from "@/lib/song/theory";
import { ChordSym } from "./ChordSym";

function BeatDots({ count }: { count: number }) {
  return (
    <span className="flex items-center justify-center gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-slate-400"
          aria-hidden
        />
      ))}
    </span>
  );
}

/**
 * One bar of the chord grid: chord symbol(s) on top, one beat dot per beat
 * underneath (so a split bar like "F · · | C · ·" is visually obvious), and
 * the lyric phrase for this bar below.
 */
export function BarCell({
  bar,
  lyric,
  showLyrics,
  songKey,
  displayKey,
  notation,
  borderColor,
}: {
  bar: Bar;
  lyric?: string;
  showLyrics: boolean;
  songKey: string;
  displayKey: string;
  notation: Notation;
  borderColor: string;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <div
        className={`flex items-stretch justify-around rounded-md border ${borderColor} bg-white px-1 py-1.5`}
      >
        {bar.chords.map((chord, i) => (
          <div
            key={i}
            className="flex min-w-0 flex-col items-center justify-between gap-0.5"
            style={{ flexGrow: Math.max(chord.beats, 1) }}
          >
            <ChordSym
              sym={chord.sym}
              songKey={songKey}
              displayKey={displayKey}
              notation={notation}
              className="truncate text-sm font-bold sm:text-base"
            />
            <BeatDots count={Math.max(chord.beats, 1)} />
          </div>
        ))}
      </div>
      {showLyrics && (
        <p className="mt-1 min-h-4 px-0.5 text-[11px] leading-tight text-slate-600 sm:text-xs">
          {lyric ?? ""}
        </p>
      )}
    </div>
  );
}
