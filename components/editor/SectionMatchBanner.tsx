"use client";

import { useState } from "react";
import {
  detectSectionMatches,
  linkChords,
  mergeSections,
} from "@/lib/song/fingerprint";
import type { SongData } from "@/lib/song/types";

/**
 * Detects duplicated sections and offers one-tap fixes: merge true
 * duplicates into one shared definition (edits then apply everywhere it
 * appears), or link same-chords sections so they share one chord
 * progression — a chord edit in any linked member updates all of them
 * (see syncLinkedChords) — and render collapsed as "chords same as …".
 * Suggestions are dismissible per group; nothing is ever applied without
 * a tap.
 */
export function SectionMatchBanner({
  data,
  onApply,
}: {
  data: SongData;
  onApply: (next: SongData) => void;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const { exact, chordOnly } = detectSectionMatches(data);

  const label = (id: string) => data.sections[id]?.label ?? id;
  const listLabels = (ids: string[]) =>
    ids.map(label).join(ids.length > 2 ? ", " : " and ");

  const rows = [
    ...exact.map((g) => ({
      key: `m:${g.join(" ")}`,
      text: `${listLabels(g)} are identical.`,
      action: "Merge into one",
      apply: () => onApply(mergeSections(data, g[0], g.slice(1))),
    })),
    ...chordOnly.map((g) => ({
      key: `l:${g.join(" ")}`,
      text: `${listLabels(g.slice(1))} ${
        g.length > 2 ? "have" : "has"
      } the same chords as ${label(g[0])}.`,
      action: "Link chords",
      apply: () => onApply(linkChords(data, g.slice(1), g[0])),
    })),
  ].filter((r) => !dismissed.has(r.key));

  if (rows.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div
          key={r.key}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900"
        >
          <span className="min-w-0 flex-1">{r.text}</span>
          <button
            type="button"
            onClick={r.apply}
            className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700"
          >
            {r.action}
          </button>
          <button
            type="button"
            onClick={() =>
              setDismissed((d) => new Set(d).add(r.key))
            }
            aria-label="Dismiss suggestion"
            title="Dismiss"
            className="shrink-0 rounded-md px-1.5 py-1 text-blue-400 hover:bg-blue-100 hover:text-blue-700"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
