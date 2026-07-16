"use client";

/**
 * The edit-time propagation offer: after a bar-local chord fix in reshape,
 * every bar that still looks like the edited bar did before is one tap away
 * from the same fix. Docked with the SelectionBar (or alone when a delete
 * dropped the selection); never applied without the tap, and any other kind
 * of edit clears it. Undo reverts the whole stamp at once.
 */
export function PropagateBanner({
  count,
  chords,
  onApply,
  onDismiss,
}: {
  /** How many other bars still match the edited bar's old pattern. */
  count: number;
  /** What applying stamps onto them, e.g. "G G/B" — "—" for a cleared bar. */
  chords: string;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const them = count === 1 ? "it" : "them";
  return (
    <div className="border-b border-blue-100 bg-blue-50">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 text-xs text-blue-900">
        <span className="min-w-0 flex-1">
          {count === 1 ? "1 more bar looks" : `${count} more bars look`} like
          this one did —{" "}
          {chords === "—" ? `clear ${them} too?` : `make ${them} ${chords} too?`}
        </span>
        <button
          type="button"
          onClick={onApply}
          className="h-8 shrink-0 rounded-md bg-blue-600 px-3 font-semibold text-white hover:bg-blue-700 active:bg-blue-800"
        >
          Apply to {count === 1 ? "it" : `all ${count}`}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss suggestion"
          title="Dismiss"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-blue-400 hover:bg-blue-100 hover:text-blue-700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
