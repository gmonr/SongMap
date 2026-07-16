/**
 * Word→beat anchors: pin words of a bar's lyric phrase to beats of that bar
 * so the words track the chord/beat layout (resizing a chord drags the word
 * anchored at its boundary along). Pure ops in the same style as chords.ts /
 * lyrics.ts — every function returns the *same reference* on a no-op.
 *
 * Invariants on a span's anchors (normalizeSongData enforces them on load,
 * the ops preserve them): sorted by `word`, words unique and < the phrase's
 * word count, beats integers in [0, bar total), strictly increasing.
 */
import { setBeatBoundary } from "./chords";
import { lyricWords } from "./lyrics";
import type { Bar, Line, LyricSpan, WordAnchor } from "./types";

/** Total beats of a bar (the sum of its chords' beat counts). */
export function barTotalBeats(bar: Bar): number {
  return bar.chords.reduce((sum, c) => sum + c.beats, 0);
}

/** True when `anchors` is sorted by word, unique, strictly increasing in
 *  beat, and every anchor is in range for the phrase and bar. */
export function validAnchors(
  anchors: WordAnchor[],
  wordCount: number,
  totalBeats: number
): boolean {
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (!Number.isInteger(a.word) || a.word < 0 || a.word >= wordCount) {
      return false;
    }
    if (!Number.isInteger(a.beat) || a.beat < 0 || a.beat >= totalBeats) {
      return false;
    }
    if (i > 0 && (a.word <= anchors[i - 1].word || a.beat <= anchors[i - 1].beat)) {
      return false;
    }
  }
  return true;
}

/**
 * Set (or clear, with `beat: null`) the anchor of word `word` in the lyric
 * of bar `bar`. Same-reference no-op when the bar/word doesn't exist, the
 * anchor is already there, or the result would break the anchor ordering
 * (a word can't be pinned to an earlier beat than a preceding pinned word).
 */
export function setWordAnchor(
  line: Line,
  bar: number,
  word: number,
  beat: number | null
): Line {
  const span = line.lyrics.find((s) => s.bar === bar);
  if (!span) return line;
  const words = lyricWords(span.text);
  if (word < 0 || word >= words.length) return line;
  const anchors = span.anchors ?? [];
  const existing = anchors.find((a) => a.word === word);

  let next: WordAnchor[];
  if (beat === null) {
    if (!existing) return line;
    next = anchors.filter((a) => a.word !== word);
  } else {
    if (existing?.beat === beat) return line;
    next = [...anchors.filter((a) => a.word !== word), { word, beat }].sort(
      (a, b) => a.word - b.word
    );
    if (!validAnchors(next, words.length, barTotalBeats(line.bars[bar]))) {
      return line;
    }
  }

  const nextSpan: LyricSpan = { text: span.text, bar: span.bar };
  if (next.length > 0) nextSpan.anchors = next;
  return {
    ...line,
    lyrics: line.lyrics.map((s) => (s === span ? nextSpan : s)),
  };
}

/** One run of words sharing a beat position, for rendering a bar's lyric
 *  proportionally under its chords. */
export interface AnchorSegment {
  text: string;
  /** Beat this segment starts at (0 for the leading unanchored words). */
  startBeat: number;
  /** Beats until the next segment (flex-grow weight). */
  grow: number;
  /** True when the segment starts at an anchored word. */
  anchored: boolean;
}

/**
 * Split a bar's lyric at its anchored words: segment 0 holds the unanchored
 * leading words at beat 0 (possibly empty, as a spacer), then one segment
 * per anchor running to the next anchor (the last runs to the bar's end).
 * No anchors → a single full-width segment, which renders exactly like the
 * plain phrase did.
 */
export function anchorSegments(
  bar: Bar,
  span: LyricSpan | undefined
): AnchorSegment[] {
  const total = barTotalBeats(bar);
  const words = span ? lyricWords(span.text) : [];
  const anchors = span?.anchors ?? [];
  if (anchors.length === 0) {
    return [{ text: words.join(" "), startBeat: 0, grow: total, anchored: false }];
  }
  const segments: AnchorSegment[] = [];
  const leading = words.slice(0, anchors[0].word).join(" ");
  if (leading !== "" || anchors[0].beat > 0) {
    segments.push({
      text: leading,
      startBeat: 0,
      grow: anchors[0].beat,
      anchored: false,
    });
  }
  anchors.forEach((a, i) => {
    const endWord = i + 1 < anchors.length ? anchors[i + 1].word : words.length;
    const endBeat = i + 1 < anchors.length ? anchors[i + 1].beat : total;
    segments.push({
      text: words.slice(a.word, endWord).join(" "),
      startBeat: a.beat,
      grow: endBeat - a.beat,
      anchored: true,
    });
  });
  return segments;
}

/**
 * Move the beat boundary between chords `ci` and `ci + 1` of bar `bi` (see
 * setBeatBoundary) *and* keep the lyric anchored to it in tow: an anchor
 * sitting exactly on the old boundary beat moves to the new one. Other
 * anchors keep their absolute beats — that's what beat-anchoring means —
 * except any the moved anchor would leapfrog, which un-anchor (order can't
 * be preserved honestly).
 */
export function setBarBeatBoundary(
  line: Line,
  bi: number,
  ci: number,
  beats: number
): Line {
  const barHere = line.bars[bi];
  if (!barHere) return line;
  const nextBar = setBeatBoundary(barHere, ci, beats);
  if (nextBar === barHere) return line;

  let start = 0;
  for (let i = 0; i < ci; i++) start += barHere.chords[i].beats;
  const oldBoundary = start + barHere.chords[ci].beats;
  const newBoundary = start + beats;

  const bars = line.bars.map((b, i) => (i === bi ? nextBar : b));
  const span = line.lyrics.find((s) => s.bar === bi);
  const moved = span?.anchors?.find((a) => a.beat === oldBoundary);
  if (!span?.anchors || !moved) return { ...line, bars };

  const next = span.anchors
    .map((a) => (a === moved ? { ...a, beat: newBoundary } : a))
    .filter(
      (a) =>
        a.word === moved.word ||
        (a.word < moved.word ? a.beat < newBoundary : a.beat > newBoundary)
    );
  const nextSpan: LyricSpan = { text: span.text, bar: span.bar };
  if (next.length > 0) nextSpan.anchors = next;
  return {
    bars,
    lyrics: line.lyrics.map((s) => (s === span ? nextSpan : s)),
  };
}
