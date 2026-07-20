/**
 * Applying lyric-sync suggestions to a song — phrase fills and placement
 * shifts. Pure, and same-reference on no-op like every reshape op, so the
 * view's dirty/undo tracking works unchanged.
 */
import { fromDense, toDense } from "@/lib/song/lines";
import { lyricWords, setBarLyric } from "@/lib/song/lyrics";
import type { Timeline } from "@/lib/song/playback";
import type { SectionDef, SongData, WordMark } from "@/lib/song/types";
import { barIndexAtMs, type SpotifySyncData } from "@/lib/spotify/sync";
import type { LrcLine } from "./lrc";
import {
  alignWords,
  MIN_CONFIDENCE,
  songWordStream,
  type PhraseFill,
} from "./align";

/**
 * Stamp each fill's text onto its (empty) bar via setBarLyric. Fills whose
 * bar no longer exists or already has a lyric are skipped — suggestions can
 * go stale while the user keeps editing. Returns the same reference when
 * nothing applied.
 */
export function applyPhraseFill(
  data: SongData,
  fills: PhraseFill[]
): SongData {
  let sections = data.sections;
  for (const f of fills) {
    const def = sections[f.sectionId];
    const line = def?.lines[f.li];
    if (!line) continue;
    if (line.lyrics.some((s) => s.bar === f.bar && s.text.trim() !== "")) {
      continue;
    }
    const next = setBarLyric(line, f.bar, f.text);
    if (next === line) continue;
    sections = {
      ...sections,
      [f.sectionId]: {
        ...def,
        lines: def.lines.map((l, i) => (i === f.li ? next : l)),
      },
    };
  }
  return sections === data.sections ? data : { ...data, sections };
}

/** A word in a section's flattened stream, its highlight fragments along. */
interface StreamWord {
  text: string;
  frags: { char?: number; end?: number }[];
  /** Index into the section's flattened cell list. */
  origCell: number;
  /** Definition address key, matching the shift map. */
  key: string;
}

/**
 * Move mismatched lines' words to the bar the recording sings them in.
 *
 * Each confidently aligned LRC line whose timestamp lands in a different
 * timeline bar than its words yields a bar delta; every song word bound to
 * that line shifts by the delta (whole lines move rigidly — the map's
 * within-line word split is the user's, not the LRC's, so it's preserved).
 * Shifts clamp to the word's own section and the stream stays in order
 * (words never leapfrog their neighbors), words cross rows freely (the
 * same boundary the seam ops move), and highlights travel with their
 * words. Repeat passes replay definitions, so a delta seen on any pass
 * moves the definition once — the earliest pass wins on conflicts.
 *
 * Same-reference no-op when the recording and the map already agree.
 */
export function applyPlacementShifts(
  data: SongData,
  timeline: Timeline,
  sync: SpotifySyncData,
  fallbackBpm: number,
  lrcLines: LrcLine[]
): SongData {
  const songWords = songWordStream(data, timeline);
  const { lines, bindings } = alignWords(songWords, lrcLines);

  // Bar delta per mismatched line.
  const lineDelta = new Map<number, number>();
  for (const s of lines) {
    if (s.confidence < MIN_CONFIDENCE || !s.firstSongWord) continue;
    const idx = barIndexAtMs(timeline, sync, s.ms, fallbackBpm);
    if (idx === null || idx === s.firstSongWord.barTimelineIdx) continue;
    lineDelta.set(s.lineIdx, idx - s.firstSongWord.barTimelineIdx);
  }
  if (lineDelta.size === 0) return data;

  // Delta per definition word (earliest pass wins on repeated sections).
  const wordShift = new Map<string, number>();
  for (const b of bindings) {
    const d = lineDelta.get(b.lineIdx);
    if (d === undefined) continue;
    const w = songWords[b.songIdx];
    const key = `${w.sectionId}:${w.li}:${w.bar}:${w.wordIdx}`;
    if (!wordShift.has(key)) wordShift.set(key, d);
  }
  if (wordShift.size === 0) return data;

  let sections = data.sections;
  for (const [id, def] of Object.entries(data.sections)) {
    const next = repartitionSection(id, def, wordShift);
    if (next !== def) {
      if (sections === data.sections) sections = { ...sections };
      sections[id] = next;
    }
  }
  return sections === data.sections ? data : { ...data, sections };
}

/** Rebuild one section with its words re-dealt per the shift map. */
function repartitionSection(
  sectionId: string,
  def: SectionDef,
  wordShift: Map<string, number>
): SectionDef {
  // Flatten the section's rows into one cell stream (the same continuous
  // string reshape's seam ops walk), remembering row boundaries.
  const rowLen = def.lines.map((l) => l.bars.length);
  const cells = def.lines.flatMap(toDense);
  if (cells.length === 0) return def;

  const stream: StreamWord[] = [];
  let cellIdx = 0;
  def.lines.forEach((line, li) => {
    toDense(line).forEach((cell, bi) => {
      const words = lyricWords(cell.lyric);
      const byWord = new Map<number, { char?: number; end?: number }[]>();
      for (const m of cell.marks ?? []) {
        const frag: { char?: number; end?: number } = {};
        if (m.char !== undefined) frag.char = m.char;
        if (m.end !== undefined) frag.end = m.end;
        const list = byWord.get(m.word) ?? [];
        list.push(frag);
        byWord.set(m.word, list);
      }
      words.forEach((text, wi) => {
        stream.push({
          text,
          frags: byWord.get(wi) ?? [],
          origCell: cellIdx,
          key: `${sectionId}:${li}:${bi}:${wi}`,
        });
      });
      cellIdx++;
    });
  });
  if (stream.length === 0) return def;

  // Desired cell per word: shifted, clamped to the section, kept in order.
  const dest: number[] = [];
  stream.forEach((w, i) => {
    const shifted = w.origCell + (wordShift.get(w.key) ?? 0);
    const clamped = Math.max(0, Math.min(cells.length - 1, shifted));
    dest.push(i === 0 ? clamped : Math.max(clamped, dest[i - 1]));
  });
  if (stream.every((w, i) => dest[i] === w.origCell)) return def;

  // Deal the words back out.
  const outWords: StreamWord[][] = cells.map(() => []);
  stream.forEach((w, i) => outWords[dest[i]].push(w));
  const outCells = cells.map((cell, i) => {
    const words = outWords[i];
    const marks: WordMark[] = [];
    words.forEach((w, wi) => {
      for (const frag of w.frags) marks.push({ word: wi, ...frag });
    });
    return {
      bar: cell.bar,
      lyric: words.map((w) => w.text).join(" "),
      marks: marks.length > 0 ? marks : undefined,
    };
  });

  // Rebuild rows along the original boundaries, keeping untouched rows'
  // references.
  let offset = 0;
  const nextLines = def.lines.map((line, li) => {
    const slice = outCells.slice(offset, offset + rowLen[li]);
    offset += rowLen[li];
    const rebuilt = fromDense(slice);
    const sameLyrics =
      JSON.stringify(rebuilt.lyrics) === JSON.stringify(line.lyrics);
    return sameLyrics ? line : rebuilt;
  });
  return nextLines.every((l, i) => l === def.lines[i])
    ? def
    : { ...def, lines: nextLines };
}
