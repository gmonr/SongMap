"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SECTION_COLOR_NAMES, sectionColor } from "@/lib/song/colors";
import { orderedSectionIds, syncLinkedChords } from "@/lib/song/fingerprint";
import { lyricWords, marksAfterRetype } from "@/lib/song/lyrics";
import { duplicateSection, splitSection } from "@/lib/song/sections";
import { KEYS, parseKey } from "@/lib/song/theory";
import {
  beatsPerBar,
  type Bar,
  type Line,
  type LyricSpan,
  type SectionDef,
  type SongData,
  type SongRow,
} from "@/lib/song/types";
import { createClient } from "@/lib/supabase/client";
import { deleteSong } from "@/app/songs/actions";
import { TapTempoButton } from "@/components/tempo/TapTempoButton";
import { TempoLookup } from "@/components/tempo/TempoLookup";
import { RenumberBanner } from "@/components/editor/RenumberBanner";
import { SectionMatchBanner } from "@/components/editor/SectionMatchBanner";
import { useDragReorder } from "@/components/editor/useDragReorder";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function newBar(beats: number): Bar {
  return { chords: [{ sym: "", beats }] };
}

function newLine(beats: number, bars = 4): Line {
  return {
    bars: Array.from({ length: bars }, () => newBar(beats)),
    lyrics: [],
  };
}

const inputCls =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none";

/**
 * A clamped number input that stays easy to retype on mobile: focusing
 * selects the whole value so the next digit replaces it, and the box may
 * be emptied while editing — the model keeps its last valid value and the
 * field snaps back to it on blur instead of forcing a "1" into the way.
 */
function NumberField({
  value,
  min,
  max,
  onCommit,
  className,
  ...rest
}: {
  value: number;
  min: number;
  max?: number;
  onCommit: (n: number) => void;
  className?: string;
} & Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  "title" | "aria-label"
>) {
  // The in-progress text while focused (may be ""); null shows the model.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft ?? value}
      onFocus={(e) => {
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseInt(e.target.value, 10);
        if (!Number.isNaN(n)) {
          onCommit(Math.max(min, max !== undefined ? Math.min(max, n) : n));
        }
      }}
      onBlur={() => setDraft(null)}
      className={className}
      {...rest}
    />
  );
}

/* ------------------------------------------------------------------ */

