"use client";

/**
 * The docked action bar for the current reshape selection. Rendered fixed at
 * the bottom of the viewport (instead of inline beside the selected chip) so
 * picking something up never reflows the bars under the user's finger, and
 * the ◀ ▶ targets are full thumb-sized. One bar serves every mode; it grows
 * more actions (edit, delete, beat dots) in later phases.
 */
export function SelectionBar({
  title,
  subtitle,
  canLeft,
  canRight,
  moveLabel,
  onMove,
  onClear,
}: {
  /** What is picked up, e.g. the chord symbol or the lyric phrase. */
  title: string;
  /** What ◀ ▶ will do to it. */
  subtitle: string;
  canLeft: boolean;
  canRight: boolean;
  /** Verb for the arrows' aria-labels, e.g. "Move chord". */
  moveLabel: string;
  onMove: (dir: -1 | 1) => void;
  onClear: () => void;
}) {
  const arrowCls =
    "flex h-11 w-14 items-center justify-center rounded-lg bg-blue-50 text-lg font-bold text-blue-600 hover:bg-blue-100 active:bg-blue-200 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-300";
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{title}</p>
          <p className="truncate text-[11px] text-slate-400">{subtitle}</p>
        </div>
        <button
          type="button"
          disabled={!canLeft}
          onClick={() => onMove(-1)}
          aria-label={`${moveLabel} left`}
          className={arrowCls}
        >
          ◀
        </button>
        <button
          type="button"
          disabled={!canRight}
          onClick={() => onMove(1)}
          aria-label={`${moveLabel} right`}
          className={arrowCls}
        >
          ▶
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Deselect"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
