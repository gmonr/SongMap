/**
 * Aligning LRCLIB's timed lyric lines with the song map. Pure logic.
 *
 * Two sides supply half a mapping each: an LRC line knows *when* its words
 * are sung (ms into the recording) but not where they sit on the map; the
 * song knows where every word sits (bar → absolute beat via the timeline)
 * but not when. Fuzzy word alignment joins them, and everything downstream
 * — anchor suggestions, phrase fills, mismatch checks — reuses the existing
 * beats↔ms machinery in lib/spotify/sync.ts.
 *
 * An LRC timestamp marks the vocal line's onset, not a bar's downbeat
 * (pickups and mid-bar entries are routine), so derived anchors are rough —
 * within a beat or so. Callers must present them as suggestions to confirm
 * and nudge, never as precise truth.
 */
import { toDense } from "@/lib/song/lines";
import { lyricWords } from "@/lib/song/lyrics";
import type { Timeline } from "@/lib/song/playback";
import type { SongData } from "@/lib/song/types";
import {
  msToBeat,
  type SpotifySyncData,
  type SyncAnchor,
} from "@/lib/spotify/sync";
import type { LrcLine } from "./lrc";

/** One word of the song, with its map address and absolute beat. */
export interface SongWord {
  text: string;
  norm: string;
  /** Section-definition address (what edits target). */
  sectionId: string;
  li: number;
  bar: number;
  /** Index within the bar's phrase. */
  wordIdx: number;
  /** Where this occurrence sits in the flattened timeline. */
  barTimelineIdx: number;
  startBeat: number;
  /** False on repeat passes — the same definition words replay. */
  firstPass: boolean;
}

/** Case/diacritic/punctuation-insensitive comparison form of a word. */
export function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Every song word in performance order: walks the flattened timeline
 * (repeats unrolled — the recording sings every pass) and emits each bar's
 * words with their definition address and absolute beat.
 */
export function songWordStream(data: SongData, timeline: Timeline): SongWord[] {
  const out: SongWord[] = [];
  timeline.bars.forEach((tb, idx) => {
    const ref = data.arrangement[tb.arrIdx]?.ref;
    const line = ref ? data.sections[ref]?.lines[tb.li] : undefined;
    if (!ref || !line) return;
    const words = lyricWords(toDense(line)[tb.bi]?.lyric ?? "");
    words.forEach((text, wordIdx) => {
      const norm = normalizeWord(text);
      if (!norm) return;
      out.push({
        text,
        norm,
        sectionId: ref,
        li: tb.li,
        bar: tb.bi,
        wordIdx,
        barTimelineIdx: idx,
        startBeat: tb.startBeat,
        firstPass: tb.pass === 0,
      });
    });
  });
  return out;
}

/** Near-match: 1 edit apart, or a ≥3-char prefix of the other. */
function nearMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.length - short.length > 1) {
    return false;
  }
  if (short.length >= 3 && long.startsWith(short)) return true;
  if (a.length === b.length) {
    if (a.length < 3) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i] && ++diff > 1) return false;
    }
    return true;
  }
  // One insertion apart: walk with a single allowed gap in the longer word.
  if (short.length < 3) return false;
  let i = 0;
  let j = 0;
  let gap = 0;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) {
      i++;
      j++;
    } else if (gap++ === 0) {
      j++;
    } else {
      return false;
    }
  }
  return true;
}

/** How well one LRC line bound to the song, and where it starts. */
export interface LineMatch {
  lineIdx: number;
  ms: number;
  text: string;
  /** The song word its first matched word aligned to, or null. */
  firstSongWord: SongWord | null;
  matchedCount: number;
  lineWordCount: number;
  /** matchedCount / lineWordCount (0 when the line has no usable words). */
  confidence: number;
}

const MATCH = 2;
const NEAR = 1;
const MISMATCH = -1;
const GAP = -1;

/** One matched word pair: song word `songIdx` sings LRC line `lineIdx`'s
 *  word `wordInLine`. */
export interface WordBinding {
  songIdx: number;
  lineIdx: number;
  wordInLine: number;
}

