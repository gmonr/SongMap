/**
 * Word-granularity lyric redistribution within one Line, for the reshape
 * view's Lyrics mode. Imports get the words right far more often than the
 * word→bar grouping, so these ops move words between neighboring bars without
 * ever retyping text.
 *
 * A "word" is a whitespace-delimited token; rebuilding joins with a single
 * space, so runs of internal whitespace are normalized away. Every function
 * returns the *same Line reference* when the op is a no-op, so callers can
 * cheaply detect "nothing changed" (the reshape view uses this to keep stray
 * taps from dirtying the save state).
 */
import { fromDense, toDense } from "./lines";
import type { Bar, Line, WordAnchor } from "./types";

/**
 * Anchors that survive retyping a phrase into `words` (same word count —
 * callers enforce that): word-start anchors always do, syllable anchors
 * only while their char offset still falls inside the (possibly shorter)
 * new word. Undefined when none survive.
 */
export function anchorsAfterRetype(
  anchors: WordAnchor[] | undefined,
  words: string[]
): WordAnchor[] | undefined {
  if (!anchors) return undefined;
  const kept = anchors.filter(
    (a) => a.word < words.length && (a.char ?? 0) < words[a.word].length
  );
  return kept.length > 0 ? kept : undefined;
}

/** Anchors filtered to what a destination bar can hold (its beat range);
 *  undefined when none survive, so spans don't carry empty arrays. */
function anchorsFor(
  anchors: WordAnchor[] | undefined,
  bar: Bar
): WordAnchor[] | undefined {
  if (!anchors) return undefined;
  const total = bar.chords.reduce((sum, c) => sum + c.beats, 0);
  const kept = anchors.filter((a) => a.beat < total);
  return kept.length > 0 ? kept : undefined;
}

export interface WordLayout {
  /** Every word in the row, in order. */
  words: string[];
  /** Per bar: its words and the global index of its first word. */
  bars: { words: string[]; start: number }[];
}

/** Split a lyric phrase into words. */
export function lyricWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** How the row's words are currently distributed over its bars. */
export function lineWordLayout(line: Line): WordLayout {
  const words: string[] = [];
  const bars = toDense(line).map((cell) => {
    const w = lyricWords(cell.lyric);
    const start = words.length;
    words.push(...w);
    return { words: w, start };
  });
  return { words, bars };
}

/**
 * Move the boundary between bars `boundary - 1` and `boundary` so that
 * exactly `gap` words (counted from the start of the row) sit to its left.
 * Words transfer only between those two bars — every other bar keeps its
 * word count — so `gap` is clamped to the range the pair spans. Either bar
 * of the pair may end up with zero words (its lyric span disappears).
 *
 * Anchors: words that stay in their bar keep theirs (reindexed on the right
 * side); words that changed bars arrive unanchored — their old beats
 * belonged to the other bar.
 */
export function setWordBoundary(
  line: Line,
  boundary: number,
  gap: number
): Line {
  if (boundary < 1 || boundary >= line.bars.length) return line;
  const layout = lineWordLayout(line);
  const left = layout.bars[boundary - 1];
  const right = layout.bars[boundary];
  const lo = left.start;
  const hi = right.start + right.words.length;
  const target = Math.min(Math.max(gap, lo), hi);
  if (target === right.start) return line;
  const pair = layout.words.slice(lo, hi);
  const cells = toDense(line);
  const newLeftCount = target - lo;
  // Words transferred into the right bar shift its surviving anchors' word
  // indexes by the same amount the boundary moved.
  const delta = target - right.start;
  const leftAnchors = cells[boundary - 1].anchors?.filter(
    (a) => a.word < newLeftCount
  );
  const rightAnchors = cells[boundary].anchors
    ?.filter((a) => a.word >= Math.max(delta, 0))
    .map((a) => ({ ...a, word: a.word - delta }));
  // A pickup marker names the downbeat's word index: transferred front
  // words shift it (never past either end of the new phrase).
  const leadOf = (cell: { lead?: number }, shift: number, count: number) => {
    if (!cell.lead) return undefined;
    const lead = Math.min(Math.max(cell.lead - shift, 0), Math.max(count - 1, 0));
    return lead > 0 ? lead : undefined;
  };
  const rightCount = pair.length - newLeftCount;
  cells[boundary - 1] = {
    ...cells[boundary - 1],
    lyric: pair.slice(0, newLeftCount).join(" "),
    anchors: leftAnchors?.length ? leftAnchors : undefined,
    lead: leadOf(cells[boundary - 1], 0, newLeftCount),
  };
  cells[boundary] = {
    ...cells[boundary],
    lyric: pair.slice(newLeftCount).join(" "),
    anchors: rightAnchors?.length ? rightAnchors : undefined,
    lead: leadOf(cells[boundary], delta, rightCount),
  };
  return fromDense(cells);
}

