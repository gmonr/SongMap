/**
 * Section fingerprinting: detect duplicated sections so the user can merge
 * them (importers regularly emit "Coro" and "Coro 2" with identical
 * content) or link their chords. Songs repeat — a fixed chorus shouldn't
 * need the same fix twice.
 *
 * Fingerprints flatten a section's bars into one sequence: how bars are
 * partitioned into rows is presentation, not music, so two sections that
 * differ only in row layout still match. Pure module, same-reference no-op
 * contract on the mutating ops.
 */
import type { Bar, SectionDef, SongData } from "./types";

/** A bar's chords as a stable string, e.g. "C:2|G:2". */
export function barFingerprint(bar: Bar): string {
  return bar.chords.map((c) => `${c.sym.trim()}:${c.beats}`).join("|");
}

const flatBars = (def: SectionDef): Bar[] => def.lines.flatMap((l) => l.bars);

/** The section's chord sequence, row layout ignored. */
export function sectionChordFingerprint(def: SectionDef): string {
  return flatBars(def).map(barFingerprint).join(";");
}

/** Chords plus per-bar lyric text — matches only true duplicates. */
export function sectionContentFingerprint(def: SectionDef): string {
  const lyric = def.lines
    .flatMap((l) => {
      const byBar = new Map(l.lyrics.map((s) => [s.bar, s.text.trim()]));
      return l.bars.map((_, i) => byBar.get(i) ?? "");
    })
    .join("¶");
  return `${sectionChordFingerprint(def)}#${lyric}`;
}

/** True when the section carries no real chord at all (only "—" bars) —
 *  freshly imported placeholders shouldn't be called "identical". */
function isPlaceholder(def: SectionDef): boolean {
  return flatBars(def).every((b) => b.chords.every((c) => c.sym.trim() === ""));
}

export interface SectionMatches {
  /** Groups of section ids with identical chords AND lyrics — merge candidates. */
  exact: string[][];
  /** Groups with identical chords but different lyrics — link candidates. */
  chordOnly: string[][];
}

/** Section ids in arrangement order (then any unarranged), the same order
 *  the editors display. */
export function orderedSectionIds(data: SongData): string[] {
  const ids: string[] = [];
  for (const item of data.arrangement) {
    if (data.sections[item.ref] && !ids.includes(item.ref)) ids.push(item.ref);
  }
  for (const id of Object.keys(data.sections)) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Group duplicated sections. `exact` groups share chords and lyrics;
 * `chordOnly` groups share just the chord sequence (verses usually differ
 * in lyrics) and skip members whose every arrangement instance is already
 * linked via `sameChordsAs`.
 */
export function detectSectionMatches(data: SongData): SectionMatches {
  const ids = orderedSectionIds(data).filter(
    (id) =>
      flatBars(data.sections[id]).length > 0 &&
      !isPlaceholder(data.sections[id])
  );

  const groupBy = (fp: (def: SectionDef) => string): string[][] => {
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const key = fp(data.sections[id]);
      groups.set(key, [...(groups.get(key) ?? []), id]);
    }
    return [...groups.values()].filter((g) => g.length > 1);
  };

  const exact = groupBy(sectionContentFingerprint);
  const exactKeys = new Set(exact.map((g) => g.join("\u0000")));

  const alreadyLinked = (id: string, sourceId: string): boolean => {
    const items = data.arrangement.filter((a) => a.ref === id);
    return (
      items.length > 0 && items.every((a) => a.sameChordsAs === sourceId)
    );
  };

  const chordOnly = groupBy(sectionChordFingerprint)
    .map((g) => [g[0], ...g.slice(1).filter((id) => !alreadyLinked(id, g[0]))])
    .filter((g) => g.length > 1 && !exactKeys.has(g.join("\u0000")));

  return { exact, chordOnly };
}

/**
 * Merge duplicate sections into `keepId`: every arrangement reference to a
 * dropped id (including `sameChordsAs` links) repoints to `keepId`, and the
 * dropped sections are deleted. Instance labels stay as they were ("Coro 2"
 * keeps its name — it now just shares the definition). Same-reference no-op
 * when there is nothing to do.
 */
