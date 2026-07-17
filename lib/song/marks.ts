/**
 * Word/syllable highlights: mark words (or [char, end) slices of them) of
 * a bar's lyric phrase so the singer can mentally tie them to the bar's
 * chords — the highlighted word/syllable is an implicit divider for the
 * human, nothing more. No beat is stored and rendering never repositions
 * text over it. Pure ops in the same style as chords.ts / lyrics.ts —
 * every function returns the *same reference* on a no-op.
 *
 * Invariants on a span's marks (normalizeSongData enforces them on load,
 * the ops preserve them): sorted by (word, char), unique, word < the
 * phrase's word count, 0 ≤ char < that word's length, and when `end` is
 * present, char < end ≤ that word's length. Marks may overlap (older
 * blobs stored stacked no-`end` marks); rendering merges them.
 */
import { lyricWords } from "./lyrics";
import type { Line, LyricSpan, WordMark } from "./types";

/** A mark's char offset (0 when absent = the word's start). */
export const markChar = (m: WordMark): number => m.char ?? 0;

/** A mark's end offset in a word of length `len` (absent = the word's end). */
export const markEnd = (m: WordMark, len: number): number =>
  m.end === undefined ? len : Math.min(m.end, len);

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
    if (
      m.end !== undefined &&
      (!Number.isInteger(m.end) || m.end <= c || m.end > words[m.word].length)
    ) {
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
 * The highlighted [start, end) char intervals of word `wi` (length `len`),
 * sorted and merged — overlapping/touching marks collapse into one
 * interval, so callers get the effective highlight, not the raw marks.
 */
export function wordIntervals(
  marks: WordMark[] | undefined,
  wi: number,
  len: number
): [number, number][] {
  const out: [number, number][] = [];
  for (const m of marks ?? []) {
    if (m.word !== wi) continue;
    const a = markChar(m);
    const b = markEnd(m, len);
    if (a >= b) continue;
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Toggle the highlight on characters [from, to) of word `word` in the
 * lyric of bar `bar`. Toggling means what the eye expects: a range that is
 * already fully highlighted turns off (splitting whatever mark covered
 * it), anything else turns on (merging with highlights it touches).
 * Same-reference no-op when the bar/word doesn't exist or the range is
 * out of bounds.
 */
export function toggleWordRange(
  line: Line,
  bar: number,
  word: number,
  from: number,
  to: number
): Line {
  const span = line.lyrics.find((s) => s.bar === bar);
  if (!span) return line;
  const words = lyricWords(span.text);
  if (word < 0 || word >= words.length) return line;
  const len = words[word].length;
  if (!Number.isInteger(from) || !Number.isInteger(to)) return line;
  if (from < 0 || from >= to || to > len) return line;

  const intervals = wordIntervals(span.marks, word, len);
  const covered = intervals.some(([a, b]) => a <= from && to <= b);
  const next: [number, number][] = [];
  if (covered) {
    for (const [a, b] of intervals) {
      if (b <= from || a >= to) {
        next.push([a, b]);
        continue;
      }
      if (a < from) next.push([a, from]);
      if (b > to) next.push([to, b]);
    }
  } else {
    let lo = from;
    let hi = to;
    for (const [a, b] of intervals) {
      if (b < lo || a > hi) next.push([a, b]);
      else {
        lo = Math.min(lo, a);
        hi = Math.max(hi, b);
      }
    }
    next.push([lo, hi]);
    next.sort((p, q) => p[0] - q[0]);
  }

  const marks = [
    ...(span.marks ?? []).filter((m) => m.word !== word),
    ...next.map(([a, b]) => {
      const m: WordMark = { word };
      if (a > 0) m.char = a;
      if (b < len) m.end = b;
      return m;
    }),
  ].sort((a, b) => a.word - b.word || markChar(a) - markChar(b));

  const nextSpan: LyricSpan = { text: span.text, bar: span.bar };
  if (marks.length > 0) nextSpan.marks = marks;
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
 * One word's text as highlighted/plain runs, from its effective intervals
 * (see wordIntervals). The single-word building block behind markRuns,
 * exported so reshape's word chips render highlights exactly like the
 * song map does.
 */
export function wordRuns(
  word: string,
  intervals: [number, number][]
): MarkRun[] {
  const runs: MarkRun[] = [];
  let pos = 0;
  for (const [a, b] of intervals) {
    if (a > pos) runs.push({ text: word.slice(pos, a), emph: false });
    runs.push({ text: word.slice(a, b), emph: true });
    pos = b;
  }
  if (pos < word.length) runs.push({ text: word.slice(pos), emph: false });
  return runs;
}

/**
 * Split a span's text into highlighted/plain runs. A mark highlights
 * [char, end) of its word (end absent = the word's end); the spaces
 * between words stay plain. No marks → one plain run. Adjacent runs of
 * the same kind merge, so renderers get the fewest pieces possible.
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
    for (const run of wordRuns(w, wordIntervals(marks, wi, w.length))) {
      push(run.text, run.emph);
    }
  });
  return runs;
}
