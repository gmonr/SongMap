/**
 * Word/syllable highlights: mark words of a bar's lyric phrase so the
 * singer can mentally tie them to the bar's chords — the highlighted
 * word/syllable is an implicit divider for the human, nothing more. No
 * beat is stored and rendering never repositions text over it. Pure ops
 * in the same style as chords.ts / lyrics.ts — every function returns the
 * *same reference* on a no-op.
 *
 * Invariants on a span's marks (normalizeSongData enforces them on load,
 * the ops preserve them): sorted by (word, char), unique, word < the
 * phrase's word count, 0 ≤ char < that word's length.
 */
import { lyricWords } from "./lyrics";
import type { Line, LyricSpan, WordMark } from "./types";

/** A mark's char offset (0 when absent = the word's start). */
export const markChar = (m: WordMark): number => m.char ?? 0;

/** True when `marks` is sorted by (word, char), unique, and every mark is
 *  in range for the phrase's words. */
export function validMarks(marks: WordMark[], words: string[]): boolean {
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (!Number.isInteger(m.word) || m.word < 0 || m.word >= words.length) {
      return false;
    }
    const c = markChar(m);
    if (!Number.isInteger(c) || c < 0 || c >= words[m.word].length) {
      return false;
    }
    if (i > 0) {
      const p = marks[i - 1];
      if (m.word < p.word || (m.word === p.word && c <= markChar(p))) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Toggle the highlight on word `word` (starting at character `char` of it
 * — 0 for the whole word, >0 for a syllable) in the lyric of bar `bar`.
 * Same-reference no-op when the bar/word doesn't exist or `char` is out
 * of range.
 */
export function toggleWordMark(
  line: Line,
  bar: number,
  word: number,
  char = 0
): Line {
  const span = line.lyrics.find((s) => s.bar === bar);
  if (!span) return line;
  const words = lyricWords(span.text);
  if (word < 0 || word >= words.length) return line;
  if (char < 0 || char >= words[word].length) return line;
  const marks = span.marks ?? [];
  const others = marks.filter(
    (m) => !(m.word === word && markChar(m) === char)
  );
  const next =
    others.length !== marks.length
      ? others
      : [...others, char > 0 ? { word, char } : { word }].sort(
          (a, b) => a.word - b.word || markChar(a) - markChar(b)
        );
  const nextSpan: LyricSpan = { text: span.text, bar: span.bar };
  if (next.length > 0) nextSpan.marks = next;
  return {
    ...line,
    lyrics: line.lyrics.map((s) => (s === span ? nextSpan : s)),
  };
}

/** One run of a phrase's text for rendering, highlighted or plain. */
export interface MarkRun {
  text: string;
  emph: boolean;
}

/**
 * Split a span's text into highlighted/plain runs. A mark highlights from
 * its char to the next mark in the same word (a syllable boundary) or the
 * word's end; the spaces between words stay plain. No marks → one plain
 * run. Adjacent runs of the same kind merge, so renderers get the fewest
 * pieces possible.
 */
export function markRuns(span: LyricSpan | undefined): MarkRun[] {
  if (!span) return [];
  const words = lyricWords(span.text);
  const marks = span.marks ?? [];
  const runs: MarkRun[] = [];
  const push = (text: string, emph: boolean) => {
    if (text === "") return;
    const last = runs[runs.length - 1];
    if (last && last.emph === emph) last.text += text;
    else runs.push({ text, emph });
  };
  words.forEach((w, wi) => {
    if (wi > 0) push(" ", false);
    const cuts = marks.filter((m) => m.word === wi).map(markChar);
    if (cuts.length === 0) {
      push(w, false);
      return;
    }
    push(w.slice(0, cuts[0]), false);
    cuts.forEach((c, i) => {
      push(w.slice(c, cuts[i + 1] ?? w.length), true);
    });
  });
  return runs;
}
