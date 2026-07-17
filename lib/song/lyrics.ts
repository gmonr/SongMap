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
import type { Line, SongData, WordMark } from "./types";

/**
 * Highlights that survive retyping a phrase into `words` (same word count —
 * callers enforce that): word-start marks always do, syllable marks only
 * while their char offset still falls inside the (possibly shorter) new
 * word. An `end` past the new word's length falls back to "the word's
 * end". Undefined when none survive.
 */
export function marksAfterRetype(
  marks: WordMark[] | undefined,
  words: string[]
): WordMark[] | undefined {
  if (!marks) return undefined;
  const kept: WordMark[] = [];
  for (const m of marks) {
    if (m.word >= words.length) continue;
    const len = words[m.word].length;
    if ((m.char ?? 0) >= len) continue;
    if (m.end !== undefined && m.end > len) {
      const { end: _dropped, ...rest } = m;
      kept.push(rest);
    } else {
      kept.push(m);
    }
  }
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
 * Highlights are word-indexed with no bar-dependent state, so they travel
 * with their words: marks on words that change bars re-index into the new
 * phrase instead of dropping.
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
  // Both bars' marks, addressed by index into the pair's words, then dealt
  // back out to whichever side each word landed on.
  const oldLeftCount = left.words.length;
  const pairMarks = [
    ...(cells[boundary - 1].marks ?? []),
    ...(cells[boundary].marks ?? []).map((m) => ({
      ...m,
      word: m.word + oldLeftCount,
    })),
  ];
  const leftMarks = pairMarks.filter((m) => m.word < newLeftCount);
  const rightMarks = pairMarks
    .filter((m) => m.word >= newLeftCount)
    .map((m) => ({ ...m, word: m.word - newLeftCount }));
  cells[boundary - 1] = {
    ...cells[boundary - 1],
    lyric: pair.slice(0, newLeftCount).join(" "),
    marks: leftMarks.length > 0 ? leftMarks : undefined,
  };
  cells[boundary] = {
    ...cells[boundary],
    lyric: pair.slice(newLeftCount).join(" "),
    marks: rightMarks.length > 0 ? rightMarks : undefined,
  };
  return fromDense(cells);
}

/**
 * Replace the lyric of bar `bar` with `text`, whitespace-normalized like
 * every op in this module; "" (or only whitespace) removes the span. Other
 * bars are untouched. Same-reference no-op when the bar doesn't exist or the
 * normalized text matches what's already there.
 *
 * Highlights survive a retype that keeps the word count (fixing a typo
 * keeps them); a different word count invalidates them — the indexes no
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
    marks: sameWordCount
      ? marksAfterRetype(cells[bar].marks, words)
      : undefined,
  };
  return fromDense(cells);
}

/** A bar's song-wide address, for the seam ops that cross row/section
 *  boundaries. */
export interface SeamBar {
  sectionId: string;
  li: number;
  bi: number;
}

/**
 * The bar just before the seam at the start of line `li` of section
 * `sectionId`: the last bar of the nearest earlier line that has any bars,
 * scanning up through the section and then through earlier sections in
 * `order` (the reshape view's display order). Null when no bar precedes
 * the seam anywhere in the song.
 */
export function barBeforeSeam(
  data: SongData,
  order: string[],
  sectionId: string,
  li: number
): SeamBar | null {
  const lastBarUpTo = (id: string, fromLine: number): SeamBar | null => {
    const lines = data.sections[id]?.lines ?? [];
    for (let l = Math.min(fromLine, lines.length - 1); l >= 0; l--) {
      const bars = lines[l].bars;
      if (bars.length > 0) {
        return { sectionId: id, li: l, bi: bars.length - 1 };
      }
    }
    return null;
  };
  const inSection = lastBarUpTo(sectionId, li - 1);
  if (inSection) return inSection;
  for (let s = order.indexOf(sectionId) - 1; s >= 0; s--) {
    const before = lastBarUpTo(order[s], Infinity);
    if (before) return before;
  }
  return null;
}

