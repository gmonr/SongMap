import type { Line } from "@/lib/song/types";

/**
 * A compact bar block: chord symbol(s) on top, its lyric phrase below. Small
 * enough that several fit per line, so the row structure is visible at a
 * glance — the whole point of reshaping here instead of in the big editor
 * cards. In Chords mode the syms become tap targets (`onChordTap`), with
 * `selectedChord` ringed; placeholders ("") are never tappable.
 */
export function BarChip({
  bar,
  lyric,
  selectedChord,
  onChordTap,
}: {
  bar: Line["bars"][number];
  lyric: string;
  selectedChord?: number | null;
  onChordTap?: (ci: number) => void;
}) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center">
      <div className="flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-1.5">
        {bar.chords.map((c, i) =>
          onChordTap && c.sym ? (
            <button
              key={i}
              type="button"
              onClick={() => onChordTap(i)}
              className={`truncate rounded px-0.5 text-sm font-bold ${
                selectedChord === i
                  ? "bg-blue-50 text-blue-700 ring-2 ring-blue-500"
                  : "hover:bg-slate-100"
              }`}
            >
              {c.sym}
            </button>
          ) : (
            <span
              key={i}
              className={`truncate text-sm font-bold ${
                c.sym ? "" : "text-slate-300"
              }`}
            >
              {c.sym || "—"}
            </span>
          )
        )}
      </div>
      <p className="mt-0.5 h-4 w-full truncate text-center text-[10px] leading-tight text-slate-500">
        {lyric}
      </p>
    </div>
  );
}

/** The lyric aligned to bar `barIdx` of `line`, "" when none. */
export function lyricFor(line: Line, barIdx: number): string {
  return line.lyrics.find((s) => s.bar === barIdx)?.text ?? "";
}
