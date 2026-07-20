"use client";

import {
  shortcutKeyLabel,
  type ShortcutBinding,
} from "./useShortcuts";

/**
 * The ? cheatsheet: a dismissible modal listing the screen's active
 * bindings, built from the same array useShortcuts runs so it can't drift.
 */
export function ShortcutsOverlay({
  bindings,
  onClose,
}: {
  bindings: ShortcutBinding[];
  onClose: () => void;
}) {
  const visible = bindings.filter((b) => !b.when || b.when());
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-xl"
      >
        <div className="mb-3 flex items-center">
          <h2 className="text-sm font-bold">Keyboard shortcuts</h2>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
        <ul className="space-y-1.5">
          {visible.map((b) => (
            <li key={b.key} className="flex items-center gap-3 text-sm">
              <kbd className="min-w-12 rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-center text-xs font-semibold text-slate-700">
                {shortcutKeyLabel(b)}
              </kbd>
              <span className="text-slate-600">{b.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