/**
 * Move one word across the seam at the start of line `li` of section
 * `sectionId` — the bar boundary rendered before the row's first bar.
 * Lyrics are a song-wide continuous string, so the word transfers between
 * the two bars adjacent to the seam even when they live in different rows
 * or different sections: dir -1 sends the left bar's last word rightward
 * into the row's first bar, dir 1 sends that bar's first word leftward.
 * Highlights travel with their word. Same-reference no-op when the row
 * doesn't exist, nothing precedes the seam, or the donor bar has no words.
 */
export function moveSeamWord(
  data: SongData,
  order: string[],
  sectionId: string,
  li: number,
  dir: -1 | 1
): SongData {
  const rightLine = data.sections[sectionId]?.lines[li];
  if (!rightLine || rightLine.bars.length === 0) return data;
  const left = barBeforeSeam(data, order, sectionId, li);
  if (!left) return data;

  const leftLine = data.sections[left.sectionId].lines[left.li];
  const leftCells = toDense(leftLine);
  const rightCells = toDense(rightLine);
  const lc = leftCells[left.bi];
  const rc = rightCells[0];
  const leftWords = lyricWords(lc.lyric);
  const rightWords = lyricWords(rc.lyric);

  if (dir === -1) {
    if (leftWords.length === 0) return data;
    const movedIdx = leftWords.length - 1;
    const keptLeft = (lc.marks ?? []).filter((m) => m.word < movedIdx);
    const marks = [
      ...(lc.marks ?? [])
        .filter((m) => m.word === movedIdx)
        .map((m) => ({ ...m, word: 0 })),
      ...(rc.marks ?? []).map((m) => ({ ...m, word: m.word + 1 })),
    ];
    leftCells[left.bi] = {
      ...lc,
      lyric: leftWords.slice(0, movedIdx).join(" "),
      marks: keptLeft.length > 0 ? keptLeft : undefined,
    };
    rightCells[0] = {
      ...rc,
      lyric: [leftWords[movedIdx], ...rightWords].join(" "),
      marks: marks.length > 0 ? marks : undefined,
    };
  } else {
    if (rightWords.length === 0) return data;
    const marks = [
      ...(lc.marks ?? []),
      ...(rc.marks ?? [])
        .filter((m) => m.word === 0)
        .map((m) => ({ ...m, word: leftWords.length })),
    ];
    const keptRight = (rc.marks ?? [])
      .filter((m) => m.word > 0)
      .map((m) => ({ ...m, word: m.word - 1 }));
    leftCells[left.bi] = {
      ...lc,
      lyric: [...leftWords, rightWords[0]].join(" "),
      marks: marks.length > 0 ? marks : undefined,
    };
    rightCells[0] = {
      ...rc,
      lyric: rightWords.slice(1).join(" "),
      marks: keptRight.length > 0 ? keptRight : undefined,
    };
  }

  // Rebuild the touched line(s) — sequential so a same-section pair (a
  // seam between two rows of one section) stacks both line replacements.
  const sections = { ...data.sections };
  const setLine = (id: string, l: number, line: Line) => {
    sections[id] = {
      ...sections[id],
      lines: sections[id].lines.map((x, i) => (i === l ? line : x)),
    };
  };
  setLine(left.sectionId, left.li, fromDense(leftCells));
  setLine(sectionId, li, fromDense(rightCells));
  return { ...data, sections };
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
  // Highlights travel with their phrase — they carry no bar-specific state.
  const out = cells.map((c) => ({ ...c }));
  for (let i = end; i !== to; i -= dir) {
    out[i].lyric = out[i - dir].lyric;
    out[i].marks = out[i - dir].marks;
  }
  out[to].lyric = src.lyric;
  out[to].marks = src.marks;
  out[from].lyric = "";
  out[from].marks = undefined;
  return fromDense(out);
}
