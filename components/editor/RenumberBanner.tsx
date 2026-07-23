"use client";

import { useState } from "react";
import { renumberSections } from "@/lib/song/sections";
import type { SongData } from "@/lib/song/types";

/**
 * Imports and quick edits often leave two DIFFERENT sections sharing one
 * name ("Chorus" x2 with different chords) — confusing in both the
 * arrangement list and the song map. `renumberSections` (lib/song/sections)
 * detects that and, unlike the auto-fix at import time, never renames while
 * the user is mid-edit: this banner offers the fix as a one-tap opt-in,
 * dismissible per section name like SectionMatchBanner's suggestions.
 */
export function RenumberBanner({
  data,
  onApply,
}: {
  data: SongData;
  onApply: (next: SongData) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const renumbered = renumberSections(data);
  if (renumbered === data) return null;

  // Group the ids whose label actually changed by their *old* base name,
  // so each row reads "... both named 'X' — number them X 1 / X 2?".
  const changedByOldBase = new Map<string, string[]>();
  for (const id of Object.keys(data.sections)) {
    const oldLabel = data.sections[id].label;
    const newLabel = renumbered.sections[id]?.label;
    if (!newLabel || newLabel === oldLabel) continue;
    const base = oldLabel.replace(/\s*\d+\s*$/, "").trim() || oldLabel;
    changedByOldBase.set(base, [...(changedByOldBase.get(base) ?? []), id]);
  }

  const rows = [...changedByOldBase.entries()]
    .map(([base, ids]) => ({
      key: base,
      text: `Two different sections are both named "${base}" — number them ${ids
        .map((id) => renumbered.sections[id].label)
        .join(" / ")}?`,
    }))
    .filter((r) => !dismissed.has(r.key));

  if (rows.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div
          key={r.key}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <span className="min-w-0 flex-1">{r.text}</span>
          <button
            type="button"
            onClick={() => onApply(renumberSections(data))}
            className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setDismissed((d) => new Set(d).add(r.key))}
            aria-label="Dismiss suggestion"
            title="Dismiss"
            className="shrink-0 rounded-md px-1.5 py-1 text-amber-500 hover:bg-amber-100 hover:text-amber-800"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