export interface AlignResult {
  lines: LineMatch[];
  /** Every matched word pair, in stream order. */
  bindings: WordBinding[];
}

/** Line-level view of alignWords, for callers that only need line stats. */
export function alignLyrics(
  songWords: SongWord[],
  lrcLines: LrcLine[]
): LineMatch[] {
  return alignWords(songWords, lrcLines).lines;
}

/**
 * Global (Needleman–Wunsch) alignment of the song's word stream against the
 * LRC's word stream — monotonic by construction, with gaps absorbing
 * ad-libs the LRC has and the map doesn't (and vice versa: chords-only
 * intros). Typical sizes are a few hundred words a side, so the quadratic
 * table is trivial. Returns per-LRC-line binding stats plus the word-level
 * pairs (what the placement shift builds on).
 */
export function alignWords(
  songWords: SongWord[],
  lrcLines: LrcLine[]
): AlignResult {
  const lrcWords: { norm: string; lineIdx: number; wordInLine: number }[] = [];
  lrcLines.forEach((l, lineIdx) => {
    lyricWords(l.text).forEach((w, wordInLine) => {
      const norm = normalizeWord(w);
      if (norm) lrcWords.push({ norm, lineIdx, wordInLine });
    });
  });

  const n = songWords.length;
  const m = lrcWords.length;
  const empty = (lineIdx: number): LineMatch => ({
    lineIdx,
    ms: lrcLines[lineIdx].ms,
    text: lrcLines[lineIdx].text,
    firstSongWord: null,
    matchedCount: 0,
    lineWordCount: 0,
    confidence: 0,
  });
  const stats = lrcLines.map((_, i) => empty(i));
  for (const w of lrcWords) stats[w.lineIdx].lineWordCount++;
  const bindings: WordBinding[] = [];
  if (n === 0 || m === 0) return { lines: stats, bindings };

  // DP table + traceback (0 = diag, 1 = up/skip song word, 2 = left/skip
  // LRC word), row-major (m + 1 columns).
  const cols = m + 1;
  const score = new Int32Array((n + 1) * cols);
  const move = new Uint8Array((n + 1) * cols);
  for (let j = 1; j <= m; j++) {
    score[j] = j * GAP;
    move[j] = 2;
  }
  for (let i = 1; i <= n; i++) {
    score[i * cols] = i * GAP;
    move[i * cols] = 1;
    for (let j = 1; j <= m; j++) {
      const a = songWords[i - 1].norm;
      const b = lrcWords[j - 1].norm;
      const pair =
        a === b ? MATCH : nearMatch(a, b) ? NEAR : MISMATCH;
      const diag = score[(i - 1) * cols + (j - 1)] + pair;
      const up = score[(i - 1) * cols + j] + GAP;
      const left = score[i * cols + (j - 1)] + GAP;
      let best = diag;
      let mv = 0;
      if (up > best) {
        best = up;
        mv = 1;
      }
      if (left > best) {
        best = left;
        mv = 2;
      }
      score[i * cols + j] = best;
      move[i * cols + j] = mv;
    }
  }

  // Walk back, crediting each diagonal step that actually matched to its
  // LRC line; a line's firstSongWord is its earliest matched word's binding.
  const firstWordInLine = new Int32Array(lrcLines.length).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const mv = move[i * cols + j];
    if (mv === 0) {
      const a = songWords[i - 1];
      const b = lrcWords[j - 1];
      if (a.norm === b.norm || nearMatch(a.norm, b.norm)) {
        const s = stats[b.lineIdx];
        s.matchedCount++;
        // Traceback runs right-to-left, so the last write per line wins —
        // which is that line's earliest word.
        s.firstSongWord = a;
        firstWordInLine[b.lineIdx] = b.wordInLine;
        bindings.push({
          songIdx: i - 1,
          lineIdx: b.lineIdx,
          wordInLine: b.wordInLine,
        });
      }
      i--;
      j--;
    } else if (mv === 1) {
      i--;
    } else {
      j--;
    }
  }

  for (const s of stats) {
    s.confidence =
      s.lineWordCount > 0 ? s.matchedCount / s.lineWordCount : 0;
    // A line whose own first word didn't bind starts somewhere fuzzy —
    // don't let a mid-line match masquerade as the line's start.
    if (s.firstSongWord && firstWordInLine[s.lineIdx] !== 0) {
      s.firstSongWord = null;
    }
  }
  bindings.reverse();
  return { lines: stats, bindings };
}

