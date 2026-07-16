import type { SongData } from "./types";

/** What is currently picked up in Reshape, across every section and mode. */
export type ReshapeSelection =
  | { kind: "chord"; sectionId: string; li: number; bi: number; ci: number }
  | { kind: "phrase"; sectionId: string; li: number; bar: number }
  | { kind: "bar"; sectionId: string; li: number; bi: number }
  /** The │ break between bars `boundary - 1` and `boundary` of a line. */
  | { kind: "break"; sectionId: string; li: number; boundary: number }
  /** Word `word` of bar `bar`'s phrase, for pinning it to a beat. */
  | { kind: "word"; sectionId: string; li: number; bar: number; word: number };

/** Mirror of ModeToggle's ReshapeMode, kept here so lib code stays pure. */
export type ReshapeModeId = "rows" | "lyrics" | "chords";

/** A bar's address: the coordinate every reshape selection shares. */
export interface BarAnchor {
  sectionId: string;
  li: number;
  bi: number;
}

/** The mode a selection kind is picked up in. */
const HOME_MODE: Record<ReshapeSelection["kind"], ReshapeModeId> = {
  bar: "rows",
  phrase: "lyrics",
  break: "lyrics",
  word: "lyrics",
  chord: "chords",
};

/**
 * The bar a selection lives in, validated against `data`. A break resolves
 * to the bar on its right. Returns null when the section or line is gone;
 * a bar index past the end clamps to the line's last bar.
 */
export function selectionAnchor(
  sel: ReshapeSelection | null,
  data: SongData
): BarAnchor | null {
  if (!sel) return null;
  const line = data.sections[sel.sectionId]?.lines[sel.li];
  if (!line || line.bars.length === 0) return null;
  const raw =
    sel.kind === "phrase" || sel.kind === "word"
      ? sel.bar
      : sel.kind === "break"
        ? sel.boundary
        : sel.bi;
  const bi = Math.min(Math.max(raw, 0), line.bars.length - 1);
  return { sectionId: sel.sectionId, li: sel.li, bi };
}

/**
 * The equivalent selection in the target mode, so switching modes keeps
 * working on the same bar. Null means nothing selectable there (a lyric-less
 * bar in Lyrics mode, or a stale selection) — callers can still scroll to
 * the anchor. Every bar has ≥1 ChordCell (empty bars hold one "" chord and
 * are tappable in Chords mode), so mapping into Chords never needs a
 * fallback; Lyrics mode only lets bars with words be phrase-selected, so
 * mapping there mirrors that rule.
 */
export function mapSelection(
  sel: ReshapeSelection | null,
  target: ReshapeModeId,
  data: SongData
): ReshapeSelection | null {
  if (!sel) return null;
  const anchor = selectionAnchor(sel, data);
  if (!anchor) return null;
  if (HOME_MODE[sel.kind] === target) return sel;
  const { sectionId, li, bi } = anchor;
  if (target === "rows") return { kind: "bar", sectionId, li, bi };
  if (target === "chords") return { kind: "chord", sectionId, li, bi, ci: 0 };
  const line = data.sections[sectionId].lines[li];
  const hasLyric = line.lyrics.some(
    (s) => s.bar === bi && s.text.trim() !== ""
  );
  return hasLyric ? { kind: "phrase", sectionId, li, bar: bi } : null;
}

/** DOM id for a bar's wrapper in the reshape sections (unique per page —
 * reshape renders each section once, unlike the song map's instances). */
export function reshapeBarDomId(a: BarAnchor): string {
  return `reshape-bar-${a.sectionId}-${a.li}-${a.bi}`;
}

/** Serialize an anchor for the song map's ?focus= param. */
export function encodeFocus(a: BarAnchor): string {
  return `${a.sectionId}:${a.li}:${a.bi}`;
}

/**
 * Parse a ?focus= value back into an anchor; null on anything malformed.
 * The two indexes are split off the end so section ids containing ":" keep
 * round-tripping.
 */
export function parseFocus(raw: string | undefined): BarAnchor | null {
  if (!raw) return null;
  const parts = raw.split(":");
  if (parts.length < 3) return null;
  const num = (s: string | undefined): number | null =>
    s !== undefined && /^\d+$/.test(s) ? Number(s) : null;
  const bi = num(parts.pop());
  const li = num(parts.pop());
  const sectionId = parts.join(":");
  if (bi === null || li === null || sectionId === "") return null;
  return { sectionId, li, bi };
}
