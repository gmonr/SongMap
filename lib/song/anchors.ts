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

/** An anchor's char offset (0 when absent = the word's start). */
export const anchorChar = (a: WordAnchor): number => a.char ?? 0;

/** True when `anchors` is sorted by (word, char), unique, strictly
 *  increasing in beat, and every anchor is in range for the phrase's words
 *  and the bar's beats. */
export function validAnchors(
  anchors: WordAnchor[],
  words: string[],
  totalBeats: number
): boolean {
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (!Number.isInteger(a.word) || a.word < 0 || a.word >= words.length) {
      return false;
    }
    const c = anchorChar(a);
    if (!Number.isInteger(c) || c < 0 || c >= words[a.word].length) {
      return false;
    }
    if (!Number.isInteger(a.beat) || a.beat < 0 || a.beat >= totalBeats) {
      return false;
    }
    if (i > 0) {
      const p = anchors[i - 1];
      const ordered =
        a.word > p.word || (a.word === p.word && c > anchorChar(p));
      if (!ordered || a.beat <= p.beat) return false;
    }
  }
  return true;
}

/**
 * Set (or clear, with `beat: null`) the anchor of word `word` (starting at
 * character `char` of it — 0 for the whole word, >0 for a syllable) in the
 * lyric of bar `bar`. Same-reference no-op when the bar/word doesn't exist,
 * the anchor is already there, or the result would break the anchor
 * ordering (a word/syllable can't be pinned to an earlier beat than a
 * preceding pinned one).
 */
export function setWordAnchor(
  line: Line,
  bar: number,
  word: number,
  beat: number | null,
  char = 0
): Line {
  const span = line.lyrics.find((s) => s.bar === bar);
  if (!span) return line;
  const words = lyricWords(span.text);
  if (word < 0 || word >= words.length) return line;
  // Pickup words sound before the downbeat — they have no beat to pin to.
  if (word < (span.lead ?? 0)) return line;
  const anchors = span.anchors ?? [];
  const others = anchors.filter(
    (a) => !(a.word === word && anchorChar(a) === char)
  );
  const existing = anchors.length !== others.length;

  let next: WordAnchor[];
  if (beat === null) {
    if (!existing) return line;
    next = others;
  } else {
    if (anchors.some((a) => a.word === word && anchorChar(a) === char && a.beat === beat)) {
      return line;
    }
    const added: WordAnchor = char > 0 ? { word, beat, char } : { word, beat };
    next = [...others, added].sort(
      (a, b) => a.word - b.word || anchorChar(a) - anchorChar(b)
    );
    if (!validAnchors(next, words, barTotalBeats(line.bars[bar]))) {
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
  /** True when the segment starts at an anchored word/syllable. */
  anchored: boolean;
  /** Length of the anchored word/syllable at the start of `text` (the part
   *  the beat lands on, rendered emphasized); 0 when unanchored. */
  emphLen: number;
}

/** The phrase text from one (word, char) position up to another (or the
 *  end), keeping single-space joins. */
function sliceWords(
  words: string[],
  from: { word: number; char: number },
  to?: { word: number; char: number }
): string {
  if (to && to.word === from.word) {
    return words[from.word].slice(from.char, to.char);
  }
  const pieces = [
    words[from.word].slice(from.char),
    ...words.slice(from.word + 1, to?.word ?? words.length),
  ];
  if (to && to.char > 0) pieces.push(words[to.word].slice(0, to.char));
  return pieces.filter((p) => p !== "").join(" ");
}

/**
 * Split a bar's lyric at its anchors: segment 0 holds the unanchored
 * leading text at beat 0 (possibly empty, as a spacer), then one segment
 * per anchor running to the next anchor (the last runs to the bar's end).
 * A `char > 0` anchor cuts mid-word ("so" | "ñado"). No anchors → a single
 * full-width segment, which renders exactly like the plain phrase did.
 * Pickup words (span.lead) are excluded — they sound before the bar and
 * render separately (see leadText).
 */
export function anchorSegments(
  bar: Bar,
  span: LyricSpan | undefined
): AnchorSegment[] {
  const total = barTotalBeats(bar);
  const lead = span?.lead ?? 0;
  const words = span ? lyricWords(span.text).slice(lead) : [];
  const anchors = (span?.anchors ?? [])
    .filter((a) => a.word >= lead)
    .map((a) => (lead > 0 ? { ...a, word: a.word - lead } : a));
  if (anchors.length === 0) {
    return [
      {
        text: words.join(" "),
        startBeat: 0,
        grow: total,
        anchored: false,
        emphLen: 0,
      },
    ];
  }
  const at = (a: WordAnchor) => ({ word: a.word, char: anchorChar(a) });
  const segments: AnchorSegment[] = [];
  const leading = sliceWords(words, { word: 0, char: 0 }, at(anchors[0]));
  if (leading !== "" || anchors[0].beat > 0) {
    segments.push({
      text: leading,
      startBeat: 0,
      grow: anchors[0].beat,
      anchored: false,
      emphLen: 0,
    });
  }
  anchors.forEach((a, i) => {
    const next = i + 1 < anchors.length ? anchors[i + 1] : undefined;
    const text = sliceWords(words, at(a), next && at(next));
    // The emphasized part: the anchored word's remainder (or up to the next
    // anchor when that cuts the same word).
    const emphEnd =
      next && next.word === a.word ? anchorChar(next) : words[a.word].length;
    segments.push({
      text,
      startBeat: a.beat,
      grow: (next ? next.beat : total) - a.beat,
      anchored: true,
      emphLen: Math.min(emphEnd - anchorChar(a), text.length),
    });
  });
  return segments;
}

/** A span's pickup words ("" when it has none), for the hanging render. */
export function leadText(span: LyricSpan | undefined): string {
  if (!span?.lead) return "";
  return lyricWords(span.text).slice(0, span.lead).join(" ");
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

  const pos = (a: WordAnchor) => a.word + anchorChar(a) / 1e6;
  const movedPos = pos(moved);
  const next = span.anchors
    .map((a) => (a === moved ? { ...a, beat: newBoundary } : a))
    .filter(
      (a) =>
        pos(a) === movedPos ||
        (pos(a) < movedPos ? a.beat < newBoundary : a.beat > newBoundary)
    );
  const nextSpan: LyricSpan = { text: span.text, bar: span.bar };
  if (next.length > 0) nextSpan.anchors = next;
  return {
    bars,
    lyrics: line.lyrics.map((s) => (s === span ? nextSpan : s)),
  };
}
