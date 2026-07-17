"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
import {
  barFingerprint,
  barHasChord,
  findMatchingBars,
  propagateBarChords,
  sameBarLocation,
  syncLinkedChords,
  type BarLocation,
} from "@/lib/song/fingerprint";
import { deleteBar, insertBar } from "@/lib/song/lines";
import {
  barBeforeSeam,
  lineWordLayout,
  lyricWords,
  moveSeamWord,
  setBarLyric,
  setWordBoundary,
  shiftLyric,
} from "@/lib/song/lyrics";
import { toggleWordRange, wordIntervals } from "@/lib/song/marks";
import {
  encodeFocus,
  mapSelection,
  reshapeBarDomId,
  selectionAnchor,
  type BarAnchor,
  type ReshapeSelection,
} from "@/lib/song/selection";
import { beatsPerBar } from "@/lib/song/types";
import type { Line, SongData, SongRow } from "@/lib/song/types";
import { createClient } from "@/lib/supabase/client";
import { SectionMatchBanner } from "@/components/editor/SectionMatchBanner";
import { PropagateBanner } from "./PropagateBanner";
import { lyricFor } from "./BarChip";
import { BeatDots } from "./BeatDots";
import { ChordsSection } from "./ChordsSection";
import { LyricsSection } from "./LyricsSection";
import { ModeToggle, type ReshapeMode } from "./ModeToggle";
import { RowsSection } from "./RowsSection";
import { SelectionBar } from "./SelectionBar";
import { SyllableGaps } from "./SyllableGaps";

