"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { sectionColor } from "@/lib/song/colors";
import { mergeLineWithNext, splitLine } from "@/lib/song/lines";
import type { Line, SongData, SongRow } from "@/lib/song/types";
import { createClient } from "@/lib/supabase/client";

/**
 * A compact, read-only bar block: chord symbol(s) on top, its lyric phrase
 * below. Small enough that several fit per line, so the row structure is
 * visible at a glance — the whole point of reshaping here instead of in the
 * big editor cards.
 */
function BarChip({ bar, lyric }: { bar: Line["bars"][number]; lyric: string }) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center">
      <div className="flex w-full items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-1 py-1.5">
        {bar.chords.map((c, i) => (
          <span
            key={i}
            className={`truncate text-sm font-bold ${
              c.sym ? "" : "text-slate-300"
            }`}
          >
            {c.sym || "—"}
          </span>
        ))}
      </div>
      <p className="mt-0.5 h-4 w-full truncate text-center text-[10px] leading-tight text-slate-500">
        {lyric}
      </p>
    </div>
  );
}

/**
 * Reshape mode: merge or break the rows of each section, on the compact
 * song-map blocks (not the big editor boxes). Tapping the seam between two
 * bars breaks the row there; tapping the "merge" seam between two rows joins
 * them. Merge + break together cover any row layout, and both are plain taps —
 * so the interaction is identical on mobile and desktop.
 */
export function ReshapeView({
  song,
  songHref,
}: {
  song: SongRow;
  songHref: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<SongData>(song.data);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = data !== song.data;

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

  const applyToSection = (id: string, fn: (lines: Line[]) => Line[]) =>
    setData((d) => ({
      ...d,
      sections: {
        ...d.sections,
        [id]: { ...d.sections[id], lines: fn(d.sections[id].lines) },
      },
    }));

  const lyricFor = (line: Line, barIdx: number) =>
    line.lyrics.find((s) => s.bar === barIdx)?.text ?? "";

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
            <span className="font-normal text-slate-400">· Reshape rows</span>
          </h1>
        </div>
        <span className="flex-1" />
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
        Tap the seam <span className="font-semibold text-slate-600">between two bars</span>{" "}
        to break a row there. Tap a{" "}
        <span className="font-semibold text-slate-600">merge</span> seam between
        two rows to join them back. Lyrics stay with their bar.
      </p>

      {orderedIds.map((id) => {
        const def = data.sections[id];
        const color = sectionColor(def.color);
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

            <div className="space-y-1 px-4 pb-4 pt-2">
              {def.lines.map((line, li) => (
                <div key={li}>
                  <div className="flex flex-wrap items-start">
                    {line.bars.map((bar, bi) => (
                      <div key={bi} className="flex items-stretch">
                        <BarChip bar={bar} lyric={lyricFor(line, bi)} />
                        {bi < line.bars.length - 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              applyToSection(id, (lines) =>
                                splitLine(lines, li, bi + 1)
                              )
                            }
                            title="Break row here"
                            aria-label={`Break row after bar ${bi + 1}`}
                            className="group flex w-5 shrink-0 items-center justify-center self-stretch"
                          >
                            <span className="h-10 w-px bg-slate-200 transition-all group-hover:w-1 group-hover:bg-blue-400" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {li < def.lines.length - 1 && (
                    <div className="flex items-center gap-2 py-1">
                      <span className="h-px flex-1 bg-slate-200" />
                      <button
                        type="button"
                        onClick={() =>
                          applyToSection(id, (lines) =>
                            mergeLineWithNext(lines, li)
                          )
                        }
                        title="Merge these two rows"
                        aria-label={`Merge row ${li + 1} with row ${li + 2}`}
                        className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-400 hover:border-blue-400 hover:text-blue-600"
                      >
                        merge ⤢
                      </button>
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