export const MIN_CONFIDENCE = 0.6;

/**
 * Largest bar shift the auto-move applies. Bigger disagreements are
 * reported but never acted on — they nearly always mean calibration or
 * structure problems (a +19-bar "shift" would cram whole sections into
 * one bar), not a genuinely misplaced phrase.
 */
export const MAX_SHIFT_BARS = 2;

/**
 * How many beats before its bar's downbeat a phrase's vocal onset may
 * legitimately fall (a pickup / anacrusis). Line-level LRC stamps onsets,
 * and it cannot distinguish "starts on a pickup" from "placed a bar
 * late" — inside this window the map wins and nothing is flagged, or the
 * check drowns in false ±1 "mismatches" on any song with pickups.
 */
export const PICKUP_BEATS = 2;

/**
 * Index of the bar whose downbeat is nearest `beat` (ties go to the later
 * bar — an onset midway is more often a pickup into the next bar than a
 * phrase dragging half a bar behind), or null outside the song.
 */
function nearestBarIndex(t: Timeline, beat: number): number | null {
  if (t.bars.length === 0 || beat < -PICKUP_BEATS || beat >= t.totalBeats) {
    return null;
  }
  if (beat <= 0) return 0;
  let lo = 0;
  let hi = t.bars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t.bars[mid].startBeat <= beat) lo = mid;
    else hi = mid - 1;
  }
  const cur = t.bars[lo];
  const next = t.bars[lo + 1];
  if (next && next.startBeat - beat <= beat - cur.startBeat) return lo + 1;
  return lo;
}

/** A line whose placement genuinely disagrees with its sung timing. */
export interface ShiftTarget {
  lineIdx: number;
  text: string;
  ms: number;
  /** Timeline index of the bar its words currently start in. */
  currentIdx: number;
  /** Timeline index of the bar nearest its sung onset. */
  suggestedIdx: number;
}

/**
 * The lines whose sung onsets fall outside their placed bar's tolerance
 * window — earlier than a pickup could explain, or past the bar's end —
 * each with the bar whose downbeat is nearest the onset. This is the one
 * mismatch definition both the report and the auto-shift consume, so what
 * the user is shown is exactly what applying would do.
 */
export function lineShiftTargets(
  matches: LineMatch[],
  timeline: Timeline,
  sync: SpotifySyncData,
  fallbackBpm: number
): ShiftTarget[] {
  const out: ShiftTarget[] = [];
  for (const s of matches) {
    if (s.confidence < MIN_CONFIDENCE || !s.firstSongWord) continue;
    const cur = timeline.bars[s.firstSongWord.barTimelineIdx];
    if (!cur) continue;
    const onset = msToBeat(sync, s.ms, fallbackBpm);
    const diff = onset - cur.startBeat;
    // A phrase may start anywhere inside its bar, or a pickup before it.
    if (diff >= -PICKUP_BEATS && diff < cur.beats) continue;
    const suggestedIdx = nearestBarIndex(timeline, onset);
    if (
      suggestedIdx === null ||
      suggestedIdx === s.firstSongWord.barTimelineIdx
    ) {
      continue;
    }
    out.push({
      lineIdx: s.lineIdx,
      text: s.text,
      ms: s.ms,
      currentIdx: s.firstSongWord.barTimelineIdx,
      suggestedIdx,
    });
  }
  return out;
}

/** The grid effectiveLyricSync settled on, and how far it can be trusted. */
export interface LyricSyncGrid {
  sync: SpotifySyncData;
  /** "calibration": real anchors. "fitted": inferred from the alignment. */
  source: "calibration" | "fitted";
  /** When fitted: the full suggestion, for offering as real calibration. */
  suggestion: AnchorSuggestion | null;
}

