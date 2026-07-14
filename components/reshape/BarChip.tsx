import type { Line } from "@/lib/song/types";

/**
 * A compact bar block: chord symbol(s) on top, its lyric phrase below. Small
 * enough that several fit per line, so the row structure is visible at a
 * glance — the whole point of reshaping here instead of in the big editor
 * cards. Split bars grow past the base width so their chords stay readable.
 * In Chords mode the syms become tap targets (`onChordTap`), with
 * `selectedChord` ringed; empty placeholders ("—") are tappable too, to
 * select-and-add a chord. In Rows mode the *whole chip* is one tap target
 * (`onTap`, ringed via `selected`) for picking up the bar itself — the two
 * are mutually exclusive, so the chip never nests buttons.
 */
export function BarChip({
  bar,
  lyric,
  selectedChord,
  onChordTap,
  selected,
  onTap,
}: {
  bar: Line["bars"][number];
  lyric: string;
  selectedChord?: number | null;
  onChordTap?: (ci: number) => void;
  /** Ring the whole chip (Rows mode's bar selection). */
  selected?: boolean;
  /** Make the whole chip one tap target; don't combine with onChordTap. */
  onTap?: () => void;
}) {
  const Root = onTap ? "button" : "div";
  return (
    <Root
      {...(onTap ? { type: "button" as const, onClick: onTap } : {})}
      className="flex w-fit min-w-16 max-w-40 shrink-0 flex-col items-center"
    >
      <div
        className={`flex w-full items-center justify-center gap-1 rounded-md border bg-white px-1 py-1 ${
          selected
            ? "border-blue-500 ring-2 ring-blue-500"
            : onTap
              ? "border-slate-200 hover:border-blue-400"
              : "border-slate-200"
        }`}
      >
        {bar.chords.map((c, i) =>
          onChordTap ? (
            <button
              key={i}
              type="button"
              onClick={() => onChordTap(i)}
              className={`min-w-0 truncate rounded px-1 py-1 text-sm font-bold ${
                selectedChord === i
                  ? "bg-blue-50 text-blue-700 ring-2 ring-blue-500"
                  : c.sym
                    ? "hover:bg-slate-100"
                    : "text-slate-300 hover:bg-slate-100"
              }`}
            >
              {c.sym || "—"}
            </button>
          ) : (
            <span
              key={i}
              className={`min-w-0 truncate py-1 text-sm font-bold ${
                c.sym ? "" : "text-slate-300"
              }`}
            >
              {c.sym || "—"}
            </span>
          )
        )}
      </div>
      {/* w-0 + min-w-full: follow the chord row's width without widening the
          fit-content chip to the lyric's own length. */}
      <p className="mt-0.5 h-4 w-0 min-w-full truncate text-center text-[10px] leading-tight text-slate-500">
        {lyric}
      </p>
    </Root>
  );
}

/** The lyric aligned to bar `barIdx` of `line`, "" when none. */
export function lyricFor(line: Line, barIdx: number): string {
  return line.lyrics.find((s) => s.bar === barIdx)?.text ?? "";
}
