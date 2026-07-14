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
  renameChord,
  setBeatBoundary,
} from "@/lib/song/chords";
import { sectionColor } from "@/lib/song/colors";
import { deleteBar, insertBar } from "@/lib/song/lines";
import { setBarLyric, shiftLyric } from "@/lib/song/lyrics";
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
  | { kind: "phrase"; sectionId: string; li: number; bar: number }
  | { kind: "bar"; sectionId: string; li: number; bi: number };

const HINTS: Record<ReshapeMode, ReactNode> = {
  rows: (
    <>
      Tap the seam <b className="font-semibold text-slate-600">between two bars</b>{" "}
      to break a row there. Tap a{" "}
      <b className="font-semibold text-slate-600">merge</b> seam between two rows
      to join them back. Tap a{" "}
      <b className="font-semibold text-slate-600">bar</b> to pick it up, then{" "}
      <b className="font-semibold text-slate-600">＋ bar before / after</b> adds
      an empty — bar beside it and{" "}
      <b className="font-semibold text-slate-600">🗑</b> deletes it (its words
      join the bar before). Lyrics stay with their bar.
    </>
  ),
  lyrics: (
    <>
      Tap the gap <b className="font-semibold text-slate-600">between two words</b>{" "}
      to move the bar break there. Tap a bar&apos;s{" "}
      <b className="font-semibold text-slate-600">chord label</b> to pick up its
      whole phrase, then ◀ ▶ in the bottom bar to shift it a bar at a time and{" "}
      <b className="font-semibold text-slate-600">✎</b> to retype its words. To
      move words between rows, merge the rows in Rows mode first.
    </>
  ),
  chords: (
    <>
      Tap a <b className="font-semibold text-slate-600">chord</b> to pick it up:
      ◀ ▶ moves it into the neighboring bar,{" "}
      <b className="font-semibold text-slate-600">＋ before / after</b> adds a
      copy beside it, <b className="font-semibold text-slate-600">✎</b> renames
      it, <b className="font-semibold text-slate-600">🗑</b> deletes it, and
      tapping a gap in the{" "}
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
 * (break/merge row layout, add/remove bars), Lyrics (redistribute words
 * across bars), Chords (nudge a chord into a neighboring bar) — identical
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
  // directions and moving can keep the selection on the moved thing. Bar
  // selections (Rows mode) have no move gesture at all.
  const selLines = sel ? data.sections[sel.sectionId]?.lines : undefined;
  const selBar =
    sel?.kind === "chord" || sel?.kind === "bar"
      ? selLines?.[sel.li]?.bars[sel.bi]
      : undefined;
  const selIsEmptyBar =
    !!selBar && selBar.chords.length === 1 && selBar.chords[0].sym === "";

  const canMove = (dir: -1 | 1): boolean => {
    if (!sel || !selLines || sel.kind === "bar") return false;
    if (sel.kind === "chord") {
      return (
        chordMoveTarget(selLines, sel.li, sel.bi, sel.ci, dir, beats) !== null
      );
    }
    return shiftLyric(selLines[sel.li], sel.bar, dir) !== selLines[sel.li];
  };

  const moveSel = (dir: -1 | 1) => {
    if (!sel || !selLines || sel.kind === "bar") return;
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
        : sel.kind === "bar"
          ? selBar?.chords.map((c) => c.sym).filter(Boolean).join(" ") || "—"
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

  // P2's ✎: the one interaction that types. Renaming a chord keeps its
  // beats; a lyric edit rewrites the phrase's words in place. Committing an
  // empty lyric clears the phrase and drops the selection (an empty phrase
  // can't be re-picked in Lyrics mode).
  const editSel = (text: string) => {
    if (!sel) return;
    if (sel.kind === "chord") {
      applyToSection(sel.sectionId, (lines) =>
        renameChord(lines, sel.li, sel.bi, sel.ci, text)
      );
    } else if (sel.kind === "phrase") {
      applyToSection(sel.sectionId, (lines) => {
        const next = setBarLyric(lines[sel.li], sel.bar, text);
        return next === lines[sel.li]
          ? lines
          : lines.map((l, i) => (i === sel.li ? next : l));
      });
      if (text === "") setSel(null);
    }
  };

  const selEdit =
    sel && selLines
      ? sel.kind === "chord"
        ? selIsEmptyBar
          ? undefined
          : {
              value: selBar?.chords[sel.ci]?.sym ?? "",
              label: "Edit chord",
              onSubmit: editSel,
            }
        : sel.kind === "phrase"
          ? {
              value: lyricFor(selLines[sel.li], sel.bar),
              label: "Edit lyric",
              onSubmit: editSel,
              allowEmpty: true,
            }
          : undefined
      : undefined;

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

  // Bar tools (P3, Rows mode): add an empty "—" bar beside the selected bar
  // or delete it — for when the import guessed a row's bar count wrong.
  // Inserting keeps the selection on the new bar (mirroring chord inserts);
  // deleting drops it.
  const insertBarSel = (side: 0 | 1) => {
    if (sel?.kind !== "bar") return;
    const at = sel.bi + side;
    applyToSection(sel.sectionId, (lines) =>
      insertBar(lines, sel.li, at, beats)
    );
    setSel({ ...sel, bi: at });
  };

  const deleteBarSel = () => {
    if (sel?.kind !== "bar") return;
    applyToSection(sel.sectionId, (lines) => deleteBar(lines, sel.li, sel.bi));
    setSel(null);
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

  const barTools =
    sel?.kind === "bar" ? (
      <>
        <button
          type="button"
          onClick={() => insertBarSel(0)}
          aria-label="Add an empty bar before this one"
          className={toolBtnCls}
        >
          ＋ bar before
        </button>
        <button
          type="button"
          onClick={() => insertBarSel(1)}
          aria-label="Add an empty bar after this one"
          className={toolBtnCls}
        >
          ＋ bar after
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={deleteBarSel}
          aria-label="Delete bar"
          title="Delete bar"
          className={`${toolBtnCls} w-11 px-0 text-sm`}
        >
          🗑
        </button>
      </>
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
        sel ? (sel.kind === "phrase" ? "pb-24" : "pb-36") : ""
      }`}
    >
      {/* Two tight rows even on phones: title + back link, then the mode
          toggle with icon-only Undo and Save (errors get a rare third row). */}
      <header className="sticky top-2 z-30 space-y-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="min-w-0 truncate text-base font-bold leading-tight">
            {song.title}{" "}
            <span className="font-normal text-slate-400">· Reshape</span>
          </h1>
          <span className="flex-1" />
          <Link
            href={songHref}
            onClick={(e) => {
              if (dirty && !confirm("Discard unsaved reshaping?")) {
                e.preventDefault();
              }
            }}
            className="shrink-0 text-xs text-slate-500 hover:underline"
          >
            ← Song map
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <ModeToggle mode={mode} onChange={setMode} />
          <span className="flex-1" />
          <button
            type="button"
            onClick={undo}
            disabled={history.length === 0}
            aria-label="Undo last change"
            title="Undo last change"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-base text-slate-600 hover:bg-slate-50 disabled:cursor-default disabled:text-slate-300"
          >
            ↶
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
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
              {mode === "rows" && (
                <RowsSection
                  def={def}
                  sectionId={id}
                  apply={apply}
                  sel={sel}
                  onSelect={setSel}
                />
              )}
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
          // Keyed by selection identity so a mid-edit tap on another chip
          // resets the SelectionBar's draft instead of carrying it over.
          key={
            sel.kind === "chord"
              ? `c:${sel.sectionId}:${sel.li}:${sel.bi}:${sel.ci}`
              : sel.kind === "bar"
                ? `b:${sel.sectionId}:${sel.li}:${sel.bi}`
                : `p:${sel.sectionId}:${sel.li}:${sel.bar}`
          }
          title={selTitle}
          subtitle={
            sel.kind === "chord"
              ? selIsEmptyBar
                ? "＋ gives this empty bar a chord"
                : "◀ ▶ move it one bar"
              : sel.kind === "bar"
                ? "＋ add empty bar · 🗑 delete"
                : "◀ ▶ shift it one bar"
          }
          canLeft={canMove(-1)}
          canRight={canMove(1)}
          moveLabel={sel.kind === "chord" ? "Move chord" : "Shift phrase"}
          onMove={sel.kind === "bar" ? undefined : moveSel}
          onClear={() => setSel(null)}
          tools={chordTools ?? barTools}
          edit={selEdit}
        />
      )}
    </div>
  );
}