/**
 * The beats↔ms mapping lyric placement may trust: the real calibration
 * when it has ≥2 anchors (tempo comes from the anchors themselves), else
 * a tempo line fitted from the lyric alignment — the song's *own* grid,
 * so mismatches mean "this line sits off the grid the rest of the lyrics
 * define". Null when neither exists (e.g. a chords-only song with nothing
 * to fit): the 0-anchor "recording starts at bar 1 at the stored BPM"
 * assumption is wrong for any song with an intro, and acting on it crams
 * lyrics into wrong bars.
 *
 * A fitted grid is judged BY the placements it judges, so any uniform
 * error — the whole map shifted by an intro's worth of bars — vanishes
 * into the fit's intercept. It can only catch lines misplaced relative to
 * the others. Callers must not present a quiet fitted check as "the map
 * agrees with the recording"; the honest move is to offer `suggestion` as
 * playback calibration, which is what actually lines the two up.
 */
export function effectiveLyricSync(
  sync: SpotifySyncData,
  matches: LineMatch[]
): LyricSyncGrid | null {
  if (sync.anchors.length >= 2) {
    return { sync, source: "calibration", suggestion: null };
  }
  const fitted = suggestAnchors(matches);
  if (fitted.anchors.length < 2) return null;
  return {
    sync: { anchors: fitted.anchors },
    source: "fitted",
    suggestion: fitted,
  };
}

export interface AnchorSuggestion {
  anchors: SyncAnchor[];
  /** BPM implied by the fitted tempo line, for cross-checking song.tempo. */
  fittedBpm: number | null;
  /** How many lines were usable as (beat, ms) evidence. */
  candidateCount: number;
}

/** Residual RMS below which the fitted line replaces the raw points. */
const FIT_RMS_MS = 400;
/** Raw-candidate thinning distance (beats) when the fit is poor. */
const THIN_BEATS = 24;

/**
 * Sync-anchor proposals from aligned lines: lines that confidently start a
 * bar give (beat, ms) evidence; a least-squares tempo line smooths vocal-
 * onset jitter when it fits well, else the raw points are thinned. Rough
 * by nature — present as a suggestion with the nudge tools at hand.
 */
export function suggestAnchors(matches: LineMatch[]): AnchorSuggestion {
  const seen = new Set<number>();
  const pts: { beat: number; ms: number }[] = [];
  for (const s of matches) {
    if (s.confidence < MIN_CONFIDENCE || !s.firstSongWord) continue;
    // Only lines starting on a bar's first word pin that bar's downbeat.
    if (s.firstSongWord.wordIdx !== 0) continue;
    const beat = s.firstSongWord.startBeat;
    if (seen.has(beat)) continue;
    seen.add(beat);
    pts.push({ beat, ms: s.ms });
  }
  pts.sort((a, b) => a.beat - b.beat);
  // Monotonicity: a later beat must sound later, or one of the pair is a
  // misbinding (typically a repeated chorus) — drop the offender.
  const mono: typeof pts = [];
  for (const p of pts) {
    if (mono.length === 0 || p.ms > mono[mono.length - 1].ms) mono.push(p);
  }

  if (mono.length < 2) {
    return {
      anchors: mono.map((p) => ({ beat: p.beat, ms: Math.round(p.ms) })),
      fittedBpm: null,
      candidateCount: mono.length,
    };
  }

  // Least-squares ms = a·beat + b.
  const k = mono.length;
  let sumB = 0;
  let sumM = 0;
  let sumBB = 0;
  let sumBM = 0;
  for (const p of mono) {
    sumB += p.beat;
    sumM += p.ms;
    sumBB += p.beat * p.beat;
    sumBM += p.beat * p.ms;
  }
  const denom = k * sumBB - sumB * sumB;
  const a = denom !== 0 ? (k * sumBM - sumB * sumM) / denom : 0;
  const b = (sumM - a * sumB) / k;
  const fittedBpm = a > 0 ? Math.round(60000 / a) : null;

  if (a > 0) {
    let rss = 0;
    for (const p of mono) {
      const r = p.ms - (a * p.beat + b);
      rss += r * r;
    }
    if (Math.sqrt(rss / k) < FIT_RMS_MS) {
      const first = mono[0];
      const last = mono[k - 1];
      return {
        anchors: [
          { beat: first.beat, ms: Math.max(0, Math.round(a * first.beat + b)) },
          { beat: last.beat, ms: Math.max(0, Math.round(a * last.beat + b)) },
        ],
        fittedBpm,
        candidateCount: k,
      };
    }
  }

  // Poor fit (tempo drift, sparse evidence): keep raw points, thinned so
  // the anchor list stays reviewable.
  const anchors: SyncAnchor[] = [];
  for (const p of mono) {
    const prev = anchors[anchors.length - 1];
    if (!prev || p.beat - prev.beat >= THIN_BEATS) {
      anchors.push({ beat: p.beat, ms: Math.round(p.ms) });
    }
  }
  return { anchors, fittedBpm, candidateCount: k };
}

