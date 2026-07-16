/**
 * Load-time normalization of the jsonb song blob. Old songs predate newer
 * optional fields, and hand-edited or stale blobs can carry values that
 * violate the invariants the render/ops code relies on — this is the
 * single place those get cleaned up as a song row enters the client.
 * Returns the *same reference* when nothing needed fixing, so untouched
 * songs stay reference-equal (the editors use that for dirty tracking).
 */
import { syncLinkedChords } from "./fingerprint";
import { lyricWords } from "./lyrics";
import { markChar, validMarks } from "./marks";
import type { LyricSpan, SongData, WordMark } from "./types";

/** A span as older blobs stored it: word→beat anchors (beats since
 *  removed) and a pickup-word count. Both migrate to plain highlights. */
interface LegacySpan extends LyricSpan {
  anchors?: { word: number; beat?: number; char?: number }[];
  lead?: number;
}

/** Marks sorted and stripped of out-of-range/duplicate entries (earlier
 *  wins on conflict); null when the result is "no marks". */
function normalizeMarks(
  marks: WordMark[],
  words: string[]
): WordMark[] | null {
  const sorted = [...marks].sort(
    (a, b) => a.word - b.word || markChar(a) - markChar(b)
  );
  const kept: WordMark[] = [];
  for (const m of sorted) {
    if (validMarks([...kept, m], words)) kept.push(m);
  }
  return kept.length > 0 ? kept : null;
}

function normalizeSpan(span: LegacySpan): LyricSpan {
  if (!span.marks?.length && !span.anchors?.length && span.lead === undefined) {
    return span;
  }
  const words = lyricWords(span.text);

  // Legacy word→beat anchors become highlights (the beat drops); a legacy
  // pickup count just drops — unhighlighted leading words read as pickup
  // naturally. Stored `marks` win over leftovers when both exist.
  const raw: WordMark[] =
    span.marks ??
    (span.anchors ?? []).map((a) =>
      (a.char ?? 0) > 0 ? { word: a.word, char: a.char } : { word: a.word }
    );
  const next = normalizeMarks(raw, words);

  const unchanged =
    span.anchors === undefined &&
    span.lead === undefined &&
    (span.marks === undefined
      ? next === null
      : next !== null &&
        next.length === span.marks.length &&
        next.every((m, i) => m === span.marks![i]));
  if (unchanged) return span;

  const out: LyricSpan = { text: span.text, bar: span.bar };
  if (next) out.marks = next;
  return out;
}

/** Clean a song's data blob on load; same reference when already clean. */
export function normalizeSongData(input: SongData): SongData {
  // Linked (`sameChordsAs`) sections share one chord progression — re-sync
  // first (songs saved before linking shared data may have drifted).
  const data = syncLinkedChords(input);
  let changed = data !== input;
  const sections: SongData["sections"] = {};
  for (const [id, def] of Object.entries(data.sections)) {
    let linesChanged = false;
    const lines = def.lines.map((line) => {
      let lyricsChanged = false;
      const lyrics = line.lyrics.map((s) => {
        const next = normalizeSpan(s);
        if (next !== s) lyricsChanged = true;
        return next;
      });
      if (!lyricsChanged) return line;
      linesChanged = true;
      return { ...line, lyrics };
    });
    sections[id] = linesChanged ? { ...def, lines } : def;
    if (linesChanged) changed = true;
  }
  return changed ? { ...data, sections } : data;
}