function BarEditor({
  bar,
  lyric,
  maxBeats,
  onChange,
  onLyricChange,
  onRemove,
}: {
  bar: Bar;
  lyric: string;
  maxBeats: number;
  onChange: (bar: Bar) => void;
  onLyricChange: (text: string) => void;
  onRemove: () => void;
}) {
  const setChord = (i: number, patch: Partial<Bar["chords"][number]>) => {
    const chords = bar.chords.map((c, j) => (j === i ? { ...c, ...patch } : c));
    onChange({ ...bar, chords });
  };

  const splitChord = () => {
    if (bar.chords.length >= maxBeats) return;
    const last = bar.chords[bar.chords.length - 1];
    const half = Math.max(1, Math.floor(last.beats / 2));
    const chords = [
      ...bar.chords.slice(0, -1),
      { ...last, beats: last.beats - half },
      { sym: "", beats: half },
    ];
    onChange({ ...bar, chords });
  };

  const removeChord = (i: number) => {
    if (bar.chords.length <= 1) return;
    const removed = bar.chords[i];
    const chords = bar.chords.filter((_, j) => j !== i);
    chords[Math.max(0, i - 1)].beats += removed.beats;
    onChange({ ...bar, chords });
  };

  return (
    <div className="flex w-40 shrink-0 flex-col gap-1 rounded-md border border-slate-200 bg-white p-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-400">
        bar
        <button
          type="button"
          onClick={onRemove}
          title="Remove bar"
          className="text-slate-400 hover:text-rose-600"
        >
          ✕
        </button>
      </div>
      {bar.chords.map((chord, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            value={chord.sym}
            onChange={(e) => setChord(i, { sym: e.target.value })}
            placeholder="C"
            className={`${inputCls} w-full min-w-0 font-semibold`}
          />
          <NumberField
            value={chord.beats}
            min={1}
            max={maxBeats}
            onCommit={(n) => setChord(i, { beats: n })}
            title="Beats"
            className={`${inputCls} w-12 text-center`}
          />
          {bar.chords.length > 1 && (
            <button
              type="button"
              onClick={() => removeChord(i)}
              title="Remove chord"
              className="text-slate-400 hover:text-rose-600"
            >
              –
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={splitChord}
        className="self-start text-xs text-blue-600 hover:underline"
      >
        + split bar
      </button>
      <input
        value={lyric}
        onChange={(e) => onLyricChange(e.target.value)}
        placeholder="lyric…"
        className={`${inputCls} mt-1 w-full text-xs italic`}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SectionEditor({
  id,
  def,
  beats,
  onChange,
  onDelete,
  onDuplicate,
  onSplit,
}: {
  id: string;
  def: SectionDef;
  beats: number;
  onChange: (def: SectionDef) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  /** Split the section right before line `atLine`; everything from there
   *  down becomes a new section. */
  onSplit: (atLine: number) => void;
}) {
  const color = sectionColor(def.color);

  const setLine = (li: number, line: Line) =>
    onChange({
      ...def,
      lines: def.lines.map((l, i) => (i === li ? line : l)),
    });

  // Lines carry their own lyrics, so dragging a line to a new position
  // moves its lyrics along automatically — nothing else to keep in sync.
  const { draggingIndex: draggingLine, setRowRef: setLineRef, onHandlePointerDown: onLineHandlePointerDown } =
    useDragReorder((from, to) => {
      const lines = [...def.lines];
      const [moved] = lines.splice(from, 1);
      lines.splice(to, 0, moved);
      onChange({ ...def, lines });
    });

  const lyricFor = (line: Line, barIdx: number) =>
    line.lyrics.find((s) => s.bar === barIdx)?.text ?? "";

  const setLyric = (li: number, barIdx: number, text: string) => {
    const line = def.lines[li];
    const old = line.lyrics.find((s) => s.bar === barIdx);
    const lyrics = line.lyrics.filter((s) => s.bar !== barIdx);
    if (text) {
      const span: LyricSpan = { text, bar: barIdx };
      // Highlights (set in reshape) survive edits that keep the word
      // count — fixing a typo keeps them; rewriting drops them.
      const words = lyricWords(text);
      if (old?.marks && words.length === lyricWords(old.text).length) {
        span.marks = marksAfterRetype(old.marks, words);
      }
      lyrics.push(span);
    }
    lyrics.sort((a, b) => a.bar - b.bar);
    setLine(li, { ...line, lyrics });
  };

  const removeBar = (li: number, bi: number) => {
    const line = def.lines[li];
    const lyrics = line.lyrics
      .filter((s) => s.bar !== bi)
      .map((s) => (s.bar > bi ? { ...s, bar: s.bar - 1 } : s));
    setLine(li, {
      ...line,
      bars: line.bars.filter((_, i) => i !== bi),
      lyrics,
    });
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 ${color.card} p-4 shadow-sm`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`h-5 w-1.5 rounded-full ${color.accent}`} aria-hidden />
        <input
          value={def.label}
          onChange={(e) => onChange({ ...def, label: e.target.value })}
          className={`${inputCls} w-36 font-bold`}
          aria-label="Section label"
        />
        <div className="flex items-center gap-1">
          {SECTION_COLOR_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => onChange({ ...def, color: name })}
              className={`h-5 w-5 rounded-full ${sectionColor(name).swatch} ${
                def.color === name
                  ? "ring-2 ring-slate-800 ring-offset-1"
                  : "opacity-50 hover:opacity-100"
              }`}
            />
          ))}
        </div>
        <span className="flex-1" />
        <span className="text-xs text-slate-400">id: {id}</span>
        <button
          type="button"
          onClick={onDuplicate}
          className="text-sm text-blue-600 hover:underline"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-sm text-rose-600 hover:underline"
        >
          Delete section
        </button>
      </div>

      <div className="space-y-3">
        {def.lines.map((line, li) => (
          <div key={li}>
            {li > 0 && (
              <button
                type="button"
                onClick={() => onSplit(li)}
                title="Everything from this line down becomes a new section"
                className="mb-1 w-full rounded border border-dashed border-slate-300 py-0.5 text-center text-[10px] text-slate-400 hover:border-blue-400 hover:text-blue-600"
              >
                ✂ split section here
              </button>
            )}
            <div
              ref={setLineRef(li)}
              className={`flex items-start gap-1 rounded-lg bg-white/60 p-2 ${
                draggingLine === li
                  ? "relative z-10 opacity-80 shadow-lg ring-2 ring-blue-300"
                  : ""
              }`}
            >
              <span
                onPointerDown={onLineHandlePointerDown(li)}
                title="Drag to reorder line"
                aria-label="Drag to reorder line"
                role="button"
                tabIndex={-1}
                className="mt-1 shrink-0 touch-none select-none px-1 text-sm text-slate-400 hover:text-slate-700"
              >
                ≡
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {line.bars.map((bar, bi) => (
                    <BarEditor
                      key={bi}
                      bar={bar}
                      lyric={lyricFor(line, bi)}
                      maxBeats={beats}
                      onChange={(b) =>
                        setLine(li, {
                          ...line,
                          bars: line.bars.map((x, i) => (i === bi ? b : x)),
                        })
                      }
                      onLyricChange={(text) => setLyric(li, bi, text)}
                      onRemove={() => removeBar(li, bi)}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setLine(li, { ...line, bars: [...line.bars, newBar(beats)] })
                    }
                    className="shrink-0 self-stretch rounded-md border border-dashed border-slate-300 px-3 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600"
                  >
                    + bar
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...def,
                      lines: def.lines.filter((_, i) => i !== li),
                    })
                  }
                  className="mt-1 text-xs text-slate-400 hover:text-rose-600"
                >
                  remove line
                </button>
              </div>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({ ...def, lines: [...def.lines, newLine(beats)] })
          }
          className="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600"
        >
          + line
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function SongEditor({ song }: { song: SongRow }) {
  const router = useRouter();
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist ?? "");
  const [key, setKey] = useState(song.key ?? "C");
  const [timeSignature, setTimeSignature] = useState(
    song.time_signature ?? "4/4"
  );
  const [tempo, setTempo] = useState(song.tempo?.toString() ?? "");
  const [capo, setCapo] = useState(song.capo?.toString() ?? "0");
  const [data, setData] = useState<SongData>(song.data);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beats = beatsPerBar(timeSignature);
  const { minor } = parseKey(key);
  // Arrangement order, unarranged sections last — matches the song map and
  // makes the Sections list read top-to-bottom like the song plays.
  const sectionIds = orderedSectionIds(data);

  // Linked (`sameChordsAs`) sections share chords: a chord edit here flows
  // to the source and every other linked member; structural drift severs
  // the link instead (see syncLinkedChords).
  const setSection = (id: string, def: SectionDef) =>
    setData((d) =>
      syncLinkedChords({ ...d, sections: { ...d.sections, [id]: def } }, id)
    );

  const addSection = () => {
    const id = uid("section");
    setData((d) => ({
      sections: {
        ...d.sections,
        [id]: {
          label: "New section",
          color:
            SECTION_COLOR_NAMES[
              Object.keys(d.sections).length % SECTION_COLOR_NAMES.length
            ],
          lines: [newLine(beats)],
        },
      },
      arrangement: [...d.arrangement, { ref: id, instanceLabel: "New section" }],
    }));
  };

  const deleteSection = (id: string) => {
    setData((d) => {
      const sections = { ...d.sections };
      delete sections[id];
      return {
        sections,
        arrangement: d.arrangement
          .filter((a) => a.ref !== id)
          .map((a) =>
            a.sameChordsAs === id ? { ...a, sameChordsAs: undefined } : a
          ),
      };
    });
  };

  // The new id is minted once, outside the updater: setState updaters can
  // run twice (React Strict Mode's purity check), and duplicateSection is
  // otherwise deterministic — reusing the same id keeps that true.
  const duplicateSectionAction = (id: string) => {
    const newId = uid("section");
    setData((d) => duplicateSection(d, id, newId));
  };

  const splitSectionAction = (id: string, atLine: number) => {
    const newId = uid("section");
    setData((d) => splitSection(d, id, atLine, newId));
  };

  // Setting `sameChordsAs` here links live: once every instance of the
  // section points at the same source, the source's chords stamp onto it.
  const setArrangement = (
    i: number,
    patch: Partial<SongData["arrangement"][number]>
  ) =>
    setData((d) =>
      syncLinkedChords({
        ...d,
        arrangement: d.arrangement.map((a, j) =>
          j === i ? { ...a, ...patch } : a
        ),
      })
    );

  const moveArrangement = (i: number, dir: -1 | 1) =>
    setData((d) => {
      const arr = [...d.arrangement];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, arrangement: arr };
    });

  // Drag reorders live as the pointer moves (feature: the Sections list
  // above re-derives its order from `data.arrangement` every render, so it
  // re-sorts in step with the drag automatically).
  const reorderArrangement = (from: number, to: number) =>
    setData((d) => {
      const arr = [...d.arrangement];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...d, arrangement: arr };
    });
  const {
    draggingIndex: draggingArrangement,
    setRowRef: setArrangementRowRef,
    onHandlePointerDown: onArrangementHandlePointerDown,
  } = useDragReorder(reorderArrangement);

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("songs")
      .update({
        title: title.trim() || "Untitled song",
        artist: artist.trim() || null,
        key,
        time_signature: timeSignature,
        tempo: tempo ? parseInt(tempo, 10) : null,
        capo: capo ? parseInt(capo, 10) : 0,
        data,
      })
      .eq("id", song.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/songs/${song.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Metadata */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="lg:col-span-2 text-sm">
            <span className="mb-1 block font-medium">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </label>
          <label className="lg:col-span-2 text-sm">
            <span className="mb-1 block font-medium">Artist</span>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Key</span>
            <div className="flex gap-1">
              <select
                value={parseKey(key).tonic}
                onChange={(e) => setKey(e.target.value + (minor ? "m" : ""))}
                className={`${inputCls} w-full`}
              >
                {KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={minor}
                  onChange={(e) =>
                    setKey(parseKey(key).tonic + (e.target.checked ? "m" : ""))
                  }
                />
                m
              </label>
            </div>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Time</span>
            <select
              value={timeSignature}
              onChange={(e) => setTimeSignature(e.target.value)}
              className={`${inputCls} w-full`}
            >
              {["4/4", "3/4", "6/8", "2/4", "12/8"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Tempo ♩</span>
            <input
              type="number"
              value={tempo}
              onChange={(e) => setTempo(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className={`${inputCls} w-full`}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Capo</span>
            <input
              type="number"
              min={0}
              value={capo}
              onChange={(e) => setCapo(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              className={`${inputCls} w-full`}
            />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <TapTempoButton onTempo={(bpm) => setTempo(String(bpm))} />
          <TempoLookup
            artist={artist}
            title={title}
            currentTempo={tempo ? parseInt(tempo, 10) : null}
            onUse={(bpm) => setTempo(String(bpm))}
          />
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Sections
        </h2>
        {sectionIds.map((id) => (
          <SectionEditor
            key={id}
            id={id}
            def={data.sections[id]}
            beats={beats}
            onChange={(def) => setSection(id, def)}
            onDelete={() => deleteSection(id)}
            onDuplicate={() => duplicateSectionAction(id)}
            onSplit={(atLine) => splitSectionAction(id, atLine)}
          />
        ))}
        <button
          type="button"
          onClick={addSection}
          className="rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600"
        >
          + Add section
        </button>
      </div>

      <RenumberBanner data={data} onApply={(next) => setData(next)} />
      <SectionMatchBanner
        data={data}
        onApply={(next) => setData(syncLinkedChords(next))}
      />

      {/* Arrangement */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Arrangement
        </h2>
        <p className="mb-3 mt-0.5 text-xs text-slate-400">
          "Chords same as" links share only the chords — lyrics, highlights,
          and row layout stay each instance's own.
        </p>
        <div className="space-y-2">
          {data.arrangement.map((item, i) => (
            <div
              key={i}
              ref={setArrangementRowRef(i)}
              className={`flex flex-wrap items-center gap-2 text-sm ${
                draggingArrangement === i
                  ? "relative z-10 rounded-md bg-white opacity-80 shadow-lg ring-2 ring-blue-300"
                  : ""
              }`}
            >
              <span
                onPointerDown={onArrangementHandlePointerDown(i)}
                title="Drag to reorder"
                aria-label="Drag to reorder"
                role="button"
                tabIndex={-1}
                className="touch-none select-none px-1 text-slate-400 hover:text-slate-700"
              >
                ≡
              </span>
              <span className="w-6 text-right text-slate-400">{i + 1}.</span>
              <select
                value={item.ref}
                onChange={(e) => setArrangement(i, { ref: e.target.value })}
                className={inputCls}
                aria-label="Section"
              >
                {sectionIds.map((id) => (
                  <option key={id} value={id}>
                    {data.sections[id].label}
                  </option>
                ))}
              </select>
              <input
                value={item.instanceLabel}
                onChange={(e) =>
                  setArrangement(i, { instanceLabel: e.target.value })
                }
                placeholder="Instance label (e.g. Verse 2)"
                className={`${inputCls} w-40`}
              />
              <label className="flex items-center gap-1 text-xs text-slate-500">
                ×
                <NumberField
                  value={item.repeat ?? 1}
                  min={1}
                  onCommit={(n) =>
                    setArrangement(i, { repeat: n > 1 ? n : undefined })
                  }
                  className={`${inputCls} w-14`}
                  aria-label="Repeat count"
                />
              </label>
              <label
                className="flex items-center gap-1 text-xs text-slate-500"
                title="Linked sections share chords only — lyrics, highlights, and row layout stay each instance's own."
              >
                chords same as
                <select
                  value={item.sameChordsAs ?? ""}
                  onChange={(e) =>
                    setArrangement(i, {
                      sameChordsAs: e.target.value || undefined,
                    })
                  }
                  className={inputCls}
                >
                  <option value="">—</option>
                  {sectionIds.map((id) => (
                    <option key={id} value={id}>
                      {data.sections[id].label}
                    </option>
                  ))}
                </select>
              </label>
              <span className="flex-1" />
              {/* ↑/↓ stay as a keyboard/accessibility fallback for the drag
                  handle above; visually smaller since dragging is primary. */}
              <button
                type="button"
                onClick={() => moveArrangement(i, -1)}
                className="text-xs text-slate-400 hover:text-slate-800"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveArrangement(i, 1)}
                className="text-xs text-slate-400 hover:text-slate-800"
                aria-label="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    arrangement: d.arrangement.filter((_, j) => j !== i),
                  }))
                }
                className="text-slate-400 hover:text-rose-600"
                aria-label="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setData((d) => ({
              ...d,
              arrangement: [
                ...d.arrangement,
                {
                  ref: sectionIds[0],
                  instanceLabel: data.sections[sectionIds[0]]?.label ?? "",
                },
              ],
            }))
          }
          disabled={sectionIds.length === 0}
          className="mt-3 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
        >
          + Add to arrangement
        </button>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <Link
            href={`/songs/${song.id}`}
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Cancel
          </Link>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <span className="flex-1" />
          <button
            type="button"
            onClick={async () => {
              if (confirm(`Delete "${title}"? This cannot be undone.`)) {
                await deleteSong(song.id);
              }
            }}
            className="text-sm text-rose-600 hover:underline"
          >
            Delete song
          </button>
        </div>
      </div>
    </div>
  );
}