/** A proposed lyric for one empty bar of a section definition. */
export interface PhraseFill {
  sectionId: string;
  li: number;
  bar: number;
  text: string;
}

export interface PhraseFillSuggestion {
  fills: PhraseFill[];
  /** Lines that mapped outside the song or onto occupied/taken bars. */
  unplaced: number;
}

/**
 * For songs with missing lyrics: place each LRC line's text on the bar
 * sounding at its timestamp (via the existing beats↔ms mapping — anchors
 * when calibrated, else the stored BPM from 0:00). Only empty bars are
 * proposed, existing lyrics are never overwritten, and a definition bar
 * takes at most one line (repeat passes replay the same definition).
 */
export function suggestPhraseFill(
  data: SongData,
  timeline: Timeline,
  sync: SpotifySyncData,
  fallbackBpm: number,
  lrcLines: LrcLine[]
): PhraseFillSuggestion {
  const fills: PhraseFill[] = [];
  const taken = new Set<string>();
  let unplaced = 0;

  for (const line of lrcLines) {
    // Nearest downbeat, not containing bar: onsets routinely lead their
    // bar by a pickup, and "containing" would file those a bar early.
    const idx = nearestBarIndex(timeline, msToBeat(sync, line.ms, fallbackBpm));
    const tb = idx !== null ? timeline.bars[idx] : undefined;
    const ref = tb ? data.arrangement[tb.arrIdx]?.ref : undefined;
    const def = ref ? data.sections[ref] : undefined;
    if (!tb || !ref || !def) {
      unplaced++;
      continue;
    }
    const key = `${ref}:${tb.li}:${tb.bi}`;
    const hasLyric = def.lines[tb.li]?.lyrics.some(
      (s) => s.bar === tb.bi && s.text.trim() !== ""
    );
    if (taken.has(key) || hasLyric) {
      unplaced++;
      continue;
    }
    taken.add(key);
    fills.push({ sectionId: ref, li: tb.li, bar: tb.bi, text: line.text });
  }
  return { fills, unplaced };
}

/** A line whose sung timing disagrees with where its words sit. */
export interface PlacementMismatch {
  lineIdx: number;
  text: string;
  ms: number;
  /** Timeline bar the words currently occupy (1-based for display). */
  currentBarNumber: number;
  /** Timeline bar whose downbeat is nearest the sung onset (1-based). */
  suggestedBarNumber: number;
}

/**
 * For calibrated songs that already have lyrics: flag lines whose LRC
 * timestamp lands in a different bar than their aligned words. Report-only
 * — the fix is a normal Lyrics-mode edit — but it tells the user exactly
 * where the map and the recording disagree.
 */
export function placementMismatches(
  matches: LineMatch[],
  timeline: Timeline,
  sync: SpotifySyncData,
  fallbackBpm: number
): PlacementMismatch[] {
  return lineShiftTargets(matches, timeline, sync, fallbackBpm).map((t) => ({
    lineIdx: t.lineIdx,
    text: t.text,
    ms: t.ms,
    currentBarNumber: t.currentIdx + 1,
    suggestedBarNumber: t.suggestedIdx + 1,
  }));
}
