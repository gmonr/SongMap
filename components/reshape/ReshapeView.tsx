"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  chordMoveTarget,
  deleteChord,
  insertChord,
  moveChord,
  nearestChordSym,
  setBeatBoundary,
} from "@/lib/song/chords";
import { sectionColor } from "@/lib/song/colors";
import { shiftLyric } from "@/lib/song/lyrics";
import { beatsPerBar } from "@/lib/song/types";
import type { Line, SongData, SongRow } from "@/lib/song/types";
import { createClient } from "@/lib/supabase/client";
import { lyricFor } from "./BarChip";
import { BeatDots } from "./BeatDots";
import { ChordsSection } from "./ChordsSection";
import { LyricsSection } from "./LyricsSection";
import { ModeToggle, type ReshapeMode } from "./ModeToggle";
import { RowsSection } from "./RowsSection";
import { SelectionBar } from "./SelectionBar";

/** What is currently picked up, across every section and mode. */
export type ReshapeSelection =
  | { kind: "chord"; sectionId: string; li: number; bi: number; ci: number }
  | { kind: "phrase"; sectionId: string; li: number; bar: number };

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
      whole phrase, then ◀ ▶ in the bottom bar to shift it a bar at a time. To
      move words between rows, merge the rows in Rows mode first.
    </>
  ),
  chords: (
    <>
      Tap a <b className="font-semibold text-slate-600">chord</b> to pick it up:
      ◀ ▶ moves it into the neighboring bar,{" "}
      <b className="font-semibold text-slate-600">＋ before / after</b> adds a
      copy beside it, <b className="font-semibold text-slate-600">🗑</b> deletes
      it, and tapping a gap in the{" "}
      <b className="font-semibold text-slate-600">beat dots</b> moves the beat
      split. Empty <b className="font-semibold text-slate-600">—</b> bars are
      tappable to give them a chord.
    </>
  ),
};

const UNDO_LIMIT = 100;

