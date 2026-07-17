/**
 * Playback timeline: flattens a song's arrangement into an ordered list of
 * bars with absolute beat offsets, so the audio scheduler and the playhead
 * highlight share one source of truth. Pure data — no Web Audio here.
 *
 * Repeats (`×2`) are unrolled into passes, `sameChordsAs` instances play
 * their own section's lines (the reference only affects rendering), and
 * empty `""` chord placeholders ("— same as before") inherit the previous
 * chord symbol in arrangement order so they still sound.
 */
import type { SongData } from "./types";

/** One chord strike within a timeline bar. */
export interface TimelineChord {
  /** Effective symbol after carry-forward; "" only before any real chord. */
  sym: string;
  beats: number;
  /** Absolute beat offset from the start of the song. */
  startBeat: number;
}

/** One bar of the flattened arrangement. */
export interface TimelineBar {
  /** Index into `arrangement`. */
  arrIdx: number;
  /** 0-based repeat pass of that arrangement item. */
  pass: number;
  /** Line / bar indexes within the section definition. */
  li: number;
  bi: number;
  /** Absolute beat offset from the start of the song. */
  startBeat: number;
  /** Total beats in this bar (sum of its chords'). */
  beats: number;
  chords: TimelineChord[];
}

export interface Timeline {
  bars: TimelineBar[];
  totalBeats: number;
}

/**
 * Flatten `data.arrangement` into a playable bar list. `fallbackBeats`
 * (from the time signature) is used for degenerate bars with no chords.
 */
export function buildTimeline(data: SongData, fallbackBeats = 4): Timeline {
  const bars: TimelineBar[] = [];
  let beat = 0;
  let lastSym = "";

  data.arrangement.forEach((item, arrIdx) => {
    const def = data.sections[item.ref];
    if (!def) return;
    const passes = Math.max(1, item.repeat ?? 1);
    for (let pass = 0; pass < passes; pass++) {
      def.lines.forEach((line, li) => {
        line.bars.forEach((bar, bi) => {
          const chords: TimelineChord[] = [];
          let offset = 0;
          for (const cell of bar.chords) {
            const beats = Math.max(1, cell.beats || 0);
            const sym = cell.sym.trim() || lastSym;
            if (sym) lastSym = sym;
            chords.push({ sym, beats, startBeat: beat + offset });
            offset += beats;
          }
          const beats = offset || fallbackBeats;
          bars.push({ arrIdx, pass, li, bi, startBeat: beat, beats, chords });
          beat += beats;
        });
      });
    }
  });

  return { bars, totalBeats: beat };
}

/**
 * [start, end) timeline indexes of the arrangement item containing bar
 * `idx` — every repeat pass included, so looping a `×2` chorus plays both.
 */
export function sectionLoopRange(t: Timeline, idx: number): [number, number] {
  const bar = t.bars[idx];
  if (!bar) return [0, t.bars.length];
  let start = idx;
  while (start > 0 && t.bars[start - 1].arrIdx === bar.arrIdx) start--;
  let end = idx + 1;
  while (end < t.bars.length && t.bars[end].arrIdx === bar.arrIdx) end++;
  return [start, end];
}

/** First timeline index of arrangement item `arrIdx`, or -1 if it has no bars. */
export function firstBarOfItem(t: Timeline, arrIdx: number): number {
  return t.bars.findIndex((b) => b.arrIdx === arrIdx);
}

/**
 * Timeline index of the bar at (arrIdx, li, bi) — first repeat pass — or -1
 * when no such bar exists. This is how a tap on a rendered bar (which knows
 * its section-relative indexes) becomes a playback position.
 */
export function barIndexAt(
  t: Timeline,
  arrIdx: number,
  li: number,
  bi: number
): number {
  return t.bars.findIndex(
    (b) => b.arrIdx === arrIdx && b.pass === 0 && b.li === li && b.bi === bi
  );
}

/**
 * Timeline index of bar (li, bi) of section `sectionId`'s first arrangement
 * instance, or -1 when the section isn't arranged or has no such bar. This
 * is how reshape — which addresses bars by section, not arrangement item —
 * turns a selection into a playback position.
 */
export function barIndexForSection(
  t: Timeline,
  arrangement: SongData["arrangement"],
  sectionId: string,
  li: number,
  bi: number
): number {
  const arrIdx = arrangement.findIndex((it) => it.ref === sectionId);
  if (arrIdx === -1) return -1;
  return barIndexAt(t, arrIdx, li, bi);
}
