"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, MusicNotes, Pencil, Play } from "@/components/icons";

/**
 * The docked action bar for the current reshape selection. Rendered fixed at
 * the bottom of the viewport (instead of inline beside the selected chip) so
 * picking something up never reflows the bars under the user's finger, and
 * the ◀ ▶ targets are full thumb-sized. One bar serves every mode; modes
 * with more than move/clear (Chords: insert, delete, beat dots) pass their
 * extra actions as a second `tools` row, and selections with no move gesture
 * at all (Rows' bar selection) omit `onMove` to hide the arrows.
 *
 * When `edit` is given, a ✎ button swaps the whole bar for one inline input
 * editing the selection's text — the only place reshape ever opens the
 * keyboard (taps never type). Enter/✓ commits, Esc/✕ cancels. The caller
 * keys this component by selection identity so a mid-edit reselect drops the
 * draft instead of carrying it to the new selection.
 */
export function SelectionBar({
  title,
  subtitle,
  canLeft,
  canRight,
  moveLabel,
  onMove,
  onClear,
  tools,
  edit,
  notice,
  onPlayFromHere,
  docked = true,
}: {
  /** What is picked up, e.g. the chord symbol or the lyric phrase. */
  title: string;
  /** What the bar's actions will do to it. */
  subtitle: string;
  canLeft?: boolean;
  canRight?: boolean;
  /** Verb for the arrows' aria-labels, e.g. "Move chord". */
  moveLabel?: string;
  /** Move the selection one bar; omit to hide the ◀ ▶ arrows entirely. */
  onMove?: (dir: -1 | 1) => void;
  onClear: () => void;
  /** Optional second row of mode-specific actions. */
  tools?: ReactNode;
  /** Inline text edit behind the explicit ✎ tap; omit to hide the pencil. */
  edit?: {
    /** The current text the input starts from. */
    value: string;
    /** Aria label for the ✎ button and the input, e.g. "Edit chord". */
    label: string;
    /** Commit the trimmed text (only called when it may apply). */
    onSubmit: (text: string) => void;
    /** Permit committing "" (lyrics: clears the phrase); default no-op. */
    allowEmpty?: boolean;
  };
  /** Optional banner row docked on top of the bar (e.g. a propagation
   *  offer), so it stays in thumb reach next to the actions it follows. */
  notice?: ReactNode;
  /** Play the recording from the selection's bar (shown while the Spotify
   *  transport is open) — hear the spot being reshaped without moving. */
  onPlayFromHere?: () => void;
  /** false renders the rows without the fixed-bottom shell, for hosts that
   *  stack this bar with others inside their own docked wrapper. */
  docked?: boolean;
}) {
  /** The in-progress edit text; null when not editing. */
  const [draft, setDraft] = useState<string | null>(null);
  const arrowCls =
    "flex h-11 w-14 items-center justify-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-300";
  return (
    <div
      className={
        docked
          ? "fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur"
          : undefined
      }
    >
      {notice}
      {edit && draft !== null ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (text !== "" || edit.allowEmpty) edit.onSubmit(text);
            setDraft(null);
          }}
          className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2"
        >
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDraft(null);
            }}
            enterKeyHint="done"
            aria-label={edit.label}
            className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm font-bold focus:border-blue-400 focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Apply edit"
            className="flex h-11 w-14 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white hover:bg-blue-700 active:bg-blue-800"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            aria-label="Cancel edit"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </form>
      ) : (
        <>
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{title}</p>
              <p className="truncate text-[11px] text-slate-400">{subtitle}</p>
            </div>
            {onPlayFromHere && (
              <button
                type="button"
                onClick={onPlayFromHere}
                aria-label="Play the recording from this bar"
                title="Play the recording from this bar"
                className="flex h-11 w-11 items-center justify-center gap-0.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 active:bg-green-200"
              >
                <MusicNotes className="h-4 w-4" />
                <Play className="h-4 w-4" />
              </button>
            )}
            {edit && (
              <button
                type="button"
                onClick={() => setDraft(edit.value)}
                aria-label={edit.label}
                title={edit.label}
                className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300"
              >
                <Pencil className="h-5 w-5" />
              </button>
            )}
            {onMove && (
              <>
                <button
                  type="button"
                  disabled={!canLeft}
                  onClick={() => onMove(-1)}
                  aria-label={`${moveLabel} left`}
                  className={arrowCls}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  disabled={!canRight}
                  onClick={() => onMove(1)}
                  aria-label={`${moveLabel} right`}
                  className={arrowCls}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClear}
              aria-label="Deselect"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
          {tools && (
            <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 pb-2">
              {tools}
            </div>
          )}
        </>
      )}
    </div>
  );
}
