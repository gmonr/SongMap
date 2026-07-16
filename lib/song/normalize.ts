/**
 * Load-time normalization of the jsonb song blob. Old songs predate newer
 * optional fields (word anchors, …), and hand-edited or stale blobs can
 * carry values that violate the invariants the render/ops code relies on —
 * this is the single place those get cleaned up as a song row enters the
 * client. Returns the *same reference* when nothing needed fixing, so
 * untouched songs stay reference-equal (the editors use that for dirty
 * tracking).
 */
import { anchorChar, barTotalBeats, validAnchors } from "./anchors";
import { syncLinkedChords } from "./fingerprint";
import { lyricWords } from "./lyrics";
import type { Line, LyricSpan, SongData, WordAnchor } from "./types";

/** Anchors sorted and stripped of out-of-range/misordered entries (earlier
 *  wins on conflict); null when the result is "no anchors". */
function normalizeAnchors(
  anchors: WordAnchor[],
  words: string[],
  totalBeats: number
): WordAnchor[] | null {
  const sorted = [...anchors].sort(
    (a, b) => a.word - b.word || anchorChar(a) - anchorChar(b)
  );
  const kept: WordAnchor[] = [];
  for (const a of sorted) {
    if (validAnchors([...kept, a], words, totalBeats)) kept.push(a);
  }
  return kept.length > 0 ? kept : null;
}

function normalizeSpan(span: LyricSpan, line: Line): LyricSpan {
  if (!span.anchors?.length && !span.lead) return span;
  const bar = line.bars[span.bar];
  if (!bar) return span; // out-of-range spans are dropped by fromDense paths
  const words = lyricWords(span.text);

  const leadValid =
    span.lead !== undefined &&
    Number.isInteger(span.lead) &&
    span.lead >= 1 &&
    span.lead < words.length;
  const lead = leadValid ? span.lead : undefined;

  const next = span.anchors?.length
    ? normalizeAnchors(
        span.anchors.filter((a) => a.word >= (lead ?? 0)),
        words,
        barTotalBeats(bar)
      )
    : null;

  const unchanged =
    lead === span.lead &&
    (span.anchors === undefined
      ? next === null
      : next !== null &&
        next.length === span.anchors.length &&
        next.every((a, i) => a === span.anchors![i]));
  if (unchanged) return span;

  const out: LyricSpan = { text: span.text, bar: span.bar };
  if (next) out.anchors = next;
  if (lead) out.lead = lead;
  return out;
}

function normalizeLine(line: Line): Line {
  let changed = false;
  const lyrics = line.lyrics.map((s) => {
    const next = normalizeSpan(s, line);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...line, lyrics } : line;
}

/** Clean a song's data blob on load; same reference when already clean. */
export function normalizeSongData(input: SongData): SongData {
  // Linked (`sameChordsAs`) sections share one chord progression — re-sync
  // first (songs saved before linking shared data may have drifted), so the
  // anchor cleanup below validates against the bars that will render.
  const data = syncLinkedChords(input);
  let changed = data !== input;
  const sections: SongData["sections"] = {};
  for (const [id, def] of Object.entries(data.sections)) {
    let linesChanged = false;
    const lines = def.lines.map((l) => {
      const next = normalizeLine(l);
      if (next !== l) linesChanged = true;
      return next;
    });
    sections[id] = linesChanged ? { ...def, lines } : def;
    if (linesChanged) changed = true;
  }
  return changed ? { ...data, sections } : data;
}