/** What is currently picked up, across every section and mode. */
export type { ReshapeSelection } from "@/lib/song/selection";

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
      Tap the <b className="font-semibold text-slate-600">│ break</b> between
      two bars to pick it up, then ◀ ▶ in the bottom bar move it one word at a
      time — or tap one of the{" "}
      <b className="font-semibold text-slate-600">word gaps</b> that light up
      to place it there. The dashed{" "}
      <b className="font-semibold text-slate-600">seam</b> at the start of a
      row works the same but moves words{" "}
      <b className="font-semibold text-slate-600">across rows and sections</b>{" "}
      — lyrics are one continuous string. Tap a bar&apos;s{" "}
      <b className="font-semibold text-slate-600">chord label</b> to pick up
      its whole phrase (◀ ▶ shifts it a bar,{" "}
      <b className="font-semibold text-slate-600">✎</b> retypes it). Tap a{" "}
      <b className="font-semibold text-slate-600">word</b> to highlight it on
      the song map: in the bottom bar, tap letter gaps to split off a
      syllable and tap the letters to toggle their highlight — shown exactly
      as the song map will render it.
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
      tappable to give them a chord. After a fix, a banner offers to apply it
      to every bar that still looks like the old one.
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
  // A pending "apply this fix elsewhere" offer (2B): the bar just edited
  // and what it fingerprinted as *before* the edit, so bars that still
  // match the old pattern can take the new chords in one tap.
  const [offer, setOffer] = useState<{
    source: BarLocation;
    beforeFp: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = data !== song.data;
  const beats = beatsPerBar(song.time_signature);

  // Mode switches stay on the same bar: the selection maps to its
  // equivalent in the new mode (or drops if there is none, e.g. a lyric-less
  // bar in Lyrics mode) and the bar scrolls back into view either way.
  const pendingScroll = useRef<BarAnchor | null>(null);
  const setMode = (m: ReshapeMode) => {
    if (sel) {
      pendingScroll.current = selectionAnchor(sel, data);
      setSel(mapSelection(sel, m, data));
    }
    setModeState(m);
  };

  useEffect(() => {
    const anchor = pendingScroll.current;
    if (!anchor) return;
    pendingScroll.current = null;
    document
      .getElementById(reshapeBarDomId(anchor))
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [mode]);

  // The most recent pick-up, so leaving for the song map can point at the
  // bar the user was last working on even after they tapped it off.
  const lastSelRef = useRef<ReshapeSelection | null>(null);
  useEffect(() => {
    if (sel) lastSelRef.current = sel;
  }, [sel]);

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
  // Bar-local chord edits pass `editedBar` to feed the propagation offer
  // (2B); every other edit clears any pending offer, since row/bar
  // restructuring could shift the indices it points at.
  const applyToSection = (
    id: string,
    fn: (lines: Line[]) => Line[],
    editedBar?: { li: number; bi: number }
  ) => {
    const prev = data.sections[id].lines;
    const next = fn(prev);
    if (next === prev) return;
    setHistory((h) => [...h.slice(1 - UNDO_LIMIT), data]);
    // Linked sections share chords: the edit flows to the source and every
    // other linked member (or severs a link the edit made structurally
    // untrue). One undo step reverts the edit and the sync together.
    const nextData: SongData = syncLinkedChords(
      {
        ...data,
        sections: {
          ...data.sections,
          [id]: { ...data.sections[id], lines: next },
        },
      },
      id
    );
    setData(nextData);

    if (!editedBar) {
      setOffer(null);
      return;
    }
    // Repeated tweaks to the same bar keep comparing against how it looked
    // before the FIRST edit — the untouched siblings still match that.
    const loc: BarLocation = { sectionId: id, ...editedBar };
    const before = prev[editedBar.li]?.bars[editedBar.bi];
    const beforeFp =
      offer && sameBarLocation(offer.source, loc)
        ? offer.beforeFp
        : before && barHasChord(before)
          ? barFingerprint(before)
          : null;
    const after = next[editedBar.li]?.bars[editedBar.bi];
    setOffer(
      beforeFp !== null &&
        after &&
        barFingerprint(after) !== beforeFp &&
        findMatchingBars(nextData, beforeFp, loc).length > 0
        ? { source: loc, beforeFp }
        : null
    );
  };

  // Whole-song edits (section merges/links) — same undo history; the
  // selection clears because section ids may vanish underneath it.
  const applyData = (next: SongData) => {
    if (next === data) return;
    setHistory((h) => [...h.slice(1 - UNDO_LIMIT), data]);
    setSel(null);
    setOffer(null);
    setData(syncLinkedChords(next));
  };

  // Delete a whole section: its definition, every arrangement instance, and
  // any links pointing at it. This is how imported junk (metadata parsed as
  // an "Intro" full of non-chords) leaves the song — undoable like any edit.
  const deleteSection = (id: string) => {
    const label = data.sections[id]?.label ?? "section";
    if (!confirm(`Delete ${label} — its bars and lyrics?`)) return;
    const sections = { ...data.sections };
    delete sections[id];
    applyData({
      sections,
      arrangement: data.arrangement
        .filter((a) => a.ref !== id)
        .map((a) =>
          a.sameChordsAs === id ? { ...a, sameChordsAs: undefined } : a
        ),
    });
  };

  const undo = () => {
    if (history.length === 0) return;
    setSel(null);
    setOffer(null);
    setData(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  };

  // The offer's live target list (bars can drift back into/out of matching
  // as the user keeps editing) and what applying would stamp onto them.
  const offerTargets = offer
    ? findMatchingBars(data, offer.beforeFp, offer.source)
    : [];
  const offerBar = offer
    ? data.sections[offer.source.sectionId]?.lines[offer.source.li]?.bars[
        offer.source.bi
      ]
    : undefined;

  // Applying keeps the selection (unlike applyData): nothing the selection
  // points at moves — only sibling bars change their chords.
  const applyOffer = () => {
    if (!offer) return;
    const next = propagateBarChords(data, offer.source, offerTargets);
    setOffer(null);
    if (next === data) return;
    setHistory((h) => [...h.slice(1 - UNDO_LIMIT), data]);
    setData(syncLinkedChords(next, offer.source.sectionId));
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

  // A selected break moves one word at a time: the break at word position
  // `start` moved to `start + dir`. setWordBoundary no-ops (same reference)
  // when the pair's words run out in that direction.
  const movedBreak = (line: Line, boundary: number, dir: -1 | 1): Line => {
    const start = lineWordLayout(line).bars[boundary]?.start;
    return start === undefined
      ? line
      : setWordBoundary(line, boundary, start + dir);
  };

  // A row-start seam (boundary 0) crosses lines and sections, so its move
  // is a whole-song edit — same undo history, selection stands (the seam's
  // identity is its right side, which doesn't move).
  const moveSeam = (sectionId: string, li: number, dir: -1 | 1) => {
    const next = moveSeamWord(data, orderedIds, sectionId, li, dir);
    if (next === data) return;
    setHistory((h) => [...h.slice(1 - UNDO_LIMIT), data]);
    setOffer(null);
    setData(next);
  };

  // The selected word's phrase span and highlight state, for the
  // SelectionBar's WYSIWYG picker.
  const selSpan =
    sel?.kind === "word"
      ? selLines?.[sel.li]?.lyrics.find((s) => s.bar === sel.bar)
      : undefined;
  const selWordText =
    sel?.kind === "word" && selLines
      ? (lyricWords(lyricFor(selLines[sel.li], sel.bar))[sel.word] ?? "")
      : "";
  const selIntervals =
    sel?.kind === "word"
      ? wordIntervals(selSpan?.marks, sel.word, selWordText.length)
      : [];
  const selMarked =
    selIntervals.length === 1 &&
    selIntervals[0][0] === 0 &&
    selIntervals[0][1] === selWordText.length;

  const canMove = (dir: -1 | 1): boolean => {
    if (!sel || !selLines || sel.kind === "bar" || sel.kind === "word") {
      return false;
    }
    if (sel.kind === "chord") {
      return (
        chordMoveTarget(selLines, sel.li, sel.bi, sel.ci, dir, beats) !== null
      );
    }
    if (sel.kind === "break") {
      if (sel.boundary === 0) {
        return moveSeamWord(data, orderedIds, sel.sectionId, sel.li, dir) !== data;
      }
      return movedBreak(selLines[sel.li], sel.boundary, dir) !== selLines[sel.li];
    }
    return shiftLyric(selLines[sel.li], sel.bar, dir) !== selLines[sel.li];
  };

  const moveSel = (dir: -1 | 1) => {
    if (!sel || !selLines || sel.kind === "bar" || sel.kind === "word") return;
    if (sel.kind === "chord") {
      const target = chordMoveTarget(selLines, sel.li, sel.bi, sel.ci, dir, beats);
      if (!target) return;
      applyToSection(sel.sectionId, (lines) =>
        moveChord(lines, sel.li, sel.bi, sel.ci, dir, beats)
      );
      setSel({ ...sel, ...target });
    } else if (sel.kind === "break") {
      if (sel.boundary === 0) {
        moveSeam(sel.sectionId, sel.li, dir);
        return; // Seam identity (section, row) unchanged — selection stands.
      }
      const next = movedBreak(selLines[sel.li], sel.boundary, dir);
      if (next === selLines[sel.li]) return;
      applyToSection(sel.sectionId, (lines) =>
        lines.map((l, i) => (i === sel.li ? next : l))
      );
      // The break keeps its identity (boundary index) — selection stands.
    } else {
      const next = shiftLyric(selLines[sel.li], sel.bar, dir);
      if (next === selLines[sel.li]) return;
      applyToSection(sel.sectionId, (lines) =>
        lines.map((l, i) => (i === sel.li ? next : l))
      );
      setSel({ ...sel, bar: sel.bar + dir });
    }
  };

  // "last-word │ first-word" around a selected break, "·" for an empty
  // side. A row-start seam reads its left side from the previous row or
  // section.
  const breakTitle = (sectionId: string, li: number, boundary: number): string => {
    const line = data.sections[sectionId]?.lines[li];
    if (!line) return "";
    let leftWords: string[];
    if (boundary === 0) {
      const left = barBeforeSeam(data, orderedIds, sectionId, li);
      leftWords = left
        ? lyricWords(
            lyricFor(data.sections[left.sectionId].lines[left.li], left.bi)
          )
        : [];
    } else {
      leftWords = lineWordLayout(line).bars[boundary - 1]?.words ?? [];
    }
    const rightWords =
      lineWordLayout(line).bars[boundary]?.words ?? [];
    return `${leftWords[leftWords.length - 1] ?? "·"} │ ${
      rightWords[0] ?? "·"
    }`;
  };

  const selTitle =
    sel && selLines
      ? sel.kind === "chord"
        ? selLines[sel.li]?.bars[sel.bi]?.chords[sel.ci]?.sym || "—"
        : sel.kind === "bar"
          ? selBar?.chords.map((c) => c.sym).filter(Boolean).join(" ") || "—"
          : sel.kind === "break"
            ? breakTitle(sel.sectionId, sel.li, sel.boundary)
            : sel.kind === "word"
              ? selWordText || "—"
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
    applyToSection(
      sel.sectionId,
      (lines) => insertChord(lines, sel.li, sel.bi, at, insertSym, beats),
      { li: sel.li, bi: sel.bi }
    );
    setSel({ ...sel, ci: at });
  };

  const deleteSel = () => {
    if (sel?.kind !== "chord") return;
    applyToSection(
      sel.sectionId,
      (lines) => deleteChord(lines, sel.li, sel.bi, sel.ci),
      { li: sel.li, bi: sel.bi }
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
      applyToSection(
        sel.sectionId,
        (lines) => renameChord(lines, sel.li, sel.bi, sel.ci, text),
        { li: sel.li, bi: sel.bi }
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
    applyToSection(
      sel.sectionId,
      (lines) => {
        const line = lines[sel.li];
        const barHere = line?.bars[sel.bi];
        if (!barHere) return lines;
        const nextBar = setBeatBoundary(barHere, ci, chordBeats);
        if (nextBar === barHere) return lines;
        return lines.map((l, i) =>
          i === sel.li
            ? { ...l, bars: l.bars.map((b, bi) => (bi === sel.bi ? nextBar : b)) }
            : l
        );
      },
      { li: sel.li, bi: sel.bi }
    );
  };

  // Toggle the highlight on chars [from, to) of the selected word — the
  // WYSIWYG picker's segment taps, and (over the full range) the ☆ button.
  const toggleRange = (from: number, to: number) => {
    if (sel?.kind !== "word") return;
    applyToSection(sel.sectionId, (lines) => {
      const next = toggleWordRange(lines[sel.li], sel.bar, sel.word, from, to);
      return next === lines[sel.li]
        ? lines
        : lines.map((l, i) => (i === sel.li ? next : l));
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

  const wordTools =
    sel?.kind === "word" && selLines?.[sel.li]?.bars[sel.bar] ? (
      <>
        {selWordText.length > 1 ? (
          <div className="min-w-0 flex-1">
            <SyllableGaps
              word={selWordText}
              wordIndex={sel.word}
              marks={selSpan?.marks}
              accentClass={
                sectionColor(data.sections[sel.sectionId]?.color ?? "").label
              }
              onToggleRange={toggleRange}
            />
          </div>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          disabled={selWordText.length === 0}
          onClick={() => toggleRange(0, selWordText.length)}
          title={
            selMarked
              ? "Remove the whole word's highlight"
              : "Highlight this word on the song map"
          }
          className={`${toolBtnCls} ${
            selMarked ? "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800" : ""
          }`}
        >
          {selMarked ? "★ highlighted" : "☆ highlight"}
        </button>
      </>
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

  // Land the song map on the bar being reshaped: back link and Save both
  // carry a ?focus= param the map scrolls to and flashes.
  const focusAnchor = selectionAnchor(sel ?? lastSelRef.current, data);
  const exitHref = focusAnchor
    ? `${songHref}?focus=${encodeURIComponent(encodeFocus(focusAnchor))}`
    : songHref;

  const offerBanner =
    offer && offerBar && offerTargets.length > 0 ? (
      <PropagateBanner
        count={offerTargets.length}
        chords={
          offerBar.chords.map((c) => c.sym).filter(Boolean).join(" ") || "—"
        }
        onApply={applyOffer}
        onDismiss={() => setOffer(null)}
      />
    ) : null;

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
    router.push(exitHref);
    router.refresh();
  };

  return (
    <div
      className={`reshape-surface select-none space-y-4 ${
        sel
          ? sel.kind === "chord" || sel.kind === "bar" || sel.kind === "word"
            ? offerBanner
              ? "pb-44"
              : "pb-36"
            : offerBanner
              ? "pb-32"
              : "pb-24"
          : offerBanner
            ? "pb-14"
            : ""
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
            href={exitHref}
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

      <SectionMatchBanner data={data} onApply={applyData} />

      {orderedIds.map((id, idx) => {
        const def = data.sections[id];
        const color = sectionColor(def.color);
        const apply = (fn: (lines: Line[]) => Line[]) => applyToSection(id, fn);
        const hasPrecedingBars = orderedIds
          .slice(0, idx)
          .some((prevId) =>
            data.sections[prevId].lines.some((l) => l.bars.length > 0)
          );
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
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => deleteSection(id)}
                aria-label={`Delete section ${def.label}`}
                title="Delete this section"
                className="flex h-8 w-8 items-center justify-center rounded-md text-sm text-slate-400 hover:bg-white hover:text-rose-600"
              >
                🗑
              </button>
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
                  hasPrecedingBars={hasPrecedingBars}
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

      {!sel && offerBanner && (
        // No selection to dock onto (e.g. a delete dropped it) — the offer
        // still renders in the SelectionBar's fixed slot.
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
          {offerBanner}
        </div>
      )}

      {sel && (
        <SelectionBar
          notice={offerBanner ?? undefined}
          // Keyed by selection identity so a mid-edit tap on another chip
          // resets the SelectionBar's draft instead of carrying it over.
          key={
            sel.kind === "chord"
              ? `c:${sel.sectionId}:${sel.li}:${sel.bi}:${sel.ci}`
              : sel.kind === "bar"
                ? `b:${sel.sectionId}:${sel.li}:${sel.bi}`
                : sel.kind === "break"
                  ? `k:${sel.sectionId}:${sel.li}:${sel.boundary}`
                  : sel.kind === "word"
                    ? `w:${sel.sectionId}:${sel.li}:${sel.bar}:${sel.word}`
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
                : sel.kind === "break"
                  ? sel.boundary === 0
                    ? "◀ ▶ move a word across the row (or section) boundary"
                    : "◀ ▶ move the break one word"
                  : sel.kind === "word"
                    ? "tap letters to highlight · gaps split off syllables"
                    : "◀ ▶ shift it one bar"
          }
          canLeft={canMove(-1)}
          canRight={canMove(1)}
          moveLabel={
            sel.kind === "chord"
              ? "Move chord"
              : sel.kind === "break"
                ? "Move break"
                : "Shift phrase"
          }
          onMove={
            sel.kind === "bar" || sel.kind === "word" ? undefined : moveSel
          }
          onClear={() => setSel(null)}
          tools={chordTools ?? barTools ?? wordTools}
          edit={selEdit}
        />
      )}
    </div>
  );
}