export function mergeSections(
  data: SongData,
  keepId: string,
  dropIds: string[]
): SongData {
  const drop = new Set(dropIds.filter((id) => id !== keepId && data.sections[id]));
  if (drop.size === 0 || !data.sections[keepId]) return data;

  const arrangement = data.arrangement.map((a) => {
    const ref = drop.has(a.ref) ? keepId : a.ref;
    let sameChordsAs =
      a.sameChordsAs && drop.has(a.sameChordsAs) ? keepId : a.sameChordsAs;
    // A section trivially has its own chords — drop self-links.
    if (sameChordsAs === ref) sameChordsAs = undefined;
    return ref === a.ref && sameChordsAs === a.sameChordsAs
      ? a
      : { ...a, ref, sameChordsAs };
  });

  const sections: SongData["sections"] = {};
  for (const [id, def] of Object.entries(data.sections)) {
    if (!drop.has(id)) sections[id] = def;
  }
  return { sections, arrangement };
}

/**
 * Mark every arrangement instance of `targetIds` as sharing chords with
 * `sourceId` (rendered collapsed, "chords same as …"). Same-reference no-op
 * when nothing changes.
 */
export function linkChords(
  data: SongData,
  targetIds: string[],
  sourceId: string
): SongData {
  const targets = new Set(targetIds.filter((id) => id !== sourceId));
  let changed = false;
  const arrangement = data.arrangement.map((a) => {
    if (!targets.has(a.ref) || a.sameChordsAs === sourceId) return a;
    changed = true;
    return { ...a, sameChordsAs: sourceId };
  });
  return changed ? { ...data, arrangement } : data;
}

/* ------------------------------------------------------------------ */
/* Linked-chord sync: sameChordsAs sections genuinely share one chord  */
/* progression. Editing any member updates all of them; lyrics, word   */
/* marks, and row layout stay each section's own.                   */

/** The section's link source, when the link is section-wide: every
 *  arrangement instance of `id` carries the same `sameChordsAs` (pointing
 *  at a real, different section). Per-instance or conflicting links are
 *  display-only and don't share data. */
export function linkSourceOf(data: SongData, id: string): string | undefined {
  const items = data.arrangement.filter((a) => a.ref === id);
  const source = items[0]?.sameChordsAs;
  if (
    !source ||
    source === id ||
    !data.sections[source] ||
    !items.every((a) => a.sameChordsAs === source)
  ) {
    return undefined;
  }
  return source;
}

/** Follow `sameChordsAs` links to the unlinked section they bottom out at
 *  (undefined for an unlinked section or a cyclic hand-edited blob). */
function rootLinkSource(data: SongData, id: string): string | undefined {
  const seen = new Set([id]);
  let current = id;
  for (;;) {
    const next = linkSourceOf(data, current);
    if (!next) return current === id ? undefined : current;
    if (seen.has(next)) return undefined;
    seen.add(next);
    current = next;
  }
}

/** Rewrite section `id`'s bars to the flattened chord sequence `bars`
 *  (fresh cell copies), keeping its row layout and lyrics. Callers ensure
 *  the counts match. Same-reference no-op when already identical. */
function stampSectionBars(
  data: SongData,
  id: string,
  bars: Bar[]
): SongData {
  let flat = 0;
  let changed = false;
  const lines = data.sections[id].lines.map((line) => {
    let lineChanged = false;
    const next = line.bars.map((b) => {
      const src = bars[flat++];
      if (barFingerprint(b) === barFingerprint(src)) return b;
      lineChanged = true;
      return { chords: src.chords.map((c) => ({ ...c })) };
    });
    if (!lineChanged) return line;
    changed = true;
    return { ...line, bars: next };
  });
  if (!changed) return data;
  return {
    ...data,
    sections: { ...data.sections, [id]: { ...data.sections[id], lines } },
  };
}

/**
 * Re-establish the linked-chords invariant: every section whose instances
 * are all `sameChordsAs`-linked carries the same chords as its (root)
 * source. Pass `editedId` when one section was just edited so a linked
 * member pushes its chords *to* the source first — sharing works in both
 * directions, like a merged section. A linked section whose bar count no
 * longer matches its source (bars added/deleted on either side) can't
 * honestly claim "chords same as" anymore, so its links are removed
 * instead. Same-reference no-op when everything is already in sync.
 */
