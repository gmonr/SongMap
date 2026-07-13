"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { sectionColor } from "@/lib/song/colors";
import { beatsPerBar } from "@/lib/song/types";
import type { Line, SongData, SongRow } from "@/lib/song/types";
import { createClient } from "@/lib/supabase/client";
import { ChordsSection } from "./ChordsSection";
import { LyricsSection } from "./LyricsSection";
import { ModeToggle, type ReshapeMode } from "./ModeToggle";
import { RowsSection } from "./RowsSection";

const HINTS: Record<ReshapeMode, ReactNode> = {
  rows: (
    <>
      Tap the seam <b className="font-semibold text-slate-600">between two bars</b>{" "}
      to break a row there. Tap a{" "}
      <b className="font-semibold text-slate-600">merge</b> seam between two rows
      to join them back. Lyrics stay with their bar.
    </>
  ),
  lyrics: (
    <>
      Tap the gap <b className="font-semibold text-slate-600">between two words</b>{" "}
      to move the bar break there. Tap a bar&apos;s{" "}
      <b className="font-semibold text-slate-600">chord label</b> to pick up its
      whole phrase, then ◀ ▶ to shift it a bar at a time. To move words between
      rows, merge the rows in Rows mode first.
    </>
  ),
  chords: (
    <>
      Tap a <b className="font-semibold text-slate-600">chord</b> to pick it up,
      then ◀ ▶ to move it into the neighboring bar. An empty bar absorbs it; an
      occupied bar becomes a split bar. Beats re-split evenly.
    </>
  ),
};

/**
 * Reshape mode: restructure a song without retyping anything, on the compact
 * song-map blocks (not the big editor boxes). Three tap-based tools — Rows
 * (break/merge row layout), Lyrics (redistribute words across bars), Chords
 * (nudge a chord into a neighboring bar) — so the interaction is identical
 * on mobile and desktop.
 */
export function ReshapeView({
  song,
  songHref,
  initialMode = "rows",
}: {
  song: SongRow;
  songHref: string;
  initialMode?: ReshapeMode;
}) {
  const router = useRouter();
  const [data, setData] = useState<SongData>(song.data);
  const [mode, setMode] = useState<ReshapeMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = data !== song.data;
  const beats = beatsPerBar(song.time_signature);

  // Sections in the order they first appear in the arrangement, then any that
  // aren't arranged. Each unique section is shown once (editing a shared
  // section applies to every instance that references it).
  const orderedIds: string[] = [];
  for (const item of data.arrangement) {
    if (data.sections[item.ref] && !orderedIds.includes(item.ref)) {
      orderedIds.push(item.ref);
    }
  }
  for (const id of Object.keys(data.sections)) {
    if (!orderedIds.includes(id)) orderedIds.push(id);
  }

  // Skip the state update entirely when the op no-ops (ops signal this by
  // returning the same lines reference), so stray taps don't set `dirty`.
  const applyToSection = (id: string, fn: (lines: Line[]) => Line[]) =>
    setData((d) => {
      const next = fn(d.sections[id].lines);
      if (next === d.sections[id].lines) return d;
      return {
        ...d,
        sections: {
          ...d.sections,
          [id]: { ...d.sections[id], lines: next },
        },
      };
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("songs")
      .update({ data })
      .eq("id", song.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(songHref);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <Link href={songHref} className="text-xs text-slate-500 hover:underline">
            ← Back to song map
          </Link>
          <h1 className="truncate text-xl font-bold leading-tight">
            {song.title}{" "}
            <span className="font-normal text-slate-400">· Reshape</span>
          </h1>
        </div>
        <span className="flex-1" />
        <ModeToggle mode={mode} onChange={setMode} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        {HINTS[mode]}
      </p>

      {orderedIds.map((id) => {
        const def = data.sections[id];
        const color = sectionColor(def.color);
        const apply = (fn: (lines: Line[]) => Line[]) => applyToSection(id, fn);
        return (
          <section
            key={id}
            className={`overflow-hidden rounded-xl border border-slate-200 ${color.card} shadow-sm`}
          >
            <div className="flex items-center gap-3 px-4 pt-3">
              <span
                className={`h-5 w-1.5 rounded-full ${color.accent}`}
                aria-hidden
              />
              <h2
                className={`text-sm font-bold uppercase tracking-wide ${color.label}`}
              >
                {def.label}
              </h2>
            </div>

            <div className="px-4 pb-4 pt-2">
              {mode === "rows" && <RowsSection def={def} apply={apply} />}
              {mode === "lyrics" && <LyricsSection def={def} apply={apply} />}
              {mode === "chords" && (
                <ChordsSection def={def} apply={apply} beats={beats} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
