"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { importChordSheet } from "@/lib/song/import";
import { KEYS, parseKey } from "@/lib/song/theory";
import { beatsPerBar, type SongRow } from "@/lib/song/types";
import { SongMap } from "@/components/song-map/SongMap";
import { createImportedSong } from "@/app/songs/actions";

const inputCls =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none";

const PLACEHOLDER = `Paste an Ultimate Guitar-style chord sheet…

[Verse 1]
C           G
Hello world these are words
Am              F
Second lyric phrase here

[Chorus]
F        G       C
Sing the chorus loud

ChordPro ([C]inline chords, {title: …}) works too.`;

export function SongImporter({ canSave }: { canSave: boolean }) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [key, setKey] = useState("");
  const [timeSignature, setTimeSignature] = useState("4/4");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const beats = beatsPerBar(timeSignature);

  const result = useMemo(
    () => (text.trim() ? importChordSheet(text, beats) : null),
    [text, beats]
  );

  const hasContent = (result?.data.arrangement.length ?? 0) > 0;

  // The key field prefers, in order: what the user picked, a ChordPro {key:}
  // directive, the guess from the chords themselves.
  const effectiveKey = key || result?.key || result?.guessedKey || "C";
  const effectiveTitle = title || result?.title || "";
  const effectiveArtist = artist || result?.artist || "";
  const { tonic, minor } = parseKey(effectiveKey);

  const previewSong: SongRow | null =
    result && hasContent
      ? {
          id: "import-preview",
          title: effectiveTitle || "Imported song",
          artist: effectiveArtist || null,
          key: effectiveKey,
          time_signature: timeSignature,
          tempo: null,
          capo: 0,
          data: result.data,
          source_url: null,
        }
      : null;

  const save = () => {
    if (!result || !hasContent) return;
    setError(null);
    startSaving(async () => {
      try {
        await createImportedSong({
          title: effectiveTitle || "Imported song",
          artist: effectiveArtist || null,
          key: effectiveKey,
          time_signature: timeSignature,
          data: result.data,
        });
      } catch {
        setError("Could not save the song. Are you still signed in?");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Paste box + metadata */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={12}
          spellCheck={false}
          className="w-full resize-y rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-sm focus:border-blue-500 focus:outline-none"
          aria-label="Chord sheet text"
        />

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="lg:col-span-2 text-sm">
            <span className="mb-1 block font-medium">Title</span>
            <input
              value={effectiveTitle}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Imported song"
              className={`${inputCls} w-full`}
            />
          </label>
          <label className="lg:col-span-2 text-sm">
            <span className="mb-1 block font-medium">Artist</span>
            <input
              value={effectiveArtist}
              onChange={(e) => setArtist(e.target.value)}
              className={`${inputCls} w-full`}
            />
          </label>
          <div className="flex gap-3">
            <label className="flex-1 text-sm">
              <span className="mb-1 block font-medium">
                Key
                {!key && result?.guessedKey && !result.key && (
                  <span className="ml-1 font-normal text-slate-400">
                    (guessed)
                  </span>
                )}
              </span>
              <div className="flex gap-1">
                <select
                  value={tonic}
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
                    onChange={(e) => setKey(tonic + (e.target.checked ? "m" : ""))}
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
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={!canSave || !hasContent || saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create song"}
          </button>
          <Link
            href="/songs"
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            Cancel
          </Link>
          {result && (
            <span className="text-xs text-slate-400">
              detected: {result.format === "chordpro" ? "ChordPro" : "chords over lyrics"}
            </span>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        {result && result.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Live preview */}
      {previewSong && (
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              Preview
            </h2>
            <p className="text-xs text-slate-400">
              Each chord change became one bar — after creating, fix bar counts
              and reshape rows (move/merge/split bars) in the editor.
            </p>
          </div>
          <SongMap key={effectiveKey + timeSignature} song={previewSong} />
        </div>
      )}
    </div>
  );
}