export function syncLinkedChords(data: SongData, editedId?: string): SongData {
  let out = data;
  const flatOf = (id: string): Bar[] =>
    out.sections[id].lines.flatMap((l) => l.bars);

  if (editedId && data.sections[editedId]) {
    const root = rootLinkSource(data, editedId);
    if (root) {
      const src = flatOf(editedId);
      if (flatOf(root).length === src.length) {
        out = stampSectionBars(out, root, src);
      }
      // Count mismatch: the forward pass below unlinks editedId instead.
    }
  }

  const unlink = new Set<string>();
  for (const id of Object.keys(data.sections)) {
    const root = rootLinkSource(data, id);
    if (!root) continue;
    const src = flatOf(root);
    if (flatOf(id).length !== src.length) {
      unlink.add(id);
      continue;
    }
    out = stampSectionBars(out, id, src);
  }

  if (unlink.size > 0) {
    out = {
      ...out,
      arrangement: out.arrangement.map((a) => {
        if (!unlink.has(a.ref) || !a.sameChordsAs) return a;
        const { sameChordsAs: _drop, ...rest } = a;
        return rest;
      }),
    };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Bar-level propagation: fix a bar once, offer the fix everywhere it  */
/* repeats. Songs re-use the same few bars, so an import mistake in    */
/* one ("G" that should be "G/B", a 2+2 split that should be 3+1)      */
/* usually exists in several places.                                   */

/** Address of one bar within the song. */
export interface BarLocation {
  sectionId: string;
  li: number;
  bi: number;
}

export function sameBarLocation(a: BarLocation, b: BarLocation): boolean {
  return a.sectionId === b.sectionId && a.li === b.li && a.bi === b.bi;
}

/** True when the bar carries at least one real chord — placeholder "—"
 *  bars mean "same as before", so they match each other without being
 *  musically the same and must never seed a propagation. */
export function barHasChord(bar: Bar): boolean {
  return bar.chords.some((c) => c.sym.trim() !== "");
}

/**
 * Every bar in the song whose chords fingerprint as `fp`, in display
 * order, except the bar at `except` (the one that was just edited).
 */
export function findMatchingBars(
  data: SongData,
  fp: string,
  except?: BarLocation
): BarLocation[] {
  const out: BarLocation[] = [];
  for (const sectionId of orderedSectionIds(data)) {
    data.sections[sectionId].lines.forEach((line, li) => {
      line.bars.forEach((b, bi) => {
        if (barFingerprint(b) !== fp) return;
        const loc = { sectionId, li, bi };
        if (except && sameBarLocation(loc, except)) return;
        out.push(loc);
      });
    });
  }
  return out;
}

/**
 * Stamp the chords of the bar at `source` onto every bar in `targets`
 * (fresh ChordCell copies — bars never share cell objects). Each target's
 * lyrics, word highlights, and row layout are untouched; targets that already
 * match the source (or don't exist) are skipped. Same-reference no-op when
 * there is nothing to change.
 */
export function propagateBarChords(
  data: SongData,
  source: BarLocation,
  targets: BarLocation[]
): SongData {
  const src =
    data.sections[source.sectionId]?.lines[source.li]?.bars[source.bi];
  if (!src) return data;
  const srcFp = barFingerprint(src);

  const bySection = new Map<string, BarLocation[]>();
  for (const t of targets) {
    if (sameBarLocation(t, source)) continue;
    const b = data.sections[t.sectionId]?.lines[t.li]?.bars[t.bi];
    if (!b || barFingerprint(b) === srcFp) continue;
    bySection.set(t.sectionId, [...(bySection.get(t.sectionId) ?? []), t]);
  }
  if (bySection.size === 0) return data;

  const sections = { ...data.sections };
  for (const [id, locs] of bySection) {
    const lineIndexes = new Set(locs.map((t) => t.li));
    sections[id] = {
      ...sections[id],
      lines: sections[id].lines.map((line, li) => {
        if (!lineIndexes.has(li)) return line;
        const barIndexes = new Set(
          locs.filter((t) => t.li === li).map((t) => t.bi)
        );
        return {
          ...line,
          bars: line.bars.map((b, bi) =>
            barIndexes.has(bi)
              ? { chords: src.chords.map((c) => ({ ...c })) }
              : b
          ),
        };
      }),
    };
  }
  return { ...data, sections };
}