/**
 * Reshape mode: restructure a song without retyping anything, on the compact
 * song-map blocks (not the big editor boxes). Three tap-based tools — Rows
 * (break/merge row layout), Lyrics (redistribute words across bars), Chords
 * (nudge a chord into a neighboring bar) — so the interaction is identical
 * on mobile and desktop. Selection lives here (not per section) so only one
 * thing is ever picked up, and its actions render in the docked SelectionBar.
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
  const [history, setHistory] = useState<SongData[]>([]);
  const [mode, setModeState] = useState<ReshapeMode>(initialMode);
  const [sel, setSel] = useState<ReshapeSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = data !== song.data;
  const beats = beatsPerBar(song.time_signature);

  const setMode = (m: ReshapeMode) => {
    setModeState(m);
    setSel(null);
  };

  // Warn before the browser discards unsaved reshaping (tab close, reload,
  // back gesture). The in-app Back link gets its own confirm below.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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

  // Ops signal a no-op by returning the same lines reference; skip the state
  // update (and the undo snapshot) entirely so stray taps don't set `dirty`.
  const applyToSection = (id: string, fn: (lines: Line[]) => Line[]) => {
    const next = fn(data.sections[id].lines);
    if (next === data.sections[id].lines) return;
    setHistory((h) => [...h.slice(1 - UNDO_LIMIT), data]);
    setData({
      ...data,
      sections: {
        ...data.sections,
        [id]: { ...data.sections[id], lines: next },
      },
    });
  };

  const undo = () => {
    if (history.length === 0) return;
    setSel(null);
    setData(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  };

  // The selection's move targets, so the SelectionBar can disable dead
  // directions and moving can keep the selection on the moved thing.
  const selLines = sel ? data.sections[sel.sectionId]?.lines : undefined;
  const selBar =
    sel?.kind === "chord" ? selLines?.[sel.li]?.bars[sel.bi] : undefined;
  const selIsEmptyBar =
    !!selBar && selBar.chords.length === 1 && selBar.chords[0].sym === "";

  const canMove = (dir: -1 | 1): boolean => {
    if (!sel || !selLines) return false;
    if (sel.kind === "chord") {
      return (
        chordMoveTarget(selLines, sel.li, sel.bi, sel.ci, dir, beats) !== null
      );
    }
    return shiftLyric(selLines[sel.li], sel.bar, dir) !== selLines[sel.li];
  };

  const moveSel = (dir: -1 | 1) => {
    if (!sel || !selLines) return;
    if (sel.kind === "chord") {
      const target = chordMoveTarget(selLines, sel.li, sel.bi, sel.ci, dir, beats);
      if (!target) return;
      applyToSection(sel.sectionId, (lines) =>
        moveChord(lines, sel.li, sel.bi, sel.ci, dir, beats)
      );
      setSel({ ...sel, ...target });
    } else {
      const next = shiftLyric(selLines[sel.li], sel.bar, dir);
      if (next === selLines[sel.li]) return;
      applyToSection(sel.sectionId, (lines) =>
        lines.map((l, i) => (i === sel.li ? next : l))
      );
      setSel({ ...sel, bar: sel.bar + dir });
    }
  };

  const selTitle =
    sel && selLines
      ? sel.kind === "chord"
        ? selLines[sel.li]?.bars[sel.bi]?.chords[sel.ci]?.sym || "—"
        : lyricFor(selLines[sel.li], sel.bar) || "—"
      : "";

  // Chord tools (P1). Taps never type, so inserts seed their symbol from
  // context — a copy of the selected chord, or, for an empty "—" bar, the
  // nearest chord (what "same as before" already meant); renaming is P2's ✎.
  const insertSym =
    sel?.kind === "chord" && selBar && selLines
      ? selIsEmptyBar
        ? nearestChordSym(selLines, sel.li, sel.bi)
        : selBar.chords[sel.ci]?.sym ?? null
      : null;
  const canInsert =
    !!insertSym && (selIsEmptyBar || (selBar?.chords.length ?? 0) < beats);

  const insertSel = (side: 0 | 1) => {
    if (sel?.kind !== "chord" || !insertSym) return;
    const at = selIsEmptyBar ? 0 : sel.ci + side;
    applyToSection(sel.sectionId, (lines) =>
      insertChord(lines, sel.li, sel.bi, at, insertSym, beats)
    );
    setSel({ ...sel, ci: at });
  };

  const deleteSel = () => {
    if (sel?.kind !== "chord") return;
    applyToSection(sel.sectionId, (lines) =>
      deleteChord(lines, sel.li, sel.bi, sel.ci)
    );
    setSel(null);
  };

  const setBoundary = (ci: number, chordBeats: number) => {
    if (sel?.kind !== "chord") return;
    applyToSection(sel.sectionId, (lines) => {
      const barHere = lines[sel.li]?.bars[sel.bi];
      if (!barHere) return lines;
      const next = setBeatBoundary(barHere, ci, chordBeats);
      if (next === barHere) return lines;
      return lines.map((l, i) =>
        i === sel.li
          ? { ...l, bars: l.bars.map((b, j) => (j === sel.bi ? next : b)) }
          : l
      );
    });
  };

  const toolBtnCls =
    "flex h-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-200 active:bg-slate-300 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-300";

  const chordTools =
    sel?.kind === "chord" && selBar ? (
      selIsEmptyBar ? (
        <button
          type="button"
          disabled={!canInsert}
          onClick={() => insertSel(0)}
          className={toolBtnCls}
        >
          ＋ chord{insertSym ? ` (${insertSym})` : ""}
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={!canInsert}
            onClick={() => insertSel(0)}
            aria-label="Add a copy of this chord before it"
            className={toolBtnCls}
          >
            ＋ before
          </button>
          <BeatDots bar={selBar} onSet={setBoundary} />
          <button
            type="button"
            disabled={!canInsert}
            onClick={() => insertSel(1)}
            aria-label="Add a copy of this chord after it"
            className={toolBtnCls}
          >
            ＋ after
          </button>
          <button
            type="button"
            onClick={deleteSel}
            aria-label="Delete chord"
            title="Delete chord"
            className={`${toolBtnCls} w-11 px-0 text-sm`}
          >
            🗑
          </button>
        </>
      )
    ) : undefined;

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
    <div
      className={`reshape-surface select-none space-y-4 ${
        sel ? (sel.kind === "chord" ? "pb-36" : "pb-24") : ""
      }`}
    >
      <header className="sticky top-2 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <Link
            href={songHref}
            onClick={(e) => {
              if (dirty && !confirm("Discard unsaved reshaping?")) {
                e.preventDefault();
              }
            }}
            className="text-xs text-slate-500 hover:underline"
          >
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
          onClick={undo}
          disabled={history.length === 0}
          title="Undo last change"
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-default disabled:text-slate-300"
        >
          ↶ Undo
        </button>
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
              {mode === "lyrics" && (
                <LyricsSection
                  def={def}
                  sectionId={id}
                  apply={apply}
                  sel={sel}
                  onSelect={setSel}
                />
              )}
              {mode === "chords" && (
                <ChordsSection
                  def={def}
                  sectionId={id}
                  sel={sel}
                  onSelect={setSel}
                />
              )}
            </div>
          </section>
        );
      })}

      {sel && (
        <SelectionBar
          title={selTitle}
          subtitle={
            sel.kind === "chord"
              ? selIsEmptyBar
                ? "Empty bar — ＋ gives it a chord"
                : "Move chord into the neighboring bar"
              : "Shift phrase a bar at a time"
          }
          canLeft={canMove(-1)}
          canRight={canMove(1)}
          moveLabel={sel.kind === "chord" ? "Move chord" : "Shift phrase"}
          onMove={moveSel}
          onClear={() => setSel(null)}
          tools={chordTools}
        />
      )}
    </div>
  );
}