/**
 * Replace the lyric of bar `bar` with `text`, whitespace-normalized like
 * every op in this module; "" (or only whitespace) removes the span. Other
 * bars are untouched. Same-reference no-op when the bar doesn't exist or the
 * normalized text matches what's already there.
 *
 * Anchors survive a retype that keeps the word count (fixing a typo keeps
 * the alignment); a different word count invalidates them — the indexes no
 * longer name the same words — so they drop.
 */
export function setBarLyric(line: Line, bar: number, text: string): Line {
  if (bar < 0 || bar >= line.bars.length) return line;
  const words = lyricWords(text);
  const next = words.join(" ");
  const cells = toDense(line);
  if (next === cells[bar].lyric) return line;
  const sameWordCount =
    words.length === lyricWords(cells[bar].lyric).length;
  cells[bar] = {
    ...cells[bar],
    lyric: next,
    anchors: sameWordCount
      ? anchorsAfterRetype(cells[bar].anchors, words)
      : undefined,
    lead: sameWordCount ? cells[bar].lead : undefined,
  };
  return fromDense(cells);
}

/**
 * Mark the first `lead` words of bar `bar`'s phrase as its anacrusis
 * (pickup — sung before the bar's downbeat); 0 clears the marker. Beat
 * anchors on the pickup words un-pin (they no longer sit in the bar's beat
 * layout). Same-reference no-op when the bar has no lyric, `lead` isn't a
 * sensible count (0 ≤ lead < word count), or nothing changes.
 */
export function setLead(line: Line, bar: number, lead: number): Line {
  const cells = toDense(line);
  const cell = cells[bar];
  if (!cell || cell.lyric === "") return line;
  const count = lyricWords(cell.lyric).length;
  if (!Number.isInteger(lead) || lead < 0 || lead >= count) return line;
  if ((cell.lead ?? 0) === lead) return line;
  const anchors = cell.anchors?.filter((a) => a.word >= lead);
  cells[bar] = {
    ...cell,
    lead: lead > 0 ? lead : undefined,
    anchors: anchors?.length ? anchors : undefined,
  };
  return fromDense(cells);
}

/**
 * Move the whole lyric of bar `from` one bar over in `dir`. If the target
 * bar already has a lyric, the occupied chain starting there shifts one bar
 * along in the same direction, into the first empty bar of the row. No-op
 * (same reference) when `from` has no lyric, the move would leave the row,
 * or there is no empty bar to absorb the chain.
 */
export function shiftLyric(line: Line, from: number, dir: -1 | 1): Line {
  const cells = toDense(line);
  const src = cells[from];
  if (!src || src.lyric === "") return line;
  const to = from + dir;
  if (to < 0 || to >= cells.length) return line;
  // Walk past the occupied chain to the empty cell that will absorb it.
  let end = to;
  while (end >= 0 && end < cells.length && cells[end].lyric !== "") end += dir;
  if (end < 0 || end >= cells.length) return line;
  // Anchors travel with their phrase (beats are bar-relative, so they stay
  // meaningful), except any past the destination bar's beat range.
  const out = cells.map((c) => ({ ...c }));
  for (let i = end; i !== to; i -= dir) {
    out[i].lyric = out[i - dir].lyric;
    out[i].anchors = anchorsFor(out[i - dir].anchors, out[i].bar);
    out[i].lead = out[i - dir].lead;
  }
  out[to].lyric = src.lyric;
  out[to].anchors = anchorsFor(src.anchors, out[to].bar);
  out[to].lead = src.lead;
  out[from].lyric = "";
  out[from].anchors = undefined;
  out[from].lead = undefined;
  return fromDense(out);
}
